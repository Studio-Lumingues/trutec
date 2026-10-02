// ============================================================================
// PERFIL LOCAL (nome + vitórias/derrotas, salvos no localStorage)
// - TruStats.get() / addWin() / addLoss(): contador da própria pessoa.
// - O nome digitado na tela inicial é lembrado da próxima vez.
// - Card "Vitórias / Derrotas" do adversário: aparece só enquanto o boneco dele
//   está ampliado e acompanha o mouse. No celular (sem mouse) fica ao lado do
//   boneco ampliado. Os números vêm de figure.dataset.wins / .losses, que o
//   client.js preenche a partir de player.stats vindo do servidor.
// ============================================================================
(function () {
  var KEY = 'trutec-stats';
  var NAME_KEY = 'trutec-name';

  function clean(v) {
    v = parseInt(v, 10);
    return isFinite(v) && v > 0 ? Math.min(v, 999999) : 0;
  }
  function read() {
    try {
      var o = JSON.parse(localStorage.getItem(KEY));
      return { wins: clean(o && o.wins), losses: clean(o && o.losses) };
    } catch (e) { return { wins: 0, losses: 0 }; }
  }
  function write(s) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) {} }

  window.TruStats = {
    get: read,
    addWin: function () { var s = read(); s.wins++; write(s); },
    addLoss: function () { var s = read(); s.losses++; write(s); }
  };

  // ---- lembrar o nome ----
  function setupName() {
    var input = document.getElementById('input-name');
    if (!input) return;
    try {
      var saved = localStorage.getItem(NAME_KEY);
      if (saved && !input.value) input.value = saved.slice(0, 16);
    } catch (e) {}
    input.addEventListener('input', function () {
      try { localStorage.setItem(NAME_KEY, input.value.trim()); } catch (e) {}
    });
  }

  // ---- card do adversário ----
  var card = null, hEl = null, wEl = null, lEl = null, activeFig = null;
  var themeBox = null, themeNameEl = null, thumbEl = null, shownTheme = null;
  var OFFSET = 18;
  var canHover = window.matchMedia && window.matchMedia('(hover: hover) and (pointer: fine)').matches;

  function build() {
    card = document.createElement('div');
    card.className = 'stats-card';
    card.setAttribute('aria-hidden', 'true');
    card.innerHTML =
      '<div class="stats-row stats-handle" hidden><b></b></div>' +
      '<div class="stats-row"><span>Vitórias:</span><b class="stats-wins">—</b></div>' +
      '<div class="stats-row"><span>Derrotas:</span><b class="stats-losses">—</b></div>' +
      '<div class="stats-theme" hidden>' +
        '<div class="stats-row"><span>Tema:</span><b class="stats-theme-name">—</b></div>' +
        '<div class="stats-thumb"></div>' +
      '</div>';
    document.body.appendChild(card);
    wEl = card.querySelector('.stats-wins');
    lEl = card.querySelector('.stats-losses');
    hEl = card.querySelector('.stats-handle');
    themeBox = card.querySelector('.stats-theme');
    themeNameEl = card.querySelector('.stats-theme-name');
    thumbEl = card.querySelector('.stats-thumb');
  }

  // tema do jogador: nome + miniatura animada (só remonta se o tema mudou)
  function fillTheme(fig) {
    var id = fig.dataset.theme;
    var name = id && window.TruThemes ? TruThemes.nameOf(id) : null;
    if (!name) { clearTheme(); themeBox.hidden = true; return; }
    themeBox.hidden = false;
    themeNameEl.textContent = name;
    if (shownTheme !== id) { shownTheme = id; TruThemes.mountThumb(thumbEl, id); }
  }
  function clearTheme() {
    shownTheme = null;
    if (window.TruThemes && thumbEl) TruThemes.unmountThumb(thumbEl);
  }

  function fill(fig) {
    var w = fig.dataset.wins, l = fig.dataset.losses;
    var hd = fig.dataset.handle;
    hEl.hidden = !hd;
    if (hd) hEl.firstChild.textContent = '@' + hd;
    wEl.textContent = w === undefined || w === '' ? '—' : w;
    lEl.textContent = l === undefined || l === '' ? '—' : l;
    fillTheme(fig);
  }

  function place(x, y) {
    var r = card.getBoundingClientRect();
    var nx = x + OFFSET, ny = y + OFFSET;
    if (nx + r.width > window.innerWidth - 8) nx = x - OFFSET - r.width; // não sai pela direita
    if (ny + r.height > window.innerHeight - 8) ny = y - OFFSET - r.height; // nem por baixo
    card.style.transform = 'translate(' + Math.max(8, nx) + 'px,' + Math.max(8, ny) + 'px)';
  }

  function show(fig) {
    activeFig = fig;
    fill(fig);
    card.classList.add('show');
  }
  function hide() {
    activeFig = null;
    if (card) card.classList.remove('show');
    clearTheme(); // para o timer da miniatura enquanto o card está escondido
  }

  function figOf(target) {
    return target && target.closest ? target.closest('.seat .seat-figure') : null;
  }

  function setupCard() {
    build();

    if (canHover) {
      // desktop: segue o mouse enquanto o boneco estiver ampliado (hover)
      document.addEventListener('mouseover', function (e) {
        var fig = figOf(e.target);
        if (fig && fig !== activeFig) { show(fig); place(e.clientX, e.clientY); }
        else if (!fig && activeFig) hide();
      });
      document.addEventListener('mousemove', function (e) {
        if (!activeFig) return;
        fill(activeFig); // se o número mudar no meio do zoom, atualiza
        place(e.clientX, e.clientY);
      });
      document.addEventListener('mouseleave', hide);
      window.addEventListener('blur', hide);
    } else {
      // celular: o seat-zoom.js põe .is-zoomed no boneco tocado; o card
      // fica ao lado dele enquanto durar o zoom
      var mo = new MutationObserver(function (list) {
        list.forEach(function (m) {
          var fig = m.target;
          if (!fig.classList || !fig.classList.contains('seat-figure')) return;
          if (fig.classList.contains('is-zoomed')) {
            show(fig);
            var r = fig.getBoundingClientRect();
            place(r.left + r.width / 2, r.top + r.height / 2);
          } else if (fig === activeFig) hide();
        });
      });
      mo.observe(document.body, { subtree: true, attributes: true, attributeFilter: ['class'] });
    }
  }

  function init() { setupName(); setupCard(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
