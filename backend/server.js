// ============================================================================
// TRUCO PAULISTA ONLINE — server.js
// Node.js + Express + Socket.io
// ============================================================================

const express = require('express');
const http = require('http');
const path = require('path');
const crypto = require('crypto');
const cors = require('cors');
const { Server } = require('socket.io');
const createBot = require('./bot');

const app = express();
const server = http.createServer(app);

// ---------------------------------------------------------------------------
// CORS: o frontend agora roda em outro domínio (ex: Vercel), então liberamos
// explicitamente as origens permitidas via variável de ambiente ALLOWED_ORIGINS
// (lista separada por vírgula). Em branco = libera geral (bom para testar).
// Exemplo no Render: ALLOWED_ORIGINS=https://seu-jogo.vercel.app,http://localhost:5500
// ---------------------------------------------------------------------------
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

function corsOriginCheck(origin, callback) {
  if (!origin) return callback(null, true); // requests sem origin (curl, health check)
  if (allowedOrigins.length === 0) return callback(null, true); // libera tudo se não configurado
  if (allowedOrigins.includes(origin)) return callback(null, true);
  callback(new Error('Origem não permitida pelo CORS: ' + origin));
}

app.use(cors({ origin: corsOriginCheck }));

const io = new Server(server, {
  cors: {
    origin: allowedOrigins.length ? allowedOrigins : '*',
    methods: ['GET', 'POST']
  }
});

const PORT = process.env.PORT || 3000;

// Serve os arquivos estáticos do frontend só como conveniência para testar
// localmente sem precisar rodar dois servidores. Em produção o frontend fica
// hospedado separadamente na Vercel.
app.use(express.static(path.join(__dirname, '..', 'frontend')));
// /health mostra a versão do código que está rodando de verdade (útil pra conferir se o deploy no Render pegou).
app.get('/health', (req, res) => res.json({ ok: true, version: '1.2.0', features: ['character-ack', 'rejoin', 'bots', 'swap-teams'], rooms: rooms.size }));

// ---------------------------------------------------------------------------
// Constantes do jogo
// ---------------------------------------------------------------------------

const SUITS = ['ouros', 'espadas', 'copas', 'paus']; // diamante, espada, copas, paus
const SUIT_SYMBOLS = { ouros: '♦', espadas: '♠', copas: '♥', paus: '♣' };
const SUIT_COLOR = { ouros: 'red', espadas: 'black', copas: 'red', paus: 'black' };
// Ordem de força das cartas (sem manilha), do mais fraco pro mais forte
const RANK_ORDER = ['4', '5', '6', '7', 'Q', 'J', 'K', 'A', '2', '3'];
// Força da manilha por naipe (Truco Paulista): ouros < espadas < copas < paus
const MANILHA_SUIT_STRENGTH = { ouros: 0, espadas: 1, copas: 2, paus: 3 };

const STAKE_SEQUENCE = [1, 3, 6, 9, 12];
const STAKE_LABEL = { 1: 'valendo 1', 3: 'TRUCO', 6: 'SEIS', 9: 'NOVE', 12: 'DOZE' };
const NEXT_CALL_NAME = { 1: 'truco', 3: 'seis', 6: 'nove', 9: 'doze' };

// ---------------------------------------------------------------------------
// Estado em memória
// ---------------------------------------------------------------------------

/** @type {Map<string, Room>} */
const rooms = new Map();

// Mão de 11: quanto tempo a dupla com 11 pontos tem pra ver as cartas uma da outra (ms).
const PEEK_MS = 10000;
// Mão de 11: tempo da votação "às cegas" ou "normal" antes da mão começar (ms).
const VOTE_MS = 10000;

function genRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code;
  do {
    code = Array.from({ length: 5 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  } while (rooms.has(code));
  return code;
}

function buildDeck() {
  const deck = [];
  for (const suit of SUITS) {
    for (const rank of RANK_ORDER) {
      deck.push({ id: `${rank}-${suit}`, rank, suit });
    }
  }
  return deck;
}

// Personagem é um PNG (dataURL) desenhado no cliente. Validação simples pra
// evitar lixo/abuso: só aceita dataURL de PNG e limita o tamanho.
// Tema visual e vitórias/derrotas que cada jogador informa ao entrar (só pra
// exibir no card ao passar o mouse no boneco). Tudo validado: nada disso afeta o jogo.
function sanitizeTheme(theme) {
  if (typeof theme !== 'string') return null;
  return /^[a-z0-9_-]{1,24}$/i.test(theme) ? theme : null;
}
function sanitizeStats(stats) {
  if (!stats || typeof stats !== 'object') return null;
  const n = (v) => { v = parseInt(v, 10); return isFinite(v) && v > 0 ? Math.min(v, 999999) : 0; };
  return { wins: n(stats.wins), losses: n(stats.losses) };
}

const B64_PNG = /^data:image\/png;base64,[A-Za-z0-9+\/]+={0,2}$/;
const B64_JPG = /^data:image\/jpeg;base64,[A-Za-z0-9+\/]+={0,2}$/;

function sanitizeCharacter(character) {
  if (typeof character !== 'string') return null;
  if (character.length > 400000) return null; // ~300KB, generoso pra um canvas 500x500
  if (!B64_PNG.test(character)) return null;  // só base64 puro (nada de aspas/HTML dentro do src)
  return character;
}

// Foto do administrador (comando `auth foto`): JPEG pequeno, só base64 puro.
// Link do SoundCloud (comando `auth musica`): só aceita hosts do SoundCloud.
const SC_HOSTS = new Set(['soundcloud.com', 'www.soundcloud.com', 'm.soundcloud.com', 'on.soundcloud.com', 'api.soundcloud.com']);
function sanitizeScUrl(u) {
  if (typeof u !== 'string') return null;
  let x;
  try { x = new URL(u.trim().slice(0, 300)); } catch (e) { return null; }
  if (x.protocol !== 'https:' && x.protocol !== 'http:') return null;
  const h = x.hostname.toLowerCase();
  if (!SC_HOSTS.has(h)) return null;
  x.protocol = 'https:';
  x.hash = '';
  if (h === 'm.soundcloud.com' || h === 'www.soundcloud.com') x.hostname = 'soundcloud.com';
  return x.toString();
}
// Links curtos (on.soundcloud.com/xxxx, do botão compartilhar do app) redirecionam pro link real.
async function resolveScShortUrl(url) {
  const x = new URL(url);
  if (x.hostname !== 'on.soundcloud.com' || typeof fetch !== 'function') return url;
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), 5000);
  try {
    const res = await fetch(url, { redirect: 'manual', signal: ctrl.signal });
    const loc = res.headers.get('location');
    return (loc && sanitizeScUrl(new URL(loc, url).toString())) || null;
  } catch (e) { return null; } finally { clearTimeout(to); }
}

// Quem entra (ou reconecta) numa sala com música tocando recebe a faixa já no ponto certo.
function sendMusicTo(r, socket) {
  if (!r || !r.music) return;
  socket.emit('room_music', { action: 'play', url: r.music.url, offsetMs: Date.now() - r.music.startedAt, by: r.music.by });
}

function sanitizePhoto(photo) {
  if (typeof photo !== 'string') return null;
  if (photo.length > 300000) return null;
  if (!B64_JPG.test(photo)) return null;
  return photo;
}

// O que todo mundo vê no lugar do boneco: a foto do admin (se tiver) ou o personagem.
// Bot que assumiu o lugar de alguém não herda a foto.
function shownCharacter(p) {
  if (p.isBot) return p.character || null;
  return p.adminPhoto || p.character || null;
}

// Efeitos de nome liberados (só o admin define, via `auth nome`).
const NAME_FX = new Set(['fogo', 'arco-iris', 'neon', 'glitch', 'gelo', 'ouro', 'eletrico', 'galaxia', 'sangue', 'matrix']);
function fxOf(p) { return p.isBot ? null : (p.nameFx || null); }

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function rankIndex(rank) {
  return RANK_ORDER.indexOf(rank);
}

function manilhaRankFromVira(viraRank) {
  // Regra da casa: se a vira (carta que tombou) for 2 ou 3, a manilha é o 4.
  if (viraRank === '2' || viraRank === '3') return '4';
  const idx = rankIndex(viraRank);
  return RANK_ORDER[(idx + 1) % RANK_ORDER.length];
}

function cardStrength(card, manilhaRank) {
  if (card.rank === manilhaRank) {
    return 100 + MANILHA_SUIT_STRENGTH[card.suit];
  }
  return rankIndex(card.rank);
}

// Recebe [{ seat, strength }] e diz quem venceu. Só é empate ("melou") quando
// a carta mais forte aparece em times DIFERENTES — dois parceiros com cartas
// iguais não empatam a vaza contra os adversários.
function evaluateEntries(entries, seatTeam) {
  let max = -1;
  for (const e of entries) if (e.strength > max) max = e.strength;
  const top = entries.filter(e => e.strength === max);
  const teams = new Set(top.map(e => seatTeam(e.seat)));
  if (teams.size > 1) return { tie: true, winnerSeat: null, winnerTeam: null };
  return { tie: false, winnerSeat: top[0].seat, winnerTeam: seatTeam(top[0].seat) };
}

// ---------------------------------------------------------------------------
// Sala / Jogo
// ---------------------------------------------------------------------------

class Room {
  constructor(code, mode, isPublic, hostName) {
    this.code = code;
    this.mode = mode; // '1v1' or '2v2'
    this.maxPlayers = mode === '1v1' ? 2 : 4;
    this.isPublic = isPublic;
    this.players = []; // { id (socketId), name, seat, team, connected, hand: [] }
    this.started = false;
    this.chatLog = [];
    this.music = null; // { url, startedAt, by } — música do SoundCloud tocando na sala (`auth musica`)
    this.characterPhaseTimer = null; // setTimeout ativo durante os 45s de "desenhar o personagem"
    this.characterPhaseEndsAt = 0;

    // Estado de jogo (preenchido em startGame)
    this.deck = [];
    this.vira = null;
    this.manilhaRank = null;
    this.dealerSeat = -1;
    this.turnSeat = -1;
    this.leaderSeat = -1; // quem abre a rodada atual (trick)
    this.table = []; // { seat, card, hidden }
    this.tricks = []; // resultado de cada vaza: { winnerTeam: 0|1|null }
    this.score = [0, 0];
    this.stake = 1;
    this.lastRaiserTeam = null; // time que fez a última aposta (não pode aumentar de novo sem resposta)
    this.pendingCall = null; // { level, callingTeam, respondingTeam }
    this.maoNumber = 0;
    this.gameOver = false;
    this.hiddenCardBySeat = {}; // seat -> true (jogou "escondida", visível só ao dono até revelar)
    this.readySeats = new Set(); // assentos que salvaram o personagem na fase de desenho
    this.busy = false; // true durante o showdown de "melou" (bloqueia jogadas e trucos)
    this.nextPlayAt = 0; // timestamp (ms) a partir do qual a próxima carta pode entrar na mesa
    this.queuedPlay = false; // já existe uma jogada adiantada aguardando o intervalo
    this.handOver = false; // true entre o fim de uma mão e o começo da próxima (ninguém joga nesse intervalo)
    this._botTimer = null; // timer do bot (ver botKick)
    this.peekTeam = null; // mão de 11: dupla que pode ver as cartas uma da outra
    this.peekUntil = 0; // mão de 11: timestamp (ms) em que a janela de 10s acaba
    this._peekTimer = null;
    this.voteOn = false; // mão de ferro (11 x 11): votação aberta pra todos
    this.voteUntil = 0;
    this._votes = {}; // seat -> 'cegas' | 'normal'
    this._voteTimer = null;
    this.blind = false; // mão de ferro: todo mundo joga às cegas (ninguém vê as próprias cartas)
    this._botFails = 0;
    this._botSig = '';
  }

  get teamsCount() {
    return this.mode === '2v2' ? 2 : 2; // sempre 2 times (1v1: 1 jogador por time)
  }

  seatTeam(seat) {
    // O time de cada assento é o que está gravado no jogador (player.team).
    // Por padrão, ao entrar na sala, o jogador recebe seat % 2 (ver
    // joinRoomInternal), mas no modo 2v2 o host pode reorganizar as duplas
    // livremente antes de iniciar a partida (ver evento 'set_player_team').
    const p = this.playerBySeat(seat);
    return p ? p.team : seat % 2;
  }

  // Quantos jogadores tem em cada time no momento (só faz sentido no 2v2).
  teamCounts() {
    const counts = [0, 0];
    for (const p of this.players) counts[p.team]++;
    return counts;
  }

  // Duplas prontas pra iniciar: no 2v2, exatamente 2 jogadores por time.
  teamsReady() {
    if (this.mode !== '2v2') return true;
    const [a, b] = this.teamCounts();
    return a === 2 && b === 2;
  }

  // Quem já salvou o personagem durante a fase de desenho (pra mostrar ao lado).
  characterReadyState() {
    return this.players.map(p => ({
      seat: p.seat, name: p.name, team: p.team, connected: p.connected, isBot: !!p.isBot,
      character: shownCharacter(p), nameFx: fxOf(p),
      ready: this.readySeats.has(p.seat)
    }));
  }

  publicSummary() {
    return {
      code: this.code,
      mode: this.mode,
      players: this.players.length,
      maxPlayers: this.maxPlayers,
      started: this.started
    };
  }

  lobbyState() {
    return {
      code: this.code,
      mode: this.mode,
      isPublic: this.isPublic,
      maxPlayers: this.maxPlayers,
      started: this.started,
      // Sala cheia, com duplas fechadas (2v2) e ainda não iniciada = pronta
      // pro host apertar "Iniciar".
      canStart: !this.started && this.players.length === this.maxPlayers && this.teamsReady(),
      teamsReady: this.teamsReady(),
      players: this.players.map(p => ({
        seat: p.seat, name: p.name, team: p.team, connected: p.connected, character: shownCharacter(p), nameFx: fxOf(p), isBot: !!p.isBot,
        theme: p.theme || null, stats: p.stats || null
      }))
    };
  }

  otherSeats(seat) {
    return this.players.filter(p => p.seat !== seat);
  }

  playerBySeat(seat) {
    return this.players.find(p => p.seat === seat);
  }

  playerBySocket(id) {
    return this.players.find(p => p.id === id);
  }

  teamName(team) {
    return this.mode === '1v1'
      ? this.playerBySeat(team) ? this.playerBySeat(team).name : `Time ${team + 1}`
      : `Dupla ${team + 1}`;
  }

  // -------------------------------------------------------------------
  // No 2v2 as jogadas seguem a ordem dos assentos (0 -> 1 -> 2 -> 3), então os
  // parceiros TÊM que ficar em assentos opostos (0 e 2 / 1 e 3): é o que faz as
  // jogadas alternarem entre as duplas e o parceiro aparecer de frente na mesa.
  // Como o host escolhe as duplas livremente na sala de espera (só muda
  // player.team), aqui os assentos são reorganizados pelas duplas escolhidas:
  //   assento 0 = host | 1 = adversário | 2 = parceiro do host | 3 = adversário
  // O host continua no assento 0. A ordem original é mantida dentro de cada dupla.
  reseatByTeams() {
    if (this.mode !== '2v2' || this.players.length !== 4 || !this.teamsReady()) return;
    const bySeat = [...this.players].sort((a, b) => a.seat - b.seat);
    const host = bySeat[0];
    const mates = bySeat.filter(p => p !== host && p.team === host.team);
    const foes = bySeat.filter(p => p.team !== host.team);
    if (mates.length !== 1 || foes.length !== 2) return;
    const order = [host, foes[0], mates[0], foes[1]];
    order.forEach((p, i) => { p.seat = i; });
    this.players = order;
  }

  startGame() {
    this.reseatByTeams();
    this.started = true;
    this.score = [0, 0];
    this.dealerSeat = 0;
    this.startMao();
  }

  startMao() {
    this.maoNumber++;
    this.deck = shuffle(buildDeck());
    this.table = [];
    this.tricks = [];
    this.stake = 1;
    this.lastRaiserTeam = null;
    this.pendingCall = null;
    this.hiddenCardBySeat = {};
    this.busy = false;
    this.handOver = false;
    this.nextPlayAt = 0;
    this.queuedPlay = false;

    const n = this.players.length;
    for (const p of this.players) p.hand = [];
    this.vira = null;
    this.manilhaRank = null;

    this.leaderSeat = (this.dealerSeat + 1) % n;
    this.turnSeat = this.leaderSeat;

    // Mão de 11 (só 2v2):
    // - SÓ UMA dupla com 11: ela tem PEEK_MS pra ver as cartas uma da outra.
    // - AS DUAS com 11 (mão de ferro): votação pra TODOS ANTES de sortear as
    //   cartas ("às cegas" ou "normal"). Maioria decide; empate = normal.
    //   As cartas só são sorteadas/distribuídas quando a votação termina.
    this.clearPeek();
    if (this.mode === '2v2' && n === 4) {
      const t11 = [0, 1].filter(t => this.score[t] === 11);
      if (t11.length === 2 && this.startVote()) return; // cartas vêm depois do voto
      this.dealCards();
      if (t11.length === 1) this.startPeek(t11[0]);
      return;
    }
    this.dealCards();
  }

  // Embaralha e distribui 3 cartas pra cada um + a vira.
  dealCards() {
    this.deck = shuffle(buildDeck());
    for (let i = 0; i < 3; i++) {
      for (const p of this.players) p.hand.push(this.deck.pop());
    }
    this.vira = this.deck.pop();
    this.manilhaRank = manilhaRankFromVira(this.vira.rank);
  }

  startVote() {
    const humans = this.players.filter(p => !p.isBot && p.connected);
    if (!humans.length) return false; // ninguém pra votar: segue o normal
    this.voteOn = true;
    this.voteUntil = Date.now() + VOTE_MS;
    this._votes = {};
    this.nextPlayAt = this.voteUntil;
    const code = this.code;
    this._voteTimer = setTimeout(() => {
      this._voteTimer = null;
      if (rooms.get(code) !== this) return;
      this.resolveVote(true);
    }, VOTE_MS);
    return true;
  }

  // Quem votou em quê (público: todo mundo vê durante a votação).
  voteTally() {
    return this.players.filter(p => !p.isBot).map(p => ({
      seat: p.seat, name: p.name, team: p.team,
      choice: this._votes[p.seat] || null
    }));
  }

  // Maioria dos votos decide (bots não votam; quem não votou não conta).
  // Empate (ou ninguém votou) = normal. Só DEPOIS do resultado as cartas são
  // sorteadas — por isso ninguém vê nada antes de votar.
  resolveVote(doBroadcast) {
    if (!this.voteOn) return;
    if (this._voteTimer) { clearTimeout(this._voteTimer); this._voteTimer = null; }
    const tally = this.voteTally();
    const cegas = tally.filter(v => v.choice === 'cegas').length;
    const normal = tally.filter(v => v.choice === 'normal').length;
    const blind = cegas > normal;
    this.voteOn = false; this.voteUntil = 0; this._votes = {};
    this.blind = blind;
    this.dealCards();
    this.nextPlayAt = 0;
    if (doBroadcast) {
      io.to(this.code).emit('mao11_result', { blind, cegas, normal, votes: tally });
      this.broadcastState(io);
    }
  }

  startPeek(team) {
    this.peekTeam = team;
    this.peekUntil = Date.now() + PEEK_MS;
    this.nextPlayAt = this.peekUntil;
    const code = this.code;
    this._peekTimer = setTimeout(() => {
      this._peekTimer = null;
      if (rooms.get(code) !== this) return;
      this.peekTeam = null;
      this.broadcastState(io); // manda o estado sem peek/peekHand e acorda o bot, se for a vez dele
    }, PEEK_MS);
  }

  // qualquer fase da mão de 11 que trava as jogadas (votação ou peek)
  holdActive() {
    return this.voteOn || this.peekActive();
  }

  peekActive() {
    return this.peekTeam !== null && Date.now() < this.peekUntil;
  }

  clearPeek() {
    if (this._peekTimer) { clearTimeout(this._peekTimer); this._peekTimer = null; }
    this.peekTeam = null;
    this.peekUntil = 0;
    if (this._voteTimer) { clearTimeout(this._voteTimer); this._voteTimer = null; }
    this.voteOn = false; this.voteUntil = 0; this._votes = {};
    this.blind = false;
  }

  advanceDealer() {
    this.dealerSeat = (this.dealerSeat + 1) % this.players.length;
  }

  currentTrickIndex() {
    return this.tricks.length;
  }

  // Joga uma carta do jogador `seat`
  playCard(seat, cardId, hidden) {
    const player = this.playerBySeat(seat);
    const idx = player.hand.findIndex(c => c.id === cardId);
    if (idx === -1) return { error: 'Carta não encontrada na mão.' };
    const [card] = player.hand.splice(idx, 1);
    this.table.push({ seat, card, hidden: !!hidden });
    if (hidden) this.hiddenCardBySeat[seat] = true;

    const n = this.players.length;
    const playedThisTrick = this.table.length - this.trickStartIndex();
    if (playedThisTrick >= n) {
      return this.resolveTrick();
    }
    this.turnSeat = (seat + 1) % n;
    return { ok: true };
  }

  trickStartIndex() {
    // índice em this.table onde começou a vaza atual
    return this.tricks.length * this.players.length;
  }

  resolveTrick() {
    const n = this.players.length;
    const startIdx = this.trickStartIndex();
    const plays = this.table.slice(startIdx, startIdx + n);

    const outcome = evaluateEntries(
      plays.map(p => ({ seat: p.seat, strength: cardStrength(p.card, this.manilhaRank) })),
      (seat) => this.seatTeam(seat)
    );
    const tie = outcome.tie;
    const winnerTeam = outcome.winnerTeam;
    const winnerSeat = outcome.winnerSeat;
    this.tricks.push({ winnerTeam, winnerSeat, tie, plays });

    // checa se time já fechou a mão (2 vazas ganhas)
    const wins = [0, 0];
    for (const t of this.tricks) {
      if (!t.tie && t.winnerTeam !== null) wins[t.winnerTeam]++;
    }

    // MELOU: se a vaza empatou e ninguém ganhou vaza ainda, cada jogador
    // mostra a MAIOR carta que ainda tem na mão — quem tiver a maior leva a mão.
    // Se o showdown também empatar (ou não sobrar carta), segue a regra normal.
    if (tie && wins[0] === 0 && wins[1] === 0 && this.players.every(p => p.hand.length > 0)) {
      const picks = this.players.map(p => {
        let bestCard = null;
        let bestS = -1;
        for (const c of p.hand) {
          const st = cardStrength(c, this.manilhaRank);
          if (st > bestS) { bestS = st; bestCard = c; }
        }
        return { seat: p.seat, card: bestCard, strength: bestS };
      });
      const showdown = evaluateEntries(picks, (seat) => this.seatTeam(seat));
      if (!showdown.tie) {
        this.busy = true;
        this.turnSeat = -1;
        return {
          ok: true,
          trickResult: this.tricks[this.tricks.length - 1],
          maoOver: true,
          maoWinnerTeam: showdown.winnerTeam,
          showdown: { picks, winnerSeat: showdown.winnerSeat, winnerTeam: showdown.winnerTeam }
        };
      }
    }

    let maoWinnerTeam = null;
    const t1 = this.tricks[0], t2 = this.tricks[1];
    if (this.tricks.length === 2 && t2.tie && !t1.tie) {
      // 1a vaza ganha e a 2a melou (empatou): quem ganhou a 1a leva a mão na hora
      maoWinnerTeam = t1.winnerTeam;
    } else if (this.tricks.length === 2 && t1.tie && !t2.tie) {
      // 1a melou e a 2a teve vencedor: quem ganhou a 2a leva a mão na hora
      maoWinnerTeam = t2.winnerTeam;
    } else if (wins[0] >= 2) maoWinnerTeam = 0;
    else if (wins[1] >= 2) maoWinnerTeam = 1;
    else if (this.tricks.length >= 3) {
      // 3 vazas jogadas, decide por regra de empates
      if (this.tricks[0].tie) {
        // se a 1a empatou, quem ganha a 2a leva a mão; se a 2a também empatar, decide a 3a
        if (!this.tricks[1].tie) maoWinnerTeam = this.tricks[1].winnerTeam;
        else if (!this.tricks[2].tie) maoWinnerTeam = this.tricks[2].winnerTeam;
        else maoWinnerTeam = this.seatTeam(this.leaderSeat); // tudo empatou: mão do líder leva
      } else if (wins[0] === wins[1]) {
        // empate de vazas ganhas: quem ganhou a primeira vaza leva
        maoWinnerTeam = this.tricks[0].winnerTeam;
      } else {
        maoWinnerTeam = wins[0] > wins[1] ? 0 : 1;
      }
    }

    if (maoWinnerTeam !== null) {
      return { ok: true, trickResult: this.tricks[this.tricks.length - 1], maoOver: true, maoWinnerTeam };
    }

    // próxima vaza: lidera quem ganhou (ou o mesmo líder se empatou)
    this.leaderSeat = tie ? this.leaderSeat : winnerSeat;
    this.turnSeat = this.leaderSeat;
    return { ok: true, trickResult: this.tricks[this.tricks.length - 1], maoOver: false };
  }

  finishMao(winnerTeam, points) {
    this.handOver = true;
    this.score[winnerTeam] += points;
    this.advanceDealer();
    const isGameOver = this.score[0] >= 12 || this.score[1] >= 12;
    if (isGameOver) this.gameOver = true;
    return isGameOver;
  }

  // --- Truco / aumento de aposta ---
  requestCall(seat, level) {
    const team = this.seatTeam(seat);
    if (this.pendingCall) return { error: 'Já existe um pedido pendente.' };
    if (this.lastRaiserTeam === team) return { error: 'Aguarde a resposta do adversário.' };

    const currentStakeIdx = STAKE_SEQUENCE.indexOf(this.stake);
    const expectedNext = STAKE_SEQUENCE[currentStakeIdx + 1];
    const levelValue = { truco: 3, seis: 6, nove: 9, doze: 12 }[level];
    if (levelValue !== expectedNext) return { error: 'Chamada inválida neste momento.' };

    const respondingTeam = team === 0 ? 1 : 0;
    // Quem responde é só o adversário à direita de quem pediu (na tela: o boneco da direita).
    // Se quiser inverter o lado, troque n - 1 por 1.
    const n = this.players.length;
    const respondingSeat = (seat + n - 1) % n;
    this.pendingCall = { level, value: levelValue, callingTeam: team, respondingTeam, callingSeat: seat, respondingSeat, previousStake: this.stake };
    return { ok: true };
  }

  respondCall(seat, action) {
    if (!this.pendingCall) return { error: 'Não há pedido pendente.' };
    const team = this.seatTeam(seat);
    if (team !== this.pendingCall.respondingTeam) return { error: 'Você não pode responder a esta chamada.' };
    const rs = this.pendingCall.respondingSeat;
    if (rs !== undefined && rs !== seat) {
      const rp = this.playerBySeat(rs);
      // só libera o parceiro se o jogador pedido não estiver mais na sala
      if (rp && !rp.isBot && rp.connected) return { error: 'Quem responde é o jogador pedido. Use os sinais pro seu parceiro.' };
    }

    if (action === 'aceitar') {
      this.stake = this.pendingCall.value;
      this.lastRaiserTeam = this.pendingCall.callingTeam;
      this.pendingCall = null;
      return { ok: true, accepted: true };
    }
    if (action === 'fugir') {
      const winnerTeam = this.pendingCall.callingTeam;
      const points = this.pendingCall.previousStake;
      this.pendingCall = null;
      return { ok: true, ran: true, winnerTeam, points };
    }
    if (action === 'aumentar') {
      // Aceita a resposta como um novo aumento imediato (vira o "calling team")
      const currentStakeIdx = STAKE_SEQUENCE.indexOf(this.pendingCall.value);
      const nextValue = STAKE_SEQUENCE[currentStakeIdx + 1];
      if (!nextValue) return { error: 'Não é possível aumentar além de doze.' };
      const newCallingTeam = team;
      const newRespondingTeam = this.pendingCall.callingTeam;
      const nextLevel = NEXT_CALL_NAME[this.pendingCall.value];
      const nPl = this.players.length;
      this.pendingCall = {
        level: nextLevel, value: nextValue, callingTeam: newCallingTeam,
        respondingTeam: newRespondingTeam, callingSeat: seat, respondingSeat: (seat + nPl - 1) % nPl,
        previousStake: this.pendingCall.value
      };
      return { ok: true, reraised: true };
    }
    return { error: 'Ação inválida.' };
  }

  // Um jogador foge da mão sem pedido pendente (correr direto)
  runAway(seat) {
    const team = this.seatTeam(seat);
    const winnerTeam = team === 0 ? 1 : 0;
    return { winnerTeam, points: this.stake };
  }

  redactedStateFor(viewerSeat) {
    const n = this.players.length;
    const peeking = this.peekActive();
    const viewerTeam = this.seatTeam(viewerSeat);
    const canPeek = peeking && viewerTeam === this.peekTeam; // só a dupla de 11 recebe as cartas
    return {
      // todo mundo sabe que a janela está aberta (pra travar a jogada), mas só a dupla vê as cartas
      peek: peeking ? { msLeft: Math.max(0, this.peekUntil - Date.now()), team: this.peekTeam } : undefined,
      // votação da mão de ferro: todos veem quem votou em quê (votes) e o meu voto (myVote)
      vote: this.voteOn ? {
        msLeft: Math.max(0, this.voteUntil - Date.now()),
        myVote: this._votes[viewerSeat] || null,
        votes: this.voteTally()
      } : undefined,
      blind: this.blind,
      code: this.code,
      mode: this.mode,
      maoNumber: this.maoNumber,
      vira: this.vira,
      manilhaRank: this.manilhaRank,
      dealerSeat: this.dealerSeat,
      turnSeat: this.turnSeat,
      leaderSeat: this.leaderSeat,
      score: this.score,
      stake: this.stake,
      stakeLabel: STAKE_LABEL[this.stake],
      pendingCall: this.pendingCall,
      gameOver: this.gameOver,
      players: this.players.map(p => ({
        seat: p.seat,
        name: p.name,
        team: p.team,
        connected: p.connected,
        isBot: !!p.isBot,
        character: shownCharacter(p),
        nameFx: fxOf(p),
        theme: p.theme || null,
        stats: p.stats || null,
        cardsLeft: p.hand.length,
        // às cegas: o dono recebe só os ids (sem naipe/valor), então nem pelo console dá pra ver
        hand: p.seat === viewerSeat
          ? (this.blind ? p.hand.map(c => ({ id: c.id, blind: true })) : p.hand)
          : undefined,
        peekHand: (canPeek && p.seat !== viewerSeat && p.team === this.peekTeam) ? p.hand : undefined
      })),
      table: this.table.map(play => {
        if (play.hidden && play.seat !== viewerSeat && !play.revealed) {
          return { seat: play.seat, hidden: true };
        }
        return { seat: play.seat, card: play.card, hidden: !!play.hidden };
      }),
      tricksPlayed: this.tricks.length
    };
  }

  broadcastState(io) {
    for (const p of this.players) {
      if (p.isBot) continue;
      io.to(p.id).emit('state_update', this.redactedStateFor(p.seat));
    }
    botKick(this); // se agora é a vez (ou a resposta) de um bot, ele age
  }
}


// ---------------------------------------------------------------------------
// BOTS (ver bot.js)
// - Host pode adicionar/remover bots na sala de espera (1v1 e 2v2).
// - No 2v2, se alguém sair no meio da partida, um bot assume o lugar (e o
//   jogador retoma o lugar se voltar com o token, ex.: queda de conexão).
// ---------------------------------------------------------------------------
const brain = createBot({ Room, cardStrength, buildDeck, STAKE_SEQUENCE });

// Quais modos trocam quem sai por um bot no meio da partida.
const BOT_REPLACES = { '2v2': true, '1v1': false };
const BOT_GRACE_MS = 10000; // quem cai fica "reconectando" por 10s; depois o bot assume (2v2)

const BOT_NAMES = ['Bot Tião', 'Bot Zezé', 'Bot Chico', 'Bot Neide', 'Bot Baiano', 'Bot Dona Maria', 'Bot Zeca', 'Bot Lurdes'];
const BOT_AVATAR_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 500">' +
  '<g stroke="#0a0a0a" stroke-width="12" stroke-linecap="round" stroke-linejoin="round">' +
  '<path d="M250 108 L250 58" fill="none"/><circle cx="250" cy="42" r="18" fill="#ff2e63"/>' +
  '<path d="M112 112 L388 108 C404 108 414 120 414 136 L412 268 C412 284 402 296 386 296 L114 300 C98 300 88 288 88 272 L90 136 C90 120 98 112 112 112 Z" fill="#8fd3ff"/>' +
  '<path d="M88 176 L56 178 L58 238 L90 236 Z" fill="#8fd3ff"/><path d="M412 176 L444 178 L442 238 L410 236 Z" fill="#8fd3ff"/>' +
  '<circle cx="186" cy="192" r="36" fill="#fff8f0"/><circle cx="314" cy="192" r="36" fill="#fff8f0"/>' +
  '<circle cx="190" cy="196" r="13" fill="#0a0a0a"/><circle cx="310" cy="196" r="13" fill="#0a0a0a"/>' +
  '<path d="M182 258 L318 256" fill="none"/>' +
  '<path d="M186 300 L184 328 M314 300 L316 328" fill="none"/>' +
  '<path d="M150 328 L352 324 C368 324 378 336 378 352 L376 440 C376 456 366 466 350 466 L152 470 C136 470 124 458 124 442 L126 344 C126 336 136 328 150 328 Z" fill="#8fd3ff"/>' +
  '<circle cx="250" cy="396" r="22" fill="#ff2e63"/></g></svg>';
const BOT_AVATAR = 'data:image/svg+xml;base64,' + Buffer.from(BOT_AVATAR_SVG).toString('base64');

function pickBotName(r) {
  const used = new Set(r.players.map(p => p.name));
  const free = BOT_NAMES.filter(n => !used.has(n));
  const list = free.length ? free : BOT_NAMES;
  return list[Math.floor(Math.random() * list.length)];
}

function humansConnected(r) {
  return r.players.some(p => !p.isBot && p.connected);
}

// Quem precisa agir agora entre os bots (ou null).
function botPendingActor(r) {
  if (!r.started || r.gameOver || r.handOver || r.busy || r.holdActive() || !humansConnected(r)) return null;
  const pc = r.pendingCall;
  if (pc) {
    const rp = pc.respondingSeat !== undefined ? r.playerBySeat(pc.respondingSeat) : null;
    if (rp) return rp.isBot ? rp : null; // o jogador pedido responde (humano ou bot)
    const resp = r.players.filter(p => p.team === pc.respondingTeam);
    if (resp.some(p => !p.isBot && p.connected)) return null;
    return resp.find(p => p.isBot) || null;
  }
  const cur = r.playerBySeat(r.turnSeat);
  return cur && cur.isBot && cur.hand.length > 0 ? cur : null;
}

// Assinatura do estado: serve pra saber se a ação do bot realmente mudou algo.
function botSig(r) {
  const pc = r.pendingCall;
  return [r.turnSeat, r.table.length, r.tricks.length, r.stake, r.maoNumber, r.handOver ? 1 : 0,
    pc ? pc.value + ':' + pc.callingTeam : '-', r.players.map(p => p.hand.length).join('')].join('|');
}

function botKick(r) {
  if (!r || r._botTimer || !botPendingActor(r)) return;
  if (r._botFails >= 4 && botSig(r) === r._botSig) return; // travado: espera o estado mudar
  let delay = 1000 + Math.random() * 1200;                  // "pensando"
  if (r.pendingCall) delay = 1200 + Math.random() * 1600;
  else {
    if (r.table.length === 0) delay += 900;                 // 1ª carta da mão: dá tempo de ver a distribuição
    delay = Math.max(delay, r.nextPlayAt - Date.now() + 150);
  }
  r._botTimer = setTimeout(() => { r._botTimer = null; botAct(r); }, delay);
}

function botAct(r) {
  if (rooms.get(r.code) !== r) return;
  const bot = botPendingActor(r);
  if (!bot) return;
  const noop = () => {};
  const before = botSig(r);
  try {
    if (r.pendingCall) {
      const action = brain.decideResponse(r, bot.seat);
      doRespondTruco(r, bot, action, noop);
    } else {
      const dec = brain.decideTurn(r, bot.seat);
      if (dec.type === 'call') doCallTruco(r, bot, dec.level, noop);
      else doPlayCard(r, bot, { cardId: dec.cardId, hidden: dec.hidden }, noop);
    }
  } catch (e) {
    console.error('Erro no bot da sala', r.code, e);
  }
  if (botSig(r) === before) {
    // nada mudou (jogada recusada / erro): tenta o caminho simples
    r._botFails++;
    try {
      if (r.pendingCall) doRespondTruco(r, bot, 'aceitar', noop);
      else if (bot.hand.length) doPlayCard(r, bot, { cardId: bot.hand[0].id, hidden: false }, noop);
    } catch (e) { console.error('Erro no bot (fallback)', e); }
  } else {
    r._botFails = 0;
  }
  r._botSig = botSig(r);
  botKick(r);
}

// Bot que assume o lugar de quem saiu no meio da partida.
// Fim de partida: mostra o resultado e devolve TODO MUNDO pra sala de espera
// (mesmo código, mesmas duplas, bots mantidos) pra jogar de novo sem criar sala.
function endGame(r, winnerTeam) {
  io.to(r.code).emit('game_over', { winnerTeam, score: r.score.slice() });
  resetRoomToLobby(r);
}

function resetRoomToLobby(r) {
  if (r._botTimer) { clearTimeout(r._botTimer); r._botTimer = null; }
  if (r.characterPhaseTimer) { clearTimeout(r.characterPhaseTimer); r.characterPhaseTimer = null; }
  r._botFails = 0; r._botSig = '';

  // quem saiu no meio da partida não volta pra sala (nem o bot que ficou no lugar dele)
  r.players = r.players.filter(p => (p.isBot ? !p.replacedHuman : p.connected));
  if (!r.players.some(p => !p.isBot)) { rooms.delete(r.code); return; } // ninguém sobrou

  // o host (assento 0) é sempre o primeiro humano; assentos ficam 0..n-1
  r.players.sort((a, b) => a.seat - b.seat);
  const hi = r.players.findIndex(p => !p.isBot);
  if (hi > 0) r.players.unshift(r.players.splice(hi, 1)[0]);
  r.players.forEach((p, i) => {
    p.seat = i;
    p.hand = [];
    if (r.mode !== '2v2') p.team = i % 2;
  });

  r.started = false; r.gameOver = false;
  r.score = [0, 0]; r.stake = 1; r.lastRaiserTeam = null; r.pendingCall = null;
  r.maoNumber = 0; r.dealerSeat = -1; r.turnSeat = -1; r.leaderSeat = -1;
  r.table = []; r.tricks = []; r.hiddenCardBySeat = {}; r.deck = []; r.vira = null; r.manilhaRank = null;
  r.readySeats = new Set(); r.characterPhaseEndsAt = 0;
  r.busy = false; r.handOver = false; r.nextPlayAt = 0; r.queuedPlay = false;
  r.clearPeek();

  r.players.forEach(p => { if (!p.isBot) io.to(p.id).emit('back_to_room', { seat: p.seat }); });
  io.to(r.code).emit('lobby_update', r.lobbyState());
}

function botTakeover(r, p) {
  if (p.isBot) return;
  p.origName = p.name;
  p.origCharacter = p.character;
  p.replacedHuman = true;
  p.name = pickBotName(r);
  p.character = BOT_AVATAR;
  p.isBot = true;
  p.connected = true;
  io.to(r.code).emit('chat_message', { name: 'Sistema', text: `${p.origName} saiu — ${p.name} assumiu o lugar.`, ts: Date.now() });
  r.broadcastState(io); // atualiza nome/boneco na mesa e já deixa o bot agir se for a vez
}

// Menor assento livre (0..maxPlayers-1) — assentos não podem repetir mesmo
// depois de um bot ser removido da sala de espera.
function freeSeat(r) {
  for (let i = 0; i < r.maxPlayers; i++) if (!r.players.some(p => p.seat === i)) return i;
  return r.players.length;
}

// Dupla do novo jogador: a padrão (seat % 2), mas nunca uma dupla já cheia.
function pickTeam(r, seat) {
  if (r.mode !== '2v2') return seat % 2;
  const counts = r.teamCounts();
  const pref = seat % 2;
  return counts[pref] < 2 ? pref : 1 - pref;
}

// Sai da fase de desenho e distribui a primeira mão.
function beginMatch(r) {
  if (r.characterPhaseTimer) { clearTimeout(r.characterPhaseTimer); r.characterPhaseTimer = null; }
  if (rooms.get(r.code) !== r || r.started) return; // sala removida ou já começou
  try {
    r.characterPhaseEndsAt = 0;
    r.startGame();
    r.players.forEach(p => io.to(p.id).emit('game_start', r.redactedStateFor(p.seat)));
    r.broadcastState(io);
  } catch (e) {
    console.error('Erro ao iniciar a partida da sala', r.code, e);
    r.started = false;
    io.to(r.code).emit('error_message', 'Erro ao iniciar a partida. Tente criar a sala de novo.');
  }
}

// Se todo mundo (conectado) já salvou o personagem, não precisa esperar os 45s.
function checkAllReady(r) {
  if (!r.characterPhaseTimer || r.started) return;
  const connected = r.players.filter(p => p.connected);
  if (connected.length === 0) return;
  if (!connected.every(p => r.readySeats.has(p.seat))) return;
  clearTimeout(r.characterPhaseTimer);
  io.to(r.code).emit('character_all_ready', {});
  // pequena pausa pra todo mundo ver que está tudo pronto
  r.characterPhaseTimer = setTimeout(() => beginMatch(r), 1200);
}

// ---------------------------------------------------------------------------
// Socket.io
// ---------------------------------------------------------------------------

// Intervalo mínimo entre cartas na mesa (ms). Ajuste aqui se ainda achar rápido/lento.
const PLAY_GAP_MS = 1100;   // entre uma carta e a próxima da mesma vaza
const TRICK_GAP_MS = 2400;  // depois que a vaza fecha (dá tempo de ver o resultado)

// Joga uma carta pelo jogador `player` (humano ou bot). `tell(evento, dado)`
// avisa só quem jogou (no bot não faz nada).
function doPlayCard(r, player, payload, tell) {
  let { cardId, hidden } = payload || {};
  if (!r || !r.started || r.gameOver || !player) return;
  if (r.handOver || r.busy || r.holdActive() || r.turnSeat !== player.seat || r.pendingCall) return tell('play_rejected'); // avisa o cliente pra desfazer a jogada instantânea

  // Não pode esconder a carta na primeira rodada (vaza) da mão.
  if (r.tricks.length === 0) hidden = false;

  const result = r.playCard(player.seat, cardId, hidden);
  if (result.error) return tell('error_message', result.error);

  r.nextPlayAt = Date.now() + (result.trickResult ? TRICK_GAP_MS : PLAY_GAP_MS);

  if (result.trickResult) {
    // revela cartas escondidas ao fim da vaza
    const startIdx = r.trickStartIndex() - r.players.length;
    for (const play of r.table) play.revealed = true;
    io.to(r.code).emit('trick_result', {
      winnerSeat: result.trickResult.winnerSeat,
      winnerTeam: result.trickResult.winnerTeam,
      tie: result.trickResult.tie
    });
  }

  // Sempre manda o estado com a carta recém-jogada (e a vaza revelada)
  // ANTES de anunciar o fim da mão — senão a carta que decidiu o ponto
  // nunca chega a aparecer pra ninguém na mesa.
  r.broadcastState(io);

  if (result.showdown) {
    // Melou! Mostra a maior carta de cada um, revela e só então fecha a mão.
    const sd = result.showdown;
    io.to(r.code).emit('melou', {});
    setTimeout(() => {
      if (rooms.get(r.code) !== r) return;
      for (const pick of sd.picks) {
        const p = r.playerBySeat(pick.seat);
        const hi = p.hand.findIndex(c => c.id === pick.card.id);
        if (hi !== -1) p.hand.splice(hi, 1);
        r.table.push({ seat: pick.seat, card: pick.card, hidden: false, revealed: true, showdown: true });
      }
      r.broadcastState(io);
      io.to(r.code).emit('showdown_result', {
        winnerSeat: sd.winnerSeat,
        winnerTeam: sd.winnerTeam,
        plays: sd.picks.map(pk => ({ seat: pk.seat, card: pk.card }))
      });

      setTimeout(() => {
        if (rooms.get(r.code) !== r) return;
        const points = r.stake;
        const isGameOver = r.finishMao(sd.winnerTeam, points);
        io.to(r.code).emit('mao_result', {
          winnerTeam: sd.winnerTeam, points, score: r.score, teamName: r.teamName(sd.winnerTeam), showdown: true
        });
        setTimeout(() => {
          if (rooms.get(r.code) !== r) return;
          if (isGameOver) {
            endGame(r, sd.winnerTeam);
          } else {
            r.startMao();
            r.players.forEach(p => io.to(p.id).emit('game_start', r.redactedStateFor(p.seat)));
            r.broadcastState(io);
          }
        }, 2200);
      }, 2000);
    }, 1800);
    return;
  }

  if (result.maoOver) {
    const winnerTeam = result.maoWinnerTeam;
    const points = r.stake;
    const isGameOver = r.finishMao(winnerTeam, points);
    io.to(r.code).emit('mao_result', {
      winnerTeam, points, score: r.score, teamName: r.teamName(winnerTeam)
    });
    setTimeout(() => {
      if (isGameOver) {
        endGame(r, winnerTeam);
      } else {
        r.startMao();
        r.players.forEach(p => io.to(p.id).emit('game_start', r.redactedStateFor(p.seat)));
        r.broadcastState(io);
      }
    }, 2200);
    return;
  }
}

function doCallTruco(r, player, level, tell) {
  if (!r || !r.started || r.gameOver || r.handOver || r.busy || r.holdActive() || !player) return;
  const result = r.requestCall(player.seat, level);
  if (result.error) return tell('error_message', result.error);
  io.to(r.code).emit('call_announced', {
    byTeam: player.team, byName: player.name, level, value: r.pendingCall.value
  });
  r.broadcastState(io);
}

function doRespondTruco(r, player, action, tell) {
  if (!r || !r.started || r.gameOver || r.handOver || r.busy || r.holdActive() || !player) return;
  const result = r.respondCall(player.seat, action);
  if (result.error) return tell('error_message', result.error);

  if (result.ran) {
    // manda o estado atual (pedido resolvido) antes de anunciar o fim da mão
    r.broadcastState(io);
    const isGameOver = r.finishMao(result.winnerTeam, result.points);
    io.to(r.code).emit('mao_result', {
      winnerTeam: result.winnerTeam, points: result.points, score: r.score,
      teamName: r.teamName(result.winnerTeam), ran: true
    });
    setTimeout(() => {
      if (isGameOver) {
        endGame(r, result.winnerTeam);
      } else {
        r.startMao();
        r.players.forEach(p => io.to(p.id).emit('game_start', r.redactedStateFor(p.seat)));
        r.broadcastState(io);
      }
    }, 2200);
    return;
  }

  io.to(r.code).emit('call_response', { action, byName: player.name });
  r.broadcastState(io);
}

io.on('connection', (socket) => {
  let currentRoomCode = null;
  const tell = (ev, msg) => socket.emit(ev, msg);

  function room() {
    return currentRoomCode ? rooms.get(currentRoomCode) : null;
  }

  socket.on('create_room', ({ name, mode, isPublic, character, theme, stats }, cb) => {
    try {
      mode = mode === '2v2' ? '2v2' : '1v1';
      const code = genRoomCode();
      const r = new Room(code, mode, !!isPublic, name);
      rooms.set(code, r);
      const player = joinRoomInternal(r, socket, name || 'Jogador', character, { theme, stats });
      currentRoomCode = code;
      cb && cb({ ok: true, code, seat: player.seat, token: player.token });
      io.to(code).emit('lobby_update', r.lobbyState());
    } catch (e) {
      cb && cb({ ok: false, error: e.message });
    }
  });

  socket.on('join_room', ({ code, name, character, theme, stats }, cb) => {
    code = (code || '').toUpperCase().trim();
    const r = rooms.get(code);
    if (!r) return cb && cb({ ok: false, error: 'Sala não encontrada.' });
    if (r.players.length >= r.maxPlayers) return cb && cb({ ok: false, error: 'Sala cheia.' });
    if (r.started) return cb && cb({ ok: false, error: 'Partida já começou.' });

    const player = joinRoomInternal(r, socket, name || 'Jogador', character, { theme, stats });
    currentRoomCode = code;
    cb && cb({ ok: true, code, seat: player.seat, token: player.token });
    io.to(code).emit('lobby_update', r.lobbyState());
    // A partida não começa mais sozinha ao encher a mesa — o host (assento 0)
    // aperta "Iniciar partida" quando quiser (ver evento 'start_game').
  });

  socket.on('update_character', (payload, cb) => {
    const reply = (obj) => { if (typeof cb === 'function') cb(obj); };
    const r = room();
    if (!r) return reply({ ok: false, error: 'Você não está em uma sala (a conexão pode ter caído).' });
    const player = r.playerBySocket(socket.id);
    if (!player) return reply({ ok: false, error: 'Jogador não encontrado na sala.' });
    const character = sanitizeCharacter(payload && payload.character);
    if (!character) return reply({ ok: false, error: 'Imagem inválida ou grande demais.' });
    player.character = character;
    io.to(r.code).emit('lobby_update', r.lobbyState());
    // Durante a fase de desenho, salvar = "estou pronto".
    if (r.characterPhaseTimer && !r.started) {
      r.readySeats.add(player.seat);
      io.to(r.code).emit('character_ready_update', { players: r.characterReadyState() });
      checkAllReady(r);
    }
    reply({ ok: true });
  });

  // Reconexão: se a conexão cair (Render free, wifi, celular), o cliente volta
  // com o token que recebeu ao entrar e retoma o lugar na sala.
  socket.on('rejoin_room', ({ code, token } = {}, cb) => {
    const reply = (obj) => { if (typeof cb === 'function') cb(obj); };
    const r = rooms.get(String(code || '').toUpperCase());
    if (!r) return reply({ ok: false, error: 'A sala não existe mais (o servidor pode ter reiniciado).' });
    const p = token ? r.players.find(x => x.token === token) : null;
    if (!p) return reply({ ok: false, error: 'Jogador não encontrado nessa sala.' });
    if (p.isBot && p.replacedHuman) {
      // quem tinha saído voltou: retoma o lugar que o bot estava segurando
      p.isBot = false;
      p.name = p.origName;
      p.character = p.origCharacter;
      delete p.replacedHuman; delete p.origName; delete p.origCharacter;
      io.to(r.code).emit('chat_message', { name: 'Sistema', text: `${p.name} voltou e retomou o lugar.`, ts: Date.now() });
    }
    clearTimeout(p._takeoverTimer); p._takeoverTimer = null;
    p.id = socket.id;
    p.connected = true;
    socket.join(r.code);
    currentRoomCode = r.code;
    sendMusicTo(r, socket);
    reply({ ok: true, code: r.code, seat: p.seat, started: r.started });
    io.to(r.code).emit('lobby_update', r.lobbyState());
    if (r.started) {
      socket.emit('game_start', r.redactedStateFor(p.seat));
      r.broadcastState(io);
    } else if (r.characterPhaseTimer) {
      socket.emit('character_phase_start', {
        durationMs: Math.max(0, r.characterPhaseEndsAt - Date.now()),
        players: r.characterReadyState()
      });
    }
  });

  socket.on('list_public_rooms', (cb) => {
    const list = Array.from(rooms.values())
      .filter(r => r.isPublic && !r.started && r.players.length < r.maxPlayers)
      .map(r => r.publicSummary());
    cb && cb(list);
  });

  socket.on('quick_join', ({ name, mode, character, theme, stats }, cb) => {
    mode = mode === '2v2' ? '2v2' : '1v1';
    let r = Array.from(rooms.values()).find(
      x => x.isPublic && !x.started && x.mode === mode && x.players.length < x.maxPlayers
    );
    if (!r) {
      const code = genRoomCode();
      r = new Room(code, mode, true, name);
      rooms.set(code, r);
    }
    const player = joinRoomInternal(r, socket, name || 'Jogador', character, { theme, stats });
    currentRoomCode = r.code;
    cb && cb({ ok: true, code: r.code, seat: player.seat, token: player.token });
    io.to(r.code).emit('lobby_update', r.lobbyState());
    // Idem: sem auto-start, o host clica em "Iniciar partida".
  });

  socket.on('start_game', (cb) => {
    const r = room();
    if (!r) return cb && cb({ ok: false, error: 'Sala não encontrada.' });
    const player = r.playerBySocket(socket.id);
    if (!player) return cb && cb({ ok: false, error: 'Você não está nesta sala.' });
    if (player.seat !== 0) return cb && cb({ ok: false, error: 'Só o host pode iniciar a partida.' });
    if (r.started) return cb && cb({ ok: false, error: 'A partida já começou.' });
    if (r.characterPhaseTimer) return cb && cb({ ok: false, error: 'A partida já está começando.' });
    if (r.players.length < r.maxPlayers) return cb && cb({ ok: false, error: 'Aguardando mais jogadores entrarem.' });
    if (!r.teamsReady()) return cb && cb({ ok: false, error: 'Ajuste as duplas (2 jogadores em cada) antes de iniciar.' });

    // Antes de começar a valer, todo mundo tem alguns segundos pra desenhar
    // (ou ajustar) o personagem. Só depois desse tempo a mão é distribuída.
    const CHARACTER_PHASE_MS = 45000;
    r.readySeats = new Set(r.players.filter(p => p.isBot).map(p => p.seat)); // bots já estão prontos
    r.characterPhaseEndsAt = Date.now() + CHARACTER_PHASE_MS;
    io.to(r.code).emit('character_phase_start', { durationMs: CHARACTER_PHASE_MS, players: r.characterReadyState() });
    r.characterPhaseTimer = setTimeout(() => beginMatch(r), CHARACTER_PHASE_MS);

    cb && cb({ ok: true });
  });

  // Host escolhe as duplas no 2v2, antes de iniciar a partida: arrasta/toca
  // pra mover um jogador entre "Dupla 1" e "Dupla 2".
  socket.on('set_player_team', ({ seat, team }, cb) => {
    const r = room();
    if (!r) return cb && cb({ ok: false, error: 'Sala não encontrada.' });
    const host = r.playerBySocket(socket.id);
    if (!host || host.seat !== 0) return cb && cb({ ok: false, error: 'Só o host pode escolher as duplas.' });
    if (r.started) return cb && cb({ ok: false, error: 'A partida já começou.' });
    if (r.mode !== '2v2') return cb && cb({ ok: false, error: 'Só é possível escolher duplas no modo 2v2.' });
    if (team !== 0 && team !== 1) return cb && cb({ ok: false, error: 'Dupla inválida.' });
    const target = r.playerBySeat(seat);
    if (!target) return cb && cb({ ok: false, error: 'Jogador não encontrado.' });

    if (target.team !== team && r.teamCounts()[team] >= 2) return cb && cb({ ok: false, error: 'Essa dupla já está cheia.' });

    target.team = team;
    io.to(r.code).emit('lobby_update', r.lobbyState());
    cb && cb({ ok: true });
  });

  // Substituição: dois jogadores trocam de dupla ao mesmo tempo (host, 2v2).
  socket.on('swap_player_teams', ({ seatA, seatB } = {}, cb) => {
    const reply = (o) => { if (typeof cb === 'function') cb(o); };
    const r = room();
    if (!r) return reply({ ok: false, error: 'Sala não encontrada.' });
    const host = r.playerBySocket(socket.id);
    if (!host || host.seat !== 0) return reply({ ok: false, error: 'Só o host pode escolher as duplas.' });
    if (r.started || r.characterPhaseTimer) return reply({ ok: false, error: 'A partida já começou.' });
    if (r.mode !== '2v2') return reply({ ok: false, error: 'Só é possível escolher duplas no modo 2v2.' });
    const a = r.playerBySeat(seatA), b = r.playerBySeat(seatB);
    if (!a || !b || a === b) return reply({ ok: false, error: 'Jogador não encontrado.' });
    if (a.team !== b.team) {
      const t = a.team; a.team = b.team; b.team = t;
      io.to(r.code).emit('lobby_update', r.lobbyState());
    }
    reply({ ok: true });
  });

  // Host adiciona um bot na sala de espera (1v1 ou 2v2). No 2v2 pode escolher a dupla.
  socket.on('add_bot', (payload, cb) => {
    const reply = (o) => { if (typeof cb === 'function') cb(o); };
    const r = room();
    if (!r) return reply({ ok: false, error: 'Sala não encontrada.' });
    const host = r.playerBySocket(socket.id);
    if (!host || host.seat !== 0) return reply({ ok: false, error: 'Só o host pode adicionar bots.' });
    if (r.started || r.characterPhaseTimer) return reply({ ok: false, error: 'A partida já começou.' });
    if (r.players.length >= r.maxPlayers) return reply({ ok: false, error: 'A sala já está cheia.' });

    const seat = freeSeat(r);
    let team = seat % 2;
    if (r.mode === '2v2') {
      const counts = r.teamCounts();
      const want = payload && (payload.team === 0 || payload.team === 1) ? payload.team : null;
      if (want !== null) {
        if (counts[want] >= 2) return reply({ ok: false, error: 'Essa dupla já está cheia.' });
        team = want;
      } else {
        team = counts[1] <= counts[0] ? 1 : 0; // por padrão entra na dupla com menos gente (adversária primeiro)
        if (counts[team] >= 2) team = 1 - team;
      }
    }
    const token = crypto.randomBytes(12).toString('hex');
    r.players.push({
      id: 'bot:' + token, token, name: pickBotName(r), seat, team,
      connected: true, hand: [], character: BOT_AVATAR, isBot: true
    });
    io.to(r.code).emit('lobby_update', r.lobbyState());
    reply({ ok: true });
  });

  socket.on('remove_bot', ({ seat } = {}, cb) => {
    const reply = (o) => { if (typeof cb === 'function') cb(o); };
    const r = room();
    if (!r) return reply({ ok: false, error: 'Sala não encontrada.' });
    const host = r.playerBySocket(socket.id);
    if (!host || host.seat !== 0) return reply({ ok: false, error: 'Só o host pode remover bots.' });
    if (r.started || r.characterPhaseTimer) return reply({ ok: false, error: 'A partida já começou.' });
    const bot = r.playerBySeat(seat);
    if (!bot || !bot.isBot) return reply({ ok: false, error: 'Bot não encontrado.' });
    r.players = r.players.filter(p => p !== bot);
    io.to(r.code).emit('lobby_update', r.lobbyState());
    reply({ ok: true });
  });

  function joinRoomInternal(r, socket, name, character, extra) {
    extra = extra || {};
    const seat = freeSeat(r);
    const team = pickTeam(r, seat);
    const player = { id: socket.id, token: crypto.randomBytes(12).toString('hex'), name, seat, team, connected: true, hand: [], character: sanitizeCharacter(character), theme: sanitizeTheme(extra.theme), stats: sanitizeStats(extra.stats) };
    if (adminPhoto) player.adminPhoto = adminPhoto; // admin que já definiu a foto antes de entrar na sala
    if (adminNameFx) player.nameFx = adminNameFx;   // ...e o efeito do nome
    r.players.push(player);
    socket.join(r.code);
    sendMusicTo(r, socket);
    return player;
  }

  socket.on('play_card', (payload) => {
    const r = room();
    if (!r || !r.started || r.gameOver) return;
    const wait = r.nextPlayAt - Date.now();
    if (wait > 0) {
      // Jogada adiantada: em vez de descartar, segura até o intervalo acabar.
      if (r.queuedPlay) return socket.emit('play_rejected');
      r.queuedPlay = true;
      setTimeout(() => {
        r.queuedPlay = false;
        if (rooms.get(r.code) !== r) return;
        doPlayCard(r, r.playerBySocket(socket.id), payload || {}, tell);
      }, wait);
      return;
    }
    doPlayCard(r, r.playerBySocket(socket.id), payload || {}, tell);
  });

  socket.on('call_truco', ({ level } = {}) => {
    const r = room();
    if (!r) return;
    doCallTruco(r, r.playerBySocket(socket.id), level, tell);
  });

  socket.on('respond_truco', ({ action } = {}) => {
    const r = room();
    if (!r) return;
    doRespondTruco(r, r.playerBySocket(socket.id), action, tell);
  });

  // ---- Terminal do admin (comando `auth`): placar e foto ---------------
  // Só funciona se a variável de ambiente TRUTEC_ADMIN_KEY estiver definida
  // no servidor (Render > Environment). O login adm/123 do terminal.js roda
  // no navegador e é público, então NÃO protege nada: a chave de verdade é
  // conferida aqui. Sem a variável, o comando fica desligado pra todo mundo.
  let adminFails = 0, adminLockUntil = 0;
  function adminKeyOk(key) {
    const real = process.env.TRUTEC_ADMIN_KEY;
    if (!real || typeof key !== 'string') return false;
    const a = crypto.createHash('sha256').update(key).digest();
    const b = crypto.createHash('sha256').update(real).digest();
    return crypto.timingSafeEqual(a, b);
  }
  let adminPhoto = null; // foto definida por `auth foto` (vale pra este socket e vai pro jogador)
  let adminNameFx = null; // efeito do nome definido por `auth nome`

  function pushPhoto() {
    const r = room();
    const me = r && r.playerBySocket(socket.id);
    if (!r || !me) return;
    if (adminPhoto) me.adminPhoto = adminPhoto; else delete me.adminPhoto;
    if (adminNameFx) me.nameFx = adminNameFx; else delete me.nameFx;
    io.to(r.code).emit('lobby_update', r.lobbyState());
    if (r.characterPhaseTimer && !r.started) io.to(r.code).emit('character_ready_update', { players: r.characterReadyState() });
    if (r.started) r.broadcastState(io);
  }

  // `auth` do terminal: login + placar + foto, tudo por aqui.
  // ops: login | show | set | add | reset | photo | photo_off | name_fx
  socket.on('admin', (p, cb) => {
    const reply = (o) => { if (typeof cb === 'function') cb(o); };
    p = p || {};
    if (!process.env.TRUTEC_ADMIN_KEY) return reply({ ok: false, error: 'Comando desligado no servidor (defina TRUTEC_ADMIN_KEY).' });
    if (Date.now() < adminLockUntil) return reply({ ok: false, error: 'Muitas tentativas. Espere um minuto.' });
    if (!adminKeyOk(p.key)) {
      if (++adminFails >= 5) { adminFails = 0; adminLockUntil = Date.now() + 60000; }
      return reply({ ok: false, error: 'Chave incorreta.' });
    }
    adminFails = 0;
    if (p.op === 'login') return reply({ ok: true });
    if (p.op === 'photo') {
      const photo = sanitizePhoto(p.photo);
      if (!photo) return reply({ ok: false, error: 'Foto inválida ou grande demais.' });
      adminPhoto = photo; pushPhoto();
      return reply({ ok: true, inRoom: !!room() });
    }
    if (p.op === 'photo_off') { adminPhoto = null; pushPhoto(); return reply({ ok: true }); }
    if (p.op === 'set_theme') {
      // `theme <id> @nome`: troca o tema de um jogador da mesma sala
      const r1 = room();
      if (!r1) return reply({ ok: false, error: 'Entre numa sala primeiro (só dá pra trocar o tema de quem está nela).' });
      const themeId = sanitizeTheme(p.theme);
      if (!themeId) return reply({ ok: false, error: 'Tema inválido.' });
      const norm = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
      const want = norm(String(p.target || '').replace(/^@/, ''));
      if (!want) return reply({ ok: false, error: 'Diga o jogador: theme <id> @nome' });
      const humans = r1.players.filter(x => !x.isBot && x.connected);
      let hits = humans.filter(x => norm(x.name) === want);
      if (!hits.length) hits = humans.filter(x => norm(x.name).startsWith(want)); // começo do nome também serve
      if (!hits.length) return reply({ ok: false, error: 'Não achei "' + String(p.target).slice(0, 24) + '" nesta sala. Jogadores: ' + (humans.map(x => x.name).join(', ') || '—') });
      if (hits.length > 1) return reply({ ok: false, error: 'Mais de um jogador combina: ' + hits.map(x => x.name).join(', ') + '. Digite o nome inteiro.' });
      const tgt = hits[0];
      tgt.theme = themeId;
      io.to(tgt.id).emit('force_theme', { id: themeId });
      io.to(r1.code).emit('lobby_update', r1.lobbyState());   // o card de vitórias/derrotas mostra o tema novo
      if (r1.started) r1.broadcastState(io);
      return reply({ ok: true, name: tgt.name });
    }
    if (p.op === 'music') {
      const r0 = room();
      if (!r0) return reply({ ok: false, error: 'Entre numa sala primeiro (a música toca pra quem está nela).' });
      if (p.action === 'stop') {
        r0.music = null;
        io.to(r0.code).emit('room_music', { action: 'stop' });
        return reply({ ok: true });
      }
      let url = sanitizeScUrl(p.url);
      if (!url) return reply({ ok: false, error: 'Link inválido. Use um link do soundcloud.com.' });
      resolveScShortUrl(url).then((real) => {
        if (!real) return reply({ ok: false, error: 'Não consegui abrir esse link curto do SoundCloud.' });
        if (rooms.get(r0.code) !== r0) return reply({ ok: false, error: 'A sala não existe mais.' });
        const me0 = r0.playerBySocket(socket.id);
        r0.music = { url: real, startedAt: Date.now(), by: me0 ? me0.name : '' };
        io.to(r0.code).emit('room_music', { action: 'play', url: real, offsetMs: 0, by: r0.music.by });
        reply({ ok: true });
      });
      return;
    }
    if (p.op === 'name_fx') {
      const fx = p.fx === null || p.fx === '' ? null : String(p.fx);
      if (fx !== null && !NAME_FX.has(fx)) return reply({ ok: false, error: 'Efeito inexistente.' });
      adminNameFx = fx; pushPhoto();
      return reply({ ok: true, inRoom: !!room() });
    }

    const r = room();
    if (!r || !r.started || r.gameOver) return reply({ ok: false, error: 'Você precisa estar numa partida em andamento.' });
    if (p.op === 'show') return reply({ ok: true, score: r.score.slice() });

    const num = (v) => { v = parseInt(v, 10); return isFinite(v) ? v : null; };
    const clamp = (v) => Math.max(0, Math.min(12, v));
    const next = r.score.slice();
    if (p.op === 'set') {
      const a = num(p.a), b = num(p.b);
      if (a === null || b === null) return reply({ ok: false, error: 'Valores inválidos.' });
      next[0] = clamp(a); next[1] = clamp(b);
    } else if (p.op === 'add') {
      const t = num(p.team), n = num(p.n);
      if ((t !== 0 && t !== 1) || n === null) return reply({ ok: false, error: 'Valores inválidos.' });
      next[t] = clamp(next[t] + n);
    } else if (p.op === 'reset') {
      next[0] = 0; next[1] = 0;
    } else {
      return reply({ ok: false, error: 'Operação inválida.' });
    }
    r.score = next;
    io.to(r.code).emit('score_changed', { score: next.slice() });
    const winner = next[0] >= 12 ? 0 : next[1] >= 12 ? 1 : null;
    if (winner !== null) {
      r.gameOver = true;
      endGame(r, winner);
    } else if (p.op !== 'show' && (next[0] === 11 || next[1] === 11)) {
      // alguém ficou com 11: redistribui a mão pra valerem as regras da mão de 11
      // (peek / votação). Sem isso a mão que já está na mesa seguiria como estava.
      r.startMao();
      r.players.forEach(pl => io.to(pl.id).emit('game_start', r.redactedStateFor(pl.seat)));
      r.broadcastState(io);
    } else {
      r.broadcastState(io);
    }
    reply({ ok: true, score: next.slice() });
  });

  // Mão de ferro (11 x 11): voto de TODOS ("cegas" ou "normal"). Maioria decide;
  // resolve quando todos os humanos votaram ou quando o tempo acaba.
  socket.on('mao11_vote', ({ choice } = {}) => {
    const r = room();
    if (!r || !r.started || r.gameOver || !r.voteOn) return;
    const me = r.playerBySocket(socket.id);
    if (!me || me.isBot) return;
    if (choice !== 'cegas' && choice !== 'normal') return;
    r._votes[me.seat] = choice;
    const humans = r.players.filter(p => !p.isBot && p.connected);
    if (humans.every(p => r._votes[p.seat])) r.resolveVote(true);
    else r.broadcastState(io); // todos veem quem votou em quê; a votação continua
  });

  // Sinal pro parceiro enquanto há um truco pendente contra a dupla.
  // Só os companheiros de dupla recebem (adversários nunca), e bots são ignorados.
  const PARTNER_SIGNALS = { vamos: 'Vamos!', nao: 'Não vamos...', algo: 'Tenho alguma coisa', nada: 'Não tenho nada' };
  socket.on('partner_signal', ({ signal } = {}) => {
    const r = room();
    if (!r || !r.started || r.gameOver || !r.pendingCall) return;
    const me = r.playerBySocket(socket.id);
    if (!me || me.team !== r.pendingCall.respondingTeam || me.seat === r.pendingCall.respondingSeat) return;
    const text = PARTNER_SIGNALS[signal];
    if (!text) return;
    const now = Date.now();
    if (me._lastSignalAt && now - me._lastSignalAt < 400) return; // anti-spam
    me._lastSignalAt = now;
    const target = r.playerBySeat(r.pendingCall.respondingSeat);
    if (target && target !== me && !target.isBot && target.connected) {
      io.to(target.id).emit('partner_signal', { signal, text, name: me.name });
    }
  });

  socket.on('run_away', () => {
    const r = room();
    if (!r || !r.started || r.gameOver || r.handOver) return;
    if (r.busy || r.holdActive()) return;
    const player = r.playerBySocket(socket.id);
    if (!player) return;
    if (r.pendingCall) return socket.emit('error_message', 'Há um pedido pendente — responda com Aceitar ou Fugir.');
    const result = r.runAway(player.seat);
    // manda o estado atualizado (pendingCall resolvido) antes do aviso de fim de mão
    r.broadcastState(io);
    const isGameOver = r.finishMao(result.winnerTeam, result.points);
    io.to(r.code).emit('mao_result', {
      winnerTeam: result.winnerTeam, points: result.points, score: r.score,
      teamName: r.teamName(result.winnerTeam), ran: true
    });
    setTimeout(() => {
      if (isGameOver) {
        endGame(r, result.winnerTeam);
      } else {
        r.startMao();
        r.players.forEach(p => io.to(p.id).emit('game_start', r.redactedStateFor(p.seat)));
        r.broadcastState(io);
      }
    }, 1800);
  });

  socket.on('chat_message', ({ text }) => {
    const r = room();
    if (!r) return;
    const player = r.playerBySocket(socket.id);
    if (!player || !text) return;
    const msg = { name: player.name, nameFx: fxOf(player), seat: player.seat, text: String(text).slice(0, 200), ts: Date.now() };
    io.to(r.code).emit('chat_message', msg);
  });


  socket.on('disconnect', () => {
    const r = room();
    if (!r) return;
    const player = r.playerBySocket(socket.id);
    if (!player) return;
    player.connected = false;
    io.to(r.code).emit('lobby_update', r.lobbyState());
    if (r.characterPhaseTimer) {
      io.to(r.code).emit('character_ready_update', { players: r.characterReadyState() });
      checkAllReady(r);
    }
    io.to(r.code).emit('chat_message', { name: 'Sistema', text: `${player.name} desconectou.`, ts: Date.now() });

    // No meio da partida (2v2), um bot assume o lugar de quem saiu.
    if (r.started && !r.gameOver) {
      r.broadcastState(io); // os outros veem o avatar escurecido com a rodinha
      if (BOT_REPLACES[r.mode]) {
        clearTimeout(player._takeoverTimer);
        player._takeoverTimer = setTimeout(() => {
          player._takeoverTimer = null;
          if (rooms.get(r.code) !== r || !r.started || r.gameOver) return;
          if (player.connected || player.isBot || !r.players.includes(player)) return;
          if (humansConnected(r)) botTakeover(r, player);
        }, BOT_GRACE_MS);
      }
    }

    // limpa salas vazias/abandonadas (bots não contam como "alguém na sala")
    const anyoneConnected = r.players.some(p => !p.isBot && p.connected);
    if (!anyoneConnected) {
      // partida em andamento: dá mais tempo pra todo mundo voltar (queda de internet, aba fechada)
      setTimeout(() => {
        const stillThere = rooms.get(r.code);
        if (stillThere && !stillThere.players.some(p => !p.isBot && p.connected)) {
          if (stillThere.characterPhaseTimer) clearTimeout(stillThere.characterPhaseTimer);
          if (stillThere._botTimer) clearTimeout(stillThere._botTimer);
          rooms.delete(r.code);
        }
      }, r.started ? 180000 : 30000);
    }
  });
});

server.listen(PORT, () => {
  console.log(`Truco Paulista rodando na porta ${PORT}`);
});

// usado só nos testes automáticos
module.exports = { Room, rooms, io, cardStrength, buildDeck, STAKE_SEQUENCE };
