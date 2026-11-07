/* Slotline – små grafer i SVG (används på spelar- och lagsidorna). */
(function () {
  'use strict';
  var NS = 'http://www.w3.org/2000/svg';
  function s(tag, attrs, parent) {
    var e = document.createElementNS(NS, tag);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  function titel(e, text) { var t = s('title', {}, e); t.textContent = text; }
  function tal(v) { return String((Math.round(v * 100) / 100).toFixed(Math.abs(v) >= 10 ? 0 : 1)).replace('-', '−').replace('.', ','); }

  function bredd(box) { var w = Math.round(box.getBoundingClientRect().width); return w > 200 ? w : 720; }

  function ram(box, W, H, lo, hi, P) {
    var svg = s('svg', { viewBox: '0 0 ' + W + ' ' + H, class: 'graf', role: 'img' });
    var y = function (v) { return P.t + (hi - v) / (hi - lo || 1) * (H - P.t - P.b); };
    var steg = (hi - lo) <= 3 ? 0.5 : (hi - lo) <= 6 ? 1 : (hi - lo) <= 15 ? 2 : (hi - lo) <= 40 ? 5 : 10;
    for (var v = Math.ceil(lo / steg) * steg; v <= hi + 1e-9; v += steg) {
      s('line', { x1: P.l, x2: W - P.r, y1: y(v), y2: y(v), class: Math.abs(v) < 1e-9 ? 'g-noll' : 'g-rut' }, svg);
      var t = s('text', { x: P.l - 6, y: y(v) + 4, 'text-anchor': 'end', class: 'g-axel' }, svg);
      t.textContent = tal(v);
    }
    box.textContent = '';
    box.appendChild(svg);
    return { svg: svg, y: y };
  }

  // Staplar: punkter = [{v, farg, titel, etikett}]
  function staplar(box, punkter, opt) {
    opt = opt || {};
    var W = bredd(box), H = opt.hojd || (W < 500 ? 190 : 220), P = { l: 36, r: 8, t: 10, b: 24 };
    if (!punkter.length) { box.textContent = ''; return; }
    var vals = punkter.map(function (p) { return p.v || 0; });
    var lo = Math.min(0, Math.min.apply(null, vals)), hi = Math.max(0.5, Math.max.apply(null, vals));
    var r = ram(box, W, H, lo, hi, P);
    var bw = (W - P.l - P.r) / punkter.length;
    punkter.forEach(function (p, i) {
      var v = p.v || 0, y0 = r.y(0), y1 = r.y(v);
      var rect = s('rect', { x: P.l + i * bw + bw * 0.15, width: Math.max(1, bw * 0.7), y: Math.min(y0, y1), height: Math.max(1, Math.abs(y1 - y0)), rx: Math.min(3, bw * 0.2), fill: p.farg }, r.svg);
      if (p.titel) titel(rect, p.titel);
    });
    var var_n = Math.max(1, Math.ceil(punkter.length / Math.max(3, Math.floor(W / 70))));
    punkter.forEach(function (p, i) {
      var sist = punkter.length - 1;
      if (p.etikett && (i === sist || (i % var_n === 0 && sist - i >= var_n))) {
        var t = s('text', { x: P.l + i * bw + bw / 2, y: H - 6, 'text-anchor': 'middle', class: 'g-axel' }, r.svg);
        t.textContent = p.etikett;
      }
    });
  }

  // Linjer: serier = [{namn, farg, varden: [..], streckad}], etiketter = [..] (x-axel)
  function linjer(box, serier, etiketter, opt) {
    opt = opt || {};
    var W = bredd(box), H = opt.hojd || (W < 500 ? 190 : 220), P = { l: 36, r: 8, t: 10, b: 24 };
    var alla = [];
    serier.forEach(function (sr) { sr.varden.forEach(function (v) { if (v != null) alla.push(v); }); });
    if (!alla.length) { box.textContent = ''; return; }
    var lo = Math.min(opt.min != null ? opt.min : 0, Math.min.apply(null, alla)), hi = Math.max.apply(null, alla);
    if (hi - lo < 1) hi = lo + 1;
    hi += (hi - lo) * 0.05;
    var r = ram(box, W, H, lo, hi, P);
    var n = Math.max.apply(null, serier.map(function (sr) { return sr.varden.length; }));
    var x = function (i) { return P.l + (n <= 1 ? (W - P.l - P.r) / 2 : i / (n - 1) * (W - P.l - P.r)); };
    serier.forEach(function (sr) {
      var d = '';
      sr.varden.forEach(function (v, i) { if (v != null) d += (d ? 'L' : 'M') + x(i).toFixed(1) + ' ' + r.y(v).toFixed(1); });
      s('path', { d: d, fill: 'none', stroke: sr.farg, 'stroke-width': sr.tunn ? 1.5 : 3, 'stroke-linejoin': 'round', 'stroke-linecap': 'round', 'stroke-dasharray': sr.streckad ? '6 5' : '', opacity: sr.tunn ? 0.45 : 1 }, r.svg);
      if (sr.prickar) sr.varden.forEach(function (v, i) {
        if (v == null) return;
        var c = s('circle', { cx: x(i), cy: r.y(v), r: 3.5, fill: sr.farg, opacity: 0.55 }, r.svg);
        if (sr.titlar && sr.titlar[i]) titel(c, sr.titlar[i]);
      });
      var sista = sr.varden.length - 1;
      while (sista >= 0 && sr.varden[sista] == null) sista--;
      if (sista >= 0 && !sr.tunn) s('circle', { cx: x(sista), cy: r.y(sr.varden[sista]), r: 4.5, fill: sr.farg }, r.svg);
    });
    var steg = Math.max(1, Math.ceil(n / Math.max(3, Math.floor(W / 70))));
    (etiketter || []).forEach(function (e, i) {
      if (e && (i === n - 1 || (i % steg === 0 && n - 1 - i >= steg))) {
        var t = s('text', { x: x(i), y: H - 6, 'text-anchor': i === n - 1 ? 'end' : i === 0 ? 'start' : 'middle', class: 'g-axel' }, r.svg);
        t.textContent = e;
      }
    });
  }

  function forklaring(box, poster) {
    var d = document.createElement('div'); d.className = 'g-forkl';
    poster.forEach(function (p) {
      var sp = document.createElement('span');
      var i = document.createElement('i'); i.style.background = p.farg; if (p.streckad) i.className = 'streck';
      sp.appendChild(i); sp.appendChild(document.createTextNode(p.namn)); d.appendChild(sp);
    });
    box.appendChild(d);
  }

  window.Graf = { staplar: staplar, linjer: linjer, forklaring: forklaring };
})();
