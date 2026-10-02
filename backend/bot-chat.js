// ============================================================================
// CONVERSA DOS BOTS NO CHAT — bot-chat.js
// De vez em quando o bot "fala" no chat da mesa como se fosse gente. Cada
// personalidade (a mesma `persona` do bot.js) tem o seu jeito de escrever:
//   jailson  na moral: minúsculo, gíria, sem pontuação, abreviando (vc, blz, mano)
//   joao     doidão: CAIXA ALTA, exclamação, KKKKK, provoca todo mundo
//   thiago   racional: frases completas, pontuação certinha, fala de chance/lógica
// Usado pelo server.js:  const botChat = createBotChat({ io, alive });
//   botChat.say(room, bot, 'evento')      -> fala (às vezes) por causa de um evento
//   botChat.reply(room, texto, autor)     -> um bot pode responder o que um humano escreveu
// Ajustes: CHANCE (probabilidade por evento), GAP_MS (intervalo mínimo entre falas).
// ============================================================================
'use strict';

module.exports = function createBotChat({ io, alive }) {
  const GAP_MS = 14000;        // cada bot espera pelo menos isso entre uma fala e outra
  const ROOM_GAP_MS = 4000;    // e a sala toda também respira entre falas de bots
  const CHANCE = {
    join: 0.85, takeover: 1, call: 0.35, raise: 0.5, accept: 0.22, run: 0.5, ran: 0.45,
    win_hand: 0.2, lose_hand: 0.2, win_game: 0.9, lose_game: 0.8, reply: 0.4
  };

  const LINES = {
    jailson: {
      join:      ['salve galera', 'eae, bora jogar', 'fala time, tranquilo?', 'tô na área, vamo nessa'],
      takeover:  ['relaxa que eu seguro aqui', 'cheguei, pode deixar a mão comigo'],
      call:      ['truco aí, vê se tem', 'bora de truco, sem pressão', 'truco mano, na moral'],
      raise:     ['seis então, tá tranquilo', 'aumento, bora ver', 'sobe aí então'],
      accept:    ['vem', 'blz, aceito', 'bora, pagando pra ver'],
      run:       ['hoje não, corri', 'dessa vez vcs ganham, fui', 'correr faz parte né'],
      ran:       ['ih, fugiu né, valeu os pontos', 'sem stress, pontinho pra nós'],
      win_hand:  ['boa, mais uma', 'tmj, mão nossa', 'foi na sorte kkk'],
      lose_hand: ['tranquilo, próxima', 'faz parte, bora', 'ihh perdi essa'],
      win_game:  ['gg galera, jogaram bem', 'boa partida, valeu mano', 'gg, bora outra?'],
      lose_game: ['gg, vcs mandaram bem', 'perdi mas foi massa, revanche?', 'foi bom jogo, gg'],
      hello:     ['salve', 'eae mano, tudo certo?', 'fala aí'],
      gg:        ['gg mano', 'valeu, foi massa'],
      bluff:     ['kkk quem sabe, vai descobrir', 'não falo nada, na moral'],
      generic:   ['kkk verdade', 'pode crer', 'tá certo', 'boa, concordo', 'sei lá mano, bora jogar']
    },
    joao: {
      join:      ['CHEGUEI!! QUEM VAI PERDER HOJE??', 'OPA, TÁ ABERTO O TRUCO AQUI!!', 'BORA LOGO, TÔ COM PRESSA DE GANHAR KKKKK'],
      takeover:  ['AGORA O PAPAI ASSUMIU!!', 'PODE SAIR, EU RESOLVO ESSA MESA KKKK'],
      call:      ['TRUCOOOO!!!', 'TRUCO NELES!! KKKK', 'TRUCO, QUERO VER SE TEM CORAGEM!!', 'É TRUCO MEU CHAPA!!'],
      raise:     ['SEIS!! SOBE AÍ!!', 'AUMENTO TUDO, BORA PRA CIMA!!', 'AAAH VAI TER AUMENTO SIM KKKKK'],
      accept:    ['PODE VIR!!', 'TÔ PAGANDO, VAMO!!', 'ACEITO E AINDA SOBRO KKKK'],
      run:       ['CORRI!! MAS VOLTO PIOR!!', 'FUI! EU HEIN KKKKK', 'ESSA EU DEIXO, A PRÓXIMA É MINHA!!'],
      ran:       ['CORREU!! CORREU!! KKKKKKK', 'AMARELOU!! PONTINHO PRA NÓIS!!'],
      win_hand:  ['OLHA ISSOOO KKKKK', 'É POR ISSO QUE EU SOU O MELHOR!!', 'TOMA!! KKKK'],
      lose_hand: ['QUE ROUBO É ESSE??', 'AH NÃO, TÁ DE BRINCADEIRA!!', 'FOI SORTE SUA!! KKKK'],
      win_game:  ['GANHEI!! PODEM CHORAR KKKKKKK', 'É CAMPEÃO!! QUEM QUER REVANCHE??', 'EU AVISEI!! KKKK'],
      lose_game: ['ROUBADO!! QUERO REVANCHE JÁ!!', 'FOI NA SORTE, EXIJO OUTRA!!', 'NÃO ACREDITO, REVANCHE!!'],
      hello:     ['EAEEE!!', 'FALA, MEU CHAPA!! BORA JOGAR!!', 'OPA!! TUDO CERTO??'],
      gg:        ['GG!! MAS NA PRÓXIMA EU GANHO KKKK', 'GGGG!!'],
      bluff:     ['BLEFE?? EU?? KKKKKK JAMAIS!!', 'SERÁ?? KKKKK VOCÊ NUNCA VAI SABER!!'],
      generic:   ['KKKKKKK', 'ISSO AÍ!!', 'NÃO ENTENDI NADA MAS CONCORDO KKKK', 'AH É?? ENTÃO TÁ!!']
    },
    thiago: {
      join:      ['Boa noite a todos. Que seja uma boa partida.', 'Olá. Vamos jogar com atenção.', 'Cheguei. Boa sorte a todos.'],
      takeover:  ['Assumi o lugar. Vou manter a estratégia da dupla.', 'Pode deixar, vou jogar com cuidado.'],
      call:      ['Truco. Pelas minhas contas, vale a pena.', 'Peço truco. Os números me favorecem.', 'Truco. É uma decisão calculada.'],
      raise:     ['Aumento. Acredito que a vantagem é minha.', 'Seis. Faz sentido neste ponto do placar.'],
      accept:    ['Aceito. O risco compensa.', 'Aceito. Faz sentido estatisticamente.', 'Certo, aceito.'],
      run:       ['Vou correr. O risco não compensa.', 'Corro. Não vale arriscar neste placar.', 'Prefiro fugir desta vez.'],
      ran:       ['Escolha prudente. Obrigado pelos pontos.', 'Entendo a decisão. Ponto para nós.'],
      win_hand:  ['Mão bem jogada.', 'Como previsto. Seguimos.', 'Bom resultado. Continuemos.'],
      lose_hand: ['Variância. Faz parte do jogo.', 'Foi azar, mas a decisão foi correta.', 'Perdi essa. Vamos ajustar.'],
      win_game:  ['Boa partida. Bom jogo a todos.', 'Partida encerrada. Jogaram bem.', 'Obrigado pelo jogo.'],
      lose_game: ['Parabéns pela vitória. Foi um bom jogo.', 'Perdemos. Mas foi equilibrado.', 'Bom jogo. Merecem a vitória.'],
      hello:     ['Olá. Tudo bem?', 'Boa. Como vai?', 'Olá! Pronto para jogar.'],
      gg:        ['Bom jogo. Obrigado.', 'GG. Foi uma boa partida.'],
      bluff:     ['Não revelo minhas decisões. Mas faço as contas.', 'Blefar tem custo. Prefiro calcular.'],
      generic:   ['Faz sentido.', 'Interessante. Vamos continuar.', 'Concordo, em parte.', 'Prefiro me concentrar no jogo.']
    }
  };
  const FALLBACK = 'thiago';

  function personaKey(bot) { return LINES[bot && bot.persona] ? bot.persona : FALLBACK; }
  function pick(arr, last) {
    if (!arr || !arr.length) return null;
    let s = arr[Math.floor(Math.random() * arr.length)];
    if (arr.length > 1) { let g = 0; while (s === last && g++ < 6) s = arr[Math.floor(Math.random() * arr.length)]; }
    return s;
  }

  // Envia a fala depois de um tempinho "digitando" (proporcional ao tamanho).
  function send(r, bot, text) {
    if (!text) return;
    const now = Date.now();
    bot._chatAt = now; r._botChatAt = now;
    const wait = 700 + Math.random() * 1200 + text.length * 35;
    setTimeout(() => {
      if (alive && !alive(r)) return;
      if (!bot.isBot) return; // humano voltou pro lugar: o bot calou
      io.to(r.code).emit('chat_message', {
        name: bot.name, nameFx: null, seat: bot.seat, isBot: true, text: String(text).slice(0, 120), ts: Date.now()
      });
    }, wait);
  }

  function canSpeak(r, bot) {
    const now = Date.now();
    return !(bot._chatAt && now - bot._chatAt < GAP_MS) && !(r._botChatAt && now - r._botChatAt < ROOM_GAP_MS);
  }

  // Fala por causa de um evento do jogo (call, raise, accept, run, ran, join...).
  function say(r, bot, kind, force) {
    if (!r || !bot || !bot.isBot || !canSpeak(r, bot)) return;
    if (!force && Math.random() > (CHANCE[kind] !== undefined ? CHANCE[kind] : 0.25)) return;
    const key = personaKey(bot);
    const line = pick(LINES[key][kind], bot._lastLine);
    if (!line) return;
    bot._lastLine = line;
    send(r, bot, line);
  }

  // Um bot aleatório (entre os que estão em `list`) fala sobre o evento.
  function sayAny(r, list, kind) {
    const bots = list.filter(p => p.isBot && canSpeak(r, p));
    if (bots.length) say(r, bots[Math.floor(Math.random() * bots.length)], kind);
  }

  // Fim de mão: quem ganhou comemora, quem perdeu resmunga (às vezes).
  function handResult(r, winnerTeam) {
    sayAny(r, r.players.filter(p => p.team === winnerTeam), 'win_hand');
    sayAny(r, r.players.filter(p => p.team !== winnerTeam), 'lose_hand');
  }
  function gameResult(r, winnerTeam) {
    sayAny(r, r.players.filter(p => p.team === winnerTeam), 'win_game');
    sayAny(r, r.players.filter(p => p.team !== winnerTeam), 'lose_game');
  }

  // Um humano escreveu no chat: às vezes um bot responde (cumprimento, gg, blefe, ou algo genérico).
  function reply(r, text, authorName) {
    if (!r || !text) return;
    const t = String(text).toLowerCase();
    const bots = r.players.filter(p => p.isBot && canSpeak(r, p));
    if (!bots.length) return;
    // se citou o nome de um bot, ele responde com certeza
    let target = bots.find(b => t.includes(String(b.name).toLowerCase().replace(/^bot\s+/, '')));
    if (!target) {
      if (Math.random() > CHANCE.reply) return;
      target = bots[Math.floor(Math.random() * bots.length)];
    }
    let kind = 'generic';
    if (/\b(oi|ola|olá|eae|e ai|e aí|salve|fala|opa|bom dia|boa noite|boa tarde)\b/.test(t)) kind = 'hello';
    else if (/\bgg\b|boa partida|bom jogo|parab/.test(t)) kind = 'gg';
    else if (/blef|faca[oõ]|facão|mentira|tem nada|sem carta/.test(t)) kind = 'bluff';
    const line = pick(LINES[personaKey(target)][kind], target._lastLine);
    if (!line) return;
    target._lastLine = line;
    send(r, target, line);
  }

  return { say, sayAny, handResult, gameResult, reply, personas: Object.keys(LINES) };
};
