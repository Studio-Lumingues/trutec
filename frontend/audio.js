// ============================================================================
// ÁUDIO (música do lobby + falas de truco/seis/nove/doze)
// - A música toca só nas telas de lobby (início, editor de personagem aberto
//   pelo lobby e sala de espera). Some com fade quando a partida começa.
// - As falas tocam quando alguém pede (ou aumenta pra) truco, seis, nove, doze.
// - Navegadores bloqueiam áudio antes do primeiro clique/toque; se a música
//   for barrada, ela começa sozinha na primeira interação da pessoa.
// - Botão de mudo (canto superior direito) guarda a escolha no localStorage.
// ============================================================================
(function () {
  var MUSIC_VOLUME = 0.35;
  var FADE_MS = 600;
  var LOBBY_SCREENS = ['screen-lobby', 'screen-waiting', 'screen-character-editor'];

  var muted = false;
  try { muted = localStorage.getItem('trutec-muted') === '1'; } catch (e) {}

  var music = new Audio('assets/song.wav');
  music.loop = true;
  music.volume = MUSIC_VOLUME;
  music.preload = 'auto';

  var calls = {};
  ['truco', 'seis', 'nove', 'doze'].forEach(function (name) {
    var a = new Audio('assets/' + name + '.wav');
    a.preload = 'auto';
    calls[name] = a;
  });

  var currentScreen = 'screen-lobby';
  var matchStarted = false;
  var fadeTimer = null;

  function wantsMusic() {
    if (muted || matchStarted) return false;
    return LOBBY_SCREENS.indexOf(currentScreen) !== -1;
  }

  function fadeTo(target, done) {
    clearInterval(fadeTimer);
    var steps = 12, i = 0, start = music.volume;
    fadeTimer = setInterval(function () {
      i++;
      music.volume = Math.max(0, Math.min(1, start + (target - start) * (i / steps)));
      if (i >= steps) { clearInterval(fadeTimer); if (done) done(); }
    }, FADE_MS / steps);
  }

  function startMusic() {
    var p = music.play();
    if (p && p.catch) p.catch(function () { /* bloqueado: espera a 1ª interação */ });
    fadeTo(MUSIC_VOLUME);
  }

  function stopMusic() {
    if (music.paused) return;
    fadeTo(0, function () { music.pause(); });
  }

  function sync() {
    if (wantsMusic()) startMusic(); else stopMusic();
  }

  // Autoplay: tenta de novo na primeira interação
  function unlock() {
    if (wantsMusic() && music.paused) startMusic();
  }
  ['pointerdown', 'keydown', 'touchstart'].forEach(function (ev) {
    document.addEventListener(ev, unlock, { passive: true });
  });

  // Pausa se a aba ficar em segundo plano
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) music.pause(); else sync();
  });

  // ---- API usada pelo client.js ----
  window.GameAudio = {
    onScreen: function (id) { currentScreen = id; sync(); },
    setMatchStarted: function (v) { matchStarted = !!v; sync(); },
    playCall: function (level) {
      if (muted) return;
      var a = calls[level];
      if (!a) return;
      try { a.currentTime = 0; } catch (e) {}
      var p = a.play();
      if (p && p.catch) p.catch(function () {});
    },
    toggleMute: function () {
      muted = !muted;
      try { localStorage.setItem('trutec-muted', muted ? '1' : '0'); } catch (e) {}
      if (muted) { Object.keys(calls).forEach(function (k) { calls[k].pause(); }); }
      sync();
      return muted;
    },
    isMuted: function () { return muted; }
  };

  // ---- Botão de mudo ----
  function buildButton() {
    var btn = document.createElement('button');
    btn.id = 'btn-mute';
    btn.type = 'button';
    btn.className = 'mute-btn';
    function paint() {
      btn.textContent = muted ? '🔇' : '🔊';
      btn.title = muted ? 'Ativar som' : 'Silenciar';
      btn.setAttribute('aria-label', btn.title);
    }
    btn.addEventListener('click', function () { GameAudio.toggleMute(); paint(); });
    paint();
    document.body.appendChild(btn);
  }
  if (document.body) buildButton();
  else document.addEventListener('DOMContentLoaded', buildButton);
})();
