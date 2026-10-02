// ============================================================================
// ÁUDIO (músicas + falas de truco/seis/nove/doze)
// - assets/song.wav toca no lobby principal e na sala de espera.
// - A jungle acende uma luz colorida nos cantos da tela no ritmo da música
//   (bumbo = rosa embaixo, caixa/chimbal = roxo em cima).
// - assets/jungle.wav toca SÓ na tela de fazer o avatar (editor). Quando o
//   desenho termina (todo mundo pronto / a partida começa / a pessoa sai do
//   editor), ela some em fade out. Ao trocar de tela, uma faixa some enquanto
//   a outra entra. Na mesa do jogo não toca música.
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
  var SFX_BASE = 0.5;
  var DEFAULT_MUSIC_LEVEL = 0.2; // 0..1 (começa em 20%)
  var DEFAULT_SFX_LEVEL = 1;     // 0..1
  var FADE_IN = 0.3;   // s
  var FADE_OUT = 2;    // s

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
  // volta do loop; aqui o fim emenda direto no começo).
  // Duas faixas: "song" (lobby / sala de espera) e "jungle" (só no editor de
  // avatar). Cada uma tem seu fade; `max` compensa a diferença de volume
  // entre os arquivos (a jungle é bem mais baixa que a song).
  var tracks = {
    song:   { src: 'assets/song.wav',   max: 0.2, fadeOut: 1, buffer: null, source: null, fade: null, timer: null, loading: false, failed: false },
    jungle: { src: 'assets/jungle.wav', max: 1,   fadeOut: 2, buffer: null, source: null, fade: null, timer: null, loading: false, failed: false }
  };
  var ctx = null, gain = null, analyser = null;
  var TAIL_TRIM = 0.015; // corta ~15 ms de silêncio no fim do arquivo

  function ensureCtx() {
    if (ctx) return true;
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    ctx = new AC();
    gain = ctx.createGain();            // volume escolhido em Configurações
    gain.gain.value = musicLevel;
    gain.connect(ctx.destination);
    Object.keys(tracks).forEach(function (k) {
      tracks[k].fade = ctx.createGain(); // fade in/out de cada faixa
      tracks[k].fade.gain.value = 0.0001;
      tracks[k].fade.connect(gain);
    });
    // analisador do ritmo (só ouve a jungle; fica ANTES do volume da pessoa,
    // então a luz funciona igual mesmo com a música baixinha)
    analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.2;
    tracks.jungle.fade.connect(analyser);
    loadCardSamples();
    return true;
  }

  function loadTrack(name) {
    var tr = tracks[name];
    if (tr.loading || tr.buffer || tr.failed || !ensureCtx()) return;
    tr.loading = true;
    fetch(tr.src)
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.arrayBuffer();
      })
      .then(function (data) {
        return new Promise(function (ok, fail) { ctx.decodeAudioData(data, ok, fail); });
      })
      .then(function (buf) {
        tr.buffer = buf;
        tr.loading = false;
        console.info('[áudio] música carregada: ' + tr.src);
        sync();
      })
      .catch(function (err) {
        tr.loading = false; tr.failed = true;
        console.warn('[áudio] não consegui carregar ' + tr.src + ' — confira se o arquivo está na pasta assets/ do site publicado.', err);
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
  var CALL_GAIN = { sfx01: 0.03 };
  function callVol(name) { return Math.min(1, sfxLevel * (CALL_GAIN[name] === undefined ? 1 : CALL_GAIN[name])); }
  Object.keys(calls).forEach(function (k) { calls[k].volume = callVol(k); });

  var currentScreen = 'screen-lobby';
  var matchStarted = false;
  var drawingDone = false; // o desenho acabou (todos prontos): música em fade out
  var radioOn = false;     // música do SoundCloud tocando na sala: a trilha do site fica em silêncio

  // qual faixa deve estar tocando agora (ou null = silêncio)
  function wantedTrack() {
    if (muted || matchStarted || radioOn) return null;
    if (currentScreen === 'screen-character-editor') return null; // editor de avatar: sem música
    if (currentScreen === 'screen-lobby' || currentScreen === 'screen-waiting' || currentScreen === 'screen-social') return 'song';
    return null;
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

  // [RESERVA] sintetizado: só toca se os arquivos de som das cartas não carregarem.
  // carta batendo na mesa: estalo seco de papel + "toc" grave no feltro.
  // Cada chamada varia um pouquinho (tom/timbre), pra não soar sempre igual.
  function sfxCardPlaySynth(delaySec) {
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
  function sfxCardDealSynth(delaySec, variation) {
    if (!sfxReady()) return;
    var t = ctx.currentTime + (delaySec || 0);
    var j = 0.92 + Math.random() * 0.16 + (variation || 0) * 0.04;
    noiseBurst(t, { type: 'bandpass', f: 1600 * j, f2: 5200 * j, q: 1.2, dur: 0.09, peak: 0.75, attack: 0.004 });
    for (var k = 0; k < 3; k++) {
      noiseBurst(t + k * 0.014, { type: 'highpass', f: 3200 * j, dur: 0.02, peak: 0.5 - k * 0.12, attack: 0.001 });
    }
  }

  // ---- Sons de carta de verdade (pacote Casino Audio do Kenney, CC0, em assets/) ----
  // card-play-*: carta jogada na mesa (estalo do papel). card-deal-*: carta distribuída/puxada (deslize).
  // Cada vez sorteia uma gravação diferente da anterior e varia de leve o tom (playbackRate) e o volume,
  // pra não soar sempre igual. Se algum arquivo não carregar, usa o som sintetizado de antes.
  var CARD_FILES = {
    play: ['assets/card-play-1.wav', 'assets/card-play-2.wav', 'assets/card-play-3.wav', 'assets/card-play-4.wav'],
    deal: ['assets/card-deal-1.wav', 'assets/card-deal-2.wav', 'assets/card-deal-3.wav', 'assets/card-deal-4.wav']
  };
  var CARD_GAIN = { play: 1.5, deal: 1.2 };   // multiplica o volume de efeitos (as gravações estão normalizadas em 0,8)
  var cardBufs = { play: [], deal: [] }, cardLast = { play: -1, deal: -1 }, cardLoading = false;

  function loadCardSamples() {
    if (cardLoading || !ctx) return;
    cardLoading = true;
    Object.keys(CARD_FILES).forEach(function (kind) {
      CARD_FILES[kind].forEach(function (url, i) {
        fetch(url)
          .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.arrayBuffer(); })
          .then(function (data) { return new Promise(function (ok, fail) { ctx.decodeAudioData(data, ok, fail); }); })
          .then(function (buf) { cardBufs[kind][i] = buf; })
          .catch(function (err) { console.warn('[áudio] não consegui carregar ' + url + ' — confira se está na pasta assets/.', err); });
      });
    });
  }

  // toca uma gravação sorteada do grupo; devolve false se nenhuma carregou (aí cai no sintetizado)
  function playCardSample(kind, delaySec, pitch) {
    var list = cardBufs[kind], ok = [];
    for (var i = 0; i < list.length; i++) if (list[i]) ok.push(i);
    if (!ok.length) return false;
    var idx;
    do { idx = ok[Math.floor(Math.random() * ok.length)]; } while (idx === cardLast[kind] && ok.length > 1);
    cardLast[kind] = idx;
    var t = ctx.currentTime + (delaySec || 0);
    var src = ctx.createBufferSource();
    src.buffer = list[idx];
    src.playbackRate.value = (pitch || 1) * (0.95 + Math.random() * 0.1);
    var g = ctx.createGain();
    g.gain.value = Math.min(1, CARD_GAIN[kind] * SFX_VOLUME * (0.88 + Math.random() * 0.24));
    src.connect(g); g.connect(ctx.destination);
    src.start(t);
    return true;
  }

  // carta batendo na mesa
  function sfxCardPlay(delaySec) {
    if (!sfxReady()) return;
    if (!playCardSample('play', delaySec, 1)) sfxCardPlaySynth(delaySec);
  }

  // carta sendo distribuída/puxada (a 2ª, 3ª... saem um tiquinho mais agudas, como num leque)
  function sfxCardDeal(delaySec, variation) {
    if (!sfxReady()) return;
    if (!playCardSample('deal', delaySec, 1 + (variation || 0) * 0.015)) sfxCardDealSynth(delaySec, variation);
  }

  // explosãozinha (jogador entrou na sala): "pof" grave abafado + sopro de ruído
  // que vai escurecendo. Propositalmente BEM baixinho.
  function sfxPoof() {
    if (!sfxReady()) return;
    var t = ctx.currentTime;
    var j = 0.92 + Math.random() * 0.16;
    noiseBurst(t, { type: 'lowpass', f: 1600 * j, f2: 160, q: 0.8, dur: 0.5, peak: 0.16, attack: 0.006 });   // sopro/fumaça
    var osc = ctx.createOscillator();                                                                        // baque grave
    var g = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(130 * j, t);
    osc.frequency.exponentialRampToValueAtTime(42, t + 0.28);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.2 * SFX_VOLUME, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.32);
    osc.connect(g); g.connect(ctx.destination);
    osc.start(t); osc.stop(t + 0.35);
  }

  // clique em qualquer botão da página
  document.addEventListener('click', function (e) {
    var b = e.target && e.target.closest ? e.target.closest('button') : null;
    if (!b || b.disabled) return;
    sfxClick();
  }, true);


  // ---- Efeito de luz no ritmo da jungle ----
  // Um AnalyserNode mede o grave (bumbo) e o médio/agudo (caixa/chimbal) da
  // música em tempo real; isso vira duas variáveis CSS (--kick e --snare, de 0
  // a 1) que acendem luzes coloridas nos cantos da tela do editor.
  // Ajustes: BEAT_KICK_COLOR / BEAT_SNARE_COLOR (cor), BEAT_STRENGTH (força).
  var BEAT_KICK_COLOR = '255,0,64';    // rosa-vermelho (bumbo, cantos de baixo)
  var BEAT_SNARE_COLOR = '122,60,255'; // roxo (caixa/chimbal, cantos de cima)
  var BEAT_STRENGTH = 0.6;             // 0..1
  var lightEl = null, lightRaf = 0, lightData = null;
  var peakLow = 60, peakHigh = 60, curKick = 0, curSnare = 0;

  function ensureLight() {
    if (lightEl) return lightEl;
    var st = document.createElement('style');
    st.textContent =
      '#beat-light{position:fixed;inset:0;pointer-events:none;z-index:1;opacity:0;transition:opacity .4s;' +
      '--kick:0;--snare:0;--str:' + BEAT_STRENGTH + ';' +
      'background:' +
      'radial-gradient(ellipse 65% 75% at 0% 100%,rgba(' + BEAT_KICK_COLOR + ',calc(var(--kick)*var(--str))),transparent 70%),' +
      'radial-gradient(ellipse 65% 75% at 100% 100%,rgba(' + BEAT_KICK_COLOR + ',calc(var(--kick)*var(--str))),transparent 70%),' +
      'radial-gradient(ellipse 60% 65% at 0% 0%,rgba(' + BEAT_SNARE_COLOR + ',calc(var(--snare)*var(--str))),transparent 70%),' +
      'radial-gradient(ellipse 60% 65% at 100% 0%,rgba(' + BEAT_SNARE_COLOR + ',calc(var(--snare)*var(--str))),transparent 70%);}';
    document.head.appendChild(st);
    lightEl = document.createElement('div');
    lightEl.id = 'beat-light';
    lightEl.setAttribute('aria-hidden', 'true');
    document.body.appendChild(lightEl);
    return lightEl;
  }

  function avgBins(a, b) {
    var sum = 0;
    for (var i = a; i <= b; i++) sum += lightData[i];
    return sum / (b - a + 1);
  }

  function lightFrame() {
    lightRaf = requestAnimationFrame(lightFrame);
    if (document.hidden || !analyser) return;
    var nowT = performance.now();
    if (nowT - (lightFrame.t || 0) < 33) return;   // ~30 quadros/s bastam
    lightFrame.t = nowT;
    analyser.getByteFrequencyData(lightData);
    // bins de ~94 Hz: 0-2 = grave (bumbo), 10-60 = ~1 a 5,6 kHz (caixa/chimbal)
    var low = avgBins(0, 2), high = avgBins(10, 60);
    peakLow = Math.max(low, peakLow * 0.997, 60);
    peakHigh = Math.max(high, peakHigh * 0.997, 40);
    var k = Math.pow(Math.min(1, low / peakLow), 3);
    var sn = Math.pow(Math.min(1, high / peakHigh), 3);
    curKick = Math.max(k, curKick * 0.84);   // sobe na hora, apaga rápido
    curSnare = Math.max(sn, curSnare * 0.84);
    var ks = curKick.toFixed(2), ss = curSnare.toFixed(2);
    if (ks !== lightFrame.k) { lightFrame.k = ks; lightEl.style.setProperty('--kick', ks); }
    if (ss !== lightFrame.s) { lightFrame.s = ss; lightEl.style.setProperty('--snare', ss); }
  }

  function lightStart() {
    if (!analyser) return;
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    ensureLight();
    lightEl.style.opacity = '1';
    if (lightRaf) return;
    lightData = new Uint8Array(analyser.frequencyBinCount);
    lightRaf = requestAnimationFrame(lightFrame);
  }

  function lightStop() {
    if (lightEl) lightEl.style.opacity = '0';
    if (lightRaf) { cancelAnimationFrame(lightRaf); lightRaf = 0; }
    curKick = curSnare = 0;
    if (lightEl) { lightEl.style.setProperty('--kick', '0'); lightEl.style.setProperty('--snare', '0'); }
  }

  function startTrack(name) {
    var tr = tracks[name];
    if (!ensureCtx()) return;
    if (ctx.state === 'suspended') ctx.resume().catch(function () { /* espera a 1ª interação */ });
    // cancela um fade out em andamento
    if (tr.timer) { clearTimeout(tr.timer); tr.timer = null; }
    var t = ctx.currentTime;
    if (tr.source) {
      tr.fade.gain.cancelScheduledValues(t);
      tr.fade.gain.setValueAtTime(tr.fade.gain.value, t);
      tr.fade.gain.linearRampToValueAtTime(tr.max, t + FADE_IN);
      if (name === 'jungle') lightStart();
      return;
    }
    if (!tr.buffer) { loadTrack(name); return; }
    tr.source = ctx.createBufferSource();
    tr.source.buffer = tr.buffer;
    tr.source.loop = true;
    tr.source.loopStart = 0;
    tr.source.loopEnd = Math.max(0.1, tr.buffer.duration - TAIL_TRIM);
    tr.source.connect(tr.fade);
    tr.fade.gain.cancelScheduledValues(t);
    tr.fade.gain.setValueAtTime(0.0001, t);
    tr.fade.gain.linearRampToValueAtTime(tr.max, t + FADE_IN);
    tr.source.start(0);
    if (name === 'jungle') lightStart();
    console.info('[áudio] tocando: ' + tr.src);
  }

  function killTrack(tr) {
    if (!tr.source) return;
    if (tr === tracks.jungle) lightStop();
    try { tr.source.stop(); } catch (e) {}
    tr.source.disconnect();
    tr.source = null;
  }

  // fade out suave e depois para de vez
  function stopTrack(name) {
    var tr = tracks[name];
    if (!tr.source || tr.timer) return;
    var t = ctx.currentTime;
    tr.fade.gain.cancelScheduledValues(t);
    tr.fade.gain.setValueAtTime(tr.fade.gain.value, t);
    tr.fade.gain.linearRampToValueAtTime(0.0001, t + tr.fadeOut);
    if (name === 'jungle' && lightEl) lightEl.style.opacity = '0'; // a luz se apaga junto com o fade
    tr.timer = setTimeout(function () {
      tr.timer = null;
      if (wantedTrack() !== name) killTrack(tr);
    }, tr.fadeOut * 1000 + 80);
  }

  function sync() {
    var want = wantedTrack();
    Object.keys(tracks).forEach(function (k) {
      if (k === want) startTrack(k); else stopTrack(k);
    });
  }


  // Autoplay: tenta de novo na primeira interação
  function unlock() {
    if (ctx && ctx.state === 'suspended') ctx.resume().catch(function () {});
    sync();
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
    onScreen: function (id) {
      // voltou a abrir o editor vindo de outra tela: rearma a música
      if ((id === 'screen-character-editor' || id === 'screen-lobby') && currentScreen !== id) { drawingDone = false; matchStarted = false; }
      currentScreen = id; sync();
    },
    // chamado quando todo mundo ficou pronto / a partida vai começar: fade out
    endMusic: function () { drawingDone = true; sync(); },
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
    setRadio: function (v) { radioOn = !!v; sync(); },
    getMusicLevel: function () { return musicLevel; },
    getSfxLevel: function () { return sfxLevel; },
    setMusicLevel: function (v) {
      musicLevel = Math.min(1, Math.max(0, +v || 0));
      try { localStorage.setItem('trutec-vol-music', String(musicLevel)); } catch (e) {}
      if (gain) gain.gain.value = musicLevel;
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
    poof: sfxPoof,
    isMuted: function () { return muted; }
  };

  // Tenta tocar a música já ao abrir a página (se o navegador barrar, o
  // primeiro clique/toque acima resolve)
  loadTrack('song'); loadTrack('jungle'); // já baixa/decodifica agora, pra tocar na hora
  sync();
})();
