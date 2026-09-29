// ============================================================================
// ÁUDIO (música do lobby + falas de truco/seis/nove/doze)
// - A música toca só nas telas de lobby (início, editor de personagem aberto
//   pelo lobby, sala de espera e fase de desenhar). Para de vez quando a mesa abre.
// - Continua tocando mesmo com a aba em segundo plano (só o botão de mudo pausa).
// - As falas tocam quando alguém pede (ou aumenta pra) truco, seis, nove, doze.
// - Navegadores bloqueiam áudio antes do primeiro clique/toque; se a música
//   for barrada, ela começa sozinha na primeira interação da pessoa.
// - Botão de mudo (canto superior direito) guarda a escolha no localStorage.
// ============================================================================
(function () {
  var MUSIC_VOLUME = 0.2;
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

  function wantsMusic() {
    if (muted || matchStarted) return false;
    return LOBBY_SCREENS.indexOf(currentScreen) !== -1;
  }

  function startMusic() {
    music.volume = MUSIC_VOLUME;
    var p = music.play();
    if (p && p.catch) p.catch(function () { /* bloqueado: espera a 1ª interação */ });
  }

  function stopMusic() {
    if (!music.paused) music.pause();
  }

  function sync() {
    if (wantsMusic()) startMusic(); else stopMusic();
  }

  // Autoplay: tenta de novo na primeira interação
  function unlock() {
    if (wantsMusic() && music.paused) startMusic();
  }
  // só estes eventos contam como "interação" para liberar áudio nos navegadores
  ['click', 'touchend', 'pointerup', 'keydown'].forEach(function (ev) {
    document.addEventListener(ev, unlock, { passive: true });
  });

  // Avisa no console se algum arquivo de áudio não carregar (404, nome errado…)
  function watch(a, name) {
    a.addEventListener('error', function () {
      console.warn('[áudio] não consegui carregar assets/' + name + ' — confira se o arquivo está na pasta assets/ do site publicado.');
    });
  }
  watch(music, 'song.wav');
  Object.keys(calls).forEach(function (k) { watch(calls[k], k + '.wav'); });

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

  // Tenta tocar a música já ao abrir a página (se o navegador barrar, o
  // primeiro clique/toque acima resolve)
  sync();
})();
