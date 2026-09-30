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
    '.tt-in.pw{color:transparent;caret-color:transparent;}',
    '.tt-out{white-space:pre-wrap;}',
    '.c-r{color:#ff6b6b}.c-g{color:#5af78e}.c-y{color:#f4f99d}.c-b{color:#57c7ff}.c-m{color:#ff6ac1}',
    '.c-c{color:#9aedfe}.c-o{color:#ffb86c}.c-d{color:#8b8b96}.c-w{color:#fff}.b{font-weight:800}',
    '.tt-blk{display:inline-block;width:2.2ch;height:1.15em;vertical-align:middle;}'
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

  function themeList() { return window.TruThemes ? TruThemes.list : []; }
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
    ['settings', '', 'abre as configurações'],
    ['colors', '', 'paleta de cores do terminal'],
    ['ls', '', 'lista os arquivos do projeto'],
    ['whoami', '', 'quem é você'],
    ['date', '', 'data e hora'],
    ['echo', '<texto>', 'repete o texto'],
    ['history', '', 'comandos que você já digitou'],
    ['exit', '', 'encerra a sessão (logout)']
  ];

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
      list.forEach(function (t) { if (t.id === id) found = t; });
      if (!found) return out(c('r', 'tema não encontrado: ') + esc(id));
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

    sudo: function () { out(c('r', USER + ' is not in the sudoers file. This incident will be reported.')); },
    rm: function () { out(c('r', 'rm: permission denied') + c('d', ' — boa tentativa 😏')); },

    exit: function () { return logout(); },
    logout: function () { return logout(); }
  };

  function logout() {
    out('');
    out(c('d', '[Process completed]'));
    authed = false;
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
    if (raw) hist.push(raw);
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
      if (state === 'shell') { freeze(v); runShell(v); }
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
