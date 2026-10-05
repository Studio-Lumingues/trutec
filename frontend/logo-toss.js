// ============================================================================
// ARREMESSAR O LOGO "TruTEC" (tela inicial) + JAILSON ARRUMANDO A BAGUNÇA
// - Segure o logo e arraste: ao soltar, ele é ARREMESSADO (gravidade, quica nas
//   bordas da tela, gira) e fica jogado onde parar.
// - ~5 s depois do primeiro agarrão (e só quando você largar o logo), o Jailson
//   (assets/guia.png) entra correndo, pega o logo, leva de volta pro lugar de
//   origem e fala pra tomar cuidado da próxima vez. Depois sai da tela.
// - O logo de verdade nunca sai do lugar: durante a brincadeira ele só fica
//   invisível e um "clone" fixo na tela é que voa (assim nada corta o logo).
// - Um clique sem arrastar não faz nada. Respeita "reduzir movimento".
// Ajustes: WAIT_MS, GRAVITY, BOUNCE, SETTLE, OBSTACLES e as falas em LINES. Carregar depois do tutorial.js.
// ============================================================================
(function () {
  var HOME = document.querySelector('#screen-lobby .site-logo-top');
  var lobby = document.getElementById('screen-lobby');
  if (!HOME || !lobby || !window.PointerEvent) return;

  var WAIT_MS = 5000;           // tempo até o Jailson aparecer (contado do primeiro agarrão)
  var GRAVITY = 4200;           // px/s²  (maior = cai mais rápido; 0 = flutua pra sempre)
  var BOUNCE = 0.45;            // 0 = não quica, 1 = quica sem perder força
  var AIR = 0.15, FLOOR_FRICTION = 6, SPIN_DRAG = 1.0, MAX_V = 3600;
  var SETTLE = 90;              // força que "deita" o logo de lado quando ele encosta no chão/painel
  var OBSTACLES = '.lobby-card'; // o que o logo não atravessa (painel de opções); dá pra pôr mais seletores
  var GUIDE = 'assets/guia.png', GUIDE_RATIO = 441 / 620;

  // ---- falas do Jailson (sorteia uma de cada grupo; nas vezes seguintes ele fica mais bravo) ----
  var LINES = {
    arrive: [
      'Opa, opa, opa! Quem jogou o TruTEC no chão?!',
      'Eita! Olha o jeito que deixaram o TruTEC…',
      'Ih, o TruTEC tá todo bagunçado! Deixa comigo.',
      'Alguém soltou o TruTEC de novo? Eu vi isso, hein!'
    ],
    arriveFlipped: ['Tá até de ponta-cabeça! Coitado do TruTEC.'],
    arriveAgain: [
      'De novo?! Você só pode estar de brincadeira…',
      'Mais uma vez? Eu acabei de arrumar isso!',
      'Eu não acredito que você jogou o TruTEC outra vez…'
    ],
    arriveMany: [
      'Tá, já entendi: você gosta de jogar o TruTEC. Eu também me canso, viu?',
      'Eu já tô até com o caminho decorado, de tanto vir aqui…'
    ],
    done: [
      'Pronto! Voltou pro lugar.',
      'Prontinho! Como se nada tivesse acontecido.',
      'Tá aí, bonitão de volta no lugar.',
      'Fiu! Que trabalheira…'
    ],
    warn: [
      'Da próxima vez, toma mais cuidado, tá?',
      'O TruTEC não é bola de futebol, viu? Cuidado!',
      'Ele é de pixel, mas também sente! Da próxima vez, cuidado, tá?',
      'Tô de olho em você, hein! Da próxima vez, toma cuidado.',
      'Trata com carinho o TruTEC, tá? Da próxima vez, cuidado!'
    ],
    warnAgain: [
      'Cuidado, tá? Minhas costas não aguentam mais isso!',
      'Se jogar de novo eu cobro hora extra. Toma cuidado!',
      'Última vez que eu arrumo assim, hein? Cuidado da próxima!'
    ]
  };
  var rounds = 0;               // quantas vezes o Jailson já veio nesta visita
  function pick(list) { return list[Math.floor(Math.random() * list.length)]; }

  var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var K = reduced ? 0.35 : 1;   // fator de duração das animações

  // ---------------------------------------------------------------- estilos
  var st = document.createElement('style');
  st.textContent = [
    '#screen-lobby .site-logo-top{cursor:grab;touch-action:none;user-select:none;-webkit-user-select:none;-webkit-tap-highlight-color:transparent}',
    '.jl-toy{position:fixed!important;left:0;top:0;margin:0!important;z-index:50;cursor:grab;touch-action:none;user-select:none;-webkit-user-select:none;will-change:transform;transform-origin:50% 50%}',
    '.jl-toy.jl-held{cursor:grabbing}',
    '.jl-toy.jl-carried{cursor:default;pointer-events:none}',
    'html.jl-dragging,html.jl-dragging *{cursor:grabbing!important;user-select:none!important;-webkit-user-select:none!important}',
    '.jl{position:fixed;left:0;top:0;z-index:55;pointer-events:none;will-change:transform}',
    '.jl img{display:block;width:100%;height:100%;filter:url(#boil-sm);transform-origin:50% 100%;user-select:none;-webkit-user-select:none}',
    '.jl.jl-walk img{animation:jlWalk .34s ease-in-out infinite}',
    '.jl.jl-talk img{animation:jlTalk .32s ease-in-out infinite}',
    '@keyframes jlWalk{25%{transform:rotate(-3deg)}75%{transform:rotate(3deg)}}',
    '@keyframes jlTalk{25%{transform:translateY(-.25rem) rotate(2deg)}75%{transform:translateY(-.08rem) rotate(-2deg)}}',
    '.jl-bubble{position:fixed;z-index:56;pointer-events:none;box-sizing:border-box;isolation:isolate;padding:1rem 1.1rem .85rem;',
    'font-size:1.12rem;line-height:1.35;color:#0a0a0a;animation:jlPop .22s ease-out;transition:opacity .25s}',
    '.jl-bubble.jl-out{opacity:0}',
    '@keyframes jlPop{from{opacity:0;transform:scale(.9)}to{opacity:1;transform:none}}',
    '.jl-bg{position:absolute;inset:0;z-index:-1;background:#fff8f0;border:3px solid #0a0a0a;',
    'border-radius:1.4rem 1.1rem 1.5rem 1.2rem/1.2rem 1.5rem 1.1rem 1.4rem;filter:url(#boil-sm);box-shadow:.25rem .3rem 0 rgba(0,0,0,.45)}',
    '.jl-tail{position:absolute;display:block}',
    '.jl-tail::before,.jl-tail::after{content:"";position:absolute}',
    '.jl-r .jl-tail{left:0;top:1.6rem;width:0;height:22px}',
    '.jl-r .jl-tail::before{right:0;top:0;width:14px;height:22px;background:#0a0a0a;clip-path:polygon(0 50%,100% 0,100% 100%)}',
    '.jl-r .jl-tail::after{right:-4px;top:3.8px;width:13.2px;height:14.4px;background:#fff8f0;clip-path:polygon(0 50%,9.2px 0,100% 0,100% 100%,9.2px 100%)}',
    '.jl-l .jl-tail{right:0;top:1.6rem;width:0;height:22px}',
    '.jl-l .jl-tail::before{left:0;top:0;width:14px;height:22px;background:#0a0a0a;clip-path:polygon(100% 50%,0 0,0 100%)}',
    '.jl-l .jl-tail::after{left:-4px;top:3.8px;width:13.2px;height:14.4px;background:#fff8f0;clip-path:polygon(100% 50%,calc(100% - 9.2px) 0,0 0,0 100%,calc(100% - 9.2px) 100%)}',
    '.jl-b .jl-tail{bottom:0;left:var(--tx,50%);width:22px;height:0}',
    '.jl-b .jl-tail::before{left:-11px;top:0;width:22px;height:14px;background:#0a0a0a;clip-path:polygon(0 0,100% 0,50% 100%)}',
    '.jl-b .jl-tail::after{left:-9.2px;top:-4px;width:18.4px;height:13.2px;background:#fff8f0;clip-path:polygon(0 0,100% 0,50% 100%)}',
    '.jl-name{position:absolute;left:1rem;top:-1rem;z-index:1;padding:.1rem .7rem .15rem;font-size:1.02rem;font-weight:800;color:#0a0a0a;',
    'background:#ffd23f;border:2.5px solid #0a0a0a;border-radius:.7rem .5rem .8rem .55rem/.55rem .8rem .5rem .7rem;transform:rotate(-3deg);box-shadow:.1rem .12rem 0 rgba(0,0,0,.45)}',
    '.jl-text{position:relative;margin-top:.2rem}',
    '.jl-full{visibility:hidden}',
    '.jl-typed{position:absolute;left:0;top:0;right:0}',
    '@media (prefers-reduced-motion: reduce){.jl.jl-walk img,.jl.jl-talk img,.jl-bubble{animation:none}}'
  ].join('');
  document.head.appendChild(st);

  // ---------------------------------------------------------------- estado
  var phase = 'idle';           // idle | toy (logo jogado na tela) | jailson (arrumando)
  var toy = null, tw = 0, th = 0;
  var x = 0, y = 0, a = 0, vx = 0, vy = 0, om = 0;      // centro, ângulo (graus), velocidades
  var held = false, moving = false, raf = 0, last = 0;
  var g = null, samples = [];
  var timer = 0, timerSet = false, due = false, pendingCall = 0;
  var token = 0, curJ = null, curBubble = null;

  function clamp(v, lo, hi) { return Math.min(Math.max(v, lo), hi); }
  function vw() { return window.innerWidth; }
  function vh() { return window.innerHeight; }
  function usable() {
    if (!lobby.classList.contains('active')) return false;
    if (window.TruGate && TruGate.blocking && TruGate.blocking()) return false;
    if (window.TruTutorial && TruTutorial.running && TruTutorial.running()) return false;
    return true;
  }
  function ext() {
    var r = a * Math.PI / 180, c = Math.abs(Math.cos(r)), s = Math.abs(Math.sin(r));
    return { ex: (c * tw + s * th) / 2, ey: (s * tw + c * th) / 2 };
  }
  function render() {
    if (toy) toy.style.transform = 'translate3d(' + (x - tw / 2) + 'px,' + (y - th / 2) + 'px,0) rotate(' + a + 'deg)';
  }
  function clampToScreen() {
    var e = ext(), W = vw(), H = vh();
    x = e.ex * 2 > W ? W / 2 : clamp(x, e.ex, W - e.ex);
    y = e.ey * 2 > H ? H / 2 : clamp(y, e.ey, H - e.ey);
  }

  // ------------------------------------------------------- o clone que voa
  function createToy(rect) {
    toy = HOME.cloneNode(true);
    [].forEach.call(toy.querySelectorAll('[id]'), function (el) { el.removeAttribute('id'); });
    toy.removeAttribute('id'); toy.removeAttribute('role');
    toy.setAttribute('aria-hidden', 'true');
    toy.classList.add('jl-toy', 'jl-held');
    toy.style.width = rect.width + 'px';
    toy.style.height = rect.height + 'px';
    document.body.appendChild(toy);
    tw = rect.width; th = rect.height;
    x = rect.left + tw / 2; y = rect.top + th / 2; a = 0; vx = vy = om = 0;
    HOME.style.visibility = 'hidden';
    toy.addEventListener('pointerdown', function (e) { grab(e, true); });
    phase = 'toy';
    render();
  }

  // ---------------------------------------------------- colisão com o painel
  function obstacleRects() {
    var out = [];
    [].forEach.call(lobby.querySelectorAll(OBSTACLES), function (el) {
      var r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) out.push(r);
    });
    return out;
  }
  // por qual lado o logo bateu: olha de onde ele VEIO (px,py = posição anterior), assim não atravessa
  function hitSide(R, e, px, py) {
    var L = x - e.ex, Rr = x + e.ex, T = y - e.ey, B = y + e.ey;
    if (!(L < R.right && Rr > R.left && T < R.bottom && B > R.top)) return null;
    if (py + e.ey <= R.top + 1) return 'up';
    if (py - e.ey >= R.bottom - 1) return 'down';
    if (px + e.ex <= R.left + 1) return 'left';
    if (px - e.ex >= R.right - 1) return 'right';
    var dUp = B - R.top, dDown = R.bottom - T, dL = Rr - R.left, dR = R.right - L;
    var m = Math.min(dUp, dDown, dL, dR);
    return m === dUp ? 'up' : m === dDown ? 'down' : m === dL ? 'left' : 'right';
  }
  function pushOut(R, e, side) {
    if (side === 'up') y = R.top - e.ey;
    else if (side === 'down') y = R.bottom + e.ey;
    else if (side === 'left') x = R.left - e.ex;
    else x = R.right + e.ex;
  }
  // segurando: o logo anda até o ponteiro em passinhos e esbarra no painel (não passa por dentro)
  function dragTo(nx, ny) {
    var rects = obstacleRects(), dx = nx - x, dy = ny - y;
    var n = clamp(Math.ceil(Math.hypot(dx, dy) / 24), 1, 40);
    for (var i = 0; i < n; i++) {
      var px = x, py = y;
      x += dx / n; y += dy / n;
      clampToScreen();
      var e = ext();
      for (var k = 0; k < rects.length; k++) {
        var s = hitSide(rects[k], e, px, py);
        if (s) pushOut(rects[k], e, s);
      }
    }
  }

  // ----------------------------------------------------------- arrastar
  function velocity() {
    var n = samples.length;
    if (n < 2) return { x: 0, y: 0 };
    var l = samples[n - 1], f = samples[0];
    if (performance.now() - l.t > 90) return { x: 0, y: 0 };      // parou antes de soltar
    var dt = (l.t - f.t) / 1000;
    if (dt < 0.01) return { x: 0, y: 0 };
    return { x: (l.x - f.x) / dt, y: (l.y - f.y) / dt };
  }
  function listen() {
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  }
  function unlisten() {
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onUp);
  }
  function grab(e, fromToy) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (g || phase === 'jailson' || !usable()) return;
    e.preventDefault();
    clearTimeout(pendingCall); pendingCall = 0;
    samples = [];
    if (fromToy) {
      cancelAnimationFrame(raf); moving = false; held = true;
      g = { id: e.pointerId, started: true, ox: e.clientX - x, oy: e.clientY - y };
      toy.classList.add('jl-held');
      document.documentElement.classList.add('jl-dragging');
    } else {
      var r = HOME.getBoundingClientRect();
      g = { id: e.pointerId, started: false, sx: e.clientX, sy: e.clientY, rect: r,
            ox: e.clientX - (r.left + r.width / 2), oy: e.clientY - (r.top + r.height / 2) };
    }
    listen();
  }
  function onMove(e) {
    if (!g || e.pointerId !== g.id) return;
    if (!g.started) {
      if (Math.hypot(e.clientX - g.sx, e.clientY - g.sy) < 6) return;   // clique sem arrastar não faz nada
      createToy(g.rect);
      g.started = true; held = true;
      document.documentElement.classList.add('jl-dragging');
      startTimer();
    }
    var now = performance.now();
    var v0 = velocity();
    a += (clamp(v0.x * 0.012, -22, 22) - a) * 0.25;                      // balança conforme você puxa
    dragTo(e.clientX - g.ox, e.clientY - g.oy);
    samples.push({ t: now, x: x, y: y });
    while (samples.length > 2 && now - samples[0].t > 110) samples.shift();
    render();
  }
  function onUp(e) {
    if (!g || e.pointerId !== g.id) return;
    var started = g.started;
    g = null; unlisten();
    document.documentElement.classList.remove('jl-dragging');
    if (!started || !toy) return;
    held = false;
    toy.classList.remove('jl-held');
    var v = velocity();
    vx = clamp(v.x, -MAX_V, MAX_V); vy = clamp(v.y, -MAX_V, MAX_V);
    om = vx * 0.05 + (Math.random() - 0.5) * 20;
    launch();
  }
  function launch() {
    if (moving || !toy) return;
    moving = true; last = performance.now();
    raf = requestAnimationFrame(step);
  }
  HOME.addEventListener('pointerdown', function (e) { grab(e, false); });

  // ------------------------------------------------------------- física
  // Um passo de simulação (o quadro é dividido em vários passinhos: nada atravessa nada).
  // Devolve true se o logo está apoiado (chão ou painel).
  function sub(h, rects) {
    var px = x, py = y, grounded = false;
    vy += GRAVITY * h;
    var drag = Math.exp(-AIR * h);
    vx *= drag; vy *= drag;
    x += vx * h; y += vy * h;
    a += om * h; om *= Math.exp(-SPIN_DRAG * h);

    var e = ext(), W = vw(), H = vh();
    if (e.ex * 2 > W) { x = W / 2; vx = 0; }
    else if (x < e.ex) { x = e.ex; if (vx < 0) { vx = -vx * BOUNCE; om = om * 0.6 - vy * 0.03; } }
    else if (x > W - e.ex) { x = W - e.ex; if (vx > 0) { vx = -vx * BOUNCE; om = om * 0.6 + vy * 0.03; } }
    if (e.ey * 2 > H) { y = H / 2; vy = 0; grounded = true; }
    else if (y < e.ey) { y = e.ey; if (vy < 0) { vy = -vy * BOUNCE; om += vx * 0.04; } }
    else if (y > H - e.ey) {
      y = H - e.ey;
      if (vy > 0) { vy = vy > 260 ? -vy * BOUNCE : 0; om = om * 0.6 + vx * 0.08; }
      grounded = true;
    }
    for (var k = 0; k < rects.length; k++) {
      var R = rects[k], s = hitSide(R, e, px, py);
      if (!s) continue;
      pushOut(R, e, s);
      if (s === 'up') { if (vy > 0) { vy = vy > 260 ? -vy * BOUNCE : 0; om = om * 0.6 + vx * 0.08; } grounded = true; }
      else if (s === 'down') { if (vy < 0) { vy = -vy * BOUNCE; om += vx * 0.04; } }
      else if (s === 'left') { if (vx > 0) { vx = -vx * BOUNCE; om = om * 0.6 - vy * 0.03; } }
      else { if (vx < 0) { vx = -vx * BOUNCE; om = om * 0.6 + vy * 0.03; } }
    }
    if (grounded) {
      vx *= Math.exp(-FLOOR_FRICTION * h);
      // encostou: o logo tomba e deita de lado (ângulo 0° ou 180°) em vez de ficar torto no ar
      var d = a - Math.round(a / 180) * 180;
      om += -d * SETTLE * h;
      om *= Math.exp(-9 * h);
    }
    return grounded;
  }
  function step(t) {
    if (!moving || !toy) return;
    var dt = Math.min(0.034, (t - last) / 1000);
    last = t;
    if (dt <= 0) { raf = requestAnimationFrame(step); return; }
    var n = clamp(Math.ceil(Math.max(Math.abs(vx), Math.abs(vy)) * dt / 24), 1, 8), h = dt / n;
    var rects = obstacleRects(), grounded = false;
    for (var i = 0; i < n; i++) if (sub(h, rects)) grounded = true;
    render();
    var d = a - Math.round(a / 180) * 180;
    if (grounded && Math.abs(vx) < 14 && Math.abs(vy) < 40 && Math.abs(om) < 10 && Math.abs(d) < 1.5) {
      var e1 = ext();
      a = Math.round(a / 180) * 180;
      y += e1.ey - ext().ey;                      // ao endireitar o último grauzinho, continua encostado no apoio
      moving = false; vx = vy = om = 0;
      render();
      maybeCall();
      return;
    }
    raf = requestAnimationFrame(step);
  }

  // ---------------------------------------------- quando o Jailson aparece
  function startTimer() {
    if (timerSet) return;
    timerSet = true;
    timer = setTimeout(function () { due = true; maybeCall(); }, WAIT_MS);
  }
  function maybeCall() {            // só vem quando o logo está parado e ninguém está segurando
    if (!due || phase !== 'toy' || held || moving || pendingCall) return;
    pendingCall = setTimeout(function () {
      pendingCall = 0;
      if (due && phase === 'toy' && !held && !moving) run(); else maybeCall();
    }, 450);
  }

  // ------------------------------------------------------ utilitários async
  function tween(my, ms, fn) {
    return new Promise(function (res) {
      var t0 = performance.now();
      (function f(t) {
        if (my !== token) return res();
        var p = Math.min(1, Math.max(0, (t - t0) / ms));
        fn(p);
        if (p < 1) requestAnimationFrame(f); else res();
      })(t0);
    });
  }
  function wait(my, ms) { return new Promise(function (res) { setTimeout(res, ms); }); }
  function easeOut(p) { return 1 - Math.pow(1 - p, 3); }
  function easeIn(p) { return p * p * p; }
  function easeInOut(p) { return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2; }
  function hop(p, n) { return reduced ? 0 : Math.abs(Math.sin(p * Math.PI * n)) * 9; }

  // ---- voz (um "blip" por letra, no volume de Efeitos sonoros) ----
  var vctx = null, lastBlip = 0;
  function blip(ch, question) {
    var ga = window.GameAudio, lv = 1;
    if (ga) { if (ga.isMuted && ga.isMuted()) return; if (ga.getSfxLevel) lv = ga.getSfxLevel(); }
    if (!lv) return;
    var now = performance.now();
    if (now - lastBlip < 55) return;
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    if (!vctx) { try { vctx = new AC(); } catch (e) { return; } }
    if (vctx.state === 'suspended') { try { vctx.resume(); } catch (e) {} }
    if (vctx.state !== 'running') return;
    lastBlip = now;
    var c = ch.toLowerCase(), t = vctx.currentTime, code = c.charCodeAt(0) - 97;
    if (code < 0 || code > 25) code = c.charCodeAt(0) % 26;
    var scale = [0, 2, 4, 7, 9, 12, 14];
    var semi = scale[code % scale.length] + (code > 13 ? 12 : 0) + (Math.random() * 1.2 - 0.6) - 6;
    var f = 250 * Math.pow(2, semi / 12) * (question ? 1.25 : 1);
    var vowel = /[aeiouáéíóúâêôãõ]/.test(c), dur = vowel ? 0.085 : 0.05;
    var o1 = vctx.createOscillator(), o2 = vctx.createOscillator(), bp = vctx.createBiquadFilter(), gn = vctx.createGain();
    o1.type = 'triangle'; o2.type = 'sine';
    o1.frequency.setValueAtTime(f * 1.06, t); o1.frequency.exponentialRampToValueAtTime(f, t + dur * 0.8);
    o2.frequency.setValueAtTime(f * 2, t);
    bp.type = 'bandpass'; bp.Q.value = vowel ? 2.2 : 0.9; bp.frequency.value = vowel ? 600 : 900 + (code % 7) * 120;
    gn.gain.setValueAtTime(0.0001, t);
    gn.gain.exponentialRampToValueAtTime(0.34 * lv * lv, t + 0.012);
    gn.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o1.connect(bp); o2.connect(gn); bp.connect(gn); gn.connect(vctx.destination);
    o1.start(t); o2.start(t); o1.stop(t + dur + 0.02); o2.stop(t + dur + 0.02);
  }
  function typeText(my, el, text) {
    return new Promise(function (res) {
      var i = 0;
      (function next() {
        if (my !== token) return res();
        i++;
        el.textContent = text.slice(0, i);
        var ch = text.charAt(i - 1);
        if (/\S/.test(ch)) blip(ch, ch === '?');
        if (i >= text.length) return res();
        setTimeout(next, /[,.!?]/.test(ch) ? 220 : 38);
      })();
    });
  }

  function makeBubble(line, jx, jb, jw, jh) {
    var b = document.createElement('div');
    b.className = 'jl-bubble';
    b.innerHTML = '<span class="jl-bg"><i class="jl-tail"></i></span><span class="jl-name">Jailson</span>' +
      '<div class="jl-text"><span class="jl-full"></span><span class="jl-typed"></span></div>';
    b.querySelector('.jl-full').textContent = line;
    var W = vw(), rightRoom = W - (jx + jw / 2) - 12, leftRoom = jx - jw / 2 - 12, mode;
    if (rightRoom >= 200 || leftRoom >= 200) {
      mode = rightRoom >= leftRoom ? 'r' : 'l';
      b.style.width = Math.min(290, mode === 'r' ? rightRoom : leftRoom) + 'px';
    } else { mode = 'b'; b.style.width = Math.min(290, W - 24) + 'px'; }
    b.classList.add('jl-' + mode);
    document.body.appendChild(b);
    var bw = b.offsetWidth, bh = b.offsetHeight, left, top;
    if (mode === 'r') { left = jx + jw / 2 + 10; top = jb - jh + jh * 0.12; }
    else if (mode === 'l') { left = jx - jw / 2 - 10 - bw; top = jb - jh + jh * 0.12; }
    else {
      left = clamp(jx - bw / 2, 8, W - bw - 8); top = jb - jh - bh - 14;
      b.style.setProperty('--tx', clamp(jx - left, 24, bw - 24) + 'px');
    }
    top = clamp(top, 8, vh() - bh - 8);
    b.style.left = left + 'px'; b.style.top = top + 'px';
    return b;
  }

  async function say(my, J, line, hold, jx, jb, jw, jh) {
    var b = makeBubble(line, jx, jb, jw, jh);
    curBubble = b;
    J.classList.add('jl-talk');
    await typeText(my, b.querySelector('.jl-typed'), line);
    if (my !== token) return;
    J.classList.remove('jl-talk');
    await wait(my, hold);
    if (my !== token) return;
    b.classList.add('jl-out');
    await wait(my, 260);
    if (my !== token) return;
    if (b.parentNode) b.parentNode.removeChild(b);
    curBubble = null;
  }

  // ------------------------------------------------------- o Jailson em ação
  async function run() {
    if (!toy) return;
    phase = 'jailson'; due = false;
    var my = ++token;
    toy.classList.remove('jl-held'); toy.classList.add('jl-carried');

    var jh = Math.round(clamp(vh() * 0.26, 112, 200)), jw = Math.round(jh * GUIDE_RATIO);
    var J = document.createElement('div');
    J.className = 'jl'; J.style.width = jw + 'px'; J.style.height = jh + 'px';
    var im = new Image(); im.alt = ''; im.draggable = false; im.src = GUIDE;
    J.appendChild(im);
    await new Promise(function (r) { im.onload = im.onerror = r; if (im.complete) r(); });
    if (my !== token) return;
    function jpos(cx, feet) { J.style.transform = 'translate3d(' + (cx - jw / 2) + 'px,' + (feet - jh) + 'px,0)'; }

    // 1) entra correndo pelo lado onde tem mais espaço e para ao lado do logo
    var W = vw(), H = vh(), e = ext();
    var side = (x - e.ex) >= (W - (x + e.ex)) ? -1 : 1;
    var tx = clamp(x + side * (e.ex + jw * 0.2), jw / 2, W - jw / 2);
    var tb = clamp(y + e.ey * 0.9, jh + 6, H - 4);
    var sx = side < 0 ? -jw : W + jw;
    jpos(sx, tb); document.body.appendChild(J); curJ = J;
    J.classList.add('jl-walk');
    await tween(my, 950 * K, function (p) { jpos(sx + (tx - sx) * easeOut(p), tb - hop(p, 4)); });
    if (my !== token) return;
    J.classList.remove('jl-walk');
    await wait(my, 300 * K);
    if (my !== token) return;
    var flipped = Math.abs(a - Math.round(a / 360) * 360) > 90;
    var pool = rounds >= 2 ? LINES.arriveMany : rounds === 1 ? LINES.arriveAgain
             : flipped ? LINES.arrive.concat(LINES.arriveFlipped, LINES.arriveFlipped) : LINES.arrive;
    await say(my, J, pick(pool), 900, tx, tb, jw, jh);
    if (my !== token) return;

    // 2) pega o logo e leva de volta pro lugar de origem
    var hr = HOME.getBoundingClientRect(), hx = hr.left + hr.width / 2, hy = hr.top + hr.height / 2;
    a = ((a % 360) + 540) % 360 - 180;                       // desenrola pelo caminho mais curto
    var x0 = x, y0 = y, a0 = a, offX = tx - x0, offY = tb - y0;
    var dist = Math.hypot(hx - x0, hy - y0);
    var ms = (700 + Math.min(dist, 1400) * 0.8) * K, hops = Math.max(2, Math.round(ms / 330));
    J.classList.add('jl-walk');
    var jx = tx, jb = tb;
    await tween(my, ms, function (p) {
      var q = easeInOut(p), h = hop(p, hops);
      x = x0 + (hx - x0) * q; y = y0 + (hy - y0) * q - h * 0.6; a = a0 * (1 - q);
      render();
      jx = clamp(x0 + (hx - x0) * q + offX, jw / 2, W - jw / 2);
      jb = clamp(y0 + (hy - y0) * q + offY, jh + 6, H - 4) - h;
      jpos(jx, jb);
    });
    if (my !== token) return;
    J.classList.remove('jl-walk');
    HOME.style.visibility = '';                              // o logo de verdade volta a aparecer
    if (toy && toy.parentNode) toy.parentNode.removeChild(toy);
    toy = null;
    await wait(my, 250);
    if (my !== token) return;

    // 3) fala: "pronto" + a bronca
    await say(my, J, pick(LINES.done), 900, jx, jb, jw, jh);
    if (my !== token) return;
    await say(my, J, pick(rounds >= 1 ? LINES.warnAgain.concat(LINES.warn) : LINES.warn), 2200, jx, jb, jw, jh);
    if (my !== token) return;

    // 4) sai da tela
    var ex = jx < W / 2 ? -jw : W + jw, jx0 = jx;
    J.classList.add('jl-walk');
    await tween(my, 800 * K, function (p) { jpos(jx0 + (ex - jx0) * easeIn(p), jb - hop(p, 3)); });
    if (my !== token) return;
    if (J.parentNode) J.parentNode.removeChild(J);
    curJ = null;
    phase = 'idle'; timerSet = false; due = false; rounds++;
  }

  // ------------------------------------------------------------- limpeza
  function hardReset() {
    token++;
    clearTimeout(timer); clearTimeout(pendingCall); pendingCall = 0;
    cancelAnimationFrame(raf);
    if (g) { g = null; unlisten(); }
    document.documentElement.classList.remove('jl-dragging');
    [toy, curJ, curBubble].forEach(function (el) { if (el && el.parentNode) el.parentNode.removeChild(el); });
    toy = curJ = curBubble = null;
    HOME.style.visibility = '';
    held = moving = due = timerSet = false;
    phase = 'idle';
  }
  // saiu da tela inicial no meio da brincadeira: volta tudo pro lugar na hora
  new MutationObserver(function () {
    if (!lobby.classList.contains('active') && phase !== 'idle') hardReset();
  }).observe(lobby, { attributes: true, attributeFilter: ['class'] });

  window.addEventListener('resize', function () {
    if (toy && phase === 'toy' && !held && !moving) { clampToScreen(); render(); launch(); }
  });
})();
