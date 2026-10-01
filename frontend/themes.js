// ============================================================================
// TEMAS (aba "Temas" em Configurações)
// - Clicar na aba abre uma tela grande com um EXEMPLO do tema (fundo animado).
// - As setas trocam de tema e o tema que estiver na tela já fica selecionado
//   automaticamente (não precisa confirmar).
// - Pra criar outro tema, copie um objeto de THEMES e troque:
//     vars    -> variáveis CSS que o tema sobrescreve no :root
//     bg      -> (opcional) fundo próprio da partida: { kind:'leopard' | 'binary' | 'sea' | 'lattice' | 'image' | 'frames' | 'tiles', ... }
//                'frames' = quadros PNG parados que cobrem a tela; 'tiles' = quadros de uma estampa que repete e desliza
//                Sem `bg`, o tema usa o fundo de losangos (cores em preview.bga/bgb)
//     preview -> cores usadas só no desenho de exemplo
//     palette -> as bolinhas de cor do tema
// - O tema escolhido fica salvo no localStorage ("trutec-theme").
// ============================================================================
(function () {
  var KEY = 'trutec-theme';
  var UNLOCK_KEY = 'trutec-unlocked';   // temas secretos já desbloqueados pelo terminal
  var FPS = 8;                        // igual ao boil.js
  var SEEDS = [1, 4, 7, 2, 9, 5];     // igual ao boil.js

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
        '--wood-brown-light': '#666666', '--wood-brown-dark': '#181818',
        // tudo que era roxo escuro fixo no CSS (barras, chat, cards) vira cinza neutro
        '--ui-dark': '14,14,14', '--ui-chat': '22,22,22', '--ui-felt-dark': '31,31,31'
      },
      // fundo em estampa de onça (gerado em SVG, sem imagem externa)
      bg: { kind: 'leopard', base: '#474747', mid: '#333333', dark: '#0a0a0a', tileW: 16, tileH: 24 },
      preview: { bga: '#474747', bgb: '#474747', accent: '#c2c2c2', cream: '#fff8f0' },
      palette: [
        ['Fundo', '#474747'], ['Miolo', '#333333'], ['Mancha', '#0a0a0a'],
        ['Feltro', '#4a4a4a'], ['Realce', '#c2c2c2'], ['Creme', '#fff8f0']
      ]
    },
    {
      id: 'binario',
      name: '?????',
      tagline: '11101010',
      vars: {
        '--felt-dark': '#000000', '--felt': '#0b100c', '--felt-light': '#1b2c1f',
        '--wood-light': '#00ff41', '--wood-brown': '#0a1a0e',
        '--wood-brown-light': '#14301b', '--wood-brown-dark': '#000000',
        '--ui-dark': '0,0,0', '--ui-chat': '3,9,5', '--ui-felt-dark': '0,0,0'
      },
      // fundo preto cheio de octetos (8 bits) verdes que ficam trocando
      bg: { kind: 'binary', base: '#000000', fg: '#00ff41', tileW: 32, tileH: 24 },
      preview: { bga: '#000000', bgb: '#000000', accent: '#00ff41', cream: '#fff8f0' },
      palette: [
        ['Fundo', '#000000'], ['Números', '#00ff41'], ['Feltro', '#0b100c'],
        ['Realce', '#1b2c1f'], ['Detalhe', '#00ff41'], ['Creme', '#fff8f0']
      ]
    },
    {
      id: 'mar',
      name: 'Ondas do Mar',
      tagline: 'Maré azul com ondas desenhadas à mão',
      vars: {
        '--felt-dark': '#04283f', '--felt': '#0a5478', '--felt-light': '#1a86ad',
        '--wood-light': '#7fd8ff', '--wood-brown': '#08405e',
        '--wood-brown-light': '#0f5a82', '--wood-brown-dark': '#031c2d',
        '--ui-dark': '2,22,38', '--ui-chat': '4,30,48', '--ui-felt-dark': '4,40,63'
      },
      // fundo de ondas (camadas de azul com espuma), que balança como desenho à mão
      bg: { kind: 'sea', base: '#0b4a75', tileW: 32, tileH: 24 },
      preview: { bga: '#0b4a75', bgb: '#0b4a75', accent: '#7fd8ff', cream: '#fff8f0' },
      palette: [
        ['Fundo', '#0b4a75'], ['Onda', '#106da0'], ['Espuma', '#bfe9f5'],
        ['Feltro', '#0a5478'], ['Realce', '#7fd8ff'], ['Creme', '#fff8f0']
      ]
    },
    {
      id: 'casa',
      name: 'Casa',
      tagline: 'Apenas uma casa',
      vars: {
        '--felt-dark': '#000000', '--felt': '#0c0c0c', '--felt-light': '#262626',
        '--wood-light': '#ffffff', '--wood-brown': '#101010',
        '--wood-brown-light': '#2a2a2a', '--wood-brown-dark': '#000000',
        '--ui-dark': '0,0,0', '--ui-chat': '8,8,8', '--ui-felt-dark': '0,0,0'
      },
      // fundo = desenho da casa em linhas brancas sobre preto, PARADO na tela (cobre tudo) mas com
      // o tremido "hand drawn": 6 quadros (assets/casa/1..6.png, um por semente do boil.js) que se alternam.
      // A mesa desse tema é translúcida/desfocada (igual ao Carro): ver "html[data-theme=casa]" no style.css
      bg: { kind: 'frames', frames: ['assets/casa/1.png', 'assets/casa/2.png', 'assets/casa/3.png', 'assets/casa/4.png', 'assets/casa/5.png', 'assets/casa/6.png'], base: '#000000', tileW: 0, tileH: 12 },
      preview: { bga: '#000000', bgb: '#000000', accent: '#ffffff', cream: '#fff8f0' },
      palette: [
        ['Fundo', '#000000'], ['Linha', '#ffffff'], ['Feltro', '#0c0c0c'],
        ['Realce', '#262626'], ['Detalhe', '#ffffff'], ['Creme', '#fff8f0']
      ]
    },
    {
      id: 'carmesim',
      name: 'Rei Carmesim',
      tagline: 'O tempo foi apagado… só o resultado existe',
      vars: {
        '--felt-dark': '#3a0516', '--felt': '#8a0f30', '--felt-light': '#c4234f',
        '--wood-light': '#e6d2dc', '--wood-brown': '#4a0f22',
        '--wood-brown-light': '#7a1d3a', '--wood-brown-dark': '#1e0610',
        '--ui-dark': '26,4,12', '--ui-chat': '36,8,18', '--ui-felt-dark': '58,5,22'
      },
      // fundo em rede: losangos carmesim cortados por faixas claras (a "malha" do corpo do King Crimson),
      // deslizando como os outros temas e com o tremido hand drawn
      bg: { kind: 'lattice', base: '#c4153f', mid: '#9c0f33', band: '#dccbd5', edge: '#2b1522', tileW: 16, tileH: 24 },
      preview: { bga: '#c4153f', bgb: '#c4153f', accent: '#e6d2dc', cream: '#fff8f0' },
      palette: [
        ['Carmesim', '#c4153f'], ['Sombra', '#9c0f33'], ['Faixa', '#dccbd5'],
        ['Contorno', '#2b1522'], ['Olhos', '#3fd35a'], ['Creme', '#fff8f0']
      ]
    },
    {
      id: 'damasco',
      name: 'Damasco',
      tagline: 'Papel de parede que não para de descer',
      vars: {
        '--felt-dark': '#1c1712', '--felt': '#3d3228', '--felt-light': '#6b5a47',
        '--wood-light': '#d9c9a8', '--wood-brown': '#2a2018',
        '--wood-brown-light': '#52422f', '--wood-brown-dark': '#120e0a',
        '--ui-dark': '16,12,8', '--ui-chat': '24,19,13', '--ui-felt-dark': '28,23,18'
      },
      // fundo = papel de parede damasco (assets/damasco/tile.jpg) rolando PRA BAIXO sem parar (dir:'down').
      // O tile é a imagem + ela espelhada de cima pra baixo (640x1439 px), pra emendar perfeito no loop.
      // slideSec = segundos pra rolar um tile inteiro (maior = mais devagar). Um quadro só: não tem tremido.
      bg: { kind: 'tiles', dir: 'down', slideSec: 14, frames: ['assets/damasco/tile.jpg'], base: '#e6d9bf', tileW: 20, tileH: 44.97 },
      preview: { bga: '#e6d9bf', bgb: '#e6d9bf', accent: '#d9c9a8', cream: '#fff8f0' },
      palette: [
        ['Papel', '#e6d9bf'], ['Estampa', '#2f2a22'], ['Mancha', '#a89878'],
        ['Feltro', '#3d3228'], ['Realce', '#d9c9a8'], ['Creme', '#fff8f0']
      ]
    },
    {
      id: 'carro',
      locked: true,            // secreto: só aparece na aba Temas depois de `theme carro` no terminal
      name: 'Carro',
      tagline: 'Sucata largada no mato',
      vars: {
        '--felt-dark': '#0a1409', '--felt': '#17301a', '--felt-light': '#2c5230',
        '--wood-light': '#cfe0b0', '--wood-brown': '#0d1a0e',
        '--wood-brown-light': '#1e3a21', '--wood-brown-dark': '#050b05',
        '--ui-dark': '6,12,7', '--ui-chat': '10,18,11', '--ui-felt-dark': '10,20,11'
      },
      // fundo = foto (assets/carro.png), parada, cobrindo a tela toda (kind 'image').
      // A mesa desse tema é translúcida/desfocada: ver "html[data-theme=carro]" no style.css
      bg: { kind: 'image', src: 'assets/carro.png', base: '#1d3a1a', tileW: 0, tileH: 12 },
      preview: { bga: '#1d3a1a', bgb: '#1d3a1a', accent: '#cfe0b0', cream: '#fff8f0' },
      palette: [
        ['Mato', '#3f7a2a'], ['Sombra', '#0a1409'], ['Ferrugem', '#b5432f'],
        ['Feltro', '#17301a'], ['Realce', '#cfe0b0'], ['Creme', '#fff8f0']
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
  // ---------------------------------------------------------------- temas secretos
  // Tema com `locked: true` fica escondido da aba Temas até ser desbloqueado
  // (o terminal.js chama TruThemes.unlock('id')). O desbloqueio fica no localStorage.
  var memUnlocked = [];
  function unlockedIds() {
    var a = [];
    try { a = JSON.parse(localStorage.getItem(UNLOCK_KEY)) || []; } catch (e) {}
    return Array.isArray(a) ? a.concat(memUnlocked) : memUnlocked.slice();
  }
  function isAvailable(id) {
    var t = byId(id);
    return !!t && (!t.locked || unlockedIds().indexOf(t.id) !== -1);
  }
  function available() {
    return THEMES.filter(function (t) { return isAvailable(t.id); });
  }
  function unlock(id) {
    var t = byId(id);
    if (!t || !t.locked) return false;
    if (unlockedIds().indexOf(id) === -1) {
      memUnlocked.push(id);
      var a = [];
      try { a = JSON.parse(localStorage.getItem(UNLOCK_KEY)) || []; } catch (e) {}
      if (Array.isArray(a) && a.indexOf(id) === -1) a.push(id);
      try { localStorage.setItem(UNLOCK_KEY, JSON.stringify(a)); } catch (e) {}
    }
    return true;
  }

  function saved() {
    try { return localStorage.getItem(KEY); } catch (e) { return null; }
  }
  function currentId() {
    var t = byId(saved());
    return (t && isAvailable(t.id) ? t : THEMES[0]).id;
  }

  // ---------------------------------------------------------------- fundos
  // gerador pseudo-aleatório com semente (o desenho é sempre o mesmo)
  function rng(seed) {
    var s = seed;
    return function () { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
  }
  function f(n) { return n.toFixed(1); }
  // fundo parado que cobre a tela: foto (1 quadro) ou 'frames' (vários quadros, tremido hand drawn)
  function isStatic(t) { return !!(t.bg && (t.bg.kind === 'image' || t.bg.kind === 'frames')); }
  // fundo que troca de quadro (boil)
  function isBoiled(t) { return !!(t.bg && t.bg.kind !== 'image' && !(t.bg.frames && t.bg.frames.length < 2)); }
  // rola de cima pra baixo em vez de da esquerda pra direita?
  function isDown(t) { return !!(t.bg && t.bg.dir === 'down'); }

  // Estampa de onça que se repete sem emenda: rosetas (anéis abertos de manchas
  // escuras com miolo mais claro) em fileiras alternadas + pintinhas soltas.
  function leopardSvg(bg, frame) {
    var W = 240, H = 360, r = rng(11);
    var jr = rng(SEEDS[frame % SEEDS.length] * 97 + 13);   // tremido "hand drawn" deste quadro
    var mids = [], darks = [];

    function put(list, cx, cy, rx, ry, rot) {
      // cada mancha treme um pouco de um quadro pro outro (as cópias das bordas
      // recebem o mesmo tremido, então a estampa continua sem emenda)
      cx += (jr() - 0.5) * 3.6; cy += (jr() - 0.5) * 3.6;
      rot += (jr() - 0.5) * 16;
      var sc = 1 + (jr() - 0.5) * 0.12; rx *= sc; ry *= 1 + (jr() - 0.5) * 0.12;
      var ext = Math.max(rx, ry) + 3;
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


  // Fundo "matrix": grade de octetos (8 bits) verdes sobre preto. A cada quadro
  // alguns octetos mudam de valor e de brilho (o mesmo ritmo do boil.js), então
  // os números ficam piscando/trocando. Repete sem emenda.
  function binarySvg(bg, frame) {
    var W = 480, H = 360, r = rng(21), jr = rng(SEEDS[frame % SEEDS.length] * 131 + 7);
    var rows = 16, cols = 6, out = [];
    function oct(rr) { var t = ''; for (var i = 0; i < 8; i++) t += rr() < 0.5 ? '0' : '1'; return t; }
    function put(x, y, t, op) {
      out.push("<text x='" + f(x) + "' y='" + f(y) + "' fill-opacity='" + op.toFixed(2) + "'>" + t + "</text>");
    }
    for (var row = 0; row < rows; row++) {
      for (var col = 0; col < cols; col++) {
        var t = oct(r), op = r() < 0.1 ? 0.95 : 0.16 + r() * 0.5;
        if (jr() < 0.22) t = oct(jr);                    // troca os bits
        if (jr() < 0.2) op = Math.min(1, op + 0.4);      // pisca mais forte
        var x = col * 80 + (row % 2 ? 40 : 0) + 4, y = 12 + row * 22.5;
        put(x, y, t, op);
        if (x + 64 > W) put(x - W, y, t, op);            // dá a volta na borda do tile
      }
    }
    return "<svg xmlns='http://www.w3.org/2000/svg' width='" + W + "' height='" + H + "' viewBox='0 0 " + W + " " + H + "'>" +
      "<rect width='" + W + "' height='" + H + "' fill='" + bg.base + "'/>" +
      "<g font-family='Courier New,Consolas,Menlo,monospace' font-size='13' font-weight='bold' fill='" + bg.fg + "'>" +
      out.join('') + "</g></svg>";
  }


  // Fundo de mar: faixas de ondas em vários tons de azul, cada uma com uma
  // linha de espuma clara na crista. Repete sem emenda (as ondas têm um número
  // inteiro de ciclos por tile e o ciclo de cores fecha no fim). A cada quadro
  // as ondas mudam um pouquinho de fase/altura — o tremido "hand drawn".
  function seaSvg(bg, frame) {
    var W = 400, H = 300, rows = 10, gap = H / rows, step = 5;
    var r = rng(5), jr = rng(SEEDS[frame % SEEDS.length] * 211 + 5);
    var shades = ['#0b4a75', '#0d5b8a', '#106da0', '#0d5b8a', '#0b4a75'];   // 5 divide 10: fecha o ciclo
    var out = [];
    for (var i = -1; i < rows; i++) {
      var y0 = i * gap + 14, k = (i % 2 === 0) ? 4 : 5;
      var A = (4 + r() * 2.5) * (1 + (jr() - 0.5) * 0.3);
      var ph = r() * 6.283 + (jr() - 0.5) * 0.6, ph2 = r() * 6.283 + (jr() - 0.5) * 0.9;
      var pts = [];
      for (var x = 0; x <= W; x += step) {
        var a = x / W * 6.283185;
        var y = y0 + A * Math.sin(k * a + ph) + A * 0.28 * Math.sin(2 * k * a + ph2);
        pts.push(f(x) + ',' + f(y));
      }
      var curve = 'M' + pts.join(' L');
      var col = shades[((i % 5) + 5) % 5];
      out.push("<path d='" + curve + " L" + W + "," + (H + 40) + " L0," + (H + 40) + " Z' fill='" + col + "'/>");
      out.push("<path d='" + curve + "' fill='none' stroke='#bfe9f5' stroke-opacity='" + (0.35 + r() * 0.25).toFixed(2) +
               "' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round'/>");
    }
    return "<svg xmlns='http://www.w3.org/2000/svg' width='" + W + "' height='" + H + "' viewBox='0 0 " + W + " " + H + "'>" +
      "<rect width='" + W + "' height='" + H + "' fill='" + shades[4] + "'/>" + out.join('') + "</svg>";
  }

  // Fundo "rede" (King Crimson): losangos carmesim (com um miolo mais escuro) separados por
  // faixas claras com contorno escuro, em duas diagonais que se cruzam. O deslocamento do
  // tremido é um campo PERIÓDICO (senos com frequência inteira no tile), então a estampa
  // continua repetindo sem emenda em todos os quadros.
  function latticeSvg(bg, frame) {
    var W = 240, H = 360, cw = 60, ch = 90, TAU = 6.283185;
    var r = rng(33), jr = rng(SEEDS[frame % SEEDS.length] * 173 + 11);
    var p1 = jr() * TAU, p2 = jr() * TAU, p3 = jr() * TAU, p4 = jr() * TAU;
    function dx(x, y) { return 2.2 * Math.sin(TAU * (2 * x / W + 3 * y / H) + p1) + 1.1 * Math.sin(TAU * (5 * x / W - 4 * y / H) + p2); }
    function dy(x, y) { return 2.2 * Math.sin(TAU * (3 * x / W - 2 * y / H) + p3) + 1.1 * Math.sin(TAU * (4 * x / W + 5 * y / H) + p4); }
    function pt(x, y) { return f(x + dx(x, y)) + ',' + f(y + dy(x, y)); }

    var cells = [], edge = [], band = [], y, k, n, j;
    // miolo escuro de cada losango
    for (n = -3; n < 11; n++) {
      for (j = -3; j < 11; j++) {
        if ((((n + j) % 2) + 2) % 2 !== 1) continue;
        var cx = n * cw / 2, cy = j * ch / 2, s = 0.66;
        cells.push("<polygon points='" + pt(cx - cw / 2 * s, cy) + ' ' + pt(cx, cy - ch / 2 * s) + ' ' +
          pt(cx + cw / 2 * s, cy) + ' ' + pt(cx, cy + ch / 2 * s) + "'/>");
      }
    }
    // faixas: duas famílias de diagonais (a cada ponto o campo de tremido é o mesmo)
    function family(sign, k0, k1) {
      for (k = k0; k <= k1; k++) {
        var pts = [];
        for (y = -ch; y <= H + ch; y += 15) pts.push(pt(cw * (k + sign * y / ch), y));
        var d = 'M' + pts.join(' L');
        edge.push("<path d='" + d + "'/>");
        band.push("<path d='" + d + "'/>");
      }
    }
    family(-1, -2, 11);
    family(1, -11, 4);

    var jitterW = (0.9 + r() * 0.2);
    return "<svg xmlns='http://www.w3.org/2000/svg' width='" + W + "' height='" + H + "' viewBox='0 0 " + W + " " + H + "'>" +
      "<rect width='" + W + "' height='" + H + "' fill='" + bg.base + "'/>" +
      "<g fill='" + bg.mid + "' fill-opacity='0.85'>" + cells.join('') + "</g>" +
      "<g fill='none' stroke='" + bg.edge + "' stroke-width='" + (13 * jitterW).toFixed(1) + "' stroke-linecap='round' stroke-linejoin='round'>" + edge.join('') + "</g>" +
      "<g fill='none' stroke='" + bg.band + "' stroke-width='" + (8 * jitterW).toFixed(1) + "' stroke-linecap='round' stroke-linejoin='round'>" + band.join('') + "</g></svg>";
  }


  // Fundo do tema: losangos (Drácula) ou estampa própria (`bg`).
  function bgImage(t, frame) {
    var svg;
    if (t.bg && t.bg.kind === 'image') {
      return 'url("' + t.bg.src + '")';                 // foto: um quadro só, sem tremido
    } else if (t.bg && (t.bg.kind === 'frames' || t.bg.kind === 'tiles')) {
      return 'url("' + t.bg.frames[(frame || 0) % t.bg.frames.length] + '")';   // uma imagem por quadro
    } else if (t.bg) {
      frame = (frame || 0) % SEEDS.length;
      t._svg = t._svg || [];
      svg = t._svg[frame] || (t._svg[frame] = (t.bg.kind === 'binary' ? binarySvg : t.bg.kind === 'sea' ? seaSvg : t.bg.kind === 'lattice' ? latticeSvg : leopardSvg)(t.bg, frame));
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

  // Tema 'frames' (quadros PNG grandes): em vez de trocar UMA imagem por vez (o navegador decodifica a
  // nova na hora e o fundo some por um instante = pisca), o elemento recebe TODOS os quadros empilhados,
  // com o quadro da vez por cima. Os outros ficam embaixo, já decodificados; se o de cima ainda não
  // carregou, aparece o de baixo em vez de preto. Nos demais temas é só a imagem do quadro.
  function bgLayers(t, frame) {
    if (!(t.bg && (t.bg.kind === 'frames' || t.bg.kind === 'tiles'))) return bgImage(t, frame);
    var n = t.bg.frames.length, i0 = (frame || 0) % n, out = [];
    for (var k = 0; k < n; k++) out.push('url("' + t.bg.frames[(i0 + k) % n] + '")');
    return out.join(',');
  }

  // "Hand drawn": troca a estampa entre alguns quadros (cada um com as manchas
  // levemente deslocadas), no mesmo ritmo do boil.js. As imagens são geradas e
  // pré-carregadas antes, então a troca não pisca.
  var boilTimer = null, boilN = 0;
  function stopBoil() {
    if (boilTimer) clearInterval(boilTimer);
    boilTimer = null;
    var g = document.querySelector('.game-bg');
    if (g) g.style.removeProperty('--theme-bg-image');
  }
  function startBoil(t) {
    stopBoil();
    if (!isBoiled(t)) return;
    // guarda as imagens em t._pre (se ninguém segurar a referência o navegador pode descartar a versão decodificada)
    t._pre = [];
    for (var i = 0; i < SEEDS.length; i++) {
      var im = new Image(); im.src = bgImage(t, i).slice(5, -2);
      if (im.decode) im.decode().catch(function () {});
      t._pre.push(im);
    }
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    boilTimer = setInterval(function () {
      if (document.hidden) return;
      var url = bgLayers(t, ++boilN);
      var g = document.querySelector('.game-bg');
      if (g) g.style.setProperty('--theme-bg-image', url);
      var sl = document.querySelectorAll('.tb-slide[data-boil]');
      for (var k = 0; k < sl.length; k++) sl[k].style.backgroundImage = url;
    }, 1000 / FPS);
  }

  function setVar(k, v) { root.style.setProperty(k, v); appliedVars.push(k); }

  // temp = true: tema imposto por um admin (`theme <id> @nome`). Vale só nesta
  // sessão: não grava no localStorage e ignora o bloqueio dos temas secretos.
  function apply(id, temp) {
    var t = byId(id);
    if (temp) { if (!t) return null; }
    else if (!t || !isAvailable(t.id)) t = THEMES[0];   // tema secreto ainda bloqueado = Drácula
    appliedVars.forEach(function (k) { root.style.removeProperty(k); });
    appliedVars = [];
    Object.keys(t.vars || {}).forEach(function (k) { setVar(k, t.vars[k]); });
    if (t.bg) {
      // fundo próprio na partida (o .game-bg lê estas variáveis)
      setVar('--theme-bg-image', bgLayers(t, 0));
      setVar('--theme-bg-color', t.bg.base);
      setVar('--theme-tile-w', t.bg.tileW + 'rem');
      setVar('--theme-tile-h', t.bg.tileH + 'rem');
      if (isStatic(t)) { setVar('--theme-bg-size', 'cover'); setVar('--theme-bg-pos', 'center'); }
    }
    if (t.bg) setVar('--theme-slide-time', (t.bg.slideSec || 8) + 's');
    root.classList.toggle('theme-bg-down', isDown(t));
    root.classList.toggle('theme-bg', !!t.bg);
    if (t.bg) startBoil(t); else stopBoil();
    root.setAttribute('data-theme', t.id);
    if (!temp) { try { localStorage.setItem(KEY, t.id); } catch (e) {} }
    return t;
  }
  // ---- miniatura (usada no card de vitórias/derrotas do adversário) ----
  // Mesmo fundo animado da aba Temas, só que pequeno e independente do tema
  // que EU estou usando: tem o próprio timer de "hand drawn".
  var THUMB_SCALE = 0.3;
  function nameOf(id) { var t = byId(id); return t ? t.name : null; }
  function unmountThumb(box) {
    if (box && box._thumbTimer) { clearInterval(box._thumbTimer); box._thumbTimer = null; }
    if (box) box.innerHTML = '';
  }
  function mountThumb(box, id) {
    unmountThumb(box);
    var t = byId(id);
    if (!t || !box) return false;
    var photo = isStatic(t);
    var tw = photo ? 0 : (t.bg ? t.bg.tileW : 7) * THUMB_SCALE, th = (t.bg ? t.bg.tileH : 12) * THUMB_SCALE;
    var slide = document.createElement('div');
    slide.className = 'tb-slide';
    slide.style.setProperty('--tile-w', tw + 'rem');
    slide.style.backgroundSize = photo ? 'cover' : tw + 'rem ' + th + 'rem';
    if (isDown(t)) { slide.classList.add('down'); slide.style.setProperty('--tile-h', th + 'rem'); slide.style.animationDuration = (t.bg.slideSec || 8) + 's'; }
    if (photo) slide.style.backgroundPosition = 'center';
    slide.style.backgroundImage = bgLayers(t, 0);
    box.style.background = t.preview.bga;
    box.appendChild(slide);
    if (isBoiled(t) && !(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches)) {
      var n = 0;
      box._thumbTimer = setInterval(function () {
        if (document.hidden) return;
        slide.style.backgroundImage = bgLayers(t, ++n);
      }, 1000 / FPS);
    }
    return true;
  }

  // Fundo do tema em imagens (um quadro por semente) pro bg-distort.js virar textura WebGL.
  // Retorna null nos temas sem `bg` (Drácula usa os losangos desenhados direto no shader).
  function bgSpec(id) {
    var t = byId(id);
    if (!t || !t.bg) return null;
    if (t.bg.kind === 'image') return { kind: 'image', src: t.bg.src };
    if (t.bg.kind === 'frames') return { kind: 'frames', urls: t.bg.frames.slice() };
    var urls = [];
    if (t.bg.kind === 'tiles') urls = t.bg.frames.slice();
    else for (var i = 0; i < SEEDS.length; i++) urls.push(bgImage(t, i).slice(5, -2));
    return { tileW: t.bg.tileW, tileH: t.bg.tileH, urls: urls, vertical: isDown(t), period: t.bg.slideSec || 8 };
  }

  window.TruThemes = { bgSpec: bgSpec, list: THEMES, available: available, isAvailable: isAvailable, unlock: unlock, apply: apply, applyTemp: function (id) { return apply(id, true); }, current: currentId, nameOf: nameOf, mountThumb: mountThumb, unmountThumb: unmountThumb };
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
    var photo = isStatic(t);
    var size = photo ? ';--tile-w:0rem;background-size:cover;background-position:center'
      : t.bg ? ';--tile-w:' + t.bg.tileW + 'rem;background-size:' + t.bg.tileW + 'rem ' + t.bg.tileH + 'rem' : '';
    if (isDown(t)) size += ';--tile-h:' + t.bg.tileH + 'rem;animation-duration:' + (t.bg.slideSec || 8) + 's';
    return '<div class="tb" style="background:' + p.bga + '">' +
      '<div class="tb-slide' + (isDown(t) ? ' down' : '') + '"' + (isBoiled(t) ? ' data-boil="1"' : '') + ' style="background-image:' + bgLayers(t, 0).replace(/"/g, '&quot;') + size + '"></div>' +
    '</div>';
  }

  function render() {
    var t = available()[index] || THEMES[0];
    elTitle.textContent = t.name;
    elTag.textContent = t.tagline;
    elPreview.innerHTML = previewHtml(t);
  }

  function open() {
    var cur = currentId(), list = available();
    index = 0;
    for (var i = 0; i < list.length; i++) if (list[i].id === cur) index = i;
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
    var list = available();
    index = (index + step + list.length) % list.length;
    render();
    apply(list[index].id);
  }
  btnPrev.addEventListener('click', function () { go(-1); });
  btnNext.addEventListener('click', function () { go(1); });

  window.openThemes = open;
})();
