import process from 'node:process';
import { getCloudflareDeployConfig } from './config.mjs';

const DEFAULT_TIMEOUT_MS = 15000;
const DEFAULT_RETRY_COUNT = 10;
const DEFAULT_RETRY_DELAY_MS = 5000;

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const fetchWithTimeout = async (url, { timeoutMs = DEFAULT_TIMEOUT_MS, redirect = 'follow' } = {}) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      redirect,
      signal: controller.signal,
      headers: {
        Accept: 'application/json,text/html;q=0.9,*/*;q=0.8',
      },
    });
  } finally {
    clearTimeout(timer);
  }
};

const assertOkJson = async (res, name) => {
  if (!res.ok) {
    throw new Error(`${name} returned HTTP ${res.status}`);
  }
  const data = await res.json();
  if (!data || data.ok !== true) {
    throw new Error(`${name} did not return { ok: true }`);
  }
};

const assertOkJsonOrAccessRedirect = async (res, name) => {
  if (res.ok) {
    const data = await res.json();
    if (!data || data.ok !== true) {
      throw new Error(`${name} did not return { ok: true }`);
    }
    return;
  }

  if (res.status === 302) {
    const location = String(res.headers.get('location') || '').trim();
    if (location.includes('cloudflareaccess.com')) {
      return;
    }
  }

  throw new Error(`${name} returned HTTP ${res.status}`);
};

const assertHtml = async (res, name) => {
  if (!res.ok) {
    throw new Error(`${name} returned HTTP ${res.status}`);
  }
  const body = await res.text();
  if (!body.toLowerCase().includes('<html')) {
    throw new Error(`${name} did not return an HTML document`);
  }
};

const assertSchedulesList = async (res, name) => {
  if (!res.ok) {
    throw new Error(`${name} returned HTTP ${res.status}`);
  }
  const data = await res.json();
  if (!Array.isArray(data)) {
    throw new Error(`${name} did not return a JSON array`);
  }
};

const runCheck = async (check, { retryCount = DEFAULT_RETRY_COUNT, retryDelayMs = DEFAULT_RETRY_DELAY_MS } = {}) => {
  let lastError = null;

  for (let attempt = 1; attempt <= retryCount; attempt += 1) {
    try {
      const response = await fetchWithTimeout(check.url, check.fetchOptions);
      await check.assert(response, check.name);
      process.stdout.write(`[smoke] ok: ${check.name}\n`);
      return;
    } catch (error) {
      lastError = error;
      process.stdout.write(
        `[smoke] retry ${attempt}/${retryCount}: ${check.name} (${error instanceof Error ? error.message : String(error)})\n`,
      );
      if (attempt < retryCount) {
        await wait(retryDelayMs);
      }
    }
  }

  throw lastError || new Error(`Smoke test failed: ${check.name}`);
};

const config = getCloudflareDeployConfig();

const checks = [
  {
    name: 'public worker health',
    url: `${config.workers.public.apiUrl}/healthz`,
    assert: assertOkJson,
  },
  {
    name: 'admin worker health',
    url: `${config.workers.admin.apiUrl}/healthz`,
    assert: assertOkJsonOrAccessRedirect,
    fetchOptions: {
      redirect: 'manual',
    },
  },
  {
    name: 'public schedules list',
    url: `${config.workers.public.apiUrl}/api/schedules?limit=1`,
    assert: assertSchedulesList,
  },
  {
    name: 'public pages app',
    url: config.pages.public.url,
    assert: assertHtml,
  },
  {
    name: 'admin pages app',
    url: config.pages.admin.url,
    assert: assertHtml,
  },
];

for (const check of checks) {
  await runCheck(check);
}
