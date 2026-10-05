// ============================================================================
// GRÁFICO DE DESEMPENHO DO PERFIL (estilo gráfico de velas)
// - No perfil (#sp-chart) começa FECHADO (só a barra "Desempenho"): clicar na barra abre/fecha o gráfico;
//   o botão ⤢ expande numa janela grande.
// - Sem partidas: linha reta. Com partidas: velas + médias móveis.
// - O botão expandir abre uma janela com mais detalhes (vitórias, derrotas, aproveitamento,
//   saldo, sequências e o gráfico maior com informações ao passar o mouse/dedo).
// TruChart.inline('arroba') é chamado pelo social.js sempre que o perfil é desenhado.
// Dados: GET /api/profile/:handle/history.
// ============================================================================
(function () {
  var STALE_MS = 30000;

  var css = document.createElement('style');
  css.textContent =
    '.sp-chart{position:relative;flex:none;width:100%;max-width:30rem;margin:.7rem 0 .9rem;border-radius:.95rem;' +
      'background:radial-gradient(120% 150% at 0% 0%,rgba(167,139,250,.16),transparent 55%),linear-gradient(180deg,rgba(255,248,240,.065),rgba(255,248,240,.02));' +
      'border:1px solid rgba(255,248,240,.1);box-shadow:inset 0 1px 0 rgba(255,248,240,.07),0 .5rem 1.2rem rgba(0,0,0,.25);' +
      'overflow:hidden;transition:border-color .2s}' +
    '.sp-chart.open{border-color:rgba(167,139,250,.35)}' +
    '.sp-chart canvas,.tc-wrap canvas{position:absolute;inset:0;width:100%;height:100%;display:block}' +
    '.tc-bar{display:flex;align-items:stretch}' +
    '.tc-toggle,.tc-max{border:0;background:transparent;color:inherit;font:inherit;cursor:pointer;display:flex;align-items:center;transition:background .15s}' +
    '.tc-toggle{flex:1;gap:.5rem;padding:.65rem .9rem;text-align:left;font-size:.8rem;letter-spacing:.06em;text-transform:uppercase}' +
    '.tc-toggle i{font-style:normal;font-size:.9rem;opacity:.7;margin-left:auto;transition:transform .25s}' +
    '.sp-chart.open .tc-toggle i{transform:rotate(180deg)}' +
    '.tc-max{padding:0 .9rem;font-size:1.05rem;opacity:.75;border-left:1px solid rgba(255,248,240,.08)}' +
    '.tc-toggle:hover,.tc-max:hover{background:rgba(255,248,240,.07)}.tc-max:hover{opacity:1}' +
    '.tc-toggle:focus-visible,.tc-max:focus-visible{outline:2px solid rgba(255,248,240,.7);outline-offset:-2px}' +
    '.tc-body{display:grid;grid-template-rows:0fr;transition:grid-template-rows .4s cubic-bezier(.22,.8,.26,1)}' +
    '.tc-plot{opacity:0;transition:opacity .2s ease}.sp-chart.open .tc-plot{opacity:1;transition:opacity .35s ease .12s}' +
    '.sp-chart.open .tc-body{grid-template-rows:1fr}' +
    '.tc-clip{min-height:0;overflow:hidden}' +
    '.tc-plot{position:relative;height:clamp(6.5rem,18dvh,8.5rem);touch-action:pan-y}' +
    '@media (prefers-reduced-motion:reduce){.tc-body,.tc-toggle i,.tc-plot{transition:none!important}}' +
    '.tc-tip{position:absolute;pointer-events:none;z-index:2;padding:.5rem .7rem;border-radius:.65rem;background:rgba(14,12,22,.94);border:1px solid rgba(167,139,250,.35);' +
      'box-shadow:0 .5rem 1.2rem rgba(0,0,0,.5);font-size:.85rem;line-height:1.4;white-space:nowrap;display:none}' +
    '.tc-card{width:min(46rem,94vw);max-height:92dvh;overflow:auto}' +
    '.tc-stats{display:grid;grid-template-columns:repeat(4,1fr);gap:.5rem;margin:.6rem 0}' +
    '.tc-stat{background:linear-gradient(180deg,rgba(255,248,240,.09),rgba(255,248,240,.04));border:1px solid rgba(255,248,240,.08);border-radius:.8rem;padding:.6rem .2rem;text-align:center}' +
    '.tc-stat b{display:block;font-size:1.4rem;font-weight:400}' +
    '.tc-stat span{font-size:.75rem;opacity:.7}' +
    '.tc-extra{display:grid;grid-template-columns:repeat(3,1fr);gap:.5rem;margin:0 0 .6rem}' +
    '.tc-legend{display:flex;gap:.5rem;justify-content:center;flex-wrap:wrap;font-size:.78rem;margin:.2rem 0 .6rem}' +
    '.tc-legend span{display:inline-flex;align-items:center;padding:.22rem .7rem;border-radius:999px;background:rgba(255,248,240,.07);border:1px solid rgba(255,248,240,.08)}' +
    '.tc-legend i{display:inline-block;width:.8rem;height:.25rem;border-radius:2px;margin-right:.4rem}' +
    '.tc-wrap{position:relative;height:min(20rem,46dvh);margin:.2rem 0 .6rem;border-radius:.9rem;' +
      'background:radial-gradient(120% 140% at 0% 0%,rgba(167,139,250,.12),transparent 55%),rgba(0,0,0,.4);border:1px solid rgba(255,248,240,.12);touch-action:pan-y}' +
    '.tc-note{font-size:.85rem;opacity:.7;margin:0 0 .8rem;text-align:center;min-height:1.1em}';
  document.head.appendChild(css);


  // ---- MODO TESTE: ?chartdemo=1 na URL mostra um histórico de exemplo (só na sua tela) ----
  var DEMO = /[?&]chartdemo=1/.test(location.search);
  function demoHistory() {
    var seed = 7, out = [], bal = 0;
    function rnd() { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }
    for (var i = 0; i < 48; i++) {
      var p = bal > 3 ? 0.4 : (bal < -3 ? 0.62 : 0.5);   // volta pro meio, dá cara de subidas e descidas
      var win = rnd() < p; out.push(win); bal += win ? 1 : -1;
    }
    return out;
  }

  function colors() {
    var cb = document.documentElement.classList.contains('colorblind');
    return { up: cb ? '#4da3ff' : '#3ddc84', down: cb ? '#ffb020' : '#ff4d5e', accent: cb ? '#56B4E9' : '#a78bfa' };
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
    var PAD = opts.big ? { l: 14, r: 52, t: 16, b: 26 } : { l: 14, r: 42, t: 30, b: 12 };
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

    function hexA(hex, a) {
      var n = parseInt(hex.slice(1), 16);
      return 'rgba(' + (n >> 16) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
    }
    function rr(x, y, w, h, r) {
      r = Math.min(r, w / 2, h / 2);
      ctx.beginPath(); ctx.moveTo(x + r, y);
      ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
    }
    // marcas do eixo sempre em números inteiros "redondos" (1, 2, 5, 10...)
    function niceTicks(lo, hi, n) {
      var raw = (hi - lo) / n, steps = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 5000], step = steps[steps.length - 1];
      for (var i = 0; i < steps.length; i++) if (steps[i] >= raw) { step = steps[i]; break; }
      var out = [];
      for (var v = Math.ceil(lo / step) * step; v <= hi; v += step) out.push(v);
      return out;
    }
    function fmt(v) { v = Math.round(v); return (v > 0 ? '+' : '') + v; }

    function draw() {
      if (!W || !H) return;
      var col = colors(), big = !!opts.big;
      var C = model ? model.candles : [], cnt = C.length;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      ctx.font = (big ? 12 : 11) + 'px Coolvetica, "Segoe UI", system-ui, sans-serif';

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
      var last = cnt ? C[cnt - 1].close : level;
      var lastColor = last > 0 ? col.up : (last < 0 ? col.down : col.accent);
      var yLast = Y(last);

      // grade + eixo (some o número que encostaria na etiqueta do saldo atual)
      ctx.textAlign = 'left'; ctx.lineWidth = 1;
      niceTicks(lo, hi, big ? 5 : 3).forEach(function (v) {
        var y = Y(v);
        ctx.strokeStyle = 'rgba(255,248,240,.06)';
        ctx.beginPath(); ctx.moveTo(PAD.l, y + .5); ctx.lineTo(W - PAD.r, y + .5); ctx.stroke();
        if (Math.abs(y - yLast) < 12) return;
        ctx.fillStyle = 'rgba(255,248,240,.38)';
        ctx.fillText(fmt(v), W - PAD.r + 8, y + 4);
      });
      if (lo < 0 && hi > 0) {   // linha do zero
        ctx.strokeStyle = 'rgba(255,248,240,.22)'; ctx.setLineDash([4, 5]);
        ctx.beginPath(); ctx.moveTo(PAD.l, Y(0) + .5); ctx.lineTo(W - PAD.r, Y(0) + .5); ctx.stroke(); ctx.setLineDash([]);
      }

      if (!cnt) {   // nada aconteceu ainda: linha reta elegante
        var lg = ctx.createLinearGradient(PAD.l, 0, W - PAD.r, 0);
        lg.addColorStop(0, hexA(col.accent, 0)); lg.addColorStop(.35, hexA(col.accent, .85)); lg.addColorStop(1, 'rgba(255,248,240,.95)');
        var ag = ctx.createLinearGradient(0, yLast, 0, H - PAD.b);
        ag.addColorStop(0, hexA(col.accent, .2)); ag.addColorStop(1, hexA(col.accent, 0));
        ctx.fillStyle = ag; ctx.fillRect(PAD.l, yLast, pw, H - PAD.b - yLast);
        ctx.strokeStyle = lg; ctx.lineWidth = 2.5; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(PAD.l, yLast); ctx.lineTo(W - PAD.r, yLast); ctx.stroke();
        ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(255,248,240,.4)';
        ctx.fillText('Sem partidas ainda', PAD.l + pw / 2, Math.min(H - PAD.b - 4, yLast + 20));
        // ponto brilhante no fim da linha
        ctx.save(); ctx.shadowColor = col.accent; ctx.shadowBlur = 12;
        ctx.fillStyle = '#fff8f0'; ctx.beginPath(); ctx.arc(W - PAD.r, yLast, 3.5, 0, Math.PI * 2); ctx.fill(); ctx.restore();
      } else {
        // rótulos do eixo X (só na janela grande)
        if (big) {
          ctx.fillStyle = 'rgba(255,248,240,.4)';
          ctx.textAlign = 'left'; ctx.fillText('#' + C[0].from, PAD.l, H - 8);
          ctx.textAlign = 'right'; ctx.fillText('#' + C[cnt - 1].to, W - PAD.r, H - 8);
        }
        // área suave sob a linha do saldo
        var base = Y(Math.max(lo, Math.min(0, hi)));
        var area = ctx.createLinearGradient(0, PAD.t, 0, H - PAD.b);
        area.addColorStop(0, hexA(col.accent, .22)); area.addColorStop(1, hexA(col.accent, 0));
        ctx.fillStyle = area;
        ctx.beginPath(); ctx.moveTo(X(0), H - PAD.b);
        C.forEach(function (c, i) { ctx.lineTo(X(i), Y(c.close)); });
        ctx.lineTo(X(cnt - 1), H - PAD.b); ctx.closePath(); ctx.fill();

        // velas arredondadas com degradê
        var bw = Math.max(3, Math.min(big ? 20 : 14, step * 0.6));
        C.forEach(function (c, i) {
          var up = c.close >= c.open, color = up ? col.up : col.down, x = X(i);
          ctx.strokeStyle = hexA(color, .9); ctx.lineWidth = 1.5; ctx.lineCap = 'round';
          ctx.beginPath(); ctx.moveTo(x, Y(c.high)); ctx.lineTo(x, Y(c.low)); ctx.stroke();
          var y1 = Y(Math.max(c.open, c.close)), y2 = Y(Math.min(c.open, c.close));
          var h = Math.max(3, y2 - y1);
          var g = ctx.createLinearGradient(0, y1, 0, y1 + h);
          g.addColorStop(0, hexA(color, 1)); g.addColorStop(1, hexA(color, .55));
          ctx.fillStyle = g;
          rr(x - bw / 2, y1, bw, h, Math.min(3, bw / 3)); ctx.fill();
        });

        // médias móveis suaves com leve brilho
        var line = function (arr, color) {
          if (arr.length < 2) return;
          ctx.save();
          ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
          ctx.shadowColor = color; ctx.shadowBlur = 6;
          ctx.beginPath(); ctx.moveTo(X(0), Y(arr[0]));
          for (var i = 1; i < arr.length; i++) {
            var mx = (X(i - 1) + X(i)) / 2, my = (Y(arr[i - 1]) + Y(arr[i])) / 2;
            ctx.quadraticCurveTo(X(i - 1), Y(arr[i - 1]), mx, my);
          }
          ctx.lineTo(X(arr.length - 1), Y(arr[arr.length - 1]));
          ctx.stroke(); ctx.restore();
        };
        line(model.ma2, '#e8e36a'); line(model.ma1, '#5fc8ff');

        if (hover >= 0 && hover < cnt) {
          ctx.strokeStyle = 'rgba(255,248,240,.3)'; ctx.lineWidth = 1; ctx.setLineDash([3, 4]);
          ctx.beginPath(); ctx.moveTo(X(hover), PAD.t); ctx.lineTo(X(hover), H - PAD.b); ctx.stroke(); ctx.setLineDash([]);
        }
      }

      // etiqueta do saldo atual no eixo da direita
      var tw = PAD.r - 8, th = 16;
      ctx.save();
      ctx.setLineDash([2, 4]); ctx.strokeStyle = hexA(lastColor, .45); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(PAD.l, Math.round(yLast) + .5); ctx.lineTo(W - PAD.r + 4, Math.round(yLast) + .5); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = lastColor; rr(W - PAD.r + 4, yLast - th / 2, tw, th, 8); ctx.fill();
      ctx.fillStyle = '#0a0a0a'; ctx.textAlign = 'center';
      ctx.font = '700 ' + (big ? 12 : 11) + 'px Coolvetica, "Segoe UI", system-ui, sans-serif';
      ctx.fillText(fmt(last), W - PAD.r + 4 + tw / 2, yLast + 4);
      ctx.restore();
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
  var toggleBtn = null, maxBtn = null;
  var wantOpen = false, swapT = 0;
  function applyOpen(host, open) {
    host.classList.toggle('open', open);
    toggleBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (open && inlineChart) { inlineChart.reset(); inlineChart.fit(); inlineChart.draw(); }
  }
  // a coleção (cards) some rapidinho, o layout dela troca escondido (esticada <-> normal) e ela reaparece suave
  function setOpen(host, open) {
    wantOpen = open;
    var col = document.getElementById('sp-collection-wrap');
    var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!col || col.hidden || reduced) { applyOpen(host, open); return; }
    col.classList.add('sp-swap');
    clearTimeout(swapT);
    swapT = setTimeout(function () {
      applyOpen(host, wantOpen);
      requestAnimationFrame(function () { requestAnimationFrame(function () { col.classList.remove('sp-swap'); }); });
    }, 150);
  }
  function setupInline() {
    var host = document.getElementById('sp-chart');
    if (!host) return false;
    if (inlineChart && host.contains(inlineChart.host.querySelector('canvas'))) return true;
    // começa FECHADO: só a barra "Desempenho" (abre/fecha) + botão de expandir (abre a janela grande)
    host.innerHTML =
      '<div class="tc-bar">' +
        '<button type="button" class="tc-toggle" aria-expanded="false"><span>Desempenho</span><i aria-hidden="true">\u25BE</i></button>' +
        '<button type="button" class="tc-max" aria-label="Expandir gráfico" title="Expandir">\u2922</button>' +
      '</div>' +
      '<div class="tc-body"><div class="tc-clip"><div class="tc-plot"></div></div></div>';
    host.classList.remove('open');
    host.setAttribute('role', 'group');
    host.removeAttribute('tabindex');
    host.setAttribute('aria-label', 'Gráfico de desempenho');
    toggleBtn = host.querySelector('.tc-toggle');
    maxBtn = host.querySelector('.tc-max');
    inlineChart = createChart(host.querySelector('.tc-plot'), { big: false, tooltip: false });
    wantOpen = false;
    toggleBtn.addEventListener('click', function () { setOpen(host, !wantOpen); });
    maxBtn.addEventListener('click', openDetails);
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
    if (DEMO) msg = 'MODO TESTE: dados de exemplo, não são partidas reais.';
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
    if (maxBtn && maxBtn.offsetParent) maxBtn.focus({ preventScroll: true });
  }

  // ---- carregar dados (chamado pelo social.js toda vez que o perfil é desenhado) ----
  function inline(handle) {
    if (!setupInline()) return;
    handle = String(handle || '').toLowerCase().replace(/^@/, '');
    var valid = /^[a-z0-9_]{3,16}$/.test(handle);
    if (!valid) {                                   // convidado / sem @: linha reta
      curHandle = ''; model = null; level = 0; loadedAt = 0; loading = false; loadError = ''; reqId++;
      if (DEMO) { var dh = demoHistory(), dw = dh.filter(Boolean).length; model = compute(dh, dw, dh.length - dw); level = model.wins - model.losses; }
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
        if (DEMO) {
          var dh = demoHistory(), dw = dh.filter(Boolean).length;
          model = compute(dh, dw, dh.length - dw);
        } else model = compute(r.history || [], +r.wins || 0, +r.losses || 0);
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
