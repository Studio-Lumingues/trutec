// ============================================================================
// SOCIAL (botão "Social" na tela inicial)
// Só abre/fecha a tela com a aba "Social" e os 3 bots (Thiago, Jailson, João).
// Por enquanto os bots são só visuais; as ações entram depois.
// Depende do showScreen() do client.js (por isso carrega depois dele).
// ============================================================================
(function () {
  var openBtn = document.getElementById('btn-open-social');
  var closeBtn = document.getElementById('btn-close-social');
  if (!openBtn || !closeBtn || typeof showScreen !== 'function') return;

  openBtn.addEventListener('click', function () { showScreen('screen-social'); });
  closeBtn.addEventListener('click', function () { showScreen('screen-lobby'); });
})();
