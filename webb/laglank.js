/* Slotline – allt som är märkt med data-lag (loggor och lagnamn) leder till lagets sida. */
(function () {
  'use strict';
  if (/[?&]export=1/.test(location.search)) return;
  function mal(e) { return e.target && e.target.closest ? e.target.closest('[data-lag]') : null; }
  document.addEventListener('click', function (e) {
    var n = mal(e);
    if (!n || !n.dataset.lag || e.defaultPrevented) return;
    e.preventDefault(); e.stopPropagation();
    location.href = 'lag.html?k=' + encodeURIComponent(n.dataset.lag);
  }, true);
})();
