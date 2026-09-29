// ============================================================================
// ZOOM NO BONECO (celular / toque)
// No desktop o zoom é só CSS (:hover). Em telas de toque não existe hover,
// então tocar no boneco de outro jogador amplia por ~2,5s (ou até tocar de
// novo / tocar em outro lugar).
// ============================================================================
(function () {
  var touchOnly = window.matchMedia && window.matchMedia('(hover: none)').matches;
  if (!touchOnly) return;

  var timer = null;
  var current = null;

  function close() {
    clearTimeout(timer);
    if (current) current.classList.remove('is-zoomed');
    current = null;
  }

  document.addEventListener('click', function (e) {
    var fig = e.target.closest && e.target.closest('.seat .seat-figure');
    if (!fig) return close();
    if (fig === current) return close();
    close();
    current = fig;
    fig.classList.add('is-zoomed');
    timer = setTimeout(close, 2500);
  });
})();
