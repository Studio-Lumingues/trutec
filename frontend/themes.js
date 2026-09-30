// ============================================================================
// TEMAS (aba "Temas" em Configurações)
// - Clicar na aba abre uma tela grande com um EXEMPLO do tema (fundo animado).
// - As setas trocam de tema e o tema que estiver na tela já fica selecionado
//   automaticamente (não precisa confirmar).
// - Pra criar outro tema, copie um objeto de THEMES e troque:
//     vars    -> variáveis CSS que o tema sobrescreve no :root
//     bg      -> (opcional) fundo próprio da partida. Hoje: { kind:'leopard', ... }
//                Sem `bg`, o tema usa o fundo de losangos (cores em preview.bga/bgb)
//     preview -> cores usadas só no desenho de exemplo
//     palette -> as bolinhas de cor do tema
// - O tema escolhido fica salvo no localStorage ("trutec-theme").
// ============================================================================
(function () {
  var KEY = 'trutec-theme';

  var THEMES = [
    {
      id: 'dracula',
      name: 'Drácula',
      tagline: 'O roxo clássico do TruTEC',
      vars: {},
      preview: {
        bga: '#0a0612', bgb: '#231045',
        felt: '#33196a', feltd: '#150a33', feltl: '#5a37b0', rim: '#351d69',
        accent: '#a78bfa', cream: '#fff8f0', back: '#b3101f', ink: '#040303'
      },
      palette: [
        ['Fundo', '#150a33'], ['Feltro', '#33196a'], ['Realce', '#5a37b0'],
        ['Detalhe', '#a78bfa'], ['Creme', '#fff8f0'], ['Verso', '#b3101f']
      ]
    },
    {
      id: 'onca',
      name: 'Onça Cinza',
      tagline: 'Estampa de onça em tons de cinza',
      vars: {
        '--felt-dark': '#1f1f1f', '--felt': '#4a4a4a', '--felt-light': '#7c7c7c',
        '--wood-light': '#c2c2c2', '--wood-brown': '#3a3a3a',
        '--wood-brown-light': '#666666', '--wood-brown-dark': '#181818'
      },
      // fundo em estampa de onça (gerado em SVG, sem imagem externa)
      bg: { kind: 'leopard', base: '#8d8d8d', mid: '#6a6a6a', dark: '#141414', tileW: 16, tileH: 24 },
      preview: { bga: '#8d8d8d', bgb: '#8d8d8d', accent: '#c2c2c2', cream: '#fff8f0' },
      palette: [
        ['Fundo', '#8d8d8d'], ['Miolo', '#6a6a6a'], ['Mancha', '#141414'],
        ['Feltro', '#4a4a4a'], ['Realce', '#c2c2c2'], ['Creme', '#fff8f0']
      ]
    }
  ];

  var root = document.documentElement;
  var appliedVars = [];
  var index = 0;

  function byId(id) {
    for (var i = 0; i < THEMES.length; i++) if (THEMES[i].id === id) return THEMES[i];
    return null;
  }
  function saved() {
    try { return localStorage.getItem(KEY); } catch (e) { return null; }
  }
  function currentId() {
    var t = byId(saved());
    return (t || THEMES[0]).id;
  }

  // ---------------------------------------------------------------- fundos
  // gerador pseudo-aleatório com semente (o desenho é sempre o mesmo)
  function rng(seed) {
    var s = seed;
    return function () { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
  }
  function f(n) { return n.toFixed(1); }

  // Estampa de onça que se repete sem emenda: rosetas (anéis abertos de manchas
  // escuras com miolo mais claro) em fileiras alternadas + pintinhas soltas.
  function leopardSvg(bg) {
    var W = 240, H = 360, r = rng(11);
    var mids = [], darks = [];

    function put(list, cx, cy, rx, ry, rot) {
      var ext = Math.max(rx, ry) + 1;
      var xs = [0], ys = [0];
      if (cx - ext < 0) xs.push(W); if (cx + ext > W) xs.push(-W);
      if (cy - ext < 0) ys.push(H); if (cy + ext > H) ys.push(-H);
      xs.forEach(function (dx) {
        ys.forEach(function (dy) {
          var x = cx + dx, y = cy + dy;
          list.push("<ellipse cx='" + f(x) + "' cy='" + f(y) + "' rx='" + f(rx) + "' ry='" + f(ry) +
            "' transform='rotate(" + f(rot) + " " + f(x) + " " + f(y) + ")'/>");
        });
      });
    }

    var cols = 3, rows = 6, cw = W / cols, ch = H / rows;
    for (var row = 0; row < rows; row++) {
      for (var col = 0; col < cols; col++) {
        var cx = col * cw + cw / 2 + (row % 2 ? cw / 2 : 0) + (r() - 0.5) * 16;
        var cy = row * ch + ch / 2 + (r() - 0.5) * 10;
        cx = (cx + W) % W; cy = (cy + H) % H;
        var R = 22 + r() * 6;
        put(mids, cx, cy, R * 0.66, R * 0.56, r() * 180);           // miolo
        var n = 10 + Math.floor(r() * 3), a0 = r() * Math.PI * 2, gap = Math.floor(r() * n);
        for (var i = 0; i < n; i++) {
          if (i === gap) continue;                                    // abertura do "C"
          var ang = a0 + i * Math.PI * 2 / n + (r() - 0.5) * 0.25;
          var d = R * (0.78 + r() * 0.24);
          put(darks, cx + Math.cos(ang) * d, cy + Math.sin(ang) * d,
              R * (0.34 + r() * 0.26), R * (0.2 + r() * 0.16), ang * 180 / Math.PI + 90);
        }
      }
    }
    for (var k = 0; k < 30; k++) {                                    // pintinhas soltas
      put(darks, r() * W, r() * H, 3 + r() * 4, 2 + r() * 3, r() * 180);
    }

    return "<svg xmlns='http://www.w3.org/2000/svg' width='" + W + "' height='" + H + "' viewBox='0 0 " + W + " " + H + "'>" +
      "<rect width='" + W + "' height='" + H + "' fill='" + bg.base + "'/>" +
      "<g fill='" + bg.mid + "'>" + mids.join('') + "</g>" +
      "<g fill='" + bg.dark + "'>" + darks.join('') + "</g></svg>";
  }

  // Fundo do tema: losangos (Drácula) ou estampa própria (`bg`).
  function bgImage(t) {
    var svg;
    if (t.bg && t.bg.kind === 'leopard') {
      svg = t._svg || (t._svg = leopardSvg(t.bg));
    } else {
      var p = t.preview;
      svg = "<svg xmlns='http://www.w3.org/2000/svg' width='70' height='120' viewBox='0 0 70 120'>" +
        "<rect width='70' height='120' fill='" + p.bgb + "'/>" +
        "<g fill='" + p.bga + "'>" +
        "<polygon points='0,-60 35,0 0,60 -35,0'/><polygon points='70,-60 105,0 70,60 35,0'/>" +
        "<polygon points='0,60 35,120 0,180 -35,120'/><polygon points='70,60 105,120 70,180 35,120'/></g></svg>";
    }
    return 'url("data:image/svg+xml,' + encodeURIComponent(svg) + '")';
  }

  function setVar(k, v) { root.style.setProperty(k, v); appliedVars.push(k); }

  function apply(id) {
    var t = byId(id) || THEMES[0];
    appliedVars.forEach(function (k) { root.style.removeProperty(k); });
    appliedVars = [];
    Object.keys(t.vars || {}).forEach(function (k) { setVar(k, t.vars[k]); });
    if (t.bg) {
      // fundo próprio na partida (o .game-bg lê estas variáveis)
      setVar('--theme-bg-image', bgImage(t));
      setVar('--theme-bg-color', t.bg.base);
      setVar('--theme-tile-w', t.bg.tileW + 'rem');
      setVar('--theme-tile-h', t.bg.tileH + 'rem');
    }
    root.classList.toggle('theme-bg', !!t.bg);
    root.setAttribute('data-theme', t.id);
    try { localStorage.setItem(KEY, t.id); } catch (e) {}
    return t;
  }
  window.TruThemes = { list: THEMES, apply: apply, current: currentId };
  apply(currentId());

  // ---------------------------------------------------------------- tela
  var modal = document.getElementById('themes-modal');
  var settingsModal = document.getElementById('settings-modal');
  var tabOpen = document.getElementById('tab-temas');
  if (!modal || !tabOpen) return;

  var elTitle = document.getElementById('themes-title');
  var elTag = document.getElementById('theme-tagline');
  var elPreview = document.getElementById('theme-preview');
  var btnPrev = document.getElementById('theme-prev');
  var btnNext = document.getElementById('theme-next');

  function previewHtml(t) {
    var p = t.preview;
    var size = t.bg ? ';--tile-w:' + t.bg.tileW + 'rem;background-size:' + t.bg.tileW + 'rem ' + t.bg.tileH + 'rem' : '';
    return '<div class="tb" style="background:' + p.bga + '">' +
      '<div class="tb-slide" style="background-image:' + bgImage(t).replace(/"/g, '&quot;') + size + '"></div>' +
    '</div>';
  }

  function render() {
    var t = THEMES[index];
    elTitle.textContent = t.name;
    elTag.textContent = t.tagline;
    elPreview.innerHTML = previewHtml(t);
  }

  function open() {
    var cur = currentId();
    for (var i = 0; i < THEMES.length; i++) if (THEMES[i].id === cur) index = i;
    render();
    if (settingsModal) settingsModal.classList.add('hidden');
    modal.classList.remove('hidden');
  }
  function backToSettings() {
    modal.classList.add('hidden');
    if (window.openSettings) window.openSettings();
  }

  tabOpen.addEventListener('click', open);
  document.getElementById('tab-geral-back').addEventListener('click', backToSettings);
  modal.addEventListener('click', function (e) { if (e.target === modal) backToSettings(); });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !modal.classList.contains('hidden')) backToSettings();
  });
  // trocar de seta já aplica o tema mostrado
  function go(step) {
    index = (index + step + THEMES.length) % THEMES.length;
    render();
    apply(THEMES[index].id);
  }
  btnPrev.addEventListener('click', function () { go(-1); });
  btnNext.addEventListener('click', function () { go(1); });

  window.openThemes = open;
})();
