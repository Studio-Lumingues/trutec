// ============================================================================
// FUNDO DO TRUTEC: xadrez torto, escuro e em movimento (WebGL)
// - O xadrez se retorce sozinho, devagar (pinça no centro + ondas).
// - Onde o mouse passa o fundo CLAREIA (os quadrados viram creme) e depois escurece
//   de novo, deixando um rastro. Só o fundo muda; o jogo por cima não.
// - No celular (sem mouse) o toque também clareia, e uma luz fraca passeia sozinha.
// - Só desenha enquanto a tela do Trutec está aberta e a aba visível.
// - Sem WebGL: nada acontece e o fundo antigo continua.
// Ajustes: SIGMA (tamanho da luz), FADE (segundos do rastro), CELLS (tamanho dos
// quadrados), SPEED (velocidade do movimento), SCALE (qualidade, 1 = nítido).
// Carregar DEPOIS do trutec.js.
// ============================================================================
(function () {
  var SCREEN_ID = 'screen-trutec';
  var SIGMA = 0.2, FADE = 2.4, CELLS = 9.0, SPEED = 1.0, SCALE = 0.8, MAXPTS = 24;

  var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var canHover = window.matchMedia && window.matchMedia('(hover: hover) and (pointer: fine)').matches;

  var VS = 'attribute vec2 a;void main(){gl_Position=vec4(a,0.,1.);}';
  var FS = [
    '#extension GL_OES_standard_derivatives : enable',
    'precision highp float;',
    'uniform vec2 uRes; uniform float uTime, uSigma, uCells; uniform vec3 uTrail[' + MAXPTS + '];',
    'void main(){',
    '  float m = min(uRes.x, uRes.y);',
    '  vec2 uv = (gl_FragCoord.xy - .5 * uRes) / m;',
    '  float t = uTime;',
    '  vec2 c = vec2(.10 * sin(t * .23), .08 * cos(t * .19));',
    '  vec2 p = uv - c;',
    '  float r = length(p);',
    '  vec2 q = p / (r + .22);',                                   // quadrados pequenos no centro
    '  q += .12 * vec2(sin(q.y * 2.3 + t * .45), cos(q.x * 2.1 - t * .38));',
    '  q += vec2(t * .05, t * .07);',
    '  float s = sin(q.x * uCells * 3.14159) * sin(q.y * uCells * 3.14159);',
    '  #ifdef GL_OES_standard_derivatives',
    '    float w = min(fwidth(s) * .8 + .001, 1.);',
    '  #else',
    '    float w = .08;',
    '  #endif',
    '  float k = smoothstep(-w, w, s);',                          // 1 = quadrado claro do xadrez
    '  vec3 base = mix(vec3(.020, .020, .026), vec3(.075, .070, .085), k);',
    '  vec3 lit  = mix(vec3(.070, .060, .055), vec3(.80, .75, .64), k);',
    '  float L = 0.;',
    '  for (int i = 0; i < ' + MAXPTS + '; i++) {',
    '    vec3 tp = uTrail[i];',
    '    vec2 d = uv - tp.xy;',
    '    L += tp.z * exp(-dot(d, d) / (uSigma * uSigma));',
    '  }',
    '  L = clamp((L - .05) / .85, 0., 1.); L = L * L * (3. - 2. * L) * .9;',
    '  vec3 col = mix(base, lit, L);',
    '  float v = smoothstep(.45, 1.1, length(uv));',
    '  col *= 1. - .55 * v;',
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
    gl.getExtension('OES_standard_derivatives');
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
    ['uRes', 'uTime', 'uSigma', 'uCells', 'uTrail'].forEach(function (n) { loc[n] = gl.getUniformLocation(prog, n); });
    return true;
  }

  function resize() {
    var r = cv.getBoundingClientRect();
    W = Math.max(1, r.width); H = Math.max(1, r.height);
    var sc = SCALE * Math.min(window.devicePixelRatio || 1, 1.5);
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
    gl.uniform1f(loc.uCells, CELLS);
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
