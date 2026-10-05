// ============================================================================
// SOCIAL (botão "Social" na tela inicial)
// Layout estilo Letterboxd: barra no topo (logo = voltar, aba Amigos, lupa),
// card grande à esquerda com o PERFIL (começa mostrando o seu: nome, boneco,
// estatísticas e a sua coleção) e a seção Amigos à direita.
// - Coleção: 3 espaços (estilo "filmes favoritos" do Letterboxd). No SEU perfil começam
//   vazios: clique no + e escolha qual boneco da sua coleção (os avatares do editor) fica ali.
//   Nos perfis dos outros os 3 espaços também aparecem sempre (vazios, se não houver nada).
//   Clicar num deles abre o boneco bem grande no meio da tela (clique fora,
//   no X ou Esc fecham). Pra voltar ao seu perfil, é só abrir o Social de novo.
// - Lupa: abre o campo de busca por @. Consulta GET {backend}/api/profile/<@>
//   e troca o card pelo perfil encontrado.
// Formato esperado da resposta:
//   { ok: true, profile: { handle, wins, losses, createdAt,
//                          character: "data:image/png;base64,...",   // em uso
//                          collection: [png|null, png|null, png|null] // opcional
//                        } }
// Se o servidor não manda "collection", a seção Coleção aparece com os 3 espaços vazios.
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
  var mailBtn = document.getElementById('sp-mail');
  var moreWrap = document.getElementById('sp-more-wrap');
  var moreBtn = document.getElementById('sp-more');
  var moreMenu = document.getElementById('sp-more-menu');
  var friendBtn = document.getElementById('sp-friend');   // personagem + sinal (adicionar / pendente / remover amigo)
  function closeMore() {
    if (!moreMenu) return;
    moreMenu.classList.add('hidden');
    if (moreBtn) moreBtn.setAttribute('aria-expanded', 'false');
  }

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
    if (!Array.isArray(collection)) collection = [];   // sem dados do servidor: os 3 espaços aparecem vazios
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
    colWrap.hidden = false;   // estética: TODO perfil mostra os 3 retângulos, mesmo vazios
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

  // ---- boneco grande do perfil ----
  // Todo PNG sai do editor no mesmo tamanho de tela, então mostramos a imagem ORIGINAL
  // (sem recortar a margem transparente). Antes o recorte "esticava" bonecos que ocupam
  // menos espaço no desenho, e o perfil de uns amigos ficava maior que o de outros.
  function setAvatar(src) {
    avatarEl.dataset.src = src;
    avatarEl.src = src;
  }

  // ---- lápis no boneco principal: escolher qual avatar da coleção fica como principal ----
  var spTop = avatarEl.parentNode;
  var editAvBtn = document.createElement('button');
  editAvBtn.type = 'button';
  editAvBtn.className = 'sp-avatar-edit';
  editAvBtn.title = 'Trocar o personagem principal';
  editAvBtn.setAttribute('aria-label', 'Trocar o personagem principal');
  editAvBtn.innerHTML =
    '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" ' +
    'stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
    '<path d="M4 20l1.2-4.4L16.6 4.2a2 2 0 0 1 2.8 0l1.4 1.4a2 2 0 0 1 0 2.8L9.4 19.8z"/>' +
    '<path d="M14.8 6l3.2 3.2"/></svg>';
  editAvBtn.hidden = true;
  spTop.appendChild(editAvBtn);

  var eqModal = null, eqGrid = null, eqHint = null;
  function activeAvatarIndex() {
    var av = ownAvatars(), ix = -1, cur = null;
    try { ix = parseInt(localStorage.getItem('trutec_avatar_active'), 10); } catch (e) {}
    try { cur = localStorage.getItem('trutec_meu_personagem'); } catch (e) {}
    if (isFinite(ix) && ix >= 0 && ix < 3 && av[ix] && (!cur || av[ix] === cur)) return ix;
    return cur ? av.indexOf(cur) : -1;
  }
  function buildEquipPicker() {
    if (eqModal) return;
    eqModal = document.createElement('div');
    eqModal.className = 'settings-modal hidden';
    eqModal.setAttribute('role', 'dialog');
    eqModal.setAttribute('aria-modal', 'true');
    eqModal.setAttribute('aria-labelledby', 'sp-eq-title');
    eqModal.innerHTML =
      '<div class="settings-card sp-pick-card">' +
        '<h2 id="sp-eq-title">Personagem principal</h2>' +
        '<p class="modal-hint" id="sp-eq-hint"></p>' +
        '<div class="sp-pick-grid" id="sp-eq-grid"></div>' +
        '<div class="modal-actions"><button type="button" class="btn btn-primary" id="sp-eq-close">Fechar</button></div>' +
      '</div>';
    document.body.appendChild(eqModal);
    eqGrid = eqModal.querySelector('#sp-eq-grid');
    eqHint = eqModal.querySelector('#sp-eq-hint');
    eqModal.querySelector('#sp-eq-close').addEventListener('click', closeEquipPicker);
    eqModal.addEventListener('click', function (e) { if (e.target === eqModal) closeEquipPicker(); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && eqModal && !eqModal.classList.contains('hidden')) { e.stopPropagation(); closeEquipPicker(); }
    }, true);
  }
  function closeEquipPicker() { if (eqModal) eqModal.classList.add('hidden'); }
  function openEquipPicker() {
    buildEquipPicker();
    var av = ownAvatars(), cur = activeAvatarIndex(), n = 0;
    eqGrid.innerHTML = '';
    for (var i = 0; i < 3; i++) {
      if (!av[i]) continue;
      n++;
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'sp-slot' + (i === cur ? ' active' : '');
      var im = document.createElement('img');
      im.src = av[i]; im.alt = ''; im.draggable = false;
      b.appendChild(im);
      b.setAttribute('aria-label', 'Avatar ' + (i + 1) + (i === cur ? ' (principal)' : ''));
      b.title = i === cur ? 'Personagem principal atual' : 'Usar o avatar ' + (i + 1) + ' como principal';
      b.addEventListener('click', (function (ix) { return function () { equipAvatar(ix); }; })(i));
      eqGrid.appendChild(b);
    }
    eqHint.textContent = n
      ? 'Escolha qual personagem da sua coleção vai ser o principal (o do perfil e o das partidas).'
      : 'Você ainda não criou nenhum boneco. Crie um em \u201cAvatar\u201d, na tela inicial, e volte aqui.';
    eqModal.classList.remove('hidden');
    var first = eqGrid.querySelector('button.active') || eqGrid.querySelector('button');
    (first || eqModal.querySelector('#sp-eq-close')).focus();
  }
  function equipAvatar(ix) {
    var av = ownAvatars();
    if (!av[ix]) return;
    closeEquipPicker();
    // o editor de avatar (client.js) guarda o "em uso", atualiza a prévia e avisa a sala
    var handled = false;
    try { handled = !document.dispatchEvent(new CustomEvent('trutec:equip-avatar', { detail: { index: ix }, cancelable: true })); } catch (e) {}
    if (!handled) {
      try { localStorage.setItem('trutec_avatar_active', String(ix)); localStorage.setItem('trutec_meu_personagem', av[ix]); } catch (e) {}
    }
    refreshUser();
    if (!viewingOther) paint(myData());
    if (window.TruAccount && TruAccount.syncCharacter) TruAccount.syncCharacter();   // manda pro perfil público
  }
  editAvBtn.addEventListener('click', function (e) { e.stopPropagation(); openEquipPicker(); });

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
    editAvBtn.hidden = !!d.other;   // lápis só no SEU perfil
    if (mailBtn) mailBtn.hidden = !(d.other && d.handle);   // carta só no perfil dos outros
    if (moreWrap) moreWrap.hidden = !(d.other && d.handle);   // ⋯ (bloquear/denunciar) só no perfil dos outros
    if (friendBtn) { friendBtn.hidden = true; if (d.other && d.handle) loadFriendState(d.handle); }   // amizade só no perfil dos outros
    closeMore();
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
    if (inboxOn) setPane('friends');   // saindo da tela da Inbox
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
    if (inboxOn) setPane('friends');   // buscar alguém sai da tela da Inbox e mostra o perfil
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

  // ---- INBOX + ENVIAR MENSAGEM ----------------------------------------------
  // Carta no perfil dos outros -> janela com Tópico, Assunto e Mensagem.
  // "Inbox" na barra do topo -> lista das mensagens recebidas (com contador de não lidas).
  var tabFriends = document.getElementById('social-tab-friends');
  var tabInbox = document.getElementById('social-tab-inbox');
  var badgeEl = document.getElementById('inbox-badge');
  var paneFriends = document.getElementById('social-pane-friends');
  var paneInbox = document.getElementById('social-pane-inbox');
  var inboxList = document.getElementById('inbox-list');
  var inboxSub = document.getElementById('inbox-sub');
  var mainProfile = document.getElementById('social-main-profile');
  var inboxItems = [];
  var inboxOn = false;

  function loggedIn() { return !!(window.TruAccount && TruAccount.profile && TruAccount.profile()); }
  function mailApi(path, method, body) {
    return window.TruAccount && TruAccount.api ? TruAccount.api(path, method, body) : Promise.resolve({ ok: false, error: 'Conta indisponível.' });
  }

  function setBadge(n) {
    n = n > 0 ? n : 0;
    badgeEl.textContent = n > 99 ? '99+' : String(n);
    badgeEl.hidden = !n;
  }
  function refreshBadge() {
    if (!loggedIn()) return setBadge(0);
    mailApi('/api/messages/unread').then(function (r) { if (r && r.ok) setBadge(r.count); });
  }

  function setPane(which) {
    inboxOn = which === 'inbox';
    paneFriends.hidden = inboxOn;
    if (mainProfile) mainProfile.hidden = inboxOn;   // a Inbox é uma tela inteira: some o perfil/amigos
    paneInbox.hidden = !inboxOn;
    if (inboxOn) paneInbox.scrollTop = 0;
    tabFriends.classList.toggle('active', !inboxOn);
    tabInbox.classList.toggle('active', inboxOn);
    if (inboxOn) loadInbox();
  }

  function fmtWhen(iso) {
    var d = new Date(iso);
    if (isNaN(d)) return '';
    var same = d.toDateString() === new Date().toDateString();
    return same ? d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
                : d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
  }
  function inboxEmpty(text, sub) {
    if (inboxSub) inboxSub.textContent = '';
    inboxList.innerHTML = '';
    var box = document.createElement('div');
    box.className = 'social-empty';
    var p = document.createElement('p'); p.textContent = text; box.appendChild(p);
    if (sub) { var s = document.createElement('p'); s.className = 'social-empty-sub'; s.textContent = sub; box.appendChild(s); }
    inboxList.appendChild(box);
  }
  // carregando: o mesmo símbolo girando da tela de carregamento (em vez do texto "Carregando…")
  function inboxLoading() {
    if (inboxSub) inboxSub.textContent = '';
    inboxList.innerHTML =
      '<div class="inbox-loading" role="status" aria-label="Carregando">' +
        '<div class="game-intro-spinner" aria-hidden="true">' +
          '<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
            '<path d="M50 12 A38 38 0 0 1 86 38" /><path d="M50 88 A38 38 0 0 1 14 62" />' +
          '</svg>' +
        '</div>' +
      '</div>';
  }
  // boneco de quem mandou: usa o que a mensagem trouxer; senão busca no perfil do @ (uma vez por @)
  var senderAv = {}, senderPending = {};
  function directAvatar(m) { return safeImg(m.fromAvatar || m.fromCharacter || m.avatar || m.character); }
  function fetchSenderAvatar(handle, done) {
    if (Object.prototype.hasOwnProperty.call(senderAv, handle)) return done(senderAv[handle]);
    if (senderPending[handle]) { senderPending[handle].push(done); return; }
    senderPending[handle] = [done];
    fetch(RESOLVED_BACKEND_URL + '/api/profile/' + encodeURIComponent(handle))
      .then(function (r) { return r.json(); })
      .then(function (r) { return r && r.ok && r.profile ? safeImg(r.profile.character) : null; })
      .catch(function () { return null; })
      .then(function (img) {
        senderAv[handle] = img || '';
        var cbs = senderPending[handle] || []; delete senderPending[handle];
        cbs.forEach(function (f) { f(senderAv[handle]); });
      });
  }
  function renderInbox() {
    var unread = inboxItems.filter(function (x) { return !x.read; }).length;
    if (inboxSub) inboxSub.textContent = !inboxItems.length ? '' :
      inboxItems.length + (inboxItems.length === 1 ? ' mensagem' : ' mensagens') + (unread ? ' · ' + unread + (unread === 1 ? ' não lida' : ' não lidas') : '');
    if (!inboxItems.length) return inboxEmpty('Sua inbox está vazia.', 'Quando alguém te mandar uma mensagem, ela aparece aqui.');
    inboxList.innerHTML = '';
    inboxItems.forEach(function (m) {
      var row = document.createElement('button');
      row.type = 'button';
      row.className = 'inbox-item' + (m.read ? '' : ' unread');
      // ícone: o boneco que a pessoa está usando
      var av = document.createElement('span'); av.className = 'ii-avatar';
      var im = document.createElement('img'); im.alt = ''; im.draggable = false;
      var direct = directAvatar(m);
      im.src = direct || (m.fromHandle && senderAv[m.fromHandle]) || DEFAULT_AVATAR;
      av.appendChild(im);
      if (!direct && m.fromHandle && !Object.prototype.hasOwnProperty.call(senderAv, m.fromHandle)) {
        fetchSenderAvatar(m.fromHandle, function (img) { if (img) im.src = img; });
      }
      // texto: remetente + hora (pequeno), assunto (destaque) e a mensagem (menor) logo abaixo
      var main = document.createElement('span'); main.className = 'ii-main';
      var top = document.createElement('span'); top.className = 'ii-top';
      var from = document.createElement('span'); from.className = 'ii-from';
      from.textContent = m.fromName + (m.fromHandle ? ' @' + m.fromHandle : '');
      var when = document.createElement('span'); when.className = 'ii-when'; when.textContent = fmtWhen(m.createdAt);
      top.appendChild(from); top.appendChild(when);
      var sb = document.createElement('span'); sb.className = 'ii-subject'; sb.textContent = m.subject;
      var pv = document.createElement('span'); pv.className = 'ii-preview'; pv.textContent = String(m.body || '').replace(/\s+/g, ' ');
      main.appendChild(top); main.appendChild(sb); main.appendChild(pv);
      row.appendChild(av); row.appendChild(main);
      row.addEventListener('click', function () { openRead(m); });   // abre a mensagem na tela
      inboxList.appendChild(row);
    });
  }
  function loadInbox(silent) {
    if (!loggedIn()) return inboxEmpty('Entre na sua conta pra ver a inbox.', 'Use o botão de conta na tela inicial e escolha seu @.');
    if (!silent) inboxLoading();
    mailApi('/api/messages').then(function (r) {
      if (!inboxOn) return;
      if (!r || !r.ok) return inboxEmpty((r && r.error) || 'Não deu pra carregar a inbox.');
      inboxItems = r.messages || [];
      renderInbox();
      setBadge(inboxItems.filter(function (m) { return !m.read; }).length);
    });
  }

  // -- ler uma mensagem --
  var rdModal = document.getElementById('mail-read-modal');
  var rdTopic = document.getElementById('mr-topic');
  var rdSubject = document.getElementById('mr-subject');
  var rdFrom = document.getElementById('mr-from');
  var rdBody = document.getElementById('mr-body');
  var rdCur = null;
  function openRead(m) {
    rdCur = m;
    rdTopic.textContent = m.topic;
    rdSubject.textContent = m.subject;
    rdFrom.textContent = 'De ' + m.fromName + (m.fromHandle ? ' (@' + m.fromHandle + ')' : '') + ' · ' + fmtWhen(m.createdAt);
    rdBody.textContent = m.body;
    document.getElementById('mr-reply').hidden = !m.fromHandle;
    rdModal.classList.remove('hidden');
    if (!m.read) {
      m.read = true;
      renderInbox();
      setBadge(inboxItems.filter(function (x) { return !x.read; }).length);
      mailApi('/api/messages/' + m.id + '/read', 'PUT');
    }
  }
  function closeRead() { rdModal.classList.add('hidden'); }
  document.getElementById('mr-close').addEventListener('click', closeRead);
  rdModal.addEventListener('click', function (e) { if (e.target === rdModal) closeRead(); });
  document.getElementById('mr-delete').addEventListener('click', function () {
    if (!rdCur) return;
    var id = rdCur.id;
    inboxItems = inboxItems.filter(function (x) { return x.id !== id; });
    closeRead();
    renderInbox();
    setBadge(inboxItems.filter(function (x) { return !x.read; }).length);
    mailApi('/api/messages/' + id, 'DELETE');
  });
  document.getElementById('mr-reply').addEventListener('click', function () {
    if (!rdCur || !rdCur.fromHandle) return;
    var m = rdCur;
    closeRead();
    openCompose(m.fromHandle, ('Re: ' + m.subject).slice(0, 80));
  });

  // -- escrever uma mensagem --
  var cmModal = document.getElementById('mail-modal');
  var cmTo = document.getElementById('mail-to');
  var cmSubject = document.getElementById('mail-subject');
  var cmBody = document.getElementById('mail-body');
  var cmCount = document.getElementById('mail-count');
  var cmMsg = document.getElementById('mail-msg');
  var cmSend = document.getElementById('mail-send');
  var cmHandle = '';
  function cmUpdateCount() { cmCount.textContent = cmBody.value.length + '/500'; }
  function openCompose(handle, subject) {
    if (!loggedIn()) { say('Entre na sua conta e escolha um @ pra enviar mensagens.', true); return; }
    cmHandle = handle;
    cmTo.textContent = 'Para @' + handle;
    cmSubject.value = subject || '';
    cmBody.value = '';
    cmMsg.textContent = '';
    cmMsg.style.color = '';
    cmSend.disabled = false;
    cmUpdateCount();
    cmModal.classList.remove('hidden');
    (subject ? cmBody : cmSubject).focus();
  }
  function closeCompose() { cmModal.classList.add('hidden'); }
  function sendMail() {
    var subject = cmSubject.value.trim(), body = cmBody.value.trim();
    cmMsg.style.color = '';
    if (!subject) { cmMsg.textContent = 'Escreva o assunto.'; cmSubject.focus(); return; }
    if (!body) { cmMsg.textContent = 'Escreva a mensagem.'; cmBody.focus(); return; }
    cmSend.disabled = true;
    cmMsg.textContent = 'Enviando…';
    mailApi('/api/messages', 'POST', { to: cmHandle, subject: subject, body: body }).then(function (r) {
      cmSend.disabled = false;
      if (!r || !r.ok) { cmMsg.textContent = (r && r.error) || 'Não deu pra enviar.'; return; }
      closeCompose();
      say('Mensagem enviada para @' + cmHandle + '!');
      setTimeout(function () { if (msg.textContent.indexOf('Mensagem enviada') === 0) say(''); }, 3500);
    });
  }
  cmSend.addEventListener('click', sendMail);
  document.getElementById('mail-cancel').addEventListener('click', closeCompose);
  cmModal.addEventListener('click', function (e) { if (e.target === cmModal) closeCompose(); });
  cmBody.addEventListener('input', cmUpdateCount);
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    if (!cmModal.classList.contains('hidden')) closeCompose();
    else if (!rdModal.classList.contains('hidden')) closeRead();
  });

  // ---- AMIZADES -------------------------------------------------------------
  // Botão ao lado do nome: personagem com um sinal na cabeça.
  //   nenhum pedido  -> "+"            clique: envia o pedido
  //   pedido enviado -> relógio amarelo clique: pergunta se quer CANCELAR o pedido
  //   já são amigos  -> "−" vermelho    clique: pergunta se quer REMOVER o amigo
  //   te pediram     -> "+" verde       clique: aceita
  var friendBadge = document.getElementById('sp-friend-badge');
  var fState = 'none', fBusy = false;
  var F_ICON = {
    plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
    minus: '<svg viewBox="0 0 24 24"><path d="M5 12h14"/></svg>',
    clock: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></svg>'
  };
  var F_LABEL = {
    none: 'Adicionar amigo',
    pending_out: 'Solicitação pendente (clique para cancelar)',
    pending_in: 'Aceitar solicitação de amizade',
    friends: 'Remover amigo'
  };
  function paintFriend(state) {
    fState = state;
    if (!friendBtn) return;
    if (!F_LABEL[state]) { friendBtn.hidden = true; return; }   // 'self' ou desconhecido
    friendBtn.hidden = false;
    friendBtn.dataset.state = state;
    friendBtn.title = F_LABEL[state];
    friendBtn.setAttribute('aria-label', F_LABEL[state]);
    friendBadge.innerHTML = state === 'friends' ? F_ICON.minus : state === 'pending_out' ? F_ICON.clock : F_ICON.plus;
  }
  function loadFriendState(handle) {
    if (!loggedIn()) return;
    mailApi('/api/friends/status/' + encodeURIComponent(handle)).then(function (r) {
      if (handle !== shownHandle || !viewingOther) return;   // já trocou de perfil
      if (r && r.ok) paintFriend(r.status);
    });
  }
  function flash(text) {
    say(text);
    setTimeout(function () { if (msg.textContent === text) say(''); }, 3500);
  }

  // janela "tem certeza?"
  var cfModal = document.getElementById('confirm-modal');
  var cfTitle = document.getElementById('confirm-title');
  var cfText = document.getElementById('confirm-text');
  var cfYes = document.getElementById('confirm-yes');
  var cfNo = document.getElementById('confirm-no');
  var cfAction = null;
  function askConfirm(title, text, yesLabel, onYes) {
    cfTitle.textContent = title;
    cfText.textContent = text;
    cfYes.textContent = yesLabel;
    cfAction = onYes;
    cfModal.classList.remove('hidden');
    cfNo.focus();   // o foco começa em "Voltar": Enter sem querer não apaga nada
  }
  function closeConfirm() { cfAction = null; cfModal.classList.add('hidden'); }
  cfNo.addEventListener('click', closeConfirm);
  cfYes.addEventListener('click', function () { var fn = cfAction; closeConfirm(); if (fn) fn(); });
  cfModal.addEventListener('click', function (e) { if (e.target === cfModal) closeConfirm(); });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !cfModal.classList.contains('hidden')) closeConfirm();
  });

  function friendCall(handle, path, method, body, okText) {
    if (fBusy) return;
    fBusy = true; friendBtn.disabled = true;
    mailApi(path, method, body).then(function (r) {
      fBusy = false; friendBtn.disabled = false;
      if (!r || !r.ok) { say((r && r.error) || 'Não deu pra concluir. Tente de novo.', true); return; }
      if (handle === shownHandle) paintFriend(r.status);
      if (okText) flash(okText);
      loadFriends();
    });
  }
  if (friendBtn) friendBtn.addEventListener('click', function () {
    var h = shownHandle;
    if (!h) return;
    if (!loggedIn()) { say('Entre na sua conta e escolha um @ pra adicionar amigos.', true); return; }
    if (fState === 'none') {
      friendCall(h, '/api/friends/request', 'POST', { to: h }, 'Solicitação enviada para @' + h + '!');
    } else if (fState === 'pending_in') {
      friendCall(h, '/api/friends/accept', 'POST', { to: h }, 'Agora você e @' + h + ' são amigos!');
    } else if (fState === 'pending_out') {
      askConfirm('Cancelar solicitação?', 'Tem certeza que quer cancelar o pedido de amizade enviado para @' + h + '?', 'Sim, cancelar', function () {
        friendCall(h, '/api/friends/' + encodeURIComponent(h), 'DELETE', null, 'Solicitação cancelada.');
      });
    } else if (fState === 'friends') {
      askConfirm('Remover amigo?', 'Tem certeza que quer remover @' + h + ' da sua lista de amigos?', 'Sim, remover', function () {
        friendCall(h, '/api/friends/' + encodeURIComponent(h), 'DELETE', null, '@' + h + ' foi removido dos seus amigos.');
      });
    }
  });

  // lista na aba Amigos: pedidos recebidos (Aceitar / Recusar) + amigos (clique abre o perfil)
  var friendsEl = document.getElementById('social-friends');
  var friendsEmpty = friendsEl ? friendsEl.innerHTML : '';
  function friendRow(f, withButtons) {
    var row = document.createElement('div');
    row.className = 'fr-row';
    var open = document.createElement('button');
    open.type = 'button'; open.className = 'fr-open';
    var im = document.createElement('img'); im.src = DEFAULT_AVATAR; im.alt = ''; im.draggable = false;
    var box = document.createElement('span'), nm = document.createElement('span'), hd = document.createElement('span');
    nm.className = 'fr-name'; nm.textContent = f.displayName || f.handle;
    hd.className = 'fr-handle'; hd.textContent = '@' + f.handle;
    box.style.minWidth = '0'; box.appendChild(nm); box.appendChild(hd);
    open.appendChild(im); open.appendChild(box);
    open.addEventListener('click', function () { search(f.handle); });
    row.appendChild(open);
    if (withButtons) {
      var btns = document.createElement('div'); btns.className = 'fr-btns';
      var ok = document.createElement('button'); ok.type = 'button'; ok.className = 'btn btn-primary'; ok.textContent = 'Aceitar';
      var no = document.createElement('button'); no.type = 'button'; no.className = 'btn btn-secondary'; no.textContent = 'Recusar';
      ok.addEventListener('click', function () {
        ok.disabled = no.disabled = true;
        mailApi('/api/friends/accept', 'POST', { to: f.handle }).then(function () {
          if (f.handle === shownHandle) loadFriendState(f.handle);
          loadFriends();
        });
      });
      no.addEventListener('click', function () {
        ok.disabled = no.disabled = true;
        mailApi('/api/friends/' + encodeURIComponent(f.handle), 'DELETE').then(function () {
          if (f.handle === shownHandle) loadFriendState(f.handle);
          loadFriends();
        });
      });
      btns.appendChild(ok); btns.appendChild(no); row.appendChild(btns);
    }
    return row;
  }
  function label(text) { var l = document.createElement('div'); l.className = 'fr-label'; l.textContent = text; return l; }
  function renderFriends(d) {
    if (!friendsEl) return;
    var friends = (d && d.friends) || [], reqs = (d && d.requests) || [];
    if (!friends.length && !reqs.length) { friendsEl.innerHTML = friendsEmpty; return; }
    friendsEl.textContent = '';
    if (reqs.length) {
      friendsEl.appendChild(label('Solicitações (' + reqs.length + ')'));
      reqs.forEach(function (f) { friendsEl.appendChild(friendRow(f, true)); });
      if (friends.length) friendsEl.appendChild(label('Seus amigos'));
    }
    if (friends.length) friendsEl.appendChild(buildWheel(friends));
  }

  // ---- amigos em "roleta" HORIZONTAL INFINITA (estilo seletor do iPhone, só que de lado) ----
  // Cada amigo é o boneco dele com o nome logo abaixo do peito. O do meio fica em destaque e
  // sempre tem um amigo de cada lado; ao passar do último volta pro primeiro (loop infinito).
  // Clicar no do meio abre o perfil; clicar em outro leva ele pro meio.
  // Roda do mouse (só perto dos bonecos), arrastar, toque e setas do teclado.
  function buildWheel(friends) {
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var n = friends.length;
    var L = n === 1 ? 1 : (n === 2 ? 4 : n);        // posições no círculo (com 2 amigos eles se repetem pra não ficar vazio)
    var wrap = document.createElement('div');
    wrap.className = 'fr-wheel-wrap';
    var wheel = document.createElement('div');
    wheel.className = 'fr-wheel';
    wheel.tabIndex = 0;
    wheel.setAttribute('role', 'listbox');
    wheel.setAttribute('aria-label', 'Seus amigos');
    var hint = document.createElement('div');
    hint.className = 'fr-wheel-hint';
    hint.textContent = L > 1 ? 'Deslize e clique no amigo do meio pra abrir o perfil' : 'Clique no amigo pra abrir o perfil';

    var items = [];
    for (var k = 0; k < L; k++) (function (slot) {
      var f = friends[slot % n];
      var it = document.createElement('button');
      it.type = 'button';
      it.className = 'fr-wheel-item';
      it.setAttribute('role', 'option');
      var fig = document.createElement('span');
      fig.className = 'fr-wheel-fig';
      var im = document.createElement('img');
      im.alt = ''; im.draggable = false;
      im.src = safeImg(f.character) || safeImg(f.avatar) || DEFAULT_AVATAR;
      fig.appendChild(im);
      if (!safeImg(f.character) && !safeImg(f.avatar)) {      // a lista não traz o boneco: busca no perfil do @
        fetchSenderAvatar(f.handle, function (img) { if (img) im.src = img; });
      }
      var nm = document.createElement('span'), hd = document.createElement('span');
      nm.className = 'fr-wheel-name'; nm.textContent = f.displayName || f.handle;
      hd.className = 'fr-wheel-handle'; hd.textContent = '@' + f.handle;
      it.appendChild(fig); it.appendChild(nm); it.appendChild(hd);
      it.addEventListener('click', function () {
        if (wasDragged) return;
        if (it.classList.contains('sel')) search(f.handle);
        else goTo(Math.round(pos) + Math.round(offset(slot)));
      });
      wheel.appendChild(it);
      items.push(it);
    })(k);
    wrap.appendChild(wheel); wrap.appendChild(hint);

    var pos = 0, target = 0, anim = 0, lastT = 0;      // em "posições" (1 = um amigo); sem limites: é um círculo
    function itemW() { return items[0].offsetWidth || 1; }
    function offset(slot) { var x = slot - pos; return x - L * Math.round(x / L); }   // distância do centro, no menor caminho
    function curSlot() { var r = Math.round(pos) % L; return r < 0 ? r + L : r; }

    // aparência: tamanho, giro e transparência variam de forma contínua com a distância do centro
    function update() {
      var w = itemW();
      items.forEach(function (it, slot) {
        var d = offset(slot);
        var ad = Math.abs(d);
        var fade = 1 - Math.pow(1 - Math.min(1, ad / 2), 1.3);   // 0 no meio -> 1 a 2 amigos de distância
        var rot = Math.max(-70, Math.min(70, d * 24));
        it.style.transform = 'translateX(' + (d * w).toFixed(1) + 'px) perspective(60rem) rotateY(' + rot.toFixed(1) + 'deg) scale(' + (1 - Math.min(ad, 3) * 0.1).toFixed(3) + ')';
        var o = 1 - fade;
        it.style.opacity = o.toFixed(3);
        it.style.visibility = o < 0.01 ? 'hidden' : 'visible';
        it.style.zIndex = String(Math.round(100 - ad * 10));
        var sel = ad < 0.5;
        if (sel !== it.classList.contains('sel')) {
          it.classList.toggle('sel', sel);
          it.setAttribute('aria-selected', sel ? 'true' : 'false');
        }
      });
    }

    // deslize suave: a posição "persegue" o alvo com desaceleração
    function frame(now) {
      var dt = Math.min(64, now - lastT || 16); lastT = now;
      var diff = target - pos;
      if (Math.abs(diff) < 0.002) { pos = target; anim = 0; }
      else { pos += diff * (1 - Math.exp(-dt / 110)); anim = requestAnimationFrame(frame); }
      update();
    }
    function run() { if (!anim) { lastT = performance.now(); anim = requestAnimationFrame(frame); } }
    function goTo(t) { if (L < 2) return; target = t; if (reduce) { pos = target; update(); } else run(); }
    function step(dir) { goTo(Math.round(target) + dir); }

    if (window.ResizeObserver) new ResizeObserver(update).observe(wheel);
    else window.addEventListener('resize', update);
    requestAnimationFrame(update);
    if (L < 2) return wrap;

    // hitbox: só os bonecos visíveis (com uma folguinha em volta) seguram a roda do mouse
    function overFriend(x, y) {
      var pad = 24;
      for (var i = 0; i < items.length; i++) {
        if (items[i].style.visibility === 'hidden' || parseFloat(items[i].style.opacity || '1') < 0.08) continue;
        var r = items[i].getBoundingClientRect();
        if (x >= r.left - pad && x <= r.right + pad && y >= r.top - pad && y <= r.bottom + pad) return true;
      }
      return false;
    }

    // roda do mouse / trackpad: cada "toque" avança UM amigo; fora da hitbox a página rola normalmente
    var acc = 0, accTimer = 0, lockUntil = 0;
    wheel.addEventListener('wheel', function (e) {
      var d = Math.abs(e.deltaY) >= Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
      if (e.deltaMode === 1) d *= 16;
      if (!d) return;
      if (!overFriend(e.clientX, e.clientY)) return;
      e.preventDefault();
      acc += d;
      clearTimeout(accTimer);
      accTimer = setTimeout(function () { acc = 0; }, 180);
      var now = performance.now();
      if (Math.abs(acc) < 40 || now < lockUntil) return;
      step(acc > 0 ? 1 : -1);
      acc = 0;
      lockUntil = now + 190;
    }, { passive: false });

    // teclado
    wheel.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); step(1); }
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); step(-1); }
      else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); search(friends[curSlot() % n].handle); }
    });

    // arrastar (mouse, toque e caneta) com inércia: ao soltar, a velocidade empurra e assenta num amigo
    var wasDragged = false, drag = null;
    wheel.addEventListener('pointerdown', function (e) {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      cancelAnimationFrame(anim); anim = 0;
      target = pos;
      drag = { x: e.clientX, start: pos, moved: false, id: e.pointerId, lx: e.clientX, lt: performance.now(), v: 0 };
    });
    wheel.addEventListener('pointermove', function (e) {
      if (!drag) return;
      var dx = e.clientX - drag.x;
      if (!drag.moved && Math.abs(dx) < 6) return;
      if (!drag.moved) { drag.moved = true; wheel.classList.add('dragging'); try { wheel.setPointerCapture(drag.id); } catch (er) {} }
      var now = performance.now(), dt = Math.max(1, now - drag.lt);
      drag.v = 0.8 * ((e.clientX - drag.lx) / dt) + 0.2 * drag.v;   // px/ms, suavizado
      drag.lx = e.clientX; drag.lt = now;
      pos = target = drag.start - dx / itemW();
      update();
    });
    function endDrag() {
      if (!drag) return;
      var d = drag; drag = null;
      if (!d.moved) return;
      wheel.classList.remove('dragging');
      wasDragged = true;
      setTimeout(function () { wasDragged = false; }, 0);   // engole o clique gerado ao soltar
      var idle = performance.now() - d.lt > 80;               // parou antes de soltar: sem inércia
      var fling = idle ? 0 : -d.v * 260 / itemW();
      goTo(Math.round(pos + fling));
    }
    wheel.addEventListener('pointerup', endDrag);
    wheel.addEventListener('pointercancel', endDrag);
    return wrap;
  }
  function loadFriends() {
    if (!loggedIn()) return renderFriends(null);
    mailApi('/api/friends').then(function (r) { if (r && r.ok) renderFriends(r); });
  }

  mailBtn.addEventListener('click', function () { if (shownHandle) openCompose(shownHandle); });

  // ---- menu ⋯ do perfil (Bloquear / Denunciar): por enquanto só visual, os botões ainda não fazem nada ----
  if (moreBtn && moreMenu) {
    moreBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      var open = moreMenu.classList.contains('hidden');
      moreMenu.classList.toggle('hidden', !open);
      moreBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    moreMenu.addEventListener('click', function (e) {
      e.stopPropagation();
      if (e.target.closest && e.target.closest('.sp-more-item')) closeMore();   // TODO: ligar bloquear/denunciar
    });
    document.addEventListener('click', closeMore);
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeMore(); });
  }
  tabFriends.addEventListener('click', function () { setPane('friends'); loadFriends(); });
  tabInbox.addEventListener('click', function () { setPane('inbox'); });
  document.addEventListener('truaccount', function () { refreshBadge(); loadFriends(); });
  setInterval(function () {
    var scr = document.getElementById('screen-social');
    if (scr && scr.classList.contains('active') && !document.hidden) { refreshBadge(); if (inboxOn && rdModal.classList.contains('hidden')) loadInbox(true); }
  }, 60000);

  openBtn.addEventListener('click', function () {
    showMe();
    closeSearch();
    input.value = '';
    setPane('friends');
    refreshBadge();
    loadFriends();
    showScreen('screen-social');
  });
  logoBtn.addEventListener('click', function () { closeBox(); closeMenu(); showScreen('screen-lobby'); });
})();
