/* Monkey Coder desktop app (Electron).
   The game itself is the same index.html the browser version uses; this file
   only opens it in a window and keeps that window locked down. */
'use strict';

const path = require('path');
const { app, BrowserWindow, Menu, nativeTheme, shell } = require('electron');

const ROOT = path.join(__dirname, '..');
const INDEX = path.join(ROOT, 'index.html');

let win = null;

// Only one copy of the app: opening it again brings the existing window back.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.focus();
  });
  app.whenReady().then(start);
  app.on('window-all-closed', () => app.quit());
}

function start() {
  // No File/Edit/View menu: it only gets in the way for kids. The useful
  // shortcuts are handled in handleKeys() instead.
  Menu.setApplicationMenu(null);

  win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 800,
    minHeight: 560,
    title: 'Monkey Coder',
    icon: path.join(ROOT, 'build', 'icon.png'),
    // Match the page background (css/style.css) so there's no white flash.
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#1c1a20' : '#fff5e1',
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false
    }
  });

  win.once('ready-to-show', () => win.show());
  win.on('closed', () => { win = null; });

  lockDown(win.webContents);
  win.webContents.on('before-input-event', (event, input) => handleKeys(event, input));
  win.webContents.session.on('will-download', onDownload);

  win.loadFile(INDEX);
}

/** The app never needs to leave index.html: links to websites open in the
    normal browser, and nothing else is allowed. */
function lockDown(contents) {
  contents.setWindowOpenHandler(({ url }) => {
    openOutside(url);
    return { action: 'deny' };
  });
  contents.on('will-navigate', (event, url) => {
    if (url.split('#')[0] === contents.getURL().split('#')[0]) return;
    event.preventDefault();
    openOutside(url);
  });
  // The only browser permission the game uses is full screen.
  contents.session.setPermissionRequestHandler((wc, permission, callback) => {
    callback(permission === 'fullscreen');
  });
}

function openOutside(url) {
  if (/^https?:\/\//i.test(url)) shell.openExternal(url);
}

/** "Save to file" downloads a .monkey.json: ask where to put it, starting in
    the Documents folder. */
function onDownload(event, item) {
  item.setSaveDialogOptions({
    title: 'Save your game',
    defaultPath: path.join(app.getPath('documents'), item.getFilename()),
    filters: [
      { name: 'Monkey Coder game', extensions: ['json'] },
      { name: 'All files', extensions: ['*'] }
    ]
  });
}

function handleKeys(event, input) {
  if (input.type !== 'keyDown' || !win) return;
  const ctrl = input.control || input.meta;
  const contents = win.webContents;
  let handled = true;

  if (input.key === 'F11') {
    win.setFullScreen(!win.isFullScreen());
  } else if (ctrl && (input.key === '=' || input.key === '+')) {
    contents.setZoomLevel(Math.min(contents.getZoomLevel() + 0.5, 3));
  } else if (ctrl && input.key === '-') {
    contents.setZoomLevel(Math.max(contents.getZoomLevel() - 0.5, -3));
  } else if (ctrl && input.key === '0') {
    contents.setZoomLevel(0);
  } else if (!app.isPackaged && (input.key === 'F12' || (ctrl && input.shift && input.key.toLowerCase() === 'i'))) {
    contents.toggleDevTools(); // developer tools, only when run with `npm run app`
  } else {
    handled = false;
  }
  if (handled) event.preventDefault();
}
