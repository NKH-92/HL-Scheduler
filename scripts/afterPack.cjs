const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs/promises');

const fileExists = async (filePath) => {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
};

const findRcedit = async () => {
  const localAppData = process.env.LOCALAPPDATA;
  if (!localAppData) return null;

  const cacheDir = path.join(localAppData, 'electron-builder', 'Cache', 'winCodeSign');
  if (!(await fileExists(cacheDir))) return null;

  let entries;
  try {
    entries = await fs.readdir(cacheDir, { withFileTypes: true });
  } catch {
    return null;
  }

  const candidates = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const full = path.join(cacheDir, entry.name, 'rcedit-x64.exe');
    if (await fileExists(full)) {
      const stat = await fs.stat(full);
      candidates.push({ file: full, mtimeMs: stat.mtimeMs });
    }
  }

  candidates.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return candidates[0]?.file ?? null;
};

const run = (exe, args) =>
  new Promise((resolve, reject) => {
    const child = spawn(exe, args, { stdio: 'inherit' });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${path.basename(exe)} exited with code ${code}`));
    });
  });

module.exports = async (context) => {
  if (process.platform !== 'win32') return;

  const iconPath = path.join(context.packager.projectDir, 'electron', 'icon.ico');
  if (!(await fileExists(iconPath))) return;

  const exeName = `${context.packager.appInfo.productFilename}.exe`;
  const exePath = path.join(context.appOutDir, exeName);
  if (!(await fileExists(exePath))) return;

  const rcedit = await findRcedit();
  if (!rcedit) {
    console.warn('rcedit-x64.exe not found in electron-builder cache; skip exe icon patch.');
    return;
  }

  const args = [exePath, '--set-icon', iconPath];
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      await run(rcedit, args);
      return;
    } catch (error) {
      if (attempt === 4) throw error;
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
  }
};

