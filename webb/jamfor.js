/* Slotline – jämför två spelare. Läser data/spelare/<id>.json för båda. */
(function () {
  'use strict';
  var MAN_K = ['jan', 'feb', 'mar', 'apr', 'maj', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];
  var FARG = window.LAGFARG || {};
  var MORK = window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches;
  var q = new URLSearchParams(location.search);
  var val = { a: q.get('a'), b: q.get('b') };
  var D = null, poster = [], cache = {};
  // lägre är bättre / ingen bättre
  var LAGRE = ['Skottförsök mot', 'Mål mot', 'Förlorade tekningar', 'Tagna', 'Utvisningsminuter', 'Puckförluster', 'Skott blockerade',
    'Insläppta', 'Insläppta/60 min', 'Insläppta på de skotten'];
  var NEUTRAL = ['Matcher', 'Starter', 'Istid totalt (min)', 'Totalt', '5 mot 5', 'Powerplay', 'Boxplay', 'Skott utanför', 'Blev tacklad', 'Skott mot', 'Räddningar'];

  function $(s) { return document.querySelector(s); }
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function norm(t) { return String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); }
  function tal(v) { if (v == null || isNaN(v)) return '–'; return (Number.isInteger(v) ? String(v) : v.toFixed(2)).replace('-', '−'); }
  function tid(min) { if (min == null) return '–'; var t = Math.round(min * 60); return Math.floor(t / 60) + ':' + ('0' + (t % 60)).slice(-2); }
  function procent(v) { return v == null ? '–' : (v * 100).toFixed(1).replace('.', ',') + ' %'; }
  function datum(s) { var d = new Date(s + 'T12:00:00'); return d.getDate() + ' ' + MAN_K[d.getMonth()]; }
  function prick(abbr, size) { var s = el('span', 'lagprick'); s.style.width = size + 'px'; s.style.height = size + 'px'; s.style.setProperty('--c', (FARG[abbr] || ['#9AA8B6'])[0]); if (abbr) s.dataset.lag = abbr; s.appendChild(el('i')); return s; }
  function logo(src, size, abbr) {
    if (!src) return prick(abbr, size);
    var img = el('img', 'logo'); img.alt = ''; img.width = size; img.height = size; if (abbr) img.dataset.lag = abbr;
    img.onerror = function () { if (/_dark\.svg$/.test(img.src)) { img.src = img.src.replace('_dark.svg', '_light.svg'); return; } if (img.parentNode) img.parentNode.replaceChild(prick(abbr, size), img); };
    img.src = MORK ? src.replace('_light.svg', '_dark.svg') : src; return img;
  }
  function visa(r) {
    var v = r[1], typ = r[2];
    if (typ === 'p') return procent(v);
    if (typ === 't' || typ === 'm') return tid(v);
    if (/över förväntan|Netto|Plus\/minus/.test(r[0]) && v > 0) return '+' + tal(v);
    return tal(v);
  }
  function hamta(id) {
    if (!cache[id]) cache[id] = fetch('data/spelare/' + encodeURIComponent(id) + '.json', { cache: 'no-store' }).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); });
    return cache[id];
  }

  // ---------- väljare ----------
  function valjare(sida) {
    var input = $('#jmf-' + sida), lista = input.parentNode.querySelector('.sok-lista');
    var traffar = [], markerad = 0;
    function rita() {
      lista.textContent = '';
      if (!input.value.trim() || !traffar.length) { lista.hidden = !input.value.trim(); if (!lista.hidden) lista.appendChild(el('div', 'sok-tom', 'Ingen träff')); return; }
      traffar.forEach(function (p, i) {
        var a = el('a', 'sok-rad' + (i === markerad ? ' vald' : '')); a.href = '#';
        var lg = logo(D.lagInfo[p.k] && D.lagInfo[p.k].logo, 26, p.k); delete lg.dataset.lag; a.appendChild(lg);
        var t = el('span', 'sok-t'); t.appendChild(el('b', null, p.n)); t.appendChild(el('small', null, p.meta)); a.appendChild(t);
        a.addEventListener('mousedown', function (e) { e.preventDefault(); valj(p); });
        lista.appendChild(a);
      });
      lista.hidden = false;
    }
    function valj(p) {
      val[sida] = String(p.id); input.value = p.n; lista.hidden = true;
      var u = new URLSearchParams(); if (val.a) u.set('a', val.a); if (val.b) u.set('b', val.b);
      history.replaceState(null, '', '?' + u.toString());
      rendera();
      if (sida === 'a' && !val.b) $('#jmf-b').focus();
    }
    input.addEventListener('input', function () {
      var ord = norm(input.value).trim().split(/\s+/).filter(Boolean);
      var andra = val[sida === 'a' ? 'b' : 'a'], andraP = poster.filter(function (x) { return String(x.id) === andra; })[0];
      traffar = !ord.length ? [] : poster.filter(function (p) {
        return String(p.id) !== andra && (!andraP || p.mv === andraP.mv) && ord.every(function (o) { return p.sok.indexOf(o) >= 0; });
      }).sort(function (a, b) { return b.gp - a.gp; }).slice(0, 8);
      markerad = 0; rita();
    });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown') { markerad = Math.min(traffar.length - 1, markerad + 1); rita(); e.preventDefault(); }
      else if (e.key === 'ArrowUp') { markerad = Math.max(0, markerad - 1); rita(); e.preventDefault(); }
      else if (e.key === 'Enter' && traffar[markerad]) { valj(traffar[markerad]); e.preventDefault(); }
      else if (e.key === 'Escape') { lista.hidden = true; }
    });
    input.addEventListener('blur', function () { setTimeout(function () { lista.hidden = true; }, 150); });
    input.addEventListener('focus', function () { input.select(); });
  }

  // ---------- jämförelsen ----------
  function huvud(S) {
    var h = el('div', 'jmf-huvud');
    h.appendChild(logo(S.logo, 52, S.k));
    var t = el('div');
    var n = el('a', 'jmf-namn sp-lank', S.n); n.href = 'spelare.html?id=' + S.id; t.appendChild(n);
    t.appendChild(el('div', 'sp-sub', S.lag + ' · ' + S.pos + (S.age != null ? ' · ' + S.age + ' år' : '') + (S.rook ? ' · Rookie' : '')));
    h.appendChild(t);
    return h;
  }

  function rendera() {
    var res = $('#jmf-res');
    if (!val.a || !val.b) { res.textContent = ''; if (!val.a && !val.b) res.appendChild(el('p', 'note', 'Börja med att skriva ett namn i rutan för spelare 1.')); return; }
    Promise.all([hamta(val.a), hamta(val.b)]).then(function (x) {
      var A = x[0], B = x[1];
      document.title = A.n + ' mot ' + B.n + ' – ' + (A.sajt || 'Slotline');
      $('#jmf-a').value = A.n; $('#jmf-b').value = B.n;
      res.textContent = '';
      var hh = el('div', 'jmf-huvuden');
      hh.appendChild(huvud(A)); hh.appendChild(huvud(B)); res.appendChild(hh);
      if (A.mv !== B.mv) { res.appendChild(el('p', 'note', 'En målvakt och en utespelare har inte samma statistik. Välj två utespelare eller två målvakter.')); return; }

      // grafer
      var cs = getComputedStyle(document.documentElement);
      var ca = cs.getPropertyValue('--bra').trim() || '#4677BA', cb = cs.getPropertyValue('--jmf-b').trim() || '#D08A00';
      var plus = A.plus;
      var acc = function (lg, f) { var t = 0; return lg.map(function (m) { t += f(m) || 0; return Math.round(t * 100) / 100; }); };
      var rull = function (lg, f) { return lg.map(function (m, i) { var s = lg.slice(Math.max(0, i - 4), i + 1); return s.reduce(function (t, y) { return t + (f(y) || 0); }, 0) / s.length; }); };
      var n = Math.max(A.logg.length, B.logg.length), et = [];
      for (var i = 0; i < n; i++) et.push(String(i + 1));
      var duo = el('div', 'g-duo'); res.appendChild(el('h2', 'sp-h', 'Under säsongen')); res.appendChild(duo);
      var g1 = el('div', 'box short g-box'), g2 = el('div', 'box short g-box'); duo.appendChild(g1); duo.appendChild(g2);
      var f1 = el('div'), f2 = el('div');
      var forkl = [{ namn: A.n, farg: ca }, { namn: B.n, farg: cb }];
      if (A.mv) {
        g1.appendChild(el('h3', 'g-h', 'Räddade mål över förväntan (GSAx) efter antal matcher')); g1.appendChild(f1);
        Graf.linjer(f1, [{ farg: ca, varden: acc(A.logg, function (m) { return m.gsax; }) }, { farg: cb, varden: acc(B.logg, function (m) { return m.gsax; }) }], et, { min: 0 });
      } else {
        g1.appendChild(el('h3', 'g-h', 'Poäng efter antal spelade matcher')); g1.appendChild(f1);
        Graf.linjer(f1, [{ farg: ca, varden: acc(A.logg, function (m) { return m.p; }) }, { farg: cb, varden: acc(B.logg, function (m) { return m.p; }) }], et);
      }
      Graf.forklaring(f1, forkl);
      var gsf = function (m) { return plus ? m.pl : m.gs; };
      g2.appendChild(el('h3', 'g-h', (plus ? 'Game Score+' : 'Game Score') + ', snitt av fem matcher')); g2.appendChild(f2);
      Graf.linjer(f2, [{ farg: ca, varden: rull(A.logg, gsf) }, { farg: cb, varden: rull(B.logg, gsf) }], et);
      Graf.forklaring(f2, forkl);

      // statistiken
      res.appendChild(el('h2', 'sp-h', 'Säsongen'));
      var grid = el('div', 'jmf-grupper'); res.appendChild(grid);
      var bGr = {}; B.grupper.forEach(function (g) { bGr[g.t] = g; });
      var bast = [0, 0];
      A.grupper.forEach(function (ga) {
        var gb = bGr[ga.t]; if (!gb) return;
        var bRad = {}; gb.r.forEach(function (r) { bRad[r[0]] = r; });
        var box = el('section', 'box short jmf-grupp'); box.appendChild(el('h3', null, ga.t));
        var hd = el('div', 'jmf-rad jmf-kol'); hd.appendChild(el('span', 'a', A.n.split(' ').slice(-1)[0])); hd.appendChild(el('span')); hd.appendChild(el('span', 'b', B.n.split(' ').slice(-1)[0])); box.appendChild(hd);
        ga.r.forEach(function (ra) {
          var rb = bRad[ra[0]]; if (!rb) return;
          var va = ra[1], vb = rb[1];
          if (ra[2] === 'm') { va = va; vb = vb; }
          var riktning = NEUTRAL.indexOf(ra[0]) >= 0 || (A.mv && ra[0] === 'xG mot') ? 0 : LAGRE.indexOf(ra[0]) >= 0 ? -1 : 1;
          var ab = riktning && va !== vb ? (riktning * (va - vb) > 0 ? 'a' : 'b') : '';
          if (ab === 'a') bast[0]++; else if (ab === 'b') bast[1]++;
          var rad = el('div', 'jmf-rad');
          rad.appendChild(el('span', 'a' + (ab === 'a' ? ' best' : ''), visa(ra)));
          rad.appendChild(el('span', 'l', ra[0]));
          rad.appendChild(el('span', 'b' + (ab === 'b' ? ' best' : ''), visa(rb)));
          box.appendChild(rad);
        });
        grid.appendChild(box);
      });
      var sum = el('p', 'jmf-sum');
      sum.textContent = A.n + ' är bäst på ' + bast[0] + ' rader och ' + B.n + ' på ' + bast[1] + '. Rader där inget är bättre eller sämre, som istid, räknas inte.';
      res.insertBefore(sum, hh.nextSibling);
    }).catch(function (e) { res.textContent = ''; res.appendChild(el('p', 'note', 'Spelarna kunde inte laddas (' + e.message + ').')); });
  }

  fetch('data/sasong.json', { cache: 'no-store' }).then(function (r) { return r.json(); }).then(function (d) {
    D = d; D.lagInfo = D.lagInfo || {};
    (D.spelare || []).forEach(function (p) { poster.push({ id: p.id, n: p.n, k: p.k, gp: p.gp || 0, mv: false, sok: norm(p.n), meta: p.k + ' · ' + (p.pos === 'B' ? 'Back' : 'Forward') + ' · ' + p.p + ' p' }); });
    (D.mv || []).forEach(function (p) { poster.push({ id: p.id, n: p.n, k: p.k, gp: p.gp || 0, mv: true, sok: norm(p.n), meta: p.k + ' · Målvakt · ' + p.gp + ' matcher' }); });
    valjare('a'); valjare('b');
    rendera();
    if (!val.a) $('#jmf-a').focus(); else if (!val.b) $('#jmf-b').focus();
  });
})();
