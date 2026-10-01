// ============================================================================
// ESCOLHA NA PRIMEIRA VISITA: baixar o jogo (app desktop) ou jogar no navegador
// - Só aparece 1 vez (a escolha fica no localStorage).
// - Não aparece no celular (o app é só pra Windows/Mac/Linux) nem dentro do
//   próprio app (o desktop/main.js acrescenta "TrutecDesktop" ao user-agent).
// - Pra reabrir manualmente: window.openInstallPrompt()
// ============================================================================
(function () {
  // >>> TROQUE pelo seu repositório do GitHub (os instaladores ficam em Releases)
  var RELEASES = 'https://github.com/SEU_USUARIO/SEU_REPO/releases/latest/download/';
  var FILES = { win: 'Trutec-Setup.exe', mac: 'Trutec.dmg', linux: 'Trutec.AppImage' };
  var KEY = 'trutec-play-choice';

  var ua = navigator.userAgent || '';
  if (/TrutecDesktop/.test(ua)) return;                                   // já é o app
  if (/Android|iPhone|iPad|iPod/i.test(ua)) return;                       // celular
  if (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1) return;       // iPad "como Mac"

  var os = /Windows/.test(ua) ? 'win' : /Macintosh|Mac OS X/.test(ua) ? 'mac' : /Linux|X11/.test(ua) ? 'linux' : null;
  var osName = { win: 'Windows', mac: 'macOS', linux: 'Linux' }[os];

  function saved() { try { return localStorage.getItem(KEY); } catch (e) { return null; } }
  function save(v) { try { localStorage.setItem(KEY, v); } catch (e) {} }

  var box = null;

  function css() {
    if (document.getElementById('ip-css')) return;
    var st = document.createElement('style');
    st.id = 'ip-css';
    st.textContent =
      '.ip-back{position:fixed;inset:0;z-index:10000;display:flex;align-items:center;justify-content:center;padding:1rem;background:rgba(0,0,0,.65);backdrop-filter:blur(4px)}' +
      '.ip-back[hidden]{display:none}' +
      '.ip-card{width:min(26rem,100%);box-sizing:border-box;padding:1.4rem;border-radius:1rem;background:#1b1230;color:#fff;font:500 .95rem/1.4 system-ui,sans-serif;border:1px solid rgba(255,255,255,.15);box-shadow:0 1rem 3rem rgba(0,0,0,.6)}' +
      '.ip-card h2{margin:0 0 .4rem;font-size:1.25rem}' +
      '.ip-card p{margin:0 0 1rem;opacity:.8}' +
      '.ip-btn{display:block;width:100%;box-sizing:border-box;margin-top:.55rem;padding:.8rem 1rem;border-radius:.7rem;border:0;font:700 1rem system-ui,sans-serif;text-align:center;text-decoration:none;cursor:pointer}' +
      '.ip-main{background:#ff7700;color:#fff}' +
      '.ip-main small{display:block;font-weight:500;opacity:.85;font-size:.75rem}' +
      '.ip-alt{background:rgba(255,255,255,.1);color:#fff}' +
      '.ip-btn:focus-visible{outline:2px solid #fff;outline-offset:2px}';
    document.head.appendChild(st);
  }

  function close(choice) {
    if (choice) save(choice);
    if (box) box.hidden = true;
  }

  function open() {
    css();
    if (!box) {
      box = document.createElement('div');
      box.className = 'ip-back';
      box.setAttribute('role', 'dialog');
      box.setAttribute('aria-modal', 'true');
      var href = os ? RELEASES + FILES[os] : RELEASES;
      box.innerHTML =
        '<div class="ip-card">' +
          '<h2>Como você quer jogar?</h2>' +
          '<p>Recomendamos baixar o jogo: abre em janela própria, sem barra do navegador, e se atualiza sozinho.</p>' +
          '<a class="ip-btn ip-main" href="' + href + '" target="_blank" rel="noopener">' +
            'Baixar o jogo (recomendado)' + (osName ? '<small>Versão para ' + osName + '</small>' : '') +
          '</a>' +
          '<button type="button" class="ip-btn ip-alt">Jogar pelo navegador</button>' +
        '</div>';
      box.querySelector('.ip-main').addEventListener('click', function () { close('download'); });
      box.querySelector('.ip-alt').addEventListener('click', function () { close('browser'); });
      document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && box && !box.hidden) close('browser');
      });
      document.body.appendChild(box);
    }
    box.hidden = false;
    box.querySelector('.ip-main').focus();
  }

  window.openInstallPrompt = open;

  function init() { if (!saved()) open(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
