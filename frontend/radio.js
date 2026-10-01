// ============================================================================
// RÁDIO DA SALA (SoundCloud)
// O admin usa `auth musica <link>` no terminal; o servidor manda 'room_music'
// pra todo mundo da sala e este arquivo toca a faixa com o player oficial
// (widget) do SoundCloud, escondido. Aparece só uma plaquinha com o título e
// o link pro SoundCloud (clicar nela também libera o som se o navegador bloquear).
// O volume segue o controle "Música" das Configurações.
// ============================================================================
(function () {
  var API_SRC = 'https://w.soundcloud.com/player/api.js';

  var iframe = null, widget = null, ready = false;
  var curUrl = null, pendingOffset = 0, apiLoading = false, apiCbs = [];
  var pill = null, playTimer = null;

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

  // ---- plaquinha "Tocando: ..." ----
  function css() {
    if (document.getElementById('radio-css')) return;
    var st = document.createElement('style');
    st.id = 'radio-css';
    st.textContent =
      '.radio-pill{position:fixed;left:.75rem;bottom:.75rem;z-index:9000;max-width:min(18rem,70vw);display:flex;align-items:center;gap:.5rem;' +
      'padding:.35rem .7rem;border-radius:999px;background:rgba(0,0,0,.6);color:#fff;font:600 .75rem/1.2 system-ui,sans-serif;' +
      'border:1px solid rgba(255,255,255,.15);text-decoration:none;backdrop-filter:blur(4px)}' +
      '.radio-pill[hidden]{display:none}' +
      '.radio-pill .rp-t{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
      '.radio-pill .rp-i{flex:none;color:#ff7700}' +
      '.radio-pill.rp-tap{outline:2px solid #ff7700;cursor:pointer}';
    document.head.appendChild(st);
  }
  function showPill(text, href, tap) {
    css();
    if (!pill) {
      pill = document.createElement('a');
      pill.className = 'radio-pill';
      pill.target = '_blank';
      pill.rel = 'noopener noreferrer';
      pill.innerHTML = '<span class="rp-i">♪</span><span class="rp-t"></span>';
      pill.addEventListener('click', function (e) {
        if (pill.classList.contains('rp-tap')) { e.preventDefault(); if (widget) try { widget.play(); } catch (x) {} }
      });
      document.body.appendChild(pill);
    }
    pill.hidden = false;
    pill.classList.toggle('rp-tap', !!tap);
    pill.querySelector('.rp-t').textContent = text;
    if (href) pill.href = href; else pill.removeAttribute('href');
  }
  function hidePill() { if (pill) pill.hidden = true; }

  function destroy() {
    clearTimeout(playTimer);
    if (widget && ready) try { widget.pause(); } catch (e) {}
    if (iframe && iframe.parentNode) iframe.parentNode.removeChild(iframe);
    iframe = widget = null; ready = false; curUrl = null;
    hidePill();
    if (window.GameAudio && GameAudio.setRadio) GameAudio.setRadio(false);
  }

  function updateTitle() {
    if (!widget) return;
    try {
      widget.getCurrentSound(function (s) {
        if (!s) return;
        var t = (s.user && s.user.username ? s.user.username + ' — ' : '') + (s.title || 'SoundCloud');
        showPill(t, s.permalink_url || curUrl, false);
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
        showPill('Carregando música…', url, false);
        updateTitle();
        widget.play();
        // se o navegador barrou o autoplay, a plaquinha vira botão "toque pra ouvir"
        playTimer = setTimeout(function () {
          if (!widget) return;
          widget.isPaused(function (p) { if (p) showPill('♪ Toque aqui pra ouvir a música da sala', url, true); });
        }, 2500);
      });
      widget.bind(E.PLAY, function () {
        clearTimeout(playTimer); applyVolume(); updateTitle();
        // quem entra com a música já rolando: pula pro ponto certo (o seek só pega depois que começa a tocar)
        if (pendingOffset > 1500) { var o = pendingOffset; pendingOffset = 0; try { widget.seekTo(o); } catch (e) {} }
        else pendingOffset = 0;
      });
      widget.bind(E.FINISH, function () { hidePill(); if (window.GameAudio && GameAudio.setRadio) GameAudio.setRadio(false); });
      widget.bind(E.ERROR, function () { showPill('Não deu pra tocar essa música', url, false); if (window.GameAudio && GameAudio.setRadio) GameAudio.setRadio(false); });
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
