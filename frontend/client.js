// ============================================================================
// TRUCO PAULISTA ONLINE — client.js
// ============================================================================

// --------------------------------------------------------------------------
// Bloqueio de zoom: o site é pensado pra rodar numa resolução fixa (a mesa,
// as cartas, tudo depende disso). Zoom do usuário (pinch, duplo toque,
// Ctrl+scroll, Ctrl+/Ctrl-) quebra o layout, então bloqueamos tudo aqui.
// --------------------------------------------------------------------------

// Pinch-zoom no Safari/iOS (evento proprietário, ignora o viewport meta às vezes)
document.addEventListener('gesturestart', (e) => e.preventDefault());
document.addEventListener('gesturechange', (e) => e.preventDefault());
document.addEventListener('gestureend', (e) => e.preventDefault());

// Pinch-zoom com dois dedos em geral (Android/Chrome)
document.addEventListener('touchmove', (e) => {
  if (e.touches.length > 1) e.preventDefault();
}, { passive: false });

// Duplo toque rápido pra dar zoom
let lastTouchEnd = 0;
document.addEventListener('touchend', (e) => {
  const now = Date.now();
  if (now - lastTouchEnd <= 300) e.preventDefault();
  lastTouchEnd = now;
}, { passive: false });

// Ctrl/Cmd + scroll do mouse (zoom do navegador no desktop)
document.addEventListener('wheel', (e) => {
  if (e.ctrlKey) e.preventDefault();
}, { passive: false });

// Atalhos de teclado de zoom: Ctrl/Cmd + '+', '-', '=' ou '0'
document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && ['+', '-', '=', '0'].includes(e.key)) {
    e.preventDefault();
  }
});

// --------------------------------------------------------------------------
// Trava menu de botão direito e atalhos comuns de DevTools/ver código-fonte.
// Aviso: isso é só um dificultador de superfície — dá pra abrir o DevTools
// pelo menu do navegador mesmo assim, não existe bloqueio real client-side.
// --------------------------------------------------------------------------
document.addEventListener('contextmenu', (e) => e.preventDefault());

document.addEventListener('keydown', (e) => {
  const key = e.key;
  const blocked =
    key === 'F12' ||
    ((e.ctrlKey || e.metaKey) && e.shiftKey && ['I', 'i', 'J', 'j', 'C', 'c'].includes(key)) || // DevTools / inspecionar
    ((e.ctrlKey || e.metaKey) && ['U', 'u'].includes(key)); // ver código-fonte
  if (blocked) e.preventDefault();
});

// Fallback pra navegadores/dispositivos onde o CSS user-select não pega
// (ex: alguns fluxos de seleção via toque)
document.addEventListener('selectstart', (e) => {
  const tag = e.target && e.target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA') return; // deixa os campos de texto funcionarem
  e.preventDefault();
});

// Impede arrastar imagens (evita "salvar imagem como" via drag)
document.addEventListener('dragstart', (e) => e.preventDefault());

const socket = io(RESOLVED_BACKEND_URL, {
  transports: ['websocket', 'polling']
});

socket.on('connect_error', (err) => {
  console.error('Falha ao conectar no backend:', err.message);
  lobbyErrorSafe(
    `Não foi possível conectar ao servidor (${RESOLVED_BACKEND_URL}). ` +
    `Verifique se a URL em config.js está correta e se o backend está no ar.`
  );
});


// Se a conexão cair e voltar (Render free, wifi, celular), o socket ganha um id
// novo e o servidor não sabe mais quem somos. Aqui retomamos o lugar na sala.
function tryRejoin() {
  if (!myRoomCode || !myToken) return;
  socket.emit('rejoin_room', { code: myRoomCode, token: myToken }, (res) => {
    if (res && res.ok) return;
    alert((res && res.error ? res.error : 'Não foi possível voltar para a sala.') + ' Voltando ao início.');
    location.reload();
  });
}
socket.on('connect', tryRejoin);
socket.on('disconnect', () => {
  const t = document.getElementById('character-phase-timer');
  if (t && t.classList.contains('active')) { /* sem mensagem: só o tempo */ }
});

function lobbyErrorSafe(msg) {
  const el = document.getElementById('lobby-error');
  if (el) el.textContent = msg;
}

// Ícones hand drawn (sprite no index.html). Sempre brancos/da cor do texto.
const ICON = (name, only) => '<svg class="ic' + (only ? ' ic-only' : '') + '" aria-hidden="true"><use href="#i-' + name + '"/></svg>';
const SUIT_SYMBOLS = { ouros: '♦', espadas: '♠', copas: '♥', paus: '♣' };
const SUIT_COLOR = { ouros: 'red', espadas: 'black', copas: 'red', paus: 'black' };

let myName = '';
let myMode = '1v1';
let myRoomCode = null;
let mySeat = null;
let myTeam = null;
let statsCounted = false; // já contei vitória/derrota desta partida?
let myWaitingSeat = null; // meu assento na sala de espera (antes do jogo começar)
let myToken = null; // credencial pra retomar meu lugar na sala se a conexão cair
let currentRoomCodeForCopy = null;
let selectedCardId = null;
let esconderAtivo = false;
let latestState = null;
let pendingPlayOrigin = null; // { cardId, rect } — de onde a minha carta partiu, pra animar até a mesa
let lastRenderedMao = null;
let lastRenderedTableLen = 0;
// Jogada otimista: quando EU jogo uma carta, ela aparece na mesa na hora
// (sem esperar o servidor). O estado real do servidor só confirma depois.
let optimisticPlay = null; // { cardId, hidden, mao, timer }

// ------------------------------------------------------------------
// Navegação de telas
// ------------------------------------------------------------------
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  if (window.GameAudio) GameAudio.onScreen(id);
}

// ------------------------------------------------------------------
// TELA LOBBY
// ------------------------------------------------------------------
function currentName() {
  const v = document.getElementById('input-name').value.trim();
  return v || `Jogador${Math.floor(Math.random() * 900 + 100)}`;
}

function getSavedCharacter() {
  try {
    return localStorage.getItem('trutec_meu_personagem') || null;
  } catch (e) {
    return null;
  }
}

// ------------------------------------------------------------------
// PAINEL: CRIAR PERSONAGEM (desenhar em cima do boneco)
// ------------------------------------------------------------------
(function initCharacterEditor() {
  const canvas = document.getElementById('character-canvas');
  if (!canvas) return; // painel não presente nesta tela/versão

  const ctx = canvas.getContext('2d');
  const colorPicker = document.getElementById('character-color-picker');
  const brushSizeInput = document.getElementById('character-brush-size');
  const btnPen = document.getElementById('btn-tool-pen');
  const btnEraser = document.getElementById('btn-tool-eraser');
  const btnUndo = document.getElementById('btn-character-undo');
  const btnClear = document.getElementById('btn-character-clear');
  const btnSave = document.getElementById('btn-character-save');
  const saveMsg = document.getElementById('character-save-msg');
  const characterBase = document.getElementById('character-base');

  let drawing = false;
  let currentColor = colorPicker.value;
  let currentTool = 'pen'; // 'pen' | 'eraser'
  let lastX = 0, lastY = 0;
  const undoStack = [];

  // ------------------------------------------------------------------
  // Aba "Pele": tom/cor do boneco via hue-rotate (o boneco é um SVG de
  // cor sólida, então rotacionar o matiz é suficiente pra trocar o tom).
  // ------------------------------------------------------------------
  const CHARACTER_BASE_COLOR = '#ff0042'; // cor original do svg do personagem
  const skinHueSlider = document.getElementById('character-skin-hue');
  const skinPresetsWrap = document.getElementById('skin-presets');
  const tabButtons = document.querySelectorAll('.editor-tab-btn');
  const tabPanels = document.querySelectorAll('.editor-tab-panel');
  let skinHue = 0;

  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      tabButtons.forEach(b => b.classList.remove('active'));
      tabPanels.forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      const panel = document.querySelector(`.editor-tab-panel[data-tab-panel="${btn.dataset.tab}"]`);
      if (panel) panel.classList.add('active');
    });
  });

  // Usa um canvas de 1x1 pra descobrir a cor real que o navegador produz
  // ao aplicar hue-rotate — assim as bolinhas de tom batem exatamente
  // com o resultado que vai aparecer no boneco.
  function hueRotatedColor(deg) {
    const c = document.createElement('canvas');
    c.width = 1; c.height = 1;
    const cx = c.getContext('2d');
    cx.filter = `hue-rotate(${deg}deg)`;
    cx.fillStyle = CHARACTER_BASE_COLOR;
    cx.fillRect(0, 0, 1, 1);
    const d = cx.getImageData(0, 0, 1, 1).data;
    return `rgb(${d[0]}, ${d[1]}, ${d[2]})`;
  }

  function setSkinHue(deg) {
    skinHue = deg;
    skinHueSlider.value = deg;
    characterBase.style.filter = (deg ? `hue-rotate(${deg}deg) ` : '') + 'url(#boil-lg)'; // boil-lg = tremida animada (boil.js)
    skinPresetsWrap.querySelectorAll('.skin-preset').forEach(b => {
      b.classList.toggle('active', Number(b.dataset.hue) === deg);
    });
  }

  const SKIN_PRESET_DEGS = [0, 25, 55, 100, 150, 190, 230, 270, 310];
  SKIN_PRESET_DEGS.forEach(deg => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'skin-preset' + (deg === 0 ? ' active' : '');
    b.dataset.hue = String(deg);
    b.style.background = hueRotatedColor(deg);
    b.title = deg === 0 ? 'Tom original' : `Tom ${deg}°`;
    b.addEventListener('click', () => setSkinHue(deg));
    skinPresetsWrap.appendChild(b);
  });

  skinHueSlider.addEventListener('input', () => setSkinHue(Number(skinHueSlider.value)));

  try {
    const savedHue = localStorage.getItem('trutec_personagem_hue');
    if (savedHue !== null) setSkinHue(Number(savedHue));
  } catch (e) { /* localStorage indisponível, ignora */ }

  function pushUndoState() {
    undoStack.push(canvas.toDataURL());
    if (undoStack.length > 20) undoStack.shift();
  }

  function pointerPos(e) {
    const rect = canvas.getBoundingClientRect();
    const cx = (e.touches ? e.touches[0].clientX : e.clientX);
    const cy = (e.touches ? e.touches[0].clientY : e.clientY);
    return {
      x: (cx - rect.left) * (canvas.width / rect.width),
      y: (cy - rect.top) * (canvas.height / rect.height)
    };
  }

  function startDraw(e) {
    e.preventDefault();
    drawing = true;
    pushUndoState();
    const p = pointerPos(e);
    lastX = p.x; lastY = p.y;
    drawDot(p.x, p.y);
  }

  function drawDot(x, y) {
    ctx.globalCompositeOperation = currentTool === 'eraser' ? 'destination-out' : 'source-over';
    ctx.fillStyle = currentColor;
    ctx.beginPath();
    ctx.arc(x, y, Number(brushSizeInput.value) / 2, 0, Math.PI * 2);
    ctx.fill();
  }

  function moveDraw(e) {
    if (!drawing) return;
    e.preventDefault();
    const p = pointerPos(e);
    ctx.globalCompositeOperation = currentTool === 'eraser' ? 'destination-out' : 'source-over';
    ctx.strokeStyle = currentColor;
    ctx.lineWidth = Number(brushSizeInput.value);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(lastX, lastY);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    lastX = p.x; lastY = p.y;
  }

  function endDraw() { drawing = false; }

  canvas.addEventListener('mousedown', startDraw);
  canvas.addEventListener('mousemove', moveDraw);
  window.addEventListener('mouseup', endDraw);
  canvas.addEventListener('touchstart', startDraw, { passive: false });
  canvas.addEventListener('touchmove', moveDraw, { passive: false });
  canvas.addEventListener('touchend', endDraw);

  document.querySelectorAll('.color-swatch').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.color-swatch').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentColor = btn.dataset.color;
      colorPicker.value = currentColor;
      currentTool = 'pen';
      btnPen.classList.add('active');
      btnEraser.classList.remove('active');
    });
  });

  colorPicker.addEventListener('input', () => {
    currentColor = colorPicker.value;
    document.querySelectorAll('.color-swatch').forEach(b => b.classList.remove('active'));
    currentTool = 'pen';
    btnPen.classList.add('active');
    btnEraser.classList.remove('active');
  });

  btnPen.addEventListener('click', () => {
    currentTool = 'pen';
    btnPen.classList.add('active');
    btnEraser.classList.remove('active');
  });

  btnEraser.addEventListener('click', () => {
    currentTool = 'eraser';
    btnEraser.classList.add('active');
    btnPen.classList.remove('active');
  });

  btnUndo.addEventListener('click', () => {
    if (!undoStack.length) return;
    const last = undoStack.pop();
    const img = new Image();
    img.onload = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    };
    img.src = last;
  });

  btnClear.addEventListener('click', () => {
    pushUndoState();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  });

  btnSave.addEventListener('click', () => {
    // Junta o boneco base (com o tom escolhido na aba "Pele") + o desenho num único PNG.
    const merged = document.createElement('canvas');
    merged.width = canvas.width;
    merged.height = canvas.height;
    const mctx = merged.getContext('2d');
    const baseImg = document.getElementById('character-base');
    mctx.filter = skinHue ? `hue-rotate(${skinHue}deg)` : 'none';
    mctx.drawImage(baseImg, 0, 0, merged.width, merged.height);
    mctx.filter = 'none';
    mctx.drawImage(canvas, 0, 0);
    const dataUrl = merged.toDataURL('image/png');

    try {
      localStorage.setItem('trutec_meu_personagem', dataUrl);
      localStorage.setItem('trutec_personagem_hue', String(skinHue));
    } catch (e) {
      console.warn('Não foi possível salvar no localStorage:', e);
    }

    // Atualiza a prévia grande do personagem lá no lobby.
    const previewImg = document.getElementById('character-preview-img');
    if (previewImg) previewImg.src = dataUrl;

    // Se já estamos numa sala, manda pro servidor e só diz "salvo" quando ele confirmar.
    const flash = (txt, ms = 3500) => {
      saveMsg.textContent = txt;
      setTimeout(() => { if (saveMsg.textContent === txt) saveMsg.textContent = ''; }, ms);
    };
    if (!myRoomCode) return flash('Personagem salvo!');
    if (!socket.connected) return flash('Sem conexão com o servidor. Aguarde reconectar e salve de novo.', 5000);
    saveMsg.textContent = 'Salvando…';
    socket.timeout(6000).emit('update_character', { character: dataUrl }, (err, res) => {
      if (err) return flash('O servidor não respondeu. Ele pode estar acordando ou desatualizado — tente de novo.', 6000);
      if (!res || !res.ok) return flash('Erro ao salvar: ' + ((res && res.error) || 'desconhecido'), 6000);
      flash('Personagem salvo!');
    });
  });

  // Carrega um personagem salvo anteriormente, se existir, e mostra na prévia do lobby.
  try {
    const saved = localStorage.getItem('trutec_meu_personagem');
    if (saved) {
      saveMsg.textContent = 'Você já tem um personagem salvo.';
      const previewImg = document.getElementById('character-preview-img');
      if (previewImg) previewImg.src = saved;
    }
  } catch (e) { /* localStorage indisponível, ignora */ }
})();

// ------------------------------------------------------------------
// Abrir/fechar a tela de edição do personagem a partir do lobby
// ------------------------------------------------------------------
document.getElementById('btn-open-character-editor')?.addEventListener('click', () => {
  showScreen('screen-character-editor');
});

document.getElementById('btn-close-character-editor').addEventListener('click', () => {
  showScreen('screen-lobby');
});

function lobbyError(msg) {
  ['lobby-error', 'join-error', 'create-error'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.textContent = msg || '';
  });
}

// ---- modais da tela inicial (Jogar / Criar sala) ----
const joinModal = document.getElementById('join-modal');
const createModal = document.getElementById('create-modal');
const codeInput = document.getElementById('input-code');

function openModal(m) { lobbyError(''); m.classList.remove('hidden'); }
function closeModal(m) { m.classList.add('hidden'); lobbyError(''); }

document.getElementById('btn-play').addEventListener('click', () => {
  openModal(joinModal);
  codeInput.focus();
});
document.getElementById('btn-create').addEventListener('click', () => openModal(createModal));
document.getElementById('join-cancel').addEventListener('click', () => closeModal(joinModal));
document.getElementById('create-cancel').addEventListener('click', () => closeModal(createModal));
[joinModal, createModal].forEach((m) => {
  m.addEventListener('click', (e) => { if (e.target === m) closeModal(m); });
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { closeModal(joinModal); closeModal(createModal); }
});

function enterRoom(res) {
  if (!res.ok) return lobbyError(res.error);
  myRoomCode = res.code;
  myWaitingSeat = res.seat;
  myToken = res.token || null;
  closeModal(joinModal);
  closeModal(createModal);
  showScreen('screen-waiting');
}

function joinByCode() {
  const code = codeInput.value.trim().toUpperCase();
  if (!code) return lobbyError('Digite o código da sala.');
  myName = currentName();
  socket.emit('join_room', { code, name: myName, character: getSavedCharacter(), stats: window.TruStats ? TruStats.get() : null, theme: window.TruThemes ? TruThemes.current() : null }, enterRoom);
}
document.getElementById('btn-join').addEventListener('click', joinByCode);
codeInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') joinByCode(); });

// Criar sala privada: 1v1 ou 2v2
document.querySelectorAll('.create-modes .btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    myMode = btn.dataset.mode;
    myName = currentName();
    socket.emit('create_room', { name: myName, mode: myMode, isPublic: false, character: getSavedCharacter(), stats: window.TruStats ? TruStats.get() : null, theme: window.TruThemes ? TruThemes.current() : null }, enterRoom);
  });
});

document.getElementById('btn-leave-waiting').addEventListener('click', () => {
  location.reload();
});

// ------------------------------------------------------------------
// SALA DE ESPERA
// ------------------------------------------------------------------
let teamSwapBusy = 0;          // >0 enquanto uma substituição (2 pedidos ao servidor) está em andamento
let deferredLobby = null;      // lobby_update recebido nesse meio tempo
function handleLobbyUpdate(lobby) {
  if (teamSwapBusy > 0) { deferredLobby = lobby; return; }
  document.getElementById('waiting-code').textContent = lobby.code;
  currentRoomCodeForCopy = lobby.code;
  const wrap = document.getElementById('waiting-players');
  wrap.innerHTML = '';

  // No 2v2, o host (assento 0) pode montar as duplas arrastando os
  // jogadores entre as duas áreas. Os demais só veem o resultado.
  const isHost = myWaitingSeat === 0;
  const canEditTeams = isHost && lobby.mode === '2v2' && !lobby.started;

  // Nunca pode haver mais de 2 jogadores numa dupla: se o servidor mandou um
  // time lotado, o host corrige na hora (na tela dele) e avisa o servidor
  // pra mandar o jogador que sobrou pra vaga que está faltando.
  if (canEditTeams) autoBalanceTeams(lobby);

  if (lobby.mode === '2v2') {
    wrap.appendChild(renderTeamsBoard(lobby, canEditTeams));
  } else {
    wrap.appendChild(renderClassicList(lobby, isHost && !lobby.started));
  }

  updateStartButton(lobby);
}
socket.on('lobby_update', handleLobbyUpdate);

// Adicionar / remover bot na sala de espera (só o host vê os botões).
// O botão lê a dupla na hora do clique, então continua certo depois de arrastar cards.
document.getElementById('waiting-players').addEventListener('click', (e) => {
  const addBtn = e.target.closest('.bot-add-btn');
  const rmBtn = e.target.closest('.bot-remove-btn');
  if (!addBtn && !rmBtn) return;
  const errEl = document.getElementById('waiting-error');
  const done = (res) => { if (errEl) errEl.textContent = res && !res.ok ? (res.error || 'Não foi possível.') : ''; };
  if (addBtn) {
    const col = addBtn.closest('.team-column');
    const payload = col ? { team: parseInt(col.dataset.team, 10) } : {};
    addBtn.disabled = true;
    socket.emit('add_bot', payload, (res) => { addBtn.disabled = false; done(res); });
  } else {
    const card = rmBtn.closest('[data-seat]');
    if (!card) return;
    socket.emit('remove_bot', { seat: parseInt(card.dataset.seat, 10) }, done);
  }
});

const pendingBalance = new Set();
function autoBalanceTeams(lobby) {
  if (teamSwapBusy > 0) return;
  const count = [0, 1].map(t => lobby.players.filter(p => p.team === t).length);
  for (const from of [0, 1]) {
    const to = 1 - from;
    while (count[from] > 2 && count[to] < 2) {
      // quem entrou por último (maior assento) é quem muda; o host nunca sai da dupla dele
      const cand = lobby.players
        .filter(p => p.team === from && p.seat !== 0)
        .sort((a, b) => b.seat - a.seat)[0];
      if (!cand) break;
      cand.team = to;
      count[from]--; count[to]++;
      const key = cand.seat + ':' + to;
      if (pendingBalance.has(key)) continue; // já pedido, esperando o servidor
      pendingBalance.add(key);
      socket.emit('set_player_team', { seat: cand.seat, team: to }, () => pendingBalance.delete(key));
    }
  }
}

function playerCardHtml(p, draggable) {
  const avatarSrc = p.character || 'assets/personagem.svg';
  return `
    <div class="team-card${draggable ? ' team-card-draggable' : ''}" data-seat="${p.seat}">
      <div class="wp-avatar"><img src="${avatarSrc}" alt="" draggable="false" /></div>
      <span class="wp-name">${escapeHtml(p.name)}${p.connected ? '' : ' (saiu)'}${p.seat === 0 ? ' ' + ICON('crown', true) : ''}</span>
      ${p.isBot && draggable ? '<button type="button" class="bot-remove-btn" title="Remover bot" aria-label="Remover bot">×</button>' : ''}
    </div>
  `;
}

// Monta as duas áreas (Dupla 1 / Dupla 2) do modo 2v2. Quando `canEdit` é
// true (só pro host, antes de iniciar), cada card de jogador pode ser
// arrastado de uma área pra outra.
function renderTeamsBoard(lobby, canEdit) {
  const board = document.createElement('div');
  board.className = 'teams-board';

  for (const team of [0, 1]) {
    const teamPlayers = lobby.players.filter(p => p.team === team);
    const missing = Math.max(0, 2 - teamPlayers.length);

    const col = document.createElement('div');
    col.className = `team-column team-column-${team === 0 ? 'a' : 'b'}`;
    col.dataset.team = String(team);

    let bodyHtml = teamPlayers.map(p => playerCardHtml(p, canEdit)).join('');
    for (let i = 0; i < missing; i++) {
      bodyHtml += canEdit
        ? `<div class="team-slot-empty has-bot-btn"><span class="slot-wait">Aguardando…</span><button type="button" class="bot-add-btn">+ Adicionar bot</button></div>`
        : `<div class="team-slot-empty">Aguardando…</div>`;
    }

    col.innerHTML = `
      <div class="team-column-title">Dupla ${team + 1}</div>
      <div class="team-column-body">${bodyHtml}</div>
    `;
    board.appendChild(col);
  }

  if (canEdit) {
    board.querySelectorAll('.team-card-draggable').forEach(card => {
      card.addEventListener('pointerdown', (e) => { if (e.target.closest('.bot-remove-btn')) return; startTeamCardDrag(e, card); });
    });
  }

  return board;
}

// Sala de espera do 1v1: lista simples, sem edição de time (não há o que
// escolher com 2 jogadores e 2 times fixos).
function renderClassicList(lobby, canEdit) {
  const list = document.createElement('div');
  for (let i = 0; i < lobby.maxPlayers; i++) {
    const p = lobby.players.find(pl => pl.seat === i);
    const row = document.createElement('div');
    row.className = 'wp-row';
    if (p) {
      const avatarSrc = p.character || 'assets/personagem.svg';
      row.innerHTML = `
        <div class="wp-avatar"><img src="${avatarSrc}" alt="" draggable="false" /></div>
        <div class="wp-info">
          <span class="wp-name">${escapeHtml(p.name)}${p.connected ? '' : ' (saiu)'}${p.seat === 0 ? ' ' + ICON('crown', true) : ''}</span>
          <span class="wp-team">Time ${p.team + 1}</span>
        </div>
        ${p.isBot && canEdit ? '<button type="button" class="bot-remove-btn" title="Remover bot" aria-label="Remover bot">×</button>' : ''}
      `;
    } else {
      row.className += ' wp-row-empty' + (canEdit ? ' has-bot-btn' : '');
      row.innerHTML = `
        <div class="wp-avatar wp-avatar-empty"><img src="assets/personagem.svg" alt="" draggable="false" /></div>
        <div class="wp-info">
          <span class="wp-name" style="opacity:.5">Aguardando…</span>
          <span class="wp-team">—</span>
        </div>
        ${canEdit ? '<button type="button" class="bot-add-btn">+ Adicionar bot</button>' : ''}
      `;
    }
    list.appendChild(row);
  }
  return list;
}

// ------------------------------------------------------------------
// Arrastar jogador entre "Dupla 1" e "Dupla 2" (host, modo 2v2)
// Usa Pointer Events pra funcionar igual com mouse e touch.
// ------------------------------------------------------------------
let teamDrag = null;

const REDUCED_MOTION = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

function startTeamCardDrag(e, cardEl) {
  if (e.button !== undefined && e.button !== 0) return;
  e.preventDefault();

  const seat = parseInt(cardEl.dataset.seat, 10);
  const rect = cardEl.getBoundingClientRect();
  const ghost = cardEl.cloneNode(true);
  ghost.className = 'team-card team-card-ghost';
  ghost.style.width = rect.width + 'px';
  ghost.style.left = rect.left + 'px';
  ghost.style.top = rect.top + 'px';
  const offsetX = e.clientX - rect.left;
  const offsetY = e.clientY - rect.top;
  // o card balança pendurado no ponto onde o host pegou
  ghost.style.transformOrigin = offsetX + 'px ' + offsetY + 'px';
  document.body.appendChild(ghost);

  cardEl.classList.add('team-card-source-dragging');

  teamDrag = {
    seat,
    ghost,
    sourceEl: cardEl,
    startX: e.clientX,
    startY: e.clientY,
    offsetX,
    offsetY,
    moved: false,
    tx: e.clientX,      // posição mais recente do ponteiro
    lastTx: e.clientX,  // posição no quadro anterior
    angle: 0,
    angVel: (Math.random() < 0.5 ? -1 : 1) * 4, // "chacoalhada" ao pegar
    scale: 0.88,        // começa menor e estica passando do ponto = elástico
    scaleVel: 0,
    raf: 0
  };

  if (!REDUCED_MOTION) teamDrag.raf = requestAnimationFrame(animateTeamGhost);
  else teamDrag.ghost.style.transform = 'scale(1.04)';

  document.addEventListener('pointermove', onTeamDragMove);
  document.addEventListener('pointerup', onTeamDragEnd, { once: true });
}

// Balanço elástico do card arrastado: duas molas sub-amortecidas.
//  - ângulo: acompanha a velocidade horizontal do mouse e continua
//    oscilando (balangando) até assentar quando o mouse para;
//  - escala: "pop" ao pegar, passa de 1.07 e volta quicando.
function animateTeamGhost() {
  const d = teamDrag;
  if (!d) return;

  const vx = d.tx - d.lastTx;
  d.lastTx = d.tx;

  const targetAngle = Math.max(-24, Math.min(24, vx * 1.6));
  d.angVel += (targetAngle - d.angle) * 0.14;
  d.angVel *= 0.84;
  d.angle += d.angVel;

  d.scaleVel += (1.07 - d.scale) * 0.22;
  d.scaleVel *= 0.78;
  d.scale += d.scaleVel;

  d.ghost.style.transform = 'rotate(' + d.angle.toFixed(2) + 'deg) scale(' + d.scale.toFixed(3) + ')';
  d.raf = requestAnimationFrame(animateTeamGhost);
}

function onTeamDragMove(e) {
  if (!teamDrag) return;
  const dx = e.clientX - teamDrag.startX;
  const dy = e.clientY - teamDrag.startY;
  if (Math.abs(dx) > 4 || Math.abs(dy) > 4) teamDrag.moved = true;

  teamDrag.tx = e.clientX;
  teamDrag.ghost.style.left = (e.clientX - teamDrag.offsetX) + 'px';
  teamDrag.ghost.style.top = (e.clientY - teamDrag.offsetY) + 'px';

  document.querySelectorAll('.team-column').forEach(c => c.classList.remove('team-column-hover'));
  const el = document.elementFromPoint(e.clientX, e.clientY);
  const col = el && el.closest('.team-column');
  if (col) col.classList.add('team-column-hover');
}

function onTeamDragEnd(e) {
  document.removeEventListener('pointermove', onTeamDragMove);
  if (!teamDrag) return;
  cancelAnimationFrame(teamDrag.raf);

  const el = document.elementFromPoint(e.clientX, e.clientY);
  const col = el && el.closest('.team-column');
  const dropEl = el, dropY = e.clientY;
  document.querySelectorAll('.team-column').forEach(c => c.classList.remove('team-column-hover'));

  teamDrag.sourceEl.classList.remove('team-card-source-dragging');
  teamDrag.ghost.remove();

  // Toque rápido sem arrastar: alterna o jogador pra outra dupla direto.
  const seat = teamDrag.seat;
  const sourceEl = teamDrag.sourceEl;
  const sourceCol = sourceEl.closest('.team-column');
  const currentTeam = sourceCol ? parseInt(sourceCol.dataset.team, 10) : null;
  let targetTeam = null;
  if (col) {
    targetTeam = parseInt(col.dataset.team, 10);
  } else if (!teamDrag.moved) {
    if (currentTeam !== null) targetTeam = currentTeam === 0 ? 1 : 0;
  }

  teamDrag = null;

  if (targetTeam !== null && targetTeam !== currentTeam) {
    // Troca INSTANTÂNEA pro host: move o card na tela na hora (se houver vaga)
    // e só depois confirma com o servidor. Os outros jogadores recebem pelo
    // lobby_update, com o delay normal da rede.
    const targetCol = document.querySelector('.team-column[data-team="' + targetTeam + '"]');
    if (targetCol && !targetCol.querySelector('.team-slot-empty')) {
      if (!col) { // toque rápido (sem arrastar): não dá pra saber quem substituir
        const errEl = document.getElementById('waiting-error');
        if (errEl) errEl.textContent = 'Dupla cheia: arraste o jogador em cima de quem você quer substituir.';
        return;
      }
      // dupla cheia: solta em cima de alguém pra substituir (ele vai pra dupla de quem foi arrastado)
      if (!dropEl) return;
      const cards = Array.from(targetCol.querySelectorAll('.team-card'));
      let victim = dropEl.closest && dropEl.closest('.team-card');
      if (!victim || !targetCol.contains(victim)) {
        // não caiu exatamente em cima de um card: pega o mais próximo na vertical
        victim = cards.sort((a, b) => {
          const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
          return Math.abs(ra.top + ra.height / 2 - dropY) - Math.abs(rb.top + rb.height / 2 - dropY);
        })[0];
      }
      if (victim) swapPlayers(sourceEl, victim, seat, parseInt(victim.dataset.seat, 10), currentTeam, targetTeam);
      return;
    }
    const errEl0 = document.getElementById('waiting-error');
    if (errEl0) errEl0.textContent = '';
    const moved = moveCardToColumn(sourceEl, targetCol);
    socket.emit('set_player_team', { seat, team: targetTeam }, (res) => {
      if (res && !res.ok) {
        if (moved && sourceCol && sourceEl.isConnected) moveCardToColumn(sourceEl, sourceCol); // desfaz
        const errEl = document.getElementById('waiting-error');
        if (errEl) errEl.textContent = res.error || 'Não foi possível mudar a dupla.';
      }
    });
  }
}

// Substitui: A (arrastado) vai pra dupla de B e B vai pra dupla de A.
// A tela do host troca na hora; o servidor recebe dois pedidos em sequência
// (A -> dupla de B, depois B -> dupla de A). Enquanto isso o auto-balanceamento
// e os lobby_update ficam em espera pra não brigar com a troca.
function swapPlayers(cardA, cardB, seatA, seatB, teamA, teamB) {
  const errEl = document.getElementById('waiting-error');
  if (errEl) errEl.textContent = '';

  function swapDom() {
    const mark = document.createComment('');
    cardA.replaceWith(mark);
    cardB.replaceWith(cardA);
    mark.replaceWith(cardB);
  }
  function finish() {
    teamSwapBusy = Math.max(0, teamSwapBusy - 1);
    if (teamSwapBusy === 0 && deferredLobby) { const l = deferredLobby; deferredLobby = null; handleLobbyUpdate(l); }
  }
  function fail(res) {
    if (cardA.isConnected && cardB.isConnected) swapDom(); // desfaz na tela
    if (errEl) errEl.textContent = (res && res.error) || 'Não foi possível substituir o jogador.';
    finish();
  }

  teamSwapBusy++;
  swapDom(); // instantâneo
  socket.emit('set_player_team', { seat: seatA, team: teamB }, (r1) => {
    if (r1 && !r1.ok) return fail(r1);
    socket.emit('set_player_team', { seat: seatB, team: teamA }, (r2) => {
      if (r2 && !r2.ok) {
        // segunda parte falhou: devolve o A pra dupla dele também
        socket.emit('set_player_team', { seat: seatA, team: teamA }, () => {});
        return fail(r2);
      }
      finish();
    });
  });
}

// Troca o card de coluna trocando de lugar com um slot "Aguardando…" vazio
// da coluna de destino (o slot vai pra coluna de origem). Retorna false se
// não houver vaga (nesse caso nada muda na tela e o servidor decide).
function moveCardToColumn(cardEl, col) {
  if (!cardEl || !col) return false;
  const slot = col.querySelector('.team-slot-empty');
  const fromBody = cardEl.parentElement;
  if (!slot || !fromBody) return false;
  slot.replaceWith(cardEl);
  fromBody.appendChild(slot);
  return true;
}

// ------------------------------------------------------------------
// Botão "Iniciar partida" (só o host, assento 0, vê e pode clicar)
// ------------------------------------------------------------------
function updateStartButton(lobby) {
  const btn = document.getElementById('btn-start-game');
  const hint = document.getElementById('waiting-hint');
  const spinner = document.getElementById('waiting-spinner');
  const isHost = myWaitingSeat === 0;

  btn.classList.toggle('hidden', !isHost);

  const full = lobby.players.length === lobby.maxPlayers;
  const teamsReady = lobby.teamsReady !== false; // 1v1 sempre true

  if (isHost) {
    btn.disabled = !lobby.canStart;
    if (!full) {
      btn.textContent = `Aguardando jogadores… (${lobby.players.length}/${lobby.maxPlayers})`;
    } else if (!teamsReady) {
      btn.textContent = 'Ajuste as duplas para iniciar';
    } else {
      btn.textContent = 'Iniciar partida';
    }

    if (!full) {
      hint.textContent = 'Aguardando mais jogadores entrarem na sala…';
    } else if (!teamsReady) {
      hint.textContent = 'Toque em "Dupla 1" / "Dupla 2" pra montar os times (2 jogadores em cada).';
    } else {
      hint.textContent = ''; // mesa completa: o botão Iniciar partida já diz tudo
    }
  } else {
    if (!full) {
      hint.textContent = 'Aguardando jogadores…';
    } else if (!teamsReady) {
      hint.textContent = 'O host está montando as duplas…';
    } else {
      hint.textContent = ''; // sem texto: só o círculo girando
    }
  }

  // quem não é host, com a mesa completa e as duplas prontas, só vê o círculo
  // girando (o mesmo das telas de carregamento) enquanto espera o host iniciar
  const waitingForHost = !isHost && full && teamsReady;
  if (spinner) spinner.classList.toggle('hidden', !waitingForHost);
  hint.classList.toggle('hidden', !hint.textContent);
}

document.getElementById('btn-start-game').addEventListener('click', () => {
  const btn = document.getElementById('btn-start-game');
  btn.disabled = true;
  socket.emit('start_game', (res) => {
    if (!res || !res.ok) {
      const el = document.getElementById('waiting-error');
      if (el) el.textContent = (res && res.error) || 'Não foi possível iniciar a partida.';
      btn.disabled = false;
    }
  });
});

// ------------------------------------------------------------------
// Copiar código da sala
// ------------------------------------------------------------------
function copyRoomCode() {
  if (!currentRoomCodeForCopy) return;

  const done = (ok) => {
    const btn = document.getElementById('btn-copy-code');
    const iconCopy = document.getElementById('icon-copy');
    const iconCheck = document.getElementById('icon-check');
    const feedback = document.getElementById('copy-feedback');
    if (!ok) {
      feedback.textContent = 'Não foi possível copiar. Selecione o código manualmente.';
      feedback.classList.add('show');
      setTimeout(() => feedback.classList.remove('show'), 2500);
      return;
    }
    btn.classList.add('copied');
    iconCopy.style.display = 'none';
    iconCheck.style.display = 'block';
    feedback.textContent = 'Código copiado!';
    feedback.classList.add('show');
    setTimeout(() => {
      btn.classList.remove('copied');
      iconCopy.style.display = 'block';
      iconCheck.style.display = 'none';
      feedback.classList.remove('show');
    }, 1800);
  };

  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(currentRoomCodeForCopy).then(() => done(true)).catch(() => done(false));
  } else {
    // Fallback pra contextos sem clipboard API (http, navegadores antigos)
    try {
      const tmp = document.createElement('textarea');
      tmp.value = currentRoomCodeForCopy;
      tmp.style.position = 'fixed';
      tmp.style.opacity = '0';
      document.body.appendChild(tmp);
      tmp.select();
      document.execCommand('copy');
      document.body.removeChild(tmp);
      done(true);
    } catch (e) {
      done(false);
    }
  }
}

document.getElementById('room-code-box').addEventListener('click', copyRoomCode);
document.getElementById('btn-copy-code').addEventListener('click', (e) => {
  e.stopPropagation();
  copyRoomCode();
});

// ------------------------------------------------------------------
// INÍCIO DE JOGO
// ------------------------------------------------------------------
let matchIntroPlayed = false;
let characterPhaseInterval = null;
let phaseWatchdog = null;

// Depois que o host aperta "Iniciar partida", todo mundo cai na tela de
// personagem por alguns segundos antes da mão ser distribuída de verdade.
function renderCharacterReady(players) {
  const panel = document.getElementById('character-ready-panel');
  const list = document.getElementById('ready-list');
  const count = document.getElementById('ready-count');
  if (!panel || !list) return;
  panel.classList.remove('hidden');
  list.innerHTML = '';
  let readyN = 0;
  for (const p of players) {
    if (p.ready) readyN++;
    const li = document.createElement('li');
    li.className = 'ready-item' + (p.ready ? ' is-ready' : '');
    const img = document.createElement('img');
    img.className = 'ready-avatar';
    img.alt = p.name;
    img.src = p.character || 'assets/personagem.svg';
    const info = document.createElement('div');
    info.className = 'ready-info';
    const nm = document.createElement('span');
    nm.className = 'ready-name';
    nm.textContent = p.name + (p.seat === (mySeat !== null ? mySeat : myWaitingSeat) ? ' (você)' : '');
    const st = document.createElement('span');
    st.className = 'ready-status';
    st.innerHTML = !p.connected ? 'desconectou' : (p.ready ? ICON('check') + ' Pronto' : ICON('pencil') + ' Desenhando…');
    info.appendChild(nm);
    info.appendChild(st);
    li.appendChild(img);
    li.appendChild(info);
    list.appendChild(li);
  }
  if (count) count.textContent = `${readyN}/${players.length}`;
}

// Depois que o host aperta "Iniciar partida", todo mundo cai na tela de
// personagem por alguns segundos antes da mão ser distribuída de verdade.
// Se todos salvarem antes do tempo, a partida começa na hora.
socket.on('character_phase_start', ({ durationMs, players }) => {
  showScreen('screen-character-editor');

  const backBtn = document.getElementById('btn-close-character-editor');
  if (backBtn) backBtn.classList.add('hidden');

  const timerEl = document.getElementById('character-phase-timer');
  if (timerEl) timerEl.classList.add('active');

  if (players) renderCharacterReady(players);

  const endsAt = Date.now() + durationMs;
  clearInterval(characterPhaseInterval);
  const tick = () => {
    const secsLeft = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
    if (timerEl) timerEl.textContent = `${secsLeft}s`;
    if (secsLeft <= 0) {
      clearInterval(characterPhaseInterval);
      // Tempo acabou e a partida não veio? Pede ao servidor pra ressincronizar.
      clearTimeout(phaseWatchdog);
      phaseWatchdog = setTimeout(() => {
        const onEditor = document.getElementById('screen-character-editor').classList.contains('active');
        if (!onEditor) return;
                if (socket.connected) tryRejoin(); else socket.connect();
      }, 4000);
    }
  };
  tick();
  characterPhaseInterval = setInterval(tick, 250);
});

socket.on('character_ready_update', ({ players }) => {
  renderCharacterReady(players);
});

socket.on('character_all_ready', () => {
  if (window.GameAudio) GameAudio.endMusic(); // todo mundo pronto: música some em fade out
  clearInterval(characterPhaseInterval);
  const timerEl = document.getElementById('character-phase-timer');
  });

// Transição pra partida: a tela escurece (fade in), fica preta com o círculo
// girando e depois some (fade out) revelando a mesa.
const INTRO_FADE_IN_MS = 400;   // igual a introFadeIn no CSS
const INTRO_HOLD_MS = 1200;     // tempo na tela preta
const INTRO_FADE_OUT_MS = 500;  // igual a introFadeOut no CSS
function playGameIntro() {
  const overlay = document.getElementById('game-intro');
  if (!overlay) return;
  overlay.classList.remove('fade-out');
  overlay.classList.add('active');
  setTimeout(() => {
    overlay.classList.add('fade-out');
    setTimeout(() => {
      overlay.classList.remove('active', 'fade-out');
    }, INTRO_FADE_OUT_MS + 50);
  }, INTRO_FADE_IN_MS + INTRO_HOLD_MS);
}

// Saindo da partida: a mesma tela de carregamento da entrada (escurece, círculo
// girando) cobre a tela, a página recarrega e, já de volta ao lobby, a tela
// preta faz o fade out. O html ganha a classe `leaving-intro` bem cedo (script
// no <head> do index.html) pra o lobby não piscar entre uma coisa e outra.
const LEAVE_HOLD_MS = 700;      // tempo na tela preta antes de recarregar
const LEAVE_AFTER_MS = 500;     // tempo na tela preta depois de recarregar
function leaveToLobby() {
  const overlay = document.getElementById('game-intro');
  try { sessionStorage.setItem('trutec-leave-intro', '1'); } catch (e) {}
  if (!overlay) return location.reload();
  overlay.classList.remove('fade-out');
  overlay.classList.add('active');
  setTimeout(() => location.reload(), INTRO_FADE_IN_MS + LEAVE_HOLD_MS);
}
(function finishLeaveIntro() {
  let flag = null;
  try { flag = sessionStorage.getItem('trutec-leave-intro'); sessionStorage.removeItem('trutec-leave-intro'); } catch (e) {}
  const overlay = document.getElementById('game-intro');
  if (flag !== '1' || !overlay) { document.documentElement.classList.remove('leaving-intro'); return; }
  setTimeout(() => {
    overlay.classList.add('fade-out');
    setTimeout(() => {
      overlay.classList.remove('fade-out');
      document.documentElement.classList.remove('leaving-intro');
    }, INTRO_FADE_OUT_MS + 50);
  }, LEAVE_AFTER_MS);
})();

let gameStartPending = false;   // esperando a tela ficar preta pra montar a mesa
let pendingStateUpdate = null;  // state_update que chegou nesse meio-tempo

socket.on('game_start', (state) => {
  if (window.GameAudio) GameAudio.endMusic(); // (caso o tempo acabe sem o all_ready)
  if (matchIntroPlayed) return beginMatch(state, 0); // partidas seguintes: sem sfx de início
  matchIntroPlayed = true;
  if (window.GameAudio) GameAudio.playStart(); // sfx de início: só na 1ª partida
  gameStartPending = true;
  playGameIntro();
  // só troca de tela quando estiver tudo preto, sem mostrar a mesa piscando
  setTimeout(() => {
    gameStartPending = false;
    beginMatch(state, INTRO_HOLD_MS + INTRO_FADE_OUT_MS + 100);
    if (pendingStateUpdate) { const s = pendingStateUpdate; pendingStateUpdate = null; renderState(s); }
  }, INTRO_FADE_IN_MS);
});

function beginMatch(state, dealDelay) {
  if (window.GameAudio) GameAudio.setMatchStarted(true);
  statsCounted = false;
  lastCallSoundKey = null;
  clearInterval(characterPhaseInterval);
  clearTimeout(phaseWatchdog);
  const timerEl = document.getElementById('character-phase-timer');
  if (timerEl) { timerEl.classList.remove('active'); timerEl.textContent = ''; }
  const backBtn = document.getElementById('btn-close-character-editor');
  if (backBtn) backBtn.classList.remove('hidden');
  const readyPanel = document.getElementById('character-ready-panel');
  if (readyPanel) readyPanel.classList.add('hidden');

  mySeat = state.players.find(p => p.hand !== undefined).seat;
  myTeam = state.players.find(p => p.seat === mySeat).team;
  selectedCardId = null;
  esconderAtivo = false;
  clearOptimistic();
  showScreen('screen-game');
  setupSeatLabels(state);
  // cartas subindo + som de carta sincronizado (na 1ª mão espera a intro da logo sumir)
  const handWrapEl = document.getElementById('my-hand');
  handWrapEl.innerHTML = '';
  handWrapEl.dataset.mao = '';
  const myHandCount = (state.players.find(p => p.seat === mySeat).hand || []).length;
  startDealAnimation(myHandCount, dealDelay);
  renderState(state);
  setBanner('');
}

function setupSeatLabels(state) {
  // score-a mostra SEMPRE o placar do meu time e score-b o do adversário
  // (ver renderState), então o rótulo tem que acompanhar: A = Nós, B = Eles.
  document.getElementById('label-team-a').textContent = 'Nós';
  document.getElementById('label-team-b').textContent = 'Eles';
}

// ------------------------------------------------------------------
// ATUALIZAÇÃO DE ESTADO
// ------------------------------------------------------------------
// Toca a fala quando um pedido novo aparece (truco/seis/nove/doze), seja
// pedido direto ou aumento — todos os jogadores ouvem.
let lastCallSoundKey = null;
function playCallSoundFromState(state) {
  const pc = state.pendingCall;
  if (!pc) { lastCallSoundKey = null; return; }
  const key = pc.level + ':' + pc.callingTeam;
  if (key === lastCallSoundKey) return;
  lastCallSoundKey = key;
  if (window.GameAudio) GameAudio.playCall(pc.level);
}

socket.on('state_update', (state) => {
  if (gameStartPending) { pendingStateUpdate = state; return; }
  playCallSoundFromState(state);
  renderState(state);
});

function seatOffsetLabel(seat, n) {
  // posição relativa à minha cadeira: bottom=eu, top=oposto, left/right = parceiros/adversários
  const rel = (seat - mySeat + n) % n;
  if (n === 2) return rel === 0 ? 'bottom' : 'top';
  // n === 4
  if (rel === 0) return 'bottom';
  if (rel === 1) return 'left';
  if (rel === 2) return 'top';
  if (rel === 3) return 'right';
}

// ------------------------------------------------------------------
// Animação de distribuir: as cartas da minha mão sobem de baixo, uma após a
// outra, e cada uma toca o som de carta no instante em que começa a subir.
// O servidor manda um state_update logo depois do game_start e o renderState
// recria a mão inteira — por isso o estado da animação fica guardado aqui e
// cada render reaplica a animação com o atraso (possivelmente negativo) certo,
// então ela continua de onde estava em vez de reiniciar ou sumir.
// ------------------------------------------------------------------
const DEAL_STAGGER_MS = 150; // intervalo entre uma carta e a próxima
const DEAL_DUR_MS = 550;     // duração da subida de cada carta
let dealAnim = null;         // { start: timestamp de início, count }
let dealAnimTimer = null;

function startDealAnimation(count, delayMs) {
  if (!count) return;
  clearTimeout(dealAnimTimer);
  dealAnim = { start: performance.now() + delayMs, count };
  for (let i = 0; i < count; i++) {
    // som de carta agendado no relógio do áudio, no mesmo instante da subida da carta i
    if (window.GameAudio) GameAudio.cardDeal((delayMs + i * DEAL_STAGGER_MS) / 1000, i);
  }
  dealAnimTimer = setTimeout(() => { dealAnim = null; },
    delayMs + (count - 1) * DEAL_STAGGER_MS + DEAL_DUR_MS + 100);
}

function applyDealAnimation(el, index) {
  if (!dealAnim) return;
  const startAt = dealAnim.start + index * DEAL_STAGGER_MS;
  const delay = startAt - performance.now(); // ms; negativo = já começou
  if (delay + DEAL_DUR_MS <= 0) return;      // essa carta já terminou de subir
  el.classList.add('dealing');
  el.style.animationDelay = delay.toFixed(0) + 'ms';
  // ao terminar, a carta volta a ser clicável. Dois caminhos pra garantir:
  // o evento animationend e um timer de segurança (caso a animação nem rode,
  // ex.: "reduzir movimento" ligado ou aba em segundo plano).
  const finish = () => {
    el.classList.remove('dealing');
    el.style.animationDelay = '';
  };
  el.addEventListener('animationend', finish, { once: true });
  setTimeout(finish, Math.max(0, delay) + DEAL_DUR_MS + 80);
}

function renderState(realState) {
  latestState = realState;               // sempre guarda o estado REAL do servidor
  const state = withOptimistic(realState); // e desenha com a minha jogada já aplicada
  const n = state.players.length;

  // placar: score[0]/score[1] -> mapeia pro meu time
  const myScore = state.score[myTeam];
  const oppScore = state.score[myTeam === 0 ? 1 : 0];
  document.getElementById('score-a').textContent = myScore;
  document.getElementById('score-b').textContent = oppScore;
  document.getElementById('stake-label').textContent = state.stakeLabel;

  // vira
  renderMiniCard(document.getElementById('vira-card'), state.vira);

  // nomes e cadeiras
  ['top', 'left', 'right', 'bottom'].forEach(pos => {
    const nameEl = document.getElementById(`name-${pos}`);
    if (nameEl && pos !== 'bottom') nameEl.textContent = '—';
  });

  for (const p of state.players) {
    const pos = seatOffsetLabel(p.seat, n);
    if (pos === 'bottom') {
      continue;
    }
    const seatEl = document.getElementById(`seat-${pos}`);
    const nameEl = document.getElementById(`name-${pos}`);
    const handEl = document.getElementById(`hand-${pos}`);
    const avatarEl = document.getElementById(`avatar-${pos}`);
    const isActive = state.turnSeat === p.seat;
    if (seatEl) seatEl.classList.toggle('active-seat', isActive);
    if (avatarEl) {
      const src = p.character || 'assets/personagem.svg';
      if (avatarEl.getAttribute('src') !== src) avatarEl.setAttribute('src', src);
    }
    // vitórias/derrotas do jogador (mostradas no card ao dar zoom no boneco)
    const figEl = document.getElementById(`figure-${pos}`);
    if (figEl) {
      if (p.stats) { figEl.dataset.wins = p.stats.wins; figEl.dataset.losses = p.stats.losses; }
      else { delete figEl.dataset.wins; delete figEl.dataset.losses; }
      // tema que o jogador está usando (o card mostra nome + miniatura)
      if (p.theme) figEl.dataset.theme = p.theme; else delete figEl.dataset.theme;
    }
    if (nameEl) {
      let label = p.name;
      if (n === 4 && p.team === myTeam) label += ' (parceiro)';
      nameEl.textContent = label;
      nameEl.classList.toggle('active-turn', isActive);
    }
    if (handEl) {
      // só recria os elementos quando a quantidade de cartas muda de fato —
      // se recriarmos sempre, o navegador nunca vê um estado "anterior"
      // pra animar a transição de deitada -> de pé.
      // Mão de 11: o servidor manda `peekHand` (cartas da minha dupla) só pra
      // quem pode ver, e só durante a janela de 10s. Aí as cartas aparecem
      // viradas pra cima; quando acaba, voltam a ser costas.
      const peekCards = Array.isArray(p.peekHand) && p.peekHand.length ? p.peekHand : null;
      const peekSig = peekCards ? peekCards.map(c => c.id).join(',') : '';
      if (handEl.dataset.peek !== peekSig || handEl.children.length !== p.cardsLeft) {
        handEl.dataset.peek = peekSig;
        handEl.classList.toggle('peeking', !!peekCards);
        handEl.innerHTML = '';
        if (peekCards) {
          peekCards.forEach(c => handEl.appendChild(buildCardEl(c, state.manilhaRank)));
        } else {
          for (let i = 0; i < p.cardsLeft; i++) {
            const back = document.createElement('div');
            back.className = 'card-back';
            handEl.appendChild(back);
          }
        }
      }
      handEl.classList.toggle('active-turn', isActive);
    }
  }
  document.getElementById('seat-top').style.visibility = n >= 2 ? 'visible' : 'hidden';
  document.getElementById('seat-left').style.visibility = n === 4 ? 'visible' : 'hidden';
  document.getElementById('seat-right').style.visibility = n === 4 ? 'visible' : 'hidden';

  // mesa (cartas jogadas) — cartas de rodadas anteriores do mesmo jogador
  // ficam sobrepostas (levemente deslocadas), e as recém-jogadas "voam"
  // da mão de quem jogou até a mesa, em vez de simplesmente aparecerem.
  const tableWrap = document.getElementById('table-cards');
  const newPlayStartIdx = (lastRenderedMao === state.maoNumber) ? lastRenderedTableLen : 0;
  lastRenderedMao = state.maoNumber;
  lastRenderedTableLen = state.table.length;

  tableWrap.innerHTML = '';
  const BASE_ROT = { top: -3, left: 4, right: -4, bottom: 2 };
  const stackCount = {};
  state.table.forEach((play, idx) => {
    const pos = seatOffsetLabel(play.seat, n);
    const sIdx = stackCount[pos] || 0;
    stackCount[pos] = sIdx + 1;
    const holder = document.createElement('div');
    holder.className = `played-card played-pos-${pos}`;
    const rot = (BASE_ROT[pos] || 0) + sIdx * 6;
    const dx = sIdx * 8;
    const dy = -sIdx * 8;
    const finalTransform = `rotate(${rot}deg) translate(${dx}px, ${dy}px)`;
    holder.style.transform = finalTransform;
    holder.style.zIndex = String(sIdx + 1);
    if (play.hidden) {
      const back = document.createElement('div');
      back.className = 'card facedown';
      holder.appendChild(back);
    } else {
      holder.appendChild(buildCardEl(play.card, state.manilhaRank));
    }
    tableWrap.appendChild(holder);

    if (idx >= newPlayStartIdx) {
      animatePlayedCard(holder, play, pos, finalTransform);
    }
  });

  // minha mão
  const me = state.players.find(p => p.seat === mySeat);
  const myAvatarEl = document.getElementById('avatar-bottom');
  if (myAvatarEl) {
    const mySrc = (me && me.character) || getSavedCharacter() || 'assets/personagem.svg';
    if (myAvatarEl.getAttribute('src') !== mySrc) myAvatarEl.setAttribute('src', mySrc);
  }
  // A mão NÃO é recriada a cada atualização: as cartas que continuam nela são
  // reaproveitadas (só trocam de classe) e só a carta jogada sai. Assim nada
  // pisca, o hover não reinicia e a animação de distribuir não é interrompida.
  const handWrap = document.getElementById('my-hand');
  const myCards = (me && me.hand) ? me.hand : [];
  if (handWrap.dataset.mao !== String(state.maoNumber)) { // mão nova: recomeça do zero
    handWrap.innerHTML = '';
    handWrap.dataset.mao = String(state.maoNumber);
  }
  const keepIds = new Set(myCards.map(c => String(c.id)));
  const existing = new Map();
  Array.from(handWrap.children).forEach(el => {
    if (keepIds.has(el.dataset.cardId)) existing.set(el.dataset.cardId, el);
    else el.remove();
  });
  const myTurnNow = state.turnSeat === mySeat && !state.pendingCall && !state.peek && !state.vote; // na mão de 11 ninguém joga durante a votação nem durante o peek
  myCards.forEach((card, i) => {
    let el = existing.get(String(card.id));
    if (!el) {
      el = buildCardEl(card, state.manilhaRank);
      applyDealAnimation(el, i);
      el.addEventListener('click', () => onCardClick(el._card, el._myTurn, el));
    }
    el._card = card;
    el._myTurn = myTurnNow;
    el.classList.toggle('manilha', card.rank === state.manilhaRank);
    el.classList.toggle('selected', card.id === selectedCardId);
    el.classList.toggle('disabled', !myTurnNow);
    if (handWrap.children[i] !== el) handWrap.insertBefore(el, handWrap.children[i] || null);
  });

  // contagem dos 10s da mão de 11
  updatePeekTimer(state);
  updateVoteUI(state);

  // botões de ação
  updateActionButtons(state);

  // pedido pendente
  updateCallOverlay(state);
}

// ------------------------------------------------------------------
// Mão de 11: votação "às cegas" ou "normal" (só a dupla de 11 vê e vota)
// ------------------------------------------------------------------
let voteEndsAt = 0, voteInterval = null;
function updateVoteUI(state) {
  const box = document.getElementById('vote-overlay');
  if (!box) return;
  const v = state.vote;
  if (!v || v.team !== myTeam) {
    clearInterval(voteInterval); voteInterval = null;
    box.classList.add('hidden');
    return;
  }
  voteEndsAt = Date.now() + Math.max(0, v.msLeft || 0);
  const secs = document.getElementById('vote-secs');
  const paint = () => { secs.textContent = Math.max(0, Math.ceil((voteEndsAt - Date.now()) / 1000)) + 's'; };
  paint();
  if (!voteInterval) voteInterval = setInterval(paint, 250);
  box.querySelectorAll('.vote-btn').forEach(b => b.classList.toggle('sent', b.dataset.choice === v.myVote));
  document.getElementById('vote-status').textContent = v.myVote === 'cegas'
    ? 'Você votou ÀS CEGAS. Esperando o seu parceiro…'
    : '';
  box.classList.remove('hidden');
}
document.querySelectorAll('#vote-overlay .vote-btn').forEach(btn => {
  btn.addEventListener('click', () => socket.emit('mao11_vote', { choice: btn.dataset.choice }));
});
socket.on('score_changed', ({ score }) => {
  setBanner('Placar alterado pelo administrador: ' + score[0] + ' x ' + score[1], 2600);
});
socket.on('mao11_result', ({ team, blind }) => {
  const mine = team === myTeam;
  if (blind) setBanner(mine ? 'Mão de 11: vocês jogam ÀS CEGAS!' : 'Mão de 11: a dupla adversária joga ÀS CEGAS!', 3000);
  else if (mine) setBanner('Mão de 11: normal — olhem as cartas da dupla!', 2400);
});

// ------------------------------------------------------------------
// Mão de 11: janela de 10s pra ver as cartas da dupla
// state.peek = { msLeft } enquanto a janela está aberta (só pra quem está
// na dupla com 11 pontos). Usamos "tempo restante" e não horário absoluto
// pra não depender do relógio do aparelho estar certo.
// ------------------------------------------------------------------
let peekEndsAt = 0, peekInterval = null;
function updatePeekTimer(state) {
  const el = document.getElementById('peek-timer');
  if (!el) return;
  if (state.vote && state.vote.team !== myTeam) { // adversário votando: só avisa
    peekEndsAt = Date.now() + Math.max(0, state.vote.msLeft || 0);
    const paintV = () => {
      const left = Math.max(0, Math.ceil((peekEndsAt - Date.now()) / 1000));
      el.innerHTML = '<b>Mão de 11</b> — a dupla adversária está votando: <span class="peek-secs">' + left + 's</span>';
    };
    paintV();
    el.classList.remove('hidden');
    clearInterval(peekInterval); peekInterval = setInterval(paintV, 250);
    return;
  }
  if (!state.peek) {
    clearInterval(peekInterval); peekInterval = null; peekEndsAt = 0;
    el.classList.add('hidden');
    return;
  }
  peekEndsAt = Date.now() + Math.max(0, state.peek.msLeft || 0);
  const peekMine = state.peek.team === myTeam;
  const paint = () => {
    const left = Math.max(0, Math.ceil((peekEndsAt - Date.now()) / 1000));
    el.innerHTML = '<b>Mão de 11</b> — ' + (peekMine
      ? 'olhem as cartas um do outro: '
      : 'a dupla adversária está vendo as cartas: ') + '<span class="peek-secs">' + left + 's</span>';
  };
  paint();
  el.classList.remove('hidden');
  if (!peekInterval) peekInterval = setInterval(paint, 250);
}

// Anima a carta "voando" da mão de quem jogou até a posição final na mesa
// (técnica FLIP: parte da posição de origem e transiciona até o destino real).
function animatePlayedCard(holder, play, pos, finalTransform) {
  // som da carta batendo na mesa, no momento em que ela chega (a minha voa mais rápido)
  if (window.GameAudio) GameAudio.cardPlay(play.seat === mySeat ? 0.11 : 0.25);
  let originRect = null;
  let fromMe = false;

  if (play.seat === mySeat && pendingPlayOrigin && play.card && pendingPlayOrigin.cardId === play.card.id) {
    originRect = pendingPlayOrigin.rect;
    pendingPlayOrigin = null;
    fromMe = true;
  } else if (pos === 'bottom') {
    const myHandEl = document.getElementById('my-hand');
    if (myHandEl) originRect = myHandEl.getBoundingClientRect();
  } else {
    const srcEl = document.getElementById(`hand-${pos}`);
    if (srcEl) originRect = srcEl.getBoundingClientRect();
  }

  if (!originRect) return;

  const destRect = holder.getBoundingClientRect();
  const ox = (originRect.left + originRect.width / 2) - (destRect.left + destRect.width / 2);
  const oy = (originRect.top + originRect.height / 2) - (destRect.top + destRect.height / 2);

  holder.style.transition = 'none';
  holder.style.opacity = '0.5';
  holder.style.transform = `translate(${ox}px, ${oy}px) scale(0.62) ${finalTransform}`;
  // força o navegador a aplicar o estado inicial antes de animar até o final
  void holder.offsetWidth;
  // minha carta voa rápido (sensação de instantâneo); a dos outros mantém a animação normal
  holder.style.transition = fromMe
    ? 'transform .15s cubic-bezier(.22,.75,.32,1), opacity .12s ease'
    : 'transform .32s cubic-bezier(.22,.75,.32,1), opacity .28s ease';
  holder.style.transform = finalTransform;
  holder.style.opacity = '1';
}

function renderMiniCard(el, card) {
  if (!card) { el.textContent = ''; return; }
  el.className = 'mini-card ' + (SUIT_COLOR[card.suit] || '') + ' suit-' + card.suit;
  el.innerHTML = `${card.rank}<span style="font-size:.9em">${SUIT_SYMBOLS[card.suit]}</span>`;
}

function buildCardEl(card, manilhaRank) {
  const el = document.createElement('div');
  if (card.blind) { // mão de 11 às cegas: carta virada pra mim (só tenho o id)
    el.className = 'card blind';
    el.innerHTML = '<div class="card-face"><div class="rank">?</div></div>';
    el.dataset.cardId = card.id;
    return el;
  }
  el.className = 'card ' + (SUIT_COLOR[card.suit] || '') + ' suit-' + card.suit;
  if (card.rank === manilhaRank) el.classList.add('manilha');
  const symbol = SUIT_SYMBOLS[card.suit];
  el.innerHTML = `
    <div class="card-corner corner-tl"><span>${card.rank}</span>${symbol}</div>
    <div class="card-face">
      <div class="rank">${card.rank}</div>
      <div class="suit">${symbol}</div>
    </div>
    <div class="card-corner corner-br"><span>${card.rank}</span>${symbol}</div>
  `;
  el.dataset.cardId = card.id;
  return el;
}

function onCardClick(card, isMyTurn, el) {
  if (!isMyTurn || optimisticPlay) return; // já tem uma jogada minha aguardando o servidor
  // um clique já joga a carta
  selectedCardId = card.id;
  if (el) {
    pendingPlayOrigin = { cardId: card.id, rect: el.getBoundingClientRect() };
  }
  playSelectedCard();
}

// ------------------------------------------------------------------
// Jogada otimista (instantânea pra quem joga)
// ------------------------------------------------------------------
function startOptimisticPlay(cardId, hidden) {
  if (!latestState) return;
  clearOptimistic();
  optimisticPlay = { cardId, hidden: !!hidden, mao: latestState.maoNumber, timer: null };
  // segurança: se o servidor nunca responder, desfaz a jogada local
  optimisticPlay.timer = setTimeout(rollbackOptimistic, 8000);
  renderState(latestState); // redesenha já com a carta na mesa
}

function clearOptimistic() {
  if (optimisticPlay && optimisticPlay.timer) clearTimeout(optimisticPlay.timer);
  optimisticPlay = null;
}

// Servidor recusou (ou não respondeu): devolve a carta pra minha mão.
function rollbackOptimistic() {
  if (!optimisticPlay) return;
  clearOptimistic();
  pendingPlayOrigin = null;
  if (latestState) renderState(latestState);
}

// Devolve uma cópia do estado com a minha jogada pendente já aplicada
// (carta some da mão, aparece na mesa). Assim que o servidor confirma —
// a carta some da mão no estado real — a jogada local é descartada.
function withOptimistic(state) {
  const op = optimisticPlay;
  if (!op) return state;
  const me = state.players.find(p => p.seat === mySeat);
  const card = me && me.hand ? me.hand.find(c => c.id === op.cardId) : null;
  if (state.maoNumber !== op.mao || !card) { // confirmada pelo servidor (ou mão mudou)
    clearOptimistic();
    return state;
  }
  return Object.assign({}, state, {
    turnSeat: null, // enquanto aguarda: nada clicável e sem botões de ação
    table: state.table.concat([{ seat: mySeat, card, hidden: op.hidden }]),
    players: state.players.map(p => p.seat === mySeat
      ? Object.assign({}, p, { hand: p.hand.filter(x => x.id !== op.cardId) })
      : p)
  });
}

// Primeira rodada da mão = eu ainda não joguei nenhuma carta (mão cheia, 3 cartas).
// Nela não pode esconder a carta.
function isFirstRound(state) {
  const me = state && state.players ? state.players.find(p => p.seat === mySeat) : null;
  return !!(me && me.hand && me.hand.length >= 3);
}

function playSelectedCard() {
  if (!selectedCardId) return;
  const cardId = selectedCardId;
  const hidden = esconderAtivo && !isFirstRound(latestState);
  socket.emit('play_card', { cardId, hidden }); // manda pro servidor...
  const myP = latestState && latestState.players.find(p => p.seat === mySeat);
  const myC = myP && myP.hand ? myP.hand.find(x => x.id === cardId) : null;
  if (!(myC && myC.blind)) startOptimisticPlay(cardId, hidden); // às cegas: não sei qual carta é, espera o servidor
  selectedCardId = null;
  esconderAtivo = false;
  document.getElementById('btn-esconder').classList.remove('esconder-active');
}

document.getElementById('btn-esconder').addEventListener('click', () => {
  if (isFirstRound(latestState)) return; // não pode esconder na 1ª rodada
  esconderAtivo = !esconderAtivo;
  document.getElementById('btn-esconder').classList.toggle('esconder-active', esconderAtivo);
});

// ------------------------------------------------------------------
// Botões de truco / fugir
// ------------------------------------------------------------------
function updateActionButtons(state) {
  const isMyTurn = state.turnSeat === mySeat;
  const canCall = isMyTurn && !state.pendingCall && !state.gameOver;
  const nextLevelByStake = { 1: 'truco', 3: 'seis', 6: 'nove', 9: 'doze' };
  const nextLevel = nextLevelByStake[state.stake];

  const btnTruco = document.getElementById('btn-truco');
  if (nextLevel) {
    btnTruco.textContent = nextLevel.toUpperCase();
    btnTruco.dataset.level = nextLevel;
    btnTruco.disabled = !canCall;
  } else {
    btnTruco.disabled = true;
  }

  document.getElementById('btn-correr').disabled = !isMyTurn || !!state.pendingCall || state.gameOver;
  const btnEsconder = document.getElementById('btn-esconder');
  const firstRound = isFirstRound(state);
  btnEsconder.disabled = !isMyTurn || !!state.pendingCall || state.gameOver || firstRound;
  btnEsconder.title = firstRound ? 'Não é possível esconder a carta na primeira rodada' : '';
  if (firstRound && esconderAtivo) { // desliga o "esconder" que ficou marcado
    esconderAtivo = false;
    btnEsconder.classList.remove('esconder-active');
  }
}

document.getElementById('btn-truco').addEventListener('click', () => {
  const level = document.getElementById('btn-truco').dataset.level;
  if (!level) return;
  socket.emit('call_truco', { level });
});

document.getElementById('btn-correr').addEventListener('click', () => {
  socket.emit('run_away');
});

// ------------------------------------------------------------------
// Sair da sala
// ------------------------------------------------------------------
(function () {
  const modal = document.getElementById('exit-modal');
  const open = () => { modal.classList.remove('hidden'); document.getElementById('exit-modal-stay').focus(); };
  const close = () => modal.classList.add('hidden');

  // menu da logo (Configurações / Sair)
  const logoMenu = document.getElementById('logo-menu');
  const trigger = document.getElementById('btn-logo-menu');
  const list = document.getElementById('logo-menu-list');
  const setMenu = (show) => {
    list.classList.toggle('hidden', !show);
    trigger.setAttribute('aria-expanded', show ? 'true' : 'false');
  };
  trigger.addEventListener('click', () => setMenu(list.classList.contains('hidden')));
  document.addEventListener('click', (e) => { if (!logoMenu.contains(e.target)) setMenu(false); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') setMenu(false); });
  document.getElementById('btn-menu-settings').addEventListener('click', () => {
    setMenu(false);
    if (window.openSettings) window.openSettings();
  });

  document.getElementById('btn-exit-room').addEventListener('click', () => { setMenu(false); open(); });
  document.getElementById('exit-modal-stay').addEventListener('click', close);
  document.getElementById('exit-modal-leave').addEventListener('click', () => { close(); leaveToLobby(); });
  // clicar fora da caixinha ou apertar Esc também cancela
  modal.addEventListener('click', (e) => { if (e.target === modal) close(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !modal.classList.contains('hidden')) close(); });
})();

// ------------------------------------------------------------------
// Overlay de pedido pendente (truco/aceitar/fugir/aumentar)
// ------------------------------------------------------------------
function updateCallOverlay(state) {
  const overlay = document.getElementById('call-overlay');
  const pc = state.pendingCall;
  if (!pc) { overlay.classList.add('hidden'); updatePartnerSignals(state, null); return; }

  const teamResponds = myTeam === pc.respondingTeam;
  if (!teamResponds) {
    overlay.classList.add('hidden');
    updatePartnerSignals(state, null);
    setBanner(`Aguardando resposta do adversário… (${pc.level.toUpperCase()})`);
    return;
  }

  // Só o jogador pedido (adversário à direita de quem pediu) responde.
  // O parceiro dele só pode mandar sinal.
  const iAmResponder = pc.respondingSeat === undefined || pc.respondingSeat === mySeat;
  const partner = state.players.find(p => p.team === myTeam && p.seat !== mySeat);
  const humanPartner = state.players.length === 4 && !!partner && !partner.isBot;
  const buttons = overlay.querySelector('.call-buttons');

  overlay.classList.remove('hidden');
  buttons.style.display = iAmResponder ? '' : 'none';

  if (iAmResponder) {
    document.getElementById('call-text').textContent =
      `Pediram ${pc.level.toUpperCase()}! Valendo ${pc.value} pontos. O que você faz?`;
    const nextValue = { 3: 6, 6: 9, 9: 12 }[pc.value];
    document.getElementById('btn-aumentar-resp').style.display = nextValue ? '' : 'none';
    updatePartnerSignals(state, humanPartner ? 'receive' : null);
  } else {
    const who = state.players.find(p => p.seat === pc.respondingSeat);
    document.getElementById('call-text').textContent =
      `Pediram ${pc.level.toUpperCase()} pra ${who ? who.name : 'seu parceiro'}! Só ele responde: dê um sinal.`;
    updatePartnerSignals(state, humanPartner ? 'send' : null);
  }
}

// Sinais pro parceiro: "Vamos!", "Não vamos..." e "Tenho alguma coisa".
// mode: 'send' (parceiro do jogador pedido: escolhe o sinal), 'receive'
// (jogador pedido: só vê o sinal) ou null (escondido; também no bot/1v1).
let signalCallKey = null;
function updatePartnerSignals(state, mode) {
  const box = document.getElementById('partner-signals');
  if (!box) return;
  const pc = state.pendingCall;
  box.classList.toggle('hidden', !mode);
  document.getElementById('ps-send').style.display = mode === 'send' ? '' : 'none';
  const key = pc ? pc.level + ':' + pc.callingTeam + ':' + pc.callingSeat : null;
  if (key !== signalCallKey) { // pedido novo (ou acabou): limpa escolha e mensagem
    signalCallKey = key;
    box.querySelectorAll('.ps-btn').forEach(b => b.classList.remove('sent'));
    document.getElementById('partner-signal-msg').textContent = '';
  }
}
document.querySelectorAll('#partner-signals .ps-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#partner-signals .ps-btn').forEach(b => b.classList.toggle('sent', b === btn));
    socket.emit('partner_signal', { signal: btn.dataset.signal });
  });
});
socket.on('partner_signal', ({ text, name }) => {
  const el = document.getElementById('partner-signal-msg');
  if (!el) return;
  el.textContent = name + ': ' + text;
  el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop');
});

document.getElementById('btn-aceitar').addEventListener('click', () => {
  socket.emit('respond_truco', { action: 'aceitar' });
});
document.getElementById('btn-fugir').addEventListener('click', () => {
  socket.emit('respond_truco', { action: 'fugir' });
});
document.getElementById('btn-aumentar-resp').addEventListener('click', () => {
  socket.emit('respond_truco', { action: 'aumentar' });
});

// ------------------------------------------------------------------
// Eventos de jogo (banners / resultados)
// ------------------------------------------------------------------
let bannerTimer = null;
function setBanner(text, holdMs = 2600) {
  const el = document.getElementById('banner');
  clearTimeout(bannerTimer);
  if (!text) {
    el.classList.remove('show');
    return;
  }
  el.textContent = text;
  el.classList.add('show');
  bannerTimer = setTimeout(() => {
    el.classList.remove('show');
  }, holdMs);
}

socket.on('call_announced', ({ byTeam, byName, level, value }) => {
  const mine = byTeam === myTeam;
  setBanner(`${byName} pediu ${level.toUpperCase()}! (valendo ${value})`);
});

socket.on('call_response', ({ action, byName }) => {
  const label = action === 'aceitar' ? 'aceitou' : action === 'fugir' ? 'fugiu' : 'aumentou';
  setBanner(`${byName} ${label}!`);
});

socket.on('trick_result', ({ winnerSeat, winnerTeam, tie }) => {
  if (tie) { setBanner('Rodada empatada!'); return; }
  const mine = winnerTeam === myTeam;
  setBanner(mine ? 'Vocês ganharam a rodada!' : 'Eles ganharam a rodada.');
});

socket.on('melou', () => {
  setBanner('MELOU! Cada um mostra a maior carta da mão…', 1800);
});

socket.on('showdown_result', ({ winnerTeam }) => {
  const mine = winnerTeam === myTeam;
  setBanner(mine ? 'Vocês têm a maior carta!' : 'Eles têm a maior carta!', 2000);
});

socket.on('mao_result', ({ winnerTeam, points, teamName, ran }) => {
  const mine = winnerTeam === myTeam;
  setBanner(`${mine ? 'Vocês' : 'Eles'} ${ran ? 'ganharam por fuga' : 'venceram a mão'}: +${points} pontos!`);
});

socket.on('game_over', ({ winnerTeam, score }) => {
  const mine = winnerTeam === myTeam;
  if (window.TruStats && !statsCounted) {
    statsCounted = true; // garante que a partida só conta uma vez
    if (mine) TruStats.addWin(); else TruStats.addLoss();
  }
  document.getElementById('gameover-title').innerHTML = mine ? ICON('trophy') + ' Vocês venceram!' : 'Vocês perderam';
  document.getElementById('gameover-sub').textContent = `Placar final: ${score[0]} x ${score[1]}`;
  setTimeout(() => showScreen('screen-gameover'), 400);
  // depois de alguns segundos todo mundo volta sozinho pra sala de espera
  clearTimeout(backToRoomTimer);
  backToRoomTimer = setTimeout(goBackToRoom, 6500);
});

// O servidor mantém a sala (mesmo código, duplas e bots) e manda a gente de volta.
let backToRoomTimer = null;
socket.on('back_to_room', ({ seat }) => {
  myWaitingSeat = seat;   // os assentos podem ter sido reorganizados
  mySeat = null;
  myTeam = null;
});
function goBackToRoom() {
  clearTimeout(backToRoomTimer);
  if (!myRoomCode) return leaveToLobby();
  if (window.GameAudio) GameAudio.setMatchStarted(false);
  const err = document.getElementById('waiting-error');
  if (err) err.textContent = '';
  showScreen('screen-waiting');
}
document.getElementById('btn-play-again').addEventListener('click', goBackToRoom);

socket.on('error_message', (msg) => {
  rollbackOptimistic();
  setBanner(msg);
});
socket.on('play_rejected', () => rollbackOptimistic());

// ------------------------------------------------------------------
// Chat
// ------------------------------------------------------------------
document.getElementById('btn-toggle-chat').addEventListener('click', () => {
  document.getElementById('chat-panel').classList.toggle('hidden');
});

document.getElementById('btn-send-chat').addEventListener('click', sendChat);
document.getElementById('chat-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') sendChat();
});
function sendChat() {
  const input = document.getElementById('chat-input');
  const text = input.value.trim();
  if (!text) return;
  socket.emit('chat_message', { text });
  input.value = '';
}

socket.on('chat_message', ({ name, text, seat }) => {
  const wrap = document.getElementById('chat-messages');
  const row = document.createElement('div');
  row.innerHTML = `<b>${escapeHtml(name)}:</b> ${escapeHtml(text)}`;
  wrap.appendChild(row);
  wrap.scrollTop = wrap.scrollHeight;
  if (seat !== undefined && seat !== null) showBubble(seat, text);
});

// ------------------------------------------------------------------
// Balão de fala sobre a cabeça de quem escreveu no chat
// ------------------------------------------------------------------
const bubbles = {}; // pos -> { el, timer } (um balão por jogador; o novo substitui o antigo)

function showBubble(seat, text) {
  const layer = document.getElementById('bubble-layer');
  if (!layer || mySeat === null || !latestState) return;
  const n = latestState.players.length;
  const pos = seatOffsetLabel(seat, n);
  if (!pos) return;

  if (bubbles[pos]) { clearTimeout(bubbles[pos].timer); bubbles[pos].el.remove(); }

  const el = document.createElement('div');
  el.className = 'speech-bubble';
  el.textContent = text;
  layer.appendChild(el);

  // âncora: o boneco (top/left/right) ou o topo da minha mão (bottom)
  const anchor = document.getElementById(pos === 'bottom' ? 'my-hand' : `figure-${pos}`);
  const r = anchor ? anchor.getBoundingClientRect() : { left: innerWidth / 2, right: innerWidth / 2, top: innerHeight / 2, bottom: innerHeight / 2, width: 0 };
  const bw = el.offsetWidth, bh = el.offsetHeight, m = 8;
  let x, y, side = 'above';
  if (pos === 'top') {                 // pouco espaço acima: balão ao lado da cabeça
    side = 'side';
    x = r.right + 12; y = r.top + 4;
    if (x + bw > innerWidth - m) { x = r.left - 12 - bw; el.classList.add('tail-right'); }
  } else {
    x = (r.left + r.right) / 2 - bw / 2;
    y = r.top - bh - 14;
  }
  x = Math.max(m, Math.min(x, innerWidth - bw - m));
  y = Math.max(m, Math.min(y, innerHeight - bh - m));
  el.classList.add(side);
  el.style.left = x + 'px';
  el.style.top = y + 'px';

  const ms = Math.min(9000, 3200 + text.length * 60);
  const timer = setTimeout(() => {
    el.classList.add('out');
    setTimeout(() => { el.remove(); if (bubbles[pos] && bubbles[pos].el === el) delete bubbles[pos]; }, 250);
  }, ms);
  bubbles[pos] = { el, timer };
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
