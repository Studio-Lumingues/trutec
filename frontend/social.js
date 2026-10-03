// ============================================================================
// SOCIAL (botão "Social" na tela inicial)
// Layout estilo Letterboxd: barra no topo (logo = voltar, aba Amigos, lupa),
// card grande à esquerda com o PERFIL (começa mostrando o seu: nome, boneco,
// estatísticas e a sua coleção) e a seção Amigos à direita.
// - Coleção: cartazes retangulares (estilo "filmes favoritos" do Letterboxd).
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
  var sinceEl = document.getElementById('sp-since');
  var winsEl = document.getElementById('sp-wins');
  var lossesEl = document.getElementById('sp-losses');
  var rateEl = document.getElementById('sp-rate');
  var colWrap = document.getElementById('sp-collection-wrap');
  var slotsEl = document.getElementById('sp-slots');
  var copyBtn = document.getElementById('sp-copy');

  var DEFAULT_AVATAR = 'assets/personagem.svg';
  var PNG = 'data:image/png;base64,';
  var reqId = 0;           // ignora respostas de buscas antigas
  var shownHandle = '';

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
      '<img class="sp-lightbox-img" alt="" draggable="false" />';
    document.body.appendChild(box);
    boxImg = box.querySelector('img');
    box.addEventListener('click', closeBox);          // clicar em qualquer lugar fecha
  }
  function openBox(src, from) {
    buildBox();
    boxImg.src = src;
    boxFrom = from;
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

  function renderCollection(collection, equipped) {
    slotsEl.innerHTML = '';
    if (!Array.isArray(collection)) { colWrap.hidden = true; return; }
    var any = false;
    for (var i = 0; i < 3; i++) {
      var img = safeImg(collection[i]);
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'sp-slot' + (img ? '' : ' empty');
      b.setAttribute('aria-label', 'Boneco ' + (i + 1) + (img ? '' : ' (vazio)'));
      if (img) {
        any = true;
        var im = document.createElement('img');
        im.src = img; im.alt = ''; im.draggable = false;
        b.appendChild(im);
        if (img === equipped) { b.classList.add('active'); b.title = 'Boneco ' + (i + 1) + ' (em uso)'; }
        else b.title = 'Ver o boneco ' + (i + 1);
        b.addEventListener('click', (function (src, btn) {
          return function () { openBox(src, btn); };
        })(img, b));
      } else {
        b.disabled = true;
      }
      slotsEl.appendChild(b);
    }
    colWrap.hidden = !any;
  }

  // d = { name, handle, since, wins, losses, avatar, collection, other }
  function paint(d) {
    var wins = num(d.wins), losses = num(d.losses), total = wins + losses;
    avatarEl.src = safeImg(d.avatar) || DEFAULT_AVATAR;
    nameEl.textContent = d.name || 'Jogador';
    handleEl.textContent = d.handle ? '@' + d.handle : '';
    handleEl.hidden = !d.handle;
    sinceEl.textContent = d.since || '';
    winsEl.textContent = wins;
    lossesEl.textContent = losses;
    rateEl.textContent = total ? Math.round(wins / total * 100) + '%' : '—';
    renderCollection(d.collection, safeImg(d.avatar));
    copyBtn.classList.toggle('hidden', !d.handle);   // aparece no perfil de quem tem @ (inclusive o seu)
    copyBtn.textContent = 'Copiar link do perfil';
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
  function myData() {
    var name = '';
    try { name = localStorage.getItem('trutec-name') || ''; } catch (e) {}
    var inp = document.getElementById('input-name');
    if (inp && inp.value.trim()) name = inp.value.trim();
    var st = window.TruStats ? TruStats.get() : { wins: 0, losses: 0 };
    var avatar = null, slots = null;
    try { avatar = localStorage.getItem('trutec_meu_personagem'); } catch (e) {}
    try {
      var arr = JSON.parse(localStorage.getItem('trutec_avatar_slots'));
      if (Array.isArray(arr)) slots = [0, 1, 2].map(function (i) { return arr[i] && arr[i].img ? arr[i].img : null; });
    } catch (e) {}
    return {
      name: name || 'Jogador', handle: myHandle(), since: mySince(), wins: st.wins, losses: st.losses,
      avatar: avatar, collection: slots, other: false
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
    var pub = document.getElementById('sn-public');
    pub.hidden = !handle;
    if (handle) pub.href = '/@' + handle;
    document.getElementById('sn-copy').hidden = !handle;
  }
  if (uBtn && uMenu) {
    uBtn.addEventListener('click', function (e) { e.stopPropagation(); if (menuOpen()) closeMenu(); else openMenu(); });
    document.addEventListener('click', function (e) { if (menuOpen() && !uWrap.contains(e.target)) closeMenu(); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && menuOpen()) { closeMenu(); uBtn.focus(); }
    });
    document.getElementById('sn-me').addEventListener('click', function () { closeMenu(); closeSearch(); input.value = ''; showMe(); });
    document.getElementById('sn-public').addEventListener('click', closeMenu);
    document.getElementById('sn-copy').addEventListener('click', function () {
      var p = window.TruAccount && TruAccount.profile(), b = this;
      if (!p || !navigator.clipboard) return;
      navigator.clipboard.writeText(location.origin + '/@' + p.handle).then(function () {
        b.textContent = 'Link copiado!';
        setTimeout(function () { b.textContent = 'Copiar link'; closeMenu(); }, 900);
      }).catch(function () {});
    });
    document.getElementById('sn-logout').addEventListener('click', function () {
      if (window.TruAccount && TruAccount.logout) TruAccount.logout();
    });
    document.addEventListener('truaccount', refreshUser);
    refreshUser();
  }

  function showMe() {
    refreshUser();
    reqId++;                 // cancela busca em andamento
    closeBox();
    shownHandle = myHandle();   // o seu @ também pode ter o link copiado
    say('');
    paint(myData());
  }

  // ---- busca ----
  function search(raw) {
    var handle = normalize(raw);
    if (!handle) return say('Digite o @ de alguém pra ver o perfil.');
    if (!/^[a-z0-9_]{3,16}$/.test(handle)) return say('O @ tem de 3 a 16 letras, números ou _.', true);
    var id = ++reqId;
    say('Procurando @' + handle + '…');
    fetch(RESOLVED_BACKEND_URL + '/api/profile/' + encodeURIComponent(handle))
      .then(function (r) { return r.json(); })
      .then(function (r) {
        if (id !== reqId) return;
        if (!r || !r.ok || !r.profile) return say((r && r.error) || 'Ninguém com esse @ foi encontrado.', true);
        var p = r.profile, since = '';
        if (p.createdAt) {
          var d = new Date(p.createdAt);
          if (!isNaN(d)) since = 'Jogando desde ' + d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
        }
        say('');
        shownHandle = String(p.handle || handle);
        paint({
          name: p.name || p.displayName || shownHandle, handle: shownHandle, since: since, wins: p.wins, losses: p.losses,
          avatar: p.character, collection: p.collection, other: true
        });
      })
      .catch(function () {
        if (id !== reqId) return;
        say('Servidor indisponível. Tente de novo em instantes.', true);
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

  copyBtn.addEventListener('click', function () {
    if (!shownHandle || !navigator.clipboard) return;
    navigator.clipboard.writeText(location.origin + '/@' + shownHandle).then(function () {
      copyBtn.textContent = 'Link copiado!';
      setTimeout(function () { copyBtn.textContent = 'Copiar link do perfil'; }, 1500);
    }).catch(function () {});
  });

  openBtn.addEventListener('click', function () {
    showMe();
    closeSearch();
    input.value = '';
    showScreen('screen-social');
  });
  logoBtn.addEventListener('click', function () { closeBox(); closeMenu(); showScreen('screen-lobby'); });
})();
