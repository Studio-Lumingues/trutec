// ============================================================================
// TRUTEC — truco roguelike solo
// Enfrente 8 rivais em partidas de truco paulista (até 12 pontos). Cada vitória
// te dá uma relíquia (bônus que muda as regras a seu favor). Você tem 3 vidas:
// perder uma partida custa uma vida. Fases 4 e 8 são chefes.
// Arquivo independente: cria a própria tela (#screen-trutec) e usa o botão
// #btn-open-trutec do lobby. Depende só do .card / .screen do style.css.
// ============================================================================
(function () {
  'use strict';

  // ---------- regras do baralho ----------
  var RANKS = ['4', '5', '6', '7', 'Q', 'J', 'K', 'A', '2', '3'];      // fraca → forte
  var SUITS = ['ouros', 'espadas', 'copas', 'paus'];                    // ordem das manilhas
  var SYM = { ouros: '♦', espadas: '♠', copas: '♥', paus: '♣' };
  var COLOR = { ouros: 'red', espadas: 'black', copas: 'red', paus: 'black' };
  var STAKES = [1, 3, 6, 9, 12];
  var CALLS = ['', 'TRUCO', 'SEIS', 'NOVE', 'DOZE'];
  var TARGET = 12, MAX_LIVES = 5, BEST_KEY = 'trutec-roguelike-best';

  // ---------- rivais ----------
  var OPPS = [
    { name: 'Seu Zé da Padaria', icon: '🥖', bio: 'Joga no feeling.',              skill: 0.30, bluff: 0.03, aggr: 0.15, start: 0 },
    { name: 'Dona Cida',         icon: '🧶', bio: 'Paciente, só pede truco com jogo.', skill: 0.40, bluff: 0.05, aggr: 0.20, start: 0 },
    { name: 'Tio Beto',          icon: '🍺', bio: 'Grita TRUCO por qualquer coisa.',  skill: 0.45, bluff: 0.14, aggr: 0.40, start: 0 },
    { name: 'Marquinhos Blefe',  icon: '🃏', bio: 'CHEFE · começa com 2 pontos. Blefa muito.', skill: 0.55, bluff: 0.30, aggr: 0.50, start: 2, boss: true },
    { name: 'Vó Nena',           icon: '👵', bio: 'Ninguém sabe o que ela tem.',      skill: 0.65, bluff: 0.08, aggr: 0.30, start: 0 },
    { name: 'Delegado Tavares',  icon: '🕶️', bio: 'Não aceita desaforo (nem truco).', skill: 0.72, bluff: 0.15, aggr: 0.55, start: 0 },
    { name: 'Zé do Truco',       icon: '🎩', bio: 'Lenda do bar. Começa com 1 ponto.', skill: 0.82, bluff: 0.20, aggr: 0.60, start: 1 },
    { name: 'O Coringa',         icon: '👑', bio: 'CHEFE FINAL · começa com 3 pontos.', skill: 0.92, bluff: 0.25, aggr: 0.70, start: 3, boss: true }
  ];

  // ---------- relíquias ----------
  var RELICS = [
    { id: 'moedeiro',  icon: '🪙', name: 'Moedeiro',        desc: '+1 ponto sempre que você ganhar uma mão.' },
    { id: 'olho',      icon: '👁️', name: 'Olho de Vidro',   desc: 'Mostra quantas manilhas e treses o rival tem.' },
    { id: 'troca',     icon: '🔄', name: 'Troca-Troca',     desc: 'Uma vez por mão, troque uma carta por outra do baralho.' },
    { id: 'fuga',      icon: '🏃', name: 'Fuga Honrosa',    desc: 'Quando você corre, o rival ganha 1 ponto a menos.' },
    { id: 'vantagem',  icon: '🚀', name: 'Vantagem',        desc: 'Você começa cada partida com 2 pontos.' },
    { id: 'desempate', icon: '🍀', name: 'Pé de Coelho',    desc: 'Cartas empatadas (cangou) contam como vaza sua.' },
    { id: 'ousadia',   icon: '🔥', name: 'Ousadia',         desc: '+1 ponto ao ganhar uma mão valendo 3 ou mais.' },
    { id: 'caradepau', icon: '😐', name: 'Cara de Pau',     desc: 'O rival corre bem mais dos seus pedidos de truco.' },
    { id: 'gato',      icon: '🐈', name: 'Gato de 7 Vidas', desc: 'Ganha +1 vida agora (máx. 5).' }
  ];

  // ---------- estado ----------
  var R = null, M = null, H = null, tok = 0, built = false;
  var $ = function (id) { return document.getElementById(id); };
  function has(id) { return !!R && R.relics.indexOf(id) >= 0; }
  function rnd(n) { return Math.floor(Math.random() * n); }
  function other(w) { return w === 'me' ? 'opp' : 'me'; }
  function later(fn, ms) { var t = tok; setTimeout(function () { if (t === tok) fn(); }, ms); }
  function best() { try { return parseInt(localStorage.getItem(BEST_KEY), 10) || 0; } catch (e) { return 0; } }
  function saveBest(v) { try { if (v > best()) localStorage.setItem(BEST_KEY, String(v)); } catch (e) {} }
  function shuffle(a) { for (var i = a.length - 1; i > 0; i--) { var j = rnd(i + 1), t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  function sfx(kind) {
    try {
      var A = window.GameAudio; if (!A) return;
      if (kind && A.playCall) A.playCall(kind); else if (A.click) A.click();
    } catch (e) {}
  }

  function makeDeck() {
    var d = [];
    SUITS.forEach(function (s) { RANKS.forEach(function (r) { d.push({ rank: r, suit: s, id: r + s }); }); });
    return d;
  }
  function power(c) {
    if (c.rank === H.mani) return 100 + SUITS.indexOf(c.suit);
    return RANKS.indexOf(c.rank);
  }

  // quem ganha a mão, dado o resultado das vazas ('me' | 'opp' | 'tie')
  function handWinner(res) {
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

  // ============================================================================
  // INTERFACE
  // ============================================================================
  function build() {
    if (built) return;
    built = true;
    var lobby = $('screen-lobby');
    var host = lobby ? lobby.parentNode : document.body;
    var s = document.createElement('div');
    s.id = 'screen-trutec';
    s.className = 'screen';
    s.innerHTML =
      '<div class="tt-wrap">' +
        '<header class="tt-top">' +
          '<button type="button" class="btn btn-secondary tt-exit" id="tt-exit">‹ Sair</button>' +
          '<div class="tt-floor"><b id="tt-floor"></b><span id="tt-oppname"></span></div>' +
          '<div class="tt-lives" id="tt-lives" aria-label="Vidas"></div>' +
        '</header>' +
        '<div class="tt-relics" id="tt-relics"></div>' +
        '<div class="tt-score">' +
          '<span>Você <b id="tt-sme">0</b></span><i>x</i><span><b id="tt-sopp">0</b> Rival</span>' +
          '<em id="tt-stake">valendo 1</em>' +
        '</div>' +
        '<section class="tt-opp">' +
          '<div class="tt-oppinfo"><span class="tt-oppicon" id="tt-oppicon"></span><span id="tt-oppbio"></span></div>' +
          '<div class="tt-opphand" id="tt-opphand"></div>' +
          '<div class="tt-peek" id="tt-peek"></div>' +
        '</section>' +
        '<section class="tt-center">' +
          '<div class="tt-vira"><span>Vira</span><div id="tt-vira"></div><small id="tt-mani"></small></div>' +
          '<div class="tt-table">' +
            '<div class="tt-slot" id="tt-slot-opp"></div>' +
            '<div class="tt-slot" id="tt-slot-me"></div>' +
          '</div>' +
          '<div class="tt-tricks"><div class="tt-pips" id="tt-pips-opp"><i></i><i></i><i></i></div>' +
          '<div class="tt-pips" id="tt-pips-me"><i></i><i></i><i></i></div></div>' +
        '</section>' +
        '<div class="tt-msg" id="tt-msg" role="status" aria-live="polite"></div>' +
        '<div class="tt-actions">' +
          '<button type="button" class="action-btn" id="tt-truco">TRUCO</button>' +
          '<button type="button" class="action-btn" id="tt-swap" hidden>TROCAR</button>' +
          '<button type="button" class="action-btn danger" id="tt-run">FUGIR</button>' +
        '</div>' +
        '<div class="tt-hand" id="tt-hand"></div>' +
      '</div>' +
      '<div class="tt-overlay hidden" id="tt-overlay"><div class="tt-modal" id="tt-modal"></div></div>';
    host.appendChild(s);

    $('tt-exit').addEventListener('click', function () {
      if (!R) return leave();
      modal('Abandonar a corrida?', '<p>Você perde o progresso desta corrida.</p>', [
        { label: 'Continuar jogando', cls: 'btn-primary' },
        { label: 'Sair', cls: 'btn-danger', fn: leave }
      ]);
    });
    $('tt-truco').addEventListener('click', playerCall);
    $('tt-run').addEventListener('click', playerRun);
    $('tt-swap').addEventListener('click', function () {
      if (!H || !H.canAct || H.swapsLeft < 1) return;
      H.swapMode = !H.swapMode;
      say(H.swapMode ? 'Toque na carta que você quer trocar.' : 'Troca cancelada.');
      renderActions();
    });
  }

  function cardEl(c, extra) {
    var el = document.createElement('div');
    el.className = 'card ' + COLOR[c.suit] + ' suit-' + c.suit + (extra ? ' ' + extra : '');
    if (H && c.rank === H.mani) el.classList.add('manilha');
    var sy = SYM[c.suit];
    el.innerHTML =
      '<div class="card-corner corner-tl"><span>' + c.rank + '</span>' + sy + '</div>' +
      '<div class="card-face"><div class="rank">' + c.rank + '</div><div class="suit">' + sy + '</div></div>' +
      '<div class="card-corner corner-br"><span>' + c.rank + '</span>' + sy + '</div>';
    return el;
  }
  function backEl() { var el = document.createElement('div'); el.className = 'card facedown'; return el; }

  function say(t) { var m = $('tt-msg'); if (m) m.textContent = t; }

  function modal(title, body, buttons) {
    var m = $('tt-modal');
    m.innerHTML = '<h2></h2><div class="tt-mbody"></div><div class="tt-mbtns"></div>';
    m.querySelector('h2').textContent = title;
    var b = m.querySelector('.tt-mbody');
    if (typeof body === 'string') b.innerHTML = body; else if (body) b.appendChild(body);
    var box = m.querySelector('.tt-mbtns');
    (buttons || []).forEach(function (o) {
      var el = document.createElement('button');
      el.type = 'button';
      el.className = 'btn ' + (o.cls || 'btn-secondary');
      el.textContent = o.label;
      el.addEventListener('click', function () { closeModal(); if (o.fn) o.fn(); });
      box.appendChild(el);
    });
    $('tt-overlay').classList.remove('hidden');
    var f = box.querySelector('button'); if (f) f.focus();
  }
  function closeModal() { $('tt-overlay').classList.add('hidden'); }

  function render() {
    if (!R || !M) return;
    var o = OPPS[R.floor];
    $('tt-floor').textContent = 'Fase ' + (R.floor + 1) + '/' + OPPS.length;
    $('tt-oppname').textContent = o.name;
    $('tt-oppicon').textContent = o.icon;
    $('tt-oppbio').textContent = o.bio;
    var lv = '';
    for (var i = 0; i < MAX_LIVES; i++) if (i < Math.max(R.lives, 3) || i < R.lives) lv += (i < R.lives ? '♥' : '♡');
    $('tt-lives').textContent = lv;
    $('tt-sme').textContent = Math.min(M.me, TARGET);
    $('tt-sopp').textContent = Math.min(M.opp, TARGET);

    var rl = $('tt-relics'); rl.innerHTML = '';
    R.relics.forEach(function (id) {
      var r = RELICS.filter(function (x) { return x.id === id; })[0];
      if (!r) return;
      var chip = document.createElement('span');
      chip.className = 'tt-chip'; chip.title = r.name + ': ' + r.desc;
      chip.textContent = r.icon + ' ' + r.name;
      rl.appendChild(chip);
    });

    if (!H) return;
    $('tt-stake').textContent = 'valendo ' + STAKES[H.level];
    var vi = $('tt-vira'); vi.innerHTML = ''; vi.appendChild(cardEl(H.vira, 'tt-mini'));
    $('tt-mani').textContent = 'Manilha: ' + H.mani;

    var oh = $('tt-opphand'); oh.innerHTML = '';
    H.opp.forEach(function () { oh.appendChild(backEl()); });

    var pk = $('tt-peek');
    if (has('olho') && H.opp.length) {
      var mn = 0, th = 0;
      H.opp.forEach(function (c) { if (power(c) >= 100) mn++; else if (c.rank === '3') th++; });
      pk.textContent = '👁️ Rival tem ' + mn + ' manilha' + (mn === 1 ? '' : 's') + ' e ' + th + ' três';
    } else pk.textContent = '';

    ['me', 'opp'].forEach(function (w) {
      var slot = $('tt-slot-' + w); slot.innerHTML = ''; slot.className = 'tt-slot';
      if (H.table[w]) slot.appendChild(cardEl(H.table[w]));
      var pips = $('tt-pips-' + w).children;
      for (var i = 0; i < 3; i++) pips[i].className = H.results[i] === w ? 'on' : '';
    });

    var hand = $('tt-hand'); hand.innerHTML = '';
    H.me.forEach(function (c, i) {
      var el = cardEl(c, 'tt-mine');
      if (H.canAct) el.classList.add('playable');
      if (H.swapMode) el.classList.add('swapping');
      el.addEventListener('click', function () { onCard(i); });
      hand.appendChild(el);
    });
    renderActions();
  }

  function renderActions() {
    if (!H) return;
    var t = $('tt-truco'), s = $('tt-swap'), r = $('tt-run');
    var canCall = H.canAct && H.level < 4 && H.lastRaiser !== 'me';
    t.disabled = !canCall;
    t.textContent = CALLS[Math.min(H.level + 1, 4)] + (H.level < 4 ? '' : '');
    r.disabled = !H.canAct;
    s.hidden = !has('troca');
    s.disabled = !H.canAct || H.swapsLeft < 1;
    s.textContent = 'TROCAR (' + H.swapsLeft + ')';
    s.classList.toggle('active', !!H.swapMode);
    document.querySelectorAll('#tt-hand .card').forEach(function (el) {
      el.classList.toggle('playable', !!H.canAct);
      el.classList.toggle('swapping', !!H.swapMode);
    });
  }

  // ============================================================================
  // FLUXO: corrida → partida → mão → vaza
  // ============================================================================
  function open() {
    build();
    if (window.showScreen) window.showScreen('screen-trutec');
    else { document.querySelectorAll('.screen').forEach(function (e) { e.classList.remove('active'); }); $('screen-trutec').classList.add('active'); }
    tok++; R = null; M = null; H = null;
    $('tt-relics').innerHTML = ''; $('tt-hand').innerHTML = ''; $('tt-opphand').innerHTML = '';
    $('tt-vira').innerHTML = ''; $('tt-slot-me').innerHTML = ''; $('tt-slot-opp').innerHTML = '';
    $('tt-floor').textContent = 'Trutec'; $('tt-oppname').textContent = 'Roguelike solo'; $('tt-oppicon').textContent = '';
    $('tt-oppbio').textContent = ''; $('tt-lives').textContent = ''; $('tt-peek').textContent = '';
    $('tt-sme').textContent = '0'; $('tt-sopp').textContent = '0'; $('tt-stake').textContent = 'valendo 1';
    $('tt-mani').textContent = ''; say('');
    $('tt-truco').disabled = true; $('tt-run').disabled = true; $('tt-swap').hidden = true;
    intro();
  }
  function leave() {
    tok++; R = M = H = null; closeModal();
    if (window.showScreen) window.showScreen('screen-lobby');
  }

  function intro() {
    var b = best();
    modal('Trutec', 
      '<p>Truco paulista roguelike, sozinho contra a casa.</p>' +
      '<ul class="tt-rules">' +
        '<li>Vença <b>8 rivais</b> em partidas até <b>12 pontos</b>. As fases 4 e 8 são chefes.</li>' +
        '<li>Cada vitória te deixa escolher <b>1 de 3 relíquias</b> que mudam as regras a seu favor.</li>' +
        '<li>Você tem <b>3 vidas</b>: perder uma partida custa uma vida e você enfrenta o rival de novo.</li>' +
        '<li>Peça TRUCO, SEIS, NOVE e DOZE. O rival também pede, aceita, corre ou aumenta.</li>' +
      '</ul>' +
      (b ? '<p class="tt-best">Melhor corrida: ' + b + ' fase' + (b === 1 ? '' : 's') + ' vencida' + (b === 1 ? '' : 's') + '</p>' : ''),
      [{ label: 'Começar corrida', cls: 'btn-primary', fn: startRun }, { label: 'Voltar', fn: leave }]);
  }

  function startRun() {
    R = { floor: 0, lives: 3, relics: [] };
    startMatch();
  }

  function startMatch() {
    tok++;
    var o = OPPS[R.floor];
    M = { me: has('vantagem') ? 2 : 0, opp: o.start, leader: Math.random() < 0.5 ? 'me' : 'opp' };
    H = null;
    render();
    modal('Fase ' + (R.floor + 1) + ' — ' + o.name,
      '<p class="tt-bigicon">' + o.icon + '</p><p>' + o.bio + '</p>' +
      '<p class="tt-best">Placar inicial: ' + M.me + ' x ' + M.opp + '</p>',
      [{ label: 'Jogar', cls: 'btn-primary', fn: newHand }]);
  }

  function newHand() {
    tok++;
    var d = shuffle(makeDeck());
    H = {
      me: [d.pop(), d.pop(), d.pop()], opp: [d.pop(), d.pop(), d.pop()], vira: d.pop(), deck: d,
      level: 0, pending: 0, lastRaiser: null, results: [], table: { me: null, opp: null },
      turn: M.leader, trickLeader: M.leader, canAct: false,
      swapsLeft: has('troca') ? 1 : 0, swapMode: false
    };
    H.mani = RANKS[(RANKS.indexOf(H.vira.rank) + 1) % RANKS.length];
    render();
    say(M.leader === 'me' ? 'Você abre a mão.' : 'O rival abre a mão.');
    later(nextAction, 900);
  }

  function nextAction() {
    if (H.turn === 'me') { H.canAct = true; renderActions(); say('Sua vez.'); }
    else aiTurn();
  }

  function onCard(i) {
    if (!H || !H.canAct) return;
    if (H.swapMode) {
      if (!H.deck.length) return;
      H.me[i] = H.deck.pop();
      H.swapsLeft--; H.swapMode = false;
      sfx(); say('Carta trocada.'); render();
      return;
    }
    playCard('me', i);
  }

  function playCard(who, idx) {
    var c = H[who].splice(idx, 1)[0];
    H.table[who] = c; H.canAct = false; H.swapMode = false;
    sfx(); render();
    if (H.table.me && H.table.opp) { later(resolveTrick, 900); return; }
    H.turn = other(who);
    later(nextAction, who === 'me' ? 600 : 0);
  }

  function resolveTrick() {
    var pm = power(H.table.me), po = power(H.table.opp);
    var r = pm > po ? 'me' : po > pm ? 'opp' : 'tie';
    if (r === 'tie' && has('desempate')) r = 'me';
    H.results.push(r);
    var wslot = r === 'tie' ? null : $('tt-slot-' + r);
    if (wslot) wslot.classList.add('won');
    say(r === 'me' ? 'Você levou a vaza!' : r === 'opp' ? 'O rival levou a vaza.' : 'Empatou! (cangou)');
    var pips = $('tt-pips-' + (r === 'tie' ? 'me' : r)).children;
    if (r !== 'tie') pips[H.results.length - 1].className = 'on';
    later(function () {
      H.table = { me: null, opp: null };
      var w = handWinner(H.results);
      if (w === 'draw') return endHand(null, 0, 'draw');
      if (w) return endHand(w, STAKES[H.level], 'cards');
      H.turn = r === 'tie' ? H.trickLeader : r;
      H.trickLeader = H.turn;
      render(); nextAction();
    }, 1200);
  }

  function endHand(winner, pts, how) {
    H.canAct = false;
    var extra = 0, txt;
    if (winner === 'me' && (how === 'cards' || how === 'oppRun')) {
      if (has('moedeiro')) extra++;
      if (has('ousadia') && STAKES[H.level] >= 3) extra++;
    }
    if (winner === 'me') M.me += pts + extra;
    else if (winner === 'opp') M.opp += pts;
    if (how === 'draw') txt = 'Mão empatada: ninguém pontua.';
    else if (how === 'oppRun') txt = 'O rival correu! Você ganha ' + (pts + extra) + '.';
    else if (how === 'run') txt = 'Você correu. Rival +' + pts + '.';
    else if (winner === 'me') txt = 'Você ganhou a mão! +' + (pts + extra) + (extra ? ' (bônus de relíquia)' : '');
    else txt = 'O rival ganhou a mão. +' + pts;
    say(txt); render();
    later(function () {
      if (M.me >= TARGET) return matchEnd(true);
      if (M.opp >= TARGET) return matchEnd(false);
      M.leader = other(M.leader);
      newHand();
    }, 2000);
  }

  // ---------- fim de partida / recompensas ----------
  function matchEnd(won) {
    H = null; render();
    if (won) {
      saveBest(R.floor + 1);
      if (R.floor + 1 >= OPPS.length) {
        return modal('🏆 Campeão do Trutec!', '<p>Você derrotou todos os rivais, inclusive O Coringa.</p><p class="tt-best">Vidas restantes: ' + R.lives + '</p>',
          [{ label: 'Nova corrida', cls: 'btn-primary', fn: startRun }, { label: 'Sair', fn: leave }]);
      }
      return reward();
    }
    R.lives--;
    if (R.lives <= 0) {
      var cleared = R.floor;
      return modal('Fim da corrida', '<p>' + OPPS[R.floor].name + ' te derrotou na fase ' + (R.floor + 1) + '.</p>' +
        '<p class="tt-best">Fases vencidas: ' + cleared + ' · Melhor: ' + Math.max(best(), cleared) + '</p>',
        [{ label: 'Nova corrida', cls: 'btn-primary', fn: startRun }, { label: 'Sair', fn: leave }]);
    }
    modal('Você perdeu uma vida', '<p>Restam <b>' + R.lives + '</b> vida' + (R.lives === 1 ? '' : 's') + '. ' + OPPS[R.floor].name + ' quer revanche.</p>',
      [{ label: 'Revanche', cls: 'btn-primary', fn: startMatch }]);
  }

  function reward() {
    var pool = shuffle(RELICS.filter(function (r) { return !has(r.id) && !(r.id === 'gato' && R.lives >= MAX_LIVES); })).slice(0, 3);
    if (!pool.length) { R.floor++; return startMatch(); }
    var box = document.createElement('div'); box.className = 'tt-relic-list';
    pool.forEach(function (r) {
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'tt-relic-opt';
      b.innerHTML = '<span class="tt-ri"></span><span><b></b><small></small></span>';
      b.querySelector('.tt-ri').textContent = r.icon;
      b.querySelector('b').textContent = r.name;
      b.querySelector('small').textContent = r.desc;
      b.addEventListener('click', function () {
        closeModal();
        if (r.id === 'gato') R.lives = Math.min(MAX_LIVES, R.lives + 1); else R.relics.push(r.id);
        R.floor++;
        startMatch();
      });
      box.appendChild(b);
    });
    modal('Vitória! Escolha uma relíquia', box, []);
  }

  // ============================================================================
  // TRUCO: pedidos e respostas
  // ============================================================================
  function runPts() { return Math.max(0, STAKES[H.level] - (has('fuga') ? 1 : 0)); }

  function playerRun() {
    if (!H || !H.canAct) return;
    endHand('opp', runPts(), 'run');
  }

  function playerCall() {
    if (!H || !H.canAct || H.level >= 4 || H.lastRaiser === 'me') return;
    H.canAct = false; renderActions();
    H.pending = H.level + 1;
    say('Você pediu ' + CALLS[H.pending] + '!'); sfx(CALLS[H.pending].toLowerCase());
    later(aiRespond, 1000);
  }

  // ---------- IA ----------
  function cv(c) { var p = power(c); return p >= 100 ? 0.82 + (p - 100) * 0.06 : 0.08 + RANKS.indexOf(c.rank) * 0.075; }
  function est(cards, res, who) {
    var v = cards.map(cv).sort(function (a, b) { return b - a; });
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
  function noise(o) { return (Math.random() - 0.5) * (1 - o.skill) * 0.6; }

  function aiTurn() {
    H.canAct = false; renderActions(); say('O rival está pensando…');
    later(function () {
      var o = OPPS[R.floor], e = est(H.opp, H.results, 'opp') + noise(o);
      if (H.level < 4 && H.lastRaiser !== 'opp') {
        var p = e > 0.64 - o.aggr * 0.12 ? 0.3 + o.aggr * 0.4 : o.bluff;
        if (Math.random() < p) return aiCall();
      }
      aiPlay();
    }, 900);
  }

  function aiCall() {
    H.pending = H.level + 1;
    say('O rival pediu ' + CALLS[H.pending] + '!'); sfx(CALLS[H.pending].toLowerCase());
    later(showResponse, 600);
  }

  function aiPlay() {
    var o = OPPS[R.floor], hand = H.opp;
    var order = hand.map(function (c, i) { return i; }).sort(function (a, b) { return power(hand[a]) - power(hand[b]); });
    var pick;
    if (Math.random() < (1 - o.skill) * 0.35) pick = rnd(hand.length);
    else if (H.table.me) {
      var mp = power(H.table.me);
      var beat = order.filter(function (i) { return power(hand[i]) > mp; });
      pick = beat.length ? beat[0] : order[0];
    } else if (!H.results.length && order.length === 3 && Math.random() < 0.6) pick = order[1];
    else pick = order[order.length - 1];
    playCard('opp', pick);
  }

  function aiRespond() {
    var o = OPPS[R.floor], e = est(H.opp, H.results, 'opp') + noise(o);
    var thr = 0.42 + 0.06 * H.pending - o.aggr * 0.06 + (has('caradepau') ? 0.1 : 0);
    if (e < thr) {
      say('O rival correu!');
      return later(function () { endHand('me', STAKES[H.level], 'oppRun'); }, 900);
    }
    if (e > 0.86 && H.pending < 4 && Math.random() < 0.45) {
      H.level = H.pending; H.lastRaiser = 'opp'; H.pending = H.level + 1;
      say('O rival aceitou e pediu ' + CALLS[H.pending] + '!'); sfx(CALLS[H.pending].toLowerCase());
      return later(showResponse, 800);
    }
    H.level = H.pending; H.lastRaiser = 'me';
    render(); say('O rival aceitou! Agora vale ' + STAKES[H.level] + '.');
    later(nextAction, 900);
  }

  // o jogador responde a um pedido do rival
  function showResponse() {
    var btns = [
      { label: 'Aceitar', cls: 'btn-primary', fn: function () {
          H.level = H.pending; H.lastRaiser = 'opp'; render();
          say('Você aceitou. Agora vale ' + STAKES[H.level] + '.');
          later(nextAction, 800);
      } },
      { label: 'Correr', cls: 'btn-danger', fn: function () { endHand('opp', runPts(), 'run'); } }
    ];
    if (H.pending < 4) btns.splice(1, 0, { label: 'Pedir ' + CALLS[H.pending + 1], fn: function () {
      H.level = H.pending; H.lastRaiser = 'me'; H.pending = H.level + 1; render();
      say('Você aumentou: ' + CALLS[H.pending] + '!'); sfx(CALLS[H.pending].toLowerCase());
      later(aiRespond, 1000);
    } });
    modal('O rival pediu ' + CALLS[H.pending] + '!',
      '<p>Aceitar vale <b>' + STAKES[H.pending] + '</b> ponto' + (STAKES[H.pending] === 1 ? '' : 's') + '. Correr dá <b>' + runPts() + '</b> ao rival.</p>', btns);
  }

  // ---------- ligação com o lobby ----------
  function init() {
    var b = $('btn-open-trutec');
    if (b) b.addEventListener('click', open);
    window.Trutec = { open: open };
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
