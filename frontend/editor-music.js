// ============================================================================
// MÚSICA DO EDITOR DE AVATAR
// Toca assets/vaporwave-music.mp3 em loop enquanto a tela "Editar avatar"
// estiver aberta (entrou = fade in; saiu = fade out) e mostra o card discreto
// com os créditos (#editor-music-card). O volume segue o controle "Música" das
// Configurações (e o mudo). Se a rádio da sala estiver tocando, fica quieto.
// (A trilha do lobby já para sozinha nessa tela: ver wantedTrack() no audio.js.)
// ============================================================================
(function () {
  var screen = document.getElementById('screen-character-editor');
  var card = document.getElementById('editor-music-card');
  if (!screen) return;

  var SRC = 'assets/vaporwave-music.mp3';
  var BOOST = 1;           // 1 = igual ao volume "Música"; ajuste se ficar alto/baixo
  var FADE_MS = 900;

  var audio = null, fade = 0, active = false;

  function target() {
    if (!window.GameAudio) return 0.6;
    if (GameAudio.isMuted && GameAudio.isMuted()) return 0;
    return Math.min(1, GameAudio.getMusicLevel() * BOOST);
  }
  function radioOn() {
    var c = document.querySelector('.radio-card');
    return !!(c && !c.hidden);
  }

  function ramp(to, done) {
    cancelAnimationFrame(fade);
    var from = audio.volume, t0 = performance.now();
    (function step(now) {
      var k = Math.min(1, (now - t0) / FADE_MS);
      try { audio.volume = Math.max(0, Math.min(1, from + (to - from) * k)); } catch (e) {}
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
    }
    audio.volume = 0;
    var p = audio.play();
    if (p && p.catch) p.catch(function () {});
    ramp(target());
  }

  function leave() {
    if (!active) return;
    active = false;
    if (card) card.classList.remove('show');
    if (!audio) return;
    ramp(0, function () {
      if (active) return;
      audio.pause();
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
        if (active && audio) { cancelAnimationFrame(fade); try { audio.volume = target(); } catch (e) {} }
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
