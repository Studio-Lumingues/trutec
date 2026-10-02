// ============================================================================
// SOCIAL (botão "Social" na tela inicial)
// - Abre/fecha a tela Social (depende do showScreen() do client.js).
// - Busca por @: consulta GET {backend}/api/profile/<handle> e mostra o perfil
//   (boneco em uso, vitórias/derrotas/aproveitamento e a coleção de bonecos).
// Formato esperado da resposta:
//   { ok: true, profile: { handle, wins, losses, createdAt,
//                          character: "data:image/png;base64,...",   // em uso
//                          collection: [png|null, png|null, png|null] // opcional
//                        } }
// Se o servidor ainda não manda "collection", a seção Coleção fica escondida.
// ============================================================================
(function () {
  var openBtn = document.getElementById('btn-open-social');
  var closeBtn = document.getElementById('btn-close-social');
  if (!openBtn || !closeBtn || typeof showScreen !== 'function') return;

  var input = document.getElementById('social-input');
  var form = document.getElementById('social-search');
  var goBtn = document.getElementById('social-go');
  var msg = document.getElementById('social-msg');
  var box = document.getElementById('social-profile');
  var avatarEl = document.getElementById('sp-avatar');
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

  function say(text, isError) {
    msg.textContent = text;
    msg.classList.toggle('error', !!isError);
    msg.hidden = !text;
  }
  function safeImg(v) { return typeof v === 'string' && v.indexOf(PNG) === 0 ? v : null; }
  function num(v) { v = parseInt(v, 10); return isFinite(v) && v > 0 ? v : 0; }

  function normalize(raw) {
    return String(raw || '').trim().toLowerCase().replace(/^@+/, '');
  }

  // ---- coleção: clicar num boneco da coleção mostra ele grande ----
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
          return function () {
            avatarEl.src = src;
            Array.prototype.forEach.call(slotsEl.children, function (c) { c.classList.remove('viewing'); });
            btn.classList.add('viewing');
          };
        })(img, b));
      } else {
        b.disabled = true;
      }
      var n = document.createElement('span');
      n.className = 'sp-slot-num';
      n.textContent = String(i + 1);
      b.appendChild(n);
      slotsEl.appendChild(b);
    }
    colWrap.hidden = !any;
  }

  function render(p) {
    var wins = num(p.wins), losses = num(p.losses), total = wins + losses;
    var equipped = safeImg(p.character);
    shownHandle = String(p.handle || '');
    avatarEl.src = equipped || DEFAULT_AVATAR;
    handleEl.textContent = '@' + shownHandle;
    var since = '';
    if (p.createdAt) {
      var d = new Date(p.createdAt);
      if (!isNaN(d)) since = 'Jogando desde ' + d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
    }
    sinceEl.textContent = since;
    winsEl.textContent = wins;
    lossesEl.textContent = losses;
    rateEl.textContent = total ? Math.round(wins / total * 100) + '%' : '—';
    renderCollection(p.collection, equipped);
    copyBtn.textContent = 'Copiar link do perfil';
    box.classList.remove('hidden');
  }

  function search(raw) {
    var handle = normalize(raw);
    if (!handle) { box.classList.add('hidden'); return say('Digite o @ de alguém pra ver o perfil.'); }
    if (!/^[a-z0-9_]{3,16}$/.test(handle)) {
      box.classList.add('hidden');
      return say('O @ tem de 3 a 16 letras, números ou _.', true);
    }
    var id = ++reqId;
    goBtn.disabled = true;
    say('Procurando @' + handle + '…');
    fetch(RESOLVED_BACKEND_URL + '/api/profile/' + encodeURIComponent(handle))
      .then(function (r) { return r.json(); })
      .then(function (r) {
        if (id !== reqId) return;
        goBtn.disabled = false;
        if (!r || !r.ok || !r.profile) {
          box.classList.add('hidden');
          return say((r && r.error) || 'Ninguém com esse @ foi encontrado.', true);
        }
        say('');
        render(r.profile);
      })
      .catch(function () {
        if (id !== reqId) return;
        goBtn.disabled = false;
        box.classList.add('hidden');
        say('Servidor indisponível. Tente de novo em instantes.', true);
      });
  }

  form.addEventListener('submit', function (e) { e.preventDefault(); search(input.value); });
  // aceita colar "@fulano" ou o link do perfil
  input.addEventListener('input', function () {
    var v = input.value;
    var m = v.match(/\/@([A-Za-z0-9_]+)/);
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
    showScreen('screen-social');
    setTimeout(function () { try { input.focus(); } catch (e) {} }, 50);
  });
  closeBtn.addEventListener('click', function () { showScreen('screen-lobby'); });
})();
