// ============================================================================
// GRÁFICO DE DESEMPENHO DO PERFIL (estilo gráfico de velas)
// - Fica sempre visível no perfil (#sp-chart), com altura FIXA (não mexe no layout).
// - Sem partidas: linha reta. Com partidas: velas + médias móveis.
// - Clicar no gráfico abre uma janela com mais detalhes (vitórias, derrotas, aproveitamento,
//   saldo, sequências e o gráfico maior com informações ao passar o mouse/dedo).
// TruChart.inline('arroba') é chamado pelo social.js sempre que o perfil é desenhado.
// Dados: GET /api/profile/:handle/history.
// ============================================================================
(function () {
  var STALE_MS = 30000;

  var css = document.createElement('style');
  css.textContent =
    '.sp-chart{position:relative;flex:none;width:100%;max-width:30rem;height:12rem;margin:1rem 0;border-radius:.8rem;background:rgba(255,248,240,.05);overflow:hidden;touch-action:pan-y;cursor:pointer}' +
    '.sp-chart:hover{background:rgba(255,248,240,.08)}' +
    '.sp-chart:focus-visible{outline:2px solid rgba(255,248,240,.7);outline-offset:2px}' +
    '.sp-chart canvas,.tc-wrap canvas{position:absolute;inset:0;width:100%;height:100%;display:block}' +
    '.tc-expand{position:absolute;top:.4rem;right:.5rem;font-size:.9rem;opacity:.45;pointer-events:none;line-height:1}' +
    '.tc-tip{position:absolute;pointer-events:none;z-index:2;padding:.45rem .6rem;border-radius:.5rem;background:rgba(15,15,15,.95);border:1px solid rgba(255,248,240,.25);font-size:.85rem;line-height:1.35;white-space:nowrap;display:none}' +
    '.tc-card{width:min(46rem,94vw);max-height:92dvh;overflow:auto}' +
    '.tc-stats{display:grid;grid-template-columns:repeat(4,1fr);gap:.5rem;margin:.6rem 0}' +
    '.tc-stat{background:rgba(255,248,240,.07);border-radius:.7rem;padding:.55rem .2rem;text-align:center}' +
    '.tc-stat b{display:block;font-size:1.4rem;font-weight:400}' +
    '.tc-stat span{font-size:.75rem;opacity:.7}' +
    '.tc-extra{display:grid;grid-template-columns:repeat(3,1fr);gap:.5rem;margin:0 0 .6rem}' +
    '.tc-legend{display:flex;gap:1rem;justify-content:center;flex-wrap:wrap;font-size:.8rem;opacity:.85;margin:.2rem 0 .5rem}' +
    '.tc-legend i{display:inline-block;width:.8rem;height:.25rem;border-radius:2px;margin-right:.35rem;vertical-align:middle}' +
    '.tc-wrap{position:relative;height:min(20rem,46dvh);margin:.2rem 0 .6rem;border-radius:.6rem;background:rgba(0,0,0,.35);border:1px solid rgba(255,248,240,.12);touch-action:pan-y}' +
    '.tc-note{font-size:.85rem;opacity:.7;margin:0 0 .8rem;text-align:center;min-height:1.1em}';
  document.head.appendChild(css);

  function colors() {
    var cb = document.documentElement.classList.contains('colorblind');
    return { up: cb ? '#4da3ff' : '#3ddc84', down: cb ? '#ffb020' : '#ff4d5e' };
  }

  // ---- dados -> velas ----
  function compute(history, wins, losses) {
    var n = history.length, sum = 0, hw = 0;
    history.forEach(function (h) { if (h) { sum++; hw++; } else sum--; });
    var base = (wins - losses) - sum;                       // saldo antes da 1ª partida registrada
    var w0 = Math.max(0, wins - hw), l0 = Math.max(0, losses - (n - hw));
    var size = Math.max(1, Math.ceil(n / 30));
    var bal = base, cw = w0, cl = l0, candles = [];
    for (var i = 0; i < n; i += size) {
      var open = bal, hi = bal, lo = bal, w = 0, l = 0, end = Math.min(n, i + size);
      for (var j = i; j < end; j++) {
        if (history[j]) { bal++; w++; } else { bal--; l++; }
        if (bal > hi) hi = bal; if (bal < lo) lo = bal;
      }
      cw += w; cl += l;
      candles.push({ open: open, close: bal, high: hi, low: lo, w: w, l: l, from: i + 1, to: end, rate: Math.round(cw / (cw + cl) * 100) });
    }
    function ma(k) {
      return candles.map(function (c, i) {
        var a = Math.max(0, i - k + 1), s = 0;
        for (var q = a; q <= i; q++) s += candles[q].close;
        return s / (i - a + 1);
      });
    }
    // sequências (só das partidas com detalhe)
    var best = 0, run = 0;
    history.forEach(function (h) { if (h) { run++; if (run > best) best = run; } else run = 0; });
    var cur = 0, curWin = null;
    for (var k = n - 1; k >= 0; k--) {
      if (curWin === null) curWin = !!history[k];
      if (!!history[k] === curWin) cur++; else break;
    }
    return { candles: candles, ma1: ma(3), ma2: ma(7), base: base, size: size, n: n, wins: wins, losses: losses,
      prior: (w0 + l0), bestStreak: best, curStreak: cur, curWin: curWin };
  }

  // ---- estado compartilhado ----
  var model = null, level = 0;
  var curHandle = '', loadedAt = 0, loading = false, reqId = 0, loadError = '';
  var charts = [];   // inline + modal

  // ---- um gráfico dentro de um elemento (usado no perfil e na janela) ----
  function createChart(host, opts) {
    var PAD = opts.big ? { l: 10, r: 46, t: 12, b: 24 } : { l: 10, r: 38, t: 12, b: 22 };
    host.insertAdjacentHTML('afterbegin', '<canvas></canvas>' + (opts.tooltip ? '<div class="tc-tip"></div>' : ''));
    var canvas = host.querySelector('canvas'), tip = host.querySelector('.tc-tip');
    var ctx = canvas.getContext('2d');
    var hover = -1, W = 0, H = 0, dpr = 1;

    function fit() {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = host.clientWidth; H = host.clientHeight;
      canvas.width = Math.max(1, Math.round(W * dpr));
      canvas.height = Math.max(1, Math.round(H * dpr));
    }

    function draw() {
      if (!W || !H) return;
      var col = colors();
      var C = model ? model.candles : [], cnt = C.length;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      ctx.font = '12px Coolvetica, "Segoe UI", system-ui, sans-serif';

      var lo, hi;
      if (cnt) {
        lo = Infinity; hi = -Infinity;
        C.forEach(function (c) { if (c.low < lo) lo = c.low; if (c.high > hi) hi = c.high; });
        var span = Math.max(4, hi - lo), mid = (hi + lo) / 2;
        lo = mid - span * 0.6; hi = mid + span * 0.6;
      } else {
        lo = level - 3; hi = level + 3;   // sem partidas: escala fixa em volta do saldo atual
      }
      var pw = W - PAD.l - PAD.r, ph = H - PAD.t - PAD.b;
      function Y(v) { return PAD.t + (1 - (v - lo) / (hi - lo)) * ph; }
      var step = cnt ? pw / cnt : pw;
      function X(i) { return PAD.l + step * (i + 0.5); }

      ctx.textAlign = 'left'; ctx.lineWidth = 1;
      for (var t = 0; t <= 4; t++) {
        var v = lo + (hi - lo) * t / 4, y = Y(v);
        ctx.strokeStyle = 'rgba(255,248,240,.07)';
        ctx.beginPath(); ctx.moveTo(PAD.l, y); ctx.lineTo(W - PAD.r, y); ctx.stroke();
        ctx.fillStyle = 'rgba(255,248,240,.4)';
        ctx.fillText((Math.round(v) > 0 ? '+' : '') + Math.round(v), W - PAD.r + 6, y + 4);
      }

      if (!cnt) {   // linha reta: nada aconteceu ainda
        var y0 = Y(level);
        ctx.strokeStyle = 'rgba(255,248,240,.45)'; ctx.lineWidth = 2; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(PAD.l, y0); ctx.lineTo(W - PAD.r, y0); ctx.stroke();
        return;
      }

      if (lo < 0 && hi > 0) {
        ctx.strokeStyle = 'rgba(255,248,240,.25)'; ctx.setLineDash([4, 4]);
        ctx.beginPath(); ctx.moveTo(PAD.l, Y(0)); ctx.lineTo(W - PAD.r, Y(0)); ctx.stroke(); ctx.setLineDash([]);
      }
      ctx.fillStyle = 'rgba(255,248,240,.45)';
      ctx.textAlign = 'left'; ctx.fillText('#' + C[0].from, PAD.l, H - 6);
      ctx.textAlign = 'right'; ctx.fillText('#' + C[cnt - 1].to, W - PAD.r, H - 6);

      var bw = Math.max(3, Math.min(22, step * 0.62));
      C.forEach(function (c, i) {
        var up = c.close >= c.open, color = up ? col.up : col.down, x = X(i);
        ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(x, Y(c.high)); ctx.lineTo(x, Y(c.low)); ctx.stroke();
        var y1 = Y(Math.max(c.open, c.close)), y2 = Y(Math.min(c.open, c.close));
        var h = Math.max(2, y2 - y1);
        if (up) ctx.fillStyle = 'rgba(0,0,0,.85)';           // vela vazada = subiu (como no gráfico de bolsa)
        ctx.fillRect(x - bw / 2, y1, bw, h);
        ctx.strokeRect(x - bw / 2, y1, bw, h);
      });

      function line(arr, color) {
        if (arr.length < 2) return;
        ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.lineJoin = 'round';
        ctx.beginPath();
        arr.forEach(function (v, i) { if (i) ctx.lineTo(X(i), Y(v)); else ctx.moveTo(X(i), Y(v)); });
        ctx.stroke();
      }
      line(model.ma2, '#e8e36a'); line(model.ma1, '#5fc8ff');

      if (hover >= 0 && hover < cnt) {
        ctx.strokeStyle = 'rgba(255,248,240,.35)'; ctx.lineWidth = 1; ctx.setLineDash([3, 3]);
        ctx.beginPath(); ctx.moveTo(X(hover), PAD.t); ctx.lineTo(X(hover), H - PAD.b); ctx.stroke(); ctx.setLineDash([]);
      }
    }

    function onMove(e) {
      if (!tip || !model || !model.candles.length) return;
      var r = canvas.getBoundingClientRect(), x = e.clientX - r.left;
      var cnt = model.candles.length, step = (W - PAD.l - PAD.r) / cnt;
      var i = Math.floor((x - PAD.l) / step);
      if (i < 0 || i >= cnt) { hover = -1; tip.style.display = 'none'; draw(); return; }
      hover = i;
      var c = model.candles[i], col = colors();
      var range = c.from === c.to ? 'Partida #' + c.from : 'Partidas #' + c.from + '–' + c.to;
      tip.innerHTML = '<b>' + range + '</b><br>' +
        '<span style="color:' + col.up + '">' + c.w + 'V</span> · <span style="color:' + col.down + '">' + c.l + 'D</span><br>' +
        'Saldo: ' + (c.close > 0 ? '+' : '') + c.close + '<br>Aproveit.: ' + c.rate + '%';
      tip.style.display = 'block';
      var tx = PAD.l + step * (i + 0.5) + 14;
      if (tx + tip.offsetWidth > W - 4) tx = PAD.l + step * (i + 0.5) - 14 - tip.offsetWidth;
      tip.style.left = Math.max(4, tx) + 'px';
      tip.style.top = Math.max(4, Math.min(H - tip.offsetHeight - 4, (e.clientY - r.top) - tip.offsetHeight / 2)) + 'px';
      draw();
    }

    if (tip) {
      canvas.addEventListener('pointermove', onMove);
      canvas.addEventListener('pointerdown', onMove);
      canvas.addEventListener('pointerleave', function () { hover = -1; tip.style.display = 'none'; draw(); });
    }
    function reset() { hover = -1; if (tip) tip.style.display = 'none'; }
    if (window.ResizeObserver) new ResizeObserver(function () { fit(); draw(); }).observe(host);
    else window.addEventListener('resize', function () { fit(); draw(); });

    var api = { host: host, fit: fit, draw: draw, reset: reset };
    charts.push(api);
    fit();
    return api;
  }

  function redrawAll() { charts.forEach(function (c) { c.reset(); c.fit(); c.draw(); }); }

  // ---- gráfico dentro do perfil ----
  var inlineChart = null;
  function setupInline() {
    var host = document.getElementById('sp-chart');
    if (!host) return false;
    if (inlineChart && host.contains(inlineChart.host.querySelector('canvas'))) return true;
    host.innerHTML = '<span class="tc-expand" aria-hidden="true">\u2922</span>';
    host.setAttribute('role', 'button');
    host.setAttribute('tabindex', '0');
    host.setAttribute('aria-label', 'Gráfico de desempenho. Clique para ver detalhes');
    inlineChart = createChart(host, { big: false, tooltip: false });
    host.addEventListener('click', openDetails);
    host.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetails(); } });
    return true;
  }

  // ---- janela de detalhes ----
  var modal, modalChart, mEls = {};
  function buildModal() {
    if (modal) return;
    modal = document.createElement('div');
    modal.className = 'settings-modal hidden';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', 'tc-title');
    modal.innerHTML =
      '<div class="settings-card tc-card">' +
        '<h2 id="tc-title">Desempenho</h2>' +
        '<div class="tc-stats">' +
          '<div class="tc-stat"><b data-k="w">0</b><span>Vitórias</span></div>' +
          '<div class="tc-stat"><b data-k="l">0</b><span>Derrotas</span></div>' +
          '<div class="tc-stat"><b data-k="r">—</b><span>Aproveit.</span></div>' +
          '<div class="tc-stat"><b data-k="s">0</b><span>Saldo</span></div>' +
        '</div>' +
        '<div class="tc-extra">' +
          '<div class="tc-stat"><b data-k="t">0</b><span>Partidas</span></div>' +
          '<div class="tc-stat"><b data-k="cs">—</b><span>Sequência atual</span></div>' +
          '<div class="tc-stat"><b data-k="bs">0</b><span>Maior sequência de vitórias</span></div>' +
        '</div>' +
        '<div class="tc-legend"><span><i style="background:#5fc8ff"></i>Média curta</span><span><i style="background:#e8e36a"></i>Média longa</span></div>' +
        '<div class="tc-wrap" id="tc-wrap"></div>' +
        '<p class="tc-note"></p>' +
        '<div class="modal-actions"><button type="button" class="btn btn-primary tc-close">Fechar</button></div>' +
      '</div>';
    document.body.appendChild(modal);
    ['w', 'l', 'r', 's', 't', 'cs', 'bs'].forEach(function (k) { mEls[k] = modal.querySelector('[data-k="' + k + '"]'); });
    mEls.title = modal.querySelector('#tc-title');
    mEls.note = modal.querySelector('.tc-note');
    mEls.close = modal.querySelector('.tc-close');
    modalChart = createChart(modal.querySelector('#tc-wrap'), { big: true, tooltip: true });
    mEls.close.addEventListener('click', closeDetails);
    modal.addEventListener('click', function (e) { if (e.target === modal) closeDetails(); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && modal && !modal.classList.contains('hidden')) { e.stopPropagation(); closeDetails(); }
    }, true);
  }

  function fillModal() {
    if (!modal) return;
    mEls.title.textContent = 'Desempenho de @' + curHandle;
    if (!model) {
      ['w', 'l', 's', 't', 'bs'].forEach(function (k) { mEls[k].textContent = '0'; });
      mEls.r.textContent = '\u2014'; mEls.cs.textContent = '\u2014';
      mEls.note.textContent = loadError || (loading ? 'Carregando…' : '');
      return;
    }
    var m = model, total = m.wins + m.losses, bal = m.wins - m.losses;
    mEls.w.textContent = m.wins;
    mEls.l.textContent = m.losses;
    mEls.r.textContent = total ? Math.round(m.wins / total * 100) + '%' : '\u2014';
    mEls.s.textContent = (bal > 0 ? '+' : '') + bal;
    mEls.t.textContent = total;
    mEls.cs.textContent = m.n ? m.curStreak + (m.curWin ? 'V' : 'D') : '\u2014';
    mEls.bs.textContent = m.bestStreak;
    var msg = '';
    if (!m.n && m.prior > 0) msg = 'Essas partidas foram contadas antes do histórico existir. O gráfico começa a partir das próximas.';
    else if (!m.n) msg = 'Ainda sem partidas registradas.';
    else {
      msg = 'Cada vela agrupa ' + (m.size === 1 ? '1 partida' : m.size + ' partidas') + '. Verde = saldo subiu, vermelho = caiu.';
      if (m.prior > 0) msg += ' ' + m.prior + ' partida' + (m.prior > 1 ? 's' : '') + ' antiga' + (m.prior > 1 ? 's' : '') + ' sem detalhes entram como saldo inicial.';
    }
    mEls.note.textContent = msg;
  }

  function openDetails() {
    if (!/^[a-z0-9_]{3,16}$/.test(curHandle)) return;
    buildModal();
    fillModal();
    modal.classList.remove('hidden');
    modalChart.reset(); modalChart.fit(); modalChart.draw();
    mEls.close.focus();
  }
  function closeDetails() {
    if (!modal) return;
    modal.classList.add('hidden');
    var h = document.getElementById('sp-chart');
    if (h && h.offsetParent) h.focus();
  }

  // ---- carregar dados (chamado pelo social.js toda vez que o perfil é desenhado) ----
  function inline(handle) {
    if (!setupInline()) return;
    handle = String(handle || '').toLowerCase().replace(/^@/, '');
    var valid = /^[a-z0-9_]{3,16}$/.test(handle);
    if (!valid) {                                   // convidado / sem @: linha reta
      curHandle = ''; model = null; level = 0; loadedAt = 0; loading = false; loadError = ''; reqId++;
      redrawAll(); return;
    }
    if (handle === curHandle && (loading || Date.now() - loadedAt < STALE_MS)) return;
    if (handle !== curHandle) { model = null; level = 0; loadError = ''; redrawAll(); }
    curHandle = handle; loading = true;
    var id = ++reqId;
    fetch(RESOLVED_BACKEND_URL + '/api/profile/' + encodeURIComponent(handle) + '/history')
      .then(function (r) { return r.json(); })
      .then(function (r) {
        if (id !== reqId) return;
        loading = false;
        if (!r || !r.ok) { loadError = (r && r.error) || 'Não foi possível carregar o gráfico.'; fillModal(); return; }
        loadError = ''; loadedAt = Date.now();
        model = compute(r.history || [], +r.wins || 0, +r.losses || 0);
        level = model.wins - model.losses;
        redrawAll(); fillModal();
      })
      .catch(function () {
        if (id !== reqId) return;
        loading = false; loadError = 'Servidor indisponível. Tente de novo em instantes.'; fillModal();
      });
  }

  window.TruChart = { inline: inline };
})();
