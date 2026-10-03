// ============================================================================
// EFEITO DE "ABRIR" (botões Avatar e Social da tela inicial)
// A tela nova aparece com um fade-in simples (só opacidade, que é leve e não
// engasga). A tela inicial fica visível por baixo durante o efeito.
// Funciona sem mexer no showScreen(): um MutationObserver percebe quando a tela
// vira .active e, se ela foi aberta por um desses botões, anima.
// Ajustes: DURATION (ms) e EASING. Respeita "reduzir movimento".
// ============================================================================
(function () {
  var DURATION = 300;
  var EASING = 'ease-out';

  var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduced || !Element.prototype.animate) return;

  // botão -> tela que ele abre
  var MAP = [
    { btn: 'btn-open-character-editor', screen: 'screen-character-editor' },
    { btn: 'btn-open-social', screen: 'screen-social' }
  ];

  var origin = null;   // { screen, x, y, t }

  MAP.forEach(function (m) {
    var btn = document.getElementById(m.btn);
    var screen = document.getElementById(m.screen);
    if (!btn || !screen) return;

    // guarda de onde veio o clique (fase de captura: roda antes do handler que troca a tela)
    btn.addEventListener('click', function () {
      var r = btn.getBoundingClientRect();
      origin = { screen: m.screen, x: r.left + r.width / 2, y: r.top + r.height / 2, t: performance.now() };
    }, true);

    new MutationObserver(function () {
      if (!screen.classList.contains('active')) return;
      if (!origin || origin.screen !== m.screen || performance.now() - origin.t > 400) return;
      var o = origin; origin = null;
      open(screen);
    }).observe(screen, { attributes: true, attributeFilter: ['class'] });
  });

  function open(screen) {
    var lobby = document.getElementById('screen-lobby');
    var root = document.documentElement;

    // a tela nova entra por cima (fixa) com um fade-in; a inicial fica por baixo até acabar
    if (lobby) lobby.classList.add('screen-keep');
    var prev = screen.style.cssText;
    screen.style.position = 'fixed';
    screen.style.inset = '0';
    screen.style.zIndex = '60';
    screen.style.width = '100%';
    screen.style.height = '100dvh';
    screen.style.willChange = 'opacity';
    root.classList.add('screen-opening');   // congela o "tremido" (boil.js) durante o fade

    function done() {
      screen.style.cssText = prev;
      if (lobby) lobby.classList.remove('screen-keep');
      root.classList.remove('screen-opening');
    }

    var anim = screen.animate([{ opacity: 0 }, { opacity: 1 }], { duration: DURATION, easing: EASING });
    anim.onfinish = done;
    anim.oncancel = done;
  }
})();
