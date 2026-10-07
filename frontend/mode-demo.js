// ============================================================================
// DEMOS DO MOSAICO "JOGAR" (atrás de Truco Paulista e de Trutec)
// TruModeDemo.start(elTruco, elTrutec) / .stop()
// São SIMULAÇÕES DE VERDADE, nada é roteirizado:
// - Truco Paulista: 4 bots jogam com baralho, vira, manilha, vazas, empate (cangou), truco/seis/nove/doze
//   (aceitar, correr ou aumentar) e placar até 12. Quem decide é uma IA que avalia a própria mão.
// - Trutec: um bot joga uma corrida de verdade com as regras e os dados reais do jogo (TrutecData, vindo do
//   trutec.js): blinds e chefes, curingas reais, fichas × mult, trocas, truco, dinheiro, juros e loja.
// Tudo é só DOM + CSS, sem som, e para sozinho quando o mosaico fecha (stop()).
// ============================================================================
(function () {
  var STOP = {}, tok = 0;
  function sl(ms, t) { return new Promise(function (ok, no) { setTimeout(function () { t === tok ? ok() : no(STOP); }, ms); }); }
  function h(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function rnd(n) { return Math.random() * n | 0; }
  function shuf(a) { for (var i = a.length - 1; i > 0; i--) { var j = rnd(i + 1), x = a[i]; a[i] = a[j]; a[j] = x; } return a; }
  function reflow(e) { void e.offsetWidth; }
  function fm(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.'); }

  // ---------- baralho e IA (as mesmas regras do jogo) ----------
  var RK = ['4', '5', '6', '7', 'Q', 'J', 'K', 'A', '2', '3'], SU = ['ouros', 'espadas', 'copas', 'paus'];
  var SY = { ouros: '♦', espadas: '♠', copas: '♥', paus: '♣' };
  var STK = [1, 3, 6, 9, 12], CALLN = ['', 'TRUCO', 'SEIS', 'NOVE', 'DOZE'];
  function deck() { var d = []; SU.forEach(function (s) { RK.forEach(function (r) { d.push({ rank: r, suit: s }); }); }); return shuf(d); }
  function pw(c, m) { return c.rank === m ? 100 + SU.indexOf(c.suit) : RK.indexOf(c.rank); }
  function face(c, cls) {
    var red = c.suit === 'ouros' || c.suit === 'copas' ? ' red' : '';
    return h('div', 'dc' + red + (cls ? ' ' + cls : ''), '<b>' + c.rank + '</b><i>' + SY[c.suit] + '</i><u>' + c.rank + '</u>');
  }
  function back(cls) { return h('div', 'dc back' + (cls ? ' ' + cls : '')); }
  // valor de uma carta (0..1) e força estimada da mão (igual à IA do Trutec)
  function cv(c, m) { var p = pw(c, m); return p >= 100 ? 0.82 + (p - 100) * 0.06 : 0.08 + RK.indexOf(c.rank) * 0.075; }
  function est(cards, res, who, m) {
    var v = cards.map(function (c) { return cv(c, m); }).sort(function (a, b) { return b - a; });
    if (!v.length) return 0;
    var w = 0, l = 0;
    res.forEach(function (r) { if (r === who) w++; else if (r && r !== 'tie') l++; });
    if (!res.length) return v[0] * 0.45 + (v[1] || 0) * 0.35 + (v[2] || 0) * 0.2;
    if (v.length === 2) {
      if (w > l) return 0.5 + v[0] * 0.5;
      if (l > w) return v[1] * 0.45 + v[0] * 0.2;
      return v[0] * 0.85 + v[1] * 0.1;
    }
    if (w > l) return Math.min(1, 0.55 + v[0] * 0.45);
    if (l > w) return v[0] * 0.5;
    return v[0];
  }
  function noise(skill) { return (Math.random() - 0.5) * (1 - skill) * 0.6; }
  // quem ganha a mão, dado o resultado das vazas ('tie' = empate/cangou)
  function hw(res) {
    if (res.length < 2) return null;
    var a = res[0], b = res[1], c = res[2];
    if (a !== 'tie') {
      if (b === a || b === 'tie') return a;
      if (res.length < 3) return null;
      return c === 'tie' ? a : c;
    }
    if (b !== 'tie') return b;
    if (res.length < 3) return null;
    return c === 'tie' ? 'draw' : c;
  }

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

  // escolhe a carta a jogar (mesma lógica de um jogador razoável)
  function pickCard(hand, played, seat, m, res) {
    var s = hand.slice().sort(function (a, b) { return pw(a, m) - pw(b, m); });
    var best = null; played.forEach(function (p) { if (!best || pw(p.c, m) > pw(best.c, m)) best = p; });
    if (!best) {                                                  // abrindo a vaza
      if (!res.length && s.length === 3) return Math.random() < 0.5 ? s[2] : s[1];
      return s[s.length - 1];
    }
    if (best.seat % 2 === seat % 2) return s[0];                  // o parceiro já está ganhando: joga a menor
    var up = s.filter(function (c) { return pw(c, m) > pw(best.c, m); });
    return up.length ? up[0] : s[0];                              // cobre com a menor que ganha; senão descarta a menor
  }

  async function playTruco(root, t) {
    var T = buildTruco(root), sc = [0, 0], dealer = 0;
    var PER = [0, 1, 2, 3].map(function () { return { aggr: 0.2 + Math.random() * 0.5, bluff: 0.03 + Math.random() * 0.07, skill: 0.5 + Math.random() * 0.4 }; });
    function say(seat, txt, big) {
      var b = T.bub[seat]; b.textContent = txt; b.className = 'd-bub show' + (big ? ' big' : '');
      setTimeout(function () { if (t === tok) b.className = 'd-bub'; }, 1300);
    }
    function hudScore() { T.sc[0].textContent = sc[0]; T.sc[1].textContent = sc[1]; }
    function setVal(level) { T.val.textContent = 'VALE ' + STK[level]; T.val.classList.toggle('hot', level > 0); }

    // pedido de truco/seis/nove/doze: o adversário aceita, corre ou aumenta, e assim por diante
    async function negotiate(cs, S, hands, res, m) {
      var pending = S.level + 1;
      while (true) {
        var rs = (cs + 1) % 4, ct = cs % 2, rt = 1 - ct;
        say(cs, CALLN[pending] + '!', true); T.val.textContent = 'VALE ' + STK[pending]; T.val.classList.add('hot');
        await sl(1000, t);
        var P = PER[rs];
        var e = (est(hands[rs], res, rt, m) + est(hands[(rs + 2) % 4], res, rt, m)) / 2 + noise(P.skill);
        if (e < 0.42 + 0.06 * pending - P.aggr * 0.06) {          // corre
          say(rs, 'Corre!'); setVal(S.level); await sl(900, t);
          return { ran: rt };
        }
        S.level = pending;
        if (e > 0.86 && pending < 4 && Math.random() < 0.45) {    // aceita e aumenta
          S.last = rt; pending = S.level + 1; cs = rs;
          continue;
        }
        S.last = ct; setVal(S.level);
        say(rs, Math.random() < 0.5 ? 'Desce!' : 'Aceito'); await sl(900, t);
        return { ran: null };
      }
    }

    while (true) {
      var d = deck(), vira = d.pop(), m = RK[(RK.indexOf(vira.rank) + 1) % 10], hands = [[], [], [], []];
      for (var k = 0; k < 4; k++) {
        T.hand[k].innerHTML = '';
        for (var j = 0; j < 3; j++) { var c = d.pop(); hands[k].push(c); T.hand[k].appendChild(k === 0 ? face(c, 'sm') : back('sm')); }
      }
      T.vira.innerHTML = 'Vira '; T.vira.appendChild(face(vira, 'xs'));
      T.pips.forEach(function (p) { p.className = ''; }); setVal(0); hudScore();
      await sl(900, t);

      var S = { level: 0, last: -1 }, res = [], lead = (dealer + 1) % 4, outcome = null;
      for (var tr = 0; tr < 3 && !outcome; tr++) {
        var played = [];
        for (var q = 0; q < 4 && !outcome; q++) {
          var seat = (lead + q) % 4, team = seat % 2, P = PER[seat];
          if (S.level < 4 && S.last !== team) {                    // pode pedir truco (ou aumentar)
            var e = est(hands[seat], res, team, m) + noise(P.skill);
            var pr = e > 0.64 - P.aggr * 0.12 ? (0.3 + P.aggr * 0.4) * 0.4 : P.bluff * 0.4;
            if (Math.random() < pr) {
              var nr = await negotiate(seat, S, hands, res, m);
              if (nr.ran !== null) outcome = { team: 1 - nr.ran, pts: STK[S.level], ran: true };
            }
          }
          if (outcome) break;
          var card = pickCard(hands[seat], played, seat, m, res), ix = hands[seat].indexOf(card);
          hands[seat].splice(ix, 1); T.hand[seat].removeChild(T.hand[seat].children[ix]);
          var el = face(card, 'fl'); T.slot[seat].innerHTML = ''; T.slot[seat].appendChild(el); reflow(el); el.classList.remove('fl');
          played.push({ seat: seat, c: card }); await sl(640, t);
        }
        if (outcome) break;
        // resolve a vaza: maior carta; empate só conta se for entre times diferentes
        var mx = -1; played.forEach(function (p) { mx = Math.max(mx, pw(p.c, m)); });
        var top = played.filter(function (p) { return pw(p.c, m) === mx; });
        var teams = []; top.forEach(function (p) { if (teams.indexOf(p.seat % 2) < 0) teams.push(p.seat % 2); });
        var r = teams.length > 1 ? 'tie' : teams[0];
        res.push(r); T.pips[tr].className = r === 'tie' ? 'wt' : 'w' + r;
        if (r !== 'tie') T.slot[top[0].seat].classList.add('win');
        await sl(800, t);
        var ws = r === 'tie' ? lead : top[0].seat;
        T.slot.forEach(function (sp) { var cc = sp.firstChild; if (!cc) return; cc.style.setProperty('--tx', SLOT[ws][0]); cc.style.setProperty('--ty', SLOT[ws][1]); cc.classList.add('out'); sp.classList.remove('win'); });
        await sl(450, t); T.slot.forEach(function (sp) { sp.innerHTML = ''; });
        lead = ws;
        var w = hw(res);
        if (w === 'draw') outcome = { draw: true };
        else if (w !== null) outcome = { team: w, pts: STK[S.level] };
      }

      if (!outcome) outcome = { draw: true };
      if (outcome.draw) T.banner.textContent = 'EMPATE';
      else {
        sc[outcome.team] += outcome.pts; hudScore();
        T.banner.textContent = (outcome.team === 0 ? 'NÓS' : 'ELES') + ' +' + outcome.pts + (outcome.ran ? ' (correram)' : '');
      }
      T.banner.classList.add('show'); await sl(1200, t); T.banner.classList.remove('show');
      T.slot.forEach(function (sp) { sp.innerHTML = ''; }); T.hand.forEach(function (x) { x.innerHTML = ''; });
      if (sc[0] >= 12 || sc[1] >= 12) {
        T.banner.textContent = (sc[0] >= 12 ? 'NÓS' : 'ELES') + ' VENCEM!'; T.banner.classList.add('show', 'big'); await sl(1800, t);
        T.banner.classList.remove('show', 'big'); sc = [0, 0]; hudScore();
      }
      dealer = (dealer + 1) % 4; await sl(300, t);
    }
  }

  // ======================= TRUTEC =======================
  function ic(k) {
    if (!/^[a-z]+$/.test(k)) return '<span class="tt-emo">' + k + '</span>';        // curinga com emoji no lugar do ícone
    return '<svg class="tt-ic" viewBox="0 0 24 24" aria-hidden="true"><use href="#tt-ic-' + k + '"/></svg>';
  }
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
  function put(el, v, fmt) { el.dataset.v = v; el.textContent = (fmt || String)(v); }

  function buildTrutec(root) {
    root.innerHTML = '';
    var W = h('div', 'tt-demo t-wrap'), X = {};
    W.innerHTML =
      '<aside class="t-side"><div class="t-ante"></div>' +
      '<div class="t-blind"><b class="t-bn"></b><small class="t-be"></small><div class="t-goal"><span>Meta <b class="t-meta">0</b></span><span>Pontos <b class="t-score">0</b></span></div>' +
      '<div class="t-bar"><i></i></div><div class="t-cnt"><span>Mãos <b class="t-hands">0</b></span><span>Trocas <b class="t-trocas">0</b></span></div></div>' +
      '<div class="t-calc"><div class="t-cm"><span class="t-chips">30</span><i>×</i><span class="t-mult">1</span></div><div class="t-total"></div><div class="t-pipsr"><s></s><s></s><s></s></div></div>' +
      '<div class="t-money">Dinheiro <b>$4</b></div></aside>' +
      '<main class="t-main"><div class="t-jokers"></div><div class="t-opp"></div><div class="t-msg"></div>' +
      '<div class="t-table"><div class="t-slot o"></div><div class="t-slot m"></div></div><div class="t-hand"></div></main>' +
      '<section class="t-shop"></section>';
    root.appendChild(W);
    ['t-ante', 't-bn', 't-be', 't-meta', 't-score', 't-hands', 't-trocas', 't-chips', 't-mult', 't-total', 't-money', 't-jokers', 't-opp', 't-msg', 't-hand', 't-shop'].forEach(function (c) { X[c] = W.querySelector('.' + c); });
    X.bar = W.querySelector('.t-bar i'); X.pips = W.querySelectorAll('.t-pipsr s'); X.so = W.querySelector('.t-table .o'); X.sm = W.querySelector('.t-table .m'); X.W = W;
    return X;
  }

  async function playTrutec(root, t) {
    var D = window.TrutecData;
    if (!D) return;                                              // trutec.js não carregou: sem demo
    var X = buildTrutec(root), R = null, H = null;
    function z(ms) { return sl(Math.round(ms * 0.85), t); }
    function jk(id) { return D.JOKERS.filter(function (j) { return j.id === id; })[0]; }
    function vc(id) { return D.VOUCHERS.filter(function (v) { return v.id === id; })[0]; }
    function hasJ(id) { return R.jokers.indexOf(id) >= 0; }
    function hasV(id) { return R.vouchers.indexOf(id) >= 0; }
    function other(w) { return w === 'me' ? 'opp' : 'me'; }
    function power(c) { return pw(c, H.mani); }
    function cardChips(c) { return c.rank === H.mani ? 30 + SU.indexOf(c.suit) * 10 : D.CHIPV[c.rank]; }
    function stakeMult(level) {
      var mm = D.STAKES[level];
      if (R.blind && R.blind.boss === 'delegado') mm = Math.max(1, Math.ceil(mm / 2));
      return mm;
    }
    function msg(s, hot) { X['t-msg'].textContent = s; X['t-msg'].classList.toggle('hot', !!hot); }

    // ---------- blinds e rivais (mesmas contas do jogo) ----------
    function makeBlind() {
      var a = R.ante, bi = R.bi, kind = ['small', 'big', 'boss'][bi];
      var target = Math.round(D.BASE[a - 1] * D.BMULT[bi] / 5) * 5, o, boss = null, title;
      if (kind === 'boss') { boss = D.BOSSES[a - 1]; o = boss; title = 'Chefe'; }
      else if (kind === 'big') { o = D.BIGOPP[a - 1]; title = 'Grande'; }
      else { o = D.SMALLOPP[a - 1]; title = 'Pequena'; }
      var opp = { name: o.name, icon: o.icon, bio: o.bio, skill: 0.28 + 0.14 * (a - 1) + 0.05 * bi, bluff: 0.06 + 0.05 * bi, aggr: 0.25 + 0.05 * bi };
      if (boss && boss.key === 'beto') { opp.aggr = 0.95; opp.bluff = 0.35; }
      if (boss && boss.key === 'coringa') { opp.skill = 0.95; opp.aggr = 0.7; }
      return { kind: kind, title: title, target: target, reward: D.BREWARD[bi], opp: opp, boss: boss ? boss.key : null, effect: boss ? boss.effect : '' };
    }

    // ---------- tela ----------
    function drawJokers(pop) {
      X['t-jokers'].innerHTML = '';
      for (var i = 0; i < D.JSLOTS; i++) {
        var j = R.jokers[i] ? jk(R.jokers[i]) : null;
        X['t-jokers'].appendChild(h('div', 'tj' + (j ? '' : ' empty') + (pop === i ? ' pop' : ''), j ? ic(j.icon) + '<small>' + j.name + '</small>' : ''));
      }
    }
    function side() {
      var b = R.blind;
      X['t-ante'].textContent = 'Ante ' + R.ante + '/' + D.ANTES + ' · ' + b.title;
      X['t-bn'].innerHTML = ic(b.opp.icon) + ' ' + b.opp.name;
      X['t-be'].textContent = b.boss ? b.effect : b.opp.bio;
      X['t-meta'].textContent = fm(b.target);
      X['t-hands'].textContent = Math.max(0, R.handsLeft); X['t-trocas'].textContent = R.trocasLeft;
      X['t-money'].innerHTML = 'Dinheiro <b>$' + R.money + '</b>';
      X.bar.style.width = Math.min(100, R.score / b.target * 100) + '%';
    }
    function setScore(animated) { return animated ? count(X['t-score'], R.score, 700, t, fm) : put(X['t-score'], R.score, fm); }
    function drawHand() {
      X['t-hand'].innerHTML = ''; X['t-opp'].innerHTML = '';
      H.me.forEach(function (c) { X['t-hand'].appendChild(face(c)); });
      H.opp.forEach(function () { X['t-opp'].appendChild(back('sm')); });
    }
    function setCalc(chips, mult, xm) {
      put(X['t-chips'], chips); put(X['t-mult'], mult, function (n) { return n + (xm > 1 ? ' ×' + Math.round(xm * 100) / 100 : ''); });
    }

    // ---------- pontuação: fichas × mult com curingas reais ----------
    function computeScore(how) {
      var steps = [], chips, mult, xm = 1, money = 0;
      if (how === 'run') { chips = 0; mult = 1; }
      else {
        chips = D.CHIPS0; mult = stakeMult(H.level);
        H.won.forEach(function (c) { var v = cardChips(c); chips += v; steps.push({ t: 'card', label: c.rank + SY[c.suit] + ' +' + v + ' fichas', chips: chips, mult: mult, xm: xm }); });
      }
      var x = { how: how, level: H.level, results: H.results, played: H.played, won: H.won, called: H.called, money: R.money, handsLeft: R.handsLeft - 1 };
      R.jokers.forEach(function (id, i) {
        var j = jk(id); if (!j || !j.calc) return;
        if (how === 'run' && !j.onRun) return;
        var e = D.withHand(H, function () { return j.calc(x); }); if (!e) return;
        var txt = [];
        if (e.chips) { chips += e.chips; txt.push('+' + e.chips + ' fichas'); }
        if (e.mult) { mult += e.mult; txt.push('+' + e.mult + ' mult'); }
        if (e.xmult) { xm *= e.xmult; txt.push('×' + e.xmult + ' mult'); }
        if (e.money) { money += e.money; txt.push('+$' + e.money); }
        steps.push({ t: 'joker', idx: i, label: j.name + ' ' + txt.join(' '), chips: chips, mult: mult, xm: xm });
      });
      return { steps: steps, chips: chips, mult: mult, xm: xm, money: money, total: how === 'run' && !chips ? 0 : Math.round(chips * mult * xm) };
    }
    async function animateScore(res) {
      setCalc(res.steps.length ? D.CHIPS0 : res.chips, stakeMult(H.level), 1);
      for (var i = 0; i < res.steps.length; i++) {
        let s = res.steps[i];
        msg(s.label);
        if (s.t === 'joker') drawJokers(s.idx);
        count(X['t-chips'], s.chips, 380, t);
        count(X['t-mult'], s.mult, 380, t, function (n) { return n + (s.xm > 1 ? ' ×' + Math.round(s.xm * 100) / 100 : ''); });
        await z(560);
      }
      setCalc(res.chips, res.mult, res.xm);
      msg('+' + fm(res.total) + ' pontos!');
      await count(X['t-total'], res.total, 800, t, function (n) { return '= ' + fm(n); });
      R.score += res.total; R.money += res.money; side(); setScore(true);
      await z(1000); drawJokers();
    }

    // ---------- truco: o rival e o bot decidem como no jogo ----------
    function aiDecide() {
      var o = R.blind.opp, e = est(H.opp, H.results, 'opp', H.mani) + noise(o.skill);
      if (e < 0.42 + 0.06 * H.pending - o.aggr * 0.06) return 'run';
      if (e > 0.86 && H.pending < 4 && Math.random() < 0.45) return 'raise';
      return 'accept';
    }
    function meDecide() {
      var e = est(H.me, H.results, 'me', H.mani) + noise(0.8);
      if (e < 0.4 + 0.05 * H.pending) return 'run';
      if (e > 0.85 && H.pending < 4 && Math.random() < 0.4) return 'raise';
      return 'accept';
    }
    async function callFlow(caller) {                              // devolve o fim da mão (se alguém correu) ou null
      var cur = caller; H.pending = H.level + 1;
      if (cur === 'me') H.called = true;
      while (true) {
        var resp = other(cur);
        msg((cur === 'me' ? 'Você pediu ' : 'O rival pediu ') + D.CALLS[H.pending] + '!', true);
        await z(950);
        var r = resp === 'opp' ? aiDecide() : meDecide();
        if (r === 'run') {
          msg(resp === 'opp' ? 'O rival correu!' : 'Você correu.'); await z(900);
          return resp === 'opp' ? { w: 'me', how: 'oppRun' } : { w: 'opp', how: 'run' };
        }
        H.level = H.pending; H.lastRaiser = r === 'raise' ? resp : cur;
        setCalc(+X['t-chips'].dataset.v || D.CHIPS0, stakeMult(H.level), 1);
        if (r === 'accept') { msg((resp === 'opp' ? 'O rival aceitou!' : 'Você aceitou.') + ' Agora vale ×' + stakeMult(H.level) + '.'); await z(850); return null; }
        if (resp === 'me') H.called = true;
        H.pending = H.level + 1; cur = resp;
      }
    }

    // ---------- jogar cartas ----------
    function lowestIdx(cards) { var b = 0; cards.forEach(function (c, i) { if (power(c) < power(cards[b])) b = i; }); return b; }
    async function playMe() {
      var hand = H.me, order = hand.map(function (c, i) { return i; }).sort(function (a, b) { return power(hand[a]) - power(hand[b]); }), pick;
      if (H.table.opp) {
        var op = power(H.table.opp), beat = order.filter(function (i) { return power(hand[i]) > op; });
        pick = beat.length ? beat[0] : order[0];
      } else if (!H.results.length && order.length === 3) pick = Math.random() < 0.5 ? order[2] : order[1];
      else pick = order[order.length - 1];
      var c = hand.splice(pick, 1)[0], el = X['t-hand'].children[pick];
      H.table.me = c; H.played.push(c);
      X['t-hand'].removeChild(el); el.classList.add('fl'); X.sm.appendChild(el); reflow(el); el.classList.remove('fl');
      await z(650);
    }
    async function playOpp() {
      var o = R.blind.opp, hand = H.opp;
      var order = hand.map(function (c, i) { return i; }).sort(function (a, b) { return power(hand[a]) - power(hand[b]); }), pick;
      if (Math.random() < (1 - o.skill) * 0.35) pick = rnd(hand.length);
      else if (H.table.me) {
        var mp = power(H.table.me), beat = order.filter(function (i) { return power(hand[i]) > mp; });
        pick = beat.length ? beat[0] : order[0];
      } else if (!H.results.length && order.length === 3 && Math.random() < 0.6) pick = order[1];
      else pick = order[order.length - 1];
      var c = hand.splice(pick, 1)[0];
      H.table.opp = c; X['t-opp'].removeChild(X['t-opp'].children[0]);
      var oe = face(c, 'fl'); X.so.appendChild(oe); reflow(oe); oe.classList.remove('fl');
      await z(650);
    }

    async function playHand() {
      var d = shuf(deck());
      H = { me: [d.pop(), d.pop(), d.pop()], opp: [d.pop(), d.pop(), d.pop()], vira: d.pop(), deck: d, level: 0, pending: 0, lastRaiser: null, called: false,
            results: [], table: { me: null, opp: null }, turn: R.leader, trickLeader: R.leader, played: [], won: [] };
      H.mani = RK[(RK.indexOf(H.vira.rank) + 1) % RK.length];
      drawHand(); X.pips.forEach(function (p) { p.className = ''; }); X.so.innerHTML = ''; X.sm.innerHTML = ''; X['t-total'].textContent = ''; X['t-total'].dataset.v = 0;
      setCalc(D.CHIPS0, stakeMult(0), 1); side(); drawJokers();
      msg(R.leader === 'me' ? 'Você abre a mão.' : 'O rival abre a mão.'); await z(900);
      // o bot troca cartas fracas (como um jogador faria)
      for (var sw = 0; sw < 2 && R.trocasLeft > 0 && H.deck.length && est(H.me, [], 'me', H.mani) < 0.5; sw++) {
        H.me[lowestIdx(H.me)] = H.deck.pop(); R.trocasLeft--; drawHand(); side(); msg('Carta trocada.'); await z(750);
      }
      var outcome = null;
      while (!outcome) {
        while (!(H.table.me && H.table.opp) && !outcome) {
          var who = H.turn, fr = null;
          if (who === 'me') {
            msg('Sua vez.'); await z(450);
            if (H.level < 4 && H.lastRaiser !== 'me') {
              var em = est(H.me, H.results, 'me', H.mani) + noise(0.75);
              if (Math.random() < (em > 0.68 ? 0.4 : 0.03)) { fr = await callFlow('me'); if (fr) { outcome = fr; break; } continue; }
            }
            await playMe();
          } else {
            msg('O rival está pensando…'); await z(750);
            var o = R.blind.opp, e = est(H.opp, H.results, 'opp', H.mani) + noise(o.skill);
            if (H.level < 4 && H.lastRaiser !== 'opp') {
              var p = e > 0.64 - o.aggr * 0.12 ? 0.3 + o.aggr * 0.4 : o.bluff;
              if (Math.random() < p) { fr = await callFlow('opp'); if (fr) { outcome = fr; break; } continue; }
            }
            await playOpp();
          }
          if (!(H.table.me && H.table.opp)) H.turn = other(who);
        }
        if (outcome) break;
        // resolve a vaza
        var pm = power(H.table.me), po = power(H.table.opp), r = pm > po ? 'me' : po > pm ? 'opp' : 'tie';
        if (r === 'tie' && hasJ('coelho')) r = 'me';
        H.results.push(r); if (r === 'me') H.won.push(H.table.me);
        X.pips[H.results.length - 1].className = r === 'me' ? 'on' : r === 'opp' ? 'lost' : 'tie';
        msg(r === 'me' ? 'Você levou a vaza!' : r === 'opp' ? 'O rival levou a vaza.' : 'Empatou! (cangou)');
        await z(1100);
        H.table = { me: null, opp: null }; X.so.innerHTML = ''; X.sm.innerHTML = '';
        var w = hw(H.results);
        if (w === 'draw') outcome = { w: null, how: 'draw' };
        else if (w) outcome = { w: w, how: 'cards' };
        else { H.turn = r === 'tie' ? H.trickLeader : r; H.trickLeader = H.turn; }
      }
      // ---------- fim da mão ----------
      if (outcome.how === 'draw') { msg('Mão empatada: ninguém pontua.'); await z(1300); return; }
      if (outcome.how === 'run') {
        var rr = computeScore('run');
        if (rr.total > 0) await animateScore(rr); else { msg('Você fugiu. Mão perdida, mas sem custo.'); await z(1300); }
        return;
      }
      if (outcome.w === 'me') {
        msg(outcome.how === 'oppRun' ? 'O rival correu!' : 'Você ganhou a mão!'); await z(800);
        await animateScore(computeScore(outcome.how)); return;
      }
      var pen = Math.min(R.money, H.level); R.money -= pen;
      msg('O rival ganhou a mão.' + (pen ? ' Você perdeu $' + pen + '.' : '')); side(); await z(1500);
    }

    // ---------- loja (o bot compra o que dá, rola e segue) ----------
    function rollItems() {
      var pool = shuf(D.JOKERS.filter(function (j) { return R.jokers.indexOf(j.id) < 0; })).slice(0, 3);
      var items = pool.map(function (j) { return { type: 'joker', id: j.id, price: j.price }; });
      var vs = D.VOUCHERS.filter(function (v) { return R.vouchers.indexOf(v.id) < 0; });
      if (vs.length) { var v = vs[rnd(vs.length)]; items.push({ type: 'voucher', id: v.id, price: v.price }); }
      return items;
    }
    var LIKE = { zap: 9, manilheiro: 9, tres: 8, caradepau: 8, limpa: 7, ousadia: 6, virada: 6, maocheia: 7, sete: 7, maoextra: 9, baralho: 6, juros: 5, banqueiro: 6, moedeiro: 5, poupador: 5, coelho: 5 };
    function worth(it) { return (LIKE[it.id] || 3) * 10 - it.price; }
    async function shop() {
      var S_ = X['t-shop'], shown = R.money, items = rollItems(), rerolls = 0;
      function paint(o) {
        o = o || {};
        var own = '', stall = '';
        for (var i = 0; i < D.JSLOTS; i++) {
          var j = R.jokers[i] ? jk(R.jokers[i]) : null;
          own += j ? '<div class="tt-sc' + (o.just === i ? ' just' : '') + '"><div class="tt-sc-face">' + ic(j.icon) + '</div><button class="btn tt-sell" tabindex="-1"><span>Vender</span><span class="tt-price">$' + Math.floor(j.price / 2) + '</span></button></div>'
                   : '<div class="tt-sc empty"><div class="tt-sc-face"></div></div>';
        }
        items.forEach(function (it, i) {
          var d = it.type === 'joker' ? jk(it.id) : vc(it.id), full = it.type === 'joker' && R.jokers.length >= D.JSLOTS, poor = R.money < it.price;
          stall += '<div class="tt-sc' + (poor || full ? ' poor' : '') + '" style="--i:' + i + '"><div class="tt-sc-face' + (it.type === 'voucher' ? ' voucher' : '') + '">' + ic(d.icon) + (it.type === 'voucher' ? '<span class="tt-sc-tag">PERM.</span>' : '') + '</div>' +
                   '<span class="tt-sc-name">' + d.name + '</span><button class="btn tt-buy' + (o.press === i ? ' press' : '') + '" tabindex="-1"' + (poor || full ? ' disabled' : '') + '><span>' + (full ? 'Sem espaço' : 'Comprar') + '</span>' + (full ? '' : '<span class="tt-price">$' + it.price + '</span>') + '</button></div>';
        });
        S_.innerHTML = '<div class="tt-shop"><div class="tt-walletrow"><div class="tt-wallet"><span class="tt-coin">$</span><b class="w">' + shown + '</b></div></div>' +
          '<section class="tt-panel tt-own"><h3 class="tt-ribbon">Seus curingas<span class="tt-slotcount">' + R.jokers.length + '/' + D.JSLOTS + '</span></h3><div class="tt-shopcards">' + own + '</div></section>' +
          '<section class="tt-panel tt-stall' + (o.fresh ? ' tt-fresh' : '') + '"><div class="tt-awning"></div><h3 class="tt-ribbon">Loja</h3><div class="tt-shopcards">' + stall + '</div>' +
          '<button class="btn tt-reroll' + (o.pressRoll ? ' press' : '') + '" tabindex="-1"><span>Rolar loja</span><span class="tt-price">$' + (3 + rerolls) + '</span></button></section>' +
          '<button class="btn btn-primary tt-go' + (o.pressGo ? ' press' : '') + '" tabindex="-1">Próxima blind ›</button></div>';
        var bx = S_.firstChild; bx.style.transform = '';              // encolhe a loja pra caber no tile
        var pd = 2 * (parseFloat(getComputedStyle(S_).paddingTop) || 0);
        var k = Math.min(1, (S_.clientHeight - pd) / (bx.offsetHeight || 1), (S_.clientWidth - pd) / (bx.offsetWidth || 1));
        if (k < 1) bx.style.transform = 'scale(' + k.toFixed(3) + ')';
      }
      paint({ fresh: true }); S_.classList.add('on'); await z(1500);
      for (var step = 0; step < 4; step++) {                          // até 4 ações: comprar / rolar
        var buyable = items.filter(function (it) { return R.money >= it.price && (it.type === 'voucher' || R.jokers.length < D.JSLOTS); }).sort(function (a, b) { return worth(b) - worth(a); });
        if (buyable.length) {
          var it = buyable[0], bi = items.indexOf(it);
          paint({ press: bi }); await z(280);
          R.money -= it.price; shown = R.money;
          if (it.type === 'joker') R.jokers.push(it.id); else R.vouchers.push(it.id);
          items.splice(bi, 1);
          paint({ just: it.type === 'joker' ? R.jokers.length - 1 : -1 }); S_.querySelector('.tt-wallet').classList.add('lose'); await z(1300);
        } else if (R.money >= 3 + rerolls && rerolls < 2 && Math.random() < 0.6) {
          paint({ pressRoll: true }); await z(280);
          R.money -= 3 + rerolls; rerolls++; shown = R.money; items = rollItems();
          paint({ fresh: true }); await z(1400);
        } else break;
      }
      paint({ pressGo: true }); await z(450); S_.classList.remove('on'); await z(450);
      side(); drawJokers();
    }

    // ---------- a corrida ----------
    while (true) {
      R = { ante: 1, bi: 0, money: D.START_MONEY, jokers: [], vouchers: [], score: 0, cleared: 0, blind: null, handsLeft: 0, trocasLeft: 0, leader: 'me' };
      var champion = false, lost = false;
      while (!lost && !champion) {
        R.blind = makeBlind(); R.score = 0; H = null;
        X.so.innerHTML = ''; X.sm.innerHTML = ''; X['t-hand'].innerHTML = ''; X['t-opp'].innerHTML = '';
        X['t-total'].textContent = ''; X.pips.forEach(function (p) { p.className = ''; });
        R.handsLeft = D.HANDS + (hasV('maoextra') ? 1 : 0) - (R.blind.boss === 'coringa' ? 1 : 0);
        R.trocasLeft = R.blind.boss === 'marquinhos' ? 0 : D.TROCAS + (hasV('baralho') ? 1 : 0) + (hasJ('gato') ? 1 : 0);
        R.leader = Math.random() < 0.5 ? 'me' : 'opp';
        setCalc(D.CHIPS0, 1, 1); setScore(false); side(); drawJokers();
        msg('Ante ' + R.ante + ' · ' + R.blind.title + ': ' + R.blind.opp.name + ' (meta ' + fm(R.blind.target) + ')'); await z(1900);
        while (true) {                                                 // as mãos da blind
          await playHand();
          R.handsLeft--; side();
          if (R.score >= R.blind.target) break;
          if (R.handsLeft <= 0) { lost = true; break; }
          R.leader = other(R.leader);
        }
        if (lost) break;
        var b = R.blind, interest = Math.min(hasV('juros') ? 10 : 5, Math.floor(R.money / 5)), hl = Math.max(0, R.handsLeft), tot = b.reward + hl + interest;
        R.cleared++; R.money += tot; side();
        msg('Blind vencida! +$' + tot + ' (mãos que sobraram: ' + hl + ', juros: ' + interest + ')'); await z(1800);
        if (b.kind === 'boss' && R.ante >= D.ANTES) { champion = true; break; }
        await shop();
        R.bi++; if (R.bi > 2) { R.bi = 0; R.ante++; }
      }
      msg(champion ? 'Campeão do Trutec!' : 'Fim da corrida: ' + R.cleared + ' blind' + (R.cleared === 1 ? '' : 's') + ' vencida' + (R.cleared === 1 ? '' : 's') + '.', true);
      await z(2600);
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
