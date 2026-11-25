// Retro skin extra: a per-browser visit counter for the footer odometer.
// Purely decorative; it counts this browser's page loads, nothing is sent anywhere.
(function () {
  var el = document.getElementById('hitCounter');
  if (!el) return;
  var n = 1;
  try {
    n = (parseInt(localStorage.getItem('retroHits'), 10) || 0) + 1;
    localStorage.setItem('retroHits', String(n));
  } catch (e) { /* storage blocked: show 1 */ }
  var digits = String(n).padStart(6, '0');
  el.innerHTML = digits.split('').map(function (d) { return '<i>' + d + '</i>'; }).join('');
})();
