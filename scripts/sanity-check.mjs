import assert from 'node:assert/strict';
import { formatDate, parseYmd, toUtcMidnightMs } from '../src/utils/dates.js';
import { normalizeTasks, normalizeVacations } from '../src/utils/data.js';
import { applyDependencyScheduling, findDependencyCycleIds } from '../src/utils/dependencies.js';
import { resolvePostAuthNavigation } from '../src/utils/authRedirect.js';
import { extractApiErrorMessage, trimTrailingSlashes } from '../src/utils/apiClient.js';
import { resolveImportedProjectName, stripUtf8Bom } from '../src/utils/imports.js';
import { getPublicScheduleStatusLabel, normalizePublicScheduleStatus } from '../src/utils/publicScheduleStatus.js';
import { buildSharePath, buildWorkspacePath, parseAppRoute } from '../src/collab/router.js';
import { routeCollabRequest } from '../server/public-schedules-worker/src/collab-router.mjs';
import { createAuthAdminDomain } from '../server/public-schedules-worker/src/auth-admin.mjs';
import { createFolderDomain } from '../server/public-schedules-worker/src/folders.mjs';
import {
  appendActivityEntries,
  buildScheduleActivityEntries,
  buildScheduleSummaryPayload,
  encodeScheduleSummaryPayload,
  normalizeActivityLog,
  normalizeScheduleStatus,
  readScheduleSummaryFromRow,
} from '../server/public-schedules-worker/src/schedule-summary.mjs';
import { routeWorkerRequest } from '../server/public-schedules-worker/src/worker-router.mjs';
import {
  buildTeamLeadStats,
  buildWeeklyReportCsv,
  buildWeeklyReportMarkdown,
  filterTeamLeadSchedules,
  normalizeBoardOverview,
} from '../src/utils/publicSchedulesBoard.js';

const parsed = parseYmd('2024-02-03');
assert.ok(parsed, 'parseYmd should parse valid date');
assert.equal(formatDate(parsed), '2024-02-03');
assert.ok(Number.isFinite(toUtcMidnightMs('2024-02-03')));
assert.equal(trimTrailingSlashes('https://example.com///'), 'https://example.com');
assert.equal(extractApiErrorMessage({ error: 'Boom' }, 500), 'Boom');

const normalizedTasks = normalizeTasks([
  { start: '2024-05-10', end: '2024-05-01', progress: 150 },
  { start: 'invalid', end: '2024-05-02', progress: -5 },
]);
assert.equal(normalizedTasks[0].start, '2024-05-01');
assert.equal(normalizedTasks[0].end, '2024-05-10');
assert.equal(normalizedTasks[0].progress, 100);
assert.equal(normalizedTasks[1].progress, 0);

const normalizedVacations = normalizeVacations([
  { start: '2024-01-03', end: '2024-01-01' },
  { start: '' },
]);
assert.equal(normalizedVacations.length, 1);
assert.equal(normalizedVacations[0].start, '2024-01-01');
assert.equal(normalizedVacations[0].end, '2024-01-03');

const schedulingResult = applyDependencyScheduling([
  { id: 'a', start: '2024-01-01', end: '2024-01-01', dependencies: [] },
  { id: 'b', start: '2023-12-28', end: '2023-12-30', dependencies: ['a'] },
]);
const shiftedTask = schedulingResult.tasks.find((task) => task.id === 'b');
assert.ok(shiftedTask);
assert.equal(shiftedTask.start, '2024-01-02');
assert.equal(shiftedTask.end, '2024-01-04');
assert.ok(schedulingResult.shiftedTaskIds.includes('b'));

const cycleIds = new Set(
  findDependencyCycleIds([
    { id: 'x', dependencies: ['y'] },
    { id: 'y', dependencies: ['x'] },
    { id: 'z', dependencies: [] },
  ]),
);
assert.equal(cycleIds.has('x'), true);
assert.equal(cycleIds.has('y'), true);
assert.equal(cycleIds.has('z'), false);

assert.equal(stripUtf8Bom('\ufeff{"ok":true}'), '{"ok":true}');
assert.equal(resolveImportedProjectName({ sourceName: '공유 일정' }), '공유 일정');
assert.equal(resolveImportedProjectName({ parsedName: '파일 프로젝트', sourceName: '공유 일정' }), '파일 프로젝트');

assert.equal(normalizePublicScheduleStatus('In progress'), 'in_progress');
assert.equal(normalizePublicScheduleStatus('completed'), 'closed');
assert.equal(getPublicScheduleStatusLabel('holding'), 'Holding');
assert.equal(normalizeScheduleStatus('In progress'), 'in_progress');

const normalizedActivity = normalizeActivityLog([
  { id: 'older', type: 'note', message: 'older', actor_email: 'OLDER@EXAMPLE.COM', at: 10 },
  { id: 'newer', type: 'update', message: 'newer', actorEmail: 'newer@example.com', createdAt: 20 },
  { id: 'empty', type: 'noop', message: '   ', at: 30 },
]);
assert.deepEqual(
  normalizedActivity.map((entry) => ({ id: entry.id, actorEmail: entry.actorEmail, at: entry.at })),
  [
    { id: 'newer', actorEmail: 'newer@example.com', at: 20 },
    { id: 'older', actorEmail: 'older@example.com', at: 10 },
  ],
);

const scheduleSummary = buildScheduleSummaryPayload({
  data: {
    holdingReason: '  외부 승인 대기  ',
    nextAction: '  승인 요청 재발송  ',
    tasks: [
      {
        taskName: 'Coordination',
        assignee: 'Kim',
        department: 'Planning',
        start: '2099-03-01',
        end: '2099-03-03',
        progress: 100,
      },
    ],
    activityLog: normalizedActivity,
  },
  updatedAt: 20,
  status: 'holding',
});
assert.equal(scheduleSummary.holdingReason, '외부 승인 대기');
assert.equal(scheduleSummary.nextAction, '승인 요청 재발송');
assert.equal(scheduleSummary.recentActivity[0].id, 'newer');
assert.equal(scheduleSummary.overview.primaryAssignee, 'Kim');
assert.equal(scheduleSummary.overview.primaryDepartment, 'Planning');
assert.equal(scheduleSummary.overview.riskLabels.includes('보류'), true);

const encodedScheduleSummary = encodeScheduleSummaryPayload(scheduleSummary);
const cachedScheduleSummary = readScheduleSummaryFromRow({
  holding_reason: encodedScheduleSummary.holdingReason,
  next_action: encodedScheduleSummary.nextAction,
  recent_activity_json: encodedScheduleSummary.recentActivityJson,
  overview_json: encodedScheduleSummary.overviewJson,
  status: 'holding',
  updated_at: 20,
});
assert.equal(cachedScheduleSummary?.holdingReason, '외부 승인 대기');
assert.equal(cachedScheduleSummary?.nextAction, '승인 요청 재발송');
assert.equal(cachedScheduleSummary?.recentActivity[0].id, 'newer');
assert.equal(cachedScheduleSummary?.overview.primaryAssignee, 'Kim');

const scheduleUpdateEntries = buildScheduleActivityEntries({
  payload: { tasks: [] },
  existingData: { name: 'Alpha', status: 'planning', holdingReason: '', nextAction: '' },
  nextData: { name: 'Beta', status: 'holding', holdingReason: 'Blocked', nextAction: 'Call vendor' },
  actorEmail: 'owner@example.com',
  at: 30,
});
assert.deepEqual(
  scheduleUpdateEntries.map((entry) => entry.type),
  ['status', 'holding_reason', 'next_action', 'rename', 'schedule'],
);
assert.equal(scheduleUpdateEntries[0].message, '상태 변경: Planning -> Holding');

const appendedActivity = appendActivityEntries(normalizedActivity, [
  { id: 'latest', type: 'update', message: 'latest', actorEmail: 'latest@example.com', at: 40 },
]);
assert.equal(appendedActivity[0].id, 'latest');
assert.equal(appendedActivity[1].id, 'newer');

const teamLeadFixtures = [
  {
    id: 'schedule-1',
    name: 'Alpha',
    status: 'in_progress',
    holdingReason: '',
    nextAction: 'QA review',
    updatedAt: Date.UTC(2026, 2, 7),
    overview: {
      progress: 65,
      primaryAssignee: 'Kim',
      primaryDepartment: 'Planning',
      assignees: ['Kim'],
      departments: ['Planning'],
      isDelayed: true,
      isDueToday: false,
      isDueThisWeek: true,
      isStale: false,
      riskLevel: 'high',
      riskLabels: ['지연', '이번 주 마감'],
      endDate: '2026-03-08',
    },
  },
  {
    id: 'schedule-2',
    name: 'Beta',
    status: 'holding',
    holdingReason: '외부 승인 대기',
    nextAction: '승인 요청 재발송',
    updatedAt: Date.UTC(2026, 2, 1),
    overview: {
      progress: 20,
      primaryAssignee: 'Lee',
      primaryDepartment: 'Design',
      assignees: ['Lee'],
      departments: ['Design'],
      isDelayed: false,
      isDueToday: false,
      isDueThisWeek: false,
      isStale: true,
      riskLevel: 'medium',
      riskLabels: ['보류', '오래 미갱신'],
      endDate: '2026-03-20',
    },
  },
];

assert.equal(normalizeBoardOverview(teamLeadFixtures[0]).primaryAssignee, 'Kim');
assert.equal(filterTeamLeadSchedules(teamLeadFixtures, { assignee: 'Kim' }).length, 1);
assert.equal(filterTeamLeadSchedules(teamLeadFixtures, { risk: 'holding' }).length, 1);

const teamLeadStats = buildTeamLeadStats(teamLeadFixtures);
assert.equal(teamLeadStats.totalProjects, 2);
assert.equal(teamLeadStats.inProgress, 1);
assert.equal(teamLeadStats.holding, 1);
assert.equal(teamLeadStats.delayed, 1);
assert.equal(teamLeadStats.stale, 1);
assert.equal(teamLeadStats.averageProgress, 43);

const weeklyMarkdown = buildWeeklyReportMarkdown({
  folderName: '신규사업',
  items: teamLeadFixtures,
  assigneeFilter: '',
  departmentFilter: '',
  riskFilter: 'all',
  generatedAt: Date.UTC(2026, 2, 7, 9, 0, 0),
});
assert.match(weeklyMarkdown, /주간 프로젝트 현황 보고서/);
assert.match(weeklyMarkdown, /Alpha/);
assert.match(weeklyMarkdown, /Holding 사유: 외부 승인 대기/);

const weeklyCsv = buildWeeklyReportCsv({
  folderName: '신규사업',
  items: teamLeadFixtures,
  generatedAt: Date.UTC(2026, 2, 7, 9, 0, 0),
});
assert.match(weeklyCsv, /project_name,status,primary_assignee/);
assert.match(weeklyCsv, /Alpha/);
assert.match(weeklyCsv, /외부 승인 대기/);

assert.deepEqual(
  resolvePostAuthNavigation({
    user: { isAdmin: true },
    appRole: 'admin',
    adminAppUrl: 'https://admin.example.com',
    publicAppUrl: 'https://public.example.com',
  }),
  { action: 'stay', activeMainTab: 'edit', activeEditorTab: 'tasks' },
);
assert.deepEqual(
  resolvePostAuthNavigation({
    user: { isAdmin: false },
    appRole: 'admin',
    adminAppUrl: 'https://admin.example.com',
    publicAppUrl: 'https://public.example.com',
  }),
  { action: 'redirect', url: 'https://public.example.com' },
);

assert.deepEqual(parseAppRoute('/'), { type: 'legacy' });
assert.deepEqual(parseAppRoute('/collab'), { type: 'collab-home' });
assert.deepEqual(parseAppRoute('/collab/w/workspace-1'), { type: 'collab-workspace', workspaceId: 'workspace-1' });
assert.deepEqual(parseAppRoute('/share/token-1'), { type: 'collab-share', token: 'token-1' });
assert.equal(buildWorkspacePath('workspace-1'), '/collab/w/workspace-1');
assert.equal(buildSharePath('token-1'), '/share/token-1');

const authDomain = createAuthAdminDomain({
  DEFAULT_AUTH_RATE_LIMIT_MAX_ATTEMPTS: 10,
  DEFAULT_AUTH_RATE_LIMIT_WINDOW_SECONDS: 300,
  MAX_PASSWORD_LENGTH: 128,
  MIN_PASSWORD_LENGTH: 8,
  PBKDF2_ITERATIONS: 100000,
  PBKDF2_KEY_LENGTH_BITS: 256,
  PBKDF2_MAX_ITERATIONS: 100000,
  PBKDF2_MIN_ITERATIONS: 1000,
  SESSION_COOKIE_NAME_DEFAULT: 'hl_scheduler_session',
  SESSION_COOKIE_PATH: '/',
  STATUS_APPROVED: 'approved',
  STATUS_DISABLED: 'disabled',
  STATUS_PENDING: 'pending',
  STATUS_REJECTED: 'rejected',
  clamp: (value, min, max) => Math.max(min, Math.min(max, value)),
  errorResponse: (message, { status, details } = {}) => ({ message, status, details }),
  getRequestUrl: () => new URL('https://example.com/api/admin/users'),
  isValidEmail: (value) => /@/.test(String(value || '')),
  jsonResponse: (payload, init = {}) => ({ payload, init }),
  normalizeEmail: (value) => String(value || '').trim().toLowerCase(),
  normalizeEmailList: (value) => (Array.isArray(value) ? value : String(value || '').split(',').filter(Boolean)),
  nowMs: () => 123,
  parseBoolean: (value, fallback = false) => {
    if (value == null) return fallback;
    const normalized = String(value).trim().toLowerCase();
    if (normalized === 'true' || normalized === '1') return true;
    if (normalized === 'false' || normalized === '0') return false;
    return fallback;
  },
  parseD1Rows: (result) => result?.results || [],
  readJsonObjectBody: async () => ({ ok: true, payload: {} }),
  toInt: (value, fallback) => {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? Math.trunc(numeric) : fallback;
  },
  toSafeTimestamp: (value) => {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? Math.trunc(numeric) : null;
  },
});
assert.equal(typeof authDomain.handleLoginAuth, 'function');
assert.equal(authDomain.isAdminSurfaceEnabled({ ENABLE_ADMIN_ENDPOINTS: 'true' }), true);
assert.deepEqual(authDomain.buildUserPermissions({ status: 'approved', isAdmin: true }), {
  isApproved: true,
  canEditSchedules: true,
  canManageFolders: true,
  canManageUsers: true,
});

const folderDomain = createFolderDomain({
  MAX_FOLDER_DEPTH: 4,
  MAX_FOLDER_NAME_LENGTH: 40,
  buildFolderContextDeps: {},
  ensureAdminUser: async () => ({ user: { id: 'admin-1' } }),
  ensureNotReadOnly: () => null,
  errorResponse: (message, { status, details } = {}) => ({ message, status, details }),
  getSharedScheduleId: () => '',
  isAdminSurfaceEnabled: () => true,
  jsonResponse: (payload, init = {}) => ({ payload, init }),
  normalizeFolderId: (value) => (value == null || String(value).trim() === '' ? null : String(value).trim()),
  normalizeFolderName: (value) => String(value || '').trim(),
  nowMs: () => 456,
  parseD1Rows: (result) => result?.results || [],
  readJsonObjectBody: async () => ({ ok: true, payload: {} }),
  resolveFolderPath: async () => 'Folder A',
});
assert.equal(typeof folderDomain.handleListFoldersTree, 'function');
assert.equal(typeof folderDomain.handleCreateFolder, 'function');

const collabRoute = await routeCollabRequest({
  request: {},
  env: {},
  helpers: {
    errorResponse: (message, { status }) => ({ message, status }),
  },
  url: new URL('https://example.com/api/v2/realtime'),
  method: 'GET',
  pathname: '/api/v2/realtime',
  handlers: {
    handleListWorkspaces: async () => 'list-workspaces',
    handleCreateWorkspace: async () => 'create-workspace',
    handleGetWorkspaceSnapshot: async (_request, _env, _helpers, workspaceId) => `snapshot:${workspaceId}`,
    handleCreateBoard: async () => 'create-board',
    handleCreateBoardColumn: async () => 'create-column',
    handleCreateCard: async () => 'create-card',
    handleCreateTask: async () => 'create-task',
    handleCreateTimeOff: async () => 'create-time-off',
    handleCreateShareLink: async () => 'create-share-link',
    handleImportLegacy: async () => 'import-legacy',
    handleRealtimeRequest: async () => 'realtime',
    handlePatchCard: async (_request, _env, _helpers, cardId) => `patch-card:${cardId}`,
    handleDeleteCard: async (_request, _env, _helpers, cardId) => `delete-card:${cardId}`,
    handlePatchTask: async () => 'patch-task',
    handleDeleteTask: async () => 'delete-task',
    handlePatchTimeOff: async () => 'patch-timeoff',
    handleDeleteTimeOff: async () => 'delete-timeoff',
    handleGetShareSnapshot: async (_request, _env, _helpers, token) => `share:${token}`,
  },
});
assert.equal(collabRoute, 'realtime');

const workerRoute = await routeWorkerRequest({
  request: {},
  env: {},
  url: new URL('https://example.com/api/v2/workspaces'),
  method: 'GET',
  pathname: '/api/v2/workspaces',
  adminSurfaceEnabled: true,
  decodePathSegment: (value) => decodeURIComponent(value),
  textResponse: (text) => ({ text }),
  jsonResponse: (payload) => ({ payload }),
  errorResponse: (message, { status }) => ({ message, status }),
  handleCollabRequest: async () => 'collab',
  handleRegisterAuth: async () => 'register',
  handleLoginAuth: async () => 'login',
  handleAuthMe: async () => 'me',
  handleAuthLogout: async () => 'logout',
  handleAdminListUsers: async () => 'admin-users',
  handleAdminApproveUser: async () => 'admin-approve',
  handleAdminRejectUser: async () => 'admin-reject',
  handleAdminResetPassword: async () => 'admin-reset',
  handleListSchedules: async () => 'list-schedules',
  handleGetSchedule: async () => 'get-schedule',
  handleUpdateSchedule: async () => 'update-schedule',
  handleDeleteSchedule: async () => 'delete-schedule',
  handleCreateSchedule: async () => 'create-schedule',
  handlePatchScheduleFolder: async () => 'patch-folder',
  handleListFoldersTree: async () => 'folders-tree',
  handleCreateFolder: async () => 'create-folder',
  handlePatchFolderOrder: async () => 'patch-folder-order',
  handleDeleteFolder: async () => 'delete-folder',
  helpers: {
    jsonResponse: (payload) => ({ payload }),
    errorResponse: (message, { status }) => ({ message, status }),
    readJsonObjectBody: async () => ({ ok: true, payload: {} }),
    ensureAuthenticatedUser: async () => ({ user: { id: 'user-1' } }),
  },
});
assert.equal(workerRoute, 'collab');

console.log('sanity-check ok');
