/* Slotline – lagsidan. Läser data/lag/<förkortning>.json. */
(function () {
  'use strict';
  var MAN_K = ['jan', 'feb', 'mar', 'apr', 'maj', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];
  var DAG = ['sön', 'mån', 'tis', 'ons', 'tor', 'fre', 'lör'];
  var FARG = window.LAGFARG || {};
  var MORK = window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches;
  var k = (new URLSearchParams(location.search).get('k') || '').toUpperCase();
  function $(s) { return document.querySelector(s); }
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function tal(v, d) { return v == null ? '–' : v.toFixed(d == null ? 2 : d).replace('-', '−'); }
  function f1(v) { return v == null ? '–' : v.toFixed(1).replace('.', ',').replace('-', '−'); }
  function tid(min) { if (min == null) return '–'; var t = Math.round(min * 60); return Math.floor(t / 60) + ':' + ('0' + (t % 60)).slice(-2); }
  function datum(s) { var d = new Date(s + 'T12:00:00'); return d.getDate() + ' ' + MAN_K[d.getMonth()]; }
  function prick(abbr, size) { var s = el('span', 'lagprick'); s.style.width = size + 'px'; s.style.height = size + 'px'; s.style.setProperty('--c', (FARG[abbr] || ['#9AA8B6'])[0]); s.appendChild(el('i')); return s; }
  function logo(src, size, abbr) {
    if (!src) return prick(abbr, size);
    var img = el('img', 'logo'); img.alt = ''; img.width = size; img.height = size;
    img.onerror = function () { if (/_dark\.svg$/.test(img.src)) { img.src = img.src.replace('_dark.svg', '_light.svg'); return; } if (img.parentNode) img.parentNode.replaceChild(prick(abbr, size), img); };
    img.src = MORK ? src.replace('_light.svg', '_dark.svg') : src; return img;
  }
  function lank(href, text) { var a = el('a', 'sp-lank', text); a.href = href; return a; }
  function cell(tr, v, cls) { var t = el('td', cls); if (v instanceof Node) t.appendChild(v); else t.textContent = v == null ? '–' : v; tr.appendChild(t); return t; }
  function placering(n) { return n + (n === 1 || n === 2 ? ':a' : ':e'); }

  function render(L, loggor) {
    document.title = L.n + ' – ' + (L.sajt || 'Slotline');
    var plus = L.plus;
    $('#l-logo').appendChild(logo(L.logo, 72, L.k));
    $('#l-namn').textContent = L.n;
    var R = L.rekord;
    $('#l-sub').textContent = placering(L.plats) + ' i ligan · ' + R.gp + ' matcher · ' + R.w + '–' + R.l + '–' + R.otl;

    var gs = plus ? R.pl : R.gs;
    [['Poäng', R.pts], ['Mål för–emot', R.gf + '–' + R.ga], ['xG för/match', f1(L.xgf)], ['xG emot/match', f1(L.xga)],
     ['xG senaste 3', R.x3f != null ? f1(R.x3f) + '–' + f1(R.x3a) : '–'], [plus ? 'Game Score+/match' : 'Game Score/match', tal(gs)]]
      .forEach(function (t) { var d = el('div', 'sp-tile'); d.appendChild(el('div', 'v', String(t[1]))); d.appendChild(el('div', 'l', t[0])); $('#l-tiles').appendChild(d); });

    // graf: rullande snitt över 5 matcher
    var S = L.serie.filter(function (m) { return m.xgf != null; });
    var rull = function (key) { return S.map(function (m, i) { var a = S.slice(Math.max(0, i - 4), i + 1); return a.reduce(function (s, x) { return s + x[key]; }, 0) / a.length; }); };
    var cs = getComputedStyle(document.documentElement);
    var bla = cs.getPropertyValue('--bra').trim() || '#4677BA', rod = cs.getPropertyValue('--svag').trim() || '#C8392B';
    var tit = S.map(function (m) { return (m.hemma ? 'mot ' : '@ ') + m.mot + ' ' + m.gf + '–' + m.ga + ' · xG ' + f1(m.xgf) + '–' + f1(m.xga); });
    var g = $('#l-graf');
    if (S.length) {
      Graf.linjer(g, [
        { namn: 'xG för', farg: bla, varden: S.map(function (m) { return m.xgf; }), tunn: true, prickar: true, titlar: tit },
        { namn: 'xG emot', farg: rod, varden: S.map(function (m) { return m.xga; }), tunn: true, prickar: true, titlar: tit },
        { namn: 'För, snitt 5', farg: bla, varden: rull('xgf') },
        { namn: 'Emot, snitt 5', farg: rod, varden: rull('xga') }
      ], S.map(function (m) { return datum(m.d); }), { hojd: 240 });
      Graf.forklaring(g, [{ namn: 'Chanser för', farg: bla }, { namn: 'Chanser emot', farg: rod }]);
    } else g.textContent = 'Inga matcher ännu.';

    // kommande
    var km = $('#l-kommande');
    if (!L.kommande.length) km.appendChild(el('p', 'note', 'Inga matcher inlagda den närmaste veckan.'));
    L.kommande.forEach(function (m) {
      var hemma = m.h.k === L.k, jag = hemma ? m.h : m.b, mot = hemma ? m.b : m.h;
      var a = el('a', 'l-km'); a.href = './#vinstchans';
      var d = m.start ? new Date(m.start) : new Date(m.d + 'T12:00:00');
      var nar = el('div', 'l-km-nar'); nar.appendChild(el('b', null, DAG[d.getDay()] + ' ' + d.getDate() + ' ' + MAN_K[d.getMonth()]));
      if (m.start) nar.appendChild(el('small', null, ('0' + d.getHours()).slice(-2) + '.' + ('0' + d.getMinutes()).slice(-2)));
      a.appendChild(nar);
      var mo = el('div', 'l-km-mot'); mo.appendChild(document.createTextNode(hemma ? 'mot ' : '@ ')); mo.appendChild(logo(loggor[mot.k], 26, mot.k)); mo.appendChild(el('b', null, mot.k));
      var mv = (jag.mv || [])[0]; if (mv) mo.appendChild(el('small', 'l-km-mv', mv.n));
      a.appendChild(mo);
      var p = Math.round(jag.p * 100);
      var ch = el('div', 'l-km-p ' + (p >= 50 ? 'upp' : 'ned'), p + ' %'); a.appendChild(ch);
      km.appendChild(a);
    });

    // senaste
    var tb = $('#l-senaste tbody');
    L.serie.slice(-10).reverse().forEach(function (m) {
      var r = el('tr', 'click'); r.tabIndex = 0;
      cell(r, datum(m.d), 'm');
      var mo = el('span', 'sp-mot'); mo.appendChild(document.createTextNode(m.hemma ? 'mot ' : '@ ')); mo.appendChild(logo(loggor[m.mot], 20, m.mot)); mo.appendChild(document.createTextNode(m.mot)); cell(r, mo, '');
      cell(r, el('span', 'sp-res ' + (m.res === 'V' ? 'v' : 'f'), m.res + ' ' + m.gf + '–' + m.ga + (m.avg && m.avg !== 'Ordinarie' && m.avg !== 'REG' ? ' (' + (m.avg === 'SO' || /straff/i.test(m.avg) ? 'str' : 'öt') + ')' : '')), '');
      cell(r, m.xgf != null ? f1(m.xgf) + '–' + f1(m.xga) : '–', 'n m');
      var ga = function () { location.href = 'kort.html?id=' + m.id; };
      r.addEventListener('click', ga); r.addEventListener('keydown', function (e) { if (e.key === 'Enter') ga(); });
      tb.appendChild(r);
    });

    // spelare
    $('#l-gs-h').textContent = plus ? 'GS+' : 'GS'; $('#l-gsmv-h').textContent = plus ? 'GS+' : 'GS';
    var sp = L.spelare.slice().sort(function (a, b) { return (b.p - a.p) || (b.g - a.g) || ((plus ? b.pl : b.gs) - (plus ? a.pl : a.gs)); });
    var ts = $('#l-spelare tbody');
    sp.forEach(function (p) {
      var r = el('tr');
      var n = lank('spelare.html?id=' + p.id, p.n); if (p.rook) { var rk = el('span', 'rookie', 'R'); rk.title = 'Rookie'; n.appendChild(rk); }
      cell(r, n, 'nm'); cell(r, p.pos, 'm hn'); cell(r, p.gp, 'n'); cell(r, p.g, 'n'); cell(r, p.a, 'n'); cell(r, p.p, 'n fet');
      cell(r, p.xp != null ? f1(p.xp) : '–', 'n m hn'); cell(r, tid(p.toi), 'n hn');
      var v = plus ? p.pl : p.gs; var c = cell(r, tal(v), 'n fet'); if (v != null && v < 0) c.style.color = 'var(--svag)';
      ts.appendChild(r);
    });
    var tm = $('#l-mv tbody');
    L.mv.slice().sort(function (a, b) { return b.gp - a.gp; }).forEach(function (p) {
      var r = el('tr');
      cell(r, lank('spelare.html?id=' + p.id, p.n), 'nm'); cell(r, p.gp, 'n');
      cell(r, p.sv != null ? (p.sv * 100).toFixed(1).replace('.', ',') + ' %' : '–', 'n'); cell(r, tal(p.gsax), 'n');
      var v = plus ? p.pl : p.gs; var c = cell(r, tal(v), 'n fet'); if (v != null && v < 0) c.style.color = 'var(--svag)';
      tm.appendChild(r);
    });
  }

  if (!k) { $('#l-namn').textContent = 'Inget lag valt.'; return; }
  Promise.all([
    fetch('data/lag/' + encodeURIComponent(k) + '.json', { cache: 'no-store' }).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }),
    fetch('data/sasong.json', { cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; })
  ]).then(function (x) {
    var loggor = {};
    if (x[1] && x[1].lagInfo) Object.keys(x[1].lagInfo).forEach(function (kk) { loggor[kk] = x[1].lagInfo[kk].logo; });
    render(x[0], loggor);
  }).catch(function (e) { $('#l-namn').textContent = 'Laget kunde inte laddas (' + e.message + ').'; });
})();
