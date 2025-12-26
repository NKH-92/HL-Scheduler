const path = require('path');
const { app, BrowserWindow, Menu, shell } = require('electron');

const isDev = !app.isPackaged;
const devServerUrl = process.env.ELECTRON_RENDERER_URL;
const iconPath = path.join(__dirname, 'icon.ico');

const createMainWindow = async () => {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    icon: iconPath,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (process.platform !== 'darwin') {
    mainWindow.setMenuBarVisibility(false);
  }

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  if (isDev && devServerUrl) {
    await mainWindow.loadURL(devServerUrl);
  } else {
    await mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }
};

app.whenReady().then(async () => {
  if (process.platform !== 'darwin') {
    Menu.setApplicationMenu(null);
  }

  await createMainWindow();

  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createMainWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
