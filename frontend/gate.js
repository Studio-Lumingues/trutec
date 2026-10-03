// ============================================================================
// PORTÃO DE LOGIN (primeira visita + recursos só para quem tem conta)
// - Primeira vez no site (sem login e sem ter escolhido "convidado"): aparece
//   a tela de boas-vindas com "Entrar com Google" ou "Jogar como convidado".
// - Convidado joga normalmente, mas NÃO pode editar o avatar nem abrir o Social.
//   Ao clicar nesses botões aparece o pedido de login com Google.
// - Quem entrou com Google fica logado: o Supabase guarda a sessão no aparelho e
//   renova sozinho (ver account.js), então não precisa entrar a cada visita.
// - A escolha de "convidado" fica salva; sair da conta volta a mostrar a tela.
// Depende do account.js (TruAccount). Carrega logo depois dele.
// ============================================================================
(function () {
  var acc = window.TruAccount;
  // Estado "portão aberto": enquanto a tela de boas-vindas estiver na frente, o guia (tutorial.js)
  // e a música (audio.js) esperam. Eles perguntam via TruGate.blocking() e ouvem o evento 'trugate'.
  var blocking = !!(acc && acc.enabled);       // até saber se vai aparecer a boas-vindas, segura
  var welcomeOpen = false;                     // tela de boas-vindas visível
  function setBlocking(v) {
    v = !!v;
    if (v === blocking) return;
    blocking = v;
    try { document.dispatchEvent(new Event('trugate')); } catch (e) {}
  }
  // logou com Google mas ainda não escolheu o @ (a caixa de criar @ está na frente)
  function needsHandle() {
    return !!(acc && acc.isReady() && acc.isSignedIn() && !acc.isLoggedIn());
  }
  // o guia e a música só liberam quando nenhuma tela de entrada está na frente
  function refreshBlocking() {
    setBlocking(welcomeOpen || needsHandle());
  }
  window.TruGate = { blocking: function () { return blocking; } };
  if (!acc || !acc.enabled) return;            // Supabase não configurado: não trava nada

  var GUEST_KEY = 'trutec-guest';
  var LOCKED = ['btn-open-character-editor', 'btn-open-social'];

  function isGuest() { try { return localStorage.getItem(GUEST_KEY) === '1'; } catch (e) { return false; } }
  function setGuest(v) { try { if (v) localStorage.setItem(GUEST_KEY, '1'); else localStorage.removeItem(GUEST_KEY); } catch (e) {} }

  // ---- janela ----
  var modal = document.createElement('div');
  modal.id = 'gate-modal';
  modal.className = 'settings-modal hidden';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-labelledby', 'gate-title');
  modal.innerHTML =
    '<div class="settings-card gate-card">' +
      '<h2 id="gate-title"></h2>' +
      '<p class="modal-hint" id="gate-text"></p>' +
      '<button type="button" class="btn btn-primary" id="gate-google">Entrar com Google</button>' +
      '<button type="button" class="btn btn-secondary" id="gate-skip"></button>' +
      '<p class="error-text" id="gate-error"></p>' +
    '</div>';
  document.body.appendChild(modal);

  var titleEl = modal.querySelector('#gate-title');
  var textEl = modal.querySelector('#gate-text');
  var googleBtn = modal.querySelector('#gate-google');
  var skipBtn = modal.querySelector('#gate-skip');
  var errEl = modal.querySelector('#gate-error');
  var dismissible = false;

  function openGate(kind) {
    if (kind === 'welcome') {
      titleEl.textContent = 'Bem-vindo ao TruTEC';
      textEl.textContent = 'Entre com o Google para guardar suas vitórias, criar seu avatar e usar o Social. Ou jogue agora como convidado.';
      skipBtn.textContent = 'Jogar como convidado';
      dismissible = false;
      welcomeOpen = true;
      setBlocking(true);
    } else {
      titleEl.textContent = 'Entre para continuar';
      textEl.textContent = 'Avatar e Social são só para quem tem conta. Entre com o Google, é rapidinho e você não precisa entrar de novo nas próximas vezes.';
      skipBtn.textContent = 'Agora não';
      dismissible = true;
    }
    errEl.textContent = '';
    googleBtn.disabled = false;
    modal.classList.remove('hidden');
    googleBtn.focus();
  }
  function closeGate() { modal.classList.add('hidden'); welcomeOpen = false; refreshBlocking(); }

  googleBtn.addEventListener('click', function () {
    googleBtn.disabled = true;
    errEl.textContent = 'Abrindo o Google…';
    acc.signInGoogle().then(function (r) {
      if (r && r.error) { errEl.textContent = r.error; googleBtn.disabled = false; }
    });
  });
  skipBtn.addEventListener('click', function () {
    if (!dismissible) setGuest(true);          // boas-vindas: lembra que escolheu convidado
    closeGate();
  });
  modal.addEventListener('click', function (e) { if (e.target === modal && dismissible) closeGate(); });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && dismissible && !modal.classList.contains('hidden')) closeGate();
  });

  // ---- bloqueio dos botões Avatar e Social ----
  function refreshLocks() {
    var locked = acc.isReady() && !acc.isLoggedIn();
    LOCKED.forEach(function (id) {
      var b = document.getElementById(id);
      if (b) b.classList.toggle('gate-locked', locked);
    });
  }

  LOCKED.forEach(function (id) {
    var b = document.getElementById(id);
    if (!b) return;
    // captura + stopImmediatePropagation: roda antes do client.js/social.js/screen-open.js
    b.addEventListener('click', function (e) {
      if (acc.isReady() && acc.isLoggedIn()) return;       // tem conta com @: segue normal
      e.preventDefault();
      e.stopImmediatePropagation();
      if (!acc.isReady()) {                                // ainda checando o login: espera e tenta de novo
        acc.ready().then(function () { b.click(); });
        return;
      }
      if (acc.isSignedIn()) acc.openModal();               // logou mas falta escolher o @
      else openGate('locked');
    }, true);
  });

  document.addEventListener('truaccount', function () {
    refreshLocks();
    if (acc.isSignedIn()) { setGuest(false); closeGate(); }   // closeGate já reavalia o bloqueio
    else refreshBlocking();
  });

  // ---- primeira visita ----
  acc.ready().then(function () {
    refreshLocks();
    if (!acc.isSignedIn() && !isGuest()) openGate('welcome');
    else refreshBlocking();     // se já está logado mas sem @, o guia continua esperando
  });
})();
