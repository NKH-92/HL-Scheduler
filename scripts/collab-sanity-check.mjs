import assert from 'node:assert/strict';
import {
  buildLegacyBoardImport,
  computeCardRollup,
  createDefaultColumns,
  deriveColumnKindFromProgress,
  normalizeCardTaskDependencies,
} from '../src/collab/model.js';
import { getAllowedOrigins, resolveAllowedOrigin } from '../server/public-schedules-worker/src/cors-utils.mjs';
import { sanitizeShareSnapshot } from '../server/public-schedules-worker/src/share-snapshot.mjs';

assert.equal(deriveColumnKindFromProgress(0), 'todo');
assert.equal(deriveColumnKindFromProgress(55), 'doing');
assert.equal(deriveColumnKindFromProgress(100), 'done');

const columns = createDefaultColumns();
assert.equal(columns.length, 3);
assert.deepEqual(columns.map((column) => column.kind), ['todo', 'doing', 'done']);

const normalizedDeps = normalizeCardTaskDependencies([
  { id: 't1', dependencyIds: [] },
  { id: 't2', dependencyIds: ['t1', 'missing', 't1', 't2'] },
]);
assert.deepEqual(normalizedDeps[1].dependencyIds, ['t1']);

const rollup = computeCardRollup({
  tasks: [
    { startDate: '2026-03-01', endDate: '2026-03-03', progress: 0 },
    { startDate: '2026-03-05', endDate: '2026-03-10', progress: 100 },
  ],
});
assert.equal(rollup.progress, 50);
assert.equal(rollup.startDate, '2026-03-01');
assert.equal(rollup.endDate, '2026-03-10');

const imported = buildLegacyBoardImport({
  scheduleId: 'legacy-1',
  name: '기존 일정',
  tasks: [
    {
      id: 'task-1',
      taskName: '가져온 작업',
      start: '2026-04-01',
      end: '2026-04-03',
      progress: 25,
      memo: '안녕하세요',
      dependencies: [],
    },
  ],
  vacations: [{ id: 'vac-1', title: '휴무', start: '2026-04-02', end: '2026-04-02' }],
});
assert.equal(imported.cards.length, 1);
assert.equal(imported.cards[0].columnKind, 'doing');
assert.equal(imported.cardTasks.length, 1);
assert.equal(imported.cardTasks[0].title, '가져온 작업');
assert.equal(imported.timeOffEntries.length, 1);

assert.deepEqual(getAllowedOrigins({}), []);
assert.deepEqual(
  getAllowedOrigins({
    PUBLIC_APP_URL: 'https://public.example.com/collab',
    ADMIN_APP_URL: 'https://admin.example.com/',
  }),
  ['https://public.example.com', 'https://admin.example.com'],
);
assert.equal(resolveAllowedOrigin('https://evil.example.com', {}), null);
assert.equal(
  resolveAllowedOrigin('https://public.example.com', {
    PUBLIC_APP_URL: 'https://public.example.com/collab',
  }),
  'https://public.example.com',
);

const sanitizedBoardShare = sanitizeShareSnapshot(
  {
    workspace: {
      id: 'workspace-1',
      name: '협업 공간',
      description: '설명',
      createdByUserId: 'user-1',
      createdAt: 1,
      updatedAt: 2,
    },
    cards: [{ id: 'card-1', leadUserId: 'user-2', createdByUserId: 'user-3' }],
    cardTasks: [{ id: 'task-1', assigneeUserId: 'user-4', createdByUserId: 'user-5' }],
    timeOffEntries: [{ id: 'vac-1', memberUserId: 'user-6', memberName: '홍길동', memberEmail: 'test@example.com' }],
    members: [{ userId: 'user-7', email: 'member@example.com' }],
    shareLinks: [{ id: 'link-1' }],
  },
  {
    id: 'share-1',
    workspaceId: 'workspace-1',
    boardId: 'board-1',
    scope: 'board',
    tokenHint: 'abcd1234',
    createdByUserId: 'user-8',
    createdAt: 10,
    updatedAt: 11,
  },
);
assert.deepEqual(sanitizedBoardShare.members, []);
assert.deepEqual(sanitizedBoardShare.timeOffEntries, []);
assert.equal(sanitizedBoardShare.workspace.createdByUserId, undefined);
assert.equal(sanitizedBoardShare.cards[0].leadUserId, null);
assert.equal(sanitizedBoardShare.cardTasks[0].assigneeUserId, null);
assert.equal(sanitizedBoardShare.share.createdByUserId, undefined);

console.log('collab-sanity-check ok');
