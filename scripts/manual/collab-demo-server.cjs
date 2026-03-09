/* eslint-disable no-console */
const http = require('http');

const PORT_ARG_INDEX = process.argv.indexOf('--port');
const PORT = PORT_ARG_INDEX >= 0 ? Number(process.argv[PORT_ARG_INDEX + 1]) || 8788 : 8788;
const HOST = '127.0.0.1';
const baseUrl = `http://${HOST}:${PORT}`;

const withCors = (req, res) => {
  const origin = req.headers.origin;
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Vary', 'Origin');
  } else {
    res.setHeader('Access-Control-Allow-Origin', '*');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
};

const now = Date.now();

const snapshot = {
  readOnly: true,
  share: {
    id: 'share-demo',
    workspaceId: 'ws-demo',
    boardId: 'board-roadmap',
    scope: 'workspace',
    tokenHint: 'demo-share',
    createdAt: now - 3600000,
    updatedAt: now - 3600000,
  },
  workspace: {
    id: 'ws-demo',
    name: '스케줄러 협업 데모',
    description: '같은 하위 작업 데이터를 칸반, 세부 간트, 팀 플래너에서 함께 보여주는 데모입니다.',
    createdAt: now - 86400000 * 12,
    updatedAt: now - 300000,
  },
  boards: [
    {
      id: 'board-roadmap',
      workspaceId: 'ws-demo',
      name: '출시 로드맵',
      description: '주요 실행 보드',
      createdAt: now - 86400000 * 12,
      updatedAt: now - 300000,
    },
  ],
  columns: [
    { id: 'col-planned', boardId: 'board-roadmap', name: '예정', kind: 'todo', sortOrder: 1 },
    { id: 'col-doing', boardId: 'board-roadmap', name: '진행 중', kind: 'doing', sortOrder: 2 },
    { id: 'col-done', boardId: 'board-roadmap', name: '완료', kind: 'done', sortOrder: 3 },
  ],
  cards: [
    {
      id: 'card-discovery',
      workspaceId: 'ws-demo',
      boardId: 'board-roadmap',
      columnId: 'col-done',
      title: '요구사항 검토 및 범위 확정',
      description: '요구사항 검토를 마쳤고 이해관계자와 MVP 범위를 확정했습니다.',
      leadName: 'Mina',
      leadEmail: 'mina@demo.local',
      leadPosition: 'PM',
      priority: 'planned',
      tags: ['요구사항', 'MVP'],
      sortOrder: 1,
      startDate: '2026-03-01',
      endDate: '2026-03-05',
      progress: 100,
      version: 3,
      createdAt: now - 86400000 * 7,
      updatedAt: now - 86400000 * 2,
    },
    {
      id: 'card-collab-ui',
      workspaceId: 'ws-demo',
      boardId: 'board-roadmap',
      columnId: 'col-doing',
      title: '협업 UX 기본 구조',
      description: '보드 레인, 상세 패널, 팀 플래너 동기화를 한 화면으로 정리하고 있습니다.',
      leadName: 'Jae',
      leadEmail: 'jae@demo.local',
      leadPosition: 'Frontend',
      priority: 'active',
      tags: ['프런트엔드', '협업'],
      sortOrder: 2,
      startDate: '2026-03-06',
      endDate: '2026-03-18',
      progress: 58,
      version: 5,
      createdAt: now - 86400000 * 6,
      updatedAt: now - 120000,
    },
    {
      id: 'card-share-runtime',
      workspaceId: 'ws-demo',
      boardId: 'board-roadmap',
      columnId: 'col-planned',
      title: '공유 링크와 실시간 런타임',
      description: 'Worker 기반 공유 스냅샷과 실시간 전파 기능을 다음 단계로 준비 중입니다.',
      leadName: 'Ara',
      leadEmail: 'ara@demo.local',
      leadPosition: 'Platform',
      priority: 'planned',
      tags: ['백엔드', '실시간'],
      sortOrder: 3,
      startDate: '2026-03-17',
      endDate: '2026-03-28',
      progress: 0,
      version: 1,
      createdAt: now - 86400000 * 4,
      updatedAt: now - 300000,
    },
  ],
  cardTasks: [
    {
      id: 'task-wireframe',
      cardId: 'card-collab-ui',
      title: '보드 레이아웃 다듬기',
      assigneeName: 'Jae',
      assigneeEmail: 'jae@demo.local',
      assigneePosition: 'Frontend',
      startDate: '2026-03-06',
      endDate: '2026-03-09',
      progress: 100,
      note: '반응형 컬럼 기본 구조를 확정했습니다.',
      dependencyIds: [],
      version: 2,
    },
    {
      id: 'task-drawer',
      cardId: 'card-collab-ui',
      title: '상세 패널과 간트 연결',
      assigneeName: 'Jae',
      assigneeEmail: 'jae@demo.local',
      assigneePosition: 'Frontend',
      startDate: '2026-03-10',
      endDate: '2026-03-13',
      progress: 75,
      note: '선택한 카드에 따라 간트와 하위 작업 패널이 함께 갱신됩니다.',
      dependencyIds: ['task-wireframe'],
      version: 4,
    },
    {
      id: 'task-planner',
      cardId: 'card-collab-ui',
      title: '하위 작업을 팀 플래너에 반영',
      assigneeName: 'Sora',
      assigneeEmail: 'sora@demo.local',
      assigneePosition: 'Frontend',
      startDate: '2026-03-12',
      endDate: '2026-03-18',
      progress: 40,
      note: '별도 일정 행을 만들지 않고 같은 하위 작업 레코드를 재사용합니다.',
      dependencyIds: ['task-drawer'],
      version: 3,
    },
    {
      id: 'task-share-api',
      cardId: 'card-share-runtime',
      title: '공유 스냅샷 엔드포인트',
      assigneeName: 'Ara',
      assigneeEmail: 'ara@demo.local',
      assigneePosition: 'Platform',
      startDate: '2026-03-17',
      endDate: '2026-03-20',
      progress: 0,
      note: '읽기 전용 스냅샷에서 워크스페이스, 카드, 작업, 휴무를 함께 내려줘야 합니다.',
      dependencyIds: [],
      version: 1,
    },
    {
      id: 'task-realtime',
      cardId: 'card-share-runtime',
      title: '워크스페이스 실시간 전파',
      assigneeName: 'Ara',
      assigneeEmail: 'ara@demo.local',
      assigneePosition: 'Platform',
      startDate: '2026-03-21',
      endDate: '2026-03-28',
      progress: 0,
      note: 'Durable Object가 업데이트와 접속 현황을 함께 전파해야 합니다.',
      dependencyIds: ['task-share-api'],
      version: 1,
    },
    {
      id: 'task-scope',
      cardId: 'card-discovery',
      title: '범위 확정 검토',
      assigneeName: 'Mina',
      assigneeEmail: 'mina@demo.local',
      assigneePosition: 'PM',
      startDate: '2026-03-01',
      endDate: '2026-03-05',
      progress: 100,
      note: '완료되었습니다.',
      dependencyIds: [],
      version: 2,
    },
  ],
  dependencies: [
    { taskId: 'task-drawer', dependencyTaskId: 'task-wireframe', createdAt: now - 86400000 * 5 },
    { taskId: 'task-planner', dependencyTaskId: 'task-drawer', createdAt: now - 86400000 * 4 },
    { taskId: 'task-realtime', dependencyTaskId: 'task-share-api', createdAt: now - 86400000 * 2 },
  ],
  timeOffEntries: [
    {
      id: 'timeoff-ops',
      workspaceId: 'ws-demo',
      memberUserId: null,
      memberName: '',
      memberEmail: '',
      title: '인프라 점검',
      startDate: '2026-03-14',
      endDate: '2026-03-15',
      version: 1,
      createdAt: now - 86400000 * 3,
      updatedAt: now - 86400000 * 3,
    },
  ],
  members: [
    { userId: 'u-mina', email: 'mina@demo.local', role: 'owner', createdAt: now - 86400000 * 12 },
    { userId: 'u-jae', email: 'jae@demo.local', role: 'member', createdAt: now - 86400000 * 10 },
    { userId: 'u-sora', email: 'sora@demo.local', role: 'member', createdAt: now - 86400000 * 10 },
    { userId: 'u-ara', email: 'ara@demo.local', role: 'member', createdAt: now - 86400000 * 9 },
  ],
};

const server = http.createServer((req, res) => {
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

  if (req.method === 'GET' && url.pathname === '/healthz') {
    send(200, { ok: true });
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/v2/share-links/demo-share/snapshot') {
    send(200, snapshot);
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/v2/realtime') {
    send(426, { error: 'WebSocket 업그레이드가 필요합니다.' });
    return;
  }

  send(404, { error: '찾을 수 없습니다.' });
});

server.listen(PORT, HOST, () => {
  console.log(`협업 데모 서버 실행 중: ${baseUrl}`);
});
