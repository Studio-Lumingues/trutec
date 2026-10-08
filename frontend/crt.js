// ============================================================================
// EFEITO CRT (TV de tubo) no jogo todo
// Cria o #crt-overlay (estilo em crt.css) e liga/desliga a classe .crt-on no <html>.
// A escolha fica salva no navegador (localStorage "trutec-crt").
//   TruCRT.set(false)  desliga      TruCRT.set(true)  liga      TruCRT.toggle()  alterna
// Atalho: Ctrl+Shift+C. Carregar depois dos outros scripts.
// ============================================================================
(function () {
  var KEY = 'trutec-crt';
  var root = document.documentElement;

  function saved() {
    try { return localStorage.getItem(KEY) !== '0'; } catch (e) { return true; }   // ligado por padrão
  }
  function apply(on) { root.classList.toggle('crt-on', !!on); }
  function set(on) {
    apply(on);
    try { localStorage.setItem(KEY, on ? '1' : '0'); } catch (e) {}
    return !!on;
  }
  function toggle() { return set(!root.classList.contains('crt-on')); }

  function build() {
    if (document.getElementById('crt-overlay')) return;
    var o = document.createElement('div');
    o.id = 'crt-overlay';
    o.setAttribute('aria-hidden', 'true');
    o.innerHTML = '<div class="crt-scan"></div><div class="crt-vig"></div><div class="crt-roll"></div><div class="crt-flick"></div>';
    document.body.appendChild(o);
  }

  apply(saved());                       // liga logo, antes de a página terminar de carregar
  window.TruCRT = { set: set, toggle: toggle, on: function () { return root.classList.contains('crt-on'); } };
  document.addEventListener('keydown', function (e) {
    if (e.ctrlKey && e.shiftKey && (e.key === 'C' || e.key === 'c')) { e.preventDefault(); toggle(); }
  });
  if (document.body) build(); else document.addEventListener('DOMContentLoaded', build);
})();
