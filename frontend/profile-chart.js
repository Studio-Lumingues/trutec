// ============================================================================
// GRÁFICO DE DESEMPENHO DO PERFIL (estilo gráfico de velas)
// TruChart.open('arroba') abre uma janela com o saldo de vitórias (vitórias - derrotas)
// ao longo das partidas. Cada vela agrupa algumas partidas: verde = subiu, vermelho = caiu.
// Duas médias móveis (azul e amarela) mostram a tendência. Passe o mouse/dedo pra ver detalhes.
// Dados: GET /api/profile/:handle/history. Partidas anteriores ao histórico entram como saldo inicial.
// ============================================================================
(function () {
  var modal, canvas, ctx, tip, titleEl, noteEl, wrapEl, closeBtn;
  var model = null, hover = -1, W = 0, H = 0, dpr = 1, curHandle = '', reqId = 0;
  var PAD = { l: 10, r: 46, t: 12, b: 24 };

  var css = document.createElement('style');
  css.textContent =
    '.tc-card{width:min(46rem,94vw);max-height:92dvh;overflow:auto}' +
    '.tc-wrap{position:relative;height:min(22rem,52dvh);margin:.4rem 0 .6rem;border-radius:.6rem;background:rgba(0,0,0,.35);border:1px solid rgba(255,248,240,.12);touch-action:pan-y}' +
    '.tc-wrap canvas{position:absolute;inset:0;width:100%;height:100%;display:block}' +
    '.tc-tip{position:absolute;pointer-events:none;z-index:2;padding:.45rem .6rem;border-radius:.5rem;background:rgba(15,15,15,.95);border:1px solid rgba(255,248,240,.25);font-size:.85rem;line-height:1.35;white-space:nowrap;display:none}' +
    '.tc-note{font-size:.85rem;opacity:.7;margin:0 0 .8rem;text-align:center;min-height:1.1em}' +
    '.tc-legend{display:flex;gap:1rem;justify-content:center;flex-wrap:wrap;font-size:.8rem;opacity:.85;margin:0 0 .8rem}' +
    '.tc-legend i{display:inline-block;width:.8rem;height:.25rem;border-radius:2px;margin-right:.35rem;vertical-align:middle}' +
    '.sp-chart-btn{display:block;width:100%;margin:-.4rem 0 1rem;padding:.55rem .8rem;border-radius:.7rem;border:1px solid rgba(255,248,240,.22);background:rgba(255,248,240,.07);color:inherit;font:inherit;font-size:.95rem;cursor:pointer}' +
    '.sp-chart-btn:hover{filter:brightness(1.2)}' +
    '.sp-stats.tc-click{cursor:pointer}';
  document.head.appendChild(css);

  function colors() {
    var cb = document.documentElement.classList.contains('colorblind');
    return { up: cb ? '#4da3ff' : '#3ddc84', down: cb ? '#ffb020' : '#ff4d5e' };
  }

  function build() {
    if (modal) return;
    modal = document.createElement('div');
    modal.className = 'settings-modal hidden';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', 'tc-title');
    modal.innerHTML =
      '<div class="settings-card tc-card">' +
        '<h2 id="tc-title">Desempenho</h2>' +
        '<div class="tc-legend"><span><i style="background:#5fc8ff"></i>Média curta</span><span><i style="background:#e8e36a"></i>Média longa</span></div>' +
        '<div class="tc-wrap"><canvas></canvas><div class="tc-tip"></div></div>' +
        '<p class="tc-note"></p>' +
        '<div class="modal-actions"><button type="button" class="btn btn-primary tc-close">Fechar</button></div>' +
      '</div>';
    document.body.appendChild(modal);
    titleEl = modal.querySelector('#tc-title');
    noteEl = modal.querySelector('.tc-note');
    wrapEl = modal.querySelector('.tc-wrap');
    canvas = modal.querySelector('canvas');
    tip = modal.querySelector('.tc-tip');
    ctx = canvas.getContext('2d');
    closeBtn = modal.querySelector('.tc-close');
    closeBtn.addEventListener('click', close);
    modal.addEventListener('click', function (e) { if (e.target === modal) close(); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !modal.classList.contains('hidden')) { e.stopPropagation(); close(); }
    }, true);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerdown', onMove);
    canvas.addEventListener('pointerleave', function () { hover = -1; tip.style.display = 'none'; draw(); });
    window.addEventListener('resize', function () { if (!modal.classList.contains('hidden')) { fit(); draw(); } });
  }

  function close() { if (modal) modal.classList.add('hidden'); reqId++; }

  function fit() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = wrapEl.clientWidth; H = wrapEl.clientHeight;
    canvas.width = Math.max(1, Math.round(W * dpr));
    canvas.height = Math.max(1, Math.round(H * dpr));
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

  // ---- desenho ----
  function draw() {
    if (!ctx || !model) return;
    var col = colors();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.font = '12px Coolvetica, "Segoe UI", system-ui, sans-serif';
    var C = model.candles, cnt = C.length;
    if (!cnt) {
      ctx.fillStyle = 'rgba(255,248,240,.6)';
      ctx.textAlign = 'center';
      if (model.prior > 0) {
        ctx.fillText('Histórico detalhado ainda vazio.', W / 2, H / 2 - 8);
        ctx.fillText(model.wins + 'V · ' + model.losses + 'D (' + model.prior + ' partida' + (model.prior > 1 ? 's' : '') + ' sem detalhes)', W / 2, H / 2 + 12);
      } else {
        ctx.fillText('Ainda sem partidas registradas.', W / 2, H / 2);
      }
      return;
    }
    var lo = Infinity, hi = -Infinity;
    C.forEach(function (c) { if (c.low < lo) lo = c.low; if (c.high > hi) hi = c.high; });
    var span = Math.max(4, hi - lo), mid = (hi + lo) / 2;
    lo = mid - span * 0.6; hi = mid + span * 0.6;
    var pw = W - PAD.l - PAD.r, ph = H - PAD.t - PAD.b;
    function Y(v) { return PAD.t + (1 - (v - lo) / (hi - lo)) * ph; }
    var step = pw / cnt;
    function X(i) { return PAD.l + step * (i + 0.5); }

    // grade + escala
    ctx.textAlign = 'left'; ctx.lineWidth = 1;
    var ticks = 5;
    for (var t = 0; t <= ticks; t++) {
      var v = lo + (hi - lo) * t / ticks, y = Y(v);
      ctx.strokeStyle = 'rgba(255,248,240,.08)';
      ctx.beginPath(); ctx.moveTo(PAD.l, y); ctx.lineTo(W - PAD.r, y); ctx.stroke();
      ctx.fillStyle = 'rgba(255,248,240,.55)';
      ctx.fillText((Math.round(v) > 0 ? '+' : '') + Math.round(v), W - PAD.r + 6, y + 4);
    }
    // linha do zero
    if (lo < 0 && hi > 0) {
      ctx.strokeStyle = 'rgba(255,248,240,.28)'; ctx.setLineDash([4, 4]);
      ctx.beginPath(); ctx.moveTo(PAD.l, Y(0)); ctx.lineTo(W - PAD.r, Y(0)); ctx.stroke(); ctx.setLineDash([]);
    }
    // rótulos de partidas no eixo X
    ctx.fillStyle = 'rgba(255,248,240,.55)';
    ctx.textAlign = 'left'; ctx.fillText('#' + C[0].from, PAD.l, H - 7);
    ctx.textAlign = 'right'; ctx.fillText('#' + C[cnt - 1].to, W - PAD.r, H - 7);

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
    var tx = r.width * 0 + PAD.l + step * (i + 0.5) + 14;
    if (tx + tip.offsetWidth > W - 4) tx = PAD.l + step * (i + 0.5) - 14 - tip.offsetWidth;
    tip.style.left = Math.max(4, tx) + 'px';
    tip.style.top = Math.max(4, Math.min(H - tip.offsetHeight - 4, (e.clientY - r.top) - tip.offsetHeight / 2)) + 'px';
    draw();
  }

  function open(handle) {
    handle = String(handle || '').toLowerCase().replace(/^@/, '');
    if (!/^[a-z0-9_]{3,16}$/.test(handle)) return;
    build();
    curHandle = handle; model = null; hover = -1;
    titleEl.textContent = 'Desempenho de @' + handle;
    noteEl.textContent = 'Carregando…';
    tip.style.display = 'none';
    modal.classList.remove('hidden');
    fit(); draw();
    closeBtn.focus();
    var id = ++reqId;
    fetch(RESOLVED_BACKEND_URL + '/api/profile/' + encodeURIComponent(handle) + '/history')
      .then(function (r) { return r.json(); })
      .then(function (r) {
        if (id !== reqId) return;
        if (!r || !r.ok) { noteEl.textContent = (r && r.error) || 'Não foi possível carregar o gráfico.'; return; }
        model = compute(r.history || [], +r.wins || 0, +r.losses || 0);
        fit();
        var msg = model.n
          ? 'Cada vela agrupa ' + (model.size === 1 ? '1 partida' : model.size + ' partidas') + '. Verde = saldo subiu, vermelho = caiu.'
          : (model.prior > 0
              ? 'Você já tem ' + model.wins + ' vitória(s) e ' + model.losses + ' derrota(s), mas elas foram contadas antes do histórico existir. O gráfico começa a partir das próximas partidas.'
              : 'Ainda sem partidas registradas. O gráfico aparece a partir das próximas partidas.');
        if (model.n && model.prior > 0) msg += ' ' + model.prior + ' partida' + (model.prior > 1 ? 's' : '') + ' antiga' + (model.prior > 1 ? 's' : '') + ' sem detalhes entram como saldo inicial.';
        noteEl.textContent = msg;
        draw();
      })
      .catch(function () { if (id === reqId) noteEl.textContent = 'Servidor indisponível. Tente de novo em instantes.'; });
  }

  window.TruChart = { open: open };

  // botão "Ver gráfico" na tela de perfil: usa o @ que o social.js escreveu em #sp-handle
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('#sp-chart-btn');
    if (!b) return;
    var he = document.getElementById('sp-handle');
    var h = he ? he.textContent : '';
    if (!h && window.TruAccount && TruAccount.profile && TruAccount.profile()) h = TruAccount.profile().handle;
    if (h) open(h);
  });
})();
