// ============================================================================
// GRÁFICO DE DESEMPENHO NO PERFIL (estilo gráfico de velas), já exibido na tela
// do perfil, no lugar de Vitórias / Derrotas / Aproveitamento.
// TruChart.inline('arroba') carrega e desenha o gráfico dentro de #sp-chart.
// Cada vela agrupa algumas partidas: verde = saldo subiu, vermelho = caiu.
// Duas médias móveis (azul e amarela) mostram a tendência. Passe o mouse/dedo pra ver detalhes.
// Sem partidas registradas, mostra uma linha reta (saldo parado).
// Dados: GET /api/profile/:handle/history.
// ============================================================================
(function () {
  var PAD = { l: 10, r: 40, t: 12, b: 22 };
  var STALE_MS = 30000;

  var css = document.createElement('style');
  css.textContent =
    '.sp-chart{position:relative;width:100%;max-width:30rem;height:12rem;margin:1rem 0 .3rem;border-radius:.8rem;background:rgba(255,248,240,.05);overflow:hidden;touch-action:pan-y}' +
    '.sp-chart canvas{position:absolute;inset:0;width:100%;height:100%;display:block}' +
    '.tc-tip{position:absolute;pointer-events:none;z-index:2;padding:.45rem .6rem;border-radius:.5rem;background:rgba(15,15,15,.95);border:1px solid rgba(255,248,240,.25);font-size:.85rem;line-height:1.35;white-space:nowrap;display:none}' +
    '.tc-note{font-size:.8rem;opacity:.6;margin:0 0 1rem;max-width:30rem;min-height:1.1em}' +
    '.tc-note:empty{display:none}';
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
    return { candles: candles, ma1: ma(3), ma2: ma(7), base: base, size: size, n: n, wins: wins, losses: losses, prior: (w0 + l0) };
  }

  // ---- instância (um gráfico dentro do #sp-chart) ----
  var host = null, canvas, ctx, tip, noteEl, ro = null;
  var model = null, level = 0, hover = -1, W = 0, H = 0, dpr = 1;
  var curHandle = null, loadedAt = 0, loading = false, reqId = 0;

  function setup() {
    host = document.getElementById('sp-chart');
    if (!host) return false;
    if (canvas && host.contains(canvas)) return true;
    host.innerHTML = '<canvas></canvas><div class="tc-tip"></div>';
    canvas = host.querySelector('canvas');
    tip = host.querySelector('.tc-tip');
    noteEl = document.getElementById('sp-chart-note');
    ctx = canvas.getContext('2d');
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerdown', onMove);
    canvas.addEventListener('pointerleave', function () { hover = -1; tip.style.display = 'none'; draw(); });
    if (window.ResizeObserver) {
      if (ro) ro.disconnect();
      ro = new ResizeObserver(function () { fit(); draw(); });
      ro.observe(host);
    } else {
      window.addEventListener('resize', function () { fit(); draw(); });
    }
    fit();
    return true;
  }

  function fit() {
    if (!host) return;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = host.clientWidth; H = host.clientHeight;
    canvas.width = Math.max(1, Math.round(W * dpr));
    canvas.height = Math.max(1, Math.round(H * dpr));
  }

  // ---- desenho ----
  function draw() {
    if (!ctx || !W || !H) return;
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

    // grade + escala
    ctx.textAlign = 'left'; ctx.lineWidth = 1;
    var ticks = 4;
    for (var t = 0; t <= ticks; t++) {
      var v = lo + (hi - lo) * t / ticks, y = Y(v);
      ctx.strokeStyle = 'rgba(255,248,240,.07)';
      ctx.beginPath(); ctx.moveTo(PAD.l, y); ctx.lineTo(W - PAD.r, y); ctx.stroke();
      ctx.fillStyle = 'rgba(255,248,240,.4)';
      ctx.fillText((Math.round(v) > 0 ? '+' : '') + Math.round(v), W - PAD.r + 6, y + 4);
    }

    if (!cnt) {
      // linha reta: nada aconteceu ainda
      var y0 = Y(level);
      ctx.strokeStyle = 'rgba(255,248,240,.45)'; ctx.lineWidth = 2; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(PAD.l, y0); ctx.lineTo(W - PAD.r, y0); ctx.stroke();
      return;
    }

    // linha do zero
    if (lo < 0 && hi > 0) {
      ctx.strokeStyle = 'rgba(255,248,240,.25)'; ctx.setLineDash([4, 4]);
      ctx.beginPath(); ctx.moveTo(PAD.l, Y(0)); ctx.lineTo(W - PAD.r, Y(0)); ctx.stroke(); ctx.setLineDash([]);
    }
    // rótulos de partidas no eixo X
    ctx.fillStyle = 'rgba(255,248,240,.45)';
    ctx.textAlign = 'left'; ctx.fillText('#' + C[0].from, PAD.l, H - 6);
    ctx.textAlign = 'right'; ctx.fillText('#' + C[cnt - 1].to, W - PAD.r, H - 6);

    // velas
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

    // médias móveis
    function line(arr, color) {
      if (arr.length < 2) return;
      ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.lineJoin = 'round';
      ctx.beginPath();
      arr.forEach(function (v, i) { if (i) ctx.lineTo(X(i), Y(v)); else ctx.moveTo(X(i), Y(v)); });
      ctx.stroke();
    }
    line(model.ma2, '#e8e36a'); line(model.ma1, '#5fc8ff');

    // cruz do cursor
    if (hover >= 0 && hover < cnt) {
      ctx.strokeStyle = 'rgba(255,248,240,.35)'; ctx.lineWidth = 1; ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.moveTo(X(hover), PAD.t); ctx.lineTo(X(hover), H - PAD.b); ctx.stroke(); ctx.setLineDash([]);
    }
  }

  function onMove(e) {
    if (!model || !model.candles.length) return;
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

  function note(t) { if (noteEl) noteEl.textContent = t || ''; }

  // Chamado pelo social.js toda vez que o perfil é desenhado.
  function inline(handle) {
    if (!setup()) return;
    handle = String(handle || '').toLowerCase().replace(/^@/, '');
    var valid = /^[a-z0-9_]{3,16}$/.test(handle);
    if (!valid) {                                   // convidado / sem @: linha reta
      curHandle = ''; model = null; level = 0; hover = -1; loadedAt = 0; reqId++;
      note(''); fit(); draw(); return;
    }
    if (handle === curHandle && (loading || Date.now() - loadedAt < STALE_MS)) return;
    if (handle !== curHandle) { model = null; level = 0; hover = -1; note(''); tip.style.display = 'none'; fit(); draw(); }
    curHandle = handle; loading = true;
    var id = ++reqId;
    fetch(RESOLVED_BACKEND_URL + '/api/profile/' + encodeURIComponent(handle) + '/history')
      .then(function (r) { return r.json(); })
      .then(function (r) {
        if (id !== reqId) return;
        loading = false;
        if (!r || !r.ok) { note((r && r.error) || 'Não foi possível carregar o gráfico.'); return; }
        loadedAt = Date.now();
        model = compute(r.history || [], +r.wins || 0, +r.losses || 0);
        level = model.wins - model.losses;
        var msg = '';
        if (model.n && model.prior > 0) msg = model.prior + ' partida' + (model.prior > 1 ? 's' : '') + ' antiga' + (model.prior > 1 ? 's' : '') + ' sem detalhes entram como saldo inicial.';
        else if (!model.n) msg = 'O gráfico ganha vida a partir das próximas partidas.';
        note(msg);
        fit(); draw();
      })
      .catch(function () {
        if (id !== reqId) return;
        loading = false;
        note('Servidor indisponível. Tente de novo em instantes.');
      });
  }

  window.TruChart = { inline: inline };
})();
