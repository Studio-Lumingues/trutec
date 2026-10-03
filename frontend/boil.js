// ============================================================================
// HAND DRAWN ANIMADO ("boiling line")
// Troca a semente dos filtros de ruído (#boil-sm e #boil-lg, em index.html)
// alguns quadros por segundo. Cada troca desloca levemente o contorno de tudo
// que usa esses filtros — o boneco, os avatares e as linhas que o jogador
// desenha — dando o tremido característico de animação desenhada à mão.
// ============================================================================
(function () {
  var FPS = 8;                 // menos = mais "travadinho", mais = mais fluido
  var SEEDS = [1, 4, 7, 2, 9, 5]; // sequência de quadros (repete em loop)
  var nodes = document.querySelectorAll('feTurbulence[data-boil]');
  if (!nodes.length) return;
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  var frame = 0;
  function tick() {
    if (document.hidden || document.documentElement.classList.contains('screen-opening')) return;
    var seed = SEEDS[frame++ % SEEDS.length];
    for (var i = 0; i < nodes.length; i++) nodes[i].setAttribute('seed', seed);
  }
  setInterval(tick, 1000 / FPS);
})();
