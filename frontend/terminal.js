// ============================================================================
// TERMINAL DO TRUTEC (estilo Terminal do macOS)
// - Abre/fecha com CTRL + P (o atalho de imprimir do navegador é bloqueado).
// - Pede usuário e senha (login: / Password:) antes de liberar o shell.
// - Janela com semáforo (fechar / minimizar / maximizar), arrastável pela barra
//   de título, redimensionável pelo canto, com desfoque de vidro e cores ANSI.
// - Digite `help` pra ver os comandos.
//
// ATENÇÃO: este login é só "de brincadeira". Como tudo roda no navegador, o
// usuário e a senha ficam visíveis pra quem abrir o código do site. Não use pra
// proteger nada de verdade (o servidor não sabe que esse terminal existe).
//
// Ajustes: USER / PASS logo abaixo.
// ============================================================================
(function () {
  'use strict';

  var USER = 'adm';
  var PASS = '123';
  var HOST = 'trutec';
  var LAST_KEY = 'trutec-term-last';

  var started = Date.now();
  var win = null, bar = null, titleEl = null, body = null, cur = null;
  var state = 'user';            // 'user' | 'pass' | 'shell'
  var authed = false, pendingUser = '';
  var hist = [], hidx = 0, saved = null;
  var adminKey = '';             // chave do `auth` (só na memória; some ao recarregar/sair)
  var ADMIN_NAME = 'Matheus Luna';
  var PHOTO_KEY = 'trutec-admin-photo';      // foto final (JPEG 320x320) que vai pro servidor
  var PHOTO_SRC_KEY = 'trutec-admin-photo-src'; // imagem original (reduzida) pra poder ajustar depois
  var PHOTO_TF_KEY = 'trutec-admin-photo-tf';   // último ajuste (zoom/posição)
  var NAMEFX_KEY = 'trutec-admin-namefx';       // efeito do nome (localStorage)
  var FX_LIST = [['fogo', 'Fogo'], ['arco-iris', 'Arco-íris'], ['neon', 'Neon'], ['glitch', 'Glitch'], ['gelo', 'Gelo'],
    ['ouro', 'Ouro'], ['eletrico', 'Elétrico'], ['galaxia', 'Galáxia'], ['sangue', 'Sangue'], ['matrix', 'Matrix']];
  var reconnectHooked = false;

  // ---------------------------------------------------------------- estilo
  var CSS = [
    '.tt-win{position:fixed;z-index:10000;width:min(46rem,94vw);height:min(28rem,70vh);min-width:20rem;min-height:11rem;',
    'display:flex;flex-direction:column;border-radius:0.75rem;overflow:hidden;resize:both;',
    'background:rgba(16,16,20,.86);-webkit-backdrop-filter:blur(22px) saturate(1.4);backdrop-filter:blur(22px) saturate(1.4);',
    'border:1px solid rgba(255,255,255,.16);box-shadow:0 2rem 4.5rem rgba(0,0,0,.6),0 0 0 .5px rgba(0,0,0,.85);',
    'font-family:ui-monospace,"SF Mono",SFMono-Regular,Menlo,Monaco,Consolas,"Liberation Mono",monospace;color:#e8e8ec;',
    'animation:ttPop .16s cubic-bezier(.2,1.2,.4,1);}',
    '.tt-win[hidden]{display:none;}',
    '.tt-win.tt-max{left:.5rem!important;top:.5rem!important;width:calc(100% - 1rem)!important;height:calc(100% - 1rem)!important;resize:none;}',
    '@keyframes ttPop{from{opacity:0;transform:scale(.96)}to{opacity:1;transform:none}}',
    '@media (prefers-reduced-motion:reduce){.tt-win{animation:none}}',
    '.tt-bar{flex:none;position:relative;display:flex;align-items:center;height:2.1rem;padding:0 .75rem;',
    'background:linear-gradient(#3d3d43,#2b2b30);border-bottom:1px solid rgba(0,0,0,.65);cursor:default;user-select:none;-webkit-user-select:none;touch-action:none;}',
    '.tt-lights{position:relative;z-index:1;display:flex;gap:.45rem;}',
    '.tt-dot{width:.78rem;height:.78rem;border-radius:50%;border:0;padding:0;cursor:pointer;display:flex;align-items:center;justify-content:center;',
    'font:800 .6rem/1 -apple-system,sans-serif;color:rgba(0,0,0,.62);box-shadow:inset 0 0 0 .5px rgba(0,0,0,.35);}',
    '.tt-dot span{opacity:0;}.tt-lights:hover .tt-dot span{opacity:1;}',
    '.tt-r{background:#ff5f57}.tt-y{background:#febc2e}.tt-g{background:#28c840}',
    '.tt-title{position:absolute;left:0;right:0;text-align:center;pointer-events:none;',
    'font:600 .78rem/2.1rem -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#c9c9d2;}',
    '.tt-body{flex:1;min-height:0;overflow-y:auto;padding:.6rem .85rem 1rem;font-size:.86rem;line-height:1.45;',
    'white-space:pre-wrap;word-break:break-word;cursor:text;scrollbar-width:thin;scrollbar-color:#55555c transparent;}',
    '.tt-body ::selection,.tt-body::selection{background:rgba(87,199,255,.35);}',
    '.tt-line{display:flex;align-items:baseline;}',
    '.tt-prompt{flex:none;white-space:pre;}',
    '.tt-in{flex:1;min-width:0;background:transparent;border:0;outline:0;padding:0;margin:0;color:#fff;font:inherit;caret-color:#5af78e;}',
    '.tt-in.pw{letter-spacing:.12em;}',   /* senha aparece como bolinhas pra você ver que está digitando */
    '.tt-out{white-space:pre-wrap;}',
    '.c-r{color:#ff6b6b}.c-g{color:#5af78e}.c-y{color:#f4f99d}.c-b{color:#57c7ff}.c-m{color:#ff6ac1}',
    '.c-c{color:#9aedfe}.c-o{color:#ffb86c}.c-d{color:#8b8b96}.c-w{color:#fff}.b{font-weight:800}',
    '.tt-blk{display:inline-block;width:2.2ch;height:1.15em;vertical-align:middle;}',
    /* selo do admin (canto superior direito) */
    '.tt-badge{position:fixed;top:.75rem;right:.75rem;z-index:11;display:flex;align-items:center;gap:.55rem;padding:.3rem .8rem .3rem .3rem;',
    'border:1px solid rgba(255,255,255,.35);border-radius:999px;background:rgba(10,10,10,.78);color:#fff8f0;cursor:pointer;',
    'font:700 .85rem/1 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;box-shadow:0 .4rem 1rem rgba(0,0,0,.45);}',
    '.tt-badge[hidden]{display:none;}',
    '.tt-badge:hover{border-color:#fff8f0;background:rgba(30,30,34,.9);}',
    '.tt-badge-img{width:2.1rem;height:2.1rem;border-radius:50%;object-fit:cover;background:#fff8f0;display:flex;align-items:center;',
    'justify-content:center;color:#0a0a0a;font-weight:800;font-size:.8rem;overflow:hidden;flex:none;}',
    '.tt-badge-img img{width:100%;height:100%;object-fit:cover;display:block;}',
    '.tt-badge small{display:block;font-weight:600;font-size:.68rem;opacity:.7;margin-top:.2rem;}',
    /* editor da foto */
    '.tt-ph{position:fixed;inset:0;z-index:10001;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.65);',
    'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#fff8f0;}',
    '.tt-ph[hidden]{display:none;}',
    '.tt-ph-card{width:min(22rem,92vw);padding:1.1rem 1.1rem 1rem;border-radius:1rem;background:rgba(18,18,22,.96);',
    'border:1px solid rgba(255,255,255,.2);box-shadow:0 2rem 4rem rgba(0,0,0,.6);text-align:center;}',
    '.tt-ph-card h3{margin:0 0 .2rem;font-size:1.05rem;}',
    '.tt-ph-card p{margin:0 0 .8rem;font-size:.78rem;opacity:.7;}',
    '.tt-ph-view{position:relative;width:15rem;height:15rem;margin:0 auto .8rem;border-radius:50%;overflow:hidden;touch-action:none;cursor:grab;',
    'background:#2a2a30;border:.18rem solid #fff8f0;}',
    '.tt-ph-view.drag{cursor:grabbing;}',
    '.tt-ph-view img{position:absolute;left:0;top:0;max-width:none;user-select:none;-webkit-user-drag:none;pointer-events:none;transform-origin:0 0;}',
    '.tt-ph-empty{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:.85rem;opacity:.65;padding:1rem;}',
    '.tt-ph-zoom{display:flex;align-items:center;gap:.6rem;margin:0 0 .9rem;font-size:.75rem;opacity:.9;}',
    '.tt-ph-zoom input{flex:1;accent-color:#f4f99d;}',
    '.tt-ph-row{display:flex;gap:.5rem;flex-wrap:wrap;justify-content:center;}',
    '.tt-ph-btn{flex:1 1 auto;padding:.55rem .8rem;border-radius:.6rem;border:1px solid rgba(255,255,255,.3);background:rgba(255,255,255,.08);',
    'color:#fff8f0;font-family:inherit;font-weight:700;font-size:.82rem;line-height:1;cursor:pointer;}',
    '.tt-ph-btn:hover{background:rgba(255,255,255,.18);}',
    '.tt-ph-btn.main{background:#f4f99d;color:#0a0a0a;border-color:#f4f99d;}',
    '.tt-ph-btn.main:hover{background:#fffdb0;}',
    '.tt-ph-btn:disabled{opacity:.4;cursor:default;}',
    '.tt-ph-card{max-height:92vh;overflow-y:auto;}',
    '.tt-ph-fxh{margin:.1rem 0 .45rem;font-size:.78rem;font-weight:700;opacity:.85;}',
    '.tt-ph-chips{display:flex;flex-wrap:wrap;gap:.4rem;justify-content:center;margin:0 0 .9rem;}',
    '.tt-chip{padding:.4rem .65rem;border-radius:.55rem;border:1px solid rgba(255,255,255,.25);background:rgba(0,0,0,.45);',
    'color:#fff8f0;font-family:inherit;font-size:.85rem;cursor:pointer;line-height:1.1;}',
    '.tt-chip:hover{border-color:#fff8f0;}',
    '.tt-chip.on{border-color:#f4f99d;box-shadow:0 0 0 .13rem rgba(244,249,157,.45);}',
    '.tt-ph-msg{min-height:1.1rem;margin:.65rem 0 0;font-size:.78rem;}'
  ].join('');

  function injectStyle() {
    var st = document.createElement('style');
    st.textContent = CSS;
    document.head.appendChild(st);
  }

  // ---------------------------------------------------------------- helpers
  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function c(cls, t) { return '<span class="c-' + cls.split(' ').join(' c-') + '">' + esc(t) + '</span>'; }
  function pad(s, n) { s = String(s); while (s.length < n) s += ' '; return s; }
  function scroll() { body.scrollTop = body.scrollHeight; }
  function out(html) {
    var d = document.createElement('div');
    d.className = 'tt-out';
    d.innerHTML = html === '' ? '&nbsp;' : html;
    body.appendChild(d);
    scroll();
  }
  function setTitle(t) { titleEl.textContent = t; }
  function fmtDate() {
    try { return new Date().toLocaleString('pt-BR', { dateStyle: 'full', timeStyle: 'medium' }); }
    catch (e) { return new Date().toString(); }
  }

  // ---------------------------------------------------------------- linha de entrada
  function promptHtml() {
    if (state === 'user') return c('c', 'login: ');
    if (state === 'pass') return c('c', 'Password:');
    return c('g b', USER) + c('d', '@') + c('m b', HOST) + ' ' + c('b b', '~') + ' ' + c('y b', '%') + ' ';
  }

  function showPrompt() {
    var line = document.createElement('div');
    line.className = 'tt-line';
    var p = document.createElement('span');
    p.className = 'tt-prompt';
    p.innerHTML = promptHtml();
    var inp = document.createElement('input');
    inp.className = 'tt-in' + (state === 'pass' ? ' pw' : '');
    inp.type = state === 'pass' ? 'password' : 'text';
    inp.setAttribute('autocomplete', 'off');
    inp.setAttribute('autocorrect', 'off');
    inp.setAttribute('autocapitalize', 'none');
    inp.setAttribute('spellcheck', 'false');
    inp.setAttribute('aria-label', state === 'pass' ? 'Senha' : 'Terminal');
    line.appendChild(p); line.appendChild(inp);
    body.appendChild(line);
    cur = inp;
    inp.addEventListener('keydown', onKey);
    scroll();
    inp.focus();
    // garante o foco mesmo se o navegador o perder ao trocar de linha (keydown do Enter)
    setTimeout(function () { if (cur === inp && document.activeElement !== inp) inp.focus(); }, 0);
    setTimeout(function () { if (cur === inp && document.activeElement !== inp) inp.focus(); }, 60);
  }

  // troca o <input> por texto fixo (a linha "enviada"); na senha não mostra nada
  function freeze(text) {
    if (!cur) return;
    var line = cur.parentNode;
    var s = document.createElement('span');
    s.innerHTML = state === 'pass' ? '' : esc(text);
    line.replaceChild(s, cur);
    cur = null;
  }

  // ---------------------------------------------------------------- login
  function boot() {
    var last = null;
    try { last = localStorage.getItem(LAST_KEY); } catch (e) {}
    var now = new Date().toString().replace(/ GMT.*/, '');
    out(c('d', 'Last login: ' + (last || now) + ' on ttys001'));
    try { localStorage.setItem(LAST_KEY, now); } catch (e) {}
    state = 'user';
    setTitle('login — 80×24');
    showPrompt();
  }

  function onLoginEnter(v) {
    if (state === 'user') {
      pendingUser = v.trim();
      freeze(v);
      state = 'pass';
      showPrompt();
      return;
    }
    // senha
    var ok = pendingUser === USER && v === PASS;
    freeze('');
    setTimeout(function () {
      if (ok) {
        authed = true;
        state = 'shell';
        setTitle(USER + ' — -zsh — 80×24');
        out('');
        out(c('g b', 'Bem-vindo ao TruTEC, ' + USER + '!') + c('d', '  (digite ') + c('y', 'help') + c('d', ' pra ver os comandos)'));
        out('');
      } else {
        out(c('r', 'Login incorrect'));
        out('');
        state = 'user';
      }
      showPrompt();
    }, ok ? 350 : 800);
  }

  // ---------------------------------------------------------------- comandos
  var ANSI = ['#3b3b40', '#ff5f57', '#28c840', '#febc2e', '#57c7ff', '#ff6ac1', '#9aedfe', '#e8e8ec'];
  var ANSI_B = ['#6b6b74', '#ff8a84', '#5af78e', '#f4f99d', '#8fd8ff', '#ff9bd7', '#c4f5ff', '#ffffff'];

  // só os temas que já aparecem na aba Temas (os secretos ficam de fora até desbloquear)
  function themeList() { return window.TruThemes ? TruThemes.available() : []; }
  function backendUrl() {
    return typeof RESOLVED_BACKEND_URL !== 'undefined' ? RESOLVED_BACKEND_URL : '';
  }
  function fmtUp(ms) {
    var s = Math.floor(ms / 1000), m = Math.floor(s / 60), h = Math.floor(m / 60);
    s %= 60; m %= 60;
    return (h ? h + 'h ' : '') + (h || m ? m + 'm ' : '') + s + 's';
  }

  var HELP = [
    ['help', '', 'mostra esta lista'],
    ['clear', '', 'limpa a tela (ou CTRL+L)'],
    ['neofetch', '', 'informações do TruTEC, coloridinho'],
    ['theme', '[id]', 'lista os temas ou troca de tema'],
    ['stats', '', 'suas vitórias e derrotas'],
    ['volume', '[music|sfx] [0-100]', 'vê ou muda o volume'],
    ['server', '', 'testa o servidor (/health)'],
    ['auth', '<chave>', 'modo admin: placar, foto, efeito do nome (veja `auth`)'],
    ['settings', '', 'abre as configurações'],
    ['colors', '', 'paleta de cores do terminal'],
    ['ls', '', 'lista os arquivos do projeto'],
    ['whoami', '', 'quem é você'],
    ['date', '', 'data e hora'],
    ['echo', '<texto>', 'repete o texto'],
    ['history', '', 'comandos que você já digitou'],
    ['exit', '', 'encerra a sessão (logout)']
  ];

  // ---------------------------------------------------------------- servidor (admin)
  function adminCall(p) {
    var sock = typeof socket !== 'undefined' ? socket : null;
    return new Promise(function (resolve) {
      if (!sock) return resolve({ ok: false, error: 'sem conexão com o servidor.' });
      var done = false;
      var to = setTimeout(function () { if (!done) { done = true; resolve({ ok: false, error: 'servidor não respondeu.' }); } }, 8000);
      p.key = adminKey;
      sock.emit('admin', p, function (res) {
        if (done) return; done = true; clearTimeout(to);
        res = res || { ok: false, error: 'erro' };
        if (!res.ok && /Chave/.test(res.error || '')) { adminKey = ''; hideBadge(); }
        resolve(res);
      });
    });
  }

  // aplica (ou tira) o efeito do nome: salva no localStorage e manda pro servidor
  function setNameFx(fx) {
    if (fx) lsSet(NAMEFX_KEY, fx); else lsDel(NAMEFX_KEY);
    return adminCall({ op: 'name_fx', fx: fx || null }).then(function (res) { if (res.ok) paintBadge(); return res; });
  }

  // ---------------------------------------------------------------- selo no canto superior direito
  var badge = null;
  function initials() {
    return ADMIN_NAME.split(/\s+/).map(function (w) { return w.charAt(0); }).join('').slice(0, 2).toUpperCase();
  }
  function paintBadge() {
    if (!badge) return;
    var fx = lsGet(NAMEFX_KEY), nm = badge.querySelector('.tt-badge-name');
    nm.innerHTML = fx ? '<span class="nfx nfx-' + esc(fx) + '">' + esc(ADMIN_NAME) + '</span>' : esc(ADMIN_NAME);
    var photo = readPhoto(), box = badge.querySelector('.tt-badge-img');
    box.innerHTML = '';
    if (photo) { var im = document.createElement('img'); im.alt = ''; im.src = photo; box.appendChild(im); }
    else box.textContent = initials();
  }
  function showBadge() {
    if (!badge) {
      badge = document.createElement('button');
      badge.type = 'button';
      badge.className = 'tt-badge';
      badge.title = 'Meu perfil: foto e efeito do nome';
      badge.innerHTML = '<span class="tt-badge-img"></span><span><span class="tt-badge-name"></span><small>Perfil</small></span>';
      badge.addEventListener('click', openPhotoEditor);
      document.body.appendChild(badge);
    }
    badge.hidden = false;
    paintBadge();
  }
  function hideBadge() { if (badge) badge.hidden = true; }

  // ---------------------------------------------------------------- editor da foto (arrastar + zoom)
  var phEd = null;
  function lsGet(k) { try { return localStorage.getItem(k) || null; } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } }
  function lsDel(k) { try { localStorage.removeItem(k); } catch (e) {} }

  // reduz a imagem escolhida (lado maior <= 900px) pra guardar a "original" sem estourar o localStorage
  function loadFileAsSource(file) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file), im = new Image();
      im.onload = function () {
        try {
          var k = Math.min(1, 900 / Math.max(im.naturalWidth, im.naturalHeight));
          var cv = document.createElement('canvas');
          cv.width = Math.max(1, Math.round(im.naturalWidth * k));
          cv.height = Math.max(1, Math.round(im.naturalHeight * k));
          var cx = cv.getContext('2d');
          cx.fillStyle = '#fff8f0'; cx.fillRect(0, 0, cv.width, cv.height);
          cx.drawImage(im, 0, 0, cv.width, cv.height);
          URL.revokeObjectURL(url);
          resolve(cv.toDataURL('image/jpeg', 0.88));
        } catch (e) { reject(e); }
      };
      im.onerror = function () { URL.revokeObjectURL(url); reject(new Error('arquivo não é uma imagem válida.')); };
      im.src = url;
    });
  }

  function buildPhotoEditor() {
    var ov = document.createElement('div');
    ov.className = 'tt-ph';
    ov.hidden = true;
    ov.setAttribute('role', 'dialog');
    ov.setAttribute('aria-label', 'Ajustar foto');
    ov.innerHTML =
      '<div class="tt-ph-card">' +
        '<h3>Seu perfil</h3>' +
        '<p>Arraste a foto pra posicionar e use o zoom. É assim que todos vão te ver.</p>' +
        '<div class="tt-ph-view"><div class="tt-ph-empty">Nenhuma imagem. Clique em “Escolher imagem”.</div></div>' +
        '<div class="tt-ph-zoom"><span>−</span><input type="range" min="100" max="400" value="100" step="1" aria-label="Zoom" /><span>+</span></div>' +
        '<div class="tt-ph-fxh">Efeito do nome</div>' +
        '<div class="tt-ph-chips"></div>' +
        '<div class="tt-ph-row">' +
          '<button type="button" class="tt-ph-btn" data-a="pick">Escolher imagem</button>' +
          '<button type="button" class="tt-ph-btn main" data-a="save">Salvar</button>' +
        '</div>' +
        '<div class="tt-ph-row" style="margin-top:.5rem">' +
          '<button type="button" class="tt-ph-btn" data-a="remove">Remover foto</button>' +
          '<button type="button" class="tt-ph-btn" data-a="cancel">Cancelar</button>' +
        '</div>' +
        '<div class="tt-ph-msg" aria-live="polite"></div>' +
      '</div>';
    document.body.appendChild(ov);

    var view = ov.querySelector('.tt-ph-view'), zoomEl = ov.querySelector('input[type=range]');
    var msg = ov.querySelector('.tt-ph-msg'), saveBtn = ov.querySelector('[data-a=save]');
    var st = { img: null, src: null, z: 1, ox: 0, oy: 0 };   // ox/oy: deslocamento do centro da imagem (px do viewport)

    function V() { return view.clientWidth || 240; }
    function base() { return st.img ? Math.max(V() / st.img.naturalWidth, V() / st.img.naturalHeight) : 1; }
    function clamp() {
      if (!st.img) return;
      var sc = base() * st.z;
      var mx = Math.max(0, (st.img.naturalWidth * sc - V()) / 2), my = Math.max(0, (st.img.naturalHeight * sc - V()) / 2);
      st.ox = Math.max(-mx, Math.min(mx, st.ox));
      st.oy = Math.max(-my, Math.min(my, st.oy));
    }
    function paint() {
      if (!st.img) return;
      clamp();
      var sc = base() * st.z, w = st.img.naturalWidth * sc, h = st.img.naturalHeight * sc;
      var left = V() / 2 + st.ox - w / 2, top = V() / 2 + st.oy - h / 2;
      st.img.style.width = w + 'px'; st.img.style.height = h + 'px';
      st.img.style.transform = 'translate(' + left + 'px,' + top + 'px)';
      zoomEl.value = Math.round(st.z * 100);
    }
    function setImage(src, tf) {
      var im = new Image();
      im.onload = function () {
        if (st.img && st.img.parentNode) st.img.parentNode.removeChild(st.img);
        var empty = view.querySelector('.tt-ph-empty'); if (empty) empty.hidden = true;
        im.draggable = false;
        view.appendChild(im);
        st.img = im; st.src = src;
        st.z = tf && tf.z ? Math.max(1, Math.min(4, tf.z)) : 1;
        st.ox = tf && isFinite(tf.ox) ? tf.ox * V() : 0;
        st.oy = tf && isFinite(tf.oy) ? tf.oy * V() : 0;
        paint();
      };
      im.src = src;
    }
    function say(t, bad) { msg.textContent = t || ''; msg.style.color = bad ? '#ff8a84' : '#5af78e'; }

    // efeitos do nome: clicar aplica na hora (todos veem)
    var chipsEl = ov.querySelector('.tt-ph-chips');
    var chipDefs = [[null, 'Sem efeito']].concat(FX_LIST);
    chipDefs.forEach(function (d) {
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'tt-chip'; b.setAttribute('data-fx', d[0] || '');
      b.innerHTML = d[0] ? '<span class="nfx nfx-' + d[0] + '">' + esc(d[1]) + '</span>' : esc(d[1]);
      chipsEl.appendChild(b);
    });
    function markChips() {
      var cur = lsGet(NAMEFX_KEY) || '';
      Array.prototype.forEach.call(chipsEl.children, function (b) { b.classList.toggle('on', b.getAttribute('data-fx') === cur); });
    }
    chipsEl.addEventListener('click', function (e) {
      var b = e.target.closest && e.target.closest('.tt-chip');
      if (!b) return;
      setNameFx(b.getAttribute('data-fx') || null).then(function (res) {
        if (!res.ok) return say(res.error || 'erro', true);
        markChips();
        say(b.getAttribute('data-fx') ? 'Efeito aplicado!' : 'Efeito removido.');
      });
    });

    // arrastar
    var drag = null;
    view.addEventListener('pointerdown', function (e) {
      if (!st.img) return;
      drag = { x: e.clientX, y: e.clientY, ox: st.ox, oy: st.oy };
      view.classList.add('drag');
      view.setPointerCapture(e.pointerId);
    });
    view.addEventListener('pointermove', function (e) {
      if (!drag) return;
      st.ox = drag.ox + (e.clientX - drag.x); st.oy = drag.oy + (e.clientY - drag.y);
      paint();
    });
    function endDrag() { drag = null; view.classList.remove('drag'); }
    view.addEventListener('pointerup', endDrag);
    view.addEventListener('pointercancel', endDrag);
    // zoom: slider e roda do mouse
    zoomEl.addEventListener('input', function () { st.z = (+zoomEl.value) / 100; paint(); });
    view.addEventListener('wheel', function (e) {
      if (!st.img) return;
      e.preventDefault();
      st.z = Math.max(1, Math.min(4, st.z * (e.deltaY < 0 ? 1.06 : 1 / 1.06)));
      paint();
    }, { passive: false });

    function close() { ov.hidden = true; }

    function pick() {
      var inp = document.createElement('input');
      inp.type = 'file'; inp.accept = 'image/*'; inp.style.display = 'none';
      document.body.appendChild(inp);
      function done() { if (inp.parentNode) inp.parentNode.removeChild(inp); }
      inp.addEventListener('cancel', done);
      inp.addEventListener('change', function () {
        var f = inp.files && inp.files[0];
        done();
        if (!f) return;
        loadFileAsSource(f).then(function (src) { say(''); setImage(src, null); },
          function (e) { say((e && e.message) || 'não consegui abrir a imagem.', true); });
      });
      inp.click();
    }

    function save() {
      if (!st.img) return say('Escolha uma imagem primeiro.', true);
      var N = 320, sc = base() * st.z, w = st.img.naturalWidth * sc, h = st.img.naturalHeight * sc;
      var left = V() / 2 + st.ox - w / 2, top = V() / 2 + st.oy - h / 2;
      var cv = document.createElement('canvas'); cv.width = cv.height = N;
      var cx = cv.getContext('2d');
      cx.fillStyle = '#fff8f0'; cx.fillRect(0, 0, N, N);
      cx.drawImage(st.img, -left / sc, -top / sc, V() / sc, V() / sc, 0, 0, N, N);
      var photo = cv.toDataURL('image/jpeg', 0.88);
      saveBtn.disabled = true; say('Salvando…');
      var storedOk = lsSet(PHOTO_KEY, photo);
      lsSet(PHOTO_SRC_KEY, st.src);
      lsSet(PHOTO_TF_KEY, JSON.stringify({ z: st.z, ox: st.ox / V(), oy: st.oy / V() }));
      adminCall({ op: 'photo', photo: photo }).then(function (res) {
        saveBtn.disabled = false;
        if (!res.ok) return say(res.error || 'erro', true);
        paintBadge();
        out(c('g', '✔ ') + 'foto atualizada ' + c('d', res.inRoom ? '(todos na sala já veem)' : '(vale quando você entrar numa sala)') +
          (storedOk ? '' : c('y', '  ! não deu pra salvar no localStorage')));
        close();
      });
    }

    function remove() {
      lsDel(PHOTO_KEY); lsDel(PHOTO_SRC_KEY); lsDel(PHOTO_TF_KEY);
      adminCall({ op: 'photo_off' }).then(function (res) {
        if (!res.ok) return say(res.error || 'erro', true);
        paintBadge();
        if (st.img && st.img.parentNode) st.img.parentNode.removeChild(st.img);
        st.img = null; st.src = null;
        var empty = view.querySelector('.tt-ph-empty'); if (empty) empty.hidden = false;
        out(c('g', '✔ ') + 'foto removida');
        close();
      });
    }

    ov.addEventListener('click', function (e) {
      if (e.target === ov) return close();
      var b = e.target.closest && e.target.closest('[data-a]');
      if (!b) return;
      var a = b.getAttribute('data-a');
      if (a === 'pick') pick(); else if (a === 'save') save(); else if (a === 'remove') remove(); else close();
    });
    ['keydown', 'keyup', 'keypress'].forEach(function (ev) {
      ov.addEventListener(ev, function (e) {
        if (ev === 'keydown' && e.key === 'Escape') close();
        e.stopPropagation();
      });
    });
    ov.addEventListener('pointerdown', function (e) { e.stopPropagation(); });

    return {
      open: function () {
        ov.hidden = false; say(''); markChips();
        var src = lsGet(PHOTO_SRC_KEY) || lsGet(PHOTO_KEY);
        var tf = null; try { tf = JSON.parse(lsGet(PHOTO_TF_KEY)); } catch (e) {}
        if (src) setImage(src, lsGet(PHOTO_SRC_KEY) ? tf : null);
        saveBtn.focus();
      }
    };
  }
  function openPhotoEditor() {
    if (!adminKey) return;
    if (!phEd) phEd = buildPhotoEditor();
    phEd.open();
  }

  // ---------------------------------------------------------------- foto do admin
  function readPhoto() {
    try { return localStorage.getItem(PHOTO_KEY) || null; } catch (e) { return null; }
  }
  // reconectou (queda de rede / Render acordando)? reaplica a foto no novo socket
  function hookReconnect() {
    var sock = typeof socket !== 'undefined' ? socket : null;
    if (!sock || reconnectHooked) return;
    reconnectHooked = true;
    sock.on('connect', function () {
      if (!adminKey) return;
      var photo = readPhoto(), fx = lsGet(NAMEFX_KEY);
      if (photo) sock.emit('admin', { key: adminKey, op: 'photo', photo: photo }, function () {});
      if (fx) sock.emit('admin', { key: adminKey, op: 'name_fx', fx: fx }, function () {});
    });
  }
  var COMMANDS = {
    help: function () {
      out(c('c b', 'Comandos disponíveis'));
      HELP.forEach(function (h) {
        out('  ' + c('g b', pad(h[0], 10)) + c('y', pad(h[1], 22)) + c('d', h[2]));
      });
      out('');
      out(c('d', 'Dicas: ↑/↓ histórico · Tab completa · CTRL+C cancela · CTRL+P fecha a janela'));
    },

    clear: function () { body.innerHTML = ''; },

    whoami: function () { out(c('g', USER)); },
    hostname: function () { out(c('m', HOST)); },
    date: function () { out(c('y', fmtDate())); },
    echo: function (args, raw) { out(esc(raw.replace(/^\s*echo\s?/i, ''))); },

    history: function () {
      hist.forEach(function (h, i) { out(c('d', pad(String(i + 1), 4)) + esc(h)); });
    },

    colors: function () {
      function row(arr) { return arr.map(function (col) { return '<span class="tt-blk" style="background:' + col + '"></span>'; }).join(' '); }
      out(row(ANSI));
      out(row(ANSI_B));
    },

    ls: function () {
      out(c('b b', 'assets/'));
      var files = ['audio.js', 'bg-distort.js', 'boil.js', 'bot.js', 'client.js', 'config.js', 'favicon.js', 'index.html',
        'noise.js', 'seat-zoom.js', 'server.js', 'settings.js', 'stats.js', 'style.css', 'terminal.js', 'themes.js'];
      out(files.map(function (f) {
        var cls = /\.js$/.test(f) ? 'y' : /\.css$/.test(f) ? 'c' : 'm';
        return c(cls, f);
      }).join('  '));
    },

    stats: function () {
      if (!window.TruStats) return out(c('r', 'stats indisponível.'));
      var s = TruStats.get(), total = s.wins + s.losses;
      out(c('g b', 'Vitórias: ') + c('w', s.wins));
      out(c('r b', 'Derrotas: ') + c('w', s.losses));
      if (total) out(c('c b', 'Aproveitamento: ') + c('w', Math.round(s.wins / total * 100) + '%'));
    },

    theme: function (args) {
      if (!window.TruThemes) return out(c('r', 'temas indisponíveis.'));
      var list = themeList(), curId = TruThemes.current();
      if (!args.length || args[0] === 'list') {
        list.forEach(function (t) {
          var col = (t.preview && t.preview.accent) || '#fff';
          out((t.id === curId ? c('g b', '* ') : '  ') +
            '<span style="color:' + col + '">●</span> ' + c('w b', pad(t.id, 9)) + c('d', t.name));
        });
        out(c('d', 'Use: theme <id>'));
        return;
      }
      var id = args[0].toLowerCase(), found = null;
      TruThemes.list.forEach(function (t) { if (t.id === id) found = t; });   // inclui os secretos
      if (!found) return out(c('r', 'tema não encontrado: ') + esc(id));
      if (!TruThemes.isAvailable(found.id)) {
        TruThemes.unlock(found.id);
        out(c('y b', '🔓 Tema secreto desbloqueado: ') + c('m b', found.name));
        out(c('d', 'Agora ele também aparece na aba Temas das configurações.'));
      }
      TruThemes.apply(found.id);
      out(c('g', '✔ ') + 'Tema alterado para ' + c('m b', found.name));
    },

    volume: function (args) {
      var A = window.GameAudio;
      if (!A) return out(c('r', 'áudio indisponível.'));
      var which = (args[0] || '').toLowerCase();
      if (!which) {
        out(c('c b', 'música ') + c('w', Math.round(A.getMusicLevel() * 100) + '%'));
        out(c('c b', 'efeitos ') + c('w', Math.round(A.getSfxLevel() * 100) + '%'));
        return;
      }
      var v = parseInt(args[1], 10);
      if ((which !== 'music' && which !== 'sfx') || !isFinite(v) || v < 0 || v > 100) {
        return out(c('y', 'Uso: volume music 40  |  volume sfx 80'));
      }
      if (which === 'music') A.setMusicLevel(v / 100); else A.setSfxLevel(v / 100);
      out(c('g', '✔ ') + which + ' → ' + c('w', v + '%'));
    },

    settings: function () {
      if (window.openSettings) { hideWin(); window.openSettings(); }
      else out(c('r', 'configurações indisponíveis.'));
    },

    neofetch: function () {
      var t = window.TruThemes ? (TruThemes.nameOf(TruThemes.current()) || '—') : '—';
      var s = window.TruStats ? TruStats.get() : { wins: 0, losses: 0 };
      var host = backendUrl().replace(/^https?:\/\//, '') || '—';
      var art = [
        '   .-------.   ',
        '   | A     |   ',
        '   |  ♠    |   ',
        '   |       |   ',
        '   |   ♥   |   ',
        '   |       |   ',
        '   |    ♦  |   ',
        '   |     A |   ',
        "   '-------'   "
      ];
      var cols = ['r', 'o', 'y', 'g', 'c', 'b', 'm', 'r', 'o'];
      var info = [
        c('g b', USER) + c('d', '@') + c('m b', HOST),
        c('d', '---------'),
        c('r b', pad('OS', 10)) + 'TruTEC Web',
        c('o b', pad('Tema', 10)) + esc(t),
        c('y b', pad('Tela', 10)) + window.innerWidth + '×' + window.innerHeight,
        c('g b', pad('Vitórias', 10)) + s.wins,
        c('c b', pad('Derrotas', 10)) + s.losses,
        c('b b', pad('Servidor', 10)) + esc(host),
        c('m b', pad('Uptime', 10)) + fmtUp(Date.now() - started)
      ];
      out('');
      for (var i = 0; i < art.length; i++) out(c(cols[i], art[i]) + (info[i] || ''));
      out('');
      var blk = ANSI.concat(ANSI_B).map(function (col) { return '<span class="tt-blk" style="background:' + col + '"></span>'; }).join('');
      out('                ' + blk);
      out('');
    },

    server: function () {
      var base = backendUrl();
      if (!base) return out(c('r', 'URL do servidor não encontrada.'));
      out(c('d', 'ping ' + base + '/health ...'));
      var t0 = performance.now();
      var ctl = window.AbortController ? new AbortController() : null;
      var to = setTimeout(function () { if (ctl) ctl.abort(); }, 20000);
      return fetch(base + '/health', ctl ? { signal: ctl.signal } : undefined)
        .then(function (r) { return r.json(); })
        .then(function (j) {
          clearTimeout(to);
          out(c('g b', '✔ online') + c('d', '  ' + Math.round(performance.now() - t0) + ' ms'));
          out(c('c', 'versão ') + esc(j.version || '?') + c('c', '  salas ') + esc(j.rooms));
        })
        .catch(function () {
          clearTimeout(to);
          out(c('r b', '✘ sem resposta') + c('d', '  (o Render pode estar acordando — tente de novo em ~30s)'));
        });
    },

    auth: function (args) {
      var sock = typeof socket !== 'undefined' ? socket : null;
      if (!sock) return out(c('r', 'sem conexão com o servidor.'));

      var call = adminCall;
      function fail(res) { out(c('r', '✘ ') + esc(res.error || 'erro')); }

      // ---- ainda sem login: o argumento é a chave
      if (!adminKey) {
        if (!args.length) {
          out(c('c b', 'auth') + c('d', ' — modo administrador'));
          out('  ' + c('g b', pad('auth <chave>', 22)) + c('d', 'entra (a chave é a TRUTEC_ADMIN_KEY do servidor; fica só na memória)'));
          return;
        }
        adminKey = args.join(' ');
        return call({ op: 'login' }).then(function (res) {
          if (!res.ok) return fail(res);
          out('');
          out(c('g b', 'Bem-vindo, ' + ADMIN_NAME + '!') + c('d', '  (digite ') + c('y', 'auth') + c('d', ' pra ver as opções)'));
          out('');
          showBadge();
          hookReconnect();
          // foto salva de outras vezes: já aplica
          var savedFx = lsGet(NAMEFX_KEY);
          if (savedFx) call({ op: 'name_fx', fx: savedFx }).then(function (r3) {
            if (r3.ok) out(c('g', '✔ ') + 'efeito do nome aplicado ' + c('d', '(' + esc(savedFx) + ')'));
          });
          var photo = readPhoto();
          if (photo) return call({ op: 'photo', photo: photo }).then(function (r2) {
            out(r2.ok ? c('g', '✔ ') + 'foto salva aplicada ' + c('d', '(todos veem no lugar do seu personagem; ajuste pelo canto superior direito)') : c('r', '✘ ') + esc(r2.error));
          });
        });
      }

      var sub = (args[0] || '').toLowerCase();
      function usage() {
        out(c('c b', 'auth') + c('d', ' — modo admin ativo'));
        out('  ' + c('g b', pad('foto', 22)) + c('d', 'abre o ajuste da foto (também no canto superior direito); todos veem no lugar do seu personagem'));
        out('  ' + c('g b', pad('foto off', 22)) + c('d', 'tira a foto e volta pro personagem'));
        out('  ' + c('g b', pad('nome', 22)) + c('d', 'lista os efeitos do nome (fogo, neon, arco-iris...)'));
        out('  ' + c('g b', pad('nome <efeito>', 22)) + c('d', 'aplica o efeito no seu nome pra todo mundo ver'));
        out('  ' + c('g b', pad('nome off', 22)) + c('d', 'tira o efeito'));
        out('  ' + c('g b', pad('show', 22)) + c('d', 'mostra o placar (dentro de uma partida)'));
        out('  ' + c('g b', pad('set <d1> <d2>', 22)) + c('d', 'define o placar (0 a 12)'));
        out('  ' + c('g b', pad('add <1|2> <n>', 22)) + c('d', 'soma n (pode ser negativo) à dupla 1 ou 2'));
        out('  ' + c('g b', pad('reset', 22)) + c('d', 'zera os dois lados'));
        out('  ' + c('g b', pad('sair', 22)) + c('d', 'sai do modo admin'));
        out(c('d', 'Chegar a 12 encerra a partida.'));
      }
      if (!sub) return usage();
      if (sub === 'sair' || sub === 'logout') { adminKey = ''; hideBadge(); return out(c('g', '✔ ') + 'saiu do modo admin'); }

      if (sub === 'nome' || sub === 'name') {
        var want = (args[1] || '').toLowerCase();
        if (!want) {
          var curFx = lsGet(NAMEFX_KEY);
          FX_LIST.forEach(function (d) {
            out((d[0] === curFx ? c('g b', '* ') : '  ') + '<span class="nfx nfx-' + d[0] + '">' + esc(d[1]) + '</span>' + c('d', '   auth nome ' + d[0]));
          });
          return out(c('d', 'Também dá pra escolher clicando no seu selo (canto superior direito).'));
        }
        if (want === 'off' || want === 'nenhum') {
          return setNameFx(null).then(function (res) { out(res.ok ? c('g', '✔ ') + 'efeito removido' : c('r', '✘ ') + esc(res.error)); });
        }
        var known = FX_LIST.some(function (d) { return d[0] === want; });
        if (!known) return out(c('r', '✘ ') + 'efeito desconhecido. Digite ' + c('y', 'auth nome') + ' pra ver a lista.');
        return setNameFx(want).then(function (res) {
          out(res.ok ? c('g', '✔ ') + 'efeito ' + c('w b', want) + ' aplicado ' + c('d', res.inRoom ? '(todos na sala já veem)' : '(vale quando você entrar numa sala)') : c('r', '✘ ') + esc(res.error));
        });
      }

      if (sub === 'foto' || sub === 'photo') {
        if ((args[1] || '').toLowerCase() === 'off') {
          lsDel(PHOTO_KEY); lsDel(PHOTO_SRC_KEY); lsDel(PHOTO_TF_KEY);
          return call({ op: 'photo_off' }).then(function (res) {
            paintBadge();
            out(res.ok ? c('g', '✔ ') + 'foto removida' : c('r', '✘ ') + esc(res.error));
          });
        }
        openPhotoEditor();
        return out(c('d', 'editor da foto aberto.'));
      }

      var p;
      if (sub === 'show' || sub === 'reset') p = { op: sub };
      else if (sub === 'set' && args.length === 3) p = { op: 'set', a: args[1], b: args[2] };
      else if (sub === 'add' && args.length === 3 && (args[1] === '1' || args[1] === '2')) p = { op: 'add', team: +args[1] - 1, n: args[2] };
      else return usage();
      return call(p).then(function (res) {
        if (!res.ok) return fail(res);
        var me = (typeof myTeam !== 'undefined' && myTeam !== null) ? myTeam : -1;
        out(c('g', '✔ ') + 'Dupla 1 ' + c('w b', res.score[0]) + c('d', ' x ') + c('w b', res.score[1]) + ' Dupla 2' +
          (me >= 0 ? c('d', '   (você está na dupla ' + (me + 1) + ')') : ''));
      });
    },

    sudo: function () { out(c('r', USER + ' is not in the sudoers file. This incident will be reported.')); },
    rm: function () { out(c('r', 'rm: permission denied') + c('d', ' — boa tentativa 😏')); },

    exit: function () { return logout(); },
    logout: function () { return logout(); }
  };

  function logout() {
    out('');
    out(c('d', '[Process completed]'));
    authed = false;
    adminKey = '';
    hideBadge();
    setTimeout(function () {
      hideWin();
      body.innerHTML = '';   // na próxima abertura mostra o login de novo
      cur = null;
      state = 'user';
    }, 450);
    return 'stop';
  }

  function has(name) { return Object.prototype.hasOwnProperty.call(COMMANDS, name); }

  function runShell(v) {
    var raw = v.trim();
    if (raw) hist.push(/^auth\b/i.test(raw) && !adminKey ? 'auth ****' : raw);
    hidx = hist.length;
    if (!raw) return showPrompt();
    var parts = raw.split(/\s+/), name = parts[0].toLowerCase(), args = parts.slice(1), r;
    if (!has(name)) {
      out(c('r', 'zsh: command not found: ') + esc(parts[0]));
      return showPrompt();
    }
    try { r = COMMANDS[name](args, raw); }
    catch (e) { out(c('r', 'erro: ') + esc(e && e.message)); }
    if (r === 'stop') return;
    if (r && r.then) r.then(showPrompt, showPrompt);
    else showPrompt();
  }

  // ---------------------------------------------------------------- teclado
  function complete(inp) {
    var v = inp.value, words = v.split(/\s+/);
    var pool, prefix, head = '';
    if (words.length === 1) { pool = Object.keys(COMMANDS); prefix = words[0]; }
    else if (words[0].toLowerCase() === 'theme' && words.length === 2) {
      pool = themeList().map(function (t) { return t.id; }).concat('list');
      prefix = words[1]; head = words[0] + ' ';
    } else if (words[0].toLowerCase() === 'auth' && words.length === 2 && adminKey) {
      pool = ['foto', 'nome', 'show', 'set', 'add', 'reset', 'sair'];
      prefix = words[1]; head = words[0] + ' ';
    } else return;
    var m = pool.filter(function (n) { return n.indexOf(prefix.toLowerCase()) === 0; });
    if (!m.length) return;
    var common = m[0];
    m.forEach(function (n) { while (n.indexOf(common) !== 0) common = common.slice(0, -1); });
    inp.value = head + common + (m.length === 1 ? ' ' : '');
  }

  function onKey(e) {
    var inp = e.target, k = e.key;
    if (k === 'Enter') {
      e.preventDefault();
      var v = inp.value;
      if (state === 'shell') { freeze(/^\s*auth\b/i.test(v) && !adminKey ? 'auth ****' : v); runShell(v); }
      else onLoginEnter(v);
    } else if (e.ctrlKey && (k === 'c' || k === 'C')) {
      e.preventDefault();
      var txt = state === 'pass' ? '' : inp.value;
      var wasPass = state === 'pass';
      freeze(txt + (wasPass ? '' : '^C'));
      if (wasPass) state = 'user';
      showPrompt();
    } else if (e.ctrlKey && (k === 'l' || k === 'L')) {
      e.preventDefault();
      var keep = inp.value;
      body.innerHTML = '';
      showPrompt();
      cur.value = state === 'pass' ? '' : keep;
    } else if (e.ctrlKey && (k === 'u' || k === 'U')) {
      e.preventDefault(); inp.value = '';
    } else if (state === 'shell' && k === 'ArrowUp') {
      e.preventDefault();
      if (hidx === hist.length) saved = inp.value;
      if (hidx > 0) { hidx--; inp.value = hist[hidx]; }
    } else if (state === 'shell' && k === 'ArrowDown') {
      e.preventDefault();
      if (hidx < hist.length) { hidx++; inp.value = hidx === hist.length ? (saved || '') : hist[hidx]; }
    } else if (state === 'shell' && k === 'Tab') {
      e.preventDefault(); complete(inp);
    }
  }

  // ---------------------------------------------------------------- janela
  function build() {
    injectStyle();
    win = document.createElement('div');
    win.className = 'tt-win';
    win.hidden = true;
    win.setAttribute('role', 'dialog');
    win.setAttribute('aria-label', 'Terminal');
    win.innerHTML =
      '<div class="tt-bar">' +
        '<div class="tt-lights">' +
          '<button type="button" class="tt-dot tt-r" aria-label="Fechar"><span>×</span></button>' +
          '<button type="button" class="tt-dot tt-y" aria-label="Minimizar"><span>−</span></button>' +
          '<button type="button" class="tt-dot tt-g" aria-label="Maximizar"><span>+</span></button>' +
        '</div>' +
        '<div class="tt-title">login — 80×24</div>' +
      '</div>' +
      '<div class="tt-body"></div>';
    document.body.appendChild(win);
    bar = win.querySelector('.tt-bar');
    titleEl = win.querySelector('.tt-title');
    body = win.querySelector('.tt-body');

    // o jogo não deve reagir às teclas digitadas aqui
    ['keydown', 'keyup', 'keypress'].forEach(function (ev) {
      win.addEventListener(ev, function (e) {
        if (ev === 'keydown' && e.key === 'Escape') { hideWin(); }
        e.stopPropagation();
      });
    });
    win.addEventListener('pointerdown', function (e) { e.stopPropagation(); });

    body.addEventListener('click', function () {
      var sel = window.getSelection && window.getSelection().toString();
      if (!sel && cur) cur.focus();
    });

    win.querySelector('.tt-r').addEventListener('click', hideWin);
    win.querySelector('.tt-y').addEventListener('click', hideWin);
    win.querySelector('.tt-g').addEventListener('click', toggleMax);
    bar.addEventListener('dblclick', function (e) { if (!e.target.closest('.tt-dot')) toggleMax(); });

    // arrastar pela barra de título
    var drag = null;
    bar.addEventListener('pointerdown', function (e) {
      if (e.target.closest('.tt-dot') || win.classList.contains('tt-max')) return;
      var r = win.getBoundingClientRect();
      drag = { dx: e.clientX - r.left, dy: e.clientY - r.top };
      bar.setPointerCapture(e.pointerId);
    });
    bar.addEventListener('pointermove', function (e) {
      if (!drag) return;
      var x = Math.min(Math.max(-win.offsetWidth + 80, e.clientX - drag.dx), window.innerWidth - 80);
      var y = Math.min(Math.max(0, e.clientY - drag.dy), window.innerHeight - 40);
      win.style.left = x + 'px'; win.style.top = y + 'px';
    });
    function endDrag() { drag = null; }
    bar.addEventListener('pointerup', endDrag);
    bar.addEventListener('pointercancel', endDrag);
  }

  function toggleMax() { win.classList.toggle('tt-max'); if (cur) cur.focus(); }

  function place() {
    if (win.style.left) return;
    win.style.left = Math.max(8, (window.innerWidth - win.offsetWidth) / 2) + 'px';
    win.style.top = Math.max(16, window.innerHeight * 0.12) + 'px';
  }

  function showWin() {
    if (!win) build();
    win.hidden = false;
    place();
    if (!body.childNodes.length) boot();
    setTimeout(function () { if (cur) cur.focus(); }, 30);
  }
  function hideWin() {
    if (!win) return;
    win.hidden = true;
    if (document.activeElement && document.activeElement.blur && win.contains(document.activeElement)) document.activeElement.blur();
  }

  // CTRL + P abre/fecha (captura antes do "imprimir" do navegador)
  window.addEventListener('keydown', function (e) {
    if (e.ctrlKey && !e.altKey && !e.shiftKey && !e.metaKey && (e.key === 'p' || e.key === 'P')) {
      e.preventDefault();
      e.stopPropagation();
      if (win && !win.hidden) hideWin(); else showWin();
    }
  }, true);

  window.TruTerminal = { open: showWin, close: hideWin };
})();
