// ============================================================================
// BAIXAR O PERFIL DA CONTA (avatar, coleção) EM APARELHO NOVO
// O jogo guarda avatares no localStorage e só ENVIAVA pro servidor; nada voltava.
// Aqui, depois do login, se este aparelho não tem avatar nenhum, trazemos do
// servidor o boneco equipado e os 3 da coleção, e recarregamos a página uma vez
// pro editor (client.js) ler os dados novos. Nunca sobrescreve o que já existe aqui.
// Carregar depois do account.js e ANTES do client.js.
// ============================================================================
(function () {
  var SLOTS_KEY = 'trutec_avatar_slots', ACTIVE_KEY = 'trutec_avatar_active';
  var SHOW_KEY = 'trutec_showcase', CHAR_KEY = 'trutec_meu_personagem';
  var PNG = 'data:image/png;base64,';
  var busy = false;

  function hasLocalAvatar() {
    try {
      var arr = JSON.parse(localStorage.getItem(SLOTS_KEY));
      if (Array.isArray(arr) && arr.some(function (x) { return x && typeof x.img === 'string'; })) return true;
    } catch (e) {}
    try { if (localStorage.getItem(CHAR_KEY)) return true; } catch (e) {}
    return false;
  }
  function isPng(v) { return typeof v === 'string' && v.indexOf(PNG) === 0; }

  function pull() {
    var acc = window.TruAccount;
    if (busy || !acc || !acc.isLoggedIn || !acc.isLoggedIn() || hasLocalAvatar()) return;
    var p = acc.profile && acc.profile();
    if (!p || !p.handle) return;
    busy = true;
    fetch(RESOLVED_BACKEND_URL + '/api/profile/' + encodeURIComponent(p.handle))
      .then(function (r) { return r.json(); })
      .then(function (r) {
        if (!r || !r.ok || hasLocalAvatar()) return;
        var pr = r.profile, slots = [null, null, null], show = [null, null, null], active = -1;
        function place(img) {                       // devolve o espaço onde a imagem ficou
          for (var i = 0; i < 3; i++) if (slots[i] && slots[i].img === img) return i;
          for (var j = 0; j < 3; j++) if (!slots[j]) { slots[j] = { img: img, draw: null, skin: { h: 0, s: 1, b: 1 } }; return j; }
          return -1;
        }
        (pr.collection || []).forEach(function (img, k) { if (isPng(img)) show[k] = place(img) >= 0 ? place(img) : null; });
        if (isPng(pr.character)) active = place(pr.character);
        if (!slots.some(Boolean)) return;
        try {
          localStorage.setItem(SLOTS_KEY, JSON.stringify(slots));
          localStorage.setItem(SHOW_KEY, JSON.stringify(show));
          if (active >= 0) { localStorage.setItem(ACTIVE_KEY, String(active)); localStorage.setItem(CHAR_KEY, slots[active].img); }
        } catch (e) { return; }
        location.reload();                          // o client.js lê os espaços só ao carregar
      })
      .catch(function () {})
      .then(function () { busy = false; });
  }

  document.addEventListener('truaccount', pull);
  if (window.TruAccount && TruAccount.ready) TruAccount.ready().then(pull);
})();
