// ============================================================================
// EFEITO DE "ABRIR" (botões Avatar e Social da tela inicial)
// Em vez de a tela nova aparecer do nada, ela se abre a partir do botão clicado:
// um círculo cresce do centro do botão até cobrir tudo (clip-path), com um
// pequeno zoom. Na borda do círculo vai um anel líquido: ondulado (distorção)
// e com as cores separadas em vermelho/verde/azul (aberração RGB). A tela inicial
// fica visível por baixo durante o efeito.
// Funciona sem mexer no showScreen(): um MutationObserver percebe quando a tela
// vira .active e, se ela foi aberta por um desses botões, anima.
// Ajustes: DURATION (ms), EASING e os valores do anel (RING_*). Respeita "reduzir movimento".
// ============================================================================
(function () {
  var DURATION = 700;
  var EASING = 'cubic-bezier(.22,.8,.2,1)';
  var RING_BASE = 700;       // px do anel desenhado (ele é só ampliado depois: barato)
  var RING_CENTER = 0.84;    // onde, no raio do anel, fica o centro das cores (a borda do círculo)
  var RING_BG =              // bandas R / G / B em volta da borda (de dentro pra fora)
    'radial-gradient(circle closest-side, transparent 0, transparent 68%,' +
    ' rgba(255,40,90,0) 72%, rgba(255,40,90,.75) 78%, rgba(70,255,130,.7) 84%,' +
    ' rgba(60,110,255,.75) 90%, rgba(60,110,255,0) 96%, transparent 100%)';

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

    // anel RGB ondulado na borda do círculo (cresce junto com ele)
    var ring = document.createElement('div');
    ring.setAttribute('aria-hidden', 'true');
    ring.style.cssText = 'position:fixed;pointer-events:none;z-index:61;border-radius:50%;will-change:transform,opacity;' +
      'mix-blend-mode:screen;filter:url(#ring-wobble);' +
      'left:' + (x - RING_BASE / 2) + 'px;top:' + (y - RING_BASE / 2) + 'px;' +
      'width:' + RING_BASE + 'px;height:' + RING_BASE + 'px;background:' + RING_BG;
    document.body.appendChild(ring);
    var S = R / (RING_BASE / 2 * RING_CENTER);   // escala final: o centro das cores acompanha a borda

    function done() {
      screen.style.cssText = prev;
      if (lobby) lobby.classList.remove('screen-keep');
      if (ring.parentNode) ring.parentNode.removeChild(ring);
    }

    ring.animate([
      { transform: 'scale(0) rotate(0deg)', opacity: 0 },
      { transform: 'scale(' + (S * 0.15) + ') rotate(10deg)', opacity: 1, offset: 0.15 },
      { transform: 'scale(' + S + ') rotate(80deg)', opacity: 0 }
    ], { duration: DURATION, easing: EASING });

    var anim = screen.animate([
      { clipPath: 'circle(0px at ' + x + 'px ' + y + 'px)', transform: 'scale(0.94)', opacity: 0.4 },
      { clipPath: 'circle(' + R + 'px at ' + x + 'px ' + y + 'px)', transform: 'scale(1)', opacity: 1 }
    ], { duration: DURATION, easing: EASING });
    anim.onfinish = done;
    anim.oncancel = done;
  }
})();
