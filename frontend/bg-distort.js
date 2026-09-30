// ============================================================================
// DISTORÇÃO RGB NO FUNDO (estilo "RGB Distort" do Sapphire / After Effects)
// Redesenha o plano de fundo do site (listras do lobby/salas e losangos da
// partida) num <canvas> WebGL ATRÁS de tudo. Perto do mouse o fundo é
// empurrado e os canais R/G/B se separam. Como só o fundo passa pelo shader,
// cards, botões, cartas e bonecos (que são HTML por cima) NÃO distorcem.
//
// Temas com fundo próprio (Onça, ?????, Mar): o desenho do tema (o mesmo SVG
// animado do themes.js) vira textura e passa pelo mesmo shader.
//
// Se o navegador não tiver WebGL (ou o usuário pediu menos movimento), nada
// muda: continua o fundo em CSS de sempre.
// Ajustes: as constantes logo abaixo.
// ============================================================================
(function () {
  var RADIUS   = 260;   // raio da área afetada em torno do mouse (px)
  var STRENGTH = 26;    // quanto o fundo é empurrado (px) — "um pouco" = 15~30
  var SPLIT    = 0.55;  // separação RGB (0 = sem, 1 = bem forte)
  var BASE     = 0.3;   // intensidade com o mouse parado dentro da tela (0~1)
  var FOLLOW   = 10;    // agilidade do efeito em seguir o mouse (maior = mais colado)

  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  var VERT = 'attribute vec2 a;void main(){gl_Position=vec4(a,0.,1.);}';
  var FRAG = [
    'precision highp float;',
    'uniform vec2 uRes, uMouse, uVel;',
    'uniform float uTime, uMode, uRem, uDpr, uEnergy, uRadius, uStrength, uSplit;',
    'uniform sampler2D uTex;',
    'uniform vec2 uTile, uImg;',
    'uniform float uStatic;',
    'const vec3 CREAM = vec3(1.0, 0.9725, 0.9412);',

    // listras diagonais (120deg) que andam devagar — igual ao CSS do body
    'vec3 stripes(vec2 p){',
    '  float period = 4.0 * uRem;',
    '  float w = 0.4375 * uRem;',
    '  float hp = period / 0.8660254;',
    '  float shift = mod(uTime * uRes.x * 0.02, hp);',
    '  float t = dot(p + vec2(shift, 0.0), vec2(0.8660254, 0.5));',
    '  float m = mod(t, period);',
    '  float dm = abs(m - w * 0.5); dm = min(dm, period - dm);',
    '  float aa = 0.75 * uDpr;',
    '  float s = 1.0 - smoothstep(w * 0.5 - aa, w * 0.5 + aa, dm);',
    '  return mix(CREAM, vec3(0.0), 0.07 * s);',
    '}',

    // losangos escuros deslizando pro lado — igual ao .game-bg
    'vec3 diamonds(vec2 p){',
    '  float tw = 7.0 * uRem, th = 12.0 * uRem;',
    '  float ox = -tw + tw * (mod(uTime, 8.0) / 8.0);',
    '  vec2 f = fract(vec2((p.x - ox) / tw, p.y / th));',
    '  vec2 q = min(f, 1.0 - f);',
    '  float d = q.x + q.y - 0.5;',
    '  float aa = uDpr / tw;',
    '  float s = smoothstep(-aa, aa, d);',
    '  return mix(vec3(0.0392, 0.0235, 0.0706), vec3(0.1373, 0.0627, 0.2745), s);',
    '}',

    // fundo do tema (textura que se repete), deslizando como o .game-bg do CSS
    'vec3 themeTex(vec2 p){',
    '  if (uStatic > 0.5) {',                       // foto: cobre a tela inteira (tipo background-size: cover)
    '    float sc = max(uRes.x / uImg.x, uRes.y / uImg.y);',
    '    vec2 sz = uImg * sc;',
    '    return texture2D(uTex, clamp((p - 0.5 * (uRes - sz)) / sz, 0.0, 1.0)).rgb;',
    '  }',
    '  float ox = -uTile.x + uTile.x * (mod(uTime, 8.0) / 8.0);',
    '  return texture2D(uTex, vec2((p.x - ox) / uTile.x, p.y / uTile.y)).rgb;',
    '}',

    'vec3 bg(vec2 p){ return uMode > 1.5 ? themeTex(p) : (uMode > 0.5 ? diamonds(p) : stripes(p)); }',

    'void main(){',
    '  vec2 p = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y);',
    '  vec2 d = p - uMouse;',
    '  float r = length(d);',
    '  float f = exp(-(r * r) / (uRadius * uRadius)) * uEnergy;',
    '  vec2 n = d / max(r, 1.0);',
    '  float wave = 0.65 + 0.35 * sin(r / (uRadius * 0.2) - uTime * 4.0);',
    '  vec2 o = n * f * uStrength * wave + uVel * f * uStrength * 0.6;',
    '  float cr = bg(p - o * (1.0 + uSplit)).r;',
    '  float cg = bg(p - o).g;',
    '  float cb = bg(p - o * (1.0 - uSplit)).b;',
    '  gl_FragColor = vec4(cr, cg, cb, 1.0);',
    '}'
  ].join('\n');

  function start() {
    var canvas = document.createElement('canvas');
    canvas.className = 'bgfx-canvas';
    canvas.setAttribute('aria-hidden', 'true');
    var gl = canvas.getContext('webgl', { alpha: false, antialias: false, powerPreference: 'low-power' });
    if (!gl) return;

    function compile(type, src) {
      var s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      return gl.getShaderParameter(s, gl.COMPILE_STATUS) ? s : null;
    }
    var vs = compile(gl.VERTEX_SHADER, VERT), fs = compile(gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) return;
    var prog = gl.createProgram();
    gl.attachShader(prog, vs); gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return;
    gl.useProgram(prog);

    var buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    var loc = gl.getAttribLocation(prog, 'a');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    var U = {};
    ['uRes', 'uMouse', 'uVel', 'uTime', 'uMode', 'uRem', 'uDpr', 'uEnergy', 'uRadius', 'uStrength', 'uSplit', 'uTex', 'uTile', 'uImg', 'uStatic']
      .forEach(function (n) { U[n] = gl.getUniformLocation(prog, n); });

    var dpr = 1, gameScreen = document.getElementById('screen-game');
    var root = document.documentElement;

    // ---- textura do tema (só nos temas que têm `bg`) ----
    // Cada quadro "hand drawn" do tema é rasterizado num canvas de tamanho
    // potência de 2 (exigência do WebGL1 pra repetir a textura) e enviado à GPU.
    var tex = { id: undefined, spec: null, frames: [], ready: false, key: '', token: 0 };
    var dummy = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, dummy);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]));
    gl.uniform1i(U.uTex, 0);

    function pot(n) { var p = 64; while (p < n && p < 2048) p *= 2; return p; }
    function freeTex() {
      for (var i = 0; i < tex.frames.length; i++) gl.deleteTexture(tex.frames[i]);
      tex.frames = []; tex.ready = false;
      root.classList.remove('bgfx-tex');
    }
    // tema com foto: uma textura só, sem repetir (CLAMP funciona com qualquer tamanho)
    function loadPhoto(spec, token) {
      tex.key = tex.id + ':photo';
      var img = new Image();
      img.onload = function () {
        if (token !== tex.token || dead) return;
        var max = Math.min(gl.getParameter(gl.MAX_TEXTURE_SIZE) || 2048, 4096);
        var w = img.naturalWidth, h = img.naturalHeight, src = img;
        if (w > max || h > max) {                    // foto grande demais pra GPU: reduz
          var k = max / Math.max(w, h);
          w = Math.round(w * k); h = Math.round(h * k);
          src = document.createElement('canvas'); src.width = w; src.height = h;
          src.getContext('2d').drawImage(img, 0, 0, w, h);
        }
        var t = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, t);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.uniform2f(U.uImg, w, h);
        tex.frames = [t]; tex.ready = true;
        root.classList.add('bgfx-tex');
      };
      img.src = spec.src;                            // se falhar, fica o fundo em CSS do tema
    }
    function loadTheme(id) {
      var token = ++tex.token;
      tex.id = id;
      freeTex();
      tex.spec = (id && window.TruThemes && TruThemes.bgSpec) ? TruThemes.bgSpec(id) : null;
      var spec = tex.spec;
      if (!spec) { tex.key = ''; return; }           // sem `bg`: losangos do shader
      gl.uniform1f(U.uStatic, spec.kind === 'image' ? 1 : 0);
      if (spec.kind === 'image') { loadPhoto(spec, token); return; }
      var rem = parseFloat(getComputedStyle(root).fontSize) || 16;
      var tw = spec.tileW * rem * dpr, th = spec.tileH * rem * dpr;
      var pw = pot(tw), ph = pot(th);
      tex.key = id + ':' + pw + 'x' + ph;
      var frames = [], pending = spec.urls.length;
      spec.urls.forEach(function (url, i) {
        var img = new Image();
        img.onload = function () {
          if (token !== tex.token || dead) return;
          var c = document.createElement('canvas');
          c.width = pw; c.height = ph;
          c.getContext('2d').drawImage(img, 0, 0, pw, ph);
          var t = gl.createTexture();
          gl.bindTexture(gl.TEXTURE_2D, t);
          gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
          frames[i] = t;
          if (--pending === 0) {
            tex.frames = frames; tex.ready = true;
            gl.uniform2f(U.uTile, tw, th);
            root.classList.add('bgfx-tex');          // a partir daqui o CSS do tema sai de cena
          }
        };
        img.onerror = function () { /* fica o fundo em CSS do tema */ };
        img.src = url;
      });
    }
    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.round(window.innerWidth * dpr));
      canvas.height = Math.max(1, Math.round(window.innerHeight * dpr));
      gl.viewport(0, 0, canvas.width, canvas.height);
      var rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
      gl.uniform1f(U.uRem, rem * dpr);
      gl.uniform1f(U.uDpr, dpr);
      gl.uniform2f(U.uRes, canvas.width, canvas.height);
      gl.uniform1f(U.uRadius, RADIUS * dpr);
      gl.uniform1f(U.uStrength, STRENGTH * dpr);
      gl.uniform1f(U.uSplit, SPLIT);
      if (tex.spec && tex.spec.kind !== 'image') {    // rem/dpr mudou: refaz a textura se o tamanho mudar
        var tw = tex.spec.tileW * rem * dpr, th = tex.spec.tileH * rem * dpr;
        if (tex.key !== tex.id + ':' + pot(tw) + 'x' + pot(th)) loadTheme(tex.id);
        else gl.uniform2f(U.uTile, tw, th);
      }
    }

    // ---- mouse / toque ----
    var tx = 0, ty = 0, cx = 0, cy = 0, px = 0, py = 0;
    var svx = 0, svy = 0, energy = 0, inside = false;
    function onMove(e) {
      tx = e.clientX; ty = e.clientY;
      if (!inside) { cx = px = tx; cy = py = ty; inside = true; }
    }
    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('pointerdown', onMove, { passive: true });
    window.addEventListener('pointerup', function (e) { if (e.pointerType !== 'mouse') inside = false; }, { passive: true });
    window.addEventListener('pointercancel', function () { inside = false; }, { passive: true });
    document.documentElement.addEventListener('mouseleave', function () { inside = false; });
    window.addEventListener('blur', function () { inside = false; });

    canvas.addEventListener('webglcontextlost', function (e) {
      e.preventDefault();
      dead = true;
      root.classList.remove('bgfx-js', 'bgfx-tex'); // volta pro fundo em CSS
    });

    var dead = false, last = performance.now(), shown = false;
    function frame(now) {
      if (dead) return;
      var dt = Math.min(0.05, Math.max(0.001, (now - last) / 1000));
      last = now;

      var k = 1 - Math.exp(-dt * FOLLOW);
      px = cx; py = cy;
      cx += (tx - cx) * k; cy += (ty - cy) * k;
      var vx = (cx - px) / dt, vy = (cy - py) / dt;      // px/s
      var kv = 1 - Math.exp(-dt * 6);
      svx += (vx - svx) * kv; svy += (vy - svy) * kv;
      var speed = Math.sqrt(vx * vx + vy * vy);
      var target = inside ? BASE + Math.min(1, speed / 1200) * (1 - BASE) : 0;
      energy += (target - energy) * (1 - Math.exp(-dt * (target > energy ? 8 : 2.5)));

      var vl = Math.sqrt(svx * svx + svy * svy) / 1500;
      var vn = vl > 1 ? 1 / vl : 1;                       // limita o módulo a 1
      gl.uniform2f(U.uMouse, cx * dpr, cy * dpr);
      gl.uniform2f(U.uVel, svx / 1500 * vn, svy / 1500 * vn);
      gl.uniform1f(U.uEnergy, energy);
      gl.uniform1f(U.uTime, now / 1000);
      // trocou de tema? (o themes.js marca <html data-theme="...">)
      var want = window.TruThemes ? root.getAttribute('data-theme') : null;
      if (want !== tex.id) loadTheme(want);
      var inGame = gameScreen && gameScreen.classList.contains('active');
      var useTex = inGame && tex.ready;
      gl.uniform1f(U.uMode, useTex ? 2 : (inGame ? 1 : 0));
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, useTex ? tex.frames[Math.floor(now / 1000 * 8) % tex.frames.length] : dummy);
      gl.drawArrays(gl.TRIANGLES, 0, 3);

      if (!shown) { shown = true; document.documentElement.classList.add('bgfx-js'); }
      requestAnimationFrame(frame);
    }

    document.body.insertBefore(canvas, document.body.firstChild);
    resize();
    window.addEventListener('resize', resize);
    window.addEventListener('orientationchange', resize);
    requestAnimationFrame(frame);
  }

  if (document.body) start();
  else document.addEventListener('DOMContentLoaded', start);
})();
