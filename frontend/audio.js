// ============================================================================
// ÁUDIO (música do lobby + falas de truco/seis/nove/doze)
// - A música toca só nas telas de lobby (início, editor de personagem aberto
//   pelo lobby, sala de espera e fase de desenhar). Para de vez quando a mesa abre.
// - Continua tocando mesmo com a aba em segundo plano (só o botão de mudo pausa).
// - Cliques em botões e sons de carta (bater na mesa / distribuir) são sintetizados aqui, sem arquivos.
// - As falas tocam quando alguém pede (ou aumenta pra) truco, seis, nove, doze.
// - O sfx01 toca quando a partida começa (início da transição pra mesa).
// - Navegadores bloqueiam áudio antes do primeiro clique/toque; se a música
//   for barrada, ela começa sozinha na primeira interação da pessoa.
// - O volume da música e dos efeitos é ajustado em Configurações (não há botão de mudo).
// ============================================================================
(function () {
  // Volume máximo (100% no controle). A música começa em 20% => 0.04. O jogador ajusta em Configurações.
  var MUSIC_MAX = 0.2;
  var SFX_BASE = 0.5;
  var DEFAULT_MUSIC_LEVEL = 0.2; // 0..1 (começa em 20%)
  var DEFAULT_SFX_LEVEL = 1;     // 0..1
  var LOBBY_SCREENS = ['screen-lobby', 'screen-waiting', 'screen-character-editor'];

  // Não existe mais botão de mudo na tela: o volume se ajusta em Configurações.
  // Se alguém tinha deixado no mudo antes, limpamos pra não ficar sem som e sem botão pra religar.
  var muted = false;
  try { localStorage.removeItem('trutec-muted'); } catch (e) {}

  function readLevel(key, def) {
    try {
      var v = parseFloat(localStorage.getItem(key));
      if (isFinite(v)) return Math.min(1, Math.max(0, v));
    } catch (e) {}
    return def;
  }
  var musicLevel = readLevel('trutec-vol-music', DEFAULT_MUSIC_LEVEL);
  var sfxLevel = readLevel('trutec-vol-sfx', DEFAULT_SFX_LEVEL);

  // Música: Web Audio API (o <audio loop> do navegador deixa um vazinho na
  // volta do loop; aqui o fim emenda direto no começo)
  var ctx = null, gain = null, buffer = null, source = null, loading = false;
  var TAIL_TRIM = 0.015; // corta ~15 ms de silêncio no fim do arquivo

  function ensureCtx() {
    if (ctx) return true;
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    ctx = new AC();
    gain = ctx.createGain();
    gain.gain.value = musicLevel * MUSIC_MAX;
    gain.connect(ctx.destination);
    return true;
  }

  function loadMusic() {
    if (loading || buffer || !ensureCtx()) return;
    loading = true;
    fetch('assets/song.wav')
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.arrayBuffer();
      })
      .then(function (data) {
        return new Promise(function (ok, fail) { ctx.decodeAudioData(data, ok, fail); });
      })
      .then(function (buf) {
        buffer = buf;
        loading = false;
        sync();
      })
      .catch(function (err) {
        loading = false;
        console.warn('[áudio] não consegui carregar assets/song.wav — confira se o arquivo está na pasta assets/ do site publicado.', err);
      });
  }

  var calls = {};
  ['truco', 'seis', 'nove', 'doze', 'sfx01'].forEach(function (name) { // sfx01 = som de início de partida
    var a = new Audio('assets/' + name + '.wav');
    a.preload = 'auto';
    a.volume = sfxLevel;
    calls[name] = a;
  });

  // Volume relativo de cada arquivo (multiplica o volume geral de efeitos).
  // O som de início de partida é bem baixinho de propósito.
  var CALL_GAIN = { sfx01: 0.12 };
  function callVol(name) { return Math.min(1, sfxLevel * (CALL_GAIN[name] === undefined ? 1 : CALL_GAIN[name])); }
  Object.keys(calls).forEach(function (k) { calls[k].volume = callVol(k); });

  var currentScreen = 'screen-lobby';
  var matchStarted = false;

  function wantsMusic() {
    if (muted || matchStarted) return false;
    return LOBBY_SCREENS.indexOf(currentScreen) !== -1;
  }

  // ---- Efeitos sonoros gerados por código (clique e carta) ----
  // Não usam arquivo: são sintetizados na hora pela Web Audio API.
  var SFX_VOLUME = SFX_BASE * sfxLevel;
  var noiseBuf = null;

  function sfxReady() {
    // volume 0 => não sintetiza (rampas exponenciais não aceitam alvo 0)
    if (muted || SFX_VOLUME <= 0.001 || !ensureCtx()) return false;
    if (ctx.state === 'suspended') ctx.resume().catch(function () {});
    return true;
  }

  function getNoise() {
    if (noiseBuf) return noiseBuf;
    var len = Math.floor(ctx.sampleRate * 0.6);
    noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    var d = noiseBuf.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return noiseBuf;
  }

  // clique: "tick" curtinho
  function sfxClick() {
    if (!sfxReady()) return;
    var t = ctx.currentTime;
    var osc = ctx.createOscillator();
    var g = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(1400, t);
    osc.frequency.exponentialRampToValueAtTime(600, t + 0.04);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.45 * SFX_VOLUME, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
    osc.connect(g); g.connect(ctx.destination);
    osc.start(t); osc.stop(t + 0.08);
  }

  // Uma "pancadinha" de ruído filtrado (é a base dos sons de papel/carta)
  function noiseBurst(t, o) {
    var src = ctx.createBufferSource();
    src.buffer = getNoise();
    var f = ctx.createBiquadFilter();
    f.type = o.type;
    f.Q.value = o.q || 0.7;
    f.frequency.setValueAtTime(o.f, t);
    if (o.f2) f.frequency.exponentialRampToValueAtTime(o.f2, t + o.dur);
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(o.peak * SFX_VOLUME, t + (o.attack || 0.002));
    g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
    src.connect(f); f.connect(g); g.connect(ctx.destination);
    src.start(t, Math.random() * 0.4);
    src.stop(t + o.dur + 0.02);
  }

  // carta batendo na mesa: estalo seco de papel + "toc" grave no feltro.
  // Cada chamada varia um pouquinho (tom/timbre), pra não soar sempre igual.
  function sfxCardPlay(delaySec) {
    if (!sfxReady()) return;
    var t = ctx.currentTime + (delaySec || 0);
    var j = 0.9 + Math.random() * 0.2;
    noiseBurst(t, { type: 'highpass',  f: 2600 * j, dur: 0.04, peak: 0.9, attack: 0.001 });               // estalo
    noiseBurst(t, { type: 'bandpass',  f: 1100 * j, q: 0.9, dur: 0.09, peak: 0.7, attack: 0.002 });        // corpo do papel
    var osc = ctx.createOscillator();                                                                     // toc no feltro
    var g = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(170 * j, t);
    osc.frequency.exponentialRampToValueAtTime(70, t + 0.07);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.5 * SFX_VOLUME, t + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.1);
    osc.connect(g); g.connect(ctx.destination);
    osc.start(t); osc.stop(t + 0.12);
  }

  // carta sendo distribuída/puxada: "fri-frit" curto e crocante (papel deslizando
  // com micro-estalos, como a borda de um baralho)
  function sfxCardDeal(delaySec, variation) {
    if (!sfxReady()) return;
    var t = ctx.currentTime + (delaySec || 0);
    var j = 0.92 + Math.random() * 0.16 + (variation || 0) * 0.04;
    noiseBurst(t, { type: 'bandpass', f: 1600 * j, f2: 5200 * j, q: 1.2, dur: 0.09, peak: 0.75, attack: 0.004 });
    for (var k = 0; k < 3; k++) {
      noiseBurst(t + k * 0.014, { type: 'highpass', f: 3200 * j, dur: 0.02, peak: 0.5 - k * 0.12, attack: 0.001 });
    }
  }

  // clique em qualquer botão da página
  document.addEventListener('click', function (e) {
    var b = e.target && e.target.closest ? e.target.closest('button') : null;
    if (!b || b.disabled) return;
    sfxClick();
  }, true);

  function startMusic() {
    if (!ensureCtx()) return;
    if (ctx.state === 'suspended') ctx.resume().catch(function () { /* espera a 1ª interação */ });
    if (source) return;
    if (!buffer) { loadMusic(); return; }
    source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    source.loopStart = 0;
    source.loopEnd = Math.max(0.1, buffer.duration - TAIL_TRIM);
    source.connect(gain);
    source.start(0);
  }

  function stopMusic() {
    if (!source) return;
    try { source.stop(); } catch (e) {}
    source.disconnect();
    source = null;
  }

  function sync() {
    if (wantsMusic()) startMusic(); else stopMusic();
  }

  // Autoplay: tenta de novo na primeira interação
  function unlock() {
    if (wantsMusic()) startMusic();
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
  Object.keys(calls).forEach(function (k) { watch(calls[k], k + '.wav'); });

  // ---- API usada pelo client.js ----
  window.GameAudio = {
    onScreen: function (id) { currentScreen = id; sync(); },
    setMatchStarted: function (v) { matchStarted = !!v; sync(); },
    playCall: function (level) {
      if (muted || sfxLevel <= 0) return;
      var a = calls[level];
      if (!a) return;
      try { a.currentTime = 0; } catch (e) {}
      var p = a.play();
      if (p && p.catch) p.catch(function () {});
    },
    // som de início de partida (assets/sfx01.wav): toca quando a partida começa
    // Só toca quando a tela escura da transição (#game-intro) deixa de cobrir
    // a mesa — não durante a transição.
    playStart: function () {
      var intro = document.getElementById('game-intro');
      if (!intro) { GameAudio.playCall('sfx01'); return; }
      function covering() {
        var cs = getComputedStyle(intro);
        return cs.display !== 'none' && cs.visibility !== 'hidden' && parseFloat(cs.opacity) > 0.05;
      }
      var t0 = Date.now(), seen = false, done = false;
      var iv = setInterval(function () {
        if (done) return;
        var now = covering();
        if (now) seen = true;
        var elapsed = Date.now() - t0;
        // toca quando a tela escura já apareceu e sumiu; se ela nunca apareceu
        // (1,5 s de tolerância) ou demorou demais (20 s), toca mesmo assim
        if ((seen && !now) || (!seen && elapsed > 1500) || elapsed > 20000) {
          done = true; clearInterval(iv);
          GameAudio.playCall('sfx01');
        }
      }, 50);
    },
    toggleMute: function () {
      muted = !muted;
      try { localStorage.setItem('trutec-muted', muted ? '1' : '0'); } catch (e) {}
      if (muted) { Object.keys(calls).forEach(function (k) { calls[k].pause(); }); }
      sync();
      return muted;
    },
    getMusicLevel: function () { return musicLevel; },
    getSfxLevel: function () { return sfxLevel; },
    setMusicLevel: function (v) {
      musicLevel = Math.min(1, Math.max(0, +v || 0));
      try { localStorage.setItem('trutec-vol-music', String(musicLevel)); } catch (e) {}
      if (gain) gain.gain.value = musicLevel * MUSIC_MAX;
    },
    setSfxLevel: function (v) {
      sfxLevel = Math.min(1, Math.max(0, +v || 0));
      SFX_VOLUME = SFX_BASE * sfxLevel;
      try { localStorage.setItem('trutec-vol-sfx', String(sfxLevel)); } catch (e) {}
      Object.keys(calls).forEach(function (k) { calls[k].volume = callVol(k); });
    },
    click: sfxClick,
    cardPlay: sfxCardPlay,
    cardDeal: sfxCardDeal,
    isMuted: function () { return muted; }
  };

  // Tenta tocar a música já ao abrir a página (se o navegador barrar, o
  // primeiro clique/toque acima resolve)
  sync();
})();
