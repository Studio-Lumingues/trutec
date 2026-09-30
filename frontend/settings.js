// ============================================================================
// CONFIGURAÇÕES (botão "Configurações" na tela inicial)
// - Volume da música e dos efeitos sonoros (SFX + falas de truco/seis/nove/doze)
// - Modo daltonismo (paleta segura + naipes com cores diferentes)
// Tudo fica salvo no localStorage; o volume em si é aplicado pelo audio.js.
// ============================================================================
(function () {
  var modal = document.getElementById('settings-modal');
  var openBtn = document.getElementById('btn-settings');
  if (!modal || !openBtn) return;

  var music = document.getElementById('set-music');
  var musicVal = document.getElementById('set-music-val');
  var sfx = document.getElementById('set-sfx');
  var sfxVal = document.getElementById('set-sfx-val');
  var cb = document.getElementById('set-colorblind');
  var closeBtn = document.getElementById('settings-close');

  function pct(v) { return Math.round(v * 100); }
  function paintSlider(input, label) {
    var v = +input.value;
    label.textContent = v + '%';
    input.style.setProperty('--fill', v + '%');
  }

  function syncFromState() {
    if (window.GameAudio) {
      music.value = pct(GameAudio.getMusicLevel());
      sfx.value = pct(GameAudio.getSfxLevel());
    }
    cb.checked = document.documentElement.classList.contains('colorblind');
    paintSlider(music, musicVal);
    paintSlider(sfx, sfxVal);
  }

  function open() { syncFromState(); modal.classList.remove('hidden'); closeBtn.focus(); }
  function close() { modal.classList.add('hidden'); if (openBtn.offsetParent) openBtn.focus(); }

  openBtn.addEventListener('click', open);
  closeBtn.addEventListener('click', close);
  modal.addEventListener('click', function (e) { if (e.target === modal) close(); });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !modal.classList.contains('hidden')) close();
  });

  music.addEventListener('input', function () {
    paintSlider(music, musicVal);
    if (window.GameAudio) GameAudio.setMusicLevel(music.value / 100);
  });

  sfx.addEventListener('input', function () {
    paintSlider(sfx, sfxVal);
    if (window.GameAudio) GameAudio.setSfxLevel(sfx.value / 100);
  });
  // ao soltar o controle, toca um "tick" pra a pessoa ouvir o volume escolhido
  sfx.addEventListener('change', function () {
    if (window.GameAudio) GameAudio.click();
  });

  cb.addEventListener('change', function () {
    document.documentElement.classList.toggle('colorblind', cb.checked);
    try { localStorage.setItem('trutec-colorblind', cb.checked ? '1' : '0'); } catch (e) {}
  });

  window.openSettings = open;
  syncFromState();
})();
