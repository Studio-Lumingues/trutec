// ============================================================================
// BOTÃO "SOCIAL" DA TELA INICIAL: bonecos dos seus amigos
// Os dois bonecos brancos do botão viram dois dos SEUS amigos adicionados e vão
// se alternando (um troca, depois o outro) em fade. Nunca mostra o mesmo amigo
// nos dois ao mesmo tempo. Com 1 amigo, só o da frente; com 0 (ou sem login),
// ficam os bonecos brancos de sempre. Com só 2 amigos, os dois ficam fixos.
// Ajustes: INTERVAL (ms entre trocas) e REFRESH (ms entre atualizações da lista).
// Carregar depois do account.js.
// ============================================================================
(function () {
  var INTERVAL = 3500;
  var REFRESH = 120000;
  var FADE = 350;
  var PNG = 'data:image/png;base64,';
  var WHITE = 'assets/personagem-branco.svg';
  var DEFAULT = 'assets/personagem.svg';

  var back = document.querySelector('#btn-open-social .gd-back');
  var front = document.querySelector('#btn-open-social .gd-front');
  if (!back || !front) return;
  var slots = [back, front];

  var friends = [], avatars = {}, pending = {};
  var shown = [-1, -1];          // índice (em friends) mostrado em cada boneco
  var next = 0, turn = 0, timer = 0, busy = false;

  function isPng(v) { return typeof v === 'string' && v.indexOf(PNG) === 0; }

  function getAvatar(f, cb) {
    var h = f.handle;
    if (avatars[h] !== undefined) return cb(avatars[h]);
    var direct = isPng(f.character) ? f.character : (isPng(f.avatar) ? f.avatar : '');
    if (direct) { avatars[h] = direct; return cb(direct); }
    if (pending[h]) return pending[h].push(cb);
    pending[h] = [cb];
    fetch(RESOLVED_BACKEND_URL + '/api/profile/' + encodeURIComponent(h))
      .then(function (r) { return r.json(); })
      .then(function (r) { return r && r.ok && r.profile && isPng(r.profile.character) ? r.profile.character : ''; })
      .catch(function () { return ''; })
      .then(function (img) {
        avatars[h] = img || DEFAULT;
        var l = pending[h]; delete pending[h];
        l.forEach(function (fn) { fn(avatars[h]); });
      });
  }

  // troca a imagem de um boneco com fade (carrega antes, pra não piscar vazio)
  function setSlot(i, src, cb) {
    var el = slots[i];
    var im = new Image();
    var go = function () {
      el.classList.add('gd-fade');
      setTimeout(function () {
        el.src = src;
        requestAnimationFrame(function () { el.classList.remove('gd-fade'); if (cb) cb(); });
      }, FADE);
    };
    im.onload = im.onerror = go;
    im.src = src;
  }

  function pick(avoid) {          // próximo amigo da fila que não seja um dos "avoid"
    var n = friends.length;
    for (var k = 0; k < n; k++) {
      var c = (next + k) % n;
      if (avoid.indexOf(c) === -1) { next = (c + 1) % n; return c; }
    }
    return -1;
  }

  function show(i, idx, cb) {
    shown[i] = idx;
    getAvatar(friends[idx], function (src) {
      if (shown[i] !== idx) return cb && cb();   // a lista mudou no meio do caminho
      setSlot(i, src, cb);
    });
  }

  function reset() {
    clearInterval(timer); timer = 0; busy = false;
    shown = [-1, -1]; next = 0; turn = 0;
    slots.forEach(function (el) { el.classList.remove('gd-fade'); if (el.getAttribute('src') !== WHITE) el.src = WHITE; });
  }

  function tick() {
    if (busy || document.hidden || friends.length < 3) return;
    var i = turn; turn = 1 - turn;               // alterna: esquerdo, direito, esquerdo...
    var idx = pick([shown[0], shown[1]]);        // diferente dos DOIS que estão na tela
    if (idx < 0) return;
    busy = true;
    show(i, idx, function () { busy = false; });
  }

  function start() {
    reset();
    var n = friends.length;
    if (!n) return;
    if (n === 1) { show(1, 0); return; }                       // só o da frente
    show(0, 0); show(1, 1); next = 2 % n;                      // os dois primeiros, diferentes
    turn = 0;
    if (n >= 3) timer = setInterval(tick, INTERVAL);
  }

  var sig = '';
  function load() {
    var acc = window.TruAccount;
    if (!acc || !acc.api || !acc.profile || !acc.profile()) { if (sig !== '') { sig = ''; friends = []; reset(); } return; }
    acc.api('/api/friends').then(function (r) {
      if (!r || !r.ok) return;
      var list = (r.friends || []).filter(function (f) { return f && f.handle; });
      var s = list.map(function (f) { return f.handle; }).join(',');
      if (s === sig) return;                                    // nada mudou: não reinicia
      sig = s; friends = list; start();
    }).catch(function () {});
  }

  document.addEventListener('truaccount', load);
  if (window.TruAccount && TruAccount.ready) TruAccount.ready().then(load);
  setInterval(load, REFRESH);
  document.addEventListener('visibilitychange', function () { if (!document.hidden) load(); });
})();
