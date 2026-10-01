// ============================================================================
// BRILHO DO BOTÃO DE VIDRO (.btn-glass)
// Ao passar o mouse, o brilho faz o trajeto INTEIRO, mesmo que o mouse saia do
// botão no meio. A classe .sweep só é removida quando a animação termina.
// ============================================================================
(function () {
  document.querySelectorAll('.btn-glass').forEach(function (btn) {
    btn.addEventListener('pointerenter', function () { btn.classList.add('sweep'); });
    btn.addEventListener('animationend', function (e) {
      if (e.animationName === 'glassSweep') btn.classList.remove('sweep');
    });
  });
})();
