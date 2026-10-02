// ============================================================================
// BOT INTELIGENTE — bot.js
// Usado pelo server.js. O bot só enxerga o que um jogador de verdade enxerga:
// a própria mão, a vira, as cartas já reveladas na mesa e o placar. As cartas
// que ele não vê são "sorteadas" (Monte Carlo): ele imagina várias mãos
// possíveis pros outros, joga o resto da mão de cada uma dessas hipóteses
// usando as regras REAIS do jogo (Room.playCard / resolveTrick, incluindo o
// "melou") e escolhe a jogada que mais vezes leva a mão pro time dele.
//
// Truco / aceitar / aumentar / fugir: comparado por valor esperado, levando
// em conta o placar (perto do 12 o risco e o ganho mudam) e o fato de que
// quem pede truco costuma ter carta boa.
// ============================================================================
'use strict';

module.exports = function createBot(deps) {
  const { Room, cardStrength, buildDeck, STAKE_SEQUENCE } = deps;

  const SAMPLES_PLAY = 140;      // hipóteses por decisão de carta
  const SAMPLES_ESTIMATE = 160;  // hipóteses pra estimar chance de ganhar a mão
  const NEXT_LEVEL = { 1: 'truco', 3: 'seis', 6: 'nove', 9: 'doze' };

  const FULL_DECK = buildDeck();

  // ---------------------------------------------------------------- utilidades
  function shuffleInPlace(a) {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  // "Valor" de uma mão restante: usado só pra dar mais peso às hipóteses em
  // que o adversário que pediu truco tem cartas boas.
  function handValue(hand, manilhaRank) {
    let v = 0;
    for (const c of hand) {
      if (c.rank === manilhaRank) v += 1.2;
      else if (c.rank === '3') v += 0.7;
      else if (c.rank === '2') v += 0.5;
      else if (c.rank === 'A') v += 0.3;
      else if (c.rank === 'K' || c.rank === 'J' || c.rank === 'Q') v += 0.1;
    }
    return v;
  }

  // Aproximação de "chance de ganhar a partida" pelo placar (12 pontos).
  function gameValue(mine, theirs) {
    if (mine >= 12) return 1;
    if (theirs >= 12) return 0;
    const v = 0.5 + 0.045 * (mine - theirs);
    return Math.max(0.02, Math.min(0.98, v));
  }

  // ---------------------------------------------------------------- simulação
  // Política usada pra "jogar" as cartas dentro das simulações (todos os lugares).
  function policyPick(S, seat, explore) {
    const p = S.playerBySeat(seat);
    const hand = p.hand;
    if (hand.length === 1) return hand[0];
    const n = S.players.length;
    const str = (c) => cardStrength(c, S.manilhaRank);
    const sorted = hand.slice().sort((a, b) => str(a) - str(b));
    const trickPlays = S.table.slice(S.tricks.length * n);
    const myTeam = S.seatTeam(seat);

    if (trickPlays.length === 0) {
      // abrindo a vaza
      if (S.tricks.length === 0 && sorted.length >= 3 && Math.random() < (explore ? 0.35 : 0.2)) {
        return sorted[sorted.length - 2]; // às vezes guarda a melhor
      }
      return sorted[sorted.length - 1];
    }

    let best = null;
    for (const pl of trickPlays) {
      const s = str(pl.card);
      if (!best || s > best.s) best = { s, seat: pl.seat };
    }
    const partnerWinning = S.seatTeam(best.seat) === myTeam;
    const remainingAfterMe = n - trickPlays.length - 1;

    if (partnerWinning && (remainingAfterMe === 0 || best.s >= 7)) {
      return sorted[0]; // parceiro já resolve: joga a mais fraca
    }
    // menor carta que vence
    for (const c of sorted) if (str(c) > best.s) return c;
    // sem carta que vença: se dá pra empatar (só vale a pena com mais cartas na mão), empata
    if (S.tricks.length === 0) {
      for (const c of sorted) if (str(c) === best.s) return c;
    }
    return sorted[0];
  }

  // Monta uma sala "de mentirinha" com uma distribuição hipotética das cartas
  // que o bot não vê.
  function buildWorld(room, seat, pool) {
    const n = room.players.length;
    const S = Object.create(Room.prototype);
    S.mode = room.mode;
    S.manilhaRank = room.manilhaRank;
    S.leaderSeat = room.leaderSeat;
    S.turnSeat = room.turnSeat;
    S.tricks = room.tricks.slice();
    S.hiddenCardBySeat = {};
    S.stake = room.stake;

    let cursor = 0;
    S.players = room.players.map(p => {
      if (p.seat === seat) return { seat: p.seat, team: p.team, hand: p.hand.slice() };
      const need = p.hand.length;
      const hand = pool.slice(cursor, cursor + need);
      cursor += need;
      return { seat: p.seat, team: p.team, hand };
    });

    S.table = room.table.map(pl => {
      const unknown = pl.seat !== seat && pl.hidden && !pl.revealed;
      if (!unknown) return { seat: pl.seat, card: pl.card, hidden: !!pl.hidden };
      const card = pool[cursor++];
      return { seat: pl.seat, card, hidden: true };
    });
    return S;
  }

  // Cartas que o bot NÃO conhece (fora a mão dele, a vira e as já reveladas).
  function unseenPool(room, seat) {
    const me = room.playerBySeat(seat);
    const known = new Set(me.hand.map(c => c.id));
    known.add(room.vira.id);
    for (const pl of room.table) {
      if (pl.seat === seat || !pl.hidden || pl.revealed) known.add(pl.card.id);
    }
    for (const t of room.tricks) for (const pl of t.plays) if (!pl.hidden || pl.revealed || pl.seat === seat) known.add(pl.card.id);
    return FULL_DECK.filter(c => !known.has(c.id));
  }

  // Sorteia K hipóteses (com pesos) — cada uma é uma lista embaralhada do pool.
  function makeSamples(room, seat, K, biasOpp) {
    const base = unseenPool(room, seat);
    const oppTeam = room.playerBySeat(seat).team === 0 ? 1 : 0;
    const samples = [];
    for (let i = 0; i < K; i++) {
      const pool = shuffleInPlace(base.slice());
      let w = 1;
      if (biasOpp) {
        // olha as cartas que caíram pros adversários nessa hipótese
        let cursor = 0, val = 0;
        for (const p of room.players) {
          if (p.seat === seat) continue;
          const need = p.hand.length;
          if (p.team === oppTeam) val += handValue(pool.slice(cursor, cursor + need), room.manilhaRank);
          cursor += need;
        }
        w = Math.exp(0.9 * val);
      }
      samples.push({ pool, w });
    }
    return samples;
  }

  // Joga a mão até o fim a partir do estado S. Retorna o time vencedor.
  function finishHand(S, first) {
    let guard = 0;
    let result = first;
    while (!(result && result.maoOver) && guard++ < 40) {
      const cur = S.turnSeat;
      const p = S.playerBySeat(cur);
      if (!p || p.hand.length === 0) break;
      const card = policyPick(S, cur, true);
      result = S.playCard(cur, card.id, false);
      if (result && result.error) break;
    }
    return result && result.maoOver ? result.maoWinnerTeam : null;
  }

  // Chance (0..1) do time do bot vencer a mão, forçando `candidate` como
  // primeira jogada (ou seguindo a política, se candidate for null).
  function winProb(room, seat, candidate, samples) {
    const myTeam = room.playerBySeat(seat).team;
    let num = 0, den = 0;
    for (const s of samples) {
      const S = buildWorld(room, seat, s.pool);
      let first = null;
      if (candidate) {
        first = S.playCard(seat, candidate.id, false);
        if (first && first.error) continue;
      }
      const winner = finishHand(S, first);
      den += s.w;
      if (winner === myTeam) num += s.w;
    }
    return den > 0 ? num / den : 0.5;
  }

  // ---------------------------------------------------------------- decisões
  function teamScores(room, team) {
    return { mine: room.score[team], theirs: room.score[team === 0 ? 1 : 0] };
  }

  function oppRaised(room, team) {
    const opp = team === 0 ? 1 : 0;
    return room.lastRaiserTeam === opp || (room.pendingCall && room.pendingCall.callingTeam === opp);
  }

  // Decide o que o bot do assento `seat` faz na vez dele.
  //   { type: 'call', level }  ou  { type: 'play', cardId, hidden }
  function decideTurn(room, seat) {
    const me = room.playerBySeat(seat);
    const hand = me.hand;
    const team = me.team;
    const samples = makeSamples(room, seat, SAMPLES_PLAY, oppRaised(room, team));

    // avalia cada carta possível
    const cands = hand.map(c => ({ card: c, p: winProb(room, seat, c, samples), s: cardStrength(c, room.manilhaRank) }));
    const bestP = Math.max.apply(null, cands.map(c => c.p));
    // entre as jogadas praticamente empatadas, gasta a carta mais fraca
    const ok = cands.filter(c => c.p >= bestP - 0.015).sort((a, b) => a.s - b.s);
    const pick = ok[0];

    // --- pedir truco? ---
    const idx = STAKE_SEQUENCE.indexOf(room.stake);
    const nextValue = STAKE_SEQUENCE[idx + 1];
    const maoDe11 = room.score[0] === 11 || room.score[1] === 11; // mão de 11: não pode pedir truco
    const canCall = !maoDe11 && !room.pendingCall && nextValue && room.lastRaiserTeam !== team;
    if (canCall) {
      const { mine, theirs } = teamScores(room, team);
      const s = room.stake;
      const p = bestP;
      const fold = Math.max(0.05, Math.min(0.75, 0.2 + 0.6 * (p - 0.4)));  // chance do adversário fugir
      const eNo = p * gameValue(mine + s, theirs) + (1 - p) * gameValue(mine, theirs + s);
      const eAcc = p * gameValue(mine + nextValue, theirs) + (1 - p) * gameValue(mine, theirs + nextValue);
      const eCall = fold * gameValue(mine + s, theirs) + (1 - fold) * eAcc;
      const margin = 0.01 + 0.008 * idx; // mais cauteloso nos níveis altos
      let call = p >= 0.55 && eCall > eNo + margin && Math.random() < 0.88;
      // blefe raro: só no primeiro truco e com a mão já em andamento
      if (!call && s === 1 && room.tricks.length >= 1 && p > 0.25 && p < 0.5 && Math.random() < 0.06) call = true;
      if (call) return { type: 'call', level: NEXT_LEVEL[room.stake] };
    }

    // esconder a carta (só depois da 1ª vaza): quando é uma carta de sacrifício
    let hidden = false;
    if (room.tricks.length > 0 && hand.length > 1) {
      const weakest = Math.min.apply(null, cands.map(c => c.s));
      if (pick.s === weakest && Math.random() < 0.45) hidden = true;
    }
    return { type: 'play', cardId: pick.card.id, hidden };
  }

  // Responde a um pedido de truco/seis/nove/doze feito pelo adversário.
  //   'aceitar' | 'fugir' | 'aumentar'
  function decideResponse(room, seat) {
    const me = room.playerBySeat(seat);
    const team = me.team;
    const pc = room.pendingCall;
    const V = pc.value, P = pc.previousStake;
    const samples = makeSamples(room, seat, SAMPLES_ESTIMATE, true);
    const p = winProb(room, seat, null, samples);
    const { mine, theirs } = teamScores(room, team);

    const eFold = gameValue(mine, theirs + P);
    const eAccept = p * gameValue(mine + V, theirs) + (1 - p) * gameValue(mine, theirs + V);

    // aumentar? (só se ainda há nível acima e a mão é forte)
    const vi = STAKE_SEQUENCE.indexOf(V);
    const up = STAKE_SEQUENCE[vi + 1];
    if (up && p >= 0.68) {
      const accProb = 0.55; // chance de o adversário aceitar o aumento
      const eUpAcc = p * gameValue(mine + up, theirs) + (1 - p) * gameValue(mine, theirs + up);
      const eRaise = (1 - accProb) * gameValue(mine + V, theirs) + accProb * eUpAcc;
      if (eRaise > eAccept + 0.02 && Math.random() < 0.8) return 'aumentar';
    }
    if (eAccept > eFold + 0.005) return 'aceitar';
    return 'fugir';
  }

  return { decideTurn, decideResponse, estimate: winProb, makeSamples };
};
