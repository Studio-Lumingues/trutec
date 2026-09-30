// ============================================================================
// NOISE ANIMADO (granulado sobre a tela inteira)
// Antes: um único quadro de ruído era só "pulado" de lugar por 8 posições fixas
// em loop — o olho percebe o padrão se repetindo. Agora:
//   - geramos vários quadros de ruído DIFERENTES (canvas, RGB colorido);
//   - a cada troca sorteamos um quadro diferente do anterior, uma posição
//     aleatória e um espelhamento aleatório;
//   - o intervalo entre trocas também varia (não é um "metrônomo").
// O visual (grão colorido, opacity baixa) segue igual ao antigo body::after,
// que fica só como reserva caso o JS falhe.
// Ajustes: OPACITY (intensidade), FRAMES, MIN_MS/MAX_MS (velocidade).
// ============================================================================
(function () {
  var TILE = 200;          // px (tamanho do quadro na tela)
  var FRAMES = 10;         // quantos quadros diferentes
  var MIN_MS = 70;         // intervalo mínimo entre trocas
  var MAX_MS = 140;        // intervalo máximo
  var OPACITY = 0.07;

  var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var FLIPS = ['scale(1,1)', 'scale(-1,1)', 'scale(1,-1)', 'scale(-1,-1)'];

  // ruído "triangular" (média de dois sorteios: menos estourado que ruído branco puro)
  // com o mesmo contraste do filtro antigo (3x - 1)
  function makeTile(done) {
    var c = document.createElement('canvas');
    c.width = c.height = TILE;
    var ctx = c.getContext('2d');
    var img = ctx.createImageData(TILE, TILE), d = img.data;
    for (var i = 0; i < d.length; i += 4) {
      for (var k = 0; k < 3; k++) {
        var n = (Math.random() + Math.random()) / 2;
        var v = Math.min(1, Math.max(0, n * 3 - 1));
        d[i + k] = v * 255;
      }
      d[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    if (c.toBlob) {
      c.toBlob(function (b) { done(b ? URL.createObjectURL(b) : c.toDataURL('image/png')); });
    } else {
      done(c.toDataURL('image/png'));
    }
  }

  function start() {
    var layer = document.createElement('div');
    layer.className = 'noise-layer';
    layer.setAttribute('aria-hidden', 'true');
    layer.style.opacity = OPACITY;
    document.body.appendChild(layer);

    var urls = [];
    var last = -1;

    function frame() {
      var idx;
      do { idx = Math.floor(Math.random() * urls.length); } while (idx === last && urls.length > 1);
      last = idx;
      layer.style.backgroundImage = 'url("' + urls[idx] + '")';
      layer.style.backgroundPosition =
        Math.floor(Math.random() * TILE) + 'px ' + Math.floor(Math.random() * TILE) + 'px';
      layer.style.transform = FLIPS[Math.floor(Math.random() * FLIPS.length)];
    }

    function loop() {
      if (!document.hidden) frame();
      setTimeout(loop, MIN_MS + Math.random() * (MAX_MS - MIN_MS));
    }

    var pending = FRAMES;
    for (var i = 0; i < FRAMES; i++) {
      makeTile(function (u) {
        urls.push(u);
        // pré-decodifica pra a troca de quadro não engasgar
        var im = new Image(); im.src = u;
        if (--pending === 0) {
          // só troca o ruído antigo pelo novo quando tudo está pronto
          document.documentElement.classList.add('noise-js');
          frame();
          if (!reduced) loop();
        }
      });
    }
  }

  if (document.body) start();
  else document.addEventListener('DOMContentLoaded', start);
})();
