/* eslint-disable no-console */
const http = require('http');
const net = require('net');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs/promises');
const { app, BrowserWindow } = require('electron');

const repoRoot = path.resolve(__dirname, '..', '..');
const outputDir = path.join(repoRoot, 'docs', 'user-manual', 'images');

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const findAvailablePort = async (startPort, { host = '127.0.0.1', tries = 50 } = {}) => {
  let port = Number(startPort) || 0;
  for (let attempt = 0; attempt < tries; attempt += 1) {
    // eslint-disable-next-line no-await-in-loop
    const available = await new Promise((resolve) => {
      const server = net
        .createServer()
        .once('error', () => resolve(false))
        .once('listening', () => {
          server.close(() => resolve(true));
        })
        .listen(port, host);
    });

    if (available) return port;
    port += 1;
  }
  throw new Error(`No available port found starting from ${startPort}`);
};

const withCors = (req, res) => {
  const origin = req.headers.origin;
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  } else {
    res.setHeader('Access-Control-Allow-Origin', '*');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
};

const readJsonBody = async (req) => {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const text = Buffer.concat(chunks).toString('utf8');
  if (!text.trim()) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};

const buildMockData = () => {
  const now = Date.now();
  const folders = [
    { id: 'f-rnd', name: '연구소', parentId: null, depth: 1, sortOrder: 1, path: '연구소', projectCount: 2 },
    {
      id: 'f-rnd-dev',
      name: '개발1팀',
      parentId: 'f-rnd',
      depth: 2,
      sortOrder: 2,
      path: '연구소/개발1팀',
      projectCount: 1,
    },
    { id: 'f-mfg', name: '생산', parentId: null, depth: 1, sortOrder: 3, path: '생산', projectCount: 1 },
  ];

  const schedules = [
    {
      id: 'sched-demo-1',
      name: '예시 프로젝트 (사용설명서)',
      folderId: 'f-rnd-dev',
      folderPath: '연구소/개발1팀',
      createdAt: now - 1000 * 60 * 60 * 24 * 15,
      updatedAt: now - 1000 * 60 * 60 * 6,
      createdByEmail: 'demo.user@hanlim.com',
      updatedByEmail: 'demo.user@hanlim.com',
      data: {
        name: '예시 프로젝트 (사용설명서)',
        tasks: [
          {
            id: 'T-1',
            category: '기획',
            taskName: '요구사항 정리',
            department: 'PM',
            assignee: '홍길동',
            assigneePosition: '대리',
            assigneeEmail: 'demo.user@hanlim.com',
            start: '2026-02-03',
            end: '2026-02-07',
            progress: 100,
            memo: '요구사항 문서 초안 완료',
            dependencies: [],
          },
          {
            id: 'T-2',
            category: '디자인',
            taskName: 'UI 시안',
            department: '디자인',
            assignee: '김디자',
            assigneePosition: '사원',
            assigneeEmail: 'kim.designer@hanlim.com',
            start: '2026-02-10',
            end: '2026-02-21',
            progress: 60,
            memo: '메인 화면/리스트 화면 시안 진행',
            dependencies: ['T-1'],
          },
          {
            id: 'T-3',
            category: '개발',
            taskName: '기본 기능 구현',
            department: '개발',
            assignee: '박개발',
            assigneePosition: '과장',
            assigneeEmail: 'park.dev@hanlim.com',
            start: '2026-02-24',
            end: '2026-03-10',
            progress: 25,
            memo: '작업 CRUD, 간트 드래그/리사이즈',
            dependencies: ['T-2'],
          },
          {
            id: 'T-4',
            category: '개발',
            taskName: '공개 일정 연동',
            department: '개발',
            assignee: '박개발',
            assigneePosition: '과장',
            assigneeEmail: 'park.dev@hanlim.com',
            start: '2026-03-11',
            end: '2026-03-20',
            progress: 0,
            memo: '조회/가져오기/업로드 흐름 점검',
            dependencies: ['T-3'],
          },
          {
            id: 'T-5',
            category: 'QA',
            taskName: '통합 테스트',
            department: 'SQA',
            assignee: '남광현',
            assigneePosition: '선임',
            assigneeEmail: 'nkh92@hanlim.com',
            start: '2026-03-21',
            end: '2026-03-31',
            progress: 0,
            memo: '엑셀/보고서/이미지 내보내기 포함',
            dependencies: ['T-4'],
          },
        ],
        vacations: [{ id: 'V-1', title: '점검 기간(예외)', start: '2026-02-27', end: '2026-03-01' }],
        rangePadding: {
          Day: { before: 10, after: 12 },
          Week: { before: 2, after: 2 },
          Month: { before: 1, after: 1 },
        },
        fitSettings: {
          Day: { enabled: false },
          Week: { enabled: false },
          Month: { enabled: false },
        },
        zoomSettings: { Day: 100, Week: 100, Month: 100 },
      },
    },
    {
      id: 'sched-demo-2',
      name: '예시 프로젝트 - 생산 일정',
      folderId: 'f-mfg',
      folderPath: '생산',
      createdAt: now - 1000 * 60 * 60 * 24 * 8,
      updatedAt: now - 1000 * 60 * 60 * 24 * 2,
      createdByEmail: 'planner@hanlim.com',
      updatedByEmail: 'planner@hanlim.com',
      data: {
        name: '예시 프로젝트 - 생산 일정',
        tasks: [
          {
            id: 'P-1',
            category: '생산',
            taskName: '라인 셋업',
            department: '생산',
            assignee: '이생산',
            assigneePosition: '대리',
            assigneeEmail: 'lee.mfg@hanlim.com',
            start: '2026-03-03',
            end: '2026-03-05',
            progress: 10,
            memo: '',
            dependencies: [],
          },
        ],
        vacations: [],
      },
    },
    {
      id: 'sched-demo-3',
      name: '예시 프로젝트 - 교육 일정',
      folderId: null,
      folderPath: '',
      createdAt: now - 1000 * 60 * 60 * 24 * 3,
      updatedAt: now - 1000 * 60 * 60 * 24 * 1,
      createdByEmail: 'hr@hanlim.com',
      updatedByEmail: 'hr@hanlim.com',
      data: {
        name: '예시 프로젝트 - 교육 일정',
        tasks: [
          {
            id: 'E-1',
            category: '교육',
            taskName: '신규 입사자 오리엔테이션',
            department: '인사',
            assignee: '한림인사',
            assigneePosition: '사원',
            assigneeEmail: 'hr@hanlim.com',
            start: '2026-03-02',
            end: '2026-03-02',
            progress: 0,
            memo: '',
            dependencies: [],
          },
        ],
        vacations: [],
      },
    },
  ];

  const user = {
    id: 'user-demo',
    email: 'demo.user@hanlim.com',
    status: 'approved',
    isAdmin: false,
    requestedAt: now - 1000 * 60 * 60 * 24 * 30,
    approvedAt: now - 1000 * 60 * 60 * 24 * 29,
    approvedByEmail: 'admin@hanlim.com',
    lastLoginAt: now - 1000 * 60 * 60 * 2,
    createdAt: now - 1000 * 60 * 60 * 24 * 30,
    updatedAt: now - 1000 * 60 * 10,
  };

  const permissions = {
    isApproved: true,
    canEditSchedules: true,
    canManageFolders: false,
    canManageUsers: false,
  };

  return { folders, schedules, user, permissions };
};

const startMockApiServer = async ({ host = '127.0.0.1', port }) => {
  const apiBaseUrl = `http://${host}:${port}`;
  const store = buildMockData();

  const server = http.createServer(async (req, res) => {
    withCors(req, res);
    if (req.method === 'OPTIONS') {
      res.statusCode = 204;
      res.end();
      return;
    }

    const url = new URL(req.url || '/', apiBaseUrl);
    const send = (status, data) => {
      res.statusCode = status;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify(data));
    };

    try {
      if (req.method === 'GET' && url.pathname === '/api/auth/me') {
        send(200, { authenticated: true, user: store.user, permissions: store.permissions });
        return;
      }

      if (req.method === 'POST' && url.pathname === '/api/auth/login') {
        const body = await readJsonBody(req);
        const email = String(body?.email || store.user.email).trim().toLowerCase();
        send(200, {
          token: 'demo-token',
          expiresAt: Date.now() + 1000 * 60 * 60 * 24,
          user: { ...store.user, email },
          permissions: store.permissions,
        });
        return;
      }

      if (req.method === 'POST' && url.pathname === '/api/auth/register') {
        const body = await readJsonBody(req);
        const email = String(body?.email || '').trim().toLowerCase();
        if (!email) {
          send(400, { error: 'email is required' });
          return;
        }
        send(200, { ok: true, user: { ...store.user, email, status: 'pending', isAdmin: false } });
        return;
      }

      if (req.method === 'POST' && url.pathname === '/api/auth/logout') {
        send(200, { ok: true });
        return;
      }

      if (req.method === 'GET' && url.pathname === '/api/folders/tree') {
        send(200, store.folders);
        return;
      }

      if (req.method === 'GET' && url.pathname === '/api/schedules') {
        const q = String(url.searchParams.get('q') || '').trim().toLowerCase();
        const limit = Math.max(1, Math.min(200, Number(url.searchParams.get('limit') || 40) || 40));
        const offset = Math.max(0, Number(url.searchParams.get('offset') || 0) || 0);
        const folderId = url.searchParams.get('folderId');
        const safeFolderId = folderId != null ? String(folderId).trim() : '';

        let filtered = store.schedules;
        if (q) {
          filtered = filtered.filter((s) => String(s.name || '').toLowerCase().includes(q));
        }
        if (safeFolderId) {
          if (safeFolderId === '__uncategorized__') {
            filtered = filtered.filter((s) => !s.folderId);
          } else {
            filtered = filtered.filter((s) => String(s.folderId || '').trim() === safeFolderId);
          }
        }

        const page = filtered.slice(offset, offset + limit).map((s) => ({
          id: s.id,
          name: s.name,
          tasksCount: Array.isArray(s.data?.tasks) ? s.data.tasks.length : 0,
          createdAt: s.createdAt,
          updatedAt: s.updatedAt,
          createdByEmail: s.createdByEmail,
          updatedByEmail: s.updatedByEmail,
          folderId: s.folderId ?? null,
          folderPath: s.folderPath ?? '',
        }));
        send(200, page);
        return;
      }

      const scheduleMatch = /^\/api\/schedules\/([^/]+)$/.exec(url.pathname);
      if (req.method === 'GET' && scheduleMatch) {
        const id = decodeURIComponent(scheduleMatch[1]);
        const schedule = store.schedules.find((s) => s.id === id);
        if (!schedule) {
          send(404, { error: 'Not found' });
          return;
        }
        send(200, {
          id: schedule.id,
          name: schedule.name,
          folderId: schedule.folderId ?? null,
          folderPath: schedule.folderPath ?? '',
          createdAt: schedule.createdAt,
          updatedAt: schedule.updatedAt,
          createdByEmail: schedule.createdByEmail,
          updatedByEmail: schedule.updatedByEmail,
          data: schedule.data,
        });
        return;
      }

      send(404, { error: 'Not found' });
    } catch (error) {
      console.error('mock-api error', error);
      send(500, { error: error?.message || 'Internal error' });
    }
  });

  await new Promise((resolve) => server.listen(port, host, resolve));
  return { server, apiBaseUrl };
};

const waitForHttpOk = async (url, { timeoutMs = 60000 } = {}) => {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const res = await fetch(url, { method: 'GET' });
      if (res.ok) return;
    } catch {
      // ignore
    }
    // eslint-disable-next-line no-await-in-loop
    await delay(500);
  }
  throw new Error(`Timeout waiting for ${url}`);
};

const killProcessTree = async (child) => {
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

const startViteDevServer = async ({ port, apiBaseUrl }) => {
  const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const args = ['run', 'dev', '--', '--host', '127.0.0.1', '--port', String(port), '--strictPort'];

  const child = spawn(npmCmd, args, {
    cwd: repoRoot,
    env: {
      ...process.env,
      VITE_PUBLIC_SCHEDULES_API_BASE: apiBaseUrl,
      VITE_PUBLIC_SCHEDULES_WRITE_API_BASE: apiBaseUrl,
      VITE_AUTH_API_BASE: apiBaseUrl,
      VITE_ADMIN_API_BASE: apiBaseUrl,
      VITE_APP_ROLE: 'public',
    },
    shell: process.platform === 'win32',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  child.stdout.on('data', (buf) => process.stdout.write(buf));
  child.stderr.on('data', (buf) => process.stderr.write(buf));
  child.on('exit', (code) => console.log('[vite] exited', code));

  const url = `http://127.0.0.1:${port}/`;
  await waitForHttpOk(url);
  return { child, url };
};

const waitForPredicate = async (win, jsExpr, { timeoutMs = 30000 } = {}) => {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    // eslint-disable-next-line no-await-in-loop
    const ok = await win.webContents.executeJavaScript(`Boolean(${jsExpr})`, true);
    if (ok) return;
    // eslint-disable-next-line no-await-in-loop
    await delay(150);
  }
  throw new Error(`Timeout waiting for predicate: ${jsExpr}`);
};

const waitForSelector = async (win, selector, { timeoutMs = 30000 } = {}) =>
  waitForPredicate(win, `document.querySelector(${JSON.stringify(selector)})`, { timeoutMs });

const waitForGone = async (win, selector, { timeoutMs = 30000 } = {}) =>
  waitForPredicate(win, `!document.querySelector(${JSON.stringify(selector)})`, { timeoutMs });

const clickFirstButtonContaining = async (win, text) => {
  const result = await win.webContents.executeJavaScript(
    `(() => {
      const needle = ${JSON.stringify(String(text || '').trim())};
      const buttons = Array.from(document.querySelectorAll('button'));
      const target = buttons.find((b) => (b.innerText || '').replace(/\\s+/g,' ').includes(needle));
      if (!target) return { ok: false };
      target.click();
      return { ok: true };
    })()`,
    true,
  );
  if (!result?.ok) throw new Error(`Button not found (text includes): ${text}`);
};

const clickInDialog = async (win, ariaLabel, text) => {
  const result = await win.webContents.executeJavaScript(
    `(() => {
      const label = ${JSON.stringify(String(ariaLabel || '').trim())};
      const needle = ${JSON.stringify(String(text || '').trim())};
      const dialog = document.querySelector('div[role="dialog"][aria-label=\"' + label.replaceAll('\"', '\\\\\"') + '\"]');
      if (!dialog) return { ok: false, reason: 'dialog-not-found' };
      const buttons = Array.from(dialog.querySelectorAll('button'));
      const target = buttons.find((b) => (b.innerText || '').replace(/\\s+/g,' ').includes(needle));
      if (!target) return { ok: false, reason: 'button-not-found' };
      target.click();
      return { ok: true };
    })()`,
    true,
  );
  if (!result?.ok) throw new Error(`Dialog click failed (${ariaLabel} / ${text}): ${result?.reason || 'unknown'}`);
};

const capture = async (win, filename) => {
  const image = await win.webContents.capturePage();
  const filePath = path.join(outputDir, filename);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, image.toPNG());
  console.log('[screenshot]', filePath);
};

const resetScrollPosition = async (win) => {
  await win.webContents.executeJavaScript(
    `(() => {
      window.scrollTo(0, 0);
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
      const selectors = ['main', '[data-scroll-root]', '.custom-scrollbar', '.overflow-auto', '.overflow-y-auto'];
      selectors.forEach((selector) => {
        document.querySelectorAll(selector).forEach((node) => {
          if (node && typeof node.scrollTo === 'function') node.scrollTo(0, 0);
          if (node) node.scrollTop = 0;
        });
      });
      return true;
    })()`,
    true,
  );
};

const run = async () => {
  const apiPort = await findAvailablePort(8787);
  const vitePort = await findAvailablePort(5173);

  const { server: mockServer, apiBaseUrl } = await startMockApiServer({ port: apiPort });
  console.log('[mock-api] listening', apiBaseUrl);

  let vite = null;
  let win = null;
  try {
    vite = await startViteDevServer({ port: vitePort, apiBaseUrl });
    console.log('[vite] ready', vite.url);

    win = new BrowserWindow({
      width: 1440,
      height: 900,
      show: false,
      backgroundColor: '#ffffff',
      paintWhenInitiallyHidden: true,
      webPreferences: {
        backgroundThrottling: false,
      },
    });

    await win.loadURL(vite.url);

    await waitForSelector(win, 'header');
    await delay(800);

    // 01: public schedules list
    await waitForSelector(win, 'input[placeholder^=\"검색\"]');
    await waitForPredicate(
      win,
      `Array.from(document.querySelectorAll('button')).some((b) => (b.innerText || '').includes('Preview'))`,
    );
    await delay(600);
    await capture(win, '01_public_schedules.png');

    // 02: open first preview
    await win.webContents.executeJavaScript(
      `(() => {
        const candidates = Array.from(document.querySelectorAll('button')).filter((b) => (b.innerText || '').includes('Preview'));
        const target = candidates[0];
        if (target) target.click();
      })()`,
      true,
    );
    await waitForPredicate(
      win,
      `Array.from(document.querySelectorAll('button')).some((b) => (b.innerText || '').includes('목록으로'))`,
    );
    await delay(700);
    await capture(win, '02_public_schedule_preview.png');

    // Import selected schedule (opens confirm dialog)
    await clickFirstButtonContaining(win, '가져오기');
    await waitForSelector(win, 'div[role=\"dialog\"][aria-label=\"가져오기 확인\"]');
    await clickInDialog(win, '가져오기 확인', '가져오기');
    await waitForGone(win, 'div[role=\"dialog\"][aria-label=\"가져오기 확인\"]');

    // 05: schedule view (gantt)
    await waitForPredicate(
      win,
      `Array.from(document.querySelectorAll('h2')).some((h) => (h.innerText || '').includes('Timeline'))`,
    );
    await delay(700);
    await capture(win, '05_schedule_gantt.png');

    // 06: image export modal
    await clickFirstButtonContaining(win, '이미지');
    await waitForSelector(win, 'div[role=\"dialog\"][aria-label=\"이미지 내보내기\"]');
    await delay(400);
    await capture(win, '06_image_export_modal.png');
    await win.webContents.executeJavaScript(
      `(() => {
        const modal = document.querySelector('div[role=\"dialog\"][aria-label=\"이미지 내보내기\"]');
        const closeBtn = modal ? modal.querySelector('button[aria-label=\"닫기\"]') : null;
        if (closeBtn) closeBtn.click();
      })()`,
      true,
    );
    await waitForGone(win, 'div[role=\"dialog\"][aria-label=\"이미지 내보내기\"]');

    // 03: task management
    await clickFirstButtonContaining(win, '작업 관리');
    await waitForSelector(win, 'input[placeholder=\"프로젝트 이름을 입력하세요\"]');
    await waitForSelector(win, 'table tbody tr');
    await resetScrollPosition(win);
    await delay(700);
    await capture(win, '03_task_management.png');

    // 04: task edit modal (edit first row)
    await win.webContents.executeJavaScript(
      `(() => {
        const row = document.querySelector('table tbody tr');
        const editBtn = row ? row.querySelector('button.text-blue-600') : null;
        if (editBtn) editBtn.click();
      })()`,
      true,
    );
    await waitForSelector(win, 'div[role=\"dialog\"][aria-label=\"작업 수정\"]');
    await delay(400);
    await capture(win, '04_task_edit_modal.png');
    await win.webContents.executeJavaScript(
      `(() => {
        const modal = document.querySelector('div[role=\"dialog\"][aria-label=\"작업 수정\"]');
        const closeBtn = modal ? modal.querySelector('button[aria-label=\"닫기\"]') : null;
        if (closeBtn) closeBtn.click();
      })()`,
      true,
    );
    await waitForGone(win, 'div[role=\"dialog\"][aria-label=\"작업 수정\"]');

    // 07: report modal
    await clickFirstButtonContaining(win, '보고서');
    await waitForSelector(win, 'div[role=\"dialog\"][aria-label=\"보고서 미리보기\"]');
    await delay(700);
    await capture(win, '07_report_modal.png');
    await win.webContents.executeJavaScript(
      `(() => {
        const modal = document.querySelector('div[role=\"dialog\"][aria-label=\"보고서 미리보기\"]');
        const closeBtn = modal ? modal.querySelector('button[aria-label=\"닫기\"]') : null;
        if (closeBtn) closeBtn.click();
      })()`,
      true,
    );
    await waitForGone(win, 'div[role=\"dialog\"][aria-label=\"보고서 미리보기\"]');

    // 08: dashboard
    await clickFirstButtonContaining(win, '대시보드');
    await waitForPredicate(
      win,
      `Array.from(document.querySelectorAll('h2')).some((h) => (h.innerText || '').includes('Dashboard'))`,
    );
    await resetScrollPosition(win);
    await delay(700);
    await capture(win, '08_dashboard.png');

    // 09: login modal (logout -> login)
    await clickFirstButtonContaining(win, '로그아웃');
    await delay(700);
    await clickFirstButtonContaining(win, '로그인');
    await waitForSelector(win, 'div[role=\"dialog\"][aria-label=\"로그인 또는 가입\"]');
    await delay(400);
    await capture(win, '09_login_modal.png');

    console.log('[done] screenshots saved to', outputDir);
  } finally {
    if (win) {
      try {
        win.close();
      } catch {
        // ignore
      }
    }
    await killProcessTree(vite?.child);
    await new Promise((resolve) => mockServer.close(resolve));
  }
};

app.whenReady()
  .then(run)
  .then(() => app.quit())
  .catch((error) => {
    console.error(error);
    app.quit();
  });
