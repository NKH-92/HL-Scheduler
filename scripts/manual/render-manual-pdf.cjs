/* eslint-disable no-console */
const path = require('path');
const fs = require('fs/promises');
const { app, BrowserWindow } = require('electron');

const repoRoot = path.resolve(__dirname, '..', '..');
const manualHtmlPath = path.join(repoRoot, 'docs', 'user-manual', 'HL-Scheduler_UserManual_ko_v4.0.0.html');
const outputPdfPath = path.join(repoRoot, 'docs', 'user-manual', 'HL-Scheduler_UserManual_ko_v4.0.0.pdf');

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const run = async () => {
  const win = new BrowserWindow({
    width: 1280,
    height: 720,
    show: false,
    backgroundColor: '#ffffff',
    paintWhenInitiallyHidden: true,
    webPreferences: { backgroundThrottling: false },
  });

  try {
    await win.loadFile(manualHtmlPath);
    await delay(300);
    const pdfData = await win.webContents.printToPDF({
      printBackground: true,
      pageSize: 'A4',
      landscape: false,
      marginsType: 0,
      preferCSSPageSize: true,
    });
    await fs.writeFile(outputPdfPath, pdfData);
    console.log('[pdf] written', outputPdfPath);
  } finally {
    try {
      win.close();
    } catch {
      // ignore
    }
  }
};

app.whenReady()
  .then(run)
  .then(() => app.quit())
  .catch((error) => {
    console.error(error);
    app.quit();
  });

