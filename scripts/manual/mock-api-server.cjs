/* eslint-disable no-console */
const http = require('http');

const PORT_ARG_INDEX = process.argv.indexOf('--port');
const PORT = PORT_ARG_INDEX >= 0 ? Number(process.argv[PORT_ARG_INDEX + 1]) || 8787 : 8787;
const HOST = '127.0.0.1';

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

const buildStore = () => {
  const now = Date.now();
  const folders = [
    { id: 'f-rnd', name: '연구소', parentId: null, depth: 1, sortOrder: 1, path: '연구소', projectCount: 2 },
    { id: 'f-rnd-dev', name: '개발1팀', parentId: 'f-rnd', depth: 2, sortOrder: 2, path: '연구소/개발1팀', projectCount: 1 },
    { id: 'f-mfg', name: '생산', parentId: null, depth: 1, sortOrder: 3, path: '생산', projectCount: 1 },
  ];

  const data = {
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
  };

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
      data,
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
      data: { name: '예시 프로젝트 - 생산 일정', tasks: [], vacations: [] },
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

const store = buildStore();
const baseUrl = `http://${HOST}:${PORT}`;

const server = http.createServer(async (req, res) => {
  withCors(req, res);

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  const url = new URL(req.url || '/', baseUrl);
  const send = (status, body) => {
    res.statusCode = status;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify(body));
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
        expiresAt: Date.now() + 1000 * 60 * 60 * 12,
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
      const folderId = String(url.searchParams.get('folderId') || '').trim();
      let filtered = store.schedules;
      if (q) filtered = filtered.filter((item) => String(item.name || '').toLowerCase().includes(q));
      if (folderId) filtered = filtered.filter((item) => String(item.folderId || '') === folderId);

      send(
        200,
        filtered.map((item) => ({
          id: item.id,
          name: item.name,
          tasksCount: Array.isArray(item.data?.tasks) ? item.data.tasks.length : 0,
          createdAt: item.createdAt,
          updatedAt: item.updatedAt,
          createdByEmail: item.createdByEmail,
          updatedByEmail: item.updatedByEmail,
          folderId: item.folderId ?? null,
          folderPath: item.folderPath ?? '',
        })),
      );
      return;
    }

    const match = /^\/api\/schedules\/([^/]+)$/.exec(url.pathname);
    if (req.method === 'GET' && match) {
      const id = decodeURIComponent(match[1]);
      const schedule = store.schedules.find((item) => item.id === id);
      if (!schedule) {
        send(404, { error: 'Not found' });
        return;
      }
      send(200, schedule);
      return;
    }

    send(404, { error: 'Not found' });
  } catch (error) {
    console.error(error);
    send(500, { error: error?.message || 'Internal error' });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`[mock-api] listening on ${baseUrl}`);
});
