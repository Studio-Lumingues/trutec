// ============================================================================
// ESCOLHA DO MODO: clicar em "Jogar" (tela inicial) abre uma janelinha com 2 botões:
//  1) Truco Paulista: segue o fluxo de sempre (a janela de código da sala).
//  2) Trutec: abre o modo solo (o botão #btn-open-trutec fica escondido na tela inicial).
// Carregar depois do trutec.js e do client.js.
// ============================================================================
(function () {
  var play = document.getElementById('btn-play');
  var solo = document.getElementById('btn-open-trutec');
  if (!play || !solo) return;

  var root = document.createElement('div');
  root.id = 'mode-pick';
  root.className = 'mp hidden';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-label', 'Escolha como jogar');
  root.innerHTML =
    '<div class="mp-box">' +
      '<h2>Como você quer jogar?</h2>' +
      '<button type="button" class="btn btn-primary" data-mode="truco">Truco Paulista<small>online, com amigos</small></button>' +
      '<button type="button" class="btn btn-primary" data-mode="trutec">Trutec<small>solo</small></button>' +
      '<button type="button" class="btn btn-secondary mp-back" data-sfx="back">‹ Voltar</button>' +
    '</div>';
  document.body.appendChild(root);

  function open() {
    root.classList.remove('hidden');
    document.body.classList.add('mp-open');
    var f = root.querySelector('[data-mode]'); if (f) f.focus({ preventScroll: true });
  }
  function close() {
    root.classList.add('hidden');
    document.body.classList.remove('mp-open');
    if (play.offsetParent) play.focus({ preventScroll: true });
  }
  window.openModePick = open;

  var bypass = false;
  // captura + stopImmediatePropagation: roda antes do handler do client.js
  play.addEventListener('click', function (e) {
    if (bypass) return;
    if (window.TruTutorial && TruTutorial.running && TruTutorial.running()) return;   // o tutorial clica em "Jogar" pra mostrar a janela da sala
    e.preventDefault(); e.stopImmediatePropagation();
    open();
  }, true);

  root.addEventListener('click', function (e) {
    if (e.target === root || e.target.closest('.mp-back')) return close();
    var b = e.target.closest('[data-mode]');
    if (!b) return;
    close();
    if (b.dataset.mode === 'trutec') solo.click();
    else { bypass = true; try { play.click(); } finally { bypass = false; } }
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !root.classList.contains('hidden')) close();
  });
})();
