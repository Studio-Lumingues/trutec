// ============================================================================
// FAVICON ANIMADO ("hand drawn animado")
// Navegadores não animam favicon em SVG, então geramos alguns quadros do
// personagem rosa (assets/personagem.svg), cada um com o contorno levemente
// deslocado por um ruído diferente, e trocamos o ícone da aba em sequência —
// o mesmo tremido do boil.js (mesmo FPS e mesma sequência de "sementes").
// Se algo falhar (ex.: navegador sem canvas), fica o ícone estático do <head>.
// ============================================================================
(function () {
  var SRC = 'assets/personagem.svg';
  var FPS = 4;                        // mais leve que o boil.js (trocar o ícone da aba custa caro)
  var SEEDS = [1, 4, 7, 2, 9, 5];     // igual ao boil.js
  var SIZE = 64;                      // px do canvas (o navegador reduz pra 16/32)
  var AMPLITUDE = 1.5;                 // força do tremido, em px do canvas
  var GRID = 5;                       // "granulação" do ruído (células por lado)

  // gerador pseudo-aleatório com semente (mesma semente = mesmo quadro)
  function rng(seed) {
    var s = seed * 9301 + 49297;
    return function () { s = (s * 9301 + 49297) % 233280; return s / 233280; };
  }

  // grade de ruído suave (valor entre -1 e 1) interpolada por pixel
  function noiseField(seed) {
    var r = rng(seed), n = GRID + 1, g = [];
    for (var i = 0; i < n * n; i++) g.push(r() * 2 - 1);
    return function (x, y) {
      var fx = x / SIZE * GRID, fy = y / SIZE * GRID;
      var x0 = Math.floor(fx), y0 = Math.floor(fy);
      var tx = fx - x0, ty = fy - y0;
      tx = tx * tx * (3 - 2 * tx); ty = ty * ty * (3 - 2 * ty);
      var a = g[y0 * n + x0], b = g[y0 * n + x0 + 1];
      var c = g[(y0 + 1) * n + x0], d = g[(y0 + 1) * n + x0 + 1];
      return (a + (b - a) * tx) * (1 - ty) + (c + (d - c) * tx) * ty;
    };
  }

  // lê o pixel (x,y) da origem com interpolação bilinear (alpha pré-multiplicado
  // pra não criar franja escura nas bordas)
  function sample(src, x, y, out) {
    x = Math.min(SIZE - 1, Math.max(0, x)); // fora do quadro: repete o pixel da borda
    y = Math.min(SIZE - 1, Math.max(0, y));
    var x0 = Math.floor(x), y0 = Math.floor(y), tx = x - x0, ty = y - y0;
    var r = 0, g = 0, b = 0, a = 0;
    for (var j = 0; j < 2; j++) {
      for (var i = 0; i < 2; i++) {
        var px = x0 + i, py = y0 + j;
        if (px < 0 || py < 0 || px >= SIZE || py >= SIZE) continue;
        var w = (i ? tx : 1 - tx) * (j ? ty : 1 - ty);
        var k = (py * SIZE + px) * 4, al = src[k + 3] / 255 * w;
        r += src[k] * al; g += src[k + 1] * al; b += src[k + 2] * al; a += al;
      }
    }
    if (a > 0) { out[0] = r / a; out[1] = g / a; out[2] = b / a; out[3] = a * 255; }
    else { out[0] = out[1] = out[2] = out[3] = 0; }
  }

  function makeFrames(img) {
    var canvas = document.createElement('canvas');
    canvas.width = canvas.height = SIZE;
    var ctx = canvas.getContext('2d');

    // desenha o personagem (recortado justo, centralizado) no canvas
    var cx = 35, cy = 20, cw = 430, ch = 480;       // área útil do SVG 500x500
    var scale = SIZE / ch, w = cw * scale;
    ctx.clearRect(0, 0, SIZE, SIZE);
    ctx.drawImage(img, cx, cy, cw, ch, (SIZE - w) / 2, 0, w, SIZE);
    var base = ctx.getImageData(0, 0, SIZE, SIZE).data;

    var frames = [], px = [0, 0, 0, 0];
    SEEDS.forEach(function (seed) {
      var nx = noiseField(seed), ny = noiseField(seed + 100);
      var out = ctx.createImageData(SIZE, SIZE), o = out.data;
      for (var y = 0; y < SIZE; y++) {
        for (var x = 0; x < SIZE; x++) {
          sample(base, x + nx(x, y) * AMPLITUDE, y + ny(x, y) * AMPLITUDE, px);
          var k = (y * SIZE + x) * 4;
          o[k] = px[0]; o[k + 1] = px[1]; o[k + 2] = px[2]; o[k + 3] = px[3];
        }
      }
      ctx.putImageData(out, 0, 0);
      frames.push(canvas.toDataURL('image/png'));
    });
    return frames;
  }

  // troca o <link rel="icon"> (recriar o elemento é o jeito que atualiza a aba
  // de forma confiável em todos os navegadores)
  function setIcon(href) {
    var old = document.querySelectorAll('link[rel~="icon"]');
    for (var i = 0; i < old.length; i++) old[i].parentNode.removeChild(old[i]);
    var link = document.createElement('link');
    link.rel = 'icon';
    link.type = 'image/png';
    link.href = href;
    document.head.appendChild(link);
  }

  var img = new Image();
  img.onload = function () {
    var frames;
    try { frames = makeFrames(img); } catch (e) { return; } // canvas bloqueado: mantém o estático
    if (!frames || !frames.length) return;
    setIcon(frames[0]);
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    var n = 0;
    setInterval(function () { if (document.hidden) return; setIcon(frames[n++ % frames.length]); }, 1000 / FPS);
  };
  img.src = SRC;
})();
