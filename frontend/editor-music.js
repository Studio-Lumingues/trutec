// ============================================================================
// MÚSICA DO EDITOR DE AVATAR
// Toca assets/vaporwave-music.mp3 em loop enquanto a tela "Editar avatar"
// estiver aberta (entrou = fade in; saiu = fade out) e mostra o card discreto
// com os créditos (#editor-music-card). O volume segue o controle "Música" das
// Configurações (e o mudo). Se a rádio da sala estiver tocando, fica quieto.
// As 4 barrinhas do card acompanham a música de verdade (Web Audio / analisador
// de frequência: graves -> agudos). Se o navegador não suportar, continuam com a
// animação de CSS de sempre.
// (A trilha do lobby já para sozinha nessa tela: ver wantedTrack() no audio.js.)
// ============================================================================
(function () {
  var screen = document.getElementById('screen-character-editor');
  var card = document.getElementById('editor-music-card');
  if (!screen) return;

  var SRC = 'assets/vaporwave-music.mp3';
  var BOOST = 0.65;        // 1 = igual ao volume "Música"; menor = mais baixo
  var FADE_MS = 900;
  var EDGES = [40, 130, 450, 2200, 9000];   // Hz: limites das 4 barras (grave -> agudo)
  var MIN_H = 18;          // altura mínima das barras (%)

  var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var audio = null, fade = 0, active = false;
  var actx = null, analyser = null, gainNode = null, data = null, bins = null;
  var bars = card ? card.querySelectorAll('.emc-eq i') : [];
  var peaks = [1, 1, 1, 1], cur = [MIN_H, MIN_H, MIN_H, MIN_H], raf = 0;

  // ---- volume: pelo GainNode quando há analisador, senão direto no <audio> ----
  function getVol() { return gainNode ? gainNode.gain.value : audio.volume; }
  function setVol(v) {
    v = Math.max(0, Math.min(1, v));
    try { if (gainNode) gainNode.gain.value = v; else audio.volume = v; } catch (e) {}
  }

  function target() {
    if (!window.GameAudio) return 0.6 * BOOST;
    if (GameAudio.isMuted && GameAudio.isMuted()) return 0;
    return Math.min(1, GameAudio.getMusicLevel() * BOOST);
  }
  function radioOn() {
    var c = document.querySelector('.radio-card');
    return !!(c && !c.hidden);
  }

  // ---- analisador (barrinhas sincronizadas) ----
  function setupAnalyser() {
    if (actx || !audio) return;
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      actx = new AC();
      var src = actx.createMediaElementSource(audio);
      analyser = actx.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.5;
      gainNode = actx.createGain();
      gainNode.gain.value = audio.volume;
      audio.volume = 1;                       // o volume passa a ser do GainNode
      src.connect(analyser);
      analyser.connect(gainNode);
      gainNode.connect(actx.destination);
      data = new Uint8Array(analyser.frequencyBinCount);
      var hz = actx.sampleRate / analyser.fftSize;
      bins = EDGES.map(function (f) { return Math.max(1, Math.round(f / hz)); });
    } catch (e) {
      actx = analyser = gainNode = null;      // sem Web Audio: segue com o CSS
    }
  }
  function resumeCtx() {
    if (actx && actx.state === 'suspended') actx.resume().catch(function () {});
  }
  document.addEventListener('pointerdown', resumeCtx, { passive: true });
  document.addEventListener('keydown', resumeCtx);

  function paint() {
    raf = 0;
    if (!analyser || !active) return;
    if (document.hidden) { raf = requestAnimationFrame(paint); return; }
    analyser.getByteFrequencyData(data);
    for (var b = 0; b < bars.length && b < 4; b++) {
      var lo = bins[b], hi = Math.max(lo + 1, bins[b + 1]), sum = 0;
      for (var i = lo; i < hi; i++) sum += data[i];
      var avg = sum / (hi - lo);
      peaks[b] = Math.max(avg, peaks[b] * 0.99, 40);          // auto-ganho por faixa
      var lv = Math.pow(avg / peaks[b], 2);                    // realça as batidas
      var h = MIN_H + (100 - MIN_H) * lv;
      cur[b] += (h - cur[b]) * (h > cur[b] ? 0.7 : 0.18);      // sobe rápido, desce suave
      bars[b].style.height = cur[b].toFixed(1) + '%';
    }
    raf = requestAnimationFrame(paint);
  }
  function startViz() {
    if (!analyser || reduced || !card) return;
    card.classList.add('live');
    if (!raf) raf = requestAnimationFrame(paint);
  }
  function stopViz() {
    cancelAnimationFrame(raf); raf = 0;
    if (card) card.classList.remove('live');
    for (var i = 0; i < bars.length; i++) bars[i].style.height = '';
    cur = [MIN_H, MIN_H, MIN_H, MIN_H];
  }

  function ramp(to, done) {
    cancelAnimationFrame(fade);
    var from = getVol(), t0 = performance.now();
    (function step(now) {
      var k = Math.min(1, (now - t0) / FADE_MS);
      setVol(from + (to - from) * k);
      if (k < 1) fade = requestAnimationFrame(step); else if (done) done();
    })(t0);
  }

  function enter() {
    if (active) return;
    active = true;
    if (card) card.classList.add('show');
    if (radioOn()) return;
    if (!audio) {
      audio = new Audio(SRC);
      audio.loop = true;
      audio.preload = 'auto';
      setupAnalyser();
    }
    resumeCtx();
    setVol(0);
    var p = audio.play();
    if (p && p.catch) p.catch(function () {});
    ramp(target());
    startViz();
  }

  function leave() {
    if (!active) return;
    active = false;
    if (card) card.classList.remove('show');
    if (!audio) return;
    ramp(0, function () {
      if (active) return;
      audio.pause();
      stopViz();
    });
  }

  // mexeu no volume/mudo nas Configurações? acompanha
  function hookAudio() {
    if (!window.GameAudio || GameAudio.__edMusicHooked) return;
    GameAudio.__edMusicHooked = true;
    ['setMusicLevel', 'toggleMute'].forEach(function (fn) {
      var orig = GameAudio[fn];
      if (typeof orig !== 'function') return;
      GameAudio[fn] = function () {
        var r = orig.apply(this, arguments);
        if (active && audio) { cancelAnimationFrame(fade); setVol(target()); }
        return r;
      };
    });
  }
  hookAudio();

  new MutationObserver(function () {
    if (screen.classList.contains('active')) enter(); else leave();
  }).observe(screen, { attributes: true, attributeFilter: ['class'] });

  if (screen.classList.contains('active')) enter();
})();
