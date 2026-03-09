import { spawn } from 'node:child_process';
import process from 'node:process';
import { getArgValue, getCloudflareDeployConfig, normalizeSurface } from './config.mjs';

const role = normalizeSurface(getArgValue('--role') || process.env.APP_ROLE, 'role');
const config = getCloudflareDeployConfig();
const buildTarget = config.pages[role];
const command = process.platform === 'win32' ? process.env.ComSpec || 'cmd.exe' : 'npm';
const args = process.platform === 'win32' ? ['/d', '/s', '/c', 'npm.cmd run build'] : ['run', 'build'];

const child = spawn(command, args, {
  cwd: process.cwd(),
  env: {
    ...process.env,
    ...buildTarget.viteEnv,
  },
  stdio: 'inherit',
});

child.on('exit', (code) => {
  process.exit(code ?? 1);
});

child.on('error', (error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
