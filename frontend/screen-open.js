// ============================================================================
// EFEITO DE "ABRIR" (botões Avatar e Social da tela inicial)
// Em vez de a tela nova aparecer do nada, ela se abre a partir do botão clicado:
// um círculo cresce do centro do botão até cobrir tudo (clip-path), com um
// leve fade (sem zoom: escalar a tela com filtros SVG dentro deixava a abertura pesada). A tela inicial fica visível por baixo durante o efeito.
// Funciona sem mexer no showScreen(): um MutationObserver percebe quando a tela
// vira .active e, se ela foi aberta por um desses botões, anima.
// Ajustes: DURATION (ms) e EASING. Respeita "reduzir movimento".
// ============================================================================
(function () {
  var DURATION = 700;
  var EASING = 'cubic-bezier(.22,.8,.2,1)';

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
      open(screen, o.x, o.y);
    }).observe(screen, { attributes: true, attributeFilter: ['class'] });
  });

  function open(screen, x, y) {
    var lobby = document.getElementById('screen-lobby');
    var W = window.innerWidth, H = window.innerHeight;
    var R = Math.ceil(Math.hypot(Math.max(x, W - x), Math.max(y, H - y))) + 4;

    // a tela nova vai por cima (fixa) e a inicial continua visível por baixo
    if (lobby) lobby.classList.add('screen-keep');
    var prev = screen.style.cssText;
    screen.style.position = 'fixed';
    screen.style.inset = '0';
    screen.style.zIndex = '60';
    screen.style.width = '100%';
    screen.style.height = '100dvh';

    // durante o efeito: congela o "tremido" (boil.js) e avisa o navegador pra preparar a camada,
    // senão os filtros SVG do editor são recalculados a cada quadro e a abertura engasga
    var root = document.documentElement;
    root.classList.add('screen-opening');
    screen.style.willChange = 'clip-path, opacity';

    function done() {
      screen.style.cssText = prev;
      if (lobby) lobby.classList.remove('screen-keep');
      root.classList.remove('screen-opening');
    }

    var anim = screen.animate([
      { clipPath: 'circle(0px at ' + x + 'px ' + y + 'px)', opacity: 0.4 },
      { clipPath: 'circle(' + R + 'px at ' + x + 'px ' + y + 'px)', opacity: 1 }
    ], { duration: DURATION, easing: EASING });
    anim.onfinish = done;
    anim.oncancel = done;
  }
})();
