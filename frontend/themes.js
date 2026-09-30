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

  // Fundo do tema: o mesmo desenho do fundo da partida (losangos), com as
  // cores do tema. `bga` = losango, `bgb` = fundo entre os losangos.
  function bgImage(p) {
    var A = encodeURIComponent(p.bga), B = encodeURIComponent(p.bgb);
    var svg = "<svg xmlns='http://www.w3.org/2000/svg' width='70' height='120' viewBox='0 0 70 120'>" +
      "<rect width='70' height='120' fill='" + decodeURIComponent(B) + "'/>" +
      "<g fill='" + decodeURIComponent(A) + "'>" +
      "<polygon points='0,-60 35,0 0,60 -35,0'/><polygon points='70,-60 105,0 70,60 35,0'/>" +
      "<polygon points='0,60 35,120 0,180 -35,120'/><polygon points='70,60 105,120 70,180 35,120'/></g></svg>";
    return 'url("data:image/svg+xml,' + encodeURIComponent(svg) + '")';
  }

  function previewHtml(t) {
    var p = t.preview;
    return '<div class="tb" style="background:' + p.bga + '">' +
      '<div class="tb-slide" style="background-image:' + bgImage(p).replace(/"/g, '&quot;') + '"></div>' +
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
