// ============================================================================
// TUTORIAL COM O GUIA DO TRUTEC (personagem "hand drawn")
// O Jailson (assets/guia.png), o guia, aparece com um balão de fala e ensina, passo a passo:
// criar sala, entrar numa sala, Ajuda, Configurações (com o nome) e Temas.
// - A tela inteira escurece; só a parte de que ele está falando fica clara
//   (um "holofote" com contorno tremido, igual ao resto do site).
// - Ele abre os próprios modais de verdade (Criar sala, Jogar, Ajuda...) e fecha
//   tudo no final, sem mexer em nada do seu perfil/tema.
// - Na 1ª visita abre sozinho e é OBRIGATÓRIO (sem pular) — só termina depois que o jogador escreve o nome; depois pelo botão redondo no canto da tela inicial
//   ou pelo comando `tutorial` do terminal.
// - O Jailson fala com um "blip" por letra (estilo Animal Crossing), no volume de Efeitos sonoros.
// - Teclas: → / Enter = próximo · ← = voltar · Esc = pular (só depois da 1ª vez).
// Pra mudar os textos ou a ordem, mexa na lista STEPS logo abaixo.
// ============================================================================
(function () {
  'use strict';

  var FLAG = 'trutec-tutorial-visto';
  var GUIDE = 'assets/guia.png';
  var TYPE_MS = 18;                       // velocidade da "fala" (ms por letra)
  var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  // Física do guia (mola contínua: se o destino muda no meio do caminho, a velocidade é mantida = sem soquinho)
  var SPRING_W = 11.5;                    // rapidez da mola (maior = mais ágil)
  var SPRING_Z = 0.62;                    // amortecimento: menor = mais elástico/balançando, maior = mais suave
  var SETTLE_MS = 60;                     // quanto o alvo precisa ficar parado antes do guia reposicionar (antes 160)


  // ---- passos --------------------------------------------------------------
  // target: seletor (ou função) do que fica claro · ui: qual modal fica aberto
  // ui = none | create | join | help | settings | themes
  var STEPS = [
    { ui: 'none', next: 'Bora!', skip: 'Agora não',
      text: 'Oi! Eu sou o <b>Jailson</b>, o guia do TruTEC. Vou te mostrar como o jogo funciona: criar sala, entrar numa sala, a <b>Ajuda</b>, as <b>Configurações</b> (onde você coloca seu nome) e os <b>Temas</b>. Bora?' },
    { ui: 'none', target: '#btn-create',
      text: 'Quer jogar com os amigos? Clique em <b>Criar sala</b>.' },
    { ui: 'create', target: '#create-modal .settings-card',
      text: 'Escolha o modo: <b>1 vs 1</b> (dois jogadores) ou <b>2 vs 2</b> (duas duplas). Ao escolher, a sala é criada e aparece um <b>código de 5 letras</b>. É só mandar esse código pros amigos!' },
    { ui: 'none', target: '#btn-play',
      text: 'Se um amigo já criou a sala, o caminho é o botão <b>Jogar</b>.' },
    { ui: 'join', target: '#join-modal .settings-card',
      text: 'Digite o <b>código da sala</b> que seu amigo te mandou e clique em <b>Entrar</b>. Pronto, você cai na sala de espera!' },
    { ui: 'none', target: '#btn-help',
      text: 'Ficou na dúvida sobre as regras? Tem o botão <b>Ajuda</b>.' },
    { ui: 'help', target: '#help-modal .settings-card',
      text: 'A Ajuda é o guia <b>Como jogar Truco</b>: o objetivo do jogo, a força das cartas, a vira e as manilhas, como pedir <b>truco, seis, nove e doze</b>, esconder a carta, os sinais pro parceiro… Clique em cada seção pra abrir. Vale ler antes da primeira partida!' },
    { ui: 'none', target: '#btn-settings',
      text: 'A engrenagem abre as <b>Configurações</b>.' },
    { ui: 'settings', target: '#settings-modal .settings-card',
      text: 'Aqui você ajusta o <b>volume da música</b> e dos <b>efeitos sonoros</b>, e pode ligar o <b>modo daltonismo</b>, que deixa as cores dos naipes e dos times mais fáceis de distinguir.' },
    { ui: 'settings', target: '#tab-temas',
      text: 'E nesta aba, <b>Temas</b>, você muda o visual do jogo.' },
    { ui: 'themes', target: '#themes-modal .themes-card',
      text: 'Passe pelos temas com as <b>setas</b>. Cada um tem um fundo animado diferente e o que você escolher já vale na hora. Os outros jogadores também veem o seu tema quando passam o mouse (ou tocam) no seu boneco!' },
    { ui: 'settings', ask: true, target: '.name-badge', next: 'Pronto!',
      text: function () {
        var n = nameNow();
        return n ? 'Pra fechar: seu nome é <b>' + esc(n) + '</b>? Se quiser mudar, é só escrever no crachá <b>Olá, eu sou...</b>. Depois clique em <b>Pronto!</b>'
                 : 'Ah, e eu ainda não sei o seu nome! Clique no espaço branco do crachá <b>Olá, eu sou...</b> e escreva como você quer ser chamado.';
      } },
    { ui: 'none', next: 'Terminar',
      text: function () {
        var n = esc(nameNow() || 'amigo');
        var praise = [
          'Que nome lindo, <b>' + n + '</b>! Combina demais com um mestre do truco.',
          '<b>' + n + '</b>! Adorei esse nome. Já até imagino você cantando truco na mesa!',
          'Uau, <b>' + n + '</b> é um nome de respeito! Os adversários já estão com medo.',
          'Que nome bonito, <b>' + n + '</b>! Prazer em te conhecer!',
          '<b>' + n + '</b>… nome de campeão! Anotei aqui e não esqueço mais.'
        ];
        return praise[Math.floor(Math.random() * praise.length)] +
          ' Agora é só <b>criar uma sala</b> ou <b>entrar numa</b> e jogar. Se precisar de mim de novo, clique no meu rostinho no canto da tela inicial. Boa partida!';
      } }
  ];

  function esc(t) { return String(t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function nameInput() { return document.getElementById('input-name'); }
  function nameNow() { var i = nameInput(); return i ? i.value.trim() : ''; }

  // ---- abrir/fechar os modais de verdade (clicando nos botões do próprio site) ----
  var OPEN = { create: ['#btn-create'], join: ['#btn-play'], help: ['#btn-help'], settings: ['#btn-settings'], themes: ['#btn-settings', '#tab-temas'] };
  var CLOSE = { create: ['#create-cancel'], join: ['#join-cancel'], help: ['#help-close'], settings: ['#settings-close'], themes: ['#tab-geral-back', '#settings-close'] };
  var ui = 'none';
  function click(sel) { var el = document.querySelector(sel); if (el) el.click(); }
  function setUi(next) {
    if (next === ui) return;
    if (ui === 'settings' && next === 'themes') click('#tab-temas');
    else if (ui === 'themes' && next === 'settings') click('#tab-geral-back');
    else {
      (CLOSE[ui] || []).forEach(click);
      (OPEN[next] || []).forEach(click);
    }
    ui = next;
    var a = document.activeElement;                   // não deixa o teclado do celular abrir (campo do código)
    if (a && a !== document.body && a.blur && a.tagName === 'INPUT') a.blur();
  }

  // ---- estilo ----
  function css() {
    if (document.getElementById('tut-css')) return;
    var st = document.createElement('style');
    st.id = 'tut-css';
    st.textContent = [
      '.tut-root{position:fixed;inset:0;z-index:9500;font-family:inherit;color:#0a0a0a;animation:tutFade .4s ease-out;pointer-events:none}',
      '.tut-block{position:absolute;inset:0;pointer-events:auto}',
      '.tut-btn:disabled{opacity:.45;cursor:not-allowed;box-shadow:none}',
      '.tut-shake{animation:tutShake .4s}',
      '@keyframes tutShake{20%,60%{transform:translateX(-.3rem)}40%,80%{transform:translateX(.3rem)}}',
      '@keyframes tutFade{from{opacity:0}to{opacity:1}}',
      '.tut-root[hidden]{display:none}',
      '.tut-spot{position:fixed;left:50%;top:50%;width:0;height:0;border-radius:1rem;pointer-events:none;',
      'box-shadow:0 0 0 200vmax rgba(5,4,10,.84)}',
      '.tut-spot.tut-move{transition:left .35s cubic-bezier(.3,.9,.3,1),top .35s cubic-bezier(.3,.9,.3,1),width .35s cubic-bezier(.3,.9,.3,1),height .35s cubic-bezier(.3,.9,.3,1)}',
      '.tut-ring{position:absolute;inset:-5px;border:3px dashed #fff8f0;border-radius:1.2rem 1rem 1.3rem 1rem/1rem 1.3rem 1rem 1.2rem;',
      'filter:url(#boil-sm);opacity:.95}',
      '.tut-spot.tut-none .tut-ring{display:none}',
      '.tut-panel{--gh:clamp(10rem,44vh,23rem);position:fixed;left:0;top:0;display:flex;align-items:flex-start;gap:.5rem;pointer-events:none;',
      'width:max-content;max-width:calc(100vw - 1.5rem);will-change:transform}',
            '.tut-panel.tut-right{flex-direction:row-reverse}',
      '.tut-guide{flex:none;pointer-events:auto;cursor:pointer;animation:tutBob 2.4s ease-in-out infinite}',
      '.tut-guide img{transform-origin:50% 100%;display:block;height:var(--gh);width:auto;filter:url(#boil-lg);user-select:none;-webkit-user-select:none}',
      '.tut-panel.tut-talk .tut-guide{animation:tutTalk .32s ease-in-out infinite}',
      '@keyframes tutBob{50%{transform:translateY(-.25rem) rotate(-1.5deg)}}',
      '@keyframes tutTalk{25%{transform:translateY(-.3rem) rotate(2deg)}75%{transform:translateY(-.1rem) rotate(-2deg)}}',
      '.tut-bubble{position:relative;isolation:isolate;flex:0 1 28rem;min-width:0;pointer-events:auto;margin-top:calc(var(--gh) * .14);',
      'padding:1rem 1.25rem .9rem;font-size:1.22rem;line-height:1.35;color:#0a0a0a}',
      '.tut-bg{position:absolute;inset:0;z-index:-1;background:#fff8f0;border:3px solid #0a0a0a;',
      'border-radius:1.4rem 1.1rem 1.5rem 1.2rem/1.2rem 1.5rem 1.1rem 1.4rem;filter:url(#boil-sm);box-shadow:.25rem .3rem 0 rgba(0,0,0,.45)}',
      // perninha: triângulo preto (::before) + triângulo creme menor por cima (::after).
      // Fica DENTRO do .tut-bg, então o filtro de tremido pega balão e perna juntos (sem emenda torta).
      '.tut-tail{position:absolute;top:1.6rem;width:0;height:22px}',
      '.tut-tail::before,.tut-tail::after{content:"";position:absolute}',
      '.tut-panel:not(.tut-right) .tut-tail{left:0}',
      '.tut-panel:not(.tut-right) .tut-tail::before{right:0;top:0;width:14px;height:22px;background:#0a0a0a;clip-path:polygon(0 50%,100% 0,100% 100%)}',
      '.tut-panel:not(.tut-right) .tut-tail::after{right:-4px;top:3.8px;width:13.2px;height:14.4px;background:#fff8f0;clip-path:polygon(0 50%,9.2px 0,100% 0,100% 100%,9.2px 100%)}',
      '.tut-panel.tut-right .tut-tail{right:0}',
      '.tut-panel.tut-right .tut-tail::before{left:0;top:0;width:14px;height:22px;background:#0a0a0a;clip-path:polygon(100% 50%,0 0,0 100%)}',
      '.tut-panel.tut-right .tut-tail::after{left:-4px;top:3.8px;width:13.2px;height:14.4px;background:#fff8f0;clip-path:polygon(100% 50%,calc(100% - 9.2px) 0,0 0,0 100%,calc(100% - 9.2px) 100%)}',
      '.tut-name{position:absolute;left:1rem;top:-1rem;z-index:1;padding:.1rem .7rem .15rem;font-size:1.05rem;font-weight:800;color:#0a0a0a;',
      'background:#ffd23f;border:2.5px solid #0a0a0a;border-radius:.7rem .5rem .8rem .55rem/.55rem .8rem .5rem .7rem;transform:rotate(-3deg);',
      'box-shadow:.1rem .12rem 0 rgba(0,0,0,.45)}',
      '.tut-text{position:relative;min-height:3.6rem;margin-top:.25rem}',
      '.tut-full{visibility:hidden}',
      '.tut-typed{position:absolute;left:0;top:0;right:0}',
      '.tut-text b{font-weight:800}',
      '.tut-foot{display:flex;align-items:center;gap:.5rem;margin-top:.7rem}',
      '.tut-count{margin-right:auto;font-size:.9rem;opacity:.6}',
      '.tut-btn{font:inherit;font-weight:800;font-size:1.08rem;padding:.4rem 1rem;cursor:pointer;color:#0a0a0a;',
      'background:#fff8f0;border:2.5px solid #0a0a0a;border-radius:.9rem .7rem 1rem .75rem/.75rem 1rem .7rem .9rem;box-shadow:.12rem .15rem 0 rgba(0,0,0,.5)}',
      '.tut-btn:hover{background:#ffe9b8}.tut-btn:active{transform:translate(.08rem,.1rem);box-shadow:none}',
      '.tut-btn.tut-go{background:#ffd23f}.tut-btn.tut-go:hover{background:#ffdf6b}',
      '.tut-btn[hidden]{display:none}',
      '.tut-skip{font:inherit;font-size:.92rem;font-weight:700;background:none;border:0;color:#0a0a0a;opacity:.55;cursor:pointer;text-decoration:underline;padding:.2rem}',
      '.tut-skip:hover{opacity:1}',
      // botão redondo pra rever o tutorial (só na tela inicial)
      '.tut-fab{position:fixed;right:.9rem;bottom:.9rem;z-index:9000;width:3.6rem;height:3.6rem;padding:0;cursor:pointer;',
      'border:3px solid #0a0a0a;border-radius:50%;background:#fff8f0 url(' + GUIDE + ') center 6%/92% auto no-repeat;',
      'box-shadow:.18rem .22rem 0 rgba(0,0,0,.5),0 .5rem 1.2rem rgba(0,0,0,.35);transition:transform .15s}',
      '.tut-fab:hover{transform:scale(1.08) rotate(-4deg)}',
      '.tut-fab[hidden]{display:none}',
      '.tut-fab::after{content:"?";position:absolute;right:-.3rem;top:-.35rem;width:1.35rem;height:1.35rem;border-radius:50%;',
      'background:#ffd23f;border:2.5px solid #0a0a0a;font:800 .8rem/1.05rem system-ui,sans-serif;text-align:center;color:#0a0a0a}',
      '@media (max-width:600px){.tut-panel{--gh:clamp(7.5rem,25vh,12rem);width:calc(100vw - 1.5rem)}.tut-bubble{flex:1 1 auto;font-size:1.08rem;padding:.8rem .95rem .75rem}',
      '}',
      '@media (prefers-reduced-motion:reduce){.tut-guide,.tut-panel.tut-talk .tut-guide{animation:none}',
      '.tut-spot.tut-move,.tut-panel{transition:none}}'
    ].join('');
    document.head.appendChild(st);
  }

  // ---- estado do tutorial ----
  var root, block, gImg, mandatory = false, pending = false, spot, panel, guideImg, bubble, typed, full, countEl, btnNext, btnBack, btnSkip;
  var idx = 0, running = false, raf = 0, typeTimer = null, moveTimer = 0, relayoutTimer = 0;
  var nodes = [], texts = [], cursor = 0, total = 0, plain = '';
  var settleAt = 0, dirty = false;
  var started = false, flipTimer = 0, flipTo = null;
  var entering = false, enterTimer = 0, lastX = 0, lastY = 0, lastWig = 0, curCand = -1, curCandN = 0, lastRect = '', firstLayout = true, t0 = 0;

  function resolve(t) {
    if (!t) return null;
    var el = typeof t === 'function' ? t() : document.querySelector(t);
    return el && el.getBoundingClientRect().width ? el : null;
  }

  // holofote: segue o elemento (ele pode estar animando, como um modal abrindo)
  var PAD = 8;
  function track(now) {
    raf = requestAnimationFrame(track);
    step(now || performance.now());                   // mola do guia: roda todo quadro, independente do resto
    if (!started) return;
    if (dirty && Date.now() - settleAt > SETTLE_MS) { dirty = false; layout(); }   // modal parou de animar: posiciona UMA vez
    var el = resolve(STEPS[idx].target);
    if (!el) {
      spot.classList.add('tut-none');
      spot.style.left = innerWidth / 2 + 'px'; spot.style.top = innerHeight / 2 + 'px';
      spot.style.width = '2px'; spot.style.height = '2px';
      block.style.clipPath = '';
      if (lastRect !== 'none') { lastRect = 'none'; markDirty(); }
      return;
    }
    spot.classList.remove('tut-none');
    var r = el.getBoundingClientRect();
    var l = Math.max(4, r.left - PAD), t = Math.max(4, r.top - PAD);
    var rr = Math.min(innerWidth - 4, r.right + PAD), bb = Math.min(innerHeight - 4, r.bottom + PAD);
    spot.style.left = l + 'px'; spot.style.top = t + 'px';
    spot.style.width = Math.max(0, rr - l) + 'px'; spot.style.height = Math.max(0, bb - t) + 'px';
    // passo da pergunta: o jogador precisa clicar/digitar no crachá, então abre um "buraco" no bloqueador
    block.style.clipPath = STEPS[idx].ask
      ? 'polygon(evenodd,0 0,100% 0,100% 100%,0 100%,0 0,' + l + 'px ' + t + 'px,' + l + 'px ' + bb + 'px,' + rr + 'px ' + bb + 'px,' + rr + 'px ' + t + 'px,' + l + 'px ' + t + 'px)'
      : '';
    var rk = [l, t, rr, bb].map(Math.round).join();
    if (rk !== lastRect) { lastRect = rk; markDirty(); }   // o modal ainda está animando: espera ele assentar
  }

  function markDirty() { settleAt = Date.now(); dirty = true; }

  // coloca o guia no canto que menos tapa o que está iluminado
  function layout(snap) {
    if (!panel) return;
    var entrance = firstLayout; firstLayout = false;
    var el = resolve(STEPS[idx].target);
    if (!el && STEPS[idx].target && !entrance) return;   // modal ainda abrindo: fica onde está (antes ia pro centro e voltava)
    var vw = innerWidth, vh = innerHeight, m = 12;
    var w = panel.offsetWidth, h = panel.offsetHeight, x, y, right = false;
    if (!el) { x = (vw - w) / 2; y = (vh - h) / 2; curCand = -1; }
    else {
      var r = el.getBoundingClientRect();
      var tr = { l: r.left - PAD, t: r.top - PAD, r: r.right + PAD, b: r.bottom + PAD };
      var cand = [[vw - w - m, vh - h - m, true], [m, vh - h - m, false], [vw - w - m, m, true], [m, m, false]];
      if (vw < 600) cand = [[(vw - w) / 2, vh - h - m, false], [(vw - w) / 2, m, false]];
      var areas = cand.map(function (c) {
        var ox = Math.max(0, Math.min(c[0] + w, tr.r) - Math.max(c[0], tr.l));
        var oy = Math.max(0, Math.min(c[1] + h, tr.b) - Math.max(c[1], tr.t));
        return ox * oy;
      });
      var best = 0;
      areas.forEach(function (a, i) { if (a < areas[best]) best = i; });
      var pick = best;
      // histerese: só troca de canto se o atual estiver bem pior (evita ficar pulando cima/baixo)
      var tol = Math.max(4000, 0.04 * (tr.r - tr.l) * (tr.b - tr.t));   // tolerância proporcional ao tamanho do alvo
      if (curCand >= 0 && curCandN === cand.length && areas[curCand] <= areas[best] + tol) pick = curCand;
      curCand = pick; curCandN = cand.length;
      x = cand[pick][0]; y = cand[pick][1]; right = cand[pick][2];
    }
    var X = Math.max(0, x), Y = Math.max(0, y);
    var hasRight = panel.classList.contains('tut-right');
    if (entrance || snap) {                           // sem animação de lado: já vira na hora
      if (right !== hasRight) panel.classList.toggle('tut-right', right);
      G.x = G.v = B.x = B.v = 0;
    }
    if (entrance) {                                   // entrada: começa FORA da tela, embaixo, e sobe até o lugar com a mola
      P.x = X; P.y = vh + 30; P.vx = P.vy = 0; P.tx = X; P.ty = Y;
      lastX = x; lastY = y; lastWig = Date.now();
      clearTimeout(enterTimer);
      enterTimer = setTimeout(function () { if (running) kick(0); }, 380);   // boing quando chega
    } else if (snap) {                                // resize: acompanha a janela sem "elástico"
      P.x = P.tx = X; P.y = P.ty = Y; P.vx = P.vy = 0;
      lastX = x; lastY = y;
    } else {
      var now = Date.now(), moved = Math.hypot(x - lastX, y - lastY) > 30;
      P.tx = X; P.ty = Y;                             // só troca o destino: a mola mantém a velocidade, sem soquinho
      if (right !== hasRight) flipSide(right);
      if (moved && now - lastWig > 350) { lastWig = now; kick(x >= lastX ? 1 : -1); }
      lastX = x; lastY = y;
    }
  }

  // ---- física: posição do painel + squash/stretch + inclinação + offsets de "virar de lado" ----
  var P = { x: 0, y: 0, vx: 0, vy: 0, tx: 0, ty: 0 };
  var Q = { q: 0, v: 0 };              // squash (borracha): >0 achata e alarga
  var T = { a: 0, v: 0 };              // inclinação (graus), puxada pela velocidade horizontal
  var G = { x: 0, v: 0 }, B = { x: 0, v: 0 };   // offsets do guia e do balão ao trocar de lado
  var lastT = 0, lastTf = '', lastImgTf = '';
  function resetPhys() { P.x = P.y = P.vx = P.vy = P.tx = P.ty = 0; Q.q = Q.v = T.a = T.v = G.x = G.v = B.x = B.v = 0; lastT = 0; lastTf = ''; lastImgTf = ''; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function step(now) {
    if (!panel) { lastT = 0; return; }
    var dt = lastT ? Math.min(0.05, (now - lastT) / 1000) : 0.016;
    lastT = now;
    if (dt <= 0) return;
    if (reduced) { P.x = P.tx; P.y = P.ty; P.vx = P.vy = 0; }
    else {
      var K = SPRING_W * SPRING_W, C = 2 * SPRING_Z * SPRING_W;
      var n = Math.max(1, Math.ceil(dt / 0.008)), h = dt / n;
      for (var i = 0; i < n; i++) {
        P.vx += (-K * (P.x - P.tx) - C * P.vx) * h; P.x += P.vx * h;
        P.vy += (-K * (P.y - P.ty) - C * P.vy) * h; P.y += P.vy * h;
        Q.v += (-220 * Q.q - 11 * Q.v) * h; Q.q += Q.v * h;
        var tt = clamp(-P.vx * 0.004, -9, 9);
        T.v += (150 * (tt - T.a) - 13 * T.v) * h; T.a += T.v * h;
        G.v += (-K * G.x - C * G.v) * h; G.x += G.v * h;
        B.v += (-K * B.x - C * B.v) * h; B.x += B.v * h;
      }
      if (Math.abs(P.x - P.tx) < 0.03 && Math.abs(P.vx) < 0.3) { P.x = P.tx; P.vx = 0; }
      if (Math.abs(P.y - P.ty) < 0.03 && Math.abs(P.vy) < 0.3) { P.y = P.ty; P.vy = 0; }
      if (Math.abs(G.x) < 0.02 && Math.abs(G.v) < 0.3) { G.x = G.v = 0; }
      if (Math.abs(B.x) < 0.02 && Math.abs(B.v) < 0.3) { B.x = B.v = 0; }
    }
    var tf = 'translate3d(' + P.x.toFixed(2) + 'px,' + P.y.toFixed(2) + 'px,0)';
    if (tf !== lastTf) { lastTf = tf; panel.style.transform = tf; }
    if (reduced) return;
    var speed = Math.sqrt(P.vx * P.vx + P.vy * P.vy);
    var st = Math.min(0.12, speed / 7000);                // estica um pouquinho quando está rápido
    var sy = 1 - Q.q + st, sx = 1 + Q.q - st * 0.6;
    var itf = 'rotate(' + T.a.toFixed(2) + 'deg) scale(' + sx.toFixed(4) + ',' + sy.toFixed(4) + ')';
    if (itf !== lastImgTf && gImg) { lastImgTf = itf; gImg.style.transform = itf; }
    guideImg.style.translate = G.x ? G.x.toFixed(2) + 'px 0' : '';
    bubble.style.translate = B.x ? B.x.toFixed(2) + 'px 0' : '';
  }
  // "boing": empurrão na mola de squash (dir: -1/1 = também inclina pro lado do movimento)
  function kick(dir) {
    if (reduced) return;
    Q.v += 3.6;
    if (dir) T.v += -dir * 70;
  }
  function boing() { kick(0); }
  // trocar de lado sem pulo: vira o layout na hora e deixa a mola "devolver" guia e balão ao lugar
  function flipSide(right) {
    var g0 = guideImg.getBoundingClientRect().left, b0 = bubble.getBoundingClientRect().left;
    panel.classList.toggle('tut-right', right);
    var g1 = guideImg.getBoundingClientRect().left, b1 = bubble.getBoundingClientRect().left;
    if (!reduced) { G.x += g0 - g1; B.x += b0 - b1; }
  }


  // ---- voz do Jailson (estilo "Animal Crossing": uma sílaba curtinha por letra) ----
  // Cada letra falada vira um "blip" com tom e timbre próprios (vogais mais abertas, consoantes mais
  // secas). Segue o volume de "Efeitos sonoros" das Configurações e fica mudo se o som estiver mudo.
  var VOICE_BASE = 250;          // tom médio da voz (Hz): menor = mais grave
  var VOICE_GAP_MS = 55;         // intervalo mínimo entre blips
  var vctx = null, lastBlip = 0;
  var FORMANT = { a: 850, e: 620, i: 380, o: 520, u: 330 };
  function voiceCtx() {
    if (vctx) return vctx;
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    try { vctx = new AC(); } catch (e) { vctx = null; }
    return vctx;
  }
  function voiceLevel() {
    var ga = window.GameAudio;
    if (!ga) return 1;
    if (ga.isMuted && ga.isMuted()) return 0;
    return ga.getSfxLevel ? ga.getSfxLevel() : 1;
  }
  function blip(ch, question) {
    var lv = voiceLevel();
    if (!lv) return;
    var now = performance.now();
    if (now - lastBlip < VOICE_GAP_MS) return;
    var ac = voiceCtx();
    if (!ac) return;
    if (ac.state === 'suspended') { try { ac.resume(); } catch (e) {} }
    if (ac.state !== 'running') return;               // o navegador ainda não liberou o som (precisa de um clique antes)
    lastBlip = now;
    var c = ch.toLowerCase(), t = ac.currentTime;
    var code = c.charCodeAt(0) - 97;                   // a..z -> 0..25 (acentos caem em letra próxima)
    if (code < 0 || code > 25) code = (c.charCodeAt(0) % 26);
    var vowel = FORMANT[c.normalize ? c.normalize('NFD').charAt(0) : c];
    // tom: cada letra tem sua nota (escala pentatônica, soa "fofa"), com um pouquinho de aleatório
    var scale = [0, 2, 4, 7, 9, 12, 14];
    var semi = scale[code % scale.length] + (code > 13 ? 12 : 0) + (Math.random() * 1.2 - 0.6) - 6;
    var f = VOICE_BASE * Math.pow(2, semi / 12) * (question ? 1.25 : 1);
    var dur = vowel ? 0.085 : 0.05;

    var osc = ac.createOscillator(), osc2 = ac.createOscillator(), bp = ac.createBiquadFilter(), g = ac.createGain();
    osc.type = 'triangle'; osc2.type = 'sine';
    osc.frequency.setValueAtTime(f * 1.06, t);         // começa um pouco acima e "cai": dá o jeitinho de sílaba
    osc.frequency.exponentialRampToValueAtTime(f, t + dur * 0.8);
    osc2.frequency.setValueAtTime(f * 2, t);
    bp.type = 'bandpass'; bp.Q.value = vowel ? 2.2 : 0.9;
    bp.frequency.value = vowel || (900 + (code % 7) * 120);
    var peak = 0.34 * lv * lv;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(bp); osc2.connect(g); bp.connect(g); g.connect(ac.destination);
    osc.start(t); osc2.start(t); osc.stop(t + dur + 0.02); osc2.stop(t + dur + 0.02);
  }

  // ---- "fala" letra por letra ----
  function collect(el) {
    var out = [], w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null), n;
    while ((n = w.nextNode())) out.push(n);
    return out;
  }
  function setReveal(n) {
    var left = n;
    for (var i = 0; i < nodes.length; i++) {
      var s = texts[i];
      nodes[i].nodeValue = left >= s.length ? s : s.slice(0, Math.max(0, left));
      left -= s.length;
    }
  }
  function say(html) {
    clearInterval(typeTimer);
    panel.classList.remove('tut-talk');
    full.innerHTML = html; typed.innerHTML = html;
    nodes = collect(typed); texts = nodes.map(function (n) { return n.nodeValue; });
    total = texts.reduce(function (a, s) { return a + s.length; }, 0);
    plain = texts.join('');
    if (reduced) { cursor = total; setReveal(total); panel.classList.remove('tut-talk'); return; }
    cursor = 0; setReveal(0);
    var delay = entering ? 550 : 0;                   // na entrada, espera ele chegar antes de falar
    entering = false;
    typeTimer = setTimeout(function () {
    panel.classList.add('tut-talk');
    typeTimer = setInterval(function () {
      var from = cursor;
      cursor += 1 + (cursor > 40 ? 1 : 0);
      setReveal(cursor);
      for (var k = from; k < Math.min(cursor, total); k++) {      // 1 blip pra cada letra nova (o intervalo mínimo evita excesso)
        if (/[A-Za-zÀ-ÿ]/.test(plain.charAt(k))) { blip(plain.charAt(k), /[?]\s*$/.test(plain) && cursor > total - 12); break; }
      }
      if (cursor >= total) { clearInterval(typeTimer); panel.classList.remove('tut-talk'); }
    }, TYPE_MS);
    }, delay);
  }
  function finishTyping() {
    if (cursor >= total) return false;
    clearInterval(typeTimer); cursor = total; setReveal(total); panel.classList.remove('tut-talk');
    return true;
  }

  // ---- passos ----
  function show(i) {
    idx = Math.max(0, Math.min(STEPS.length - 1, i));
    var s = STEPS[idx];
    var uiChanged = (s.ui || 'none') !== ui;           // abriu/fechou/trocou modal? então o alvo ainda vai se mexer
    setUi(s.ui || 'none');
    spot.classList.add('tut-move');
    clearTimeout(moveTimer); moveTimer = setTimeout(function () { spot.classList.remove('tut-move'); }, 450);
    say(typeof s.text === 'function' ? s.text() : s.text);
    countEl.textContent = (idx + 1) + ' / ' + STEPS.length;
    btnBack.hidden = idx === 0;
    btnNext.textContent = s.next || (idx === STEPS.length - 1 ? 'Terminar' : 'Próximo');
    btnSkip.textContent = s.skip || 'Pular';
    btnSkip.hidden = mandatory || idx === STEPS.length - 1;     // 1ª vez: tutorial obrigatório, sem "pular"
    syncAsk();
    markDirty();                                       // depois do modal terminar de abrir, o track() posiciona
    if (!s.target || !uiChanged) layout();             // alvo parado: decide o canto já. Modal animando: espera assentar (senão ele vai pro outro canto e volta)
    if (s.ask && window.matchMedia && matchMedia('(hover: hover)').matches) setTimeout(function () { var i = nameInput(); if (running && idx === STEPS.indexOf(s) && i) i.focus({ preventScroll: true }); }, 900);
    else btnNext.focus({ preventScroll: true });
  }
  // no passo da pergunta o "Pronto!" só libera depois que o nome é escrito
  function syncAsk() {
    if (!running) return;
    btnNext.disabled = !!STEPS[idx].ask && !nameNow();
  }
  function onNameInput() { syncAsk(); }
  function next() {
    if (!started) return;
    if (finishTyping()) { boing(); return; }
    if (STEPS[idx].ask && !nameNow()) {               // sem nome não passa: balança o crachá e foca
      var bd = document.querySelector('.name-badge'), i = nameInput();
      if (bd) { bd.classList.remove('tut-shake'); void bd.offsetWidth; bd.classList.add('tut-shake'); }
      if (i) i.focus();
      return;
    }
    if (idx >= STEPS.length - 1) return stop(true);
    boing();
    show(idx + 1);
  }
  function back() { if (started && idx > 0) { boing(); show(idx - 1); } }

  function onKey(e) {
    if (!running) return;
    var k = e.key;
    if (k === 'Escape') {                              // 1ª vez é obrigatório: Esc não pula
      e.preventDefault(); e.stopPropagation();
      if (!mandatory) stop(false);
      return;
    }
    // digitando no crachá: as teclas são do campo (só Enter confirma)
    if (e.target && e.target.tagName === 'INPUT' && !(e.target.closest && e.target.closest('.tut-root'))) {
      if (k === 'Enter' && STEPS[idx].ask) { e.preventDefault(); e.stopPropagation(); next(); }
      return;
    }
    // Enter num botão do próprio tutorial (ex.: "Voltar") faz o que o botão diz
    if (k === 'Enter' && e.target && e.target.tagName === 'BUTTON' && e.target.closest && e.target.closest('.tut-root')) return;
    if (k === 'ArrowRight' || k === 'Enter') { e.preventDefault(); e.stopPropagation(); next(); }
    else if (k === 'ArrowLeft') { e.preventDefault(); e.stopPropagation(); back(); }
  }

  function build() {
    css();
    root = document.createElement('div');
    root.className = 'tut-root';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-label', 'Tutorial do TruTEC com o Jailson');
    root.innerHTML =
      '<div class="tut-block"></div>' +
      '<div class="tut-spot tut-none"><div class="tut-ring"></div></div>' +
      '<div class="tut-panel">' +
        '<div class="tut-guide" title="Clique pra acelerar a fala"><img src="' + GUIDE + '" alt="Jailson, o guia do TruTEC" draggable="false"></div>' +
        '<div class="tut-bubble" aria-live="polite">' +
          '<span class="tut-bg"><i class="tut-tail"></i></span><span class="tut-name">Jailson</span>' +
          '<div class="tut-text"><div class="tut-full"></div><div class="tut-typed"></div></div>' +
          '<div class="tut-foot"><span class="tut-count"></span>' +
            '<button type="button" class="tut-skip">Pular</button>' +
            '<button type="button" class="tut-btn tut-back">Voltar</button>' +
            '<button type="button" class="tut-btn tut-go">Próximo</button></div>' +
        '</div>' +
      '</div>';
    document.body.appendChild(root);
    resetPhys();
    block = root.querySelector('.tut-block');
    spot = root.querySelector('.tut-spot'); panel = root.querySelector('.tut-panel');
    guideImg = root.querySelector('.tut-guide'); bubble = root.querySelector('.tut-bubble');
    typed = root.querySelector('.tut-typed'); full = root.querySelector('.tut-full');
    gImg = guideImg.querySelector('img');
    countEl = root.querySelector('.tut-count');
    btnNext = root.querySelector('.tut-go'); btnBack = root.querySelector('.tut-back'); btnSkip = root.querySelector('.tut-skip');
    btnNext.addEventListener('click', next);
    btnBack.addEventListener('click', back);
    btnSkip.addEventListener('click', function () { stop(false); });
    guideImg.addEventListener('click', function () { boing(); finishTyping(); });
    panel.style.visibility = 'hidden';                // só aparece quando a imagem do guia carregou (senão a largura é medida errada)
  }

  function onResize() { layout(true); }
  function seenFlag() { try { return !!localStorage.getItem(FLAG); } catch (e) { return false; } }

  function inLobby() {
    var el = document.getElementById('screen-lobby');
    return !!(el && el.classList.contains('active'));
  }

  // fecha qualquer modal que o jogador tenha deixado aberto antes do tutorial começar
  function closeAll() {
    [['#themes-modal', '#tab-geral-back'], ['#settings-modal', '#settings-close'], ['#help-modal', '#help-close'],
     ['#join-modal', '#join-cancel'], ['#create-modal', '#create-cancel']].forEach(function (p) {
      var m = document.querySelector(p[0]);
      if (m && !m.classList.contains('hidden')) click(p[1]);
    });
  }

  function start() {
    if (running || !inLobby()) return false;
    closeAll();
    mandatory = !seenFlag();
    running = true; ui = 'none'; started = false; flipTo = null;
    curCand = -1; lastRect = ''; firstLayout = true; entering = true; t0 = Date.now();
    build();
    syncFab();
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('resize', onResize);
    var ni = nameInput(); if (ni) ni.addEventListener('input', onNameInput);
    var ac = voiceCtx(); if (ac && ac.state === 'suspended') { try { ac.resume(); } catch (e) {} }   // se veio de um clique, já libera o som
    raf = requestAnimationFrame(track);
    var r = root, gi = guideImg.querySelector('img'), done = false, to = 0;
    function go() {
      if (done) return; done = true; clearTimeout(to);
      if (!running || root !== r) return;
      started = true;
      show(0);                                        // a entrada mede o painel já com a imagem carregada
      panel.style.visibility = '';
    }
    if (gi.complete && gi.naturalWidth) go();
    else { gi.addEventListener('load', go); gi.addEventListener('error', go); to = setTimeout(go, 1500); }
    return true;
  }

  function stop(done) {
    if (!running) return;
    if (done === true) { try { localStorage.setItem(FLAG, '1'); } catch (e) {} }   // só conta como "visto" quando termina
    pending = false;
    running = false; started = false; flipTo = null;
    var ni = nameInput(); if (ni) ni.removeEventListener('input', onNameInput);
    clearInterval(typeTimer); clearTimeout(moveTimer); clearTimeout(relayoutTimer); clearTimeout(enterTimer); clearTimeout(flipTimer);
    cancelAnimationFrame(raf);
    window.removeEventListener('keydown', onKey, true);
    window.removeEventListener('resize', onResize);
    setUi('none');                                    // fecha o modal que o guia abriu
    if (root && root.parentNode) root.parentNode.removeChild(root);
    root = null;
    syncFab();
  }

  // ---- botão redondo (só na tela inicial) ----
  var fab = null;
  function syncFab() {
    if (pending && !running && inLobby()) { pending = false; start(); return; }   // 1ª visita: começa assim que chegar na tela inicial
    if (!fab) return;
    fab.hidden = running || !inLobby();
  }
  function setupFab() {
    css();
    fab = document.createElement('button');
    fab.type = 'button';
    fab.className = 'tut-fab';
    fab.title = 'Tutorial: o Jailson te ensina a jogar';
    fab.setAttribute('aria-label', 'Chamar o Jailson (tutorial)');
    fab.addEventListener('click', start);
    document.body.appendChild(fab);
    var lobby = document.getElementById('screen-lobby');
    if (lobby && window.MutationObserver) new MutationObserver(syncFab).observe(lobby, { attributes: true, attributeFilter: ['class'] });
    syncFab();
  }

  window.TruTutorial = { start: start, stop: function () { stop(false); }, running: function () { return running; }, available: inLobby };

  function init() {
    setupFab();
    var q = new URLSearchParams(location.search).get('tutorial');
    // 1ª visita (ou ?tutorial=1): abre sozinho e é obrigatório até o fim
    if (!seenFlag() || q === '1') {
      pending = true;
      setTimeout(function () { if (pending && !running && inLobby()) { pending = false; start(); } }, 1200);
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
