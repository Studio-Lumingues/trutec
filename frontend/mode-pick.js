// ============================================================================
// ESCOLHA DO MODO: clicar em "Jogar" (tela inicial) abre um card com 2 opções:
//  1) Truco Paulista: segue o fluxo de sempre (a janela de código da sala).
//  2) Trutec: mostra um loading (spinner clássico) e abre o modo solo.
// O botão #btn-open-trutec fica escondido na tela inicial; o card é quem o aciona.
// Ajuste: LOAD_MS = quanto tempo o loading fica na tela antes de abrir o Trutec.
// Carregar depois do trutec.js e do client.js.
// ============================================================================
(function () {
  var LOAD_MS = 1100;

  var play = document.getElementById('btn-play');
  var solo = document.getElementById('btn-open-trutec');
  if (!play || !solo) return;

  var spokes = '';
  for (var i = 0; i < 12; i++) {
    spokes += '<rect x="46" y="6" width="8" height="24" rx="4" transform="rotate(' + (i * 30) + ' 50 50)" opacity="' + (0.12 + (i / 11) * 0.88).toFixed(2) + '"/>';
  }

  var root = document.createElement('div');
  root.id = 'mode-pick';
  root.className = 'mp hidden';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-label', 'Escolha como jogar');
  root.innerHTML =
    '<div class="mp-box">' +
      '<div class="mp-view mp-pick">' +
        '<h2 class="mp-title">Como você quer jogar?</h2>' +
        '<button type="button" class="btn btn-primary mp-opt" data-mode="truco">Truco Paulista<small>Online, com amigos</small></button>' +
        '<button type="button" class="btn btn-primary mp-opt" data-mode="trutec">Trutec<small>Solo</small></button>' +
        '<button type="button" class="mp-back" data-sfx="back">Voltar</button>' +
      '</div>' +
      '<div class="mp-view mp-load" aria-live="polite">' +
        '<svg class="mp-spin" viewBox="0 0 100 100" aria-hidden="true">' + spokes + '</svg>' +
        '<div class="mp-load-txt">Abrindo o Trutec…</div>' +
      '</div>' +
    '</div>';
  document.body.appendChild(root);

  var box = root.querySelector('.mp-box');
  var loading = false, timer = 0;

  function open() {
    clearTimeout(timer); loading = false; box.classList.remove('loading');
    root.classList.remove('hidden');
    document.body.classList.add('mp-open');
    var f = root.querySelector('[data-mode]'); if (f) f.focus({ preventScroll: true });
  }
  function close() {
    clearTimeout(timer); loading = false;
    root.classList.add('hidden');
    box.classList.remove('loading');
    document.body.classList.remove('mp-open');
    if (play.offsetParent) play.focus({ preventScroll: true });
  }
  window.openModePick = open;

  function startTrutec() {
    if (loading) return;
    loading = true;
    box.classList.add('loading');
    timer = setTimeout(function () {
      close();
      solo.click();
    }, LOAD_MS);
  }

  var bypass = false;
  // captura + stopImmediatePropagation: roda antes do handler do client.js
  play.addEventListener('click', function (e) {
    if (bypass) return;
    if (window.TruTutorial && TruTutorial.running && TruTutorial.running()) return;   // o tutorial clica em "Jogar" pra mostrar a janela da sala
    e.preventDefault(); e.stopImmediatePropagation();
    open();
  }, true);

  root.addEventListener('click', function (e) {
    if (loading) return;
    if (e.target === root || e.target.closest('.mp-back')) return close();
    var b = e.target.closest('[data-mode]');
    if (!b) return;
    if (b.dataset.mode === 'trutec') return startTrutec();
    close();
    bypass = true; try { play.click(); } finally { bypass = false; }
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !loading && !root.classList.contains('hidden')) close();
  });
})();
