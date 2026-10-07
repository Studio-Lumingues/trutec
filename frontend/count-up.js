// ============================================================================
// CONTADOR QUE SOBE COM "TIQUES"
// TruCount.run(el, valor, opções): o número sobe do que está na tela até o valor,
// rápido no começo e desacelerando, com um tique a cada mudança (o tom sobe) e um
// "ding" no fim. Se o valor for MENOR que o atual, troca direto (sem som).
// TruCount.set(el, valor, opções): troca direto, sem animar.
// Opções: format(v) -> texto | parse(texto) -> número | max (ms) | ding (false desliga)
// Respeita o volume de efeitos e o mudo do GameAudio e o "reduzir movimento".
// ============================================================================
(function () {
  var MIN = 250, MAX = 1200, PER_STEP = 130, TICK_GAP = 45;
  var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var actx = null;

  function ctx() {
    if (actx) return actx;
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    try { actx = new AC(); } catch (e) { return null; }
    return actx;
  }
  function vol() {
    if (!window.GameAudio) return 0.6;
    if (GameAudio.isMuted && GameAudio.isMuted()) return 0;
    return GameAudio.getSfxLevel ? GameAudio.getSfxLevel() : 0.6;
  }
  function blip(freq, dur, peak, type) {
    var v = vol(); if (!v) return;
    var c = ctx(); if (!c) return;
    if (c.state === 'suspended') c.resume().catch(function () {});
    var t = c.currentTime, o = c.createOscillator(), g = c.createGain();
    o.type = type || 'triangle';
    o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak * v, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(c.destination);
    o.start(t); o.stop(t + dur + 0.02);
  }
  function tick(k) { blip(480 + k * 520, 0.07, 0.12); }
  function ding() { blip(988, 0.18, 0.14, 'sine'); setTimeout(function () { blip(1319, 0.28, 0.12, 'sine'); }, 90); }

  function defFmt(v) { return String(Math.round(v)); }

  function put(el, v, f) { el._cv = v; el._ct = f(v); el.textContent = el._ct; }
  function stop(el) { if (el._cnt) cancelAnimationFrame(el._cnt); el._cnt = 0; }

  function set(el, to, o) {
    if (!el) return;
    stop(el); el._to = to;
    put(el, to, (o && o.format) || defFmt);
  }

  function run(el, to, o) {
    if (!el || typeof to !== 'number' || !isFinite(to)) return;
    o = o || {};
    var f = o.format || defFmt;
    if (el._cnt && el._to === to) return;            // já indo pra esse valor (render repetido)
    stop(el);

    // valor atual: o que a animação guardou; se alguém mexeu no texto por fora, lê do texto
    var from;
    if (el._cv !== undefined && el.textContent === el._ct) from = el._cv;
    else {
      from = o.parse ? o.parse(el.textContent) : parseFloat(el.textContent);
      if (!isFinite(from)) from = 0;
    }
    el._to = to;
    if (reduced || to <= from) { put(el, to, f); return; }

    var delta = to - from;
    var dur = Math.max(MIN, Math.min(o.max || MAX, delta * PER_STEP));
    var t0 = performance.now(), lastTxt = f(from), lastTick = 0;

    (function step(now) {
      var k = Math.min(1, (now - t0) / dur);
      var e = 1 - Math.pow(1 - k, 3);                 // começa rápido, desacelera
      var v = k >= 1 ? to : from + delta * e;
      var txt = f(v);
      if (txt !== lastTxt) {
        lastTxt = txt;
        put(el, v, f);
        if (now - lastTick >= TICK_GAP) { lastTick = now; tick(k); }
      }
      if (k < 1) el._cnt = requestAnimationFrame(step);
      else { el._cnt = 0; put(el, to, f); if (o.ding !== false) ding(); }
    })(t0);
  }

  // efeitos da loja: 'buy' (moedinha), 'sell' (moedinha descendo), 'roll' (embaralhando), 'deny' (não pode)
  function sfx(kind) {
    var seq, i;
    if (kind === 'buy') seq = [[880, 0], [1320, 70], [1760, 140]];
    else if (kind === 'sell') seq = [[1320, 0], [990, 80]];
    else if (kind === 'roll') { seq = []; for (i = 0; i < 6; i++) seq.push([380 + Math.random() * 500, i * 55]); }
    else if (kind === 'deny') { blip(150, 0.18, 0.16, 'sawtooth'); return; }
    else return;
    seq.forEach(function (n, k) {
      setTimeout(function () { blip(n[0], kind === 'roll' ? 0.05 : 0.12, 0.13, kind === 'roll' ? 'square' : 'triangle'); }, n[1]);
    });
  }

  window.TruCount = { run: run, set: set, sfx: sfx };
})();
