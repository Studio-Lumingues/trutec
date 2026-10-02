// ============================================================================
// EXPLOSÃOZINHA DE FUMAÇA (quando um jogador entra na sala)
// TruSmoke.puff(elemento): solta uma nuvem de fumaça em volta do avatar do
// elemento (clarão rápido + bolinhas de fumaça que sobem e somem).
// Desenha num <canvas> próprio por cima de tudo (pointer-events: none), que é
// criado quando precisa e removido quando a animação termina. A posição segue o
// avatar enquanto o card da sala cresce/encolhe.
// Ajustes: DURATION (ms), PARTICLES (quantidade), SPREAD (alcance).
// ============================================================================
(function () {
  var DURATION  = 950;   // ms de vida da nuvem
  var PARTICLES = 16;    // bolinhas de fumaça por explosão
  var SPREAD    = 0.9;   // alcance relativo ao tamanho do avatar

  var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var canvas = null, ctx = null, dpr = 1, puffs = [], raf = 0;

  function ensure() {
    if (canvas) return;
    canvas = document.createElement('canvas');
    canvas.setAttribute('aria-hidden', 'true');
    canvas.style.cssText = 'position:fixed;left:0;top:0;width:100vw;height:100vh;pointer-events:none;z-index:9500';
    ctx = canvas.getContext('2d');
    document.body.appendChild(canvas);
    fit();
    window.addEventListener('resize', fit);
  }
  function fit() {
    if (!canvas) return;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.round(window.innerWidth * dpr));
    canvas.height = Math.max(1, Math.round(window.innerHeight * dpr));
  }
  function release() {
    if (!canvas) return;
    window.removeEventListener('resize', fit);
    if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
    canvas = ctx = null;
  }

  function center(p) {
    var el = p.el && p.el.isConnected ? (p.el.querySelector('.wp-avatar') || p.el) : null;
    if (el) {
      var r = el.getBoundingClientRect();
      if (r.width > 0) { p.x = r.left + r.width / 2; p.y = r.top + r.height / 2; p.size = r.width; }
    }
  }

  function puff(el) {
    if (reduced || !el) return;
    ensure();
    var p = { el: el, x: 0, y: 0, size: 60, t0: performance.now(), parts: [] };
    center(p);
    for (var i = 0; i < PARTICLES; i++) {
      var a = Math.random() * Math.PI * 2;
      p.parts.push({
        a: a,
        speed: (0.35 + Math.random() * 0.65) * SPREAD,    // em "tamanhos de avatar" por segundo
        rise: 0.15 + Math.random() * 0.35,                 // a fumaça tende a subir
        r0: 0.12 + Math.random() * 0.12,
        grow: 0.35 + Math.random() * 0.4,
        tone: 205 + Math.floor(Math.random() * 45),        // cinza claro → quase branco
        delay: Math.random() * 0.12
      });
    }
    puffs.push(p);
    if (!raf) raf = requestAnimationFrame(tick);
  }

  function tick(now) {
    raf = 0;
    if (!canvas) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    puffs = puffs.filter(function (p) { return now - p.t0 < DURATION; });
    puffs.forEach(function (p) {
      center(p);
      var k = (now - p.t0) / DURATION;          // 0..1
      var s = p.size;
      // clarão rápido no começo
      if (k < 0.2) {
        var fk = k / 0.2, fr = s * (0.25 + fk * 0.5);
        var fg = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, fr);
        fg.addColorStop(0, 'rgba(255,240,200,' + (0.85 * (1 - fk)) + ')');
        fg.addColorStop(0.5, 'rgba(255,170,70,' + (0.45 * (1 - fk)) + ')');
        fg.addColorStop(1, 'rgba(255,120,30,0)');
        ctx.fillStyle = fg;
        ctx.beginPath(); ctx.arc(p.x, p.y, fr, 0, Math.PI * 2); ctx.fill();
      }
      // fumaça
      p.parts.forEach(function (q) {
        var kk = Math.max(0, (k - q.delay) / (1 - q.delay));
        if (kk <= 0) return;
        var e = 1 - Math.pow(1 - kk, 2.2);      // sai rápido e desacelera
        var dist = q.speed * s * e;
        var x = p.x + Math.cos(q.a) * dist;
        var y = p.y + Math.sin(q.a) * dist - q.rise * s * kk;
        var r = s * (q.r0 + q.grow * e);
        var alpha = 0.7 * Math.pow(1 - kk, 1.4);
        var g = ctx.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, 'rgba(' + q.tone + ',' + q.tone + ',' + q.tone + ',' + alpha + ')');
        g.addColorStop(0.65, 'rgba(' + (q.tone - 25) + ',' + (q.tone - 25) + ',' + (q.tone - 25) + ',' + alpha * 0.55 + ')');
        g.addColorStop(1, 'rgba(' + (q.tone - 40) + ',' + (q.tone - 40) + ',' + (q.tone - 40) + ',0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
      });
    });
    if (puffs.length) raf = requestAnimationFrame(tick);
    else release();
  }

  window.TruSmoke = { puff: puff };
})();
