// ============================================================================
// SORTEIO DE QUEM COMEÇA A PARTIDA (roleta 3D)
// O servidor sorteia o jogador e manda no state: draw = { seat, lead, spin, hold, elapsed }.
// Este arquivo mostra "Sorteando jogador pra iniciar a partida…" e uma roleta no meio da tela
// (o mesmo estilo 3D da lista de amigos): começa devagar, acelera, e vai desacelerando
// até parar no jogador sorteado. Enquanto gira rápido a roleta fica borrada.
//
// Linha do tempo (tudo vem do servidor, pra todo mundo ver igual):
//   lead  = espera (a intro da logo ainda está na tela)
//   spin  = tempo girando
//   hold  = pausa mostrando quem foi sorteado
//
// Som (opcional): coloque um destes arquivos na pasta assets/ e ele toca sozinho:
//   assets/roulette-spin.mp3  -> som de roleta inteiro, tocado 1x no começo do giro
//   assets/roulette-tick.mp3  -> um "clique" curto, tocado a cada jogador que passa
// Sem arquivo nenhum, o JS gera os cliques e o "ding" final sozinho (Web Audio).
// O volume segue o controle de efeitos das Configurações (e o mudo).
//
// Uso (client.js):  TruStarterDraw.play(state)   // state do 'game_start'
// ============================================================================
(function () {
  var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var SPIN_FILE = 'assets/roulette-spin.mp3';
  var TICK_FILE = 'assets/roulette-tick.mp3';
  var MIN_SLOTS = 8;            // posições no círculo (precisa de ≥ 5 pra o "pulo" da volta não aparecer)
  var TARGET_STEPS = 38;        // quantos jogadores passam, mais ou menos, até parar
  var MAX_BLUR = 7;             // px de blur no auge da velocidade
  var BLUR_FROM = 3;            // só borra acima dessa velocidade (jogadores por segundo)

  var cur = null;               // sorteio em andamento

  // ---------------------------------------------------------------- CSS
  function css() {
    if (document.getElementById('sd-css')) return;
    var st = document.createElement('style');
    st.id = 'sd-css';
    st.textContent =
      '.sd-overlay{position:fixed;inset:0;z-index:9400;display:flex;flex-direction:column;align-items:center;justify-content:center;' +
      'gap:1.4rem;background:rgba(8,6,4,.78);backdrop-filter:blur(5px);-webkit-backdrop-filter:blur(5px);color:var(--cream,#f5ecd7);' +
      'opacity:0;transition:opacity .35s ease;touch-action:none;user-select:none;-webkit-user-select:none}' +
      '.sd-overlay.show{opacity:1}' +
      '.sd-overlay.leaving{pointer-events:none}' +
      '.sd-title{margin:0;font-size:clamp(1.5rem,5vw,2.4rem);line-height:1.15;text-align:center;padding:0 1rem;text-shadow:0 .15rem .6rem rgba(0,0,0,.6)}' +
      '.sd-title .sd-dots::after{content:"";animation:sdDots 1.2s steps(4,end) infinite}' +
      '@keyframes sdDots{0%{content:""}25%{content:"."}50%{content:".."}75%,100%{content:"..."}}' +
      '.sd-title.done{animation:sdPop .45s cubic-bezier(.2,1.4,.4,1)}' +
      '@keyframes sdPop{0%{transform:scale(.85)}100%{transform:scale(1)}}' +
      '.sd-stage{position:relative;width:min(100vw,46rem);height:17rem;overflow:hidden;' +
      '-webkit-mask-image:linear-gradient(90deg,transparent,#000 14%,#000 86%,transparent);mask-image:linear-gradient(90deg,transparent,#000 14%,#000 86%,transparent)}' +
      '.sd-track{position:absolute;inset:0;will-change:filter}' +
      '.sd-item{position:absolute;left:50%;top:0;width:10rem;margin-left:-5rem;display:flex;flex-direction:column;align-items:center;' +
      'text-align:center;will-change:transform,opacity}' +
      '.sd-fig{display:block;width:9rem;height:9rem;border-radius:1rem;overflow:hidden;background:rgba(255,255,255,.08);' +
      'border:3px solid rgba(255,255,255,.25);box-sizing:border-box;transition:border-color .2s,box-shadow .3s}' +
      '.sd-fig img{display:block;width:100%;height:100%;object-fit:cover;object-position:center top;pointer-events:none}' +
      '.sd-name{display:block;width:100%;margin-top:.7rem;font-size:1.6rem;line-height:1.1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
      '.sd-sub{display:block;font-size:.9rem;opacity:.6}' +
      '.sd-item.sel .sd-fig{border-color:var(--cream,#f5ecd7)}' +
      '.sd-item.win .sd-fig{border-color:#ffd24a;box-shadow:0 0 0 .25rem rgba(255,210,74,.35),0 0 2.2rem rgba(255,210,74,.65)}' +
      '.sd-item.win{animation:sdWin .7s ease-out}' +
      '@keyframes sdWin{0%{filter:brightness(1.8)}100%{filter:brightness(1)}}' +
      '.sd-marker{position:absolute;left:50%;width:0;height:0;margin-left:-.7rem;border-left:.7rem solid transparent;border-right:.7rem solid transparent;pointer-events:none}' +
      '.sd-marker.top{top:-.1rem;border-top:.9rem solid #ffd24a;filter:drop-shadow(0 .1rem .3rem rgba(0,0,0,.6))}' +
      '.sd-marker.bot{bottom:3.1rem;border-bottom:.9rem solid #ffd24a;filter:drop-shadow(0 -.1rem .3rem rgba(0,0,0,.6))}' +
      '@media (max-width:600px){.sd-stage{height:15rem}.sd-item{width:8.5rem;margin-left:-4.25rem}.sd-fig{width:7.5rem;height:7.5rem}.sd-name{font-size:1.3rem}.sd-marker.bot{display:none}}';
    document.head.appendChild(st);
  }

  // ---------------------------------------------------------------- som
  var actx = null, tickBuf = null, spinBuf = null, filesTried = false;

  function sfxVolume() {
    if (!window.GameAudio) return 0.8;
    if (GameAudio.isMuted && GameAudio.isMuted()) return 0;
    return GameAudio.getSfxLevel ? GameAudio.getSfxLevel() : 0.8;
  }
  function ctx() {
    if (actx) return actx;
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    try { actx = new AC(); } catch (e) { actx = null; }
    return actx;
  }
  function loadFile(url) {
    return fetch(url).then(function (r) {
      if (!r.ok) throw new Error('no file');
      return r.arrayBuffer();
    }).then(function (ab) {
      return new Promise(function (ok, fail) { actx.decodeAudioData(ab, ok, fail); });
    }).catch(function () { return null; });
  }
  function loadSounds() {
    if (filesTried) return;
    filesTried = true;
    if (!ctx()) return;
    loadFile(SPIN_FILE).then(function (b) { spinBuf = b; });
    loadFile(TICK_FILE).then(function (b) { tickBuf = b; });
  }

  // clique sintetizado: estalinho curto, mais agudo quanto mais rápido gira
  function synthTick(speed, vol) {
    var c = ctx(); if (!c) return;
    var t = c.currentTime;
    var g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.5 * vol, t + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    var o = c.createOscillator();
    o.type = 'triangle';
    o.frequency.setValueAtTime(700 + Math.min(speed, 14) * 55, t);
    o.frequency.exponentialRampToValueAtTime(380, t + 0.045);
    o.connect(g); g.connect(c.destination);
    o.start(t); o.stop(t + 0.06);
  }
  function playTick(speed) {
    var vol = sfxVolume(); if (vol <= 0) return;
    var c = ctx(); if (!c) return;
    if (tickBuf && !spinBuf) {
      var s = c.createBufferSource(), g = c.createGain();
      s.buffer = tickBuf;
      s.playbackRate.value = 0.9 + Math.min(speed, 14) * 0.03;
      g.gain.value = Math.min(1, vol);
      s.connect(g); g.connect(c.destination);
      s.start();
    } else if (!spinBuf) {
      synthTick(speed, vol);
    }
  }
  function playSpinFile(spinMs) {
    var vol = sfxVolume(); if (vol <= 0 || !spinBuf) return;
    var c = ctx(); if (!c) return;
    var s = c.createBufferSource(), g = c.createGain();
    s.buffer = spinBuf;
    var rate = spinBuf.duration / (spinMs / 1000);       // estica/encolhe pra caber no giro
    if (rate < 0.75 || rate > 1.4) rate = 1;
    s.playbackRate.value = rate;
    var t = c.currentTime, dur = spinBuf.duration / rate;
    g.gain.setValueAtTime(Math.min(1, vol), t);
    if (dur > spinMs / 1000) {                            // arquivo mais longo que o giro: some no fim
      g.gain.setValueAtTime(Math.min(1, vol), t + spinMs / 1000 - 0.4);
      g.gain.linearRampToValueAtTime(0.0001, t + spinMs / 1000);
    }
    s.connect(g); g.connect(c.destination);
    s.start(t);
    return s;
  }
  function playDing() {
    var vol = sfxVolume(); if (vol <= 0) return;
    var c = ctx(); if (!c) return;
    var t = c.currentTime;
    [660, 990].forEach(function (f, i) {
      var o = c.createOscillator(), g = c.createGain();
      o.type = 'sine'; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t + i * 0.09);
      g.gain.exponentialRampToValueAtTime(0.35 * vol, t + i * 0.09 + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.09 + 0.7);
      o.connect(g); g.connect(c.destination);
      o.start(t + i * 0.09); o.stop(t + i * 0.09 + 0.75);
    });
  }

  // ---------------------------------------------------------------- curva de velocidade
  // cubic-bezier(.45,0,.15,1): começa devagar, acelera e tem uma desaceleração longa no fim
  function bezier(x1, y1, x2, y2) {
    function cx(t) { return 3 * x1 * t * (1 - t) * (1 - t) + 3 * x2 * t * t * (1 - t) + t * t * t; }
    function cy(t) { return 3 * y1 * t * (1 - t) * (1 - t) + 3 * y2 * t * t * (1 - t) + t * t * t; }
    return function (x) {
      if (x <= 0) return 0;
      if (x >= 1) return 1;
      var lo = 0, hi = 1, t = x;
      for (var i = 0; i < 24; i++) {
        var v = cx(t);
        if (Math.abs(v - x) < 1e-5) break;
        if (v < x) lo = t; else hi = t;
        t = (lo + hi) / 2;
      }
      return cy(t);
    };
  }
  var ease = bezier(0.45, 0, 0.15, 1);

  // ---------------------------------------------------------------- roleta
  function build(players, winIdx, mySeat) {
    var n = players.length;
    var L = n * Math.ceil(MIN_SLOTS / n);
    var overlay = document.createElement('div');
    overlay.className = 'sd-overlay';
    overlay.setAttribute('role', 'status');
    overlay.setAttribute('aria-live', 'polite');
    overlay.innerHTML =
      '<h2 class="sd-title">Sorteando jogador pra iniciar a partida<span class="sd-dots"></span></h2>' +
      '<div class="sd-stage"><div class="sd-track"></div>' +
      '<span class="sd-marker top"></span><span class="sd-marker bot"></span></div>';
    var track = overlay.querySelector('.sd-track');
    var items = [];
    for (var s = 0; s < L; s++) {
      var p = players[s % n];
      var it = document.createElement('div');
      it.className = 'sd-item';
      var fig = document.createElement('span');
      fig.className = 'sd-fig';
      var im = document.createElement('img');
      im.alt = ''; im.draggable = false;
      im.src = p.character || 'assets/personagem.svg';
      fig.appendChild(im);
      var nm = document.createElement('span');
      nm.className = 'sd-name';
      nm.textContent = p.seat === mySeat ? 'Você' : (p.name || 'Jogador');
      it.appendChild(fig); it.appendChild(nm);
      if (p.handle) {
        var sub = document.createElement('span');
        sub.className = 'sd-sub'; sub.textContent = '@' + p.handle;
        it.appendChild(sub);
      }
      track.appendChild(it);
      items.push(it);
    }
    return { overlay: overlay, track: track, items: items, L: L, n: n, title: overlay.querySelector('.sd-title') };
  }

  function layout(w, pos) {
    var itemW = w.items[0].offsetWidth || 160;
    var gap = itemW * 1.02;
    w.items.forEach(function (it, slot) {
      var x = slot - pos;
      var d = x - w.L * Math.round(x / w.L);       // distância do centro no menor caminho
      var ad = Math.abs(d);
      var o = Math.pow(1 - Math.min(1, ad / 2.6), 1.3);
      var rot = Math.max(-70, Math.min(70, d * 24));
      it.style.transform = 'translateX(' + (d * gap).toFixed(1) + 'px) perspective(60rem) rotateY(' + rot.toFixed(1) +
        'deg) scale(' + (1.05 - Math.min(ad, 3) * 0.12).toFixed(3) + ')';
      it.style.opacity = o.toFixed(3);
      it.style.visibility = o < 0.01 ? 'hidden' : 'visible';
      it.style.zIndex = String(Math.round(100 - ad * 10));
      var sel = ad < 0.5;
      if (sel !== it.classList.contains('sel')) it.classList.toggle('sel', sel);
    });
  }

  function cancel() {
    if (!cur) return;
    clearTimeout(cur.t1); clearTimeout(cur.t2); clearTimeout(cur.t3);
    cancelAnimationFrame(cur.raf);
    if (cur.snd) { try { cur.snd.stop(); } catch (e) {} }
    if (cur.w && cur.w.overlay.parentNode) cur.w.overlay.parentNode.removeChild(cur.w.overlay);
    cur = null;
  }

  // state: o state do 'game_start'. Só faz algo se o servidor mandou state.draw.
  function play(state) {
    var d = state && state.draw;
    if (!d || !state.players || !state.players.length) return;
    var elapsed = Math.max(0, d.elapsed || 0);
    var total = d.lead + d.spin + d.hold;
    if (elapsed >= total - 300) return;                  // já acabou (ex.: reconectou tarde)
    cancel();
    css();
    loadSounds();

    var players = state.players.slice().sort(function (a, b) { return a.seat - b.seat; });
    var winIdx = 0;
    players.forEach(function (p, i) { if (p.seat === d.seat) winIdx = i; });
    var me = state.players.filter(function (p) { return p.hand !== undefined; })[0];
    var mySeat = me ? me.seat : -1;
    var n = players.length;

    // distância total: termina no jogador sorteado (posição ≡ winIdx mod n)
    var D = winIdx + n * Math.max(1, Math.ceil((TARGET_STEPS - winIdx) / n));

    var w = build(players, winIdx, mySeat);
    cur = { w: w, raf: 0, t1: 0, t2: 0, t3: 0, snd: null };
    var me_ = cur;
    var tZero = performance.now() - elapsed;              // "momento 0" do sorteio, igual ao do servidor

    var startIn = d.lead - elapsed;                       // pode ser negativo (entrou no meio)
    function begin() {
      if (cur !== me_) return;
      document.body.appendChild(w.overlay);
      layout(w, 0);
      requestAnimationFrame(function () { w.overlay.classList.add('show'); });

      var skip = Math.max(0, -startIn);                   // ms do giro que já passaram
      var t0 = performance.now() - skip;
      var lastPos = 0, lastT = t0, lastIdx = 0, blur = 0, finished = false;

      if (reduced) { finish(); return; }
      resume();
      me_.snd = playSpinFile(d.spin) || null;

      function frame(now) {
        if (cur !== me_) return;
        var p = Math.min(1, (now - t0) / d.spin);
        var pos = D * ease(p);
        var dt = Math.max(1, now - lastT) / 1000;
        var speed = Math.abs(pos - lastPos) / dt;         // jogadores por segundo
        lastPos = pos; lastT = now;

        // blur proporcional à velocidade (suavizado pra não piscar)
        var wantBlur = Math.max(0, Math.min(MAX_BLUR, (speed - BLUR_FROM) * 0.5));
        blur += (wantBlur - blur) * 0.35;
        w.track.style.filter = blur > 0.15 ? 'blur(' + blur.toFixed(2) + 'px)' : 'none';

        layout(w, pos);

        var idx = Math.floor(pos + 0.5);                  // cruzou um jogador: clique
        if (idx !== lastIdx) { lastIdx = idx; playTick(speed); }

        if (p < 1) me_.raf = requestAnimationFrame(frame);
        else finish();
      }
      me_.raf = requestAnimationFrame(frame);

      function finish() {
        if (finished) return;
        finished = true;
        layout(w, D);
        w.track.style.filter = 'none';
        w.items.forEach(function (it, slot) { if (slot === D % w.L) it.classList.add('win'); });
        var who = players[winIdx];
        w.title.classList.add('done');
        w.title.textContent = who.seat === mySeat ? 'Você começa!' : (who.name || 'Jogador') + ' começa!';
        playDing();
        var endIn = tZero + total - performance.now();   // até o fim do sorteio no servidor
        me_.t2 = setTimeout(function () {
          if (cur !== me_) return;
          w.overlay.classList.add('leaving');
          w.overlay.classList.remove('show');
          me_.t3 = setTimeout(cancel, 450);
        }, Math.max(300, endIn - 400));
      }
    }
    if (startIn > 0) cur.t1 = setTimeout(begin, startIn); else begin();
  }

  // navegador pode deixar o áudio "dormindo" até a primeira interação
  function resume() {
    if (actx && actx.state === 'suspended') actx.resume().catch(function () {});
  }
  document.addEventListener('pointerdown', function () { ctx(); resume(); loadSounds(); }, { passive: true });

  window.TruStarterDraw = { play: play, cancel: cancel };
})();
