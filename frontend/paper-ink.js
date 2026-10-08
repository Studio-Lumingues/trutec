// ============================================================================
// TRAÇO À MÃO NO PAINEL DO TRUTEC (usa o rough.js: rough.min.js)
// O texto fica NÍTIDO (nada de filtro tremendo nas letras). Só as formas são
// desenhadas à mão: contornos dos botões, caixinhas, carimbo, anel e divisórias.
// Cada forma é desenhada em 3 versões levemente diferentes e o desenho troca entre
// elas ~4x por segundo (o "boil" de animação desenhada à mão), sem mexer no texto.
// O desenho vira imagem de fundo do próprio elemento (variáveis CSS --ink-m / --ink-s),
// então trocar o texto de um botão (ex.: "TROCAR (3)") não apaga nada.
// Carregar DEPOIS do rough.min.js e do trutec.js.
// Ajustes: V (versões), FPS (trocas por segundo), SPEC (o que desenhar em cada elemento).
// ============================================================================
(function () {
  var R = window.rough;
  if (!R || !R.generator) return;
  var gen = R.generator();
  var V = 3, FPS = 4;
  var INK = '#2a1f17', RED = '#b8321f', GREEN = '#2f6b3a';
  var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // sel = quem recebe o desenho | kind = rect, circle, ring (anel) ou rule (divisória)
  // fill = cor do marca-texto | scribble = rabisco por cima | shadow = [x, y] da sombra de tinta | dash = tracejado
  var SPEC = [
    { sel: '#tt-exit',                    kind: 'rect',   fill: '#fbf5e8', stroke: INK, sw: 2.1, shadow: [3, 4] },
    { sel: '#tt-truco',                   kind: 'rect',   fill: '#f3cf4d', scribble: 'rgba(205,140,0,.42)', stroke: INK, sw: 2.3, shadow: [3, 4] },
    { sel: '#tt-swap',                    kind: 'rect',   fill: '#a9d0ee', scribble: 'rgba(50,120,200,.34)', stroke: INK, sw: 2.3, shadow: [3, 4] },
    { sel: '#tt-run',                     kind: 'rect',   fill: '#ee9a8a', scribble: 'rgba(200,55,40,.32)', stroke: INK, sw: 2.3, shadow: [3, 4] },
    { sel: '.tt-side .tt-ante',           kind: 'rect',   stroke: RED, sw: 2.3 },
    { sel: '.tt-side .tt-counters span',  kind: 'rect',   stroke: 'rgba(42,31,23,.65)', sw: 1.8, dash: [7, 5] },
    { sel: '.tt-side .tt-moneybox',       kind: 'rect',   stroke: GREEN, sw: 1.9, scribble: 'rgba(47,107,58,.3)' },
    { sel: '.tt-side .tt-bname span',     kind: 'circle', stroke: INK, sw: 1.9, fill: 'rgba(42,31,23,.06)' },
    { sel: '.tt-side .tt-ring',           kind: 'ring',   pseudo: true },
    { sel: '.tt-side .tt-calc',           kind: 'rule' }
  ];

  var items = [], step = 0, started = false;

  function emit(d) {
    var out = '', ps = gen.toPaths(d);
    for (var i = 0; i < ps.length; i++) {
      var p = ps[i];
      out += '<path d="' + p.d + '" fill="' + (p.fill || 'none') + '" stroke="' + (p.stroke || 'none') + '" stroke-width="' + (p.strokeWidth || 0) + '" stroke-linecap="round" stroke-linejoin="round"/>';
    }
    return out;
  }
  function doc(w, h, body) {
    if (!body) return '';
    return 'url("data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '" fill="none">' + body + '</svg>') + '")';
  }

  // desenha UMA versão do elemento; devolve { m: desenho principal, s: sombra }
  function draw(sp, w, h, seed, ctx) {
    var m = '', s = '', o;
    if (sp.kind === 'rect') {
      var sh = sp.shadow || [0, 0], x = 2, y = 2, rw = w - 4 - sh[0], rh = h - 4 - sh[1];
      if (rw < 8 || rh < 8) return { m: '', s: '' };
      if (sp.shadow) s = emit(gen.rectangle(x + sh[0], y + sh[1], rw, rh, { seed: seed + 5, roughness: .9, bowing: 1, fill: INK, fillStyle: 'solid', stroke: INK, strokeWidth: 1.4 }));
      if (sp.fill) m += emit(gen.rectangle(x, y, rw, rh, { seed: seed, roughness: 1, fill: sp.fill, fillStyle: 'solid', stroke: 'none' }));
      if (sp.scribble) m += emit(gen.rectangle(x + 3, y + 3, rw - 6, rh - 6, { seed: seed + 2, roughness: 1.3, fill: sp.scribble, fillStyle: 'hachure', hachureGap: 5, hachureAngle: -38, fillWeight: 2.4, stroke: 'none' }));
      m += emit(gen.rectangle(x, y, rw, rh, { seed: seed, roughness: 1.1, bowing: 1.3, stroke: sp.stroke, strokeWidth: sp.sw, strokeLineDash: sp.dash }));
    } else if (sp.kind === 'circle') {
      var d = Math.min(w, h) - 4;
      if (sp.fill) m += emit(gen.circle(w / 2, h / 2, d, { seed: seed, roughness: .7, fill: sp.fill, fillStyle: 'solid', stroke: 'none' }));
      m += emit(gen.circle(w / 2, h / 2, d, { seed: seed, roughness: .9, stroke: sp.stroke, strokeWidth: sp.sw }));
    } else if (sp.kind === 'ring') {
      var D = Math.min(w, h), inner = D - 2 * ctx.rem * 0.5;
      m += emit(gen.circle(w / 2, h / 2, D - 4, { seed: seed, roughness: .8, bowing: 1, stroke: INK, strokeWidth: 2.2 }));
      m += emit(gen.circle(w / 2, h / 2, inner, { seed: seed + 3, roughness: .8, stroke: 'rgba(42,31,23,.55)', strokeWidth: 1.5 }));
    } else if (sp.kind === 'rule') {
      var vert = ctx.vertical;
      o = { seed: seed, roughness: 1.4, bowing: 2.2, stroke: 'rgba(42,31,23,.5)', strokeWidth: 1.8, strokeLineDash: [9, 6] };
      m += vert ? emit(gen.line(1.5, 4, 1.5, h - 4, o)) : emit(gen.line(2, 1.5, w - 2, 1.5, o));
    }
    return { m: doc(w, h, m), s: doc(w, h, s) };
  }

  function build(it) {
    var el = it.el, w = el.offsetWidth, h = el.offsetHeight;
    if (!w || !h) return;
    if (it.w === w && it.h === h) return;
    it.w = w; it.h = h;
    var cs = getComputedStyle(el);
    var ctx = { rem: parseFloat(getComputedStyle(document.documentElement).fontSize) || 16, vertical: parseFloat(cs.borderLeftWidth) > 0 && parseFloat(cs.borderTopWidth) === 0 };
    it.m = []; it.s = [];
    for (var v = 0; v < V; v++) {
      var r = draw(it.sp, w, h, it.seed + v * 37, ctx);
      it.m.push(r.m); it.s.push(r.s);
    }
    paint(it);
  }
  function paint(it) {
    if (!it.m) return;
    var i = (step + it.phase) % V;
    it.el.style.setProperty('--ink-m', it.m[i] || 'none');
    it.el.style.setProperty('--ink-s', it.s[i] || 'none');
  }

  function decorate() {
    var n = 0;
    SPEC.forEach(function (sp) {
      var list = document.querySelectorAll(sp.sel);
      for (var k = 0; k < list.length; k++) {
        var el = list[k];
        if (el.__ink) continue;
        el.__ink = true;
        el.classList.add(sp.pseudo ? 'ink-pseudo' : 'ink');
        items.push({ el: el, sp: sp, seed: 11 + n * 29, phase: n % V, w: 0, h: 0, m: null, s: null });
        n++;
      }
    });
    if (!items.length) return;
    var redraw = function () { items.forEach(build); };
    if (window.ResizeObserver) {
      var ro = new ResizeObserver(function () { requestAnimationFrame(redraw); });
      items.forEach(function (it) { ro.observe(it.el); });
    }
    window.addEventListener('resize', redraw);
    redraw();
    if (!reduced) setInterval(function () {
      if (document.hidden || !items[0].el.offsetParent) return;
      step++;
      items.forEach(paint);
    }, 1000 / FPS);
  }

  // o painel só existe depois que o Trutec é aberto pela primeira vez (trutec.js cria a tela na hora)
  function start() {
    if (started) return;
    if (document.getElementById('tt-exit')) { started = true; decorate(); return; }
    if (!document.body || !window.MutationObserver) return;
    var mo = new MutationObserver(function () {
      if (document.getElementById('tt-exit')) { mo.disconnect(); started = true; decorate(); }
    });
    mo.observe(document.body, { childList: true, subtree: true });
  }

  window.TruInk = { draw: draw, refresh: function () { items.forEach(function (it) { it.w = 0; build(it); }); } };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
