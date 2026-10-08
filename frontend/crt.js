// ============================================================================
// CRT + VHS no jogo todo (câmera de fita / TV de tubo)
// Cria o #crt-overlay (estilo em crt.css), gera o granulado colorido e mostra o
// "● REC" com data e hora. A escolha fica salva no navegador.
//   TruCRT.level(2)  forte   TruCRT.level(1)  leve   TruCRT.level(0)  desligado
//   TruCRT.toggle()  liga/desliga   TruCRT.osd(false)  esconde o "● REC" e o relógio
// Atalho: Ctrl+Shift+C alterna  forte -> leve -> desligado.
// No celular o padrão é o leve (o forte pesa mais). Carregar depois dos outros scripts.
// ============================================================================
(function () {
  var KEY = 'trutec-crt-level', OSD_KEY = 'trutec-crt-osd';
  var root = document.documentElement;
  var clockEl = null, clockTimer = 0, lvl = 2;

  function readLevel() {
    try {
      var v = localStorage.getItem(KEY);
      if (v === '0' || v === '1' || v === '2') return +v;
    } catch (e) {}
    return window.matchMedia && matchMedia('(pointer: coarse)').matches ? 1 : 2;
  }
  function osdWanted() { try { return localStorage.getItem(OSD_KEY) !== '0'; } catch (e) { return true; } }

  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function tick() {
    if (!clockEl) return;
    var d = new Date();
    clockEl.textContent = pad(d.getDate()) + '.' + pad(d.getMonth() + 1) + '.' + d.getFullYear() + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
  }
  function syncClock() {
    clearInterval(clockTimer); clockTimer = 0;
    if (lvl > 0 && root.classList.contains('crt-osd-on') && !document.hidden) { tick(); clockTimer = setInterval(tick, 1000); }
  }

  function apply() {
    root.classList.toggle('crt-on', lvl > 0);
    root.classList.toggle('crt-lite', lvl === 1);
    syncClock();
  }
  function level(n) {
    lvl = n === 1 ? 1 : n ? 2 : 0;
    try { localStorage.setItem(KEY, String(lvl)); } catch (e) {}
    apply();
    return lvl;
  }
  function osd(on) {
    root.classList.toggle('crt-osd-on', !!on);
    try { localStorage.setItem(OSD_KEY, on ? '1' : '0'); } catch (e) {}
    syncClock();
  }

  // granulado: ruído colorido (RGB aleatório) numa telha pequena que se repete
  function noiseURL() {
    try {
      var c = document.createElement('canvas'); c.width = c.height = 160;
      var x = c.getContext('2d'), im = x.createImageData(160, 160), d = im.data, i;
      for (i = 0; i < d.length; i += 4) {
        var g = Math.random() * 255 | 0;
        d[i] = (g * .6 + Math.random() * 100) | 0; d[i + 1] = (g * .6 + Math.random() * 100) | 0; d[i + 2] = (g * .6 + Math.random() * 100) | 0; d[i + 3] = 255;
      }
      x.putImageData(im, 0, 0);
      return 'url(' + c.toDataURL('image/png') + ')';
    } catch (e) { return 'none'; }
  }

  function build() {
    if (document.getElementById('crt-overlay')) return;
    var o = document.createElement('div');
    o.id = 'crt-overlay';
    o.setAttribute('aria-hidden', 'true');
    o.innerHTML =
      '<div class="crt-grade"></div><div class="crt-bloom"></div><div class="crt-tint"></div><div class="crt-scan"></div>' +
      '<div class="crt-grainbox"><div class="crt-grain"></div></div><div class="crt-glare"></div>' +
      '<div class="crt-track"></div><div class="crt-head"></div><div class="crt-roll"></div><div class="crt-vig"></div>' +
      '<div class="crt-flick"></div><div class="crt-osd"><b>REC</b><span class="crt-clock"></span></div>';
    o.style.setProperty('--crt-noise', noiseURL());
    document.body.appendChild(o);
    clockEl = o.querySelector('.crt-clock');
    syncClock();
  }

  lvl = readLevel();
  root.classList.toggle('crt-osd-on', osdWanted());
  apply();                                   // liga logo, antes da página terminar de carregar
  window.TruCRT = {
    level: level, osd: osd,
    set: function (on) { return level(on ? 2 : 0); },
    toggle: function () { return level(lvl ? 0 : 2); },
    on: function () { return lvl > 0; }
  };
  document.addEventListener('keydown', function (e) {
    if (e.ctrlKey && e.shiftKey && (e.key === 'C' || e.key === 'c')) { e.preventDefault(); level(lvl === 2 ? 1 : lvl === 1 ? 0 : 2); }
  });
  document.addEventListener('visibilitychange', syncClock);
  if (document.body) build(); else document.addEventListener('DOMContentLoaded', build);
})();
