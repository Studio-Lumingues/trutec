// App desktop do Trutec: uma janela que abre o site publicado na Vercel.
const { app, BrowserWindow, shell, Menu } = require('electron');

const SITE_URL = 'https://SEU-SITE.vercel.app'; // >>> TROQUE pela URL do seu site

// deixa a música (SoundCloud) tocar sem exigir clique
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

if (!app.requestSingleInstanceLock()) app.quit();

let win = null;

const OFFLINE_HTML = 'data:text/html;charset=utf-8,' + encodeURIComponent(
  '<body style="margin:0;display:flex;height:100vh;align-items:center;justify-content:center;' +
  'background:#1b1230;color:#fff;font:600 1.1rem system-ui,sans-serif;text-align:center">' +
  '<div>Sem conexão com o jogo.<br><small style="opacity:.7">Tentando de novo...</small></div></body>');

function create() {
  win = new BrowserWindow({
    width: 1280, height: 800, minWidth: 800, minHeight: 560,
    backgroundColor: '#1b1230',
    autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true }
  });
  Menu.setApplicationMenu(null);

  // o site detecta o app por esse trecho no user-agent (esconde o popup de download)
  win.webContents.setUserAgent(win.webContents.getUserAgent() + ' TrutecDesktop');

  // links externos abrem no navegador do sistema, não dentro do jogo
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  // sem internet / Render ou Vercel fora: mostra aviso e tenta de novo
  win.webContents.on('did-fail-load', (_e, code, _d, _u, isMainFrame) => {
    if (!isMainFrame || code === -3) return;
    win.loadURL(OFFLINE_HTML);
    setTimeout(() => { if (win) win.loadURL(SITE_URL); }, 5000);
  });

  win.loadURL(SITE_URL);
}

app.whenReady().then(create);
app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
app.on('window-all-closed', () => app.quit());
