/* Slotline – sökrutan i sidhuvudet. Hittar spelare, målvakter och lag. */
(function () {
  'use strict';
  var input = document.getElementById('sok');
  var lista = document.getElementById('sok-lista');
  if (!input || !lista) return;
  var poster = null, laddar = null, val = -1, traffar = [];
  var MORK = window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches && document.documentElement.dataset.tema !== 'ljust';
  function norm(t) { return String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); }
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }

  function ladda() {
    if (laddar) return laddar;
    laddar = fetch('data/sasong.json', { cache: 'no-store' }).then(function (r) { return r.json(); }).then(function (D) {
      var logo = {}; Object.keys(D.lagInfo || {}).forEach(function (k) { logo[k] = D.lagInfo[k].logo; });
      poster = [];
      (D.lag || []).forEach(function (t) {
        poster.push({ typ: 'lag', namn: t.lag, sok: norm(t.lag + ' ' + t.k), k: t.k, logo: logo[t.k], meta: t.pts + ' poäng', url: 'lag.html?k=' + t.k, vikt: 3 });
      });
      (D.spelare || []).forEach(function (p) {
        poster.push({ typ: 'sp', namn: p.n, sok: norm(p.n), k: p.k, logo: logo[p.k], meta: p.k + ' · ' + (p.pos === 'B' ? 'Back' : 'Forward') + ' · ' + p.p + ' p', url: 'spelare.html?id=' + p.id, vikt: Math.min(2, (p.gp || 0) / 10) });
      });
      (D.mv || []).forEach(function (p) {
        poster.push({ typ: 'sp', namn: p.n, sok: norm(p.n), k: p.k, logo: logo[p.k], meta: p.k + ' · Målvakt', url: 'spelare.html?id=' + p.id, vikt: Math.min(2, (p.gp || 0) / 10) });
      });
    });
    return laddar;
  }

  function sok(q) {
    q = norm(q).trim();
    if (q.length < 2) return [];
    var ord = q.split(/\s+/);
    var ut = [];
    poster.forEach(function (p) {
      var ok = ord.every(function (o) { return p.sok.indexOf(o) >= 0; });
      if (!ok) return;
      var start = p.sok.indexOf(q) === 0 || (' ' + p.sok).indexOf(' ' + ord[0]) >= 0;
      ut.push({ p: p, poang: (start ? 10 : 0) + p.vikt });
    });
    return ut.sort(function (a, b) { return b.poang - a.poang; }).slice(0, 8).map(function (x) { return x.p; });
  }

  function visa() {
    lista.textContent = '';
    if (!input.value.trim()) { lista.hidden = true; return; }
    if (!traffar.length) { lista.appendChild(el('div', 'sok-tom', input.value.trim().length < 2 ? 'Skriv minst två bokstäver' : 'Ingen träff')); lista.hidden = false; return; }
    traffar.forEach(function (p, i) {
      var a = el('a', 'sok-rad' + (i === val ? ' vald' : '')); a.href = p.url; a.setAttribute('role', 'option');
      if (p.logo) { var img = el('img'); img.src = MORK ? p.logo.replace('_light.svg', '_dark.svg') : p.logo; img.alt = ''; img.width = 26; img.height = 26; a.appendChild(img); }
      else a.appendChild(el('span', 'sok-ph'));
      var t = el('span', 'sok-t'); t.appendChild(el('b', null, p.namn)); t.appendChild(el('small', null, p.typ === 'lag' ? 'Lag · ' + p.meta : p.meta)); a.appendChild(t);
      lista.appendChild(a);
    });
    lista.hidden = false;
  }

  input.addEventListener('focus', ladda);
  input.addEventListener('input', function () {
    ladda().then(function () { traffar = sok(input.value); val = traffar.length ? 0 : -1; visa(); });
  });
  input.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowDown') { val = Math.min(traffar.length - 1, val + 1); visa(); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { val = Math.max(0, val - 1); visa(); e.preventDefault(); }
    else if (e.key === 'Enter' && traffar[val]) { location.href = traffar[val].url; }
    else if (e.key === 'Escape') { input.value = ''; lista.hidden = true; input.blur(); }
  });
  document.addEventListener('click', function (e) { if (!lista.contains(e.target) && e.target !== input) lista.hidden = true; });
})();
