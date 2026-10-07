// ============================================================================
// DEMOS DO MOSAICO "JOGAR" (atrás de Truco Paulista e de Trutec)
// TruModeDemo.start(elTruco, elTrutec) / .stop()
// - Truco Paulista: 4 bots jogando de verdade (baralho, manilha, vazas, truco/seis, placar até 12).
// - Trutec: um bot jogando a mão, a pontuação (fichas × mult, curingas) e a loja (compra, rola, próxima blind).
// Tudo é só DOM + CSS, sem som, e para sozinho quando o mosaico fecha (stop()).
// ============================================================================
(function () {
  var STOP = {}, tok = 0;
  function sl(ms, t) { return new Promise(function (ok, no) { setTimeout(function () { t === tok ? ok() : no(STOP); }, ms); }); }
  function h(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function rnd(n) { return Math.random() * n | 0; }
  function shuf(a) { for (var i = a.length - 1; i > 0; i--) { var j = rnd(i + 1), x = a[i]; a[i] = a[j]; a[j] = x; } return a; }
  function reflow(e) { void e.offsetWidth; }

  var R = ['4', '5', '6', '7', 'Q', 'J', 'K', 'A', '2', '3'], S = ['ouros', 'espadas', 'copas', 'paus'];
  var SY = { ouros: '♦', espadas: '♠', copas: '♥', paus: '♣' };
  function deck() { var d = []; S.forEach(function (s) { R.forEach(function (r) { d.push({ r: r, s: s }); }); }); return shuf(d); }
  function pw(c, m) { return c.r === m ? 100 + S.indexOf(c.s) : R.indexOf(c.r); }
  function face(c, cls) {
    var red = c.s === 'ouros' || c.s === 'copas' ? ' red' : '';
    return h('div', 'dc' + red + (cls ? ' ' + cls : ''), '<b>' + c.r + '</b><i>' + SY[c.s] + '</i><u>' + c.r + '</u>');
  }
  function back(cls) { return h('div', 'dc back' + (cls ? ' ' + cls : '')); }

  // ======================= TRUCO PAULISTA =======================
  var NAMES = ['Rafa', 'Bia', 'Dani', 'Zeca'], HUE = [0, 95, 200, 310];
  var SLOT = [[0, '9em'], ['-9em', 0], [0, '-9em'], ['9em', 0]];          // de onde a carta "voa" (por assento)
  function buildTruco(root) {
    root.innerHTML = '';
    var T = { seat: [], hand: [], slot: [], bub: [] };
    var f = h('div', 'd-felt'); f.appendChild(h('div', 'd-table'));
    T.sc = [h('i', '', '0'), h('i', '', '0')];
    var hud = h('div', 'd-hud'), sc = h('span', 'd-score');
    sc.appendChild(h('b', '', 'NÓS')); sc.appendChild(T.sc[0]); sc.appendChild(h('em', '', '×')); sc.appendChild(T.sc[1]); sc.appendChild(h('b', '', 'ELES'));
    T.pips = [h('s'), h('s'), h('s')]; var pw_ = h('span', 'd-pips'); T.pips.forEach(function (p) { pw_.appendChild(p); });
    var l = h('div', 'd-hudl'); l.appendChild(sc); l.appendChild(pw_); hud.appendChild(l);
    T.vira = h('span', 'd-vira'); T.val = h('span', 'd-val', 'VALE 1');
    var r = h('div', 'd-hudr'); r.appendChild(T.vira); r.appendChild(T.val); hud.appendChild(r);
    f.appendChild(hud);
    for (var i = 0; i < 4; i++) {
      var s = h('div', 'd-seat s' + i), im = h('img', 'd-av'); im.src = 'assets/personagem.svg'; im.alt = ''; im.style.filter = 'hue-rotate(' + HUE[i] + 'deg)';
      var hd = h('div', 'd-hand'), bu = h('div', 'd-bub');
      s.appendChild(bu); s.appendChild(im); s.appendChild(h('small', '', i === 0 ? NAMES[0] + ' (dupla)' : NAMES[i])); s.appendChild(hd);
      f.appendChild(s); T.seat[i] = s; T.hand[i] = hd; T.bub[i] = bu;
      var sp = h('div', 'd-slot p' + i); sp.style.setProperty('--fx', SLOT[i][0]); sp.style.setProperty('--fy', SLOT[i][1]);
      f.appendChild(sp); T.slot[i] = sp;
    }
    f.appendChild(T.banner = h('div', 'd-banner'));
    root.appendChild(f);
    return T;
  }

  async function playTruco(root, t) {
    var T = buildTruco(root), sc = [0, 0], dealer = 0;
    function say(seat, txt, big) {
      var b = T.bub[seat]; b.textContent = txt; b.className = 'd-bub show' + (big ? ' big' : '');
      setTimeout(function () { if (t === tok) b.className = 'd-bub'; }, 1300);
    }
    function hud() { T.sc[0].textContent = sc[0]; T.sc[1].textContent = sc[1]; }
    function pick(hand, played, seat, m) {
      var s = hand.slice().sort(function (a, b) { return pw(a, m) - pw(b, m); });
      var best = null; played.forEach(function (p) { if (!best || pw(p.c, m) > pw(best.c, m)) best = p; });
      if (!best) return Math.random() < 0.55 ? s[s.length - 1] : s[Math.floor((s.length - 1) / 2)];
      if (best.seat % 2 === seat % 2) return s[0];
      var up = s.filter(function (c) { return pw(c, m) > pw(best.c, m); });
      return up.length ? up[0] : s[0];
    }
    while (true) {
      var d = deck(), vira = d.pop(), m = R[(R.indexOf(vira.r) + 1) % 10], hands = [[], [], [], []];
      for (var k = 0; k < 4; k++) { T.hand[k].innerHTML = ''; for (var j = 0; j < 3; j++) { var c = d.pop(); hands[k].push(c); T.hand[k].appendChild(k === 0 ? face(c, 'sm') : back('sm')); } }
      T.vira.innerHTML = 'Vira '; T.vira.appendChild(face(vira, 'xs')); T.val.textContent = 'VALE 1'; T.val.classList.remove('hot');
      T.pips.forEach(function (p) { p.className = ''; }); hud();
      await sl(900, t);
      var wins = [0, 0], val = 1, lead = (dealer + 1) % 4, ran = -1, raised = false;
      for (var tr = 0; tr < 3 && wins[0] < 2 && wins[1] < 2 && ran < 0; tr++) {
        if (tr > 0 && val === 1 && Math.random() < 0.6) {                   // alguém pede truco
          var cs = (lead + rnd(2)) % 4, rs = (cs + 1) % 4;
          say(cs, 'TRUCO!', true); T.val.textContent = 'VALE 3'; T.val.classList.add('hot'); await sl(1000, t);
          if (Math.random() < 0.75) {
            say(rs, Math.random() < 0.5 ? 'Desce!' : 'Aceito'); val = 3; await sl(900, t);
            if (Math.random() < 0.3) { say(rs, 'SEIS!', true); T.val.textContent = 'VALE 6'; await sl(1000, t); say(cs, 'Aceito'); val = 6; await sl(800, t); }
          } else { say(rs, 'Corre!'); ran = cs % 2; T.val.textContent = 'VALE 1'; await sl(900, t); break; }
        }
        var played = [];
        for (var q = 0; q < 4; q++) {
          var seat = (lead + q) % 4, card = pick(hands[seat], played, seat, m), ix = hands[seat].indexOf(card);
          hands[seat].splice(ix, 1); T.hand[seat].removeChild(T.hand[seat].children[ix]);
          var el = face(card, 'fl'); T.slot[seat].innerHTML = ''; T.slot[seat].appendChild(el); reflow(el); el.classList.remove('fl');
          played.push({ seat: seat, c: card }); await sl(620, t);
        }
        var w = played[0]; played.forEach(function (p) { if (pw(p.c, m) > pw(w.c, m)) w = p; });
        wins[w.seat % 2]++; T.pips[tr].className = 'w' + (w.seat % 2);
        T.slot[w.seat].classList.add('win'); await sl(800, t);
        T.slot.forEach(function (sp, i) { var c = sp.firstChild; if (!c) return; c.style.setProperty('--tx', SLOT[w.seat][0]); c.style.setProperty('--ty', SLOT[w.seat][1]); c.classList.add('out'); sp.classList.remove('win'); });
        await sl(450, t); T.slot.forEach(function (sp) { sp.innerHTML = ''; });
        lead = w.seat;
      }
      var team = ran >= 0 ? ran : (wins[0] > wins[1] ? 0 : 1), pts = ran >= 0 ? 1 : val;
      sc[team] += pts; hud();
      T.banner.textContent = (team === 0 ? 'NÓS' : 'ELES') + ' +' + pts; T.banner.classList.add('show'); await sl(1100, t); T.banner.classList.remove('show');
      T.hand.forEach(function (x) { x.innerHTML = ''; });
      if (sc[0] >= 12 || sc[1] >= 12) {
        T.banner.textContent = (sc[0] >= 12 ? 'NÓS' : 'ELES') + ' VENCEM!'; T.banner.classList.add('show', 'big'); await sl(1800, t);
        T.banner.classList.remove('show', 'big'); sc = [0, 0]; hud();
      }
      dealer = (dealer + 1) % 4; await sl(300, t);
    }
  }

  // ======================= TRUTEC =======================
  var JK = [
    { id: 'tres', name: 'Três Amigo', price: 4, chips: 25 }, { id: 'sete', name: 'Sete Belo', price: 4, chips: 20 },
    { id: 'maocheia', name: 'Mão Cheia', price: 4, chips: 15 }, { id: 'manilheiro', name: 'Manilheiro', price: 5, mult: 4 },
    { id: 'banqueiro', name: 'Banqueiro', price: 5, mult: 6 }, { id: 'gato', name: 'Gato de Sete', price: 5, mult: 8 },
    { id: 'zap', name: 'Zap!', price: 6, mult: 10 }, { id: 'coelho', name: 'Pé de Coelho', price: 6, xm: 1.5 }
  ];
  var CV = { '4': 4, '5': 5, '6': 6, '7': 7, 'Q': 10, 'J': 10, 'K': 10, 'A': 11, '2': 12, '3': 13 };
  function ic(k) { return '<svg class="tt-ic" viewBox="0 0 24 24" aria-hidden="true"><use href="#tt-ic-' + k + '"/></svg>'; }
  function count(el, to, ms, t, fmt) {
    var from = +el.dataset.v || 0, t0 = performance.now(); el.dataset.v = to; fmt = fmt || String;
    return new Promise(function (ok) {
      (function st(n) {
        if (t !== tok) return ok();
        var k = Math.min(1, (n - t0) / ms), e = 1 - Math.pow(1 - k, 3);
        el.textContent = fmt(Math.round(from + (to - from) * e));
        k < 1 ? requestAnimationFrame(st) : ok();
      })(t0);
    });
  }
  function fm(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.'); }

  function buildTrutec(root) {
    root.innerHTML = '';
    var W = h('div', 'tt-demo t-wrap'), X = {};
    W.innerHTML =
      '<aside class="t-side"><div class="t-ante">Ante 1/4</div>' +
      '<div class="t-blind"><b class="t-bn"></b><small class="t-be"></small><div class="t-goal"><span>Meta <b class="t-meta">0</b></span><span>Pontos <b class="t-score">0</b></span></div>' +
      '<div class="t-bar"><i></i></div><div class="t-cnt"><span>Mãos <b class="t-hands">4</b></span><span>Trocas <b>3</b></span></div></div>' +
      '<div class="t-calc"><div class="t-cm"><span class="t-chips">30</span><i>×</i><span class="t-mult">1</span></div><div class="t-total"></div><div class="t-pipsr"><s></s><s></s><s></s></div></div>' +
      '<div class="t-money">Dinheiro <b>$4</b></div></aside>' +
      '<main class="t-main"><div class="t-jokers"></div><div class="t-opp"></div><div class="t-msg"></div>' +
      '<div class="t-table"><div class="t-slot o"></div><div class="t-slot m"></div></div><div class="t-hand"></div></main>' +
      '<section class="t-shop"></section>';
    root.appendChild(W);
    ['t-bn', 't-be', 't-meta', 't-score', 't-hands', 't-chips', 't-mult', 't-total', 't-money', 't-jokers', 't-opp', 't-msg', 't-hand', 't-shop', 't-ante'].forEach(function (c) { X[c] = W.querySelector('.' + c); });
    X.bar = W.querySelector('.t-bar i'); X.pips = W.querySelectorAll('.t-pipsr s'); X.so = W.querySelector('.t-table .o'); X.sm = W.querySelector('.t-table .m'); X.W = W;
    return X;
  }

  async function playTrutec(root, t) {
    var X = buildTrutec(root), jokers = [], money = 4, ante = 1;
    function drawJokers(pop) {
      X['t-jokers'].innerHTML = '';
      for (var i = 0; i < 5; i++) {
        var j = jokers[i], e = h('div', 'tj' + (j ? '' : ' empty') + (pop === i ? ' pop' : ''), j ? ic(j.id) + '<small>' + j.name + '</small>' : '');
        X['t-jokers'].appendChild(e);
      }
    }
    function calc(won, lvl) {      // passos de pontuação: cartas ganhas -> curingas
      var chips = 30, mult = lvl, xm = 1, steps = [];
      won.forEach(function (c) { chips += CV[c.r]; steps.push({ chips: chips, mult: mult, xm: xm, label: c.r + SY[c.s] + ' +' + CV[c.r] + ' fichas' }); });
      jokers.forEach(function (j, i) {
        if (j.chips) chips += j.chips; if (j.mult) mult += j.mult; if (j.xm) xm *= j.xm;
        steps.push({ chips: chips, mult: mult, xm: xm, label: j.name + ' ' + (j.chips ? '+' + j.chips + ' fichas' : j.mult ? '+' + j.mult + ' mult' : '×' + j.xm + ' mult'), j: i });
      });
      return { steps: steps, total: Math.round(chips * mult * xm), chips: chips, mult: mult, xm: xm };
    }
    function deal() {                 // eu: cartas altas; rival: baixas (a demo sempre ganha a mão)
      var hi = shuf(['Q', 'K', 'A', '2', '3']).slice(0, 3), lo = shuf(['4', '5', '6', '7', 'J']).slice(0, 3);
      return { me: hi.map(function (r) { return { r: r, s: S[rnd(4)] }; }).sort(function (a, b) { return R.indexOf(b.r) - R.indexOf(a.r); }),
               op: lo.map(function (r) { return { r: r, s: S[rnd(4)] }; }) };
    }
    async function oneHand(D, lvl, meta, scoreBefore) {
      X['t-hand'].innerHTML = ''; X['t-opp'].innerHTML = ''; X.so.innerHTML = ''; X.sm.innerHTML = '';
      X.pips.forEach(function (p) { p.className = ''; }); X['t-total'].textContent = ''; X['t-msg'].textContent = '';
      D.me.forEach(function (c) { X['t-hand'].appendChild(face(c)); }); D.op.forEach(function () { X['t-opp'].appendChild(back('sm')); });
      X['t-chips'].textContent = 30; X['t-chips'].dataset.v = 30; X['t-mult'].textContent = lvl; X['t-mult'].dataset.v = lvl;
      await sl(900, t);
      if (lvl > 1) { X['t-msg'].textContent = 'TRUCO! Agora vale ×' + lvl; X['t-msg'].classList.add('hot'); await sl(1100, t); X['t-msg'].classList.remove('hot'); }
      var won = [];
      for (var i = 0; i < 2; i++) {                  // duas vazas: eu jogo, o rival responde, eu ganho
        var mc = D.me[i], oc = D.op[i];
        var mine = X['t-hand'].children[0]; X['t-hand'].removeChild(mine); mine.classList.add('fl'); X.sm.appendChild(mine); reflow(mine); mine.classList.remove('fl');
        await sl(600, t);
        X['t-opp'].removeChild(X['t-opp'].children[0]); var oe = face(oc, 'fl'); X.so.appendChild(oe); reflow(oe); oe.classList.remove('fl');
        await sl(700, t);
        X.pips[i].className = 'on'; mine.classList.add('win'); won.push(mc); await sl(700, t);
        X.so.innerHTML = ''; X.sm.innerHTML = '';
      }
      X['t-msg'].textContent = 'Contando os pontos…'; await sl(300, t);
      var res = calc(won, lvl), done = null;
      for (var s = 0; s < res.steps.length; s++) {
        var st = res.steps[s];
        X['t-msg'].textContent = st.label;
        if (st.j !== undefined) drawJokers(st.j);
        var xs = st.xm > 1 ? ' ×' + Math.round(st.xm * 100) / 100 : '';
        count(X['t-chips'], st.chips, 380, t); count(X['t-mult'], st.mult, 380, t, function (n) { return n + xs; });
        await sl(560, t);
      }
      X['t-msg'].textContent = '+' + fm(res.total) + ' pontos!';
      await count(X['t-total'], res.total, 800, t, function (n) { return '= ' + fm(n); });
      var ns = scoreBefore + res.total;
      count(X['t-score'], ns, 700, t, fm); X.bar.style.width = Math.min(100, ns / meta * 100) + '%';
      await sl(900, t); drawJokers();
      return ns;
    }

    async function shop() {
      var S_ = X['t-shop'], owned = jokers.map(function (j) { return j.id; }), items, shown = money, rolls = 0;
      var gain = 4 + 2; money += gain;
      function pool() {
        var p = shuf(JK.filter(function (j) { return owned.indexOf(j.id) < 0; })).slice(0, 3).map(function (j) { return { j: j, v: false }; });
        p.push({ j: { id: 'maoextra', name: 'Mão Extra', price: 8 }, v: true }); return p;
      }
      items = pool();
      function paint(o) {
        o = o || {};
        var own = '', stall = '';
        for (var i = 0; i < 5; i++) {
          var j = jokers[i];
          own += j ? '<div class="tt-sc' + (o.just === i ? ' just' : '') + '"><div class="tt-sc-face">' + ic(j.id) + '</div><button class="btn tt-sell" tabindex="-1"><span>Vender</span><span class="tt-price">$' + (j.price >> 1) + '</span></button></div>'
                   : '<div class="tt-sc empty"><div class="tt-sc-face"></div></div>';
        }
        items.forEach(function (it, i) {
          var poor = money < it.j.price;
          stall += '<div class="tt-sc' + (poor ? ' poor' : '') + '" style="--i:' + i + '"><div class="tt-sc-face' + (it.v ? ' voucher' : '') + '">' + ic(it.j.id) + (it.v ? '<span class="tt-sc-tag">PERM.</span>' : '') + '</div>' +
                   '<span class="tt-sc-name">' + it.j.name + '</span><button class="btn tt-buy' + (o.press === i ? ' press' : '') + '" tabindex="-1"' + (poor ? ' disabled' : '') + '><span>Comprar</span><span class="tt-price">$' + it.j.price + '</span></button></div>';
        });
        S_.innerHTML = '<div class="tt-shop"><div class="tt-walletrow"><div class="tt-wallet"><span class="tt-coin">$</span><b class="w">' + shown + '</b></div></div>' +
          '<section class="tt-panel tt-own"><h3 class="tt-ribbon">Seus curingas<span class="tt-slotcount">' + jokers.length + '/5</span></h3><div class="tt-shopcards">' + own + '</div></section>' +
          '<section class="tt-panel tt-stall' + (o.fresh ? ' tt-fresh' : '') + '"><div class="tt-awning"></div><h3 class="tt-ribbon">Loja</h3><div class="tt-shopcards">' + stall + '</div>' +
          '<button class="btn tt-reroll' + (o.pressRoll ? ' press' : '') + '" tabindex="-1"><span>Rolar loja</span><span class="tt-price">$' + (3 + rolls) + '</span></button></section>' +
          '<button class="btn btn-primary tt-go' + (o.pressGo ? ' press' : '') + '" tabindex="-1">Próxima blind ›</button></div>';
      }
      X['t-msg'].textContent = 'Blind vencida!'; await sl(1100, t);
      paint({ fresh: true }); S_.classList.add('on'); await sl(500, t);
      await count(S_.querySelector('.w'), money, 700, t); shown = money; await sl(1100, t);
      var want = items.filter(function (it) { return !it.v && it.j.price <= money; }).sort(function (a, b) { return b.j.price - a.j.price; })[0];
      if (want && jokers.length < 5) {
        var bi = items.indexOf(want); paint({ press: bi }); await sl(260, t);
        money -= want.j.price; jokers.push(want.j); owned.push(want.j.id); items.splice(bi, 1); shown = money;
        paint({ just: jokers.length - 1 }); S_.querySelector('.tt-wallet').classList.add('lose'); await sl(1300, t);
      }
      if (money >= 3 && Math.random() < 0.55) {
        paint({ pressRoll: true }); await sl(260, t); money -= 3 + rolls; rolls++; shown = money; items = pool(); paint({ fresh: true }); await sl(1500, t);
      }
      paint({ pressGo: true }); await sl(450, t); S_.classList.remove('on'); await sl(450, t);
      X['t-money'].innerHTML = 'Dinheiro <b>$' + money + '</b>';
    }

    drawJokers();
    while (true) {
      var A = deal(), B = deal(), tmp = jokers, r1 = calc(A.me.slice(0, 2), 1), r2 = calc(B.me.slice(0, 2), 3);
      var meta = Math.round((r1.total + r2.total * 0.7) / 10) * 10;
      X['t-ante'].textContent = 'Ante ' + ante + '/4';
      X['t-bn'].textContent = ['Marquinhos Blefe', 'Dona Zica', 'Seu Tonho', 'O Coringa'][ante - 1];
      X['t-be'].textContent = ['Sem trocas nesta blind.', 'Só 3 mãos.', 'Rival esperto.', 'O chefe final.'][ante - 1];
      X['t-meta'].textContent = fm(meta); X['t-score'].textContent = 0; X['t-score'].dataset.v = 0; X.bar.style.width = '0'; X['t-hands'].textContent = 4;
      X['t-money'].innerHTML = 'Dinheiro <b>$' + money + '</b>';
      var sc = await oneHand(A, 1, meta, 0); X['t-hands'].textContent = 3;
      sc = await oneHand(B, 3, meta, sc); X['t-hands'].textContent = 2;
      await shop();
      ante = ante % 4 + 1;
      if (jokers.length >= 5 || ante === 1) { jokers = []; money = 4; ante = 1; drawJokers(); }
    }
  }

  // ======================= controle =======================
  function run(fn, el) { var t = tok; fn(el, t).catch(function (e) { if (e !== STOP && window.console) console.warn('[mode-demo]', e); }); }
  window.TruModeDemo = {
    start: function (a, b) {
      this.stop(); var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (reduced) return; if (a) run(playTruco, a); if (b) run(playTrutec, b);
    },
    stop: function () { tok++; }
  };
})();
