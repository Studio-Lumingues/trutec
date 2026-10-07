// ============================================================================
// DEMOS DO MOSAICO "JOGAR" (atrás de Truco Paulista e de Trutec)
// TruModeDemo.start(elTruco, elTrutec) / .stop()
// São SIMULAÇÕES DE VERDADE, nada é roteirizado:
// - Truco Paulista: 4 bots jogam com baralho, vira, manilha, vazas, empate (cangou), truco/seis/nove/doze
//   (aceitar, correr ou aumentar) e placar até 12. Quem decide é uma IA que avalia a própria mão.
// - Trutec: a tela REAL do jogo, em miniatura, com um bot clicando nas cartas e botões (Trutec.demoStart, no trutec.js).
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

  // ======================= controle =======================
  function run(fn, el) { var t = tok; fn(el, t).catch(function (e) { if (e !== STOP && window.console) console.warn('[mode-demo]', e); }); }
  window.TruModeDemo = {
    start: function (a, b) {
      this.stop(); var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (reduced) return;
      if (a) run(playTruco, a);
      if (b && window.Trutec && Trutec.demoStart) Trutec.demoStart(b);      // o Trutec roda na tela real, em miniatura (trutec.js)
    },
    stop: function () { tok++; if (window.Trutec && Trutec.demoStop) Trutec.demoStop(); }
  };
})();
