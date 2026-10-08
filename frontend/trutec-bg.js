// ============================================================================
// FUNDO DO TRUTEC: pano azul-marinho com listras que balançam (WebGL)
// - Textura de tecido (trama, fio e manchinhas) e listras creme/azul que vão e voltam
//   de um lado pro outro, com uma ondinha por cima.
// - Escuro por padrão. Onde o mouse passa o fundo CLAREIA e depois escurece de novo,
//   deixando um rastro. Só o fundo muda; o jogo por cima não.
// - No celular (sem mouse) o toque também clareia, e uma luz fraca passeia sozinha.
// - Só desenha enquanto a tela do Trutec está aberta e a aba visível.
// - Sem WebGL: nada acontece e o fundo antigo continua.
// Ajustes: SIGMA (tamanho da luz), FADE (segundos do rastro), SPEED (velocidade do
// balanço), BAND (0 a 1: fração da tela com listras; 1 = tela toda, 0.5 = só a metade
// esquerda e o resto de pano liso), SCALE (qualidade, 1 = nítido).
// Carregar DEPOIS do trutec.js.
// ============================================================================
(function () {
  var SCREEN_ID = 'screen-trutec';
  var SIGMA = 0.2, FADE = 2.4, SPEED = 1.0, BAND = 1.0, SCALE = 1.0, MAXPTS = 24;

  var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var canHover = window.matchMedia && window.matchMedia('(hover: hover) and (pointer: fine)').matches;

  var VS = 'attribute vec2 a;void main(){gl_Position=vec4(a,0.,1.);}';
  var FS = [
    'precision highp float;',
    'uniform vec2 uRes; uniform float uTime, uSigma, uPx, uPeriod, uBand; uniform vec3 uTrail[' + MAXPTS + '];',
    'float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }',
    'float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);',
    '  return mix(mix(h(i), h(i + vec2(1., 0.)), f.x), mix(h(i + vec2(0., 1.)), h(i + vec2(1., 1.)), f.x), f.y); }',
    'void main(){',
    '  vec2 px = gl_FragCoord.xy / uPx;',                         // px em unidades CSS
    '  vec2 res = uRes / uPx;',
    '  float m = min(res.x, res.y);',
    '  vec2 uv = (px - .5 * res) / m;',
    '  float t = uTime;',
    // balanço: vai e volta quase um período inteiro + ondinha que desce pela tela
    '  float sway = uPeriod * .9 * sin(t * .32) + uPeriod * .18 * sin(t * .8 + px.y * .006);',
    '  float fx = px.x + sway + 1.4 * (vn(vec2(px.y * .35, 3.)) - .5);',   // borda irregular de fio
    '  float f = fract(fx / uPeriod);',
    '  float aa = 1.2 / uPeriod;',
    '  float cream = smoothstep(0., aa, f) * (1. - smoothstep(.5, .5 + aa, f));',
    '  float mask = 1.;',
    '  if (uBand < 1.) mask = 1. - smoothstep(uBand * res.x + sway - 2., uBand * res.x + sway + 2., px.x);',
    '  cream *= mask;',
    // textura de pano
    '  float wv = (.5 + .5 * sin(px.x * 6.2832 / 3.6)) * (.5 + .5 * sin(px.y * 6.2832 / 3.6));',
    '  float rib = .5 + .5 * sin(px.x * 6.2832 / 4.2);',
    '  float tex = (.86 + .14 * wv) * (.93 + .07 * rib);',
    '  tex *= .85 + .3 * vn(px / 70.) + .1 * (vn(px / 9.) - .5);',
    '  tex *= .96 + .08 * h(floor(px / 1.5));',
    // cores: apagado (escuro) e aceso (perto do mouse)
    '  vec3 navyD = vec3(.040, .066, .135), navyL = vec3(.14, .19, .30);',
    '  vec3 slD = vec3(.07, .09, .145),     slL = vec3(.20, .24, .32);',
    '  vec3 crD = vec3(.12, .115, .105),    crL = vec3(.88, .82, .68);',
    '  vec3 base = mix(mix(navyD, slD, mask), crD, cream);',
    '  vec3 lit  = mix(mix(navyL, slL, mask), crL, cream);',
    '  float L = 0.;',
    '  for (int i = 0; i < ' + MAXPTS + '; i++) {',
    '    vec3 tp = uTrail[i];',
    '    if (tp.z > 0.) { vec2 d = uv - tp.xy; L += tp.z * exp(-dot(d, d) / (uSigma * uSigma)); }',
    '  }',
    '  L = clamp((L - .05) / .85, 0., 1.); L = L * L * (3. - 2. * L) * .9;',
    '  vec3 col = mix(base, lit, L) * tex;',
    '  col *= 1. - .55 * smoothstep(.45, 1.1, length(uv));',
    '  gl_FragColor = vec4(col, 1.);',
    '}'
  ].join('\n');

  var screen, cv, gl, prog, loc = {}, running = false, raf = 0;
  var W = 1, H = 1, t0 = performance.now(), frozenT = 40;
  var pts = [];                       // { x, y, t }  em unidades da tela (min(W,H) = 1)
  var buf = new Float32Array(MAXPTS * 3);
  var lastAdd = 0, lastX = 9, lastY = 9;

  function sh(type, src) {
    var s = gl.createShader(type);
    gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { console.warn('trutec-bg:', gl.getShaderInfoLog(s)); return null; }
    return s;
  }

  function initGL() {
    gl = cv.getContext('webgl', { antialias: false, alpha: false, powerPreference: 'low-power' }) ||
         cv.getContext('experimental-webgl');
    if (!gl) return false;
        var v = sh(gl.VERTEX_SHADER, VS), f = sh(gl.FRAGMENT_SHADER, FS);
    if (!v || !f) return false;
    prog = gl.createProgram();
    gl.attachShader(prog, v); gl.attachShader(prog, f); gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return false;
    gl.useProgram(prog);
    var b = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, b);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    var a = gl.getAttribLocation(prog, 'a');
    gl.enableVertexAttribArray(a); gl.vertexAttribPointer(a, 2, gl.FLOAT, false, 0, 0);
    ['uRes', 'uTime', 'uSigma', 'uPx', 'uPeriod', 'uBand', 'uTrail'].forEach(function (n) { loc[n] = gl.getUniformLocation(prog, n); });
    return true;
  }

  function resize() {
    var r = cv.getBoundingClientRect();
    W = Math.max(1, r.width); H = Math.max(1, r.height);
    var sc = SCALE * Math.min(window.devicePixelRatio || 1, 1.25);
    var pw = Math.max(2, Math.round(W * sc)), ph = Math.max(2, Math.round(H * sc));
    if (cv.width !== pw || cv.height !== ph) { cv.width = pw; cv.height = ph; }
    gl.viewport(0, 0, cv.width, cv.height);
  }

  // ---- ponteiro: cada ponto vira uma luz que vai apagando com o tempo ----
  function addPoint(cx, cy) {
    var r = cv.getBoundingClientRect(), m = Math.min(r.width, r.height) || 1;
    var x = (cx - r.left - r.width / 2) / m, y = (r.height / 2 - (cy - r.top)) / m;
    var now = performance.now();
    var dx = x - lastX, dy = y - lastY;
    if (dx * dx + dy * dy < .035 * .035 && now - lastAdd < 120) {
      if (pts.length) { pts[0].x = x; pts[0].y = y; pts[0].t = now; }   // parado: mantém a luz viva sob o mouse
      return;
    }
    lastX = x; lastY = y; lastAdd = now;
    pts.unshift({ x: x, y: y, t: now });
    if (pts.length > MAXPTS) pts.length = MAXPTS;
  }
  function onMove(e) { if (running) addPoint(e.clientX, e.clientY); }

  function frame(now) {
    raf = 0;
    if (!running) return;
    var tt = reduced ? frozenT : ((now - t0) / 1000 * SPEED) % 3600;
    var i, n = 0, k;
    for (i = 0; i < pts.length; i++) {
      var age = (now - pts[i].t) / 1000;
      k = 1 - age / FADE;
      if (k <= 0) { pts.length = i; break; }
    }
    for (i = 0; i < pts.length && n < MAXPTS; i++, n++) {
      k = 1 - (now - pts[i].t) / 1000 / FADE;
      buf[n * 3] = pts[i].x; buf[n * 3 + 1] = pts[i].y; buf[n * 3 + 2] = k * k;
    }
    if (!canHover && n < MAXPTS) {           // celular: uma luz fraquinha passeando sozinha
      var a = tt * .35;
      buf[n * 3] = .28 * Math.sin(a * 1.3); buf[n * 3 + 1] = .42 * Math.cos(a); buf[n * 3 + 2] = .3; n++;
    }
    for (; n < MAXPTS; n++) { buf[n * 3] = 9; buf[n * 3 + 1] = 9; buf[n * 3 + 2] = 0; }
    resize();
    gl.uniform2f(loc.uRes, cv.width, cv.height);
    gl.uniform1f(loc.uTime, tt);
    gl.uniform1f(loc.uSigma, SIGMA);
    gl.uniform1f(loc.uPx, cv.width / W);
    gl.uniform1f(loc.uPeriod, Math.max(56, Math.min(110, W / 18)));
    gl.uniform1f(loc.uBand, BAND);
    gl.uniform3fv(loc.uTrail, buf);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    raf = requestAnimationFrame(frame);
  }

  function sync() {
    var want = screen.classList.contains('active') && !document.hidden;
    if (want === running) return;
    running = want;
    if (running) { if (!raf) raf = requestAnimationFrame(frame); }
    else if (raf) { cancelAnimationFrame(raf); raf = 0; }
  }

  function setup() {
    screen = document.getElementById(SCREEN_ID);
    if (!screen || cv) return !!cv;
    cv = document.createElement('canvas');
    cv.className = 'tt-bgfx';
    cv.setAttribute('aria-hidden', 'true');
    screen.insertBefore(cv, screen.firstChild);
    if (!initGL()) { cv.remove(); cv = null; return true; }       // sem WebGL: fica o fundo antigo
    screen.classList.add('tt-fx-on');
    cv.addEventListener('webglcontextlost', function (e) { e.preventDefault(); running = false; if (raf) cancelAnimationFrame(raf); raf = 0; });
    cv.addEventListener('webglcontextrestored', function () { if (initGL()) sync(); });
    document.addEventListener('pointermove', onMove, { passive: true });
    document.addEventListener('pointerdown', onMove, { passive: true });
    document.addEventListener('visibilitychange', sync);
    new MutationObserver(sync).observe(screen, { attributes: true, attributeFilter: ['class'] });
    sync();
    return true;
  }

  // a tela do Trutec só existe depois da primeira vez que é aberta (trutec.js cria na hora)
  function start() {
    if (setup() || !document.body || !window.MutationObserver) return;
    var mo = new MutationObserver(function () { if (setup()) mo.disconnect(); });
    mo.observe(document.body, { childList: true, subtree: true });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
