/* eslint-disable no-console */
const http = require('http');
const path = require('path');
const { spawn } = require('child_process');

const repoRoot = path.resolve(__dirname, '..', '..');
const apiPort = 8787;
const vitePort = 4173;
const screenshotPath = path.join(repoRoot, 'docs', 'user-manual', 'images', '03_task_management.png');
const playwrightSession = `manual-capture-${Date.now()}`;
const npxCliPath = path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npx-cli.js');

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const waitForHttpOk = async (url, timeoutMs = 60000) => {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      await new Promise((resolve, reject) => {
        const req = http.get(url, (res) => {
          res.resume();
          if (res.statusCode >= 200 && res.statusCode < 500) resolve();
          else reject(new Error(`HTTP ${res.statusCode}`));
        });
        req.on('error', reject);
      });
      return;
    } catch {
      await wait(500);
    }
  }
  throw new Error(`Timeout waiting for ${url}`);
};

const killTree = async (child) => {
  if (!child || !child.pid) return;
  if (process.platform === 'win32') {
    await new Promise((resolve) => {
      const killer = spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
      killer.on('exit', () => resolve());
      killer.on('error', () => resolve());
    });
    return;
  }
  try {
    child.kill('SIGTERM');
  } catch {
    // ignore
  }
};

const runPlaywrightCli = (args) =>
  new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [npxCliPath, '--yes', '--package', '@playwright/cli', 'playwright-cli', '-s', playwrightSession, ...args], {
      cwd: repoRoot,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (buf) => {
      stdout += buf.toString();
      process.stdout.write(buf);
    });
    child.stderr.on('data', (buf) => {
      stderr += buf.toString();
      process.stderr.write(buf);
    });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0 && !stdout.includes('### Error')) resolve();
      else if (stdout.includes('### Error')) reject(new Error(stdout));
      else reject(new Error(stderr || `playwright-cli exited with code ${code}`));
    });
  });

const run = async () => {
  let api = null;
  let vite = null;

  try {
    api = spawn('node', ['scripts/manual/mock-api-server.cjs', '--port', String(apiPort)], {
      cwd: repoRoot,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    api.stdout.on('data', (buf) => process.stdout.write(buf));
    api.stderr.on('data', (buf) => process.stderr.write(buf));

    const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    vite = spawn(npmCmd, ['run', 'dev', '--', '--host', '127.0.0.1', '--port', String(vitePort), '--strictPort'], {
      cwd: repoRoot,
      env: {
        ...process.env,
        VITE_PUBLIC_SCHEDULES_API_BASE: `http://127.0.0.1:${apiPort}`,
        VITE_PUBLIC_SCHEDULES_WRITE_API_BASE: `http://127.0.0.1:${apiPort}`,
        VITE_AUTH_API_BASE: `http://127.0.0.1:${apiPort}`,
        VITE_ADMIN_API_BASE: `http://127.0.0.1:${apiPort}`,
        VITE_APP_ROLE: 'public',
      },
      shell: process.platform === 'win32',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    vite.stdout.on('data', (buf) => process.stdout.write(buf));
    vite.stderr.on('data', (buf) => process.stderr.write(buf));

    await waitForHttpOk(`http://127.0.0.1:${vitePort}/`);

    await runPlaywrightCli(['open', `http://127.0.0.1:${vitePort}/`, '--browser', 'msedge']);
    const runCode = [
      "async function (page) {",
      "await page.getByRole('button', { name: 'Preview' }).first().click();",
      "await page.getByRole('button', { name: '\\uAC00\\uC838\\uC624\\uAE30' }).click();",
      "await page.getByRole('dialog', { name: '\\uAC00\\uC838\\uC624\\uAE30 \\uD655\\uC778' }).getByRole('button', { name: '\\uAC00\\uC838\\uC624\\uAE30' }).click();",
      "await page.getByRole('button', { name: '\\uC791\\uC5C5 \\uAD00\\uB9AC' }).click();",
      "await page.getByPlaceholder('\\uD504\\uB85C\\uC81D\\uD2B8 \\uC774\\uB984\\uC744 \\uC785\\uB825\\uD558\\uC138\\uC694').waitFor({ state: 'visible' });",
      "await page.locator('table tbody tr').first().waitFor({ state: 'visible' });",
      "await page.evaluate(() => {",
      "window.scrollTo(0, 0);",
      "document.documentElement.scrollTop = 0;",
      "document.body.scrollTop = 0;",
      "document.querySelectorAll('main, .custom-scrollbar, .overflow-auto, .overflow-y-auto').forEach((node) => {",
      "if (node && typeof node.scrollTo === 'function') node.scrollTo(0, 0);",
      "if (node) node.scrollTop = 0;",
      "});",
      "});",
      "await page.waitForTimeout(700);",
      "}",
    ].join(' ');
    await runPlaywrightCli([
      'run-code',
      runCode,
    ]);
    await runPlaywrightCli(['screenshot', '--filename', screenshotPath]);
    console.log(`[screenshot] ${screenshotPath}`);
  } finally {
    await runPlaywrightCli(['close']).catch(() => {});
    await killTree(vite);
    await killTree(api);
  }
};

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
