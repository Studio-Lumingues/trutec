// ============================================================================
// CONTA (login Google via Supabase + escolha do @)
// - TruAccount.getToken()      -> Promise do token de login (ou null = convidado)
// - TruAccount.isLoggedIn()    -> true se já tem conta COM @
// - TruAccount.syncCharacter() -> manda o avatar salvo pro perfil (aparece em /@seu_arroba)
// O servidor (Render) é quem grava vitórias/derrotas; aqui só fazemos login e UI.
// ============================================================================
(function () {
  var sb = null;
  try {
    if (window.supabase && typeof SUPABASE_URL === 'string' && SUPABASE_URL.indexOf('SEU-PROJETO') < 0) {
      // persistSession + autoRefreshToken: o login fica salvo no aparelho e é renovado
      // sozinho, então a pessoa não precisa entrar de novo a cada visita.
      sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
      });
    }
  } catch (e) { sb = null; }

  var API = (typeof RESOLVED_BACKEND_URL === 'string') ? RESOLVED_BACKEND_URL : '';
  var profile = null, signedIn = false, loaded = false;
  var resolveReady, readyP = new Promise(function (r) { resolveReady = r; });

  function getToken() {
    if (!sb) return Promise.resolve(null);
    return sb.auth.getSession()
      .then(function (r) { return r && r.data && r.data.session ? r.data.session.access_token : null; })
      .catch(function () { return null; });
  }

  function api(path, method, body) {
    return getToken().then(function (t) {
      var headers = { 'Content-Type': 'application/json' };
      if (t) headers.Authorization = 'Bearer ' + t;
      return fetch(API + path, { method: method || 'GET', headers: headers, body: body ? JSON.stringify(body) : undefined });
    }).then(function (r) { return r.json().catch(function () { return { ok: false, error: 'Resposta inválida.' }; }); })
      .catch(function () { return { ok: false, error: 'Servidor indisponível. Tente de novo.' }; });
  }

  function $(id) { return document.getElementById(id); }
  var modal = $('account-modal'), btn = $('btn-account');
  var secs = { loading: $('acc-loading'), out: $('acc-out'), claim: $('acc-claim'), inn: $('acc-in') };
  var errEl = $('acc-error');

  function show(which) {
    Object.keys(secs).forEach(function (k) { if (secs[k]) secs[k].hidden = (k !== which); });
    if (errEl) errEl.textContent = '';
  }
  function profileUrl(h) { return location.origin + '/@' + h; }

  function refreshUI() {
    try { document.dispatchEvent(new Event('truaccount')); } catch (e) {}   // avisa o gate.js
    if (btn) btn.textContent = profile ? '@' + profile.handle : (signedIn ? 'Escolher meu @' : 'Entrar com Google');
    if (profile) {
      $('acc-name').textContent = '@' + profile.handle;
      $('acc-record').textContent = profile.wins + ' vitórias · ' + profile.losses + ' derrotas';
      $('acc-view').href = '/@' + profile.handle;
      var nameInput = $('input-name');
      if (nameInput && !nameInput.value) nameInput.value = profile.handle;
    }
  }

  function load() {
    if (!sb) { loaded = true; return Promise.resolve(); }
    return getToken().then(function (t) {
      signedIn = !!t;
      if (!t) { profile = null; return; }
      return api('/api/me').then(function (r) { profile = r && r.ok ? r.profile : null; });
    }).then(function () { loaded = true; refreshUI(); });
  }

  function tellSocket() { // avisa o servidor do jogo que o login mudou (sem reconectar)
    getToken().then(function (t) { if (typeof socket !== 'undefined' && socket.connected) socket.emit('auth_refresh', { token: t }); });
  }

  function open() {
    if (!modal) return;
    if (!sb) {
      show('out'); errEl.textContent = 'Login ainda não configurado (faltam as chaves do Supabase no config.js).';
      $('acc-google').disabled = true;
    } else if (!loaded) show('loading');
    else if (profile) show('inn');
    else if (signedIn) show('claim');
    else show('out');
    modal.classList.remove('hidden');
    if (!loaded) load().then(function () { if (!modal.classList.contains('hidden')) open(); });
  }
  function close() { if (modal) modal.classList.add('hidden'); }

  function signInGoogle() {
    if (!sb) return Promise.resolve({ error: 'Login não configurado.' });
    return sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: location.origin + location.pathname } })
      .then(function (r) { return { error: r && r.error ? 'Não deu pra abrir o login do Google.' : null }; })
      .catch(function () { return { error: 'Não deu pra abrir o login do Google.' }; });
  }

  function syncCharacter() {
    if (!profile) return;
    var ch = null;
    try { ch = localStorage.getItem('trutec_meu_personagem'); } catch (e) {}
    if (!ch || ch.indexOf('data:image/png;base64,') !== 0) return;
    var sig = ch.length + ':' + ch.slice(-40), last = null;
    try { last = localStorage.getItem('trutec-char-synced'); } catch (e) {}
    if (last === sig + ':' + profile.handle) return;
    api('/api/me/character', 'PUT', { character: ch }).then(function (r) {
      if (r && r.ok) { try { localStorage.setItem('trutec-char-synced', sig + ':' + profile.handle); } catch (e) {} }
    });
  }

  if (btn) btn.addEventListener('click', open);
  if ($('acc-close')) $('acc-close').addEventListener('click', close);
  if (modal) modal.addEventListener('click', function (e) { if (e.target === modal) close(); });

  if ($('acc-google')) $('acc-google').addEventListener('click', function () {
    if (!sb) return;
    signInGoogle().then(function (r) { if (r.error) errEl.textContent = r.error; });
  });

  var handleInput = $('acc-handle');
  if (handleInput) handleInput.addEventListener('input', function () {
    handleInput.value = handleInput.value.toLowerCase().replace(/^@/, '').replace(/[^a-z0-9_]/g, '');
  });
  function saveHandle() {
    var h = handleInput.value.trim();
    if (!/^[a-z0-9_]{3,16}$/.test(h)) { errEl.textContent = 'Use de 3 a 16 caracteres: letras minúsculas, números e _.'; return; }
    errEl.textContent = 'Salvando…';
    $('acc-save').disabled = true;
    api('/api/profile', 'POST', { handle: h }).then(function (r) {
      $('acc-save').disabled = false;
      if (!r || !r.ok) { errEl.textContent = (r && r.error) || 'Erro ao salvar.'; return; }
      profile = r.profile; refreshUI(); tellSocket(); syncCharacter(); show('inn');
    });
  }
  if ($('acc-save')) $('acc-save').addEventListener('click', saveHandle);
  if (handleInput) handleInput.addEventListener('keydown', function (e) { if (e.key === 'Enter') saveHandle(); });

  if ($('acc-copy')) $('acc-copy').addEventListener('click', function () {
    if (!profile) return;
    var url = profileUrl(profile.handle), b = $('acc-copy');
    var done = function () { b.textContent = 'Copiado!'; setTimeout(function () { b.textContent = 'Copiar link'; }, 1500); };
    if (navigator.clipboard) navigator.clipboard.writeText(url).then(done, function () { errEl.textContent = url; });
    else errEl.textContent = url;
  });

  if ($('acc-logout')) $('acc-logout').addEventListener('click', function () {
    if (!sb) return;
    sb.auth.signOut().then(function () { location.reload(); });
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && modal && !modal.classList.contains('hidden')) close();
  });

  window.TruAccount = {
    getToken: getToken,
    isLoggedIn: function () { return !!profile; },
    isSignedIn: function () { return signedIn; },   // tem sessão Google (mesmo sem @ ainda)
    enabled: !!sb,                                   // false = Supabase não configurado
    ready: function () { return readyP; },           // resolve quando já sabemos se está logado
    isReady: function () { return loaded; },
    api: api,
    signInGoogle: signInGoogle,
    logout: function () { if (sb) sb.auth.signOut().then(function () { location.reload(); }); },
    openModal: open,
    syncCharacter: syncCharacter,
    profile: function () { return profile; }
  };

  // ao carregar: descobre se já está logado; se entrou agora e falta o @, abre a escolha
  function boot() {
    load().then(function () {
      refreshUI();
      if (signedIn && !profile) open();   // acabou de voltar do Google, falta escolher o @
      else syncCharacter();
      resolveReady();
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
