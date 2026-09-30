// ============================================================================
// NOISE ANIMADO (granulado sobre a tela inteira)
// - Vários quadros de ruído DIFERENTES (canvas, RGB colorido); a cada troca
//   sorteamos um quadro diferente do anterior e uma posição aleatória, e o
//   intervalo entre trocas também varia — não há padrão repetindo.
// - Tudo é desenhado direto num <canvas> (síncrono). Antes trocávamos a imagem
//   de fundo de uma div: enquanto o navegador decodificava a imagem nova, a
//   camada ficava vazia por um instante e a tela "piscava/escurecia".
// O antigo body::after fica só como reserva caso o JS falhe.
// Ajustes: OPACITY (intensidade), FRAMES, MIN_MS/MAX_MS (velocidade).
// ============================================================================
(function () {
  var TILE = 200;          // px de cada quadro de ruído
  var FRAMES = 10;         // quantos quadros diferentes
  var MIN_MS = 70;         // intervalo mínimo entre trocas
  var MAX_MS = 140;        // intervalo máximo
  var OPACITY = 0.07;

  var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ruído "triangular" com o mesmo contraste do filtro antigo (3x - 1)
  function makeTile() {
    var c = document.createElement('canvas');
    c.width = c.height = TILE;
    var tctx = c.getContext('2d');
    var img = tctx.createImageData(TILE, TILE), d = img.data;
    for (var i = 0; i < d.length; i += 4) {
      for (var k = 0; k < 3; k++) {
        var n = (Math.random() + Math.random()) / 2;
        d[i + k] = Math.min(1, Math.max(0, n * 3 - 1)) * 255;
      }
      d[i + 3] = 255;
    }
    tctx.putImageData(img, 0, 0);
    return c;
  }

  function start() {
    var canvas = document.createElement('canvas');
    canvas.className = 'noise-layer';
    canvas.setAttribute('aria-hidden', 'true');
    canvas.style.opacity = OPACITY;
    var ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return; // sem canvas: fica o body::after antigo
    document.body.appendChild(canvas);

    var patterns = [];
    for (var i = 0; i < FRAMES; i++) patterns.push(ctx.createPattern(makeTile(), 'repeat'));
    var last = -1;

    function frame() {
      var idx;
      do { idx = Math.floor(Math.random() * patterns.length); } while (idx === last && patterns.length > 1);
      last = idx;
      var ox = Math.floor(Math.random() * TILE), oy = Math.floor(Math.random() * TILE);
      ctx.save();
      ctx.translate(ox, oy);
      ctx.fillStyle = patterns[idx];
      ctx.fillRect(-ox, -oy, canvas.width, canvas.height); // cobre tudo, sem "buraco" entre quadros
      ctx.restore();
    }

    function resize() {
      canvas.width = Math.max(1, window.innerWidth);
      canvas.height = Math.max(1, window.innerHeight);
      frame();
    }
    window.addEventListener('resize', resize);

    function loop() {
      if (!document.hidden) frame();
      setTimeout(loop, MIN_MS + Math.random() * (MAX_MS - MIN_MS));
    }

    resize();
    // só desliga o ruído antigo depois que o novo já desenhou o 1º quadro
    document.documentElement.classList.add('noise-js');
    if (!reduced) loop();
  }

  if (document.body) start();
  else document.addEventListener('DOMContentLoaded', start);
})();
