const fs = require('fs/promises');
const path = require('path');

const ROOT_DIR = path.join(__dirname, '..');
const RELEASE_DIR = path.join(ROOT_DIR, 'release');
const DIST_DIR = path.join(ROOT_DIR, 'dist');

const fileExists = async (filePath) => {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
};

const findLatestPortableExe = async () => {
  if (!(await fileExists(RELEASE_DIR))) {
    throw new Error(`Release directory not found: ${RELEASE_DIR}`);
  }

  const entries = await fs.readdir(RELEASE_DIR, { withFileTypes: true });
  const exeFiles = [];

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (!entry.name.toLowerCase().endsWith('.exe')) continue;
    const fullPath = path.join(RELEASE_DIR, entry.name);
    const stat = await fs.stat(fullPath);
    exeFiles.push({ name: entry.name, fullPath, mtimeMs: stat.mtimeMs });
  }

  exeFiles.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return exeFiles[0] ?? null;
};

const main = async () => {
  const latestExe = await findLatestPortableExe();
  if (!latestExe) {
    throw new Error(`No .exe artifacts found in: ${RELEASE_DIR}`);
  }

  await fs.mkdir(DIST_DIR, { recursive: true });
  const destPath = path.join(DIST_DIR, latestExe.name);
  await fs.copyFile(latestExe.fullPath, destPath);

  process.stdout.write(`Copied portable EXE -> ${path.relative(ROOT_DIR, destPath)}\n`);
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

