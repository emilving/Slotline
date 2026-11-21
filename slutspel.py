"""Slotlines slutspelschans: spelar igenom resten av grundserien många gånger.

Så räknas det:
1. Läget i dag: poäng och vinster på ordinarie tid ur alla spelade matcher.
2. Varje kvarvarande match får förväntade mål från vinstchansmodellen (vinstchans.py):
   lagens anfall och försvar, hemmaplan, back-to-back och lagets målvakter
   (vägt efter hur ofta var och en har startat de senaste 20 matcherna).
3. Lagens styrka är inte känd exakt. Därför får varje lag i varje simulering en
   slumpad avvikelse i anfall och försvar (STYRKA_OSAKERHET), så att ett lag kan
   vara bättre eller sämre än siffrorna hittills visar.
4. Varje match lottas med Poissonfördelningen. Blir det lika går matchen till
   förlängning/straffar: vinnaren får 2 poäng och förloraren 1. Poisson ger för
   få oavgjorda matcher (i verkligheten kvitterar lag som ligger under oftare,
   bland annat med tom bur), så en del matcher med ett måls skillnad räknas om
   till oavgjorda tills andelen förlängningar stämmer med säsongen och NHL.
5. Slutspel: de tre bästa i varje division plus två wildcards per konferens.
   Lika poäng skiljs på vinster på ordinarie tid, sedan slumpen.
"""
from __future__ import annotations

import datetime as dt

import numpy as np
import pandas as pd

import vinstchans as VC

SIMULERINGAR = 10000
STYRKA_OSAKERHET = 0.07   # standardavvikelse (log-skala) för lagets anfall och försvar i en simulering
MATCHER_PER_LAG = 82
FORLANGNING_NHL = 0.23    # andel matcher som går till förlängning i NHL över flera säsonger

# NHL:s indelning. Används om tabellen från NHL inte går att hämta.
DIVISIONER = {
    "Atlantic": ("Östra", ["BOS", "BUF", "DET", "FLA", "MTL", "OTT", "TBL", "TOR"]),
    "Metropolitan": ("Östra", ["CAR", "CBJ", "NJD", "NYI", "NYR", "PHI", "PIT", "WSH"]),
    "Central": ("Västra", ["CHI", "COL", "DAL", "MIN", "NSH", "STL", "UTA", "WPG"]),
    "Pacific": ("Västra", ["ANA", "CGY", "EDM", "LAK", "SEA", "SJS", "VAN", "VGK"]),
}
KONF_SV = {"Eastern": "Östra", "Western": "Västra"}


def indelning(f, web):
    """{förkortning: (division, konferens)} – från NHL:s tabell om möjligt, annars den inbyggda."""
    ut = {a: (d, k) for d, (k, lag) in DIVISIONER.items() for a in lag}
    try:
        data = f.get(f"{web}/standings/now", f.root / "tabell" / "nu.json", 6 * 3600) or {}
        for r in data.get("standings") or []:
            ab = r.get("teamAbbrev")
            ab = ab.get("default") if isinstance(ab, dict) else ab
            div, konf = r.get("divisionName"), r.get("conferenceName")
            if ab and div and konf:
                ut[ab] = (div, KONF_SV.get(konf, konf))
    except Exception:  # noqa: BLE001 – den inbyggda indelningen räcker
        pass
    return ut


def kvarvarande(f, season, list_games, spelade_id, idag: dt.date):
    """Alla grundseriematcher som inte är färdigspelade."""
    slut = dt.date(int(str(season)[:4]) + 1, 4, 30)
    alla = list_games(f, season, idag - dt.timedelta(days=1), slut, (2,))
    return [g for g in alla if g["id"] not in spelade_id and g["state"] not in ("OFF", "FINAL")
            and g["home"]["id"] and g["away"]["id"]]


def _mv_kvot_per_lag(MV, rows):
    """Lagets målvaktskvot: målvakternas kvoter vägda efter starter i lagets senaste 20 matcher."""
    ut = {}
    if not MV.ok:
        return ut
    senaste_lag = MV.g.groupby("Spelar-id")["Lag"].last()
    for namn, g in MV.g.groupby("Lag"):
        matcher = g.sort_values("Datum")["Match-id"].drop_duplicates().tolist()[-20:]
        st = g[g["Match-id"].isin(matcher) & (g["Startade"] == "ja")]
        st = st[st["Spelar-id"].map(senaste_lag) == namn]
        if not len(st):
            continue
        vikt = st.groupby("Spelar-id").size()
        kv = sum(n * MV.kvot(pid, "9999-12-31") for pid, n in vikt.items()) / vikt.sum()
        ut[namn] = kv
    return ut


def simulera(T, GK, forra_lag, forra_mv, rest, divs, n=SIMULERINGAR, seed=None) -> pd.DataFrame:
    rows = VC.lagmatcher(T)
    if rows.empty:
        return pd.DataFrame()
    df = T.copy()
    df["Datum"] = df["Datum"].astype(str)
    MV = VC.Malvakter(GK, forra_mv)
    snitt, lag = VC.styrka(rows, "9999-12-31", VC.forra_niva(forra_lag), MV.ok)
    mvk = _mv_kvot_per_lag(MV, rows)

    # läget i dag
    id_till_ab = dict(zip(rows["Lag-id"], rows["Lagförkortning"]))
    id_till_namn = dict(zip(rows["Lag-id"], rows["Lag"]))
    for g in rest:
        for s in ("home", "away"):
            id_till_ab.setdefault(g[s]["id"], g[s]["abbr"])
            id_till_namn.setdefault(g[s]["id"], g[s]["name"])
    lag_id = sorted(id_till_ab)
    pos = {t: i for i, t in enumerate(lag_id)}
    N = len(lag_id)
    nu = np.zeros(N); rw = np.zeros(N); gp = np.zeros(N)
    for _, r in df.iterrows():
        i = pos.get(r["Lag-id"])
        if i is None:
            continue
        gp[i] += 1
        if r["Resultat"] == "V":
            nu[i] += 2
            if r.get("Avgjord i") == "Ordinarie":
                rw[i] += 1
        elif r["Resultat"] == "FÖ":
            nu[i] += 1

    # kvarvarande matcher: förväntade mål ur vinstchansmodellen
    speldagar = {}
    for _, r in df.iterrows():
        speldagar.setdefault(r["Lag-id"], set()).add(r["Datum"])
    for g in rest:
        for s in ("home", "away"):
            speldagar.setdefault(g[s]["id"], set()).add(g["date"])
    G = len(rest)
    lh = np.zeros(G); lb = np.zeros(G); hi = np.zeros(G, int); bi = np.zeros(G, int)
    for j, g in enumerate(rest):
        h, b = g["home"]["id"], g["away"]["id"]
        igar = VC._dagen_fore(g["date"])
        m = VC.matchup(snitt, lag, h, b, igar in speldagar.get(h, ()), igar in speldagar.get(b, ()),
                       mvk.get(id_till_namn.get(h), 1.0), mvk.get(id_till_namn.get(b), 1.0))
        lh[j], lb[j], hi[j], bi[j] = m["mal_hemma"], m["mal_borta"], pos[h], pos[b]
    # hur ofta ska matcherna gå till förlängning? säsongen hittills, dragen mot NHL-snittet
    ms = df.drop_duplicates("Match-id")
    ot_mal = ((ms["Avgjord i"] != "Ordinarie").sum() + 300 * FORLANGNING_NHL) / (len(ms) + 300) if "Avgjord i" in ms else FORLANGNING_NHL
    if G:
        k = np.arange(16)
        from math import factorial
        fak = np.array([factorial(int(i)) for i in k], float)
        pmf = lambda lam: np.exp(-lam)[:, None] * lam[:, None] ** k / fak
        a, b_ = pmf(lh), pmf(lb)
        p_lika = (a * b_).sum(1).mean()
        p_ett = ((a[:, 1:] * b_[:, :-1]).sum(1) + (a[:, :-1] * b_[:, 1:]).sum(1)).mean()
        omvandla = float(np.clip((ot_mal - p_lika) / p_ett, 0, 0.5)) if p_ett > 0 else 0.0
    else:
        omvandla = 0.0

    Hm = np.zeros((G, N)); Hm[np.arange(G), hi] = 1
    Bm = np.zeros((G, N)); Bm[np.arange(G), bi] = 1

    # vilka lag hör ihop
    ab = [id_till_ab[t] for t in lag_id]
    div = np.array([divs.get(a, ("?", "?"))[0] for a in ab])
    konf = np.array([divs.get(a, ("?", "?"))[1] for a in ab])

    rng = np.random.default_rng(seed)
    slutspel = np.zeros(N); div1 = np.zeros(N); konf1 = np.zeros(N); bast = np.zeros(N)
    alla_poang = []
    kvar = n
    while kvar > 0:
        c = min(2000, kvar); kvar -= c
        eA = rng.normal(0, STYRKA_OSAKERHET, (c, N)); eD = rng.normal(0, STYRKA_OSAKERHET, (c, N))
        if G:
            mh = lh * np.exp(eA[:, hi] + eD[:, bi]); mb = lb * np.exp(eA[:, bi] + eD[:, hi])
            gh = rng.poisson(mh); gb = rng.poisson(mb)
            ett = np.abs(gh - gb) == 1
            kvitt = ett & (rng.random(mh.shape) < omvandla)
            gh = np.where(kvitt, np.maximum(gh, gb), gh); gb = np.where(kvitt, np.maximum(gh, gb), gb)
            lika = gh == gb
            p_ot = VC.ANDEL_FORLANGNING * mh / (mh + mb) + (1 - VC.ANDEL_FORLANGNING) * 0.5
            ot_h = rng.random(mh.shape) < p_ot
            hv = (gh > gb) | (lika & ot_h)
            ph = 2.0 * hv + (lika & ~ot_h); pb = 2.0 * ~hv + (lika & ot_h)
            poang = nu + ph @ Hm + pb @ Bm
            ordv = rw + (gh > gb).astype(float) @ Hm + (gb > gh).astype(float) @ Bm
        else:
            poang = np.tile(nu, (c, 1)); ordv = np.tile(rw, (c, 1))
        nyckel = poang * 1000 + ordv + rng.random((c, N)) * 0.5
        med = np.zeros((c, N), bool)
        for d in np.unique(div):
            kol = np.where(div == d)[0]
            o = kol[np.argsort(-nyckel[:, kol], axis=1)]
            div1[:] += np.bincount(o[:, 0], minlength=N)
            for k in range(min(3, len(kol))):
                med[np.arange(c), o[:, k]] = True
        for kk in np.unique(konf):
            kol = np.where(konf == kk)[0]
            rest_nyckel = np.where(med[:, kol], -np.inf, nyckel[:, kol])
            o = kol[np.argsort(-rest_nyckel, axis=1)]
            for k in range(2):
                med[np.arange(c), o[:, k]] = True
            konf1[:] += np.bincount(kol[np.argmax(nyckel[:, kol], axis=1)], minlength=N)
        bast[:] += np.bincount(np.argmax(nyckel, axis=1), minlength=N)
        slutspel += med.sum(0)
        alla_poang.append(poang)
    P = np.vstack(alla_poang)
    kvar_m = Hm.sum(0) + Bm.sum(0)
    ut = pd.DataFrame({
        "Lag": [id_till_namn[t] for t in lag_id], "Lagförkortning": ab, "Lag-id": lag_id,
        "Division": div, "Konferens": konf,
        "Matcher": gp.astype(int), "Poäng": nu.astype(int), "Vinster ordinarie tid": rw.astype(int),
        "Matcher kvar": kvar_m.astype(int),
        "Förväntade poäng": P.mean(0).round(1),
        "Poäng låg (10 %)": np.percentile(P, 10, axis=0).round(0).astype(int),
        "Poäng hög (90 %)": np.percentile(P, 90, axis=0).round(0).astype(int),
        "Slutspel": (slutspel / n).round(4), "Vinner divisionen": (div1 / n).round(4),
        "Etta i konferensen": (konf1 / n).round(4), "Bästa laget i grundserien": (bast / n).round(4),
    })
    ut["Simuleringar"] = n
    return ut.sort_values(["Konferens", "Förväntade poäng"], ascending=[True, False]).reset_index(drop=True)
