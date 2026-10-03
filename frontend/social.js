// ============================================================================
// SOCIAL (botão "Social" na tela inicial)
// Layout estilo Letterboxd: barra no topo (logo = voltar, aba Amigos, lupa),
// card grande à esquerda com o PERFIL (começa mostrando o seu: nome, boneco,
// estatísticas e a sua coleção) e a seção Amigos à direita.
// - Coleção: 3 espaços (estilo "filmes favoritos" do Letterboxd). No SEU perfil começam
//   vazios: clique no + e escolha qual boneco da sua coleção (os avatares do editor) fica ali.
//   Nos perfis dos outros só aparecem os espaços preenchidos.
//   Clicar num deles abre o boneco bem grande no meio da tela (clique fora,
//   no X ou Esc fecham). Pra voltar ao seu perfil, é só abrir o Social de novo.
// - Lupa: abre o campo de busca por @. Consulta GET {backend}/api/profile/<@>
//   e troca o card pelo perfil encontrado.
// Formato esperado da resposta:
//   { ok: true, profile: { handle, wins, losses, createdAt,
//                          character: "data:image/png;base64,...",   // em uso
//                          collection: [png|null, png|null, png|null] // opcional
//                        } }
// Se o servidor não manda "collection", a seção Coleção fica escondida.
// Depende do showScreen() do client.js (por isso carrega depois dele).
// ============================================================================
(function () {
  var openBtn = document.getElementById('btn-open-social');
  var logoBtn = document.getElementById('btn-close-social');
  if (!openBtn || !logoBtn || typeof showScreen !== 'function') return;

  var form = document.getElementById('social-search');
  var input = document.getElementById('social-input');
  var lupa = document.getElementById('social-search-btn');
  var msg = document.getElementById('social-msg');
  var avatarEl = document.getElementById('sp-avatar');
  var nameEl = document.getElementById('sp-name');
  var handleEl = document.getElementById('sp-handle');
  var bioEl = document.getElementById('sp-bio');
  var winsEl = document.getElementById('sp-wins');
  var lossesEl = document.getElementById('sp-losses');
  var rateEl = document.getElementById('sp-rate');
  var colWrap = document.getElementById('sp-collection-wrap');
  var slotsEl = document.getElementById('sp-slots');

  var DEFAULT_AVATAR = 'assets/personagem.svg';
  var PNG = 'data:image/png;base64,';
  var reqId = 0;           // ignora respostas de buscas antigas
  var shownHandle = '';
  var viewingOther = false;   // true enquanto o card mostra o perfil de outra pessoa

  // ---- logo (a mesma do lobby, recortada justo) como botão de voltar ----
  (function () {
    var src = document.querySelector('.site-logo-top');
    if (!src) { logoBtn.textContent = 'TruTEC'; return; }
    var logo = src.cloneNode(true);
    logo.removeAttribute('class');
    logo.removeAttribute('role');
    logo.setAttribute('aria-hidden', 'true');
    logo.setAttribute('viewBox', '143 120 1134 297');   // tira a margem em volta do texto
    logoBtn.appendChild(logo);
  })();

  function say(text, isError) {
    msg.textContent = text;
    msg.classList.toggle('error', !!isError);
    msg.hidden = !text;
  }
  function safeImg(v) { return typeof v === 'string' && v.indexOf(PNG) === 0 ? v : null; }
  function num(v) { v = parseInt(v, 10); return isFinite(v) && v > 0 ? v : 0; }
  function normalize(raw) { return String(raw || '').trim().toLowerCase().replace(/^@+/, ''); }

  // ---- coleção: cartazes retangulares; clicar abre o boneco grande no meio da tela ----
  var box = null, boxImg = null, boxFrom = null;
  function buildBox() {
    if (box) return;
    box = document.createElement('div');
    box.className = 'sp-lightbox hidden';
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');
    box.setAttribute('aria-label', 'Boneco ampliado');
    box.innerHTML = '<button type="button" class="sp-lightbox-close" aria-label="Fechar">\u00d7</button>' +
      '<div class="sp-stage"><div class="sp-tilt" id="sp-tilt">' +
      '<img class="sp-lightbox-img" alt="" draggable="false" />' +
      '<div class="sp-glare" aria-hidden="true"></div></div></div>';
    document.body.appendChild(box);
    boxImg = box.querySelector('img');
    box.addEventListener('click', closeBox);          // clicar em qualquer lugar fecha
    setupTilt();
  }

  // efeito 3D: o cartaz inclina conforme o mouse e uma luz acompanha o ponteiro
  var tilt = null;
  function setupTilt() {
    tilt = box.querySelector('.sp-tilt');
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    var MAX = 16, raf = 0, px = 0, py = 0;
    function apply() {
      raf = 0;
      var r = tilt.getBoundingClientRect();
      if (!r.width) return;
      var nx = Math.max(-1, Math.min(1, (px - (r.left + r.width / 2)) / (r.width / 2)));
      var ny = Math.max(-1, Math.min(1, (py - (r.top + r.height / 2)) / (r.height / 2)));
      var gx = Math.max(0, Math.min(100, (px - r.left) / r.width * 100));
      var gy = Math.max(0, Math.min(100, (py - r.top) / r.height * 100));
      tilt.style.setProperty('--rx', (-ny * MAX).toFixed(2) + 'deg');
      tilt.style.setProperty('--ry', (nx * MAX).toFixed(2) + 'deg');
      tilt.style.setProperty('--gx', gx.toFixed(1) + '%');
      tilt.style.setProperty('--gy', gy.toFixed(1) + '%');
      tilt.style.setProperty('--sx', (-nx * 1.6).toFixed(2) + 'rem');
      tilt.style.setProperty('--sy', (1.5 - ny * 1.2).toFixed(2) + 'rem');
      tilt.classList.add('lit');
    }
    box.addEventListener('pointermove', function (e) {
      px = e.clientX; py = e.clientY;
      tilt.classList.add('moving');
      if (!raf) raf = requestAnimationFrame(apply);
    });
    function reset() {
      tilt.classList.remove('moving', 'lit');
      tilt.style.setProperty('--rx', '0deg'); tilt.style.setProperty('--ry', '0deg');
      tilt.style.setProperty('--sx', '0rem'); tilt.style.setProperty('--sy', '1.5rem');
    }
    box.addEventListener('pointerleave', reset);
    box.addEventListener('pointerup', function (e) { if (e.pointerType !== 'mouse') reset(); });
    box._resetTilt = reset;
  }
  function openBox(src, from) {
    buildBox();
    boxImg.src = src;
    boxFrom = from;
    if (box._resetTilt) box._resetTilt();
    box.classList.remove('hidden');
    box.querySelector('button').focus();
  }
  function closeBox() {
    if (!box || box.classList.contains('hidden')) return;
    box.classList.add('hidden');
    boxImg.removeAttribute('src');
    if (boxFrom && boxFrom.isConnected) { try { boxFrom.focus(); } catch (e) {} }
    boxFrom = null;
  }
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && box && !box.classList.contains('hidden')) { e.stopPropagation(); closeBox(); }
  }, true);

  function renderCollection(collection, equipped, editable) {
    slotsEl.innerHTML = '';
    if (!Array.isArray(collection)) { colWrap.hidden = true; return; }
    var any = false;
    for (var i = 0; i < 3; i++) {
      var img = safeImg(collection[i]);
      var cell = document.createElement('div');
      cell.className = 'sp-cell';
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'sp-slot' + (img ? '' : ' empty');
      b.setAttribute('aria-label', 'Espaço ' + (i + 1) + (img ? '' : ' (vazio)'));
      if (img) {
        any = true;
        var im = document.createElement('img');
        im.src = img; im.alt = ''; im.draggable = false;
        b.appendChild(im);
        if (img === equipped) { b.classList.add('active'); b.title = 'Boneco (em uso)'; }
        else b.title = 'Ver o boneco';
        b.addEventListener('click', (function (src, btn) {
          return function () { openBox(src, btn); };
        })(img, b));
      } else if (editable) {
        b.classList.add('add');
        b.textContent = '+';
        b.title = 'Escolher um boneco da sua coleção';
        b.setAttribute('aria-label', 'Espaço ' + (i + 1) + ' vazio: escolher um boneco');
        b.addEventListener('click', (function (idx) {
          return function () { openPicker(idx); };
        })(i));
      } else {
        b.disabled = true;
      }
      cell.appendChild(b);
      if (editable && img) {
        var ed = document.createElement('button');
        ed.type = 'button';
        ed.className = 'sp-slot-edit';
        ed.title = 'Trocar ou remover';
        ed.setAttribute('aria-label', 'Trocar ou remover o boneco do espaço ' + (i + 1));
        ed.textContent = '\u270e';
        ed.addEventListener('click', (function (idx) {
          return function () { openPicker(idx); };
        })(i));
        cell.appendChild(ed);
      }
      slotsEl.appendChild(cell);
    }
    colWrap.hidden = !(any || editable);   // no seu perfil os 3 espaços aparecem sempre
  }

  // ---- vitrine: quais bonecos da SUA coleção aparecem nos 3 espaços do perfil ----
  // Guardamos só o número do avatar (0..2) de cada espaço; a imagem é lida na hora do
  // editor de avatar, então se você refizer o boneco, o perfil acompanha.
  var SHOW_KEY = 'trutec_showcase';
  function readShowcase() {
    var out = [null, null, null], arr = null;
    try { arr = JSON.parse(localStorage.getItem(SHOW_KEY)); } catch (e) {}
    if (Array.isArray(arr)) for (var i = 0; i < 3; i++) out[i] = (arr[i] === 0 || arr[i] === 1 || arr[i] === 2) ? arr[i] : null;
    return out;
  }
  function writeShowcase(sc) { try { localStorage.setItem(SHOW_KEY, JSON.stringify(sc)); } catch (e) {} }
  function ownAvatars() {          // os até 3 avatares criados no editor (png ou null)
    var out = [null, null, null];
    try {
      var arr = JSON.parse(localStorage.getItem('trutec_avatar_slots'));
      if (Array.isArray(arr)) for (var i = 0; i < 3; i++) out[i] = arr[i] && safeImg(arr[i].img) ? arr[i].img : null;
    } catch (e) {}
    return out;
  }
  function showcaseImages() {
    var av = ownAvatars();
    return readShowcase().map(function (ix) { return ix === null ? null : av[ix]; });
  }

  var pickModal = null, pickGrid = null, pickHint = null, pickClear = null, pickIdx = -1;
  function buildPicker() {
    if (pickModal) return;
    pickModal = document.createElement('div');
    pickModal.className = 'settings-modal hidden';
    pickModal.setAttribute('role', 'dialog');
    pickModal.setAttribute('aria-modal', 'true');
    pickModal.setAttribute('aria-labelledby', 'sp-pick-title');
    pickModal.innerHTML =
      '<div class="settings-card sp-pick-card">' +
        '<h2 id="sp-pick-title">Escolher boneco</h2>' +
        '<p class="modal-hint" id="sp-pick-hint"></p>' +
        '<div class="sp-pick-grid" id="sp-pick-grid"></div>' +
        '<div class="modal-actions">' +
          '<button type="button" class="btn btn-secondary" id="sp-pick-clear">Deixar vazio</button>' +
          '<button type="button" class="btn btn-primary" id="sp-pick-close">Fechar</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(pickModal);
    pickGrid = pickModal.querySelector('#sp-pick-grid');
    pickHint = pickModal.querySelector('#sp-pick-hint');
    pickClear = pickModal.querySelector('#sp-pick-clear');
    pickClear.addEventListener('click', function () { setShowcase(pickIdx, null); });
    pickModal.querySelector('#sp-pick-close').addEventListener('click', closePicker);
    pickModal.addEventListener('click', function (e) { if (e.target === pickModal) closePicker(); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && pickModal && !pickModal.classList.contains('hidden')) { e.stopPropagation(); closePicker(); }
    }, true);
  }
  function closePicker() { if (pickModal) pickModal.classList.add('hidden'); }
  function openPicker(slotIdx) {
    buildPicker();
    pickIdx = slotIdx;
    var av = ownAvatars(), sc = readShowcase(), n = 0;
    pickGrid.innerHTML = '';
    for (var i = 0; i < 3; i++) {
      if (!av[i]) continue;
      n++;
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'sp-slot' + (sc[slotIdx] === i ? ' active' : '');
      var im = document.createElement('img');
      im.src = av[i]; im.alt = ''; im.draggable = false;
      b.appendChild(im);
      var usedElsewhere = sc.some(function (v, k) { return v === i && k !== slotIdx; });
      b.setAttribute('aria-label', 'Avatar ' + (i + 1) + (usedElsewhere ? ' (já está em outro espaço)' : ''));
      if (usedElsewhere) { b.disabled = true; b.classList.add('used'); b.title = 'Já está em outro espaço'; }
      else {
        b.title = 'Colocar o avatar ' + (i + 1) + ' neste espaço';
        b.addEventListener('click', (function (ix) { return function () { setShowcase(pickIdx, ix); }; })(i));
      }
      pickGrid.appendChild(b);
    }
    pickHint.textContent = n
      ? 'Escolha qual boneco da sua coleção aparece neste espaço do perfil.'
      : 'Você ainda não criou nenhum boneco. Crie um em \u201cAvatar\u201d, na tela inicial, e volte aqui.';
    pickClear.hidden = sc[slotIdx] === null;
    pickModal.classList.remove('hidden');
    var first = pickGrid.querySelector('button:not(:disabled)');
    (first || pickModal.querySelector('#sp-pick-close')).focus();
  }
  function setShowcase(slotIdx, avatarIdx) {
    var sc = readShowcase();
    sc[slotIdx] = avatarIdx;
    writeShowcase(sc);
    closePicker();
    if (!viewingOther) paint(myData());
    if (window.TruAccount && TruAccount.syncCharacter) TruAccount.syncCharacter();   // manda pro perfil público
  }

  // ---- boneco grande do perfil: recorta a margem transparente pra ele preencher o painel ----
  // (cada PNG tem uma sobra diferente em volta do desenho; sem isso uns ficam pequenos
  //  e, com zoom fixo, outros ficam cortados). Mostra o original na hora e troca pelo recorte.
  var fitKey = '', fitVal = '';
  function setAvatar(src) {
    avatarEl.dataset.src = src;
    if (src.indexOf(PNG) !== 0) { avatarEl.src = src; return; }
    if (src === fitKey && fitVal) { avatarEl.src = fitVal; return; }
    avatarEl.src = src;
    var im = new Image();
    im.onload = function () {
      if (avatarEl.dataset.src !== src) return;          // já trocou de perfil
      try {
        var W = im.naturalWidth, H = im.naturalHeight;
        if (!W || !H) return;
        var k = Math.min(1, 400 / Math.max(W, H));          // analisa numa versão menor
        var w = Math.max(1, Math.round(W * k)), h = Math.max(1, Math.round(H * k));
        var c = document.createElement('canvas');
        c.width = w; c.height = h;
        var cx = c.getContext('2d');
        cx.drawImage(im, 0, 0, w, h);
        var px = cx.getImageData(0, 0, w, h).data;
        var x0 = w, y0 = h, x1 = -1, y1 = -1;
        for (var y = 0; y < h; y++) {
          for (var x = 0; x < w; x++) {
            if (px[(y * w + x) * 4 + 3] > 60) {
              if (x < x0) x0 = x; if (x > x1) x1 = x;
              if (y < y0) y0 = y; if (y > y1) y1 = y;
            }
          }
        }
        if (x1 < 0) return;                                  // imagem vazia
        var sx = Math.max(0, Math.floor(x0 / k)), sy = Math.max(0, Math.floor(y0 / k));
        var sw = Math.min(W - sx, Math.ceil((x1 + 1) / k) - sx), sh = Math.min(H - sy, Math.ceil((y1 + 1) / k) - sy);
        if (sw >= W * 0.97 && sh >= H * 0.97) return;        // já está justo
        var o = document.createElement('canvas');
        o.width = sw; o.height = sh;
        o.getContext('2d').drawImage(im, sx, sy, sw, sh, 0, 0, sw, sh);
        var url = o.toDataURL('image/png');
        fitKey = src; fitVal = url;
        avatarEl.src = url;
      } catch (e) { /* fica com o original */ }
    };
    im.src = src;
  }

  // d = { name, handle, since, wins, losses, avatar, collection, other }
  function paint(d) {
    var wins = num(d.wins), losses = num(d.losses), total = wins + losses;
    setAvatar(safeImg(d.avatar) || DEFAULT_AVATAR);
    nameEl.textContent = d.name || 'Jogador';
    handleEl.textContent = d.handle ? '@' + d.handle : '';
    handleEl.hidden = !d.handle;
    var bio = String(d.bio || '').trim();
    bioEl.textContent = bio;
    bioEl.hidden = !bio;
    viewingOther = !!d.other;
    winsEl.textContent = wins;
    lossesEl.textContent = losses;
    rateEl.textContent = total ? Math.round(wins / total * 100) + '%' : '—';
    renderCollection(d.collection, safeImg(d.avatar), !d.other);
  }

  // ---- o seu perfil (dados locais do aparelho) ----
  function myProfile() { return window.TruAccount && TruAccount.profile ? TruAccount.profile() : null; }
  function myHandle() { var p = myProfile(); return p && p.handle ? String(p.handle) : ''; }
  function mySince() {
    var p = myProfile();
    if (!p || !p.createdAt) return '';
    var d = new Date(p.createdAt);
    return isNaN(d) ? '' : 'Jogando desde ' + d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  }
  // nome de exibição + descrição: guardados no aparelho e enviados ao servidor (se ele aceitar)
  var PROFILE_KEY = 'trutec-profile';
  function readExtra() {
    var raw = null;
    try { raw = localStorage.getItem(PROFILE_KEY); } catch (e) {}
    if (raw !== null) {                                    // já editou neste aparelho: vale o que foi salvo
      try {
        var o = JSON.parse(raw) || {};
        return { displayName: String(o.displayName || '').slice(0, 24), bio: String(o.bio || '').slice(0, 160) };
      } catch (e) {}
    }
    var p = myProfile() || {};                             // senão, o que o servidor já tiver
    return { displayName: String(p.displayName || '').slice(0, 24), bio: String(p.bio || '').slice(0, 160) };
  }
  function myData() {
    var name = '';
    try { name = localStorage.getItem('trutec-name') || ''; } catch (e) {}
    var inp = document.getElementById('input-name');
    if (inp && inp.value.trim()) name = inp.value.trim();
    var st = window.TruStats ? TruStats.get() : { wins: 0, losses: 0 };
    var avatar = null;
    try { avatar = localStorage.getItem('trutec_meu_personagem'); } catch (e) {}
    return {
      name: readExtra().displayName || name || 'Jogador', bio: readExtra().bio,
      handle: myHandle(), since: mySince(), wins: st.wins, losses: st.losses,
      avatar: avatar, collection: showcaseImages(), other: false
    };
  }
  // ---- menu do usuário na barra (avatar + nome + opções, estilo Letterboxd) ----
  var uWrap = document.getElementById('sn-user-wrap');
  var uBtn = document.getElementById('sn-user');
  var uMenu = document.getElementById('sn-menu');
  var uAvatar = document.getElementById('sn-user-avatar');
  var uName = document.getElementById('sn-user-name');

  function menuOpen() { return uMenu && !uMenu.classList.contains('hidden'); }
  function closeMenu() {
    if (!uMenu) return;
    uMenu.classList.add('hidden');
    uBtn.setAttribute('aria-expanded', 'false');
  }
  function openMenu() {
    refreshUser();
    uMenu.classList.remove('hidden');
    uBtn.setAttribute('aria-expanded', 'true');
  }
  function refreshUser() {
    if (!uBtn) return;
    var me = myData(), prof = window.TruAccount && TruAccount.profile ? TruAccount.profile() : null;
    var handle = prof ? prof.handle : '';
    uName.textContent = handle || me.name;
    uAvatar.src = safeImg(me.avatar) || DEFAULT_AVATAR;
  }
  if (uBtn && uMenu) {
    var lastPtr = 'mouse';
    uBtn.addEventListener('pointerdown', function (e) { lastPtr = e.pointerType || 'mouse'; });
    uBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      if (!menuOpen()) openMenu();
      else if (lastPtr !== 'mouse' || e.detail === 0) closeMenu();   // mouse: já abriu no hover, clique não fecha
    });
    document.addEventListener('click', function (e) { if (menuOpen() && !uWrap.contains(e.target)) closeMenu(); });
    // mouse em cima abre sozinho; ao sair fecha depois de um instante (só com mouse, no toque vale o clique)
    var hoverTimer = 0;
    uWrap.addEventListener('pointerenter', function (e) {
      if (e.pointerType !== 'mouse') return;
      clearTimeout(hoverTimer);
      if (!menuOpen()) openMenu();
    });
    uWrap.addEventListener('pointerleave', function (e) {
      if (e.pointerType !== 'mouse') return;
      clearTimeout(hoverTimer);
      hoverTimer = setTimeout(closeMenu, 50);
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && menuOpen()) { closeMenu(); uBtn.focus(); }
    });
    document.getElementById('sn-me').addEventListener('click', function () { closeMenu(); closeSearch(); input.value = ''; showMe(); });
    document.getElementById('sn-logout').addEventListener('click', function () {
      if (window.TruAccount && TruAccount.logout) TruAccount.logout();
    });
    document.addEventListener('truaccount', refreshUser);
    refreshUser();
  }

  function showMe() {
    refreshUser();
    reqId++;                 // cancela busca em andamento
    hideLoading(true);
    closeBox();
    shownHandle = myHandle();   // o seu @ também pode ter o link copiado
    say('');
    paint(myData());
  }

  // ---- editar perfil ----
  var peModal = document.getElementById('profile-edit-modal');
  var peName = document.getElementById('pe-name');
  var peBio = document.getElementById('pe-bio');
  var peCount = document.getElementById('pe-count');
  var peMsg = document.getElementById('pe-msg');
  var peSave = document.getElementById('pe-save');
  function peUpdateCount() { peCount.textContent = peBio.value.length + '/160'; }
  function openEdit() {
    var cur = readExtra();
    peName.value = cur.displayName || myData().name;
    peBio.value = cur.bio;
    peMsg.textContent = '';
    peSave.disabled = false;
    peUpdateCount();
    peModal.classList.remove('hidden');
    peName.focus();
  }
  function closeEdit() { peModal.classList.add('hidden'); }
  function saveEdit() {
    var name = peName.value.trim().slice(0, 24);
    var bio = peBio.value.replace(/\r/g, '').replace(/\n{3,}/g, '\n\n').trim().slice(0, 160);
    if (!name) { peMsg.textContent = 'Escreva um nome de exibição.'; peName.focus(); return; }
    try { localStorage.setItem(PROFILE_KEY, JSON.stringify({ displayName: name, bio: bio })); } catch (e) {}
    peSave.disabled = true;
    peMsg.textContent = 'Salvando…';
    var done = function (r) {
      closeEdit();
      refreshUser();
      if (!viewingOther) paint(myData());
      if (!r || !r.ok) say('Salvo neste aparelho. O servidor ainda não guardou esse perfil.', true);
      else say('');
    };
    if (window.TruAccount && TruAccount.api && myHandle()) {
      TruAccount.api('/api/me/profile', 'PUT', { displayName: name, bio: bio }).then(done);
    } else done(null);
  }
  if (peModal) {
    document.getElementById('sn-edit').addEventListener('click', function () { closeMenu(); openEdit(); });
    document.getElementById('pe-cancel').addEventListener('click', closeEdit);
    peSave.addEventListener('click', saveEdit);
    peBio.addEventListener('input', peUpdateCount);
    peName.addEventListener('keydown', function (e) { if (e.key === 'Enter') saveEdit(); });
    peModal.addEventListener('click', function (e) { if (e.target === peModal) closeEdit(); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !peModal.classList.contains('hidden')) closeEdit();
    });
  }

  // ---- tela de carregamento por cima do card (escurece + borra + círculo girando) ----
  // Aparece enquanto a busca roda. Achou: o perfil novo já foi pintado por baixo e o fade
  // revela ele. Não achou: o círculo dá lugar ao aviso (no meio do card/tela) e, depois de
  // um instante, o fade revela o perfil que já estava.
  var cardEl = document.getElementById('social-profile');
  var loadEl = null, loadMsgEl = null, loadSince = 0, loadTimer = 0;
  var LOAD_MIN_MS = 450;     // tempo mínimo girando, pra não piscar quando o servidor responde rápido
  var NOTICE_MS = 1700;      // quanto tempo o aviso fica na tela antes do fade out
  function buildLoading() {
    if (loadEl || !cardEl) return;
    loadEl = document.createElement('div');
    loadEl.className = 'sp-loading';
    loadEl.innerHTML =
      '<div class="game-intro-spinner" aria-hidden="true">' +
        '<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
          '<path d="M50 12 A38 38 0 0 1 86 38" /><path d="M50 88 A38 38 0 0 1 14 62" />' +
        '</svg>' +
      '</div>' +
      '<p class="sp-loading-msg" role="status" aria-live="polite"></p>';
    loadMsgEl = loadEl.querySelector('.sp-loading-msg');
    cardEl.appendChild(loadEl);
  }
  function showLoading() {
    buildLoading();
    if (!loadEl) return;
    clearTimeout(loadTimer);
    loadSince = Date.now();
    loadMsgEl.textContent = '';
    loadEl.classList.remove('msg');
    cardEl.setAttribute('aria-busy', 'true');
    loadEl.classList.add('show');
  }
  function hideNow() {
    if (!loadEl) return;
    cardEl.removeAttribute('aria-busy');
    loadEl.classList.remove('show');
  }
  function hideLoading(now) {
    if (!loadEl) return;
    clearTimeout(loadTimer);
    var wait = now ? 0 : Math.max(0, LOAD_MIN_MS - (Date.now() - loadSince));
    loadTimer = setTimeout(hideNow, wait);
  }
  // aviso no meio da tela escura; depois some junto com o fade
  function showNotice(text) {
    buildLoading();
    if (!loadEl) return;
    clearTimeout(loadTimer);
    loadMsgEl.textContent = text;
    loadEl.classList.add('show', 'msg');
    loadTimer = setTimeout(hideNow, NOTICE_MS);
  }
  // falha depois de uma busca: deixa o círculo girar o mínimo e então mostra o aviso
  function failLoading(text) {
    if (!loadEl) return showNotice(text);
    clearTimeout(loadTimer);
    var wait = Math.max(0, LOAD_MIN_MS - (Date.now() - loadSince));
    loadTimer = setTimeout(function () { showNotice(text); }, wait);
  }

  // ---- busca ----
  function search(raw) {
    var handle = normalize(raw);
    if (!handle) return showNotice('Digite o @ de alguém pra ver o perfil.');
    if (!/^[a-z0-9_]{3,16}$/.test(handle)) return showNotice('O @ tem de 3 a 16 letras, números ou _.');
    var id = ++reqId;
    say('');
    showLoading();
    fetch(RESOLVED_BACKEND_URL + '/api/profile/' + encodeURIComponent(handle))
      .then(function (r) { return r.json(); })
      .then(function (r) {
        if (id !== reqId) return;
        if (!r || !r.ok || !r.profile) return failLoading((r && r.error) || 'Perfil não encontrado.');
        var p = r.profile;
        shownHandle = String(p.handle || handle);
        paint({
          name: p.displayName || p.name || shownHandle, bio: p.bio, handle: shownHandle, wins: p.wins, losses: p.losses,
          avatar: p.character, collection: p.collection, other: true
        });
        hideLoading();                             // fade out: revela o perfil novo
      })
      .catch(function () {
        if (id !== reqId) return;
        failLoading('Servidor indisponível. Tente de novo em instantes.');
      });
  }

  // ---- lupa: abre/fecha o campo de busca na barra ----
  function openSearch() {
    form.classList.add('open'); lupa.classList.add('open');
    setTimeout(function () { try { input.focus(); } catch (e) {} }, 30);
  }
  function closeSearch() { form.classList.remove('open'); lupa.classList.remove('open'); }
  lupa.addEventListener('click', function () {
    if (!form.classList.contains('open')) return openSearch();
    if (input.value.trim()) search(input.value); else closeSearch();
  });
  form.addEventListener('submit', function (e) { e.preventDefault(); search(input.value); });
  input.addEventListener('keydown', function (e) { if (e.key === 'Escape') { closeSearch(); lupa.focus(); } });
  // aceita colar "@fulano" ou o link do perfil
  input.addEventListener('input', function () {
    var v = input.value, m = v.match(/\/@([A-Za-z0-9_]+)/);
    if (m) v = m[1];
    input.value = v.replace(/^@+/, '').replace(/[^A-Za-z0-9_]/g, '').slice(0, 16);
  });

  openBtn.addEventListener('click', function () {
    showMe();
    closeSearch();
    input.value = '';
    showScreen('screen-social');
  });
  logoBtn.addEventListener('click', function () { closeBox(); closeMenu(); showScreen('screen-lobby'); });
})();
