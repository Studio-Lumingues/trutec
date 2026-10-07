// ============================================================================
// MOSAICO "JOGAR": Truco Paulista | Trutec
// Clicar em "Jogar" (tela inicial) abre dois mosaicos lado a lado. Atrás de cada
// um roda uma demo com bots (mode-demo.js). Escolher:
//  - Truco Paulista: segue o fluxo de sempre (a janela de código da sala).
//  - Trutec: abre o modo solo (o botão #btn-open-trutec fica escondido na tela inicial).
// Carregar depois do mode-demo.js e do trutec.js.
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
    '<div class="mp-top"><button type="button" class="btn btn-secondary mp-back">‹ Voltar</button><h2>Como você quer jogar?</h2></div>' +
    '<div class="mp-grid">' +
      tile('truco', 'Online · com amigos', 'Truco Paulista', '1 vs 1 ou 2 vs 2. Crie uma sala ou entre com o código de um amigo.') +
      tile('trutec', 'Solo · roguelike', 'Trutec', 'Compre curingas, bata a meta de pontos e vença os chefes.') +
    '</div>';
  document.body.appendChild(root);

  function tile(mode, kicker, title, text) {
    return '<button type="button" class="mp-tile mp-' + mode + '" data-mode="' + mode + '">' +
      '<span class="mp-demo" aria-hidden="true"><span class="mp-stage" id="mp-stage-' + mode + '"></span></span>' +
      '<span class="mp-info"><span class="mp-txt"><small>' + kicker + '</small><b>' + title + '</b><span class="mp-desc">' + text + '</span></span><em class="mp-go btn">Jogar ›</em></span>' +
    '</button>';
  }

  function open() {
    root.classList.remove('hidden');
    document.body.classList.add('mp-open');            // esconde o Jailson (botão do tutorial) nesta tela
    if (window.TruModeDemo) TruModeDemo.start(document.getElementById('mp-stage-truco'), document.getElementById('mp-stage-trutec'));
    var f = root.querySelector('.mp-tile'); if (f) f.focus({ preventScroll: true });
  }
  function close() {
    root.classList.add('hidden');
    document.body.classList.remove('mp-open');
    if (window.TruModeDemo) TruModeDemo.stop();
    if (play.offsetParent) play.focus({ preventScroll: true });
  }
  window.openModePick = open;

  var bypass = false;
  // captura + stopImmediatePropagation (igual ao gate.js): roda antes do handler do client.js
  play.addEventListener('click', function (e) {
    if (bypass) return;
    if (window.TruTutorial && TruTutorial.running && TruTutorial.running()) return;   // o tutorial clica em "Jogar" pra mostrar a janela da sala
    e.preventDefault(); e.stopImmediatePropagation();
    open();
  }, true);

  root.addEventListener('click', function (e) {
    if (e.target.closest('.mp-back')) return close();
    var t = e.target.closest('.mp-tile');
    if (!t) return;
    close();
    if (t.dataset.mode === 'trutec') solo.click();
    else { bypass = true; try { play.click(); } finally { bypass = false; } }
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !root.classList.contains('hidden')) close();
  });
  document.addEventListener('visibilitychange', function () {
    if (document.hidden && !root.classList.contains('hidden') && window.TruModeDemo) TruModeDemo.stop();
    else if (!document.hidden && !root.classList.contains('hidden')) open();
  });
})();
