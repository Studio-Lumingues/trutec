// ============================================================================
// TRUTEC — truco roguelike solo, estilo Balatro
// - 4 Antes, cada um com 3 blinds (Pequena, Grande, Chefe). Cada blind tem uma
//   META DE PONTOS e um número limitado de MÃOS de truco contra um rival.
// - Mão ganha = FICHAS x MULT. O valor do truco (1/3/6/9/12) é o seu MULT:
//   pedir TRUCO, SEIS, NOVE e DOZE multiplica a pontuação... e o risco.
// - CURINGAS (até 5) dão fichas, mult e dinheiro. Dinheiro vai pra LOJA.
// - TROCAS = descartes: troque cartas antes de jogar a primeira da mão.
// - Chefes mudam as regras. Sem vidas: não bateu a meta nas mãos, acabou.
// Arquivo independente: cria #screen-trutec e usa o botão #btn-open-trutec.
// Ajuste a dificuldade nas constantes logo abaixo.
// ============================================================================
(function () {
  'use strict';

  // ---------- constantes de balanceamento ----------
  var ANTES = 4, HANDS = 4, TROCAS = 3, JSLOTS = 5, CHIPS0 = 30, START_MONEY = 4;
  var BASE = [90, 250, 600, 1400];          // meta base de cada Ante
  var BMULT = [1, 1.5, 2];                   // pequena, grande, chefe
  var BREWARD = [3, 4, 5];                   // dinheiro por blind
  var BEST_KEY = 'trutec-roguelike-best';

  // ---------- baralho ----------
  var RANKS = ['4', '5', '6', '7', 'Q', 'J', 'K', 'A', '2', '3'];
  var SUITS = ['ouros', 'espadas', 'copas', 'paus'];
  var SYM = { ouros: '♦', espadas: '♠', copas: '♥', paus: '♣' };
  var COLOR = { ouros: 'red', espadas: 'black', copas: 'red', paus: 'black' };
  var STAKES = [1, 3, 6, 9, 12];
  var CALLS = ['', 'TRUCO', 'SEIS', 'NOVE', 'DOZE'];
  var CHIPV = { '4': 4, '5': 5, '6': 6, '7': 7, 'Q': 10, 'J': 10, 'K': 10, 'A': 11, '2': 12, '3': 13 };

  // ---------- rivais e chefes ----------
  var SMALLOPP = [
    { name: 'Seu Zé da Padaria', icon: '🥖', bio: 'Joga no feeling.' },
    { name: 'Dona Cida',         icon: '🧶', bio: 'Paciente e cuidadosa.' },
    { name: 'Vó Nena',           icon: '👵', bio: 'Ninguém sabe o que ela tem.' },
    { name: 'Zé do Truco',       icon: '🎩', bio: 'Lenda do bar.' }
  ];
  var BIGOPP = [
    { name: 'Tia Marta',     icon: '🧁', bio: 'Doce, mas competitiva.' },
    { name: 'Seu Jorge',     icon: '🎣', bio: 'Pescador de blefes.' },
    { name: 'Seu Raimundo',  icon: '🧓', bio: 'Jogou truco antes de você nascer.' },
    { name: 'Dr. Almeida',   icon: '🩺', bio: 'Calcula tudo.' }
  ];
  var BOSSES = [
    { key: 'beto',       name: 'Tio Beto',         icon: '🍺', bio: 'Grita TRUCO por qualquer coisa.', effect: 'O rival pede truco o tempo todo.' },
    { key: 'marquinhos', name: 'Marquinhos Blefe', icon: '🃏', bio: 'Mestre do blefe.',                 effect: 'Sem trocas nesta blind.' },
    { key: 'delegado',   name: 'Delegado Tavares', icon: '🕶️', bio: 'Não aceita desaforo.',            effect: 'O mult do truco vale só a metade.' },
    { key: 'coringa',    name: 'O Coringa',        icon: '👑', bio: 'O chefe final.',                   effect: 'Só 3 mãos e o rival é craque.' }
  ];

  // ---------- curingas ----------
  // calc(x) devolve { chips, mult, xmult, money } ou null. x = contexto da mão ganha.
  function isManilha(c) { return H && c.rank === H.mani; }
  var JOKERS = [
    { id: 'zap',       icon: '♣', name: 'Zap!',          price: 6, desc: '+10 Mult se você jogou o Zap (manilha de paus).',
      calc: function (x) { return x.played.some(function (c) { return isManilha(c) && c.suit === 'paus'; }) ? { mult: 10 } : null; } },
    { id: 'manilheiro', icon: '⭐', name: 'Manilheiro',   price: 5, desc: '+4 Mult por manilha que ganhou vaza.',
      calc: function (x) { var n = x.won.filter(isManilha).length; return n ? { mult: 4 * n } : null; } },
    { id: 'tres',      icon: '3️⃣', name: 'Três Amigo',    price: 4, desc: '+25 Fichas por Três que ganhou vaza.',
      calc: function (x) { var n = x.won.filter(function (c) { return c.rank === '3'; }).length; return n ? { chips: 25 * n } : null; } },
    { id: 'sete',      icon: '7️⃣', name: 'Sete Belo',     price: 4, desc: '+7 Mult se você jogou um Sete.',
      calc: function (x) { return x.played.some(function (c) { return c.rank === '7'; }) ? { mult: 7 } : null; } },
    { id: 'caradepau', icon: '😐', name: 'Cara de Pau',   price: 6, desc: 'x1,5 Mult se você pediu truco (ou mais) e ganhou.',
      calc: function (x) { return x.called ? { xmult: 1.5 } : null; } },
    { id: 'ousadia',   icon: '🔥', name: 'Ousadia',       price: 5, desc: '+6 Mult se a mão valia SEIS ou mais.',
      calc: function (x) { return x.level >= 2 ? { mult: 6 } : null; } },
    { id: 'virada',    icon: '🔄', name: 'Virada',        price: 6, desc: 'x2 Mult se perdeu a 1ª vaza e ganhou a mão.',
      calc: function (x) { return x.results[0] === 'opp' ? { xmult: 2 } : null; } },
    { id: 'limpa',     icon: '🧹', name: 'Limpa',         price: 5, desc: 'x1,5 Mult se ganhou por 2 a 0.',
      calc: function (x) { return x.results.length === 2 && x.results.every(function (r) { return r === 'me'; }) ? { xmult: 1.5 } : null; } },
    { id: 'poupador',  icon: '🐷', name: 'Poupador',      price: 5, desc: '+1 Mult a cada $4 que você tem.',
      calc: function (x) { var n = Math.floor(x.money / 4); return n ? { mult: n } : null; } },
    { id: 'paciencia', icon: '⏳', name: 'Paciência',     price: 4, desc: '+25 Fichas por mão que ainda sobra.',
      calc: function (x) { return x.handsLeft > 0 ? { chips: 25 * x.handsLeft } : null; } },
    { id: 'maocheia',  icon: '🖐️', name: 'Mão Cheia',     price: 4, desc: '+60 Fichas se jogou as 3 cartas.',
      calc: function (x) { return x.played.length === 3 ? { chips: 60 } : null; } },
    { id: 'blefe',     icon: '🎭', name: 'Blefe',         price: 6, desc: 'x2,5 Mult quando o rival corre do seu pedido.',
      calc: function (x) { return x.how === 'oppRun' ? { xmult: 2.5 } : null; } },
    { id: 'banqueiro', icon: '🏦', name: 'Banqueiro',     price: 5, desc: '+$2 sempre que ganhar uma mão.',
      calc: function () { return { money: 2 }; } },
    { id: 'moedeiro',  icon: '🪙', name: 'Moedeiro',      price: 4, desc: '+$1 por vaza que você ganhou na mão.',
      calc: function (x) { return x.won.length ? { money: x.won.length } : null; } },
    { id: 'coelho',    icon: '🍀', name: 'Pé de Coelho',  price: 6, desc: 'Empate (cangou) vale vaza sua. +15 Fichas.',
      calc: function () { return { chips: 15 }; } },
    { id: 'covarde',   icon: '🏃', name: 'Covarde',       price: 4, desc: 'Fugir ainda marca 60 pontos.', onRun: true,
      calc: function () { return { chips: 60 }; } },
    { id: 'olho',      icon: '👁️', name: 'Olho de Vidro', price: 4, desc: 'Mostra quantas manilhas e treses o rival tem.' },
    { id: 'gato',      icon: '🐈', name: 'Gato de Sete',  price: 5, desc: '+1 troca em cada blind.' }
  ];
  var VOUCHERS = [
    { id: 'maoextra', icon: '✋', name: 'Mão Extra',      price: 8, desc: '+1 mão em toda blind.' },
    { id: 'baralho',  icon: '🂠',  name: 'Baralho Marcado', price: 6, desc: '+1 troca em toda blind.' },
    { id: 'juros',    icon: '📈', name: 'Poupança',       price: 7, desc: 'Juros por $5 guardados vão até $10 (em vez de $5).' }
  ];
  function jk(id) { return JOKERS.filter(function (j) { return j.id === id; })[0]; }
  function vc(id) { return VOUCHERS.filter(function (v) { return v.id === id; })[0]; }

  // ---------- estado ----------
  var R = null, H = null, tok = 0, built = false;
  var $ = function (id) { return document.getElementById(id); };
  function hasJ(id) { return !!R && R.jokers.indexOf(id) >= 0; }
  function hasV(id) { return !!R && R.vouchers.indexOf(id) >= 0; }
  function rnd(n) { return Math.floor(Math.random() * n); }
  function other(w) { return w === 'me' ? 'opp' : 'me'; }
  function later(fn, ms) { var t = tok; setTimeout(function () { if (t === tok) fn(); }, ms); }
  function best() { try { return parseInt(localStorage.getItem(BEST_KEY), 10) || 0; } catch (e) { return 0; } }
  function saveBest(v) { try { if (v > best()) localStorage.setItem(BEST_KEY, String(v)); } catch (e) {} }
  function shuffle(a) { for (var i = a.length - 1; i > 0; i--) { var j = rnd(i + 1), t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  function fmt(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.'); }
  function sfx(kind) { try { var A = window.GameAudio; if (!A) return; if (kind && A.playCall) A.playCall(kind); else if (A.click) A.click(); } catch (e) {} }

  function makeDeck() {
    var d = [];
    SUITS.forEach(function (s) { RANKS.forEach(function (r) { d.push({ rank: r, suit: s, id: r + s }); }); });
    return d;
  }
  function power(c) { return c.rank === H.mani ? 100 + SUITS.indexOf(c.suit) : RANKS.indexOf(c.rank); }
  function cardChips(c) { return isManilha(c) ? 30 + SUITS.indexOf(c.suit) * 10 : CHIPV[c.rank]; }
  function stakeMult(level) {
    var m = STAKES[level];
    if (R && R.blind && R.blind.boss === 'delegado') m = Math.max(1, Math.ceil(m / 2));
    return m;
  }

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
          '<div class="tt-ante" id="tt-ante">Trutec</div>' +
          '<div class="tt-money" id="tt-money"></div>' +
        '</header>' +
        '<div class="tt-blind" id="tt-blind">' +
          '<div class="tt-bname"><span id="tt-bicon"></span><b id="tt-bname"></b><small id="tt-beffect"></small></div>' +
          '<div class="tt-goal"><span>Meta <b id="tt-target">0</b></span><span>Pontos <b id="tt-score">0</b></span></div>' +
          '<div class="tt-bar"><i id="tt-barfill"></i></div>' +
          '<div class="tt-counters"><span>Mãos <b id="tt-hands">0</b></span><span>Trocas <b id="tt-trocas">0</b></span></div>' +
        '</div>' +
        '<div class="tt-jokers" id="tt-jokers"></div>' +
        '<section class="tt-opp">' +
          '<div class="tt-oppinfo"><span class="tt-oppicon" id="tt-oppicon"></span><span id="tt-oppname"></span></div>' +
          '<div class="tt-opphand" id="tt-opphand"></div>' +
          '<div class="tt-peek" id="tt-peek"></div>' +
        '</section>' +
        '<section class="tt-center">' +
          '<div class="tt-vira"><span>Vira</span><div id="tt-vira"></div><small id="tt-mani"></small></div>' +
          '<div class="tt-table">' +
            '<div class="tt-slot" id="tt-slot-opp"></div>' +
            '<div class="tt-slot" id="tt-slot-me"></div>' +
          '</div>' +
          '<div class="tt-calc" id="tt-calc">' +
            '<div class="tt-cm"><span class="tt-chips" id="tt-chips">30</span><i>×</i><span class="tt-mult" id="tt-mult">1</span></div>' +
            '<div class="tt-total" id="tt-total"></div>' +
            '<div class="tt-pips" id="tt-pips"><i></i><i></i><i></i></div>' +
          '</div>' +
        '</section>' +
        '<div class="tt-msg" id="tt-msg" role="status" aria-live="polite"></div>' +
        '<div class="tt-actions">' +
          '<button type="button" class="action-btn" id="tt-truco">TRUCO</button>' +
          '<button type="button" class="action-btn" id="tt-swap">TROCAR</button>' +
          '<button type="button" class="action-btn danger" id="tt-run">FUGIR</button>' +
        '</div>' +
        '<div class="tt-hand" id="tt-hand"></div>' +
      '</div>' +
      '<div class="tt-overlay hidden" id="tt-overlay"><div class="tt-modal" id="tt-modal"></div></div>';
    host.appendChild(s);

    $('tt-exit').addEventListener('click', function () {
      if (!R) return leave();
      modal('Abandonar a corrida?', '<p>Você perde o progresso desta corrida.</p>', [
        { label: 'Continuar jogando', cls: 'btn-primary' }, { label: 'Sair', cls: 'btn-danger', fn: leave }
      ]);
    });
    $('tt-truco').addEventListener('click', playerCall);
    $('tt-run').addEventListener('click', playerRun);
    $('tt-swap').addEventListener('click', function () {
      if (!canSwap()) return;
      H.swapMode = !H.swapMode;
      say(H.swapMode ? 'Toque na carta que você quer trocar.' : 'Troca cancelada.');
      renderActions();
    });
  }

  function cardEl(c, extra) {
    var el = document.createElement('div');
    el.className = 'card ' + COLOR[c.suit] + ' suit-' + c.suit + (extra ? ' ' + extra : '');
    if (isManilha(c)) el.classList.add('manilha');
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
    var f = box.querySelector('button') || m.querySelector('.tt-mbody button'); if (f) f.focus();
  }
  function closeModal() { $('tt-overlay').classList.add('hidden'); }

  function setCalc(chips, mult, xm, total) {
    $('tt-chips').textContent = Math.round(chips);
    $('tt-mult').textContent = (Math.round(mult * 10) / 10) + (xm > 1 ? ' ×' + (Math.round(xm * 100) / 100) : '');
    $('tt-total').textContent = total ? '= ' + fmt(total) : '';
  }

  function renderJokers() {
    var box = $('tt-jokers'); box.innerHTML = '';
    for (var i = 0; i < JSLOTS; i++) {
      var id = R && R.jokers[i], j = id && jk(id);
      var el = document.createElement('div');
      el.className = 'tt-joker' + (j ? '' : ' empty'); el.dataset.i = i;
      if (j) { el.title = j.name + ': ' + j.desc; el.innerHTML = '<span class="tj-i"></span><small></small>'; el.firstChild.textContent = j.icon; el.lastChild.textContent = j.name; }
      box.appendChild(el);
    }
  }

  function render() {
    if (!R) return;
    $('tt-ante').textContent = 'Ante ' + R.ante + '/' + ANTES;
    $('tt-money').textContent = '$' + R.money;
    renderJokers();
    var b = R.blind;
    if (!b) return;
    $('tt-bicon').textContent = b.opp.icon;
    $('tt-bname').textContent = b.title;
    $('tt-beffect').textContent = b.boss ? b.effect : '';
    $('tt-target').textContent = fmt(b.target);
    $('tt-score').textContent = fmt(R.score);
    $('tt-barfill').style.width = Math.min(100, R.score / b.target * 100) + '%';
    $('tt-hands').textContent = R.handsLeft;
    $('tt-trocas').textContent = R.trocasLeft;
    $('tt-oppname').textContent = b.opp.name;
    $('tt-oppicon').textContent = b.opp.icon;
    if (!H) return;
    var vi = $('tt-vira'); vi.innerHTML = ''; vi.appendChild(cardEl(H.vira, 'tt-mini'));
    $('tt-mani').textContent = 'Manilha: ' + H.mani;
    var oh = $('tt-opphand'); oh.innerHTML = '';
    H.opp.forEach(function () { oh.appendChild(backEl()); });
    var pk = $('tt-peek');
    if (hasJ('olho') && H.opp.length) {
      var mn = 0, th = 0;
      H.opp.forEach(function (c) { if (power(c) >= 100) mn++; else if (c.rank === '3') th++; });
      pk.textContent = '👁️ ' + mn + ' manilha' + (mn === 1 ? '' : 's') + ' e ' + th + ' três no rival';
    } else pk.textContent = '';
    ['me', 'opp'].forEach(function (w) {
      var slot = $('tt-slot-' + w); slot.innerHTML = ''; slot.className = 'tt-slot';
      if (H.table[w]) slot.appendChild(cardEl(H.table[w]));
    });
    var pips = $('tt-pips').children;
    for (var i = 0; i < 3; i++) pips[i].className = H.results[i] === 'me' ? 'on' : H.results[i] === 'opp' ? 'lost' : H.results[i] === 'tie' ? 'tie' : '';
    if (!H.scoring) setCalc(CHIPS0, stakeMult(H.level), 1, 0);
    var hand = $('tt-hand'); hand.innerHTML = '';
    H.me.forEach(function (c, i) {
      var el = cardEl(c, 'tt-mine');
      el.addEventListener('click', function () { onCard(i); });
      hand.appendChild(el);
    });
    renderActions();
  }

  function canSwap() { return !!H && H.canAct && R.trocasLeft > 0 && H.played.length === 0 && !H.table.me; }

  function renderActions() {
    if (!H) return;
    var t = $('tt-truco');
    t.disabled = !(H.canAct && H.level < 4 && H.lastRaiser !== 'me');
    t.textContent = CALLS[Math.min(H.level + 1, 4)];
    $('tt-run').disabled = !H.canAct;
    var s = $('tt-swap');
    s.disabled = !canSwap();
    s.textContent = 'TROCAR (' + R.trocasLeft + ')';
    s.classList.toggle('active', !!H.swapMode);
    document.querySelectorAll('#tt-hand .card').forEach(function (el) {
      el.classList.toggle('playable', !!H.canAct);
      el.classList.toggle('swapping', !!H.swapMode);
    });
  }

  // ============================================================================
  // FLUXO: corrida → blind → mão → vaza
  // ============================================================================
  function open() {
    build();
    if (window.showScreen) window.showScreen('screen-trutec');
    else { document.querySelectorAll('.screen').forEach(function (e) { e.classList.remove('active'); }); $('screen-trutec').classList.add('active'); }
    tok++; R = null; H = null;
    ['tt-hand', 'tt-opphand', 'tt-vira', 'tt-slot-me', 'tt-slot-opp', 'tt-jokers'].forEach(function (id) { $(id).innerHTML = ''; });
    $('tt-ante').textContent = 'Trutec'; $('tt-money').textContent = ''; $('tt-bname').textContent = 'Roguelike solo';
    $('tt-bicon').textContent = '🃏'; $('tt-beffect').textContent = ''; $('tt-oppname').textContent = ''; $('tt-oppicon').textContent = '';
    $('tt-target').textContent = '0'; $('tt-score').textContent = '0'; $('tt-barfill').style.width = '0';
    $('tt-hands').textContent = '0'; $('tt-trocas').textContent = '0'; $('tt-mani').textContent = ''; $('tt-peek').textContent = '';
    setCalc(CHIPS0, 1, 1, 0); say('');
    $('tt-truco').disabled = true; $('tt-run').disabled = true; $('tt-swap').disabled = true;
    intro();
  }
  function leave() {
    tok++; R = H = null; closeModal();
    if (window.showScreen) window.showScreen('screen-lobby');
  }

  function intro() {
    var b = best();
    modal('Trutec',
      '<p>Truco paulista roguelike, estilo Balatro.</p><ul class="tt-rules">' +
      '<li>Cada <b>blind</b> tem uma <b>meta de pontos</b>. Você tem poucas <b>mãos</b> pra bater a meta.</li>' +
      '<li>Mão ganha vale <b>Fichas × Mult</b>. O valor do truco é o seu Mult: <b>TRUCO ×3, SEIS ×6, NOVE ×9, DOZE ×12</b>.</li>' +
      '<li>Perder uma mão valendo truco+ custa dinheiro. Fugir não custa, mas gasta a mão.</li>' +
      '<li>Ganhe <b>$</b>, compre <b>curingas</b> na loja e monte combos. Use as <b>trocas</b> pra melhorar a mão.</li>' +
      '<li>Chefes mudam as regras. Vença os 4 Antes pra ser campeão.</li></ul>' +
      (b ? '<p class="tt-best">Recorde: ' + b + ' blind' + (b === 1 ? '' : 's') + ' vencida' + (b === 1 ? '' : 's') + ' de ' + (ANTES * 3) + '</p>' : ''),
      [{ label: 'Começar corrida', cls: 'btn-primary', fn: startRun }, { label: 'Voltar', fn: leave }]);
  }

  function startRun() {
    tok++;
    R = { ante: 1, bi: 0, money: START_MONEY, jokers: [], vouchers: [], score: 0, cleared: 0, blind: null, handsLeft: 0, trocasLeft: 0 };
    H = null;
    blindSelect();
  }

  function makeBlind() {
    var a = R.ante, bi = R.bi, kind = ['small', 'big', 'boss'][bi];
    var target = Math.round(BASE[a - 1] * BMULT[bi] / 5) * 5;
    var o, boss = null, title;
    if (kind === 'boss') { boss = BOSSES[a - 1]; o = boss; title = 'Chefe: ' + boss.name; }
    else if (kind === 'big') { o = BIGOPP[a - 1]; title = 'Blind Grande'; }
    else { o = SMALLOPP[a - 1]; title = 'Blind Pequena'; }
    var opp = { name: o.name, icon: o.icon, bio: o.bio, skill: 0.28 + 0.14 * (a - 1) + 0.05 * bi, bluff: 0.06 + 0.05 * bi, aggr: 0.25 + 0.05 * bi };
    if (boss && boss.key === 'beto') { opp.aggr = 0.95; opp.bluff = 0.35; }
    if (boss && boss.key === 'coringa') { opp.skill = 0.95; opp.aggr = 0.7; }
    return { kind: kind, title: title, target: target, reward: BREWARD[bi], opp: opp, boss: boss ? boss.key : null, effect: boss ? boss.effect : '' };
  }

  function blindSelect() {
    tok++;
    R.blind = makeBlind(); R.score = 0; H = null;
    render();
    var b = R.blind;
    var body = '<p class="tt-bigicon">' + b.opp.icon + '</p><p><b>' + b.opp.name + '</b><br>' + b.opp.bio + '</p>' +
      '<p class="tt-goalbig">Meta: <b>' + fmt(b.target) + '</b> pontos</p>' +
      '<p>Recompensa: <b>$' + b.reward + '</b> + $1 por mão que sobrar + juros</p>' +
      (b.boss ? '<p class="tt-bosseffect">⚠ ' + b.effect + '</p>' : '');
    var btns = [{ label: 'Jogar', cls: 'btn-primary', fn: beginBlind }];
    if (b.kind !== 'boss') btns.push({ label: 'Pular (+$3, sem loja)', fn: function () { R.money += 3; advance(); blindSelect(); } });
    modal('Ante ' + R.ante + ' — ' + b.title, body, btns);
  }

  function advance() { R.bi++; if (R.bi > 2) { R.bi = 0; R.ante++; } }

  function beginBlind() {
    tok++;
    var boss = R.blind.boss;
    R.score = 0;
    R.handsLeft = HANDS + (hasV('maoextra') ? 1 : 0) - (boss === 'coringa' ? 1 : 0);
    R.trocasLeft = boss === 'marquinhos' ? 0 : TROCAS + (hasV('baralho') ? 1 : 0) + (hasJ('gato') ? 1 : 0);
    R.leader = Math.random() < 0.5 ? 'me' : 'opp';
    render();
    newHand();
  }

  function newHand() {
    tok++;
    var d = shuffle(makeDeck());
    H = {
      me: [d.pop(), d.pop(), d.pop()], opp: [d.pop(), d.pop(), d.pop()], vira: d.pop(), deck: d,
      level: 0, pending: 0, lastRaiser: null, called: false, results: [], table: { me: null, opp: null },
      turn: R.leader, trickLeader: R.leader, canAct: false, swapMode: false, scoring: false,
      played: [], won: []
    };
    H.mani = RANKS[(RANKS.indexOf(H.vira.rank) + 1) % RANKS.length];
    render();
    say(R.leader === 'me' ? 'Você abre a mão.' : 'O rival abre a mão.');
    later(nextAction, 900);
  }

  function nextAction() {
    if (H.turn === 'me') { H.canAct = true; renderActions(); say('Sua vez.'); }
    else aiTurn();
  }

  function onCard(i) {
    if (!H || !H.canAct) return;
    if (H.swapMode) {
      if (!H.deck.length || R.trocasLeft < 1) return;
      H.me[i] = H.deck.pop();
      R.trocasLeft--; H.swapMode = false;
      sfx(); say('Carta trocada.'); render();
      return;
    }
    playCard('me', i);
  }

  function playCard(who, idx) {
    var c = H[who].splice(idx, 1)[0];
    H.table[who] = c; H.canAct = false; H.swapMode = false;
    if (who === 'me') H.played.push(c);
    sfx(); render();
    if (H.table.me && H.table.opp) { later(resolveTrick, 900); return; }
    H.turn = other(who);
    later(nextAction, who === 'me' ? 600 : 0);
  }

  function resolveTrick() {
    var pm = power(H.table.me), po = power(H.table.opp);
    var r = pm > po ? 'me' : po > pm ? 'opp' : 'tie';
    if (r === 'tie' && hasJ('coelho')) r = 'me';
    H.results.push(r);
    if (r === 'me') H.won.push(H.table.me);
    var ws = r === 'tie' ? null : $('tt-slot-' + r);
    if (ws) ws.classList.add('won');
    say(r === 'me' ? 'Você levou a vaza!' : r === 'opp' ? 'O rival levou a vaza.' : 'Empatou! (cangou)');
    var pips = $('tt-pips').children; pips[H.results.length - 1].className = r === 'me' ? 'on' : r === 'opp' ? 'lost' : 'tie';
    later(function () {
      H.table = { me: null, opp: null };
      var w = handWinner(H.results);
      if (w === 'draw') return endHand(null, 'draw');
      if (w) return endHand(w, 'cards');
      H.turn = r === 'tie' ? H.trickLeader : r;
      H.trickLeader = H.turn;
      render(); nextAction();
    }, 1200);
  }

  // ---------- pontuação (Fichas × Mult) ----------
  function computeScore(how) {
    var steps = [], chips, mult, xm = 1, money = 0;
    if (how === 'run') { chips = 0; mult = 1; }
    else {
      chips = CHIPS0; mult = stakeMult(H.level);
      H.won.forEach(function (c) { var v = cardChips(c); chips += v; steps.push({ t: 'card', label: c.rank + SYM[c.suit] + ' +' + v + ' fichas', chips: chips, mult: mult, xm: xm }); });
    }
    var x = { how: how, level: H.level, results: H.results, played: H.played, won: H.won, called: H.called, money: R.money, handsLeft: R.handsLeft - 1 };
    R.jokers.forEach(function (id, i) {
      var j = jk(id); if (!j || !j.calc) return;
      if (how === 'run' && !j.onRun) return;
      var e = j.calc(x); if (!e) return;
      var txt = [];
      if (e.chips) { chips += e.chips; txt.push('+' + e.chips + ' fichas'); }
      if (e.mult) { mult += e.mult; txt.push('+' + e.mult + ' mult'); }
      if (e.xmult) { xm *= e.xmult; txt.push('×' + e.xmult + ' mult'); }
      if (e.money) { money += e.money; txt.push('+$' + e.money); }
      steps.push({ t: 'joker', idx: i, label: j.name + ' ' + txt.join(' '), chips: chips, mult: mult, xm: xm });
    });
    return { steps: steps, chips: chips, mult: mult, xm: xm, money: money, total: how === 'run' && !chips ? 0 : Math.round(chips * mult * xm) };
  }

  function animateScore(res, done) {
    H.scoring = true;
    setCalc(res.steps.length ? CHIPS0 : res.chips, stakeMult(H.level), 1, 0);
    res.steps.forEach(function (s, i) {
      later(function () {
        setCalc(s.chips, s.mult, s.xm, 0);
        say(s.label);
        if (s.t === 'joker') {
          var el = document.querySelector('#tt-jokers .tt-joker[data-i="' + s.idx + '"]');
          if (el) { el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop'); }
        }
        sfx();
      }, 550 * (i + 1));
    });
    var n = res.steps.length;
    later(function () { setCalc(res.chips, res.mult, res.xm, res.total); say('+' + fmt(res.total) + ' pontos!'); }, 550 * (n + 1));
    later(function () {
      R.score += res.total; R.money += res.money; H.scoring = false;
      render(); done();
    }, 550 * (n + 1) + 1100);
  }

  function endHand(winner, how) {
    H.canAct = false;
    if (how === 'draw') { say('Mão empatada: ninguém pontua.'); return later(handDone, 1600); }
    if (how === 'run') {
      var rr = computeScore('run');
      if (rr.total > 0) return animateScore(rr, handDone);
      say('Você fugiu. Mão perdida, mas sem custo.'); return later(handDone, 1600);
    }
    if (winner === 'me') {
      say(how === 'oppRun' ? 'O rival correu!' : 'Você ganhou a mão!');
      return later(function () { animateScore(computeScore(how), handDone); }, 800);
    }
    var pen = Math.min(R.money, H.level);
    R.money -= pen;
    say('O rival ganhou a mão.' + (pen ? ' Você perdeu $' + pen + '.' : '')); render();
    later(handDone, 1800);
  }

  function handDone() {
    R.handsLeft--; render();
    if (R.score >= R.blind.target) return blindWon();
    if (R.handsLeft <= 0) return gameOver();
    R.leader = other(R.leader);
    newHand();
  }

  // ---------- fim de blind / loja ----------
  function blindWon() {
    var b = R.blind;
    H = null;
    R.cleared++; saveBest(R.cleared);
    var interestCap = hasV('juros') ? 10 : 5;
    var interest = Math.min(interestCap, Math.floor(R.money / 5));
    var hl = Math.max(0, R.handsLeft);
    var total = b.reward + hl + interest;
    R.money += total;
    render();
    var isLast = b.kind === 'boss' && R.ante >= ANTES;
    var body = '<ul class="tt-pay"><li><span>Blind vencida</span><b>$' + b.reward + '</b></li>' +
      '<li><span>Mãos que sobraram (' + hl + ')</span><b>$' + hl + '</b></li>' +
      '<li><span>Juros ($1 a cada $5)</span><b>$' + interest + '</b></li></ul>' +
      '<p class="tt-best">Você tem $' + R.money + '</p>';
    if (isLast) return modal('🏆 Campeão do Trutec!', '<p>Você derrotou O Coringa e venceu os ' + ANTES + ' Antes!</p>' + body,
      [{ label: 'Nova corrida', cls: 'btn-primary', fn: startRun }, { label: 'Sair', fn: leave }]);
    modal('Blind vencida!', body, [{ label: 'Ir à loja', cls: 'btn-primary', fn: openShop }]);
  }

  function openShop() {
    var pool = shuffle(JOKERS.filter(function (j) { return R.jokers.indexOf(j.id) < 0; })).slice(0, 3);
    var items = pool.map(function (j) { return { type: 'joker', id: j.id, price: j.price }; });
    var vs = VOUCHERS.filter(function (v) { return R.vouchers.indexOf(v.id) < 0; });
    if (vs.length) { var v = vs[rnd(vs.length)]; items.push({ type: 'voucher', id: v.id, price: v.price }); }
    R.shop = { items: items, rerolls: 0 };
    renderShop();
  }

  function renderShop() {
    var S = R.shop, box = document.createElement('div'); box.className = 'tt-shop';
    function btn(label, cls, fn, dis) {
      var b = document.createElement('button'); b.type = 'button'; b.className = 'btn ' + cls; b.textContent = label; b.disabled = !!dis;
      b.addEventListener('click', fn); return b;
    }
    var h = document.createElement('p'); h.className = 'tt-shopmoney'; h.textContent = 'Você tem $' + R.money; box.appendChild(h);

    var t1 = document.createElement('h3'); t1.textContent = 'Seus curingas (' + R.jokers.length + '/' + JSLOTS + ')'; box.appendChild(t1);
    var own = document.createElement('div'); own.className = 'tt-shoplist';
    if (!R.jokers.length) { var e = document.createElement('p'); e.className = 'tt-best'; e.textContent = 'Nenhum ainda.'; own.appendChild(e); }
    R.jokers.forEach(function (id, i) {
      var j = jk(id), row = document.createElement('div'); row.className = 'tt-shoprow';
      row.innerHTML = '<span class="tj-i"></span><span class="tt-st"><b></b><small></small></span>';
      row.querySelector('.tj-i').textContent = j.icon; row.querySelector('b').textContent = j.name; row.querySelector('small').textContent = j.desc;
      var sell = Math.floor(j.price / 2);
      row.appendChild(btn('Vender $' + sell, 'btn-secondary', function () { R.jokers.splice(i, 1); R.money += sell; render(); renderShop(); }));
      own.appendChild(row);
    });
    box.appendChild(own);

    var t2 = document.createElement('h3'); t2.textContent = 'Loja'; box.appendChild(t2);
    var list = document.createElement('div'); list.className = 'tt-shoplist';
    if (!S.items.length) { var e2 = document.createElement('p'); e2.className = 'tt-best'; e2.textContent = 'Esgotado. Role a loja!'; list.appendChild(e2); }
    S.items.forEach(function (it, i) {
      var d = it.type === 'joker' ? jk(it.id) : vc(it.id), row = document.createElement('div'); row.className = 'tt-shoprow';
      row.innerHTML = '<span class="tj-i"></span><span class="tt-st"><b></b><small></small></span>';
      row.querySelector('.tj-i').textContent = d.icon;
      row.querySelector('b').textContent = d.name + (it.type === 'voucher' ? ' (permanente)' : '');
      row.querySelector('small').textContent = d.desc;
      var full = it.type === 'joker' && R.jokers.length >= JSLOTS;
      row.appendChild(btn(full ? 'Sem espaço' : 'Comprar $' + it.price, 'btn-primary', function () {
        R.money -= it.price;
        if (it.type === 'joker') R.jokers.push(it.id); else R.vouchers.push(it.id);
        S.items.splice(i, 1); render(); renderShop();
      }, R.money < it.price || full));
      list.appendChild(row);
    });
    box.appendChild(list);
    var cost = 3 + S.rerolls;
    box.appendChild(btn('Rolar loja ($' + cost + ')', 'btn-secondary tt-reroll', function () {
      R.money -= cost; S.rerolls++;
      var owned = R.jokers.slice();
      var pool = shuffle(JOKERS.filter(function (j) { return owned.indexOf(j.id) < 0; })).slice(0, 3);
      var items = pool.map(function (j) { return { type: 'joker', id: j.id, price: j.price }; });
      var vs = VOUCHERS.filter(function (v) { return R.vouchers.indexOf(v.id) < 0; });
      if (vs.length) { var v = vs[rnd(vs.length)]; items.push({ type: 'voucher', id: v.id, price: v.price }); }
      S.items = items; render(); renderShop();
    }, R.money < cost));
    modal('Loja', box, [{ label: 'Próxima blind ›', cls: 'btn-primary', fn: function () { advance(); blindSelect(); } }]);
  }

  function gameOver() {
    var b = R.blind;
    H = null;
    modal('Fim da corrida', '<p>Você fez <b>' + fmt(R.score) + '</b> de <b>' + fmt(b.target) + '</b> pontos contra ' + b.opp.name + '.</p>' +
      '<p class="tt-best">Ante ' + R.ante + ' · ' + b.title + ' · Blinds vencidas: ' + R.cleared + '/' + (ANTES * 3) + ' · Recorde: ' + Math.max(best(), R.cleared) + '</p>',
      [{ label: 'Nova corrida', cls: 'btn-primary', fn: startRun }, { label: 'Sair', fn: leave }]);
  }

  // ============================================================================
  // TRUCO: pedidos e respostas
  // ============================================================================
  function playerRun() {
    if (!H || !H.canAct) return;
    endHand('opp', 'run');
  }
  function playerCall() {
    if (!H || !H.canAct || H.level >= 4 || H.lastRaiser === 'me') return;
    H.canAct = false; renderActions();
    H.pending = H.level + 1; H.called = true;
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
      var o = R.blind.opp, e = est(H.opp, H.results, 'opp') + noise(o);
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
    var o = R.blind.opp, hand = H.opp;
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
    var o = R.blind.opp, e = est(H.opp, H.results, 'opp') + noise(o);
    var thr = 0.42 + 0.06 * H.pending - o.aggr * 0.06;
    if (e < thr) {
      say('O rival correu!');
      return later(function () { endHand('me', 'oppRun'); }, 900);
    }
    if (e > 0.86 && H.pending < 4 && Math.random() < 0.45) {
      H.level = H.pending; H.lastRaiser = 'opp'; H.pending = H.level + 1;
      say('O rival aceitou e pediu ' + CALLS[H.pending] + '!'); sfx(CALLS[H.pending].toLowerCase());
      return later(showResponse, 800);
    }
    H.level = H.pending; H.lastRaiser = 'me';
    render(); say('O rival aceitou! Agora vale ×' + stakeMult(H.level) + '.');
    later(nextAction, 900);
  }
  function showResponse() {
    var btns = [
      { label: 'Aceitar', cls: 'btn-primary', fn: function () {
          H.level = H.pending; H.lastRaiser = 'opp'; render();
          say('Você aceitou. Agora vale ×' + stakeMult(H.level) + '.');
          later(nextAction, 800);
      } },
      { label: 'Correr', cls: 'btn-danger', fn: function () { endHand('opp', 'run'); } }
    ];
    if (H.pending < 4) btns.splice(1, 0, { label: 'Pedir ' + CALLS[H.pending + 1], fn: function () {
      H.level = H.pending; H.lastRaiser = 'me'; H.called = true; H.pending = H.level + 1; render();
      say('Você aumentou: ' + CALLS[H.pending] + '!'); sfx(CALLS[H.pending].toLowerCase());
      later(aiRespond, 1000);
    } });
    var pen = H.pending;   // perder valendo isso custa $ (nível aceito)
    modal('O rival pediu ' + CALLS[H.pending] + '!',
      '<p>Aceitar deixa o Mult em <b>×' + stakeMult(H.pending) + '</b>. Se perder a mão, você paga <b>$' + pen + '</b>.</p>' +
      '<p>Correr: perde a mão, sem custo.</p>', btns);
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
