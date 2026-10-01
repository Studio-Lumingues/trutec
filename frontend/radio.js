// ============================================================================
// RÁDIO DA SALA (SoundCloud)
// O admin usa `auth musica <link>` no terminal; o servidor manda 'room_music'
// pra todo mundo da sala e este arquivo toca a faixa com o player oficial
// (widget) do SoundCloud, escondido. O "player" que aparece é a CAPA da música
// (canto inferior esquerdo): clicar nela pausa/retoma só no seu aparelho, e
// também libera o som se o navegador tiver bloqueado o autoplay.
// O volume segue o controle "Música" das Configurações.
// ============================================================================
(function () {
  var API_SRC = 'https://w.soundcloud.com/player/api.js';

  var iframe = null, widget = null, ready = false;
  var curUrl = null, pendingOffset = 0, apiLoading = false, apiCbs = [];
  var playTimer = null;

  function loadApi(cb) {
    if (window.SC && SC.Widget) return cb();
    apiCbs.push(cb);
    if (apiLoading) return;
    apiLoading = true;
    var s = document.createElement('script');
    s.src = API_SRC;
    s.onload = function () { var l = apiCbs; apiCbs = []; l.forEach(function (f) { f(); }); };
    s.onerror = function () { apiLoading = false; apiCbs = []; };
    document.head.appendChild(s);
  }

  function volume() {
    if (!window.GameAudio) return 100;
    if (GameAudio.isMuted && GameAudio.isMuted()) return 0;
    return Math.round(GameAudio.getMusicLevel() * 100);
  }
  function applyVolume() { if (widget && ready) try { widget.setVolume(volume()); } catch (e) {} }

  // mexeu no volume/mudo nas Configurações? acompanha
  function hookAudio() {
    if (!window.GameAudio || GameAudio.__radioHooked) return;
    GameAudio.__radioHooked = true;
    ['setMusicLevel', 'toggleMute'].forEach(function (fn) {
      var orig = GameAudio[fn];
      if (typeof orig !== 'function') return;
      GameAudio[fn] = function () { var r = orig.apply(this, arguments); applyVolume(); return r; };
    });
  }

  // ---- player = capa da música ----
  // A capa (artwork do SoundCloud) é o próprio player: clicar nela pausa/retoma
  // SÓ no seu aparelho (os outros continuam ouvindo). Ao lado: título e artista
  // (se forem compridos, quebram de linha pra caber no canto).
  function css() {
    if (document.getElementById('radio-css')) return;
    var st = document.createElement('style');
    st.id = 'radio-css';
    st.textContent =
      '.radio-card{position:fixed;left:.75rem;bottom:.75rem;z-index:9000;display:flex;align-items:center;gap:.65rem;' +
      'width:max-content;max-width:min(20rem,calc(100vw - 1.5rem));box-sizing:border-box;padding:.4rem .9rem .4rem .4rem;border-radius:.9rem;background:rgba(0,0,0,.62);color:#fff;' +
      'font:600 .78rem/1.25 system-ui,sans-serif;border:1px solid rgba(255,255,255,.15);backdrop-filter:blur(6px);' +
      'box-shadow:0 .5rem 1.4rem rgba(0,0,0,.45)}' +
      '.radio-card[hidden]{display:none}' +
      '.radio-cover{position:relative;flex:none;width:4.5rem;height:4.5rem;padding:0;border:0;border-radius:.6rem;overflow:hidden;' +
      'cursor:pointer;background:#222 center/cover no-repeat;box-shadow:0 0 0 1px rgba(255,255,255,.18)}' +
      '.radio-cover:focus-visible{outline:2px solid #ff7700;outline-offset:2px}' +
      '.radio-cover .rc-ov{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:1.7rem;' +
      'background:rgba(0,0,0,.45);opacity:0;transition:opacity .15s}' +
      '.radio-cover:hover .rc-ov,.radio-cover.paused .rc-ov,.radio-cover.tap .rc-ov{opacity:1}' +
      '.radio-cover.tap{animation:rcPulse 1.2s ease-in-out infinite}' +
      '@keyframes rcPulse{50%{box-shadow:0 0 0 .3rem rgba(255,119,0,.65)}}' +
      '.radio-info{min-width:0;display:flex;flex-direction:column;gap:.1rem}' +
      // nome comprido: quebra de linha (até 3 linhas no título e 2 no artista; o resto vira "...")
      '.radio-info .ri-t,.radio-info .ri-a{overflow:hidden;overflow-wrap:anywhere;word-break:break-word;display:-webkit-box;-webkit-box-orient:vertical}' +
      '.radio-info .ri-t{font-weight:700;font-size:.85rem;-webkit-line-clamp:3;line-clamp:3}' +
      '.radio-info .ri-a{opacity:.75;font-weight:500;-webkit-line-clamp:2;line-clamp:2}' +
      '@media (prefers-reduced-motion: reduce){.radio-cover.tap{animation:none}}';
    document.head.appendChild(st);
  }

  var card = null, coverBtn = null, ovEl = null, titleEl = null, artistEl = null;
  function buildCard() {
    css();
    card = document.createElement('div');
    card.className = 'radio-card';
    card.innerHTML =
      '<button type="button" class="radio-cover" aria-label="Pausar ou retomar a música (só pra você)"><span class="rc-ov">❚❚</span></button>' +
      '<div class="radio-info"><div class="ri-t"><span></span></div><div class="ri-a"><span></span></div></div>';
    coverBtn = card.querySelector('.radio-cover');
    ovEl = card.querySelector('.rc-ov');
    titleEl = card.querySelector('.ri-t');
    artistEl = card.querySelector('.ri-a');
    coverBtn.addEventListener('click', function () {
      if (!widget || !ready) return;
      try { widget.isPaused(function (p) { if (p) widget.play(); else widget.pause(); }); } catch (e) {}
    });
    document.body.appendChild(card);
  }
  function setText(box, text) {
    var inner = box.firstChild;
    if (inner.textContent !== text) inner.textContent = text;
  }
  // info = { title, artist, cover }; mode: '' | 'tap' (autoplay barrado)
  function showCard(info, mode) {
    if (!card) buildCard();
    card.hidden = false;
    info = info || {};
    if (info.title !== undefined) setText(titleEl, info.title);
    if (info.artist !== undefined) setText(artistEl, info.artist);
    if (info.cover) coverBtn.style.backgroundImage = 'url("' + String(info.cover).replace(/["\\()\s]/g, encodeURIComponent) + '")';
    coverBtn.classList.toggle('tap', mode === 'tap');
    if (mode === 'tap') { ovEl.textContent = '▶'; setText(artistEl, 'Toque na capa pra ouvir'); }
  }
  function setPaused(p) {
    if (!coverBtn) return;
    coverBtn.classList.toggle('paused', !!p);
    coverBtn.classList.remove('tap');
    ovEl.textContent = p ? '▶' : '❚❚';
  }
  function hideCard() { if (card) card.hidden = true; }

  function destroy() {
    clearTimeout(playTimer);
    if (widget && ready) try { widget.pause(); } catch (e) {}
    if (iframe && iframe.parentNode) iframe.parentNode.removeChild(iframe);
    iframe = widget = null; ready = false; curUrl = null;
    hideCard();
    if (window.GameAudio && GameAudio.setRadio) GameAudio.setRadio(false);
  }

  function updateTitle() {
    if (!widget) return;
    try {
      widget.getCurrentSound(function (snd) {
        if (!snd) return;
        var art = snd.artwork_url || (snd.user && snd.user.avatar_url) || '';
        art = art.replace('-large.', '-t500x500.');   // capa em boa resolução
        showCard({
          title: snd.title || 'SoundCloud',
          artist: snd.user && snd.user.username ? snd.user.username : '',
          cover: art
        }, '');
      });
    } catch (e) {}
  }

  function start(url, offsetMs) {
    if (url === curUrl && iframe) return;       // já tocando essa (ex.: reconexão)
    destroy();
    curUrl = url;
    pendingOffset = Math.max(0, offsetMs || 0);
    hookAudio();
    loadApi(function () {
      if (curUrl !== url) return;               // chegou um stop/outra faixa enquanto carregava
      iframe = document.createElement('iframe');
      iframe.setAttribute('allow', 'autoplay');
      iframe.setAttribute('aria-hidden', 'true');
      iframe.tabIndex = -1;
      iframe.style.cssText = 'position:fixed;left:-9999px;top:0;width:1px;height:1px;opacity:0;border:0;pointer-events:none';
      iframe.src = 'https://w.soundcloud.com/player/?url=' + encodeURIComponent(url) +
        '&auto_play=false&hide_related=true&show_comments=false&show_user=false&show_reposts=false&visual=false';
      document.body.appendChild(iframe);
      widget = SC.Widget(iframe);
      var E = SC.Widget.Events;
      widget.bind(E.READY, function () {
        ready = true;
        applyVolume();
        if (window.GameAudio && GameAudio.setRadio) GameAudio.setRadio(true);
        showCard({ title: 'Carregando música…', artist: ''}, '');
        updateTitle();
        widget.play();
        // se o navegador barrou o autoplay, a plaquinha vira botão "toque pra ouvir"
        playTimer = setTimeout(function () {
          if (!widget) return;
          widget.isPaused(function (p) { if (p) showCard({}, 'tap'); });
        }, 2500);
      });
      widget.bind(E.PLAY, function () {
        clearTimeout(playTimer); applyVolume(); updateTitle(); setPaused(false);
        // quem entra com a música já rolando: pula pro ponto certo (o seek só pega depois que começa a tocar)
        if (pendingOffset > 1500) { var o = pendingOffset; pendingOffset = 0; try { widget.seekTo(o); } catch (e) {} }
        else pendingOffset = 0;
      });
      widget.bind(E.PAUSE, function () { setPaused(true); });
      widget.bind(E.FINISH, function () { hideCard(); if (window.GameAudio && GameAudio.setRadio) GameAudio.setRadio(false); });
      widget.bind(E.ERROR, function () { showCard({ title: 'Não deu pra tocar essa música', artist: ''}, ''); if (window.GameAudio && GameAudio.setRadio) GameAudio.setRadio(false); });
    });
  }

  window.TruRadio = {
    handle: function (m) {
      if (!m) return;
      if (m.action === 'stop') return destroy();
      if (m.action === 'play' && typeof m.url === 'string') start(m.url, m.offsetMs);
    },
    stop: destroy
  };
})();
