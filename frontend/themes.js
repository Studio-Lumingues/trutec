// ============================================================================
// TEMAS (aba "Temas" em Configurações)
// - Clicar na aba abre uma tela grande com um EXEMPLO do tema (mesa, cartas,
//   bonecos, placar e botões desenhados com as cores dele).
// - Hoje só existe o Drácula (o roxo original do TruTEC). Pra criar outro tema,
//   copie o objeto do Drácula dentro de THEMES e troque:
//     vars    -> variáveis CSS que o tema sobrescreve no :root (o Drácula não
//                sobrescreve nada porque as cores dele já são as do style.css)
//     preview -> cores usadas só no desenho de exemplo
//     palette -> as bolinhas de cor mostradas embaixo do exemplo
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
  function apply(id) {
    var t = byId(id) || THEMES[0];
    appliedVars.forEach(function (k) { root.style.removeProperty(k); });
    appliedVars = [];
    Object.keys(t.vars || {}).forEach(function (k) { root.style.setProperty(k, t.vars[k]); appliedVars.push(k); });
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
  var elPalette = document.getElementById('theme-palette');
  var elCount = document.getElementById('theme-count');
  var btnUse = document.getElementById('theme-use');
  var btnPrev = document.getElementById('theme-prev');
  var btnNext = document.getElementById('theme-next');

  function card(rank, suit, color, cls) {
    return '<div class="tp-card ' + color + (cls ? ' ' + cls : '') + '"><b>' + rank + '</b><span>' + suit + '</span></div>';
  }
  function seat(pos, name) {
    return '<div class="tp-seat tp-' + pos + '"><div class="tp-av"><img src="assets/personagem.svg" alt="" draggable="false" /></div>' +
      '<span class="tp-name">' + name + '</span></div>';
  }

  function previewHtml(t) {
    var p = t.preview;
    var vars = '--tp-bga:' + p.bga + ';--tp-bgb:' + p.bgb + ';--tp-felt:' + p.felt + ';--tp-feltd:' + p.feltd +
      ';--tp-feltl:' + p.feltl + ';--tp-rim:' + p.rim + ';--tp-accent:' + p.accent + ';--tp-cream:' + p.cream +
      ';--tp-back:' + p.back + ';--tp-ink:' + p.ink;
    return '<div class="tp" style="' + vars + '">' +
      '<span class="tp-ribbon">Exemplo</span>' +
      '<div class="tp-score"><span>NÓS</span><b>4</b><i>x</i><b>2</b><span>ELES</span></div>' +
      seat('top', 'Parceiro') + seat('left', 'Bot Tião') + seat('right', 'Bot Zezé') +
      '<div class="tp-table">' +
        '<div class="tp-vira"><span class="tp-label">Vira</span>' + card('J', '♣', 'black') + '</div>' +
        '<div class="tp-deck"><div class="tp-card back"></div></div>' +
        '<div class="tp-played">' + card('K', '♦', 'red', 'r1') + card('2', '♠', 'black', 'r2') + card('7', '♥', 'red', 'r3') + '</div>' +
      '</div>' +
      '<div class="tp-hand">' + card('3', '♣', 'black', 'lg h1') + card('7', '♦', 'red', 'lg h2') + card('A', '♠', 'black', 'lg h3') + '</div>' +
      '<div class="tp-btn tp-btn-2">Correr</div>' +
      '<div class="tp-btn tp-btn-1">TRUCO!</div>' +
    '</div>';
  }

  function render() {
    var t = THEMES[index];
    elTitle.textContent = t.name;
    elTag.textContent = t.tagline;
    elPreview.innerHTML = previewHtml(t);
    elPalette.innerHTML = t.palette.map(function (c) {
      return '<span class="tp-sw"><i style="background:' + c[1] + '"></i>' + c[0] + '</span>';
    }).join('');
    var many = THEMES.length > 1;
    btnPrev.hidden = btnNext.hidden = !many;
    elCount.textContent = (index + 1) + ' de ' + THEMES.length + (many ? '' : ' · mais temas em breve');
    var isCurrent = currentId() === t.id;
    btnUse.disabled = isCurrent;
    btnUse.textContent = isCurrent ? 'Tema atual' : 'Usar este tema';
  }

  function open() {
    var cur = currentId();
    for (var i = 0; i < THEMES.length; i++) if (THEMES[i].id === cur) index = i;
    render();
    if (settingsModal) settingsModal.classList.add('hidden');
    modal.classList.remove('hidden');
    btnUse.focus();
  }
  function backToSettings() {
    modal.classList.add('hidden');
    if (window.openSettings) window.openSettings();
  }

  tabOpen.addEventListener('click', open);
  document.getElementById('themes-close').addEventListener('click', backToSettings);
  document.getElementById('tab-geral-back').addEventListener('click', backToSettings);
  modal.addEventListener('click', function (e) { if (e.target === modal) backToSettings(); });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !modal.classList.contains('hidden')) backToSettings();
  });
  btnPrev.addEventListener('click', function () { index = (index - 1 + THEMES.length) % THEMES.length; render(); });
  btnNext.addEventListener('click', function () { index = (index + 1) % THEMES.length; render(); });
  btnUse.addEventListener('click', function () { apply(THEMES[index].id); render(); });

  window.openThemes = open;
})();
