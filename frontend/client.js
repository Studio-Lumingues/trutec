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

// identificador do navegador (fica salvo): é o que impede um jogador expulso de voltar pra mesma sala
const CLIENT_ID = (function () {
  try {
    let id = localStorage.getItem('trutec-cid');
    if (!id || id.length < 12) {
      id = Array.from(crypto.getRandomValues(new Uint8Array(12))).map(b => b.toString(16).padStart(2, '0')).join('');
      localStorage.setItem('trutec-cid', id);
    }
    return id;
  } catch (e) { return ''; }
})();

const socket = io(RESOLVED_BACKEND_URL, {
  transports: ['websocket', 'polling'],
  // função: a cada (re)conexão pega o token de login mais novo (null = convidado)
  auth: (cb) => {
    // Se o login (Supabase) demorar mais de 4s, conecta mesmo assim e manda o token depois
    // (auth_refresh) — antes a conexão inteira ficava esperando o token.
    let sent = false;
    const send = (token) => { if (sent) return; sent = true; cb(token ? { clientId: CLIENT_ID, token } : { clientId: CLIENT_ID }); };
    const t = window.TruAccount ? TruAccount.getToken() : Promise.resolve(null);
    const late = setTimeout(() => send(null), 4000);
    t.then((token) => {
      clearTimeout(late);
      if (!sent) return send(token);
      if (token && socket.connected) socket.emit('auth_refresh', { token });   // chegou depois da conexão
    }).catch(() => { clearTimeout(late); send(null); });
  }
});

// Acorda o servidor (Render grátis dorme depois de ~15 min parado e leva ~1 min pra voltar).
// Pinga o /health assim que o site abre — enquanto a pessoa está no menu, ele já vai acordando —
// e a cada 4 min com a aba aberta, pra não voltar a dormir.
(function warmBackend() {
  const ping = () => { try { fetch(RESOLVED_BACKEND_URL + '/health', { mode: 'no-cors', cache: 'no-store' }).catch(() => {}); } catch (e) {} };
  ping();
  setInterval(() => { if (!document.hidden) ping(); }, 4 * 60 * 1000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden && !socket.connected) ping(); });
})();

socket.on('connect_error', (err) => {
  console.error('Falha ao conectar no backend:', err.message);
  lobbyErrorSafe(
    `Não foi possível conectar ao servidor (${RESOLVED_BACKEND_URL}). ` +
    `Verifique se a URL em config.js está correta e se o backend está no ar.`
  );
});


// Se a conexão cair e voltar (Render free, wifi, celular), o socket ganha um id
// novo e o servidor não sabe mais quem somos. Aqui retomamos o lugar na sala.
let rejoinHold = false; // true enquanto o botão "Reconectar" cuida da reconexão (evita pedido duplicado)
function tryRejoin(done) {
  if (typeof done !== 'function') done = null;
  if (!myRoomCode || !myToken) return done && done({ ok: false, error: 'Sessão não encontrada.' });
  socket.emit('rejoin_room', { code: myRoomCode, token: myToken }, (res) => {
    if (res && res.ok) { onRejoined(res); return done && done(res); }
    clearSession();
    if (done) return done(res || { ok: false });
    hideConnBar();
    alert((res && res.error ? res.error : 'Não foi possível voltar para a sala.') + ' Voltando ao início.');
    location.reload();
  });
}
socket.on('connect', () => { if (!rejoinHold) tryRejoin(); });
// música do SoundCloud da sala (comando `auth musica` do terminal; ver radio.js)
socket.on('room_music', (m) => { if (window.TruRadio) TruRadio.handle(m); });
// cursor de quem está escolhendo o vira (mostrado pros outros jogadores; ver updateViraPickUI)
socket.on('vira_cursor', (m) => handleViraCursor(m));
// um admin (`theme <id> @nome` no terminal) trocou o meu tema: vale só nesta sessão
socket.on('force_theme', (m) => {
  if (!m || !window.TruThemes || !TruThemes.applyTemp) return;
  const t = TruThemes.applyTemp(m.id);
  if (t && typeof setBanner === 'function' && latestState) setBanner('Tema alterado para ' + t.name, 2600);
});

function lobbyErrorSafe(msg) {
  const el = document.getElementById('lobby-error');
  if (el) el.textContent = msg;
}

// Avatar escurecido + círculo girando enquanto o jogador está sem conexão
function setSeatAway(figEl, away) {
  let ov = figEl.querySelector('.seat-away');
  if (!away) { if (ov) ov.remove(); return; }
  if (ov) return;
  ov = document.createElement('div');
  ov.className = 'seat-away';
  ov.setAttribute('aria-label', 'Jogador reconectando');
  ov.innerHTML = '<div class="game-intro-spinner"><svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
    '<path d="M50 12 A38 38 0 0 1 86 38" /><path d="M50 88 A38 38 0 0 1 14 62" /></svg></div>';
  figEl.appendChild(ov);
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
// RECONECTAR NA PARTIDA
// - A sessão (código da sala + token) fica salva no navegador. Se a aba fechar,
//   a página recarregar ou a internet cair, aparece "Reconectar" no lobby.
// - Se a conexão cair com a partida aberta, uma barrinha avisa e deixa
//   reconectar na hora (o socket.io também tenta sozinho).
// - O servidor mantém o lugar (no 2v2 um bot segura enquanto você volta).
// ------------------------------------------------------------------
const SESSION_KEY = 'trutec-session';
const SESSION_MAX_AGE = 30 * 60 * 1000; // depois disso a sala provavelmente já acabou
function saveSession() {
  if (!myRoomCode || !myToken) return;
  try { localStorage.setItem(SESSION_KEY, JSON.stringify({ code: myRoomCode, token: myToken, ts: Date.now() })); } catch (e) {}
}
function clearSession() { try { localStorage.removeItem(SESSION_KEY); } catch (e) {} }
function readSession() {
  try {
    const s = JSON.parse(localStorage.getItem(SESSION_KEY));
    if (!s || typeof s.code !== 'string' || typeof s.token !== 'string') return null;
    if (Date.now() - (+s.ts || 0) > SESSION_MAX_AGE) { clearSession(); return null; }
    return s;
  } catch (e) { return null; }
}
window.addEventListener('pagehide', saveSession); // renova o prazo quando a aba fecha

function onRejoined(res) {
  myWaitingSeat = res.seat;
  saveSession();
  hideConnBar();
  const offer = document.getElementById('reconnect-offer');
  if (offer) offer.remove();
  const lobby = document.getElementById('screen-lobby');
  if (!res.started && lobby && lobby.classList.contains('active')) showScreen('screen-waiting');
}

// ---- barra "Conexão perdida" (durante a sala/partida) ----
let connBar = null;
function showConnBar() {
  if (!connBar) {
    connBar = document.createElement('div');
    connBar.className = 'conn-bar';
    connBar.setAttribute('role', 'alert');
    connBar.innerHTML = '<span class="cb-text">Conexão perdida. Reconectando…</span><button type="button" class="cb-btn">Reconectar agora</button>';
    connBar.querySelector('.cb-btn').addEventListener('click', () => {
      connBar.querySelector('.cb-text').textContent = 'Reconectando…';
      if (!socket.connected) socket.connect(); else tryRejoin();
    });
    document.body.appendChild(connBar);
  }
  connBar.querySelector('.cb-text').textContent = 'Conexão perdida. Reconectando…';
  connBar.hidden = false;
}
function hideConnBar() { if (connBar) connBar.hidden = true; }
socket.on('disconnect', (reason) => {
  if (!myRoomCode) return;
  showConnBar();
  if (reason === 'io server disconnect') socket.connect(); // o servidor fechou: o socket.io não tenta sozinho
});
window.addEventListener('online', () => { if (myRoomCode && !socket.connected) socket.connect(); });

// ---- oferta de reconectar (ao abrir o site com uma sala salva) ----
// Antes de mostrar a oferta, pergunta ao servidor se a sala ainda existe.
// Se não existe (ou o lugar sumiu), apaga a sessão e não mostra nada.
function showReconnectOffer() {
  const s = readSession();
  if (!s || myRoomCode) return;
  let answered = false;
  const decide = (res) => {
    if (answered) return; answered = true;
    if (myRoomCode) return;                       // já entrou numa sala nesse meio tempo
    if (res && res.ok) return renderReconnectOffer(s);
    if (res && res.ok === false) clearSession();  // sala acabou: esquece
    // sem resposta (servidor antigo/dormindo): não mostra, mas mantém a sessão
  };
  const ask = () => socket.emit('check_session', { code: s.code, token: s.token }, decide);
  if (socket.connected) ask(); else { socket.connect(); socket.once('connect', ask); }
  setTimeout(() => decide(null), 20000);          // Render acordando: desiste de esperar
}
function renderReconnectOffer(s) {
  if (document.getElementById('reconnect-offer')) return;
  const box = document.createElement('div');
  box.id = 'reconnect-offer';
  box.className = 'reconnect-offer';
  box.innerHTML =
    '<div class="ro-text"><b>Você estava numa partida</b><span>Sala <em class="ro-code"></em></span></div>' +
    '<div class="ro-actions"><button type="button" class="ro-go">Reconectar</button>' +
    '<button type="button" class="ro-no" aria-label="Dispensar" title="Dispensar">✕</button></div>' +
    '<p class="ro-err" aria-live="polite"></p>';
  box.querySelector('.ro-code').textContent = s.code;
  const go = box.querySelector('.ro-go'), err = box.querySelector('.ro-err');
  box.querySelector('.ro-no').addEventListener('click', () => { clearSession(); box.remove(); });
  go.addEventListener('click', () => {
    go.disabled = true; go.textContent = 'Reconectando…'; err.textContent = '';
    myRoomCode = s.code; myToken = s.token;
    rejoinHold = true;
    let finished = false;
    const fail = (msg) => {
      if (finished) return; finished = true; rejoinHold = false;
      myRoomCode = null; myToken = null;
      err.textContent = msg; go.remove();   // timeout: mantém a sessão (o servidor pode só estar acordando)
    };
    const run = () => {
      clearTimeout(timer);
      rejoinHold = false;
      tryRejoin((res) => { finished = true; if (!(res && res.ok)) { rejoinHold = false; myRoomCode = null; myToken = null; err.textContent = (res && res.error) || 'Não foi possível voltar.'; go.remove(); clearSession(); setTimeout(() => box.remove(), 2500); } });
    };
    const timer = setTimeout(() => fail('O servidor não respondeu. Tente de novo em instantes.'), 15000);
    if (socket.connected) run(); else { socket.connect(); socket.once('connect', run); }
  });
  document.body.appendChild(box);
}
setTimeout(showReconnectOffer, 900);

// ------------------------------------------------------------------
// Navegação de telas
// ------------------------------------------------------------------
let waitingShownAt = 0;   // quando a sala de espera abriu (pra sincronizar a animação do código)
let lastRealLobby = null;  // último lobby que veio do servidor (base do bot instantâneo)
let knownSeats = null;     // assentos já vistos na sala (pra detectar quem acabou de entrar)
let shownRoomCode = null; // código que já está na tela (só anima quando muda)
function showScreen(id) {
  if (id === 'screen-waiting') waitingShownAt = performance.now();
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
// PAINEL: CRIAR AVATAR (desenhar em cima do boneco)
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
  const CHARACTER_BASE_COLOR = '#ff0042'; // cor original do svg do avatar
  const skinLightSlider = document.getElementById('character-skin-light');
  const skinColorPicker = document.getElementById('skin-color-picker');
  const skinPresetsWrap = document.getElementById('skin-presets');
  const tabButtons = document.querySelectorAll('.editor-tab-btn');
  const tabPanels = document.querySelectorAll('.editor-tab-panel');

  // Altura do card de ferramentas: ao trocar Desenho/Pele ele encolhe/cresce de
  // forma suave (mesmo esquema do card da sala: mede antes e depois e anima a altura).
  let toolbarResizeTimer = null;
  function smoothToolbarResize(change) {
    const bar = document.querySelector('#screen-character-editor .character-toolbar');
    const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!bar || reduced || !bar.offsetParent) return change();
    // a TELA (painel) não muda de tamanho: trava a altura do conjunto enquanto só o card anima
    const layout = document.querySelector('#screen-character-editor .character-editor-layout');
    if (layout && window.matchMedia('(min-width: 901px)').matches && !layout.style.minHeight) {
      layout.style.minHeight = layout.offsetHeight + 'px';
    }
    const from = bar.offsetHeight;
    clearTimeout(toolbarResizeTimer);
    bar.style.transition = 'none';
    bar.style.height = '';                              // altura natural pra medir
    bar.style.alignSelf = ''; bar.style.justifyContent = '';
    change();
    const to = bar.offsetHeight;
    if (Math.abs(to - from) < 2) { bar.style.overflow = ''; return; }
    bar.style.overflow = 'hidden';
    // durante a animação o card cresce/encolhe a partir do CENTRO e mantém o espaçamento
    // do Desenho; sem isso ele pulava do centro pro topo (e o conteúdo se reagrupava de
    // uma vez) na troca Pele <-> Desenho. Ao final, o CSS normal assume sem diferença visual.
    if (window.matchMedia('(min-width: 901px)').matches) {
      bar.style.alignSelf = 'center';
      bar.style.justifyContent = 'space-between';
    }
    bar.style.height = from + 'px';
    void bar.offsetHeight;                              // aplica o ponto de partida
    bar.style.transition = 'height .6s cubic-bezier(.22, 1, .36, 1)';
    bar.style.height = to + 'px';
    toolbarResizeTimer = setTimeout(() => {
      bar.style.transition = ''; bar.style.height = ''; bar.style.overflow = '';
      bar.style.alignSelf = ''; bar.style.justifyContent = '';
    }, 650);
  }

  // se a janela mudar de tamanho, destrava (a próxima troca de aba trava de novo)
  window.addEventListener('resize', () => {
    const l = document.querySelector('#screen-character-editor .character-editor-layout');
    if (l) l.style.minHeight = '';
  });

  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.classList.contains('active')) return;
      smoothToolbarResize(() => {
        tabButtons.forEach(b => b.classList.remove('active'));
        tabPanels.forEach(p => p.classList.remove('active'));
        btn.classList.add('active');
        const panel = document.querySelector(`.editor-tab-panel[data-tab-panel="${btn.dataset.tab}"]`);
        if (panel) panel.classList.add('active');
        const bar = document.querySelector('#screen-character-editor .character-toolbar');
        if (bar) bar.classList.toggle('is-pele', btn.dataset.tab === 'pele');   // Pele: card só encolhe; Desenho: igual ao quadrado
      });
    });
  });

  // O tom é { h, s, b } = hue-rotate(h graus) + saturate(s) + brightness(b).
  // Os tons naturais abaixo foram calculados pra cair em cores de pele reais
  // a partir do rosa original do boneco (#ff0042); `c` é a cor da bolinha.
  const SKIN_NATURAL = [
    { n: 'Porcelana',    c: '#ffe3d0', h: 48, s: 0.16, b: 3.8 },
    { n: 'Clara',        c: '#f8d2b6', h: 72, s: 0.16, b: 3.2 },
    { n: 'Bege',         c: '#f1c27d', h: 75, s: 0.36, b: 2.8 },
    { n: 'Dourada',      c: '#e0ac69', h: 75, s: 0.4,  b: 2.6 },
    { n: 'Morena clara', c: '#c68642', h: 75, s: 0.55, b: 2.1 },
    { n: 'Morena',       c: '#a8683a', h: 69, s: 0.5,  b: 1.65 },
    { n: 'Canela',       c: '#8d5524', h: 72, s: 0.6,  b: 1.35 },
    { n: 'Café',         c: '#6b3e26', h: 66, s: 0.45, b: 1.05 },
    { n: 'Escura',       c: '#4a2c1a', h: 66, s: 0.45, b: 0.7 },
    { n: 'Ébano',        c: '#2f1b10', h: 66, s: 0.45, b: 0.45 }
  ];
  const SKIN_FUN_DEGS = [0, 25, 55, 100, 150, 190, 230, 270, 310];
  let skin = { h: 0, s: 1, b: 1 };

  function skinFilter(k) {
    const p = [];
    if (k.h) p.push(`hue-rotate(${k.h}deg)`);
    if (k.s !== 1) p.push(`saturate(${k.s})`);
    if (k.b !== 1) p.push(`brightness(${k.b})`);
    return p.join(' ');
  }

  // Cor da bolinha de um tom "divertido" (só hue): canvas 1x1 com o mesmo filtro.
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

  // Aplica o tom num canvas (usa ctx.filter; se o navegador não suporta, faz
  // a mesma conta pixel a pixel).
  function drawSkinned(targetCtx, img, w, h, sk) {
    sk = sk || skin;
    const f = skinFilter(sk);
    if (!f) { targetCtx.drawImage(img, 0, 0, w, h); return; }
    if ('filter' in targetCtx) {
      targetCtx.filter = f;
      targetCtx.drawImage(img, 0, 0, w, h);
      targetCtx.filter = 'none';
      return;
    }
    const t = document.createElement('canvas'); t.width = w; t.height = h;
    const tc = t.getContext('2d');
    tc.drawImage(img, 0, 0, w, h);
    const id = tc.getImageData(0, 0, w, h), d = id.data;
    const a = sk.h * Math.PI / 180, co = Math.cos(a), si = Math.sin(a), sv = sk.s;
    const H = [
      0.213 + co * 0.787 - si * 0.213, 0.715 - co * 0.715 - si * 0.715, 0.072 - co * 0.072 + si * 0.928,
      0.213 - co * 0.213 + si * 0.143, 0.715 + co * 0.285 + si * 0.140, 0.072 - co * 0.072 - si * 0.283,
      0.213 - co * 0.213 - si * 0.787, 0.715 - co * 0.715 + si * 0.715, 0.072 + co * 0.928 + si * 0.072
    ];
    const S = [
      0.213 + 0.787 * sv, 0.715 - 0.715 * sv, 0.072 - 0.072 * sv,
      0.213 - 0.213 * sv, 0.715 + 0.285 * sv, 0.072 - 0.072 * sv,
      0.213 - 0.213 * sv, 0.715 - 0.715 * sv, 0.072 + 0.928 * sv
    ];
    const clamp = (v) => Math.min(255, Math.max(0, v));
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i], g = d[i + 1], bl = d[i + 2];
      const r1 = clamp(H[0] * r + H[1] * g + H[2] * bl), g1 = clamp(H[3] * r + H[4] * g + H[5] * bl), b1 = clamp(H[6] * r + H[7] * g + H[8] * bl);
      const r2 = clamp(S[0] * r1 + S[1] * g1 + S[2] * b1), g2 = clamp(S[3] * r1 + S[4] * g1 + S[5] * b1), b2 = clamp(S[6] * r1 + S[7] * g1 + S[8] * b1);
      d[i] = clamp(r2 * sk.b); d[i + 1] = clamp(g2 * sk.b); d[i + 2] = clamp(b2 * sk.b);
    }
    targetCtx.putImageData(id, 0, 0);
  }


  // ---- cor-alvo -> { h, s, b } ----
  // O boneco só tem 3 "botões" (matiz, saturação, brilho) aplicados sobre o rosa original.
  // Pra aceitar QUALQUER cor (roleta, ou a barra claro -> escuro), procuramos a combinação
  // h/s/b que mais se aproxima da cor pedida. O formato salvo/exportado continua o mesmo.
  const SKIN_BASE_RGB = [255, 0, 66];   // = CHARACTER_BASE_COLOR
  const SKIN_S_MAX = 2, SKIN_B_MAX = 5.5;
  const clamp255 = (v) => Math.min(255, Math.max(0, v));

  function hexToRgb(hex) {
    const m = /^#?([0-9a-f]{6})$/i.exec(String(hex).trim());
    if (!m) return [198, 134, 66];
    const n = parseInt(m[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function rgbToHex(c) {
    return '#' + c.map(v => Math.round(clamp255(v)).toString(16).padStart(2, '0')).join('');
  }

  // cor do boneco antes do brilho (matiz + saturação sobre o rosa original)
  function skinPreBright(h, s) {
    const a = h * Math.PI / 180, co = Math.cos(a), si = Math.sin(a);
    const r = SKIN_BASE_RGB[0], g = SKIN_BASE_RGB[1], bl = SKIN_BASE_RGB[2];
    const r1 = clamp255((0.213 + co * 0.787 - si * 0.213) * r + (0.715 - co * 0.715 - si * 0.715) * g + (0.072 - co * 0.072 + si * 0.928) * bl);
    const g1 = clamp255((0.213 - co * 0.213 + si * 0.143) * r + (0.715 + co * 0.285 + si * 0.140) * g + (0.072 - co * 0.072 - si * 0.283) * bl);
    const b1 = clamp255((0.213 - co * 0.213 - si * 0.787) * r + (0.715 - co * 0.715 + si * 0.715) * g + (0.072 + co * 0.928 + si * 0.072) * bl);
    return [
      clamp255((0.213 + 0.787 * s) * r1 + (0.715 - 0.715 * s) * g1 + (0.072 - 0.072 * s) * b1),
      clamp255((0.213 - 0.213 * s) * r1 + (0.715 + 0.285 * s) * g1 + (0.072 - 0.072 * s) * b1),
      clamp255((0.213 - 0.213 * s) * r1 + (0.715 - 0.715 * s) * g1 + (0.072 + 0.928 * s) * b1)
    ];
  }
  function skinRGB(k) {
    const c = skinPreBright(k.h, k.s);
    return [clamp255(c[0] * k.b), clamp255(c[1] * k.b), clamp255(c[2] * k.b)];
  }

  function fitSkin(t, hint) {
    hint = hint || { h: 0, s: 1, b: 1 };
    let best = null;
    function tryHS(h, s) {
      const c = skinPreBright(h, s);
      const cc = c[0] * c[0] + c[1] * c[1] + c[2] * c[2];
      let b = cc > 0 ? (c[0] * t[0] + c[1] * t[1] + c[2] * t[2]) / cc : 0;
      b = Math.min(SKIN_B_MAX, Math.max(0, b));
      let e = 0;
      for (let i = 0; i < 3; i++) { const d = clamp255(c[i] * b) - t[i]; e += d * d; }
      // desempate: prefere ficar perto do tom atual (a barra não "pula" de matiz à toa)
      let dh = Math.abs(h - hint.h); if (dh > 180) dh = 360 - dh;
      e += 0.0005 * dh * dh + 20 * (s - hint.s) * (s - hint.s);
      if (!best || e < best.e) best = { e, h, s, b };
    }
    for (let h = 0; h < 360; h += 2) for (let s = 0; s <= SKIN_S_MAX + 1e-9; s += 0.05) tryHS(h, s);
    // refina em volta do melhor
    const c0 = { h: best.h, s: best.s };
    for (let h = c0.h - 2; h <= c0.h + 2; h += 0.25) {
      for (let s = Math.max(0, c0.s - 0.05); s <= Math.min(SKIN_S_MAX, c0.s + 0.05); s += 0.005) tryHS(((h % 360) + 360) % 360, s);
    }
    return { h: Math.round(best.h * 10) / 10, s: Math.round(best.s * 1000) / 1000, b: Math.round(best.b * 1000) / 1000 };
  }

  // ---- barra "mais claro -> mais escuro" em cima da cor-base escolhida ----
  // esquerda = branco, meio = a cor escolhida, direita = preto
  let skinBase = skinRGB({ h: 0, s: 1, b: 1 });
  function mixRGB(a, b, t) { return a.map((v, i) => v + (b[i] - v) * t); }
  function paintSkinSlider() {
    skinLightSlider.style.setProperty('--skin-base', rgbToHex(skinBase));
  }
  function setSkinBase(rgb) {
    skinBase = rgb;
    skinLightSlider.value = 50;
    paintSkinSlider();
  }

  function setSkin(k, keepBase) {
    skin = { h: k.h || 0, s: k.s === undefined ? 1 : k.s, b: k.b === undefined ? 1 : k.b };
    const f = skinFilter(skin);
    characterBase.style.filter = (f ? f + ' ' : '') + 'url(#boil-lg)'; // boil-lg = tremida animada (boil.js)
    document.querySelectorAll('.skin-preset').forEach(btn => {
      btn.classList.toggle('active',
        Number(btn.dataset.h) === skin.h && Number(btn.dataset.s) === skin.s && Number(btn.dataset.b) === skin.b);
    });
    if (!keepBase) {                        // veio de bolinha/salvo/importado: a barra passa a girar em torno desse tom
      setSkinBase(skinRGB(skin));
      skinColorPicker.classList.remove('active');
    }
  }

  function addPreset(wrap, k, color, title) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'skin-preset';
    btn.dataset.h = String(k.h); btn.dataset.s = String(k.s); btn.dataset.b = String(k.b);
    btn.style.background = color;
    btn.title = title;
    btn.setAttribute('aria-label', title);
    btn.addEventListener('click', () => setSkin(k));
    wrap.appendChild(btn);
  }
  SKIN_NATURAL.forEach(t => addPreset(skinPresetsWrap, t, t.c, t.n));
  SKIN_FUN_DEGS.forEach(deg => addPreset(skinPresetsWrap, { h: deg, s: 1, b: 1 }, hueRotatedColor(deg), deg === 0 ? 'Rosa original' : `Cor ${deg}°`));

  // roleta de cores: qualquer cor vira o novo tom-base
  skinPresetsWrap.appendChild(skinColorPicker);   // fica por último na fileira de bolinhas
  skinColorPicker.addEventListener('input', () => {
    const rgb = hexToRgb(skinColorPicker.value);
    setSkin(fitSkin(rgb, skin), true);
    setSkinBase(rgb);
    skinColorPicker.style.setProperty('--picked', skinColorPicker.value);
    skinColorPicker.classList.add('active');
  });

  // barra: 0 = o mais claro possível (branco), 50 = o tom escolhido, 100 = o mais escuro (preto)
  skinLightSlider.addEventListener('input', () => {
    const t = Number(skinLightSlider.value) / 50;       // 0..2
    const target = t <= 1 ? mixRGB([255, 255, 255], skinBase, t) : mixRGB(skinBase, [0, 0, 0], t - 1);
    setSkin(fitSkin(target, skin), true);
  });

  setSkin({ h: 0, s: 1, b: 1 });
  try {
    const savedSkin = localStorage.getItem('trutec_personagem_skin');
    if (savedSkin) setSkin(JSON.parse(savedSkin));
    else {
      const savedHue = localStorage.getItem('trutec_personagem_hue'); // formato antigo
      if (savedHue !== null) setSkin({ h: Number(savedHue), s: 1, b: 1 });
    }
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

  function setColor(c) {
    currentColor = c;
    colorPicker.value = c;
    let matched = false;
    document.querySelectorAll('.color-swatch').forEach(b => {
      const on = (b.dataset.color || '').toLowerCase() === String(c).toLowerCase();
      if (on) matched = true;
      b.classList.toggle('active', on);
    });
    // cor personalizada: o botão do seletor mostra a cor escolhida no centro
    colorPicker.classList.toggle('active', !matched);
    if (!matched) colorPicker.style.setProperty('--picked', c);
    if (currentTool === 'eraser') {            // escolher cor volta pra caneta
      currentTool = 'pen';
      btnPen.classList.add('active');
      btnEraser.classList.remove('active');
    }
  }
  document.querySelectorAll('.color-swatch').forEach(btn => {
    btn.addEventListener('click', () => setColor(btn.dataset.color));
  });

  colorPicker.addEventListener('input', () => setColor(colorPicker.value));

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

  // ------------------------------------------------------------------
  // COLEÇÃO: 3 espaços de avatar.
  // Cada espaço guarda { img: avatar pronto (PNG), draw: só o desenho, skin }.
  // O espaço "equipado" é o que aparece nas partidas (e fica também em
  // 'trutec_meu_personagem', que o resto do site já lê).
  // ------------------------------------------------------------------
  const SLOTS_KEY = 'trutec_avatar_slots';
  const ACTIVE_KEY = 'trutec_avatar_active';
  const SLOT_COUNT = 3;
  const slotsWrap = document.getElementById('avatar-slots');
  const slotModal = document.getElementById('slot-modal');
  const slotPick = document.getElementById('slot-pick');
  const slotCancel = document.getElementById('slot-cancel');
  const DEFAULT_SKIN = { h: 0, s: 1, b: 1 };
  let slots = [];
  let activeSlot = -1;     // equipado (usado nas partidas)
  let editingSlot = -1;    // o que está carregado no editor agora
  let pendingSave = null;  // { img, draw, skin } esperando a escolha do espaço

  function readSlots() {
    let arr = null;
    try { arr = JSON.parse(localStorage.getItem(SLOTS_KEY)); } catch (e) {}
    if (!Array.isArray(arr)) {
      arr = [];
      // migra o avatar antigo (um só) pro espaço 1
      try {
        const old = localStorage.getItem('trutec_meu_personagem');
        if (old) {
          let sk = DEFAULT_SKIN;
          try { sk = JSON.parse(localStorage.getItem('trutec_personagem_skin')) || DEFAULT_SKIN; } catch (e) {}
          arr[0] = { img: old, draw: null, skin: sk };
          localStorage.setItem(ACTIVE_KEY, '0');
        }
      } catch (e) {}
    }
    const out = [];
    for (let i = 0; i < SLOT_COUNT; i++) {
      const it = arr[i];
      out.push(it && typeof it.img === 'string' ? it : null);
    }
    return out;
  }
  function writeSlots() {
    try { localStorage.setItem(SLOTS_KEY, JSON.stringify(slots)); if (window.TruAccount) TruAccount.syncCharacter(); return true; }
    catch (e) { console.warn('Não foi possível salvar a coleção:', e); return false; }
  }

  function flash(txt, ms = 3500) {
    saveMsg.textContent = txt;
    setTimeout(() => { if (saveMsg.textContent === txt) saveMsg.textContent = ''; }, ms);
  }

  // Deixa este avatar como o "equipado": guarda, atualiza a prévia e manda pro servidor (se já está numa sala).
  function applyActive(dataUrl, okMsg) {
    try { localStorage.setItem('trutec_meu_personagem', dataUrl); } catch (e) { console.warn('localStorage:', e); }
    const previewImg = document.getElementById('character-preview-img');
    if (previewImg) previewImg.src = dataUrl;
    if (!myRoomCode) return flash(okMsg);
    if (!socket.connected) return flash('Sem conexão com o servidor. Aguarde reconectar e salve de novo.', 5000);
    saveMsg.textContent = 'Salvando…';
    socket.timeout(6000).emit('update_character', { character: dataUrl }, (err, res) => {
      if (err) return flash('O servidor não respondeu. Ele pode estar acordando ou desatualizado — tente de novo.', 6000);
      if (!res || !res.ok) return flash('Erro ao salvar: ' + ((res && res.error) || 'desconhecido'), 6000);
      flash(okMsg);
    });
  }

  function setActive(i) {
    activeSlot = i;
    try { localStorage.setItem(ACTIVE_KEY, String(i)); } catch (e) {}
  }

  function renderSlots() {
    slotsWrap.innerHTML = '';
    for (let i = 0; i < SLOT_COUNT; i++) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'avatar-slot' + (slots[i] ? '' : ' empty') + (i === activeSlot ? ' active' : '') + (i === editingSlot ? ' editing' : '');
      b.setAttribute('aria-label', `Avatar ${i + 1}` + (slots[i] ? (i === activeSlot ? ' (em uso)' : '') : ' (vazio)'));
      b.title = slots[i] ? (i === activeSlot ? `Avatar ${i + 1} (em uso)` : `Usar e editar o avatar ${i + 1}`) : `Espaço ${i + 1} vazio: começar um avatar novo`;
      if (slots[i]) { const im = document.createElement('img'); im.src = slots[i].img; im.alt = ''; im.draggable = false; b.appendChild(im); }
      else b.textContent = '+';
      const n = document.createElement('span'); n.className = 'slot-num'; n.textContent = String(i + 1);
      b.appendChild(n);
      b.addEventListener('click', () => onSlotClick(i));
      slotsWrap.appendChild(b);
    }
  }

  function loadDrawing(dataUrl) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!dataUrl) return;
    const im = new Image();
    im.onload = () => { ctx.globalCompositeOperation = 'source-over'; ctx.drawImage(im, 0, 0, canvas.width, canvas.height); };
    im.src = dataUrl;
  }

  function onSlotClick(i) {
    undoStack.length = 0;
    editingSlot = i;
    const it = slots[i];
    if (it && !it.draw) {          // importado/antigo: não dá pra reabrir o desenho, só usar
      setActive(i);
      applyActive(it.img, `Avatar ${i + 1} em uso! (esse não dá pra editar; comece um novo se quiser mudar)`);
    } else if (it) {
      setSkin(it.skin || DEFAULT_SKIN);
      loadDrawing(it.draw);
      setActive(i);
      applyActive(it.img, `Avatar ${i + 1} em uso!`);
    } else {                       // espaço vazio: começa um avatar novo
      setSkin(DEFAULT_SKIN);
      loadDrawing(null);
      flash('Avatar novo. Desenhe e clique em salvar.');
    }
    renderSlots();
  }

  // ---- escolher onde salvar ----
  function openSlotModal() {
    slotPick.innerHTML = '';
    for (let i = 0; i < SLOT_COUNT; i++) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'slot-choice' + (slots[i] ? '' : ' empty');
      const thumb = document.createElement('span'); thumb.className = 'slot-thumb';
      if (slots[i]) { const im = document.createElement('img'); im.src = slots[i].img; im.alt = ''; im.draggable = false; thumb.appendChild(im); }
      else thumb.textContent = '+';
      const lab = document.createElement('span'); lab.className = 'slot-label';
      lab.textContent = `Espaço ${i + 1}` + (slots[i] ? ' · substituir' : ' · vazio');
      b.appendChild(thumb); b.appendChild(lab);
      b.addEventListener('click', () => doSave(i));
      slotPick.appendChild(b);
    }
    slotModal.classList.remove('hidden');
    const first = slotPick.querySelector('.slot-choice'); if (first) first.focus();
  }
  function closeSlotModal() { slotModal.classList.add('hidden'); pendingSave = null; btnSave.focus(); }
  slotCancel.addEventListener('click', closeSlotModal);
  slotModal.addEventListener('click', (e) => { if (e.target === slotModal) closeSlotModal(); });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !slotModal.classList.contains('hidden')) closeSlotModal();
  });

  function doSave(i) {
    if (!pendingSave) return closeSlotModal();
    const prev = slots[i];
    slots[i] = { img: pendingSave.img, draw: pendingSave.draw, skin: pendingSave.skin };
    if (!writeSlots()) {            // sem espaço no navegador: desfaz
      slots[i] = prev;
      slotModal.classList.add('hidden'); pendingSave = null;
      return flash('Não deu pra salvar: o armazenamento do navegador está cheio.', 6000);
    }
    const it = pendingSave;
    slotModal.classList.add('hidden'); pendingSave = null;
    editingSlot = i;
    setActive(i);
    try { localStorage.setItem('trutec_personagem_skin', JSON.stringify(it.skin)); } catch (e) {}
    if (it.imported) {              // avatar vindo de um código: mostra no editor também (editável)
      undoStack.length = 0;
      setSkin(it.skin);
      loadDrawing(it.draw);
    }
    renderSlots();
    applyActive(it.img, it.imported ? `Avatar importado no espaço ${i + 1}!` : `Avatar salvo no espaço ${i + 1}!`);
  }

  // Junta o boneco base (com o tom da aba "Pele") + o desenho num único PNG transparente.
  function buildMerged() {
    const merged = document.createElement('canvas');
    merged.width = canvas.width;
    merged.height = canvas.height;
    const mctx = merged.getContext('2d');
    drawSkinned(mctx, document.getElementById('character-base'), merged.width, merged.height);
    mctx.drawImage(canvas, 0, 0);
    return merged;
  }

  // usado pelo terminal (`desenhar`) pra baixar o avatar atual como PNG transparente
  window.TruAvatarEditor = { png: () => buildMerged().toDataURL('image/png') };

  btnSave.addEventListener('click', () => {
    pendingSave = {
      img: buildMerged().toDataURL('image/png'),
      draw: canvas.toDataURL('image/png'),
      skin: { h: skin.h, s: skin.s, b: skin.b }
    };
    openSlotModal();
  });

  // ------------------------------------------------------------------
  // EXPORTAR / IMPORTAR por CÓDIGO
  // O código é texto: "TRU1-" + dados do avatar (tom de pele + o desenho
  // recortado em PNG), em base64. Quem recebe cola em "Importar" e o avatar
  // aparece (editável) na coleção. Não precisa de servidor.
  // ------------------------------------------------------------------
  const CODE_PREFIX = 'TRU1-';
  const exportModal = document.getElementById('export-modal');
  const exportImg = document.getElementById('export-img');
  const exportCode = document.getElementById('export-code');
  const exportView = document.getElementById('export-code-view');
  // mostra só o começo e o fim do código (o completo fica no textarea invisível, usado pra copiar)
  const shortCode = (c) => c.length > 26 ? c.slice(0, 14) + '…' + c.slice(-6) : c;
  const exportMsg = document.getElementById('export-msg');
  const importModal = document.getElementById('import-modal');
  const importCode = document.getElementById('import-code');
  const importMsg = document.getElementById('import-msg');
  const importOk = document.getElementById('import-ok');
  const importPreview = document.getElementById('import-preview');
  const importImg = document.getElementById('import-img');

  function bytesToB64url(bytes) {
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function b64urlToBytes(str) {
    let b = str.replace(/-/g, '+').replace(/_/g, '/');
    while (b.length % 4) b += '=';
    const bin = atob(b), out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  // gera o código do avatar que está no editor
  function encodeAvatar() {
    return new Promise((resolve, reject) => {
      const W = canvas.width, H = canvas.height;
      const data = ctx.getImageData(0, 0, W, H).data;
      let x0 = W, y0 = H, x1 = -1, y1 = -1;
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          if (data[(y * W + x) * 4 + 3] > 0) {
            if (x < x0) x0 = x; if (x > x1) x1 = x;
            if (y < y0) y0 = y; if (y > y1) y1 = y;
          }
        }
      }
      const sk = [skin.h, skin.s, skin.b].join(',');
      const enc = new TextEncoder();
      if (x1 < 0) return resolve(CODE_PREFIX + bytesToB64url(enc.encode(sk + ',-\n')));   // sem desenho: código curtinho
      const c = document.createElement('canvas');
      c.width = x1 - x0 + 1; c.height = y1 - y0 + 1;
      c.getContext('2d').drawImage(canvas, x0, y0, c.width, c.height, 0, 0, c.width, c.height);
      c.toBlob((blob) => {
        if (!blob) return reject(new Error('png'));
        blob.arrayBuffer().then((buf) => {
          const head = enc.encode(sk + ',' + x0 + ',' + y0 + '\n');
          const all = new Uint8Array(head.length + buf.byteLength);
          all.set(head, 0); all.set(new Uint8Array(buf), head.length);
          resolve(CODE_PREFIX + bytesToB64url(all));
        }, reject);
      }, 'image/png');
    });
  }

  // lê um código: devolve { skin, draw (dataURL 500x500 ou null), img (avatar pronto) }
  function decodeAvatar(text) {
    return new Promise((resolve, reject) => {
      const t = String(text || '').replace(/\s+/g, '');
      if (t.indexOf(CODE_PREFIX) !== 0) return reject(new Error('Esse código não parece de um avatar.'));
      let bytes;
      try { bytes = b64urlToBytes(t.slice(CODE_PREFIX.length)); } catch (e) { return reject(new Error('Código quebrado. Copie ele inteiro de novo.')); }
      if (bytes.length > 600 * 1024) return reject(new Error('Código grande demais.'));
      let nl = -1;
      for (let i = 0; i < Math.min(bytes.length, 80); i++) if (bytes[i] === 10) { nl = i; break; }
      if (nl < 0) return reject(new Error('Código quebrado. Copie ele inteiro de novo.'));
      const parts = new TextDecoder().decode(bytes.subarray(0, nl)).split(',');
      const h = parseFloat(parts[0]), sv = parseFloat(parts[1]), br = parseFloat(parts[2]);
      if (!(h >= 0 && h <= 360 && sv >= 0 && sv <= 3 && br >= 0 && br <= 6)) return reject(new Error('Código inválido.'));
      const sk = { h, s: sv, b: br };

      const finish = (drawUrl) => {
        const m = document.createElement('canvas');
        m.width = canvas.width; m.height = canvas.height;
        const mc = m.getContext('2d');
        drawSkinned(mc, document.getElementById('character-base'), m.width, m.height, sk);
        const done = () => resolve({ skin: sk, draw: drawUrl, img: m.toDataURL('image/png') });
        if (!drawUrl) return done();
        const di = new Image();
        di.onload = () => { mc.drawImage(di, 0, 0); done(); };
        di.onerror = () => reject(new Error('Código inválido.'));
        di.src = drawUrl;
      };

      if (parts[3] === '-') return finish(null);
      const x = parseInt(parts[3], 10), y = parseInt(parts[4], 10);
      const png = bytes.subarray(nl + 1);
      const okSig = png.length > 8 && png[0] === 0x89 && png[1] === 0x50 && png[2] === 0x4e && png[3] === 0x47;
      if (!(x >= 0 && y >= 0 && x < canvas.width && y < canvas.height) || !okSig) return reject(new Error('Código inválido.'));
      const url = URL.createObjectURL(new Blob([png], { type: 'image/png' }));
      const im = new Image();
      im.onload = () => {
        URL.revokeObjectURL(url);
        if (im.naturalWidth > canvas.width || im.naturalHeight > canvas.height) return reject(new Error('Código inválido.'));
        const c = document.createElement('canvas');
        c.width = canvas.width; c.height = canvas.height;
        c.getContext('2d').drawImage(im, x, y);
        finish(c.toDataURL('image/png'));
      };
      im.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Código inválido.')); };
      im.src = url;
    });
  }

  // ---- exportar ----
  function openExport() {
    exportMsg.textContent = '';
    exportCode.value = '';
    exportView.querySelector('.cb-code').textContent = 'Gerando o código…';
    exportImg.src = buildMerged().toDataURL('image/png');
    exportModal.classList.remove('hidden');
    document.getElementById('export-copy').focus();
    encodeAvatar().then((code) => {
      exportCode.value = code;
      exportView.querySelector('.cb-code').textContent = shortCode(code);
    }, () => { exportCode.value = ''; exportView.querySelector('.cb-code').textContent = '—'; exportMsg.textContent = 'Não consegui gerar o código.'; });
  }
  function closeExport() { exportModal.classList.add('hidden'); document.getElementById('btn-avatar-share').focus(); }
  document.getElementById('btn-avatar-share').addEventListener('click', openExport);
  document.getElementById('export-close').addEventListener('click', closeExport);
  exportModal.addEventListener('click', (e) => { if (e.target === exportModal) closeExport(); });
  exportView.addEventListener('click', () => document.getElementById('export-copy').click());
  exportView.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); exportView.click(); } });
  document.getElementById('export-copy').addEventListener('click', async () => {
    const code = exportCode.value;
    if (!code || code.indexOf(CODE_PREFIX) !== 0) return;
    try {
      await navigator.clipboard.writeText(code);
      exportMsg.textContent = 'Código copiado! Agora é só mandar pro seu amigo.';
    } catch (e) {
      exportCode.focus(); exportCode.select();
      let ok = false;
      try { ok = document.execCommand('copy'); } catch (e2) {}
      exportMsg.textContent = ok ? 'Código copiado! Agora é só mandar pro seu amigo.' : 'Selecione o código e copie (Ctrl+C).';
    }
  });

  // ---- importar ----
  let importTok = 0, importData = null;
  function resetImport() {
    importCode.value = ''; importMsg.textContent = ''; importOk.disabled = true;
    importPreview.hidden = true; importData = null; importTok++;
  }
  function openImport() {
    resetImport();
    importModal.classList.remove('hidden');
    importCode.focus();
  }
  function closeImport() { importModal.classList.add('hidden'); document.getElementById('btn-avatar-import').focus(); }
  document.getElementById('btn-avatar-import').addEventListener('click', openImport);
  document.getElementById('import-cancel').addEventListener('click', closeImport);
  importModal.addEventListener('click', (e) => { if (e.target === importModal) closeImport(); });

  // ao colar/digitar: já confere o código e mostra o avatar
  importCode.addEventListener('input', () => {
    const tok = ++importTok;
    importData = null; importOk.disabled = true; importPreview.hidden = true;
    if (!importCode.value.trim()) { importMsg.textContent = ''; return; }
    importMsg.textContent = 'Conferindo…';
    decodeAvatar(importCode.value).then((d) => {
      if (tok !== importTok) return;
      importData = d;
      importImg.src = d.img;
      importPreview.hidden = false;
      importMsg.textContent = '';
      importOk.disabled = false;
    }, (err) => {
      if (tok !== importTok) return;
      importMsg.textContent = err.message || 'Código inválido.';
    });
  });
  importOk.addEventListener('click', () => {
    if (!importData) return;
    pendingSave = { img: importData.img, draw: importData.draw, skin: importData.skin, imported: true };
    importModal.classList.add('hidden');
    openSlotModal();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (!exportModal.classList.contains('hidden')) closeExport();
    else if (!importModal.classList.contains('hidden')) closeImport();
  });

  // ---- inicialização: carrega a coleção e o avatar em uso ----
  slots = readSlots();
  try { const a = parseInt(localStorage.getItem(ACTIVE_KEY), 10); activeSlot = isFinite(a) && slots[a] ? a : -1; } catch (e) {}
  if (activeSlot < 0) activeSlot = slots.findIndex(x => x);
  if (activeSlot >= 0) {
    editingSlot = activeSlot;
    const it = slots[activeSlot];
    if (it.draw) { setSkin(it.skin || DEFAULT_SKIN); loadDrawing(it.draw); }
    const previewImg = document.getElementById('character-preview-img');
    if (previewImg) previewImg.src = it.img;
    try { localStorage.setItem('trutec_meu_personagem', it.img); } catch (e) {}
  }
  renderSlots();

  // O perfil (social.js) pode trocar o personagem principal: usa o mesmo caminho do clique no espaço.
  document.addEventListener('trutec:equip-avatar', (e) => {
    const i = e && e.detail ? e.detail.index : -1;
    if (!(i >= 0 && i < SLOT_COUNT) || !slots[i]) return;
    e.preventDefault();                       // avisa que foi tratado
    setActive(i);
    renderSlots();
    applyActive(slots[i].img, `Avatar ${i + 1} em uso!`);
  });
})();

// ------------------------------------------------------------------
// Abrir/fechar a tela de edição do avatar a partir do lobby
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
const helpModal = document.getElementById('help-modal');

function openModal(m) { lobbyError(''); m.classList.remove('hidden'); }
function closeModal(m) { m.classList.add('hidden'); lobbyError(''); }

document.getElementById('btn-play').addEventListener('click', () => {
  openModal(joinModal);
  codeInput.focus();
});
// "Criar sala" agora fica dentro do modal Jogar: fecha o Jogar e abre a escolha 1v1 / 2v2
document.getElementById('btn-create').addEventListener('click', () => { closeModal(joinModal); openModal(createModal); });
document.getElementById('join-cancel').addEventListener('click', () => closeModal(joinModal));
// Voltar da escolha de modo: volta pro modal Jogar
document.getElementById('create-cancel').addEventListener('click', () => { closeModal(createModal); openModal(joinModal); });
document.getElementById('btn-help').addEventListener('click', () => {
  openModal(helpModal);
  const body = helpModal.querySelector('.help-body');
  if (body) body.scrollTop = 0;
});
document.getElementById('help-close').addEventListener('click', () => closeModal(helpModal));
[joinModal, createModal, helpModal].forEach((m) => {
  m.addEventListener('click', (e) => { if (e.target === m) closeModal(m); });
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { closeModal(joinModal); closeModal(createModal); closeModal(helpModal); }
});

function enterRoom(res) {
  if (!res.ok) return lobbyError(res.error);
  myRoomCode = res.code;
  myWaitingSeat = res.seat;
  myToken = res.token || null;
  saveSession();
  if (window.TruAccount) TruAccount.syncCharacter();
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
// A tela da sala abre NA HORA (sem esperar o servidor) e é preenchida quando a resposta
// chega. Antes, nada acontecia até o servidor responder — e se ele estivesse "dormindo"
// (Render grátis) parecia que o botão tinha travado.
let creatingRoom = false;
document.querySelectorAll('.create-modes .btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    if (creatingRoom) return;
    creatingRoom = true;
    myMode = btn.dataset.mode;
    myName = currentName();

    const codeEl = document.getElementById('waiting-code');
    const hintEl = document.getElementById('waiting-hint');
    const startBtn = document.getElementById('btn-start-game');
    const board = document.getElementById('waiting-players');
    closeModal(createModal);
    showScreen('screen-waiting');
    if (codeEl) setRoomCodePending();
    if (board) board.innerHTML = '';
    if (startBtn) startBtn.classList.add('hidden');
    if (hintEl) {
      hintEl.textContent = socket.connected ? 'Criando a sala…' : 'Conectando ao servidor… (na primeira vez pode demorar um pouquinho)';
      hintEl.classList.remove('hidden');
    }

    let answered = false;
    const giveUp = (msg) => {
      if (answered) return;
      answered = true; creatingRoom = false;
      showScreen('screen-lobby');
      lobbyError(msg);
    };
    // Acompanha a espera: avisa o que está acontecendo e desiste quando não adianta mais esperar.
    //  - nunca conectou: até 80s (servidor dormindo acorda em ~1 min)
    //  - conectou mas não respondeu: 15s
    const t0 = Date.now();
    let connectedAt = socket.connected ? t0 : 0;
    const timer = setInterval(() => {
      if (answered) return clearInterval(timer);
      const now = Date.now();
      if (socket.connected && !connectedAt) connectedAt = now;
      if (!socket.connected) connectedAt = 0;
      if (connectedAt) {
        if (hintEl) hintEl.textContent = 'Criando a sala…';
        if (now - connectedAt > 15000) { clearInterval(timer); giveUp('O servidor não respondeu. Tente de novo.'); }
      } else {
        const s = Math.round((now - t0) / 1000);
        if (hintEl) hintEl.textContent = s < 4 ? 'Conectando ao servidor…'
          : 'Acordando o servidor… (' + s + 's) na primeira vez do dia pode levar até 1 minuto.';
        if (now - t0 > 80000) { clearInterval(timer); giveUp('Não consegui conectar ao servidor. Tente de novo.'); }
      }
    }, 1000);

    socket.emit('create_room', { name: myName, mode: myMode, isPublic: false, character: getSavedCharacter(), stats: window.TruStats ? TruStats.get() : null, theme: window.TruThemes ? TruThemes.current() : null }, (res) => {
      clearInterval(timer);
      if (answered) return;
      answered = true; creatingRoom = false;
      if (!res || !res.ok) {
        showScreen('screen-lobby');
        return lobbyError((res && res.error) || 'Não foi possível criar a sala.');
      }
      enterRoom(res);
    });
  });
});

document.getElementById('btn-leave-waiting').addEventListener('click', () => {
  leaveToLobby(); // limpa a sessão e mostra a tela de carregamento antes de voltar ao lobby
});

// ------------------------------------------------------------------
// SALA DE ESPERA
// ------------------------------------------------------------------
// Código da sala: cada letra vira um <span> que "cresce" uma por uma.
function setRoomCodePending() {
  const el = document.getElementById('waiting-code');
  shownRoomCode = null;
  el.classList.add('pending');
  el.removeAttribute('role'); el.removeAttribute('aria-label');
  el.textContent = '·····';
}
// devolve o atraso inicial (ms) se animou, ou 0 se o código já estava na tela
function setRoomCode(code) {
  const el = document.getElementById('waiting-code');
  if (!code || code === shownRoomCode) return 0;
  shownRoomCode = code;
  el.classList.remove('pending');
  el.setAttribute('role', 'img');
  el.setAttribute('aria-label', 'Código da sala: ' + code);
  // se a tela acabou de abrir, espera o card terminar de crescer antes das letras
  const base = performance.now() - waitingShownAt < 700 ? 450 : 80;
  const STEP = 130;
  el.textContent = '';
  Array.from(code).forEach((ch, i) => {
    const sp = document.createElement('span');
    sp.className = 'rc-letter';
    sp.setAttribute('aria-hidden', 'true');
    sp.textContent = ch;
    sp.style.animationDelay = (base + i * STEP) + 'ms';
    el.appendChild(sp);
  });
  // brilho no código quando a última letra termina de aparecer
  el.style.setProperty('--glow-delay', (base + code.length * STEP) + 'ms');
  el.classList.remove('reveal'); void el.offsetWidth; el.classList.add('reveal');
  return base;
}

let teamSwapBusy = 0;          // >0 enquanto uma substituição (2 pedidos ao servidor) está em andamento
let deferredLobby = null;      // lobby_update recebido nesse meio tempo
// Altura do card da sala: quando entra conteúdo (código, jogadores, botão) ou muda
// a quantidade de jogadores, o card cresce/encolhe de forma suave em vez de pular.
// Mede a altura antes e depois da mudança e anima só a altura (centro da tela fixo,
// então ele abre pra cima e pra baixo ao mesmo tempo).
let cardResizeTimer = null;
function smoothCardResize(change) {
  const card = document.querySelector('#screen-waiting .lobby-card');
  const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!card || reduced || !card.offsetParent) return change();
  const from = card.offsetHeight;                      // altura real (ignora o scale da entrada)
  clearTimeout(cardResizeTimer);
  card.style.transition = 'none';
  card.style.height = '';                              // volta à altura natural pra medir
  change();
  const to = card.offsetHeight;
  if (Math.abs(to - from) < 2) { card.style.overflow = ''; return; }
  card.style.overflow = 'hidden';
  card.style.height = from + 'px';
  void card.offsetHeight;                              // aplica o ponto de partida
  card.style.transition = 'height .6s cubic-bezier(.22, 1, .36, 1)';
  card.style.height = to + 'px';
  cardResizeTimer = setTimeout(() => {
    card.style.transition = ''; card.style.height = ''; card.style.overflow = '';
  }, 650);
}

function handleLobbyUpdate(lobby) {
  lastRealLobby = lobby;
  if (teamSwapBusy > 0 || teamDrag) { deferredLobby = lobby; return; }   // troca/arraste em andamento: espera acabar
  smoothCardResize(() => renderLobby(mergePendingBots(lobby)));
}
function renderLobby(lobby) {
  const revealBase = setRoomCode(lobby.code); // ms de espera se o código é novo (anima), 0 se já estava na tela
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

  // sala acabou de aparecer: jogadores/duplas entram um depois do outro
  if (revealBase) {
    wrap.querySelectorAll('.wp-row, .team-column').forEach((el, i) => {
      el.classList.add('wr-pop');
      el.style.animationDelay = (revealBase + 250 + i * 100) + 'ms';
    });
  }

  // quem entrou depois (não conta o 1º retrato da sala): explosãozinha de fumaça + som
  const seatsNow = new Set(lobby.players.map(p => p.seat));
  if (revealBase || !knownSeats) {
    knownSeats = seatsNow;
  } else {
    const fresh = lobby.players.filter(p => !knownSeats.has(p.seat));
    knownSeats = seatsNow;
    let played = false;
    fresh.forEach((p, i) => {
      if (p.isBot) return;                                           // bot entra na hora, sem explosão
      const el = wrap.querySelector('[data-seat="' + p.seat + '"]');
      if (!el) return;
      el.classList.add('smoke-in');
      el.style.animationDelay = (i * 120) + 'ms';
      if (!played) { played = true; if (window.GameAudio && GameAudio.poof) GameAudio.poof(); }
      if (window.TruSmoke) setTimeout(() => TruSmoke.puff(el), i * 120);
    });
  }

  updateStartButton(lobby);
}
socket.on('lobby_update', handleLobbyUpdate);
// ---- expulsar: confirmação do host ----
const kickModal = document.getElementById('kick-modal');
let kickSeat = null, kickDone = null;
function askKick(seat, name, done) {
  kickSeat = seat; kickDone = done;
  document.getElementById('kick-name').textContent = name || 'Este jogador';
  kickModal.classList.remove('hidden');
  document.getElementById('kick-cancel').focus();
}
function closeKick() { kickModal.classList.add('hidden'); kickSeat = null; kickDone = null; }
document.getElementById('kick-cancel').addEventListener('click', closeKick);
kickModal.addEventListener('click', (e) => { if (e.target === kickModal) closeKick(); });
document.getElementById('kick-ok').addEventListener('click', () => {
  if (kickSeat === null) return closeKick();
  const seat = kickSeat, done = kickDone;
  closeKick();
  socket.emit('kick_player', { seat }, done);
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !kickModal.classList.contains('hidden')) closeKick(); });

// ---- expulso: aviso com OK (a pessoa sai da sala e não pode voltar) ----
socket.on('kicked', () => {
  clearSession();
  closeKick();
  const m = document.getElementById('kicked-modal');
  m.classList.remove('hidden');
  const ok = document.getElementById('kicked-ok');
  ok.focus();
  ok.onclick = () => location.reload();
});

// Adicionar / remover bot na sala de espera (só o host vê os botões).
// O botão lê a dupla na hora do clique, então continua certo depois de arrastar cards.
document.getElementById('waiting-players').addEventListener('click', (e) => {
  const addBtn = e.target.closest('.bot-add-btn');
  const rmBtn = e.target.closest('.bot-remove-btn');
  if (!addBtn && !rmBtn) return;
  const errEl = document.getElementById('waiting-error');
  const done = (res) => { if (errEl) errEl.textContent = res && !res.ok ? (res.error || 'Não foi possível.') : ''; };
  if (rmBtn && rmBtn.classList.contains('kick-btn')) {
    const card = rmBtn.closest('[data-seat]') || rmBtn.closest('.wp-row');
    const seatNum = card && card.dataset.seat !== undefined ? parseInt(card.dataset.seat, 10) : NaN;
    const nm = card ? ((card.querySelector('.wp-name') || {}).textContent || '').trim() : '';
    if (!isFinite(seatNum)) return;
    askKick(seatNum, nm, done);
    return;
  }
  if (addBtn) {
    const col = addBtn.closest('.team-column');
    const slotEl = addBtn.closest('.team-slot-empty');
    openBotModal({
      team: col ? parseInt(col.dataset.team, 10) : undefined,
      slot: slotEl && slotEl.dataset.slot !== undefined ? parseInt(slotEl.dataset.slot, 10) : undefined,
      done
    });
  } else {
    const card = rmBtn.closest('[data-seat]');
    if (!card) return;
    socket.emit('remove_bot', { seat: parseInt(card.dataset.seat, 10) }, done);
  }
});

// ------------------------------------------------------------------
// Adicionar bot: o host escolhe QUAL bot numa janela (nome + descrição).
// O bot aparece NA HORA na sala (sem esperar o servidor); se o servidor recusar,
// a tela volta ao que era e mostra o erro.
// ------------------------------------------------------------------
const botModal = document.getElementById('bot-modal');
const botListEl = document.getElementById('bot-list');
let botCatalog = null;     // [{ persona, name, desc, avatar }] — vem do servidor, uma vez só
let botTarget = null;      // { team, slot, done } do slot em que o host clicou

function loadBotCatalog(cb) {
  if (botCatalog) return cb(botCatalog);
  let answered = false;
  const finish = (res) => {
    if (answered) return; answered = true;
    if (res && res.ok && Array.isArray(res.bots)) botCatalog = res.bots;
    cb(botCatalog);
  };
  socket.emit('get_bot_catalog', finish);
  setTimeout(() => finish(null), 3000);   // servidor sem esse evento: não fica "Carregando…" pra sempre
}
function closeBotModal() { botModal.classList.add('hidden'); botTarget = null; }
function openBotModal(target) {
  botTarget = target;
  botListEl.textContent = 'Carregando…';
  botModal.classList.remove('hidden');
  document.getElementById('bot-cancel').focus();
  loadBotCatalog((bots) => {
    if (botTarget !== target) return;                       // fechou/abriu outra enquanto carregava
    if (!bots) {                                            // servidor antigo: sorteia, como antes
      closeBotModal();
      target.team !== undefined || target.slot !== undefined
        ? socket.emit('add_bot', { team: target.team, slot: target.slot }, target.done)
        : socket.emit('add_bot', {}, target.done);
      return;
    }
    const taken = new Set(((lastRealLobby && lastRealLobby.players) || []).map(p => p.persona).filter(Boolean));
    pendingBots.forEach(b => taken.add(b.persona));      // bot que acabei de pedir e o servidor ainda não confirmou
    botListEl.innerHTML = '';
    bots.forEach((b) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'bot-option';
      btn.disabled = taken.has(b.persona);
      btn.innerHTML =
        '<div class="wp-avatar"><img alt="" draggable="false" /></div>' +
        '<div class="bot-option-info">' +
          '<div class="bot-option-name">' + escapeHtml(b.name) + '<span class="bot-tag">BOT</span>' +
            (btn.disabled ? '<span class="bot-option-taken">já está na sala</span>' : '') + '</div>' +
          '<div class="bot-option-desc">' + escapeHtml(b.desc) + '</div>' +
        '</div>';
      btn.querySelector('img').src = b.avatar;
      btn.addEventListener('click', () => chooseBot(b));
      botListEl.appendChild(btn);
    });
  });
}
// Bots que o host acabou de pedir e o servidor ainda não confirmou: já contam como
// "na sala" (a janela marca como já escolhido na hora e o lobby não perde o bot
// se chegar uma atualização do servidor no meio do caminho).
const pendingBots = [];   // [{ persona, player }]
function mergePendingBots(lobby) {
  const have = new Set(lobby.players.map(p => p.persona).filter(Boolean));
  const extra = pendingBots.filter(b => !have.has(b.persona));
  if (!extra.length) return lobby;
  const used = new Set(lobby.players.map(p => p.seat));
  const players = lobby.players.slice();
  extra.forEach(b => {
    let seat = b.player.seat;
    if (used.has(seat)) { seat = 0; while (used.has(seat)) seat++; }
    used.add(seat);
    players.push(Object.assign({}, b.player, { seat }));
  });
  const full = players.length === lobby.maxPlayers;
  const teamsReady = lobby.mode !== '2v2' || [0, 1].every(k => players.filter(p => p.team === k).length === 2);
  return Object.assign({}, lobby, { players, canStart: full && teamsReady, teamsReady });
}
function chooseBot(bot) {
  const t = botTarget;
  closeBotModal();
  if (!t) return;
  const entry = addBotInstantly(t, bot);
  socket.emit('add_bot', { team: t.team, slot: t.slot, persona: bot.persona }, (res) => {
    const i = pendingBots.indexOf(entry);
    if (i >= 0) pendingBots.splice(i, 1);
    t.done(res);
    if (res && !res.ok && lastRealLobby) {                 // recusado: desfaz o bot que apareceu
      const shown = mergePendingBots(lastRealLobby);
      knownSeats = new Set(shown.players.map(p => p.seat));
      renderLobby(shown);
    }
  });
}
// Desenha o lobby já com o bot (a resposta do servidor depois só confirma, igualzinho).
function addBotInstantly(t, bot) {
  if (!lastRealLobby || teamSwapBusy > 0 || teamDrag) return null;
  const base = mergePendingBots(lastRealLobby);          // já inclui bots pedidos antes e ainda não confirmados
  const used = new Set(base.players.map(p => p.seat));
  let seat = 0; while (used.has(seat)) seat++;
  const team = base.mode === '2v2' && t.team !== undefined ? t.team : seat % 2;
  const player = {
    seat, name: bot.name, team, slot: t.slot, connected: true, character: bot.avatar,
    nameFx: null, isBot: true, persona: bot.persona, theme: null, stats: null
  };
  const entry = { persona: bot.persona, player };
  pendingBots.push(entry);
  renderLobby(mergePendingBots(lastRealLobby));
  return entry;
}
document.getElementById('bot-cancel').addEventListener('click', closeBotModal);
botModal.addEventListener('click', (e) => { if (e.target === botModal) closeBotModal(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !botModal.classList.contains('hidden')) closeBotModal(); });

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

function playerCardHtml(p, draggable, slot) {
  const avatarSrc = p.character || 'assets/personagem.svg';
  return `
    <div class="team-card${draggable ? ' team-card-draggable' : ''}" data-seat="${p.seat}" data-slot="${slot}">
      <div class="wp-avatar"><img src="${avatarSrc}" alt="" draggable="false" /></div>
      <span class="wp-name">${nameFxHtml(p.name, p.nameFx)}${p.isBot ? '<span class="bot-tag">BOT</span>' : ''}${p.connected ? '' : ' (saiu)'}${p.seat === 0 ? ' ' + ICON('crown', true) : ''}</span>
      ${p.isBot && draggable ? '<button type="button" class="bot-remove-btn" title="Remover bot" aria-label="Remover bot">×</button>' : ''}
      ${!p.isBot && p.seat !== 0 && draggable ? '<button type="button" class="bot-remove-btn kick-btn" title="Expulsar da sala" aria-label="Expulsar da sala">' + ICON('exit') + 'Expulsar</button>' : ''}
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

    const col = document.createElement('div');
    col.className = `team-column team-column-${team === 0 ? 'a' : 'b'}`;
    col.dataset.team = String(team);

    // posições da dupla: 0 = em cima, 1 = embaixo (o host escolhe arrastando)
    const slots = [null, null];
    teamPlayers.forEach((p) => {
      const want = (p.slot === 0 || p.slot === 1) && !slots[p.slot] ? p.slot : (slots[0] ? 1 : 0);
      slots[want] = p;
    });
    let bodyHtml = '';
    for (let i = 0; i < 2; i++) {
      if (slots[i]) bodyHtml += playerCardHtml(slots[i], canEdit, i);
      else bodyHtml += canEdit
        ? `<div class="team-slot-empty has-bot-btn" data-slot="${i}"><span class="slot-wait">Aguardando…</span><button type="button" class="bot-add-btn">+ Adicionar bot</button></div>`
        : `<div class="team-slot-empty" data-slot="${i}">Aguardando…</div>`;
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
    if (p) row.dataset.seat = String(p.seat);
    if (p) {
      const avatarSrc = p.character || 'assets/personagem.svg';
      row.innerHTML = `
        <div class="wp-avatar"><img src="${avatarSrc}" alt="" draggable="false" /></div>
        <div class="wp-info">
          <span class="wp-name">${nameFxHtml(p.name, p.nameFx)}${p.isBot ? '<span class="bot-tag">BOT</span>' : ''}${p.connected ? '' : ' (saiu)'}${p.seat === 0 ? ' ' + ICON('crown', true) : ''}</span>
          <span class="wp-team">Time ${p.team + 1}</span>
        </div>
        ${p.isBot && canEdit ? '<button type="button" class="bot-remove-btn" title="Remover bot" aria-label="Remover bot">×</button>' : ''}
        ${!p.isBot && p.seat !== 0 && canEdit ? '<button type="button" class="bot-remove-btn kick-btn" title="Expulsar da sala" aria-label="Expulsar da sala">' + ICON('exit') + 'Expulsar</button>' : ''}
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

// aplica o lobby_update que ficou esperando (só quando não há arraste nem troca em andamento)
function flushDeferredLobby() {
  if (teamDrag || teamSwapBusy > 0 || !deferredLobby) return;
  const l = deferredLobby; deferredLobby = null;
  handleLobbyUpdate(l);
}
// desiste de um arraste em andamento (ponteiro cancelado / começou outro arraste por cima)
function cancelTeamDrag() {
  document.removeEventListener('pointermove', onTeamDragMove);
  document.removeEventListener('pointerup', onTeamDragEnd);
  document.removeEventListener('pointercancel', onTeamDragCancel);
  if (!teamDrag) return;
  cancelAnimationFrame(teamDrag.raf);
  teamDrag.sourceEl.classList.remove('team-card-source-dragging');
  teamDrag.ghost.remove();
  teamDrag = null;
  document.querySelectorAll('.team-column-hover').forEach(c => c.classList.remove('team-column-hover'));
  document.querySelectorAll('.team-slot-hover').forEach(n => n.classList.remove('team-slot-hover'));
  flushDeferredLobby();
}
function onTeamDragCancel() { cancelTeamDrag(); }

function startTeamCardDrag(e, cardEl) {
  if (e.button !== undefined && e.button !== 0) return;
  e.preventDefault();
  if (teamDrag) cancelTeamDrag();   // nunca deixa dois "fantasmas" ao mesmo tempo

  const seat = parseInt(cardEl.dataset.seat, 10);
  const rect = cardEl.getBoundingClientRect();
  const ghost = cardEl.cloneNode(true);
  ghost.className = 'team-card team-card-ghost';
  // o card pode estar no meio da animação de "soltar" (que deixa position:relative / z-index
  // inline). Se o clone herdar isso, ele deixa de ser position:fixed e não acompanha o mouse.
  ghost.removeAttribute('style');
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
  document.addEventListener('pointercancel', onTeamDragCancel, { once: true });
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
  document.querySelectorAll('.team-slot-hover').forEach(n => n.classList.remove('team-slot-hover'));
  const slotUnder = el && el.closest ? el.closest('.team-column [data-slot]') : null;
  if (slotUnder && slotUnder !== teamDrag.sourceEl) slotUnder.classList.add('team-slot-hover');
}

function onTeamDragEnd(e) {
  document.removeEventListener('pointercancel', onTeamDragCancel);
  try { finishTeamDrag(e); }
  finally { flushDeferredLobby(); }   // se nenhuma troca começou, mostra o que o servidor mandou enquanto arrastava
}
function finishTeamDrag(e) {
  document.removeEventListener('pointermove', onTeamDragMove);
  if (!teamDrag) return;
  cancelAnimationFrame(teamDrag.raf);

  const el = document.elementFromPoint(e.clientX, e.clientY);
  const col = el && el.closest('.team-column');
  const dropEl = el, dropY = e.clientY;
  document.querySelectorAll('.team-column').forEach(c => c.classList.remove('team-column-hover'));

  const dropFrom = { x: parseFloat(teamDrag.ghost.style.left) || 0, y: parseFloat(teamDrag.ghost.style.top) || 0 };
  teamDrag.sourceEl.classList.remove('team-card-source-dragging');
  teamDrag.ghost.remove();

  const seat = teamDrag.seat;
  const sourceEl = teamDrag.sourceEl;
  const wasMoved = teamDrag.moved;
  teamDrag = null;
  document.querySelectorAll('.team-slot-hover').forEach(n => n.classList.remove('team-slot-hover'));

  const errEl = document.getElementById('waiting-error');
  if (errEl) errEl.textContent = '';
  const srcCol = sourceEl.closest('.team-column');
  const curTeam = srcCol ? parseInt(srcCol.dataset.team, 10) : null;

  let targetCol = col, slotEl = null;
  if (!targetCol) {
    // soltou fora das duplas: nada. Toque rápido (sem arrastar): vai pra outra dupla, na 1ª vaga livre
    if (wasMoved || curTeam === null) return;
    targetCol = document.querySelector('.team-column[data-team="' + (1 - curTeam) + '"]');
    slotEl = targetCol && targetCol.querySelector('.team-slot-empty');
    if (!slotEl) { if (errEl) errEl.textContent = 'Dupla cheia: arraste o jogador em cima de quem você quer substituir.'; return; }
  } else {
    // a posição (em cima / embaixo) é a que está sob o mouse; se caiu no meio, a mais próxima
    slotEl = dropEl && dropEl.closest ? dropEl.closest('[data-slot]') : null;
    if (!slotEl || !targetCol.contains(slotEl)) {
      slotEl = Array.from(targetCol.querySelectorAll('[data-slot]')).sort((x, y) => {
        const rx = x.getBoundingClientRect(), ry = y.getBoundingClientRect();
        return Math.abs(rx.top + rx.height / 2 - dropY) - Math.abs(ry.top + ry.height / 2 - dropY);
      })[0];
    }
  }
  if (!slotEl || slotEl === sourceEl) return;
  if (!sourceEl.isConnected || !slotEl.isConnected) return;   // a mesa foi redesenhada: card velho, ignora
  movePlayerToSlot(sourceEl, slotEl, seat, parseInt(targetCol.dataset.team, 10), parseInt(slotEl.dataset.slot, 10), dropFrom);
}

// Troca de lugar na tela (instantâneo) e confirma com o servidor. Se o destino tem
// alguém, os dois trocam; se está vazio, o jogador vai pra lá. Funciona dentro da mesma
// dupla (em cima <-> embaixo) e entre duplas, mesmo com as duas cheias.
function swapNodes(a, b) {
  const mark = document.createComment('');
  a.replaceWith(mark);
  b.replaceWith(a);
  mark.replaceWith(b);
  const t = a.dataset.slot; a.dataset.slot = b.dataset.slot; b.dataset.slot = t;
}
// Animação (FLIP): o card solto "voa" do ponto onde estava no ar até o slot, com uma
// molinha suave no final; quem estava no slot escorrega pro lugar que ficou livre.
function animateSlotMove(cardEl, targetEl, from, rSrc0, rTgt0) {
  if (REDUCED_MOTION || !cardEl.animate) return [];
  const anims = [];
  const rCard = cardEl.getBoundingClientRect();
  const rTgt = targetEl.getBoundingClientRect();
  cardEl.style.position = 'relative';
  cardEl.style.zIndex = '5';
  const a1 = cardEl.animate([
    { transform: 'translate(' + (from.x - rCard.left) + 'px,' + (from.y - rCard.top) + 'px) scale(1.07)', boxShadow: '0 0.9rem 1.6rem rgba(0,0,0,0.55)' },
    { transform: 'translate(0,0) scale(1)', boxShadow: '0 0 0 rgba(0,0,0,0)' }
  ], { duration: 460, easing: 'cubic-bezier(.22,1.15,.36,1)' });
  a1.finished.then(() => { cardEl.style.position = ''; cardEl.style.zIndex = ''; }, () => {});
  anims.push(a1);
  const a2 = targetEl.animate([
    { transform: 'translate(' + (rTgt0.left - rTgt.left) + 'px,' + (rTgt0.top - rTgt.top) + 'px)' },
    { transform: 'translate(0,0)' }
  ], { duration: 380, easing: 'cubic-bezier(.3,.9,.3,1)' });
  anims.push(a2);
  return anims;
}
function movePlayerToSlot(cardEl, targetEl, seat, team, slot, from) {
  if (!cardEl.isConnected || !targetEl.isConnected) return;   // nunca troca nós soltos (isso duplicava o card)
  const errEl = document.getElementById('waiting-error');
  if (errEl) errEl.textContent = '';
  const rSrc0 = cardEl.getBoundingClientRect();
  const rTgt0 = targetEl.getBoundingClientRect();
  teamSwapBusy++;
  swapNodes(cardEl, targetEl);
  const anims = from ? animateSlotMove(cardEl, targetEl, from, rSrc0, rTgt0) : [];
  // o lobby_update só redesenha a mesa depois da resposta do servidor E do fim da animação
  let pending = 1 + anims.length;
  let failed = false;
  const done = () => {
    if (--pending > 0) return;
    teamSwapBusy = Math.max(0, teamSwapBusy - 1);
    flushDeferredLobby();
  };
  anims.forEach(an => an.finished.then(done, done));
  socket.emit('place_player', { seat, team, slot }, (res) => {
    if (res && !res.ok) {
      failed = true;
      anims.forEach(an => an.cancel());
      if (cardEl.isConnected && targetEl.isConnected) swapNodes(cardEl, targetEl); // desfaz na tela
      if (errEl) errEl.textContent = res.error || 'Não foi possível mover o jogador.';
    }
    done();
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
      hint.textContent = ''; // o próprio botão já mostra "Aguardando jogadores… (1/4)"
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
let phaseWatchdog = null;

// Não existe mais a fase de desenho de 45s antes da partida: o avatar é feito na
// seção "Avatar" da tela inicial. Quando o host inicia, o servidor ainda abre a
// "fase de avatar" (character_phase_start); aqui a gente responde na hora com o
// avatar que a pessoa já salvou (ou o boneco padrão), e todo mundo fica "pronto"
// sozinho — a partida começa sem ninguém precisar desenhar nem esperar.
function sendMyCharacter() {
  const send = (dataUrl) => socket.emit('update_character', { character: dataUrl }, () => {});
  const saved = getSavedCharacter();
  if (saved) return send(saved);
  try {
    const base = document.getElementById('character-base');
    const c = document.createElement('canvas');
    c.width = 500; c.height = 500;
    c.getContext('2d').drawImage(base, 0, 0, c.width, c.height);
    send(c.toDataURL('image/png'));
  } catch (e) { /* sem canvas: o servidor segue com o boneco padrão */ }
}

socket.on('character_phase_start', ({ durationMs } = {}) => {
  sendMyCharacter();
  // se a partida não vier (conexão/servidor), pede pro servidor ressincronizar
  clearTimeout(phaseWatchdog);
  phaseWatchdog = setTimeout(() => {
    if (!myRoomCode) return;
    if (document.getElementById('screen-game').classList.contains('active')) return;
    if (socket.connected) tryRejoin(); else socket.connect();
  }, (durationMs || 45000) + 4000);
});

socket.on('character_all_ready', () => {
  if (window.GameAudio) GameAudio.endMusic(); // todo mundo pronto: música some em fade out
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
  clearSession();
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
  if (window.TruStarterDraw) TruStarterDraw.play(state); // roleta do sorteio de quem começa (só vem em state.draw na 1ª mão)
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
  clearTimeout(phaseWatchdog);

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
  viraKeySeen = null; viraPendingSeen = false; viraForce = true; // partida nova: o vira sempre entra animado
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
  // vira: some enquanto ainda estão escolhendo; quando a carta é escolhida entra com a
  // animação (fade in virado -> vira -> vai pro monte)
  if (!state.vira) {
    viraFadeOut();
    if (state.viraPick) viraPendingSeen = true;
  } else {
    const viraKey = state.maoNumber + ':' + state.vira.id;
    if (viraForce || viraKey !== viraKeySeen) {
      viraShowSnap();
      const freshHand = viraForce || viraPendingSeen || viraKeySeen !== null; // reconectar no meio da mão não anima
      viraKeySeen = viraKey;
      viraForce = false;
      viraPendingSeen = false;
      if (freshHand) {
        // na 1ª mão espera a intro da logo sumir (mesmo atraso da distribuição das cartas)
        const wait = dealAnim ? Math.max(0, dealAnim.start - performance.now()) : 0;
        playViraIntro(state.vira, wait);
      }
    }
  }

  // nomes e cadeiras
  // limpa só as cadeiras sem jogador (zerar todas apagava o nome, porque o
  // setNameEl pula a escrita quando a "assinatura" não mudou)
  const occupied = new Set(state.players.map(p => seatOffsetLabel(p.seat, n)));
  ['top', 'left', 'right'].forEach(pos => {
    const nameEl = document.getElementById(`name-${pos}`);
    if (nameEl && !occupied.has(pos)) { nameEl.textContent = '—'; delete nameEl.dataset.sig; }
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
    const isActive = state.turnSeat === p.seat && !state.viraPick;
    if (seatEl) seatEl.classList.toggle('active-seat', isActive);
    if (avatarEl) {
      const src = p.character || 'assets/personagem.svg';
      if (avatarEl.getAttribute('src') !== src) avatarEl.setAttribute('src', src);
    }
    // vitórias/derrotas do jogador (mostradas no card ao dar zoom no boneco)
    const figEl = document.getElementById(`figure-${pos}`);
    if (figEl) {
      if (p.handle) figEl.dataset.handle = p.handle; else delete figEl.dataset.handle;
      if (p.stats) { figEl.dataset.wins = p.stats.wins; figEl.dataset.losses = p.stats.losses; }
      else { delete figEl.dataset.wins; delete figEl.dataset.losses; }
      // tema que o jogador está usando (o card mostra nome + miniatura)
      if (p.theme) figEl.dataset.theme = p.theme; else delete figEl.dataset.theme;
      // caiu a conexão: avatar escurece e aparece a rodinha (até voltar ou o bot assumir)
      setSeatAway(figEl, !p.isBot && p.connected === false);
    }
    if (nameEl) {
      setNameEl(nameEl, p.name, '', p.nameFx, p.isBot, n === 4 && p.team === myTeam);
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
  const myTurnNow = state.turnSeat === mySeat && !state.pendingCall && !state.peek && !state.vote && !state.viraPick; // na mão de 11 ninguém joga durante a votação nem durante o peek
  // melou: só a(s) maior(es) carta(s) ficam claras e jogáveis; as outras escurecem
  const melouAllowed = (state.melou && Array.isArray(state.melou.allowedIds)) ? new Set(state.melou.allowedIds.map(String)) : null;
  myCards.forEach((card, i) => {
    let el = existing.get(String(card.id));
    if (!el) {
      el = buildCardEl(card, state.manilhaRank);
      applyDealAnimation(el, i);
      el.addEventListener('click', () => onCardClick(el._card, el._myTurn, el));
    }
    el._card = card;
    const cardOk = !melouAllowed || melouAllowed.has(String(card.id));
    el._myTurn = myTurnNow && cardOk;
    el.classList.toggle('manilha', card.rank === state.manilhaRank);
    el.classList.toggle('selected', card.id === selectedCardId);
    el.classList.toggle('disabled', !el._myTurn);
    el.classList.toggle('melou-dim', !!melouAllowed && !cardOk);
    el.classList.toggle('melou-top', !!melouAllowed && cardOk);
    if (handWrap.children[i] !== el) handWrap.insertBefore(el, handWrap.children[i] || null);
  });

  // contagem dos 10s da mão de 11
  updatePeekTimer(state);
  updateVoteUI(state);
  updateViraPickUI(state);

  // botões de ação
  updateActionButtons(state);

  // pedido pendente
  updateCallOverlay(state);
}

// ------------------------------------------------------------------
// Escolha do vira (toda mão): quem deu as cartas vê 3 cartas viradas e clica
// numa delas; os outros veem só o aviso "fulano está escolhendo o vira…".
// state.viraPick = { seat, msLeft, count }. A carta escolhida só é revelada
// pelo servidor depois do clique (aí roda a animação do vira).
// ------------------------------------------------------------------
let viraPickEndsAt = 0, viraPickInterval = null, viraPickSent = false;
let viraPickOrigin = null; // { cx, cy, w, h, t }: onde a carta clicada está na tela (a animação do vira sai dali)
let viraPickMine = false, viraLastSend = 0;

// ---- quem ESCOLHE: manda a posição do mouse (relativa à fileira de cartas), a carta sob o mouse e o clique ----
function sendViraCursor(e, k) {
  const cardsEl = document.getElementById('vira-pick-cards');
  if (!cardsEl) return;
  const r = cardsEl.getBoundingClientRect();
  if (!r.width || !r.height) return;
  const card = e.target && e.target.closest ? e.target.closest('.vira-pick-card') : null;
  const h = card ? Array.prototype.indexOf.call(cardsEl.children, card) : -1;
  const msg = { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height, h: h };
  if (k !== undefined) msg.k = k;
  socket.emit('vira_cursor', msg);
}
['pointermove', 'pointerdown'].forEach((ev) => window.addEventListener(ev, (e) => {
  if (!viraPickMine || viraPickSent) return;
  const now = performance.now();
  if (ev === 'pointermove' && now - viraLastSend < 30) return;
  viraLastSend = now;
  sendViraCursor(e);
}, { passive: true }));

// ---- quem ASSISTE: ponteiro estilo macOS que segue o do jogador, suavizado ----
const VIRA_CURSOR_SVG =
  // faíscas do clique (riscos soltos em volta da ponta)
  '<svg class="vc-ring" viewBox="-50 -50 100 100" aria-hidden="true"><g fill="none" stroke="#fff8f0" stroke-width="5" stroke-linecap="round">' +
  '<path d="M-1 -27 L-3 -41"/><path d="M22 -17 L33 -27"/><path d="M28 3 L42 5"/><path d="M-24 -14 L-35 -22"/><path d="M-27 9 L-40 14"/><path d="M14 24 L22 35"/></g></svg>' +
  '<div class="vc-mb"><div class="vc-up">' +
  // seta branca, gordinha e desenhada à mão, com contorno de tinta
  '<svg class="vc-arrow" viewBox="0 0 40 48" aria-hidden="true">' +
  '<path d="M6 4.1 C4.9 3.7 4.2 4.8 4.5 6 L5.3 36.6 C5.4 38.2 6.9 38.7 8.1 37.6 L13.9 32 L19.5 43.3 C20.2 44.6 21.7 44.8 22.8 44.3 L26.6 42.5 C27.7 42 28 40.7 27.5 39.6 L21.9 28.6 L30.1 28.3 C31.8 28.2 32.5 26.4 31.2 25.1 L8.2 4.7 C7.5 4.2 6.8 4 6 4.1 Z" fill="#fff" stroke="#15101f" stroke-width="3.4" stroke-linejoin="round" stroke-linecap="round"/></svg>' +
  '</div></div>';

// filtro de "motion blur": borra SÓ na direção em que o mouse anda (o stdDeviation é atualizado a cada quadro)
let viraBlurNode = null;
function viraBlurFilter() {
  if (viraBlurNode && viraBlurNode.isConnected) return viraBlurNode;
  const NS = 'http://www.w3.org/2000/svg';
  const s = document.createElementNS(NS, 'svg');
  s.setAttribute('width', '0'); s.setAttribute('height', '0');
  s.setAttribute('aria-hidden', 'true');
  s.style.cssText = 'position:absolute;width:0;height:0;pointer-events:none';
  s.innerHTML = '<defs><filter id="vira-mb" x="-150%" y="-150%" width="400%" height="400%" color-interpolation-filters="sRGB"><feGaussianBlur stdDeviation="0 0"/></filter></defs>';
  document.body.appendChild(s);
  viraBlurNode = s.querySelector('feGaussianBlur');
  return viraBlurNode;
}
let viraCur = null; // { el, tx, ty, cx, cy, rot, seen, raf, last, squish }
function viraCursorEnsure(box) {
  if (viraCur && viraCur.el.parentNode === box) return viraCur;
  if (viraCur && viraCur.raf) cancelAnimationFrame(viraCur.raf);
  const el = document.createElement('div');
  el.className = 'vira-cursor';
  el.setAttribute('aria-hidden', 'true');
  el.innerHTML = VIRA_CURSOR_SVG;
  box.appendChild(el);
  viraBlurFilter();
  viraCur = { el, x: 0.5, y: 0.5, cx: 0, cy: 0, vx: 0, vy: 0, sc: 1, scv: 0, st: 0, ang: 0, bl: 0, seen: false, raf: 0, last: 0, squish: 0 };
  viraCur.mb = el.querySelector('.vc-mb'); viraCur.up = el.querySelector('.vc-up');
  return viraCur;
}
function viraCursorTick(now) {
  const c = viraCur;
  if (!c) return;
  c.raf = 0;
  const box = document.getElementById('vira-pick');
  const cardsEl = document.getElementById('vira-pick-cards');
  if (!box || box.classList.contains('hidden') || box.classList.contains('mine') || !c.el.parentNode) return;
  const r = cardsEl.getBoundingClientRect();
  const tx = r.left + c.x * r.width, ty = r.top + c.y * r.height;
  const dt = Math.min(0.05, Math.max(0.001, (now - (c.last || now)) / 1000));
  c.last = now;
  // mola: o ponteiro é "puxado" até o ponto do mouse, passa um tiquinho e assenta (elástico)
  const K = 340, D = 2 * 0.62 * Math.sqrt(K);
  const n = 3, h = dt / n;
  for (let i = 0; i < n; i++) {
    c.vx += ((tx - c.cx) * K - c.vx * D) * h; c.vy += ((ty - c.cy) * K - c.vy * D) * h;
    c.cx += c.vx * h; c.cy += c.vy * h;
    const ts = c.squish > now ? 0.8 : 1;             // clique: afunda e volta com um "boing"
    c.scv += ((ts - c.sc) * 520 - c.scv * 24) * h; c.sc += c.scv * h;
  }
  // estica na direção em que anda (e achata um pouco de lado), voltando ao normal quando para
  const speed = Math.hypot(c.vx, c.vy);
  if (speed > 40) c.ang = Math.atan2(c.vy, c.vx) * 180 / Math.PI;
  c.st += (Math.min(0.26, speed / 3200) - c.st) * (1 - Math.exp(-dt * 14));
  c.el.style.transform = 'translate3d(' + c.cx.toFixed(1) + 'px,' + c.cy.toFixed(1) + 'px,0) scale(' + c.sc.toFixed(3) + ')';
  // o miolo gira pra direção do movimento: estica e borra naquele eixo, e o desenho gira de volta pra ficar em pé
  c.mb.style.transform = 'rotate(' + c.ang.toFixed(1) + 'deg) scale(' + (1 + c.st).toFixed(3) + ',' + (1 - c.st * 0.45).toFixed(3) + ')';
  c.up.style.transform = 'rotate(' + (-c.ang).toFixed(1) + 'deg)';
  c.bl += (Math.min(9, Math.max(0, speed - 90) / 150) - c.bl) * (1 - Math.exp(-dt * 16));   // motion blur em px
  if (c.bl > 0.35) {
    viraBlurFilter().setAttribute('stdDeviation', c.bl.toFixed(2) + ' 0');
    c.mb.style.filter = 'url(#vira-mb)';
  } else c.mb.style.filter = 'none';
  c.raf = requestAnimationFrame(viraCursorTick);
}
function handleViraCursor(m) {
  const st = latestState;
  const box = document.getElementById('vira-pick');
  if (!m || !st || !st.viraPick || !box || box.classList.contains('hidden')) return;
  if (m.seat !== st.viraPick.seat || m.seat === mySeat) return;      // só o cursor de quem está escolhendo
  const cardsEl = document.getElementById('vira-pick-cards');
  const c = viraCursorEnsure(box);
  c.x = +m.x; c.y = +m.y;
  if (!c.seen) {                                                      // 1º sinal: aparece já no lugar (sem voar do canto)
    const r = cardsEl.getBoundingClientRect();
    c.cx = r.left + c.x * r.width; c.cy = r.top + c.y * r.height; c.vx = c.vy = 0;
    c.seen = true; c.el.classList.add('show');
  }
  // mesma "mão sobre a carta" que o jogador vê
  Array.prototype.forEach.call(cardsEl.children, (cd, i) => cd.classList.toggle('sim-hover', i === m.h && !box.classList.contains('sent')));
  if (m.k >= 0 && cardsEl.children[m.k] && !box.classList.contains('sent')) {   // clicou: a carta escolhida fica em destaque e a animação do vira sai dela
    const cd = cardsEl.children[m.k];
    cd.classList.remove('sim-hover');
    box.classList.add('sent');
    cd.classList.add('chosen');
    cd.style.transition = 'none'; void cd.offsetWidth;
    const r = cd.getBoundingClientRect();
    viraPickOrigin = { cx: r.left + r.width / 2, cy: r.top + r.height / 2, w: r.width, h: r.height, t: performance.now() };
    cd.style.transition = '';
    c.squish = performance.now() + 140;
    c.el.classList.remove('click'); void c.el.offsetWidth; c.el.classList.add('click');   // anel de clique
  }
  if (!c.raf) { c.last = 0; c.raf = requestAnimationFrame(viraCursorTick); }
}
function updateViraPickUI(state) {
  const box = document.getElementById('vira-pick');
  if (!box) return;
  const v = state.viraPick;
  if (!v) {
    clearInterval(viraPickInterval); viraPickInterval = null;
    box.classList.add('hidden');
    box.dataset.key = '';
    viraPickSent = false;
    viraPickMine = false;
    if (viraCur) { if (viraCur.raf) cancelAnimationFrame(viraCur.raf); if (viraCur.el.parentNode) viraCur.el.parentNode.removeChild(viraCur.el); viraCur = null; }
    return;
  }
  const mine = v.seat === mySeat;
  const key = state.maoNumber + ':' + v.seat;
  const cardsEl = document.getElementById('vira-pick-cards');
  const titleEl = document.getElementById('vira-pick-title');
  if (box.dataset.key !== key) { // escolha nova: monta (ou limpa) as cartas
    box.dataset.key = key;
    viraPickSent = false;
    viraPickOrigin = null;
    box.classList.remove('sent');
    cardsEl.innerHTML = '';
    if (viraCur) { if (viraCur.raf) cancelAnimationFrame(viraCur.raf); if (viraCur.el.parentNode) viraCur.el.parentNode.removeChild(viraCur.el); viraCur = null; }
    if (!mine) { // quem assiste vê as mesmas cartas (só que sem poder clicar)
      for (let i = 0; i < (v.count || 3); i++) {
        const d = document.createElement('div');
        d.className = 'vira-pick-card';
        d.style.setProperty('--i', i);
        cardsEl.appendChild(d);
      }
    }
    if (mine) {
      for (let i = 0; i < (v.count || 3); i++) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'vira-pick-card';
        b.style.setProperty('--i', i);
        b.setAttribute('aria-label', 'Carta ' + (i + 1) + ' de ' + (v.count || 3));
        b.addEventListener('click', (ev) => {
          if (viraPickSent) return;
          viraPickSent = true;
          box.classList.add('sent');
          b.classList.add('chosen');
          // mede a carta já na posição final (sem a transição de 0,18s) pra animação do vira sair exatamente dela
          b.style.transition = 'none';
          void b.offsetWidth;
          const r = b.getBoundingClientRect();
          viraPickOrigin = { cx: r.left + r.width / 2, cy: r.top + r.height / 2, w: r.width, h: r.height, t: performance.now() };
          b.style.transition = '';
          if (window.GameAudio && GameAudio.cardPlay) { try { GameAudio.cardPlay(0); } catch (e) {} }
          sendViraCursor(ev, i);   // avisa os outros qual carta foi clicada (antes do pick_vira: depois dele a escolha já acabou no servidor)
          socket.emit('pick_vira', { index: i });
        });
        cardsEl.appendChild(b);
      }
    }
    // 1ª mão: só aparece depois da intro da logo
    const wait = dealAnim ? Math.max(0, dealAnim.start - performance.now()) : 0;
    box.style.setProperty('--pick-delay', Math.round(wait) + 'ms');
  }
  box.classList.toggle('mine', mine);
  box.classList.toggle('watch', !mine);
  viraPickMine = mine;
  viraPickEndsAt = Date.now() + Math.max(0, v.msLeft || 0);
  const owner = state.players.find(p => p.seat === v.seat);
  // "card" com o título grande e a contagem regressiva bem grande logo abaixo
  const paint = () => {
    const secs = Math.max(0, Math.ceil((viraPickEndsAt - Date.now()) / 1000));
    let head = titleEl.querySelector('.vp-head'), num = titleEl.querySelector('.vp-secs b');
    if (!head || !num) {
      titleEl.innerHTML = '<div class="vp-head"></div><div class="vp-secs"><b></b><span>s</span></div>';
      head = titleEl.querySelector('.vp-head'); num = titleEl.querySelector('.vp-secs b');
    }
    const headTxt = mine ? 'Escolha o vira!' : (owner ? owner.name : 'Alguém') + ' está escolhendo o vira…';
    if (head.textContent !== headTxt) head.textContent = headTxt;
    head.classList.toggle('watch', !mine);
    if (num.textContent !== String(secs)) num.textContent = secs;
    // do 8s pra 0 o número vai ficando vermelho aos poucos (branco -> vermelho)
    const left = Math.max(0, (viraPickEndsAt - Date.now()) / 1000);
    const t = Math.min(1, Math.max(0, (8 - left) / 8));
    const mix = (a, b) => Math.round(a + (b - a) * t);
    num.parentNode.style.color = 'rgb(' + mix(255, 255) + ',' + mix(255, 70) + ',' + mix(255, 55) + ')';
  };
  paint();
  if (!viraPickInterval) viraPickInterval = setInterval(paint, 250);
  box.classList.remove('hidden');
}

// ------------------------------------------------------------------
// Mão de ferro (11 x 11): votação "às cegas" ou "normal" — aparece pra todos
// ------------------------------------------------------------------
let voteEndsAt = 0, voteInterval = null;
function updateVoteUI(state) {
  const box = document.getElementById('vote-overlay');
  if (!box) return;
  const v = state.vote;
  if (!v) {
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
  // quem votou em quê (público) — nomes escapados via textContent
  const fill = (id, list, empty) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = list.length ? list.map(x => x.seat === mySeat ? x.name + ' (você)' : x.name).join(', ') : empty;
  };
  const votes = Array.isArray(v.votes) ? v.votes : [];
  fill('vote-list-cegas', votes.filter(x => x.choice === 'cegas'), '—');
  fill('vote-list-normal', votes.filter(x => x.choice === 'normal'), '—');
  fill('vote-list-wait', votes.filter(x => !x.choice), '—');
  document.getElementById('vote-status').textContent = v.myVote
    ? 'Seu voto: ' + (v.myVote === 'cegas' ? 'ÀS CEGAS' : 'NORMAL') + '. Você pode mudar até o tempo acabar.'
    : 'Vote! As cartas só serão sorteadas depois da votação.';
  box.classList.remove('hidden');
}
document.querySelectorAll('#vote-overlay .vote-btn').forEach(btn => {
  btn.addEventListener('click', () => socket.emit('mao11_vote', { choice: btn.dataset.choice }));
});
socket.on('score_changed', ({ score }) => {
  setBanner('Placar alterado pelo administrador: ' + score[0] + ' x ' + score[1], 2600);
});
socket.on('mao11_result', ({ blind, cegas, normal }) => {
  const placar = (cegas !== undefined) ? ' (' + cegas + ' às cegas x ' + normal + ' normal)' : '';
  setBanner((blind ? 'Mão de ferro: todo mundo joga ÀS CEGAS!' : 'Mão de ferro: jogo normal.') + placar, 3200);
  // as cartas acabaram de ser sorteadas: anima a distribuição
  startDealAnimation(3, 250);
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

// ------------------------------------------------------------------
// Animação do vira (começo de cada rodada)
// 1) um card GRANDE aparece no meio da tela, virado (costas), em fade in;
// 2) ele vira pra revelar qual é a carta;
// 3) encolhe e voa até o monte no canto, onde o vira fica de verdade.
// Enquanto isso o vira do monte fica escondido (.vira-pending). O card que
// voa é um clone criado no tamanho grande e ENCOLHIDO (fica nítido), e some
// quando chega. Ajustes: os tempos logo abaixo (em ms).
// ------------------------------------------------------------------
const VIRA_FADE_MS  = 450;  // fade in no meio da tela
const VIRA_HOLD1_MS = 300;  // pausa com as costas à mostra
const VIRA_FLIP_MS  = 650;  // giro revelando a carta
const VIRA_HOLD2_MS = 650;  // pausa pra todo mundo ver qual é o vira
const VIRA_FLY_MS   = 750;  // viagem até o monte
let viraKeySeen = null;     // 'mão:id' do último vira já tratado
let viraPendingSeen = false; // vimos a escolha do vira desta mão (então a animação vem depois)
let viraForce = false;      // força a animação (início de partida)
let viraIntro = null;       // animação em andamento

function viraIntroCleanup() {
  if (!viraIntro) return;
  clearTimeout(viraIntro.timer);
  clearTimeout(viraIntro.safety);
  viraIntro.anims.forEach(a => { try { a.cancel(); } catch (e) {} });
  if (viraIntro.el && viraIntro.el.parentNode) viraIntro.el.parentNode.removeChild(viraIntro.el);
  viraShowSnap(true);
  viraIntro = null;
}

// Fim da mão: o vira antigo some em fade out (e fica escondido até o vira novo chegar)
function viraFadeOut() {
  const disp = document.querySelector('.vira-display');
  if (disp) disp.classList.add('vira-out');
}
// Volta a mostrar o vira na hora (sem fade in). alsoPending: tira o "escondido
// até o card chegar" também (fim da animação de entrada).
function viraShowSnap(alsoPending) {
  const disp = document.querySelector('.vira-display');
  if (!disp) return;
  const had = disp.classList.contains('vira-out') || (alsoPending && disp.classList.contains('vira-pending'));
  if (!had) return;
  disp.classList.add('vira-snap');
  disp.classList.remove('vira-out');
  if (alsoPending) disp.classList.remove('vira-pending');
  void disp.offsetWidth; // aplica sem transição
  disp.classList.remove('vira-snap');
}

function playViraIntro(card, delayMs) {
  viraIntroCleanup();
  const disp = document.querySelector('.vira-display');
  const target = document.getElementById('vira-card');
  if (!disp || !target || !card || !target.animate) return;
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  // Quem clicou na carta: ela mesma vira e vai pro canto (sem fade no meio da tela)
  const origin = (viraPickOrigin && performance.now() - viraPickOrigin.t < 10000) ? viraPickOrigin : null;
  viraPickOrigin = null;

  disp.classList.add('vira-pending'); // esconde o vira do monte até o clone chegar
  const state = { timer: 0, safety: 0, anims: [], el: null };
  viraIntro = state;

  const go = () => {
    if (viraIntro !== state) return;
    const baseW = target.offsetWidth, baseH = target.offsetHeight;
    if (!baseW || !baseH) return viraIntroCleanup();

    // escala do clone: igual à carta clicada; pra quem só assiste, grande no meio da tela (~50% da altura)
    const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    const S = origin
      ? Math.max(0.5, origin.w / baseW)
      : Math.max(1.5, Math.min(window.innerHeight * 0.5 / baseH, window.innerWidth * 0.6 / baseW, 20 * rem / baseH));
    const W = baseW * S, H = baseH * S;
    const ox = origin ? origin.cx : window.innerWidth / 2;
    const oy = origin ? origin.cy : window.innerHeight / 2;

    const el = document.createElement('div');
    el.className = 'vira-fly';
    el.setAttribute('aria-hidden', 'true');
    el.style.cssText = '--s:' + S + ';left:' + ox + 'px;top:' + oy + 'px;width:' + W + 'px;height:' + H + 'px;margin:' + (-H / 2) + 'px 0 0 ' + (-W / 2) + 'px';
    const inner = document.createElement('div');
    inner.className = 'vira-fly-inner';
    const back = document.createElement('div');
    back.className = 'vira-fly-face vira-fly-back';
    const front = document.createElement('div');
    renderMiniCard(front, card);                        // mesma carta/cores do vira de verdade
    front.classList.add('vira-fly-face', 'vira-fly-front');
    front.style.fontSize = ((parseFloat(getComputedStyle(target).fontSize) || 19) * S) + 'px';
    inner.appendChild(back); inner.appendChild(front);
    el.appendChild(inner);
    document.body.appendChild(el);
    state.el = el;

    // destino: centro do vira no monte (canto)
    const tr = target.getBoundingClientRect();
    const dx = (tr.left + tr.width / 2) - ox;
    const dy = (tr.top + tr.height / 2) - oy;

    // quem clicou: vira na hora. quem assiste: pequeno "pop" (sem fade) e uma pausa com as costas à mostra
    const tFlip = origin ? 0 : 160 + VIRA_HOLD1_MS;
    const tFly = tFlip + VIRA_FLIP_MS + VIRA_HOLD2_MS;
    const total = tFly + VIRA_FLY_MS;

    if (!origin) {
      state.anims.push(el.animate(
        [{ transform: 'scale(0.9)' }, { transform: 'scale(1)' }],
        { duration: 160, easing: 'ease-out', fill: 'backwards' }));
    }
    state.anims.push(inner.animate(
      [{ transform: 'rotateY(0deg)' }, { transform: 'rotateY(180deg)' }],
      { delay: tFlip, duration: VIRA_FLIP_MS, easing: 'cubic-bezier(.45,0,.25,1)', fill: 'forwards' }));
    const fly = el.animate(
      [{ transform: 'translate(0px,0px) scale(1) rotate(0deg)' },
       { transform: 'translate(' + dx + 'px,' + dy + 'px) scale(' + (1 / S) + ') rotate(-2deg)' }],
      { delay: tFly, duration: VIRA_FLY_MS, easing: 'cubic-bezier(.6,0,.2,1)', fill: 'forwards' });
    state.anims.push(fly);
    fly.onfinish = () => { if (viraIntro === state) viraIntroCleanup(); };
    state.safety = setTimeout(() => { if (viraIntro === state) viraIntroCleanup(); }, total + 400);

    // sons: carta virando e carta pousando no monte
    if (window.GameAudio) {
      try { GameAudio.cardDeal((tFlip + VIRA_FLIP_MS * 0.35) / 1000, 0); } catch (e) {}
      try { GameAudio.cardPlay((total - 60) / 1000); } catch (e) {}
    }
  };

  // com a carta clicada na tela, começa NA HORA (a caixa de escolha some no mesmo quadro, sem piscar)
  if (origin && !(delayMs > 0)) go();
  else state.timer = setTimeout(go, delayMs || 0);
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
  const isMyTurn = state.turnSeat === mySeat && !state.viraPick; // ninguém age enquanto escolhem o vira
  const maoDe11 = !!state.score && (state.score[0] === 11 || state.score[1] === 11); // mão de 11: truco bloqueado
  // quem pediu (ou aceitou) a última aposta não pode aumentar de novo: quem sobe é o adversário
  const iRaisedLast = state.lastRaiserTeam !== undefined && state.lastRaiserTeam !== null && state.lastRaiserTeam === myTeam;
  const canCall = isMyTurn && !state.pendingCall && !state.gameOver && !maoDe11 && !iRaisedLast;
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
  btnTruco.title = maoDe11 ? 'Na mão de 11 não pode pedir truco' : (iRaisedLast ? 'Aguarde o adversário aumentar' : '');

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
  setBanner('MELOU! Cada um joga a sua maior carta — dá pra blefar e pedir truco!', 2600);
});

socket.on('showdown_result', ({ winnerTeam }) => {
  const mine = winnerTeam === myTeam;
  setBanner(mine ? 'Vocês têm a maior carta!' : 'Eles têm a maior carta!', 2000);
});

socket.on('mao_result', ({ winnerTeam, points, teamName, ran }) => {
  viraFadeOut();
  const mine = winnerTeam === myTeam;
  setBanner(`${mine ? 'Vocês' : 'Eles'} ${ran ? 'ganharam por fuga' : 'venceram a mão'}: +${points} pontos!`);
});

socket.on('game_over', ({ winnerTeam, score }) => {
  const mine = winnerTeam === myTeam;
  const logged = window.TruAccount && TruAccount.isLoggedIn();
  if (window.TruStats && !statsCounted && !logged) { // com conta, quem conta é o servidor
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

socket.on('chat_message', ({ name, text, seat, nameFx, isBot }) => {
  const wrap = document.getElementById('chat-messages');
  const row = document.createElement('div');
  row.innerHTML = `<b>${nameFxHtml(name, nameFx)}${isBot ? '<span class="bot-tag">BOT</span>' : ''}:</b> ${escapeHtml(text)}`;
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

// Efeitos de nome (só o admin tem; ver `auth nome`). A lista precisa bater com o servidor e o style.css.
const NAME_FX = new Set(['fogo', 'arco-iris', 'neon', 'glitch', 'gelo', 'ouro', 'eletrico', 'galaxia', 'sangue', 'matrix']);
function nameFxHtml(name, fx) {
  return fx && NAME_FX.has(fx) ? `<span class="nfx nfx-${fx}">${escapeHtml(name)}</span>` : escapeHtml(name);
}
// escreve o nome num elemento só quando algo mudou (recriar a cada atualização reiniciaria a animação)
// Ícone de parceiro (dois bonequinhos, estilo MSN): aparece ao lado do nome do seu parceiro de dupla.
let partnerIconReady = false;
function ensurePartnerIcon() {
  if (partnerIconReady) return;
  partnerIconReady = true;
  const holder = document.createElement('div');
  holder.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden';
  holder.setAttribute('aria-hidden', 'true');
  holder.innerHTML =
    '<svg xmlns="http://www.w3.org/2000/svg"><symbol id="i-partner" viewBox="0 0 64 40">' +
    // pílula amarela (destaca de longe) com duas silhuetas pretas: leitura imediata de "dupla"
    '<rect x="2" y="2" width="60" height="36" rx="18" fill="#ffd23f" stroke="#0a0a0a" stroke-width="3.4"/>' +
    '<circle cx="23" cy="14.5" r="5.6" fill="#0a0a0a"/>' +
    '<path d="M12 33 Q12 22.5 23 22.5 Q34 22.5 34 33 Z" fill="#0a0a0a"/>' +
    '<circle cx="41" cy="13.5" r="6.4" fill="#0a0a0a" stroke="#ffd23f" stroke-width="2.4"/>' +
    '<path d="M27.5 34 Q27.5 22 41 22 Q54.5 22 54.5 34 Z" fill="#0a0a0a" stroke="#ffd23f" stroke-width="2.4" stroke-linejoin="round"/>' +
    '</symbol></svg>';
  document.body.appendChild(holder);
}
function setNameEl(el, name, suffix, fx, isBot, isPartner) {
  name = (name === undefined || name === null || String(name).trim() === '') ? 'Jogador' : name;
  const sig = name + '|' + (suffix || '') + '|' + (fx || '') + '|' + (isBot ? 'bot' : '') + '|' + (isPartner ? 'pt' : '');
  // só pula a escrita se o elemento realmente já mostra esse nome
  // (se estiver com o placeholder "—", escreve de novo)
  if (el.dataset.sig === sig && el.textContent.trim() !== '—') return;
  el.dataset.sig = sig;
  if (isPartner) ensurePartnerIcon();
  el.innerHTML = nameFxHtml(name, fx) + (isBot ? '<span class="bot-tag">BOT</span>' : '') + escapeHtml(suffix || '') +
    (isPartner ? '<svg class="partner-icon" role="img" aria-label="Seu parceiro" viewBox="0 0 64 40"><title>Seu parceiro</title><use href="#i-partner"/></svg>' : '');
}
