const path = require('path');
const { fileURLToPath } = require('url');
const fsSync = require('fs');
const fs = require('fs/promises');
const { app, BrowserWindow, Menu, shell, ipcMain, dialog } = require('electron');
const nodemailer = require('nodemailer');

const isDev = !app.isPackaged;
const devServerUrl = process.env.ELECTRON_RENDERER_URL;
const iconPath = path.join(__dirname, 'icon.ico');
const distDir = path.join(__dirname, '..', 'dist');

let logFilePath;

const toLogString = (value) => {
  if (value instanceof Error) return value.stack || value.message;
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
};

const log = (...args) => {
  const line = `[${new Date().toISOString()}] ${args.map(toLogString).join(' ')}\n`;
  if (!logFilePath) {
    process.stdout.write(line);
    return;
  }
  try {
    fsSync.appendFileSync(logFilePath, line);
  } catch {
    // ignore logging failures
  }
  if (isDev || process.env.HL_SCHEDULER_DEBUG_LOG === '1') {
    process.stdout.write(line);
  }
};

let processErrorHandlersInstalled = false;

const installProcessErrorHandlers = () => {
  if (processErrorHandlersInstalled) return;
  processErrorHandlersInstalled = true;
  process.on('uncaughtException', (error) => {
    log('uncaughtException', error);
  });
  process.on('unhandledRejection', (reason) => {
    log('unhandledRejection', reason);
  });
};

const clampZoomFactor = (value) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return 1;
  return Math.max(0.5, Math.min(2.5, n));
};

const openExternalSafe = (url) => {
  try {
    const parsed = new URL(url);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:' || parsed.protocol === 'mailto:') {
      shell.openExternal(url);
      return;
    }
  } catch {
    // ignore invalid URLs
  }
  console.warn('Blocked external URL:', url);
};

const normalizePath = (value) => {
  const normalized = path.normalize(value);
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
};

const isFileUrlInDir = (url, dir) => {
  try {
    const filePath = fileURLToPath(url);
    const normalizedFile = normalizePath(filePath);
    const normalizedDir = normalizePath(dir + path.sep);
    return normalizedFile.startsWith(normalizedDir);
  } catch {
    return false;
  }
};

const isAllowedNavigationUrl = (url, internalOrigins) => {
  if (url === 'about:blank') return true;
  try {
    const parsed = new URL(url);
    if (parsed.protocol === 'file:') return isFileUrlInDir(url, distDir);
    if (internalOrigins && internalOrigins.has(parsed.origin)) return true;
  } catch {
    return false;
  }
  return false;
};

const parseImageDataUrl = (dataUrl) => {
  if (typeof dataUrl !== 'string') throw new Error('Invalid dataUrl');
  const match = /^data:(image\/(png|jpeg));base64,(.+)$/i.exec(dataUrl);
  if (!match) throw new Error('Invalid image dataUrl');
  return { mime: match[1].toLowerCase(), buffer: Buffer.from(match[3], 'base64') };
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SMTP_HOST = String(process.env.HL_SCHEDULER_SMTP_HOST || 'omail.hanlim.com').trim() || 'omail.hanlim.com';
const SMTP_PORT = Math.max(1, Math.min(65535, Number(process.env.HL_SCHEDULER_SMTP_PORT) || 25));
const SMTP_SECURE = String(process.env.HL_SCHEDULER_SMTP_SECURE || 'false').trim().toLowerCase() === 'true';
const MAX_NOTIFICATION_RECIPIENTS = 50;

const normalizeEmail = (value) => String(value || '').trim().toLowerCase();
const isValidEmail = (value) => EMAIL_PATTERN.test(normalizeEmail(value));
const normalizeEmailList = (value) => {
  const source = Array.isArray(value) ? value : [];
  const unique = new Set();
  const result = [];
  source.forEach((item) => {
    const email = normalizeEmail(item);
    if (!email || unique.has(email)) return;
    unique.add(email);
    result.push(email);
  });
  return result;
};

const formatKstDateTime = (value) => {
  const date = typeof value === 'number' ? new Date(value) : new Date(String(value || ''));
  if (Number.isNaN(date.getTime())) return String(value || '');
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(date);
};

let smtpTransporter;
const getSmtpTransporter = () => {
  if (!smtpTransporter) {
    smtpTransporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_SECURE,
      auth: undefined,
    });
  }
  return smtpTransporter;
};

const escapeHtml = (value) =>
  String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

const showLoadFailure = async (mainWindow, error) => {
  const details = escapeHtml(toLogString(error));
  const html = `<!doctype html><meta charset="utf-8" />
    <title>Scheduler - Load Failed</title>
    <body style="font-family: ui-sans-serif, system-ui; padding: 16px;">
      <h2 style="margin: 0 0 12px 0;">앱을 불러오지 못했습니다.</h2>
      <p style="margin: 0 0 12px 0;">아래 오류 내용을 확인해주세요.</p>
      <pre style="white-space: pre-wrap; background: #f1f5f9; padding: 12px; border-radius: 8px;">${details}</pre>
      <p style="margin: 12px 0 0 0; color: #475569;">로그 파일: ${escapeHtml(logFilePath || '(unknown)')}</p>
    </body>`;
  await mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
};

ipcMain.handle('scheduler:save-image', async (event, payload) => {
  const { dataUrl, defaultFileName, ext } = payload || {};
  const win = BrowserWindow.fromWebContents(event.sender);

  const safeExt = ext === 'jpg' ? 'jpg' : ext === 'jpeg' ? 'jpeg' : ext === 'png' ? 'png' : null;
  if (!safeExt) throw new Error('Unsupported export format');

  const defaultName =
    typeof defaultFileName === 'string' && defaultFileName.trim()
      ? defaultFileName.trim()
      : `gantt.${safeExt}`;

  const basePath = path.join(app.getPath('downloads'), defaultName);
  const filterLabel = safeExt === 'png' ? 'PNG Image' : 'JPEG Image';
  const extensions = safeExt === 'png' ? ['png'] : ['jpg', 'jpeg'];
  const filters = [{ name: filterLabel, extensions }];

  let canceled = true;
  let filePath = '';
  try {
    const result = await dialog.showSaveDialog(win, {
      title: 'Save image',
      defaultPath: basePath,
      filters,
    });
    canceled = !!result?.canceled;
    filePath = String(result?.filePath || '');
  } finally {
    try {
      if (win && !win.isDestroyed()) {
        win.focus();
        win.webContents.focus();
      }
    } catch {
      // ignore focus restore failures
    }
  }

  if (canceled || !filePath) return { canceled: true };

  const selectedExtRaw = path.extname(filePath);
  const selectedExt = selectedExtRaw ? selectedExtRaw.slice(1).toLowerCase() : '';
  const isJpegExt = (extValue) => extValue === 'jpg' || extValue === 'jpeg';

  let outPath = filePath;
  if (!selectedExt) {
    outPath = `${filePath}.${safeExt}`;
  } else if (safeExt === 'png') {
    if (selectedExt !== 'png') {
      outPath = path.join(path.dirname(filePath), `${path.basename(filePath, selectedExtRaw)}.png`);
    }
  } else if (!isJpegExt(selectedExt)) {
    outPath = path.join(path.dirname(filePath), `${path.basename(filePath, selectedExtRaw)}.jpg`);
  }

  const { mime, buffer } = parseImageDataUrl(dataUrl);
  const expectedMime = safeExt === 'png' ? 'image/png' : 'image/jpeg';
  if (mime !== expectedMime) throw new Error(`Unexpected image mime: ${mime}`);

  await fs.writeFile(outPath, buffer);
  return { canceled: false, filePath: outPath };
});

ipcMain.handle('scheduler:get-zoom-factor', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const zoomFactor = win ? win.webContents.getZoomFactor() : 1;
  return { zoomFactor };
});

ipcMain.handle('scheduler:set-zoom-factor', (event, payload) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win) throw new Error('Window not found');
  const zoomFactor = clampZoomFactor(payload?.zoomFactor);
  win.webContents.setZoomFactor(zoomFactor);
  return { zoomFactor: win.webContents.getZoomFactor() };
});

ipcMain.handle('scheduler:send-update-email', async (_event, payload) => {
  const projectName = String(payload?.projectName || '').trim();
  const updatedAt = payload?.updatedAt ?? new Date().toISOString();
  const fromEmail = normalizeEmail(payload?.fromEmail);
  const recipients = normalizeEmailList(payload?.recipients);

  if (!projectName) throw new Error('projectName is required.');
  if (!fromEmail || !isValidEmail(fromEmail)) throw new Error('fromEmail is required and must be a valid email.');
  if (recipients.length === 0) throw new Error('recipients must include at least one valid email.');
  if (recipients.length > MAX_NOTIFICATION_RECIPIENTS) {
    throw new Error(`Too many recipients (max ${MAX_NOTIFICATION_RECIPIENTS}).`);
  }

  const invalidRecipient = recipients.find((email) => !isValidEmail(email));
  if (invalidRecipient) throw new Error(`Invalid recipient email: ${invalidRecipient}`);

  const subject = `[Scheduler] 일정 업데이트 알림 - ${projectName}`;
  const text = [
    '일정이 업데이트되었습니다.',
    '',
    `[프로젝트명]: ${projectName}`,
    `[수정자]: ${fromEmail}`,
    `[수정시각]: ${formatKstDateTime(updatedAt)}`,
    '',
    '감사합니다.',
  ].join('\n');

  try {
    const info = await getSmtpTransporter().sendMail({
      from: fromEmail,
      to: recipients.join(','),
      subject,
      text,
    });
    log('send-update-email success', {
      fromEmail,
      recipientCount: recipients.length,
      messageId: info?.messageId ?? null,
      smtpHost: SMTP_HOST,
      smtpPort: SMTP_PORT,
      smtpSecure: SMTP_SECURE,
    });
    return {
      ok: true,
      recipientCount: recipients.length,
      messageId: info?.messageId ?? null,
    };
  } catch (error) {
    log('send-update-email failed', {
      error: toLogString(error),
      fromEmail,
      recipientCount: recipients.length,
      smtpHost: SMTP_HOST,
      smtpPort: SMTP_PORT,
      smtpSecure: SMTP_SECURE,
    });
    throw new Error(`메일 발송 실패: ${error?.message || String(error)}`);
  }
});

const createMainWindow = async () => {
  try {
    const logDir = app.getPath('userData');
    logFilePath = path.join(logDir, 'hl-scheduler.log');
    await fs.mkdir(logDir, { recursive: true });
    log('Log file:', logFilePath);
    log('App info', {
      isDev,
      isPackaged: app.isPackaged,
      platform: process.platform,
      arch: process.arch,
      versions: process.versions,
      devServerUrl: devServerUrl || null,
      appPath: app.getAppPath(),
      userData: app.getPath('userData'),
    });
  } catch (error) {
    log('Failed to init log file; falling back to stdout', error);
  }

  log('Creating BrowserWindow...');
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
  log('BrowserWindow created', {
    id: mainWindow.id,
    iconPath,
    preloadPath: path.join(__dirname, 'preload.cjs'),
  });

  if (process.platform !== 'darwin') {
    mainWindow.setMenuBarVisibility(false);
  }

  mainWindow.webContents.on('did-start-loading', () => {
    log('did-start-loading');
  });
  mainWindow.webContents.on('dom-ready', () => {
    log('dom-ready');
  });
  mainWindow.webContents.on('did-stop-loading', () => {
    log('did-stop-loading');
  });
  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    log('did-fail-load', { errorCode, errorDescription, validatedURL, isMainFrame });
  });
  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    log('render-process-gone', details);
  });
  mainWindow.webContents.on('unresponsive', () => {
    log('unresponsive');
  });
  mainWindow.webContents.on('responsive', () => {
    log('responsive');
  });
  mainWindow.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    log('renderer-console', { level, message, sourceId, line });
  });
  mainWindow.webContents.on('did-finish-load', async () => {
    log('did-finish-load', mainWindow.webContents.getURL());
    try {
      const probe = await mainWindow.webContents.executeJavaScript(
        `(() => ({
          readyState: document.readyState,
          title: document.title,
          hasPreloadApi: !!globalThis.hlScheduler,
          rootChildCount: document.getElementById('root')?.children?.length ?? null,
          rootText: (document.getElementById('root')?.innerText || '').slice(0, 120),
          bodyText: (document.body?.innerText || '').slice(0, 120),
        }))()`,
        true,
      );
      log('dom-probe', probe);
    } catch (error) {
      log('dom-probe-failed', error);
    }
  });

  try {
    log('setVisualZoomLevelLimits start');
    mainWindow.webContents
      .setVisualZoomLevelLimits(1, 3)
      .then(() => log('setVisualZoomLevelLimits ok'))
      .catch((error) => log('setVisualZoomLevelLimits failed (ignored)', error));
  } catch (error) {
    log('setVisualZoomLevelLimits threw (ignored)', error);
  }

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    openExternalSafe(url);
    return { action: 'deny' };
  });

  const internalOrigins = new Set();
  if (isDev && devServerUrl) {
    try {
      internalOrigins.add(new URL(devServerUrl).origin);
    } catch {
      // ignore invalid dev server URL
    }
  }

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (isAllowedNavigationUrl(url, internalOrigins)) return;
    event.preventDefault();
    openExternalSafe(url);
  });

  try {
    if (isDev && devServerUrl) {
      log('Loading renderer URL', devServerUrl);
      await mainWindow.loadURL(devServerUrl);
    } else {
      const indexPath = path.join(distDir, 'index.html');
      let exists = false;
      try {
        await fs.access(indexPath);
        exists = true;
      } catch {
        exists = false;
      }
      log('Loading renderer file', { indexPath, exists });
      await mainWindow.loadFile(indexPath);
    }
    log('Renderer loaded', mainWindow.webContents.getURL());
  } catch (error) {
    log('Renderer load failed', error);
    await showLoadFailure(mainWindow, error);
  }
};

app.whenReady().then(async () => {
  if (process.platform !== 'darwin') {
    Menu.setApplicationMenu(null);
  }

  installProcessErrorHandlers();

  try {
    await createMainWindow();
  } catch (error) {
    log('createMainWindow failed', error);
    throw error;
  }

  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createMainWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
