import { DurableObject } from 'cloudflare:workers';
import {
  DEFAULT_BOARD_COLUMN_PRESETS,
  buildColumnMap,
  buildLegacyImportRows,
  deriveColumnKindFromProgress,
  normalizeDateYmd,
  rollupCardSummary,
} from './collab-model.mjs';
import { sanitizeShareSnapshot } from './share-snapshot.mjs';

const DAY_MS = 24 * 60 * 60 * 1000;

const trim = (value) => String(value ?? '').trim();
const normalizeEmail = (value) => trim(value).toLowerCase();
const isPlainObject = (value) => value != null && typeof value === 'object' && !Array.isArray(value);
const arrayFromResult = (result) => (Array.isArray(result?.results) ? result.results : []);
const nowMs = () => Date.now();

const createId = () => {
  if (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
};

const clampProgress = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.min(100, Math.round(parsed)));
};

const toInt = (value, fallback = 0) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.trunc(parsed);
};

const normalizeTextArray = (value) => {
  const input = Array.isArray(value) ? value : typeof value === 'string' ? value.split(/[,\n;]+/g) : [];
  const seen = new Set();
  const result = [];
  input.forEach((entry) => {
    const item = trim(entry);
    if (!item || seen.has(item)) return;
    seen.add(item);
    result.push(item);
  });
  return result;
};

const safeJsonParse = (value, fallback = null) => {
  try {
    return JSON.parse(String(value || ''));
  } catch {
    return fallback;
  }
};

const jsonArrayString = (value) => JSON.stringify(normalizeTextArray(value));

const mapWorkspaceRow = (row) => ({
  id: trim(row?.id),
  name: trim(row?.name),
  description: trim(row?.description),
  createdByUserId: trim(row?.created_by_user_id),
  createdAt: toInt(row?.created_at, 0),
  updatedAt: toInt(row?.updated_at, 0),
  role: trim(row?.role || 'member') || 'member',
});

const mapBoardRow = (row) => ({
  id: trim(row?.id),
  workspaceId: trim(row?.workspace_id),
  name: trim(row?.name),
  description: trim(row?.description),
  createdAt: toInt(row?.created_at, 0),
  updatedAt: toInt(row?.updated_at, 0),
});

const mapColumnRow = (row) => ({
  id: trim(row?.id),
  boardId: trim(row?.board_id),
  name: trim(row?.name),
  kind: trim(row?.kind) || 'custom',
  sortOrder: toInt(row?.sort_order, 0),
  createdAt: toInt(row?.created_at, 0),
  updatedAt: toInt(row?.updated_at, 0),
});

const mapCardRow = (row) => ({
  id: trim(row?.id),
  workspaceId: trim(row?.workspace_id),
  boardId: trim(row?.board_id),
  columnId: trim(row?.column_id),
  title: trim(row?.title),
  description: trim(row?.description),
  leadUserId: trim(row?.lead_user_id) || null,
  leadName: trim(row?.lead_name),
  leadEmail: normalizeEmail(row?.lead_email),
  leadPosition: trim(row?.lead_position),
  priority: trim(row?.priority) || 'planned',
  tags: normalizeTextArray(safeJsonParse(row?.tags_json, [])),
  sortOrder: toInt(row?.sort_order, 0),
  startDate: trim(row?.start_date),
  endDate: trim(row?.end_date),
  progress: clampProgress(row?.progress),
  version: toInt(row?.version, 1),
  createdByUserId: trim(row?.created_by_user_id) || null,
  createdAt: toInt(row?.created_at, 0),
  updatedAt: toInt(row?.updated_at, 0),
});

const mapTaskRow = (row) => ({
  id: trim(row?.id),
  cardId: trim(row?.card_id),
  title: trim(row?.title),
  assigneeUserId: trim(row?.assignee_user_id) || null,
  assigneeName: trim(row?.assignee_name),
  assigneeEmail: normalizeEmail(row?.assignee_email),
  assigneePosition: trim(row?.assignee_position),
  startDate: trim(row?.start_date),
  endDate: trim(row?.end_date),
  progress: clampProgress(row?.progress),
  note: trim(row?.note),
  sortOrder: toInt(row?.sort_order, 0),
  version: toInt(row?.version, 1),
  createdByUserId: trim(row?.created_by_user_id) || null,
  createdAt: toInt(row?.created_at, 0),
  updatedAt: toInt(row?.updated_at, 0),
});

const mapDependencyRow = (row) => ({
  taskId: trim(row?.task_id),
  dependencyTaskId: trim(row?.dependency_task_id),
  createdAt: toInt(row?.created_at, 0),
});

const mapTimeOffRow = (row) => ({
  id: trim(row?.id),
  workspaceId: trim(row?.workspace_id),
  memberUserId: trim(row?.member_user_id) || null,
  memberName: trim(row?.member_name),
  memberEmail: normalizeEmail(row?.member_email),
  title: trim(row?.title),
  startDate: trim(row?.start_date),
  endDate: trim(row?.end_date),
  version: toInt(row?.version, 1),
  createdAt: toInt(row?.created_at, 0),
  updatedAt: toInt(row?.updated_at, 0),
});

const mapShareLinkRow = (row) => ({
  id: trim(row?.id),
  workspaceId: trim(row?.workspace_id),
  boardId: trim(row?.board_id) || null,
  scope: trim(row?.scope) || 'workspace',
  tokenHint: trim(row?.token_hint),
  createdByUserId: trim(row?.created_by_user_id) || null,
  createdAt: toInt(row?.created_at, 0),
  updatedAt: toInt(row?.updated_at, 0),
});

const mapMemberRow = (row) => ({
  userId: trim(row?.user_id),
  email: normalizeEmail(row?.email),
  role: trim(row?.role || 'member') || 'member',
  createdAt: toInt(row?.created_at, 0),
});

const normalizeBaseVersion = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return Math.max(0, Math.trunc(parsed));
};

const buildDependencyMap = (tasks, dependencyRows) => {
  const validIds = new Set(tasks.map((task) => trim(task?.id)).filter(Boolean));
  const dependencyMap = new Map(tasks.map((task) => [trim(task.id), []]));
  dependencyRows.forEach((row) => {
    const taskId = trim(row?.taskId ?? row?.task_id);
    const dependencyTaskId = trim(row?.dependencyTaskId ?? row?.dependency_task_id);
    if (!taskId || !dependencyTaskId || !validIds.has(taskId) || !validIds.has(dependencyTaskId) || taskId === dependencyTaskId) {
      return;
    }
    const next = dependencyMap.get(taskId);
    if (!next || next.includes(dependencyTaskId)) return;
    next.push(dependencyTaskId);
  });
  return dependencyMap;
};

const normalizeTaskDependencies = (tasks, dependencyRows) => {
  const dependencyMap = buildDependencyMap(tasks, dependencyRows);
  return tasks.map((task) => ({
    ...task,
    dependencyIds: dependencyMap.get(trim(task.id)) || [],
  }));
};

const toUtcMs = (value) => {
  const ymd = normalizeDateYmd(value);
  if (!ymd) return Number.NaN;
  return Date.parse(`${ymd}T00:00:00Z`);
};

const utcMsToYmd = (value) => {
  if (!Number.isFinite(value)) return '';
  return new Date(value).toISOString().slice(0, 10);
};

const findDependencyCycleIds = (tasks) => {
  const graph = new Map(tasks.map((task) => [trim(task.id), Array.isArray(task.dependencyIds) ? task.dependencyIds : []]));
  const state = new Map();
  const stack = [];
  const cycleIds = new Set();

  const visit = (taskId) => {
    state.set(taskId, 1);
    stack.push(taskId);
    const deps = graph.get(taskId) || [];
    deps.forEach((depId) => {
      if (!graph.has(depId)) return;
      const depState = state.get(depId) || 0;
      if (depState === 0) {
        visit(depId);
        return;
      }
      if (depState === 1) {
        const startIndex = stack.lastIndexOf(depId);
        if (startIndex >= 0) {
          for (let index = startIndex; index < stack.length; index += 1) {
            cycleIds.add(stack[index]);
          }
        }
        cycleIds.add(depId);
      }
    });
    stack.pop();
    state.set(taskId, 2);
  };

  graph.forEach((_deps, taskId) => {
    if ((state.get(taskId) || 0) !== 0) return;
    visit(taskId);
  });

  return cycleIds;
};

const applyDependencyScheduling = (tasks) => {
  const safeTasks = Array.isArray(tasks) ? tasks : [];
  const cycleIds = findDependencyCycleIds(safeTasks);
  const idToTask = new Map(safeTasks.map((task) => [trim(task.id), task]));
  const indegree = new Map();
  const dependents = new Map();

  safeTasks.forEach((task) => {
    const taskId = trim(task.id);
    if (!taskId || cycleIds.has(taskId)) return;
    indegree.set(taskId, 0);
    dependents.set(taskId, []);
  });

  safeTasks.forEach((task) => {
    const taskId = trim(task.id);
    if (!indegree.has(taskId)) return;
    (Array.isArray(task.dependencyIds) ? task.dependencyIds : []).forEach((dependencyId) => {
      if (!indegree.has(dependencyId)) return;
      indegree.set(taskId, (indegree.get(taskId) || 0) + 1);
      dependents.get(dependencyId)?.push(taskId);
    });
  });

  const queue = [];
  indegree.forEach((value, taskId) => {
    if (value === 0) queue.push(taskId);
  });

  const orderedIds = [];
  for (let index = 0; index < queue.length; index += 1) {
    const currentId = queue[index];
    orderedIds.push(currentId);
    (dependents.get(currentId) || []).forEach((nextId) => {
      const nextDegree = (indegree.get(nextId) || 0) - 1;
      indegree.set(nextId, nextDegree);
      if (nextDegree === 0) queue.push(nextId);
    });
  }

  const startById = new Map();
  const endById = new Map();
  safeTasks.forEach((task) => {
    const taskId = trim(task.id);
    const startMs = toUtcMs(task.startDate);
    const endMs = toUtcMs(task.endDate || task.startDate);
    if (Number.isFinite(startMs)) startById.set(taskId, startMs);
    if (Number.isFinite(endMs)) endById.set(taskId, endMs < startMs ? startMs : endMs);
  });

  orderedIds.forEach((taskId) => {
    const currentTask = idToTask.get(taskId);
    if (!currentTask) return;
    const originalStartMs = startById.get(taskId);
    const originalEndMs = endById.get(taskId) ?? originalStartMs;
    const durationDays =
      Number.isFinite(originalStartMs) && Number.isFinite(originalEndMs)
        ? Math.max(1, Math.round((originalEndMs - originalStartMs) / DAY_MS) + 1)
        : 1;

    let earliestStart = null;
    (Array.isArray(currentTask.dependencyIds) ? currentTask.dependencyIds : []).forEach((dependencyId) => {
      const dependencyEnd = endById.get(dependencyId) ?? startById.get(dependencyId);
      if (!Number.isFinite(dependencyEnd)) return;
      const candidate = dependencyEnd + DAY_MS;
      if (earliestStart == null || candidate > earliestStart) earliestStart = candidate;
    });

    if (earliestStart != null && (!Number.isFinite(originalStartMs) || originalStartMs < earliestStart)) {
      startById.set(taskId, earliestStart);
      endById.set(taskId, earliestStart + (durationDays - 1) * DAY_MS);
    }
  });

  return safeTasks.map((task) => {
    const taskId = trim(task.id);
    const nextStart = startById.get(taskId);
    const nextEnd = endById.get(taskId);
    return {
      ...task,
      startDate: Number.isFinite(nextStart) ? utcMsToYmd(nextStart) : trim(task.startDate),
      endDate: Number.isFinite(nextEnd) ? utcMsToYmd(nextEnd) : trim(task.endDate || task.startDate),
    };
  });
};

const createShareToken = () => {
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('');
};

const sha256Hex = async (value) => {
  const buffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(value ?? '')));
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
};

const getCollabSchemaStatementsImpl = () => [
  [
    'CREATE TABLE IF NOT EXISTS collab_workspaces (',
    'id TEXT PRIMARY KEY,',
    'name TEXT NOT NULL,',
    'description TEXT NOT NULL DEFAULT "",',
    'created_by_user_id TEXT NOT NULL,',
    'created_at INTEGER NOT NULL,',
    'updated_at INTEGER NOT NULL',
    ')',
  ].join(' '),
  'CREATE INDEX IF NOT EXISTS collab_workspaces_updated_idx ON collab_workspaces(updated_at DESC)',
  [
    'CREATE TABLE IF NOT EXISTS collab_workspace_members (',
    'workspace_id TEXT NOT NULL,',
    'user_id TEXT NOT NULL,',
    'role TEXT NOT NULL DEFAULT "member",',
    'created_at INTEGER NOT NULL,',
    'PRIMARY KEY (workspace_id, user_id)',
    ')',
  ].join(' '),
  'CREATE INDEX IF NOT EXISTS collab_workspace_members_user_idx ON collab_workspace_members(user_id)',
  [
    'CREATE TABLE IF NOT EXISTS collab_boards (',
    'id TEXT PRIMARY KEY,',
    'workspace_id TEXT NOT NULL,',
    'name TEXT NOT NULL,',
    'description TEXT NOT NULL DEFAULT "",',
    'created_at INTEGER NOT NULL,',
    'updated_at INTEGER NOT NULL',
    ')',
  ].join(' '),
  'CREATE INDEX IF NOT EXISTS collab_boards_workspace_idx ON collab_boards(workspace_id)',
  [
    'CREATE TABLE IF NOT EXISTS collab_board_columns (',
    'id TEXT PRIMARY KEY,',
    'board_id TEXT NOT NULL,',
    'name TEXT NOT NULL,',
    'kind TEXT NOT NULL DEFAULT "custom",',
    'sort_order INTEGER NOT NULL DEFAULT 0,',
    'created_at INTEGER NOT NULL,',
    'updated_at INTEGER NOT NULL',
    ')',
  ].join(' '),
  'CREATE INDEX IF NOT EXISTS collab_board_columns_board_idx ON collab_board_columns(board_id, sort_order)',
  [
    'CREATE TABLE IF NOT EXISTS collab_cards (',
    'id TEXT PRIMARY KEY,',
    'workspace_id TEXT NOT NULL,',
    'board_id TEXT NOT NULL,',
    'column_id TEXT NOT NULL,',
    'title TEXT NOT NULL,',
    'description TEXT NOT NULL DEFAULT "",',
    'lead_user_id TEXT,',
    'lead_name TEXT NOT NULL DEFAULT "",',
    'lead_email TEXT NOT NULL DEFAULT "",',
    'lead_position TEXT NOT NULL DEFAULT "",',
    'priority TEXT NOT NULL DEFAULT "planned",',
    'tags_json TEXT NOT NULL DEFAULT "[]",',
    'sort_order INTEGER NOT NULL DEFAULT 0,',
    'start_date TEXT NOT NULL DEFAULT "",',
    'end_date TEXT NOT NULL DEFAULT "",',
    'progress INTEGER NOT NULL DEFAULT 0,',
    'version INTEGER NOT NULL DEFAULT 1,',
    'created_by_user_id TEXT,',
    'created_at INTEGER NOT NULL,',
    'updated_at INTEGER NOT NULL',
    ')',
  ].join(' '),
  'CREATE INDEX IF NOT EXISTS collab_cards_workspace_idx ON collab_cards(workspace_id, board_id, column_id, sort_order)',
  'CREATE INDEX IF NOT EXISTS collab_cards_board_idx ON collab_cards(board_id)',
  [
    'CREATE TABLE IF NOT EXISTS collab_card_tasks (',
    'id TEXT PRIMARY KEY,',
    'card_id TEXT NOT NULL,',
    'title TEXT NOT NULL,',
    'assignee_user_id TEXT,',
    'assignee_name TEXT NOT NULL DEFAULT "",',
    'assignee_email TEXT NOT NULL DEFAULT "",',
    'assignee_position TEXT NOT NULL DEFAULT "",',
    'start_date TEXT NOT NULL DEFAULT "",',
    'end_date TEXT NOT NULL DEFAULT "",',
    'progress INTEGER NOT NULL DEFAULT 0,',
    'note TEXT NOT NULL DEFAULT "",',
    'sort_order INTEGER NOT NULL DEFAULT 0,',
    'version INTEGER NOT NULL DEFAULT 1,',
    'created_by_user_id TEXT,',
    'created_at INTEGER NOT NULL,',
    'updated_at INTEGER NOT NULL',
    ')',
  ].join(' '),
  'CREATE INDEX IF NOT EXISTS collab_card_tasks_card_idx ON collab_card_tasks(card_id, sort_order)',
  'CREATE INDEX IF NOT EXISTS collab_card_tasks_assignee_idx ON collab_card_tasks(assignee_email)',
  [
    'CREATE TABLE IF NOT EXISTS collab_card_task_dependencies (',
    'task_id TEXT NOT NULL,',
    'dependency_task_id TEXT NOT NULL,',
    'created_at INTEGER NOT NULL,',
    'PRIMARY KEY (task_id, dependency_task_id)',
    ')',
  ].join(' '),
  'CREATE INDEX IF NOT EXISTS collab_task_dependencies_dep_idx ON collab_card_task_dependencies(dependency_task_id)',
  [
    'CREATE TABLE IF NOT EXISTS collab_time_off_entries (',
    'id TEXT PRIMARY KEY,',
    'workspace_id TEXT NOT NULL,',
    'member_user_id TEXT,',
    'member_name TEXT NOT NULL DEFAULT "",',
    'member_email TEXT NOT NULL DEFAULT "",',
    'title TEXT NOT NULL,',
    'start_date TEXT NOT NULL,',
    'end_date TEXT NOT NULL,',
    'version INTEGER NOT NULL DEFAULT 1,',
    'created_at INTEGER NOT NULL,',
    'updated_at INTEGER NOT NULL',
    ')',
  ].join(' '),
  'CREATE INDEX IF NOT EXISTS collab_time_off_workspace_idx ON collab_time_off_entries(workspace_id, start_date)',
  [
    'CREATE TABLE IF NOT EXISTS collab_share_links (',
    'id TEXT PRIMARY KEY,',
    'workspace_id TEXT NOT NULL,',
    'board_id TEXT,',
    'token_hash TEXT NOT NULL UNIQUE,',
    'token_hint TEXT NOT NULL,',
    'scope TEXT NOT NULL DEFAULT "workspace",',
    'created_by_user_id TEXT,',
    'created_at INTEGER NOT NULL,',
    'updated_at INTEGER NOT NULL',
    ')',
  ].join(' '),
  'CREATE INDEX IF NOT EXISTS collab_share_links_workspace_idx ON collab_share_links(workspace_id, created_at DESC)',
];

const getWorkspaceById = async (db, workspaceId) => {
  const row = await db.prepare('SELECT * FROM collab_workspaces WHERE id = ? LIMIT 1').bind(trim(workspaceId)).first();
  return row ? mapWorkspaceRow(row) : null;
};

const getBoardById = async (db, boardId) => {
  const row = await db.prepare('SELECT * FROM collab_boards WHERE id = ? LIMIT 1').bind(trim(boardId)).first();
  return row ? mapBoardRow(row) : null;
};

const getColumnById = async (db, columnId) => {
  const row = await db.prepare('SELECT * FROM collab_board_columns WHERE id = ? LIMIT 1').bind(trim(columnId)).first();
  return row ? mapColumnRow(row) : null;
};

const getCardById = async (db, cardId) => {
  const row = await db.prepare('SELECT * FROM collab_cards WHERE id = ? LIMIT 1').bind(trim(cardId)).first();
  return row ? mapCardRow(row) : null;
};

const getTaskById = async (db, taskId) => {
  const row = await db.prepare('SELECT * FROM collab_card_tasks WHERE id = ? LIMIT 1').bind(trim(taskId)).first();
  return row ? mapTaskRow(row) : null;
};

const getTimeOffById = async (db, entryId) => {
  const row = await db.prepare('SELECT * FROM collab_time_off_entries WHERE id = ? LIMIT 1').bind(trim(entryId)).first();
  return row ? mapTimeOffRow(row) : null;
};

const getMembership = async (db, workspaceId, userId) => {
  const row = await db
    .prepare('SELECT workspace_id, user_id, role, created_at FROM collab_workspace_members WHERE workspace_id = ? AND user_id = ? LIMIT 1')
    .bind(trim(workspaceId), trim(userId))
    .first();
  return row
    ? {
        workspaceId: trim(row.workspace_id),
        userId: trim(row.user_id),
        role: trim(row.role) || 'member',
        createdAt: toInt(row.created_at, 0),
      }
    : null;
};

const listBoardColumns = async (db, boardId) => {
  const result = await db
    .prepare('SELECT * FROM collab_board_columns WHERE board_id = ? ORDER BY sort_order ASC, name COLLATE NOCASE ASC')
    .bind(trim(boardId))
    .all();
  return arrayFromResult(result).map(mapColumnRow);
};

const ensureWorkspaceAccess = async (request, env, helpers, workspaceId) => {
  const auth = await helpers.ensureAuthenticatedUser(request, env);
  if (auth.error) return auth;
  const membership = await getMembership(env.DB, workspaceId, auth.user.id);
  if (!membership) {
    return { error: helpers.errorResponse('워크스페이스를 찾을 수 없거나 접근 권한이 없습니다.', { status: 404 }) };
  }
  return { user: auth.user, membership };
};

const ensureBoardAccess = async (request, env, helpers, boardId) => {
  const board = await getBoardById(env.DB, boardId);
  if (!board) return { error: helpers.errorResponse('보드를 찾을 수 없습니다.', { status: 404 }) };
  const access = await ensureWorkspaceAccess(request, env, helpers, board.workspaceId);
  if (access.error) return access;
  return { ...access, board };
};

const ensureCardAccess = async (request, env, helpers, cardId) => {
  const card = await getCardById(env.DB, cardId);
  if (!card) return { error: helpers.errorResponse('카드를 찾을 수 없습니다.', { status: 404 }) };
  const access = await ensureWorkspaceAccess(request, env, helpers, card.workspaceId);
  if (access.error) return access;
  return { ...access, card };
};

const ensureTaskAccess = async (request, env, helpers, taskId) => {
  const task = await getTaskById(env.DB, taskId);
  if (!task) return { error: helpers.errorResponse('작업을 찾을 수 없습니다.', { status: 404 }) };
  const card = await getCardById(env.DB, task.cardId);
  if (!card) return { error: helpers.errorResponse('카드를 찾을 수 없습니다.', { status: 404 }) };
  const access = await ensureWorkspaceAccess(request, env, helpers, card.workspaceId);
  if (access.error) return access;
  return { ...access, card, task };
};

const ensureTimeOffAccess = async (request, env, helpers, entryId) => {
  const entry = await getTimeOffById(env.DB, entryId);
  if (!entry) return { error: helpers.errorResponse('Time-off entry not found.', { status: 404 }) };
  const access = await ensureWorkspaceAccess(request, env, helpers, entry.workspaceId);
  if (access.error) return access;
  return { ...access, entry };
};

const createBoardColumns = async (db, boardId, timestamp, columnPresets = DEFAULT_BOARD_COLUMN_PRESETS) => {
  const statements = columnPresets.map((preset) =>
    db
      .prepare(
        [
          'INSERT INTO collab_board_columns (id, board_id, name, kind, sort_order, created_at, updated_at)',
          'VALUES (?, ?, ?, ?, ?, ?, ?)',
        ].join(' '),
      )
      .bind(createId(), trim(boardId), trim(preset.name), trim(preset.kind) || 'custom', toInt(preset.sortOrder, 0), timestamp, timestamp),
  );
  if (statements.length) await db.batch(statements);
};

const createWorkspaceScaffold = async (db, user, { name, description = '', boardName = '로드맵' } = {}) => {
  const timestamp = nowMs();
  const workspaceId = createId();
  const boardId = createId();
  await db.batch([
    db
      .prepare(
        [
          'INSERT INTO collab_workspaces (id, name, description, created_by_user_id, created_at, updated_at)',
          'VALUES (?, ?, ?, ?, ?, ?)',
        ].join(' '),
      )
      .bind(workspaceId, trim(name), trim(description), trim(user.id), timestamp, timestamp),
    db
      .prepare(
        [
          'INSERT INTO collab_workspace_members (workspace_id, user_id, role, created_at)',
          'VALUES (?, ?, ?, ?)',
        ].join(' '),
      )
      .bind(workspaceId, trim(user.id), 'owner', timestamp),
    db
      .prepare(
        [
          'INSERT INTO collab_boards (id, workspace_id, name, description, created_at, updated_at)',
          'VALUES (?, ?, ?, ?, ?, ?)',
        ].join(' '),
      )
      .bind(boardId, workspaceId, trim(boardName) || 'Roadmap', '', timestamp, timestamp),
  ]);
  await createBoardColumns(db, boardId, timestamp);
  return { workspaceId, boardId };
};

const getNextCardSortOrder = async (db, boardId, columnId) => {
  const row = await db
    .prepare('SELECT COALESCE(MAX(sort_order), 0) AS max_sort_order FROM collab_cards WHERE board_id = ? AND column_id = ?')
    .bind(trim(boardId), trim(columnId))
    .first();
  return toInt(row?.max_sort_order, 0) + 1;
};

const getNextTaskSortOrder = async (db, cardId) => {
  const row = await db
    .prepare('SELECT COALESCE(MAX(sort_order), 0) AS max_sort_order FROM collab_card_tasks WHERE card_id = ?')
    .bind(trim(cardId))
    .first();
  return toInt(row?.max_sort_order, 0) + 1;
};

const getShareLinkByToken = async (db, token) => {
  const tokenHash = await sha256Hex(trim(token));
  const row = await db.prepare('SELECT * FROM collab_share_links WHERE token_hash = ? LIMIT 1').bind(tokenHash).first();
  return row ? mapShareLinkRow(row) : null;
};

const loadWorkspaceMembers = async (db, workspaceId) => {
  const result = await db
    .prepare(
      [
        'SELECT m.user_id, m.role, m.created_at, u.email',
        'FROM collab_workspace_members m',
        'LEFT JOIN users u ON u.id = m.user_id',
        'WHERE m.workspace_id = ?',
        'ORDER BY m.created_at ASC',
      ].join(' '),
    )
    .bind(trim(workspaceId))
    .all();
  return arrayFromResult(result).map(mapMemberRow);
};

const loadWorkspaceShareLinks = async (db, workspaceId) => {
  const result = await db
    .prepare('SELECT * FROM collab_share_links WHERE workspace_id = ? ORDER BY created_at DESC')
    .bind(trim(workspaceId))
    .all();
  return arrayFromResult(result).map(mapShareLinkRow);
};

const loadWorkspaceSnapshot = async (db, workspaceId, { boardId = '', includeShareLinks = false } = {}) => {
  const workspace = await getWorkspaceById(db, workspaceId);
  if (!workspace) return null;

  const boardsResult = await db
    .prepare(
      [
        'SELECT * FROM collab_boards',
        'WHERE workspace_id = ?',
        boardId ? 'AND id = ?' : '',
        'ORDER BY updated_at DESC, name COLLATE NOCASE ASC',
      ].join(' '),
    )
    .bind(...(boardId ? [trim(workspaceId), trim(boardId)] : [trim(workspaceId)]))
    .all();
  const boards = arrayFromResult(boardsResult).map(mapBoardRow);
  const boardIds = boards.map((row) => row.id);

  if (boardIds.length === 0) {
    return {
      workspace,
      boards: [],
      columns: [],
      cards: [],
      cardTasks: [],
      dependencies: [],
      timeOffEntries: [],
      members: await loadWorkspaceMembers(db, workspaceId),
      shareLinks: includeShareLinks ? await loadWorkspaceShareLinks(db, workspaceId) : [],
    };
  }

  const placeholders = boardIds.map(() => '?').join(', ');
  const columnsResult = await db
    .prepare(`SELECT * FROM collab_board_columns WHERE board_id IN (${placeholders}) ORDER BY board_id ASC, sort_order ASC`)
    .bind(...boardIds)
    .all();
  const columns = arrayFromResult(columnsResult).map(mapColumnRow);

  const cardsResult = await db
    .prepare(`SELECT * FROM collab_cards WHERE board_id IN (${placeholders}) ORDER BY column_id ASC, sort_order ASC, updated_at DESC`)
    .bind(...boardIds)
    .all();
  const cards = arrayFromResult(cardsResult).map(mapCardRow);
  const cardIds = cards.map((row) => row.id);

  let cardTasks = [];
  let dependencies = [];
  if (cardIds.length > 0) {
    const cardPlaceholders = cardIds.map(() => '?').join(', ');
    const tasksResult = await db
      .prepare(`SELECT * FROM collab_card_tasks WHERE card_id IN (${cardPlaceholders}) ORDER BY card_id ASC, sort_order ASC`)
      .bind(...cardIds)
      .all();
    const taskRows = arrayFromResult(tasksResult).map(mapTaskRow);
    const taskIds = taskRows.map((row) => row.id);
    cardTasks = taskRows;
    if (taskIds.length > 0) {
      const taskPlaceholders = taskIds.map(() => '?').join(', ');
      const dependencyResult = await db
        .prepare(`SELECT * FROM collab_card_task_dependencies WHERE task_id IN (${taskPlaceholders})`)
        .bind(...taskIds)
        .all();
      dependencies = arrayFromResult(dependencyResult).map(mapDependencyRow);
    }
  }

  const timeOffResult = await db
    .prepare('SELECT * FROM collab_time_off_entries WHERE workspace_id = ? ORDER BY start_date ASC, title COLLATE NOCASE ASC')
    .bind(trim(workspaceId))
    .all();

  return {
    workspace,
    boards,
    columns,
    cards,
    cardTasks: normalizeTaskDependencies(cardTasks, dependencies),
    dependencies,
    timeOffEntries: arrayFromResult(timeOffResult).map(mapTimeOffRow),
    members: await loadWorkspaceMembers(db, workspaceId),
    shareLinks: includeShareLinks ? await loadWorkspaceShareLinks(db, workspaceId) : [],
  };
};

const refreshWorkspaceTimestamp = async (db, workspaceId, timestamp) => {
  await db.prepare('UPDATE collab_workspaces SET updated_at = ? WHERE id = ?').bind(timestamp, trim(workspaceId)).run();
};

const refreshBoardTimestamp = async (db, boardId, timestamp) => {
  await db.prepare('UPDATE collab_boards SET updated_at = ? WHERE id = ?').bind(timestamp, trim(boardId)).run();
};

const loadCardTasksAndDependencies = async (db, cardId) => {
  const tasksResult = await db
    .prepare('SELECT * FROM collab_card_tasks WHERE card_id = ? ORDER BY sort_order ASC, updated_at ASC')
    .bind(trim(cardId))
    .all();
  const tasks = arrayFromResult(tasksResult).map(mapTaskRow);
  if (tasks.length === 0) return { tasks: [], dependencies: [] };
  const taskIds = tasks.map((task) => task.id);
  const placeholders = taskIds.map(() => '?').join(', ');
  const dependencyResult = await db
    .prepare(`SELECT * FROM collab_card_task_dependencies WHERE task_id IN (${placeholders})`)
    .bind(...taskIds)
    .all();
  const dependencies = arrayFromResult(dependencyResult).map(mapDependencyRow);
  return { tasks, dependencies };
};

const sanitizeDependencyIds = (taskId, dependencyIds, validTaskIds) => {
  const seen = new Set();
  const result = [];
  (Array.isArray(dependencyIds) ? dependencyIds : []).forEach((value) => {
    const normalized = trim(value);
    if (!normalized || normalized === trim(taskId) || seen.has(normalized) || !validTaskIds.has(normalized)) return;
    seen.add(normalized);
    result.push(normalized);
  });
  return result;
};

const replaceTaskDependencies = async (db, taskId, dependencyIds, timestamp) => {
  await db.prepare('DELETE FROM collab_card_task_dependencies WHERE task_id = ?').bind(trim(taskId)).run();
  if (!dependencyIds.length) return;
  const statements = dependencyIds.map((dependencyTaskId) =>
    db
      .prepare(
        [
          'INSERT INTO collab_card_task_dependencies (task_id, dependency_task_id, created_at)',
          'VALUES (?, ?, ?)',
        ].join(' '),
      )
      .bind(trim(taskId), trim(dependencyTaskId), timestamp),
  );
  await db.batch(statements);
};

const rescheduleCardTasks = async (db, cardId, timestamp) => {
  const { tasks, dependencies } = await loadCardTasksAndDependencies(db, cardId);
  if (tasks.length === 0) return [];
  const normalized = normalizeTaskDependencies(tasks, dependencies);
  const scheduled = applyDependencyScheduling(normalized);
  const updates = [];
  scheduled.forEach((scheduledTask) => {
    const currentTask = tasks.find((task) => task.id === scheduledTask.id);
    if (!currentTask) return;
    const nextStart = normalizeDateYmd(scheduledTask.startDate);
    const nextEnd = normalizeDateYmd(scheduledTask.endDate || scheduledTask.startDate);
    if (nextStart === currentTask.startDate && nextEnd === currentTask.endDate) return;
    updates.push(
      db
        .prepare(
          [
            'UPDATE collab_card_tasks',
            'SET start_date = ?, end_date = ?, version = version + 1, updated_at = ?',
            'WHERE id = ?',
          ].join(' '),
        )
        .bind(nextStart, nextEnd || nextStart, timestamp, scheduledTask.id),
    );
  });
  if (updates.length) await db.batch(updates);
  const refreshed = await loadCardTasksAndDependencies(db, cardId);
  return normalizeTaskDependencies(refreshed.tasks, refreshed.dependencies);
};

const refreshCardRollup = async (db, cardId, timestamp) => {
  const card = await getCardById(db, cardId);
  if (!card) return null;
  const tasks = await rescheduleCardTasks(db, cardId, timestamp);
  const boardColumns = await listBoardColumns(db, card.boardId);
  const rollup = rollupCardSummary(card, tasks);
  const nextProgress = clampProgress(rollup.progress);
  const nextStartDate = normalizeDateYmd(rollup.startDate);
  const nextEndDate = normalizeDateYmd(rollup.endDate || rollup.startDate);
  const columnIdsByKind = buildColumnMap(boardColumns);
  const desiredColumnId = columnIdsByKind.get(deriveColumnKindFromProgress(nextProgress)) || card.columnId;
  const changed =
    card.progress !== nextProgress ||
    card.startDate !== nextStartDate ||
    card.endDate !== nextEndDate ||
    card.columnId !== desiredColumnId;
  if (changed) {
    await db
      .prepare(
        [
          'UPDATE collab_cards',
          'SET progress = ?, start_date = ?, end_date = ?, column_id = ?, version = version + 1, updated_at = ?',
          'WHERE id = ?',
        ].join(' '),
      )
      .bind(nextProgress, nextStartDate, nextEndDate || nextStartDate, desiredColumnId, timestamp, card.id)
      .run();
  }
  return getCardById(db, cardId);
};

const publishWorkspaceEvent = async (env, workspaceId, event) => {
  try {
    if (!env.COLLAB_REALTIME) return;
    const stub = env.COLLAB_REALTIME.get(env.COLLAB_REALTIME.idFromName(`workspace:${trim(workspaceId)}`));
    await stub.fetch('https://collab.internal/broadcast', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ event }),
    });
  } catch {
    // ignore realtime publish failures
  }
};

const buildShareSnapshotPayload = async (db, shareLink) => {
  const snapshot = await loadWorkspaceSnapshot(db, shareLink.workspaceId, {
    boardId: shareLink.scope === 'board' ? shareLink.boardId : '',
    includeShareLinks: false,
  });
  if (!snapshot) return null;
  return {
    readOnly: true,
    ...sanitizeShareSnapshot(snapshot, shareLink),
  };
};

const handleListWorkspaces = async (request, env, helpers) => {
  const auth = await helpers.ensureAuthenticatedUser(request, env);
  if (auth.error) return auth.error;
  const result = await env.DB
    .prepare(
      [
        'SELECT w.id, w.name, w.description, w.created_by_user_id, w.created_at, w.updated_at, m.role',
        'FROM collab_workspaces w',
        'INNER JOIN collab_workspace_members m ON m.workspace_id = w.id',
        'WHERE m.user_id = ?',
        'ORDER BY w.updated_at DESC, w.name COLLATE NOCASE ASC',
      ].join(' '),
    )
    .bind(trim(auth.user.id))
    .all();
  return helpers.jsonResponse({ workspaces: arrayFromResult(result).map(mapWorkspaceRow) });
};

const handleCreateWorkspace = async (request, env, helpers) => {
  const auth = await helpers.ensureAuthenticatedUser(request, env);
  if (auth.error) return auth.error;
  const bodyResult = await helpers.readJsonObjectBody(request);
  if (!bodyResult.ok) return helpers.errorResponse(bodyResult.message, { status: 400 });
  const name = trim(bodyResult.payload.name);
  const description = trim(bodyResult.payload.description);
  if (!name) return helpers.errorResponse('워크스페이스 이름이 필요합니다.', { status: 400 });

  const { workspaceId } = await createWorkspaceScaffold(env.DB, auth.user, { name, description });
  const snapshot = await loadWorkspaceSnapshot(env.DB, workspaceId, { includeShareLinks: true });
  return helpers.jsonResponse({ workspace: snapshot?.workspace, snapshot }, { status: 201 });
};

const handleGetWorkspaceSnapshot = async (request, env, helpers, workspaceId) => {
  const access = await ensureWorkspaceAccess(request, env, helpers, workspaceId);
  if (access.error) return access.error;
  const snapshot = await loadWorkspaceSnapshot(env.DB, workspaceId, { includeShareLinks: true });
  if (!snapshot) return helpers.errorResponse('워크스페이스를 찾을 수 없습니다.', { status: 404 });
  return helpers.jsonResponse({
    currentUser: {
      id: trim(access.user.id),
      email: normalizeEmail(access.user.email),
      role: access.membership.role,
    },
    readOnly: false,
    ...snapshot,
  });
};

const handleCreateBoard = async (request, env, helpers) => {
  const bodyResult = await helpers.readJsonObjectBody(request);
  if (!bodyResult.ok) return helpers.errorResponse(bodyResult.message, { status: 400 });
  const workspaceId = trim(bodyResult.payload.workspaceId);
  const name = trim(bodyResult.payload.name);
  if (!workspaceId || !name) return helpers.errorResponse('workspaceId와 name이 필요합니다.', { status: 400 });
  const access = await ensureWorkspaceAccess(request, env, helpers, workspaceId);
  if (access.error) return access.error;
  const timestamp = nowMs();
  const boardId = createId();
  await env.DB
    .prepare(
      [
        'INSERT INTO collab_boards (id, workspace_id, name, description, created_at, updated_at)',
        'VALUES (?, ?, ?, ?, ?, ?)',
      ].join(' '),
    )
    .bind(boardId, workspaceId, name, trim(bodyResult.payload.description), timestamp, timestamp)
    .run();
  await createBoardColumns(env.DB, boardId, timestamp);
  await refreshWorkspaceTimestamp(env.DB, workspaceId, timestamp);
  const board = await getBoardById(env.DB, boardId);
  const columns = await listBoardColumns(env.DB, boardId);
  await publishWorkspaceEvent(env, workspaceId, { type: 'board.created', boardId, entityType: 'board', payload: { board, columns } });
  return helpers.jsonResponse({ board, columns }, { status: 201 });
};

const handleCreateBoardColumn = async (request, env, helpers) => {
  const bodyResult = await helpers.readJsonObjectBody(request);
  if (!bodyResult.ok) return helpers.errorResponse(bodyResult.message, { status: 400 });
  const boardId = trim(bodyResult.payload.boardId);
  const name = trim(bodyResult.payload.name);
  const kind = trim(bodyResult.payload.kind) || 'custom';
  if (!boardId || !name) return helpers.errorResponse('boardId와 name이 필요합니다.', { status: 400 });
  const access = await ensureBoardAccess(request, env, helpers, boardId);
  if (access.error) return access.error;
  const timestamp = nowMs();
  const existingColumns = await listBoardColumns(env.DB, boardId);
  const sortOrder = existingColumns.length ? Math.max(...existingColumns.map((column) => column.sortOrder)) + 1 : 1;
  const columnId = createId();
  await env.DB
    .prepare(
      [
        'INSERT INTO collab_board_columns (id, board_id, name, kind, sort_order, created_at, updated_at)',
        'VALUES (?, ?, ?, ?, ?, ?, ?)',
      ].join(' '),
    )
    .bind(columnId, boardId, name, kind, sortOrder, timestamp, timestamp)
    .run();
  await refreshBoardTimestamp(env.DB, boardId, timestamp);
  await refreshWorkspaceTimestamp(env.DB, access.board.workspaceId, timestamp);
  const column = await getColumnById(env.DB, columnId);
  await publishWorkspaceEvent(env, access.board.workspaceId, {
    type: 'column.created',
    entityType: 'board-column',
    entityId: columnId,
    payload: { column },
  });
  return helpers.jsonResponse({ column }, { status: 201 });
};

const resolveBoardColumnForCard = async (db, workspaceId, boardId, columnId = '') => {
  const board = await getBoardById(db, boardId);
  if (!board || board.workspaceId !== workspaceId) return { error: '보드를 찾을 수 없습니다.' };
  const columns = await listBoardColumns(db, boardId);
  if (columns.length === 0) return { error: '보드에 컬럼이 없습니다.' };
  if (columnId) {
    const explicit = columns.find((column) => column.id === columnId);
    if (!explicit) return { error: '보드에서 해당 컬럼을 찾을 수 없습니다.' };
    return { board, column: explicit };
  }
  return { board, column: columns[0] };
};

const handleCreateCard = async (request, env, helpers) => {
  const bodyResult = await helpers.readJsonObjectBody(request);
  if (!bodyResult.ok) return helpers.errorResponse(bodyResult.message, { status: 400 });
  const workspaceId = trim(bodyResult.payload.workspaceId);
  const boardId = trim(bodyResult.payload.boardId);
  const title = trim(bodyResult.payload.title);
  if (!workspaceId || !boardId || !title) {
    return helpers.errorResponse('workspaceId, boardId, title이 필요합니다.', { status: 400 });
  }
  const access = await ensureWorkspaceAccess(request, env, helpers, workspaceId);
  if (access.error) return access.error;
  const boardAndColumn = await resolveBoardColumnForCard(env.DB, workspaceId, boardId, trim(bodyResult.payload.columnId));
  if (boardAndColumn.error) return helpers.errorResponse(boardAndColumn.error, { status: 400 });

  const timestamp = nowMs();
  const cardId = createId();
  const sortOrder =
    normalizeBaseVersion(bodyResult.payload.sortOrder) != null
      ? Math.max(1, normalizeBaseVersion(bodyResult.payload.sortOrder))
      : await getNextCardSortOrder(env.DB, boardId, boardAndColumn.column.id);

  await env.DB
    .prepare(
      [
        'INSERT INTO collab_cards (',
        'id, workspace_id, board_id, column_id, title, description, lead_user_id, lead_name, lead_email, lead_position,',
        'priority, tags_json, sort_order, start_date, end_date, progress, version, created_by_user_id, created_at, updated_at',
        ') VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)',
      ].join(' '),
    )
    .bind(
      cardId,
      workspaceId,
      boardId,
      boardAndColumn.column.id,
      title,
      trim(bodyResult.payload.description),
      trim(bodyResult.payload.leadUserId) || null,
      trim(bodyResult.payload.leadName),
      normalizeEmail(bodyResult.payload.leadEmail),
      trim(bodyResult.payload.leadPosition),
      trim(bodyResult.payload.priority) || 'planned',
      jsonArrayString(bodyResult.payload.tags),
      sortOrder,
      normalizeDateYmd(bodyResult.payload.startDate),
      normalizeDateYmd(bodyResult.payload.endDate || bodyResult.payload.startDate),
      clampProgress(bodyResult.payload.progress),
      trim(access.user.id),
      timestamp,
      timestamp,
    )
    .run();

  await refreshBoardTimestamp(env.DB, boardId, timestamp);
  await refreshWorkspaceTimestamp(env.DB, workspaceId, timestamp);
  const card = await getCardById(env.DB, cardId);
  await publishWorkspaceEvent(env, workspaceId, {
    type: 'card.created',
    entityType: 'card',
    entityId: cardId,
    version: card?.version || 1,
    payload: { card },
  });
  return helpers.jsonResponse({ card }, { status: 201 });
};

const handlePatchCard = async (request, env, helpers, cardId) => {
  const access = await ensureCardAccess(request, env, helpers, cardId);
  if (access.error) return access.error;
  const bodyResult = await helpers.readJsonObjectBody(request);
  if (!bodyResult.ok) return helpers.errorResponse(bodyResult.message, { status: 400 });
  const payload = bodyResult.payload;
  const baseVersion = normalizeBaseVersion(payload.baseVersion);
  if (baseVersion == null) return helpers.errorResponse('baseVersion 값이 필요합니다.', { status: 400 });
  if (baseVersion !== access.card.version) {
    return helpers.jsonResponse({ error: '버전 충돌이 발생했습니다.', latest: access.card }, { status: 409 });
  }

  let nextBoardId = access.card.boardId;
  let nextColumnId = access.card.columnId;
  if (Object.prototype.hasOwnProperty.call(payload, 'boardId') || Object.prototype.hasOwnProperty.call(payload, 'columnId')) {
    const candidateBoardId = trim(payload.boardId) || access.card.boardId;
    const boardAndColumn = await resolveBoardColumnForCard(
      env.DB,
      access.card.workspaceId,
      candidateBoardId,
      Object.prototype.hasOwnProperty.call(payload, 'columnId') ? trim(payload.columnId) : access.card.columnId,
    );
    if (boardAndColumn.error) return helpers.errorResponse(boardAndColumn.error, { status: 400 });
    nextBoardId = boardAndColumn.board.id;
    nextColumnId = boardAndColumn.column.id;
  }

  const timestamp = nowMs();
  const nextSortOrder = Object.prototype.hasOwnProperty.call(payload, 'sortOrder')
    ? Math.max(1, normalizeBaseVersion(payload.sortOrder) || 1)
    : Object.prototype.hasOwnProperty.call(payload, 'columnId') || Object.prototype.hasOwnProperty.call(payload, 'boardId')
      ? await getNextCardSortOrder(env.DB, nextBoardId, nextColumnId)
      : access.card.sortOrder;

  await env.DB
    .prepare(
      [
        'UPDATE collab_cards',
        'SET board_id = ?, column_id = ?, title = ?, description = ?, lead_user_id = ?, lead_name = ?, lead_email = ?,',
        'lead_position = ?, priority = ?, tags_json = ?, sort_order = ?, start_date = ?, end_date = ?, progress = ?,',
        'version = version + 1, updated_at = ?',
        'WHERE id = ?',
      ].join(' '),
    )
    .bind(
      nextBoardId,
      nextColumnId,
      Object.prototype.hasOwnProperty.call(payload, 'title') ? trim(payload.title) || access.card.title : access.card.title,
      Object.prototype.hasOwnProperty.call(payload, 'description') ? trim(payload.description) : access.card.description,
      Object.prototype.hasOwnProperty.call(payload, 'leadUserId') ? trim(payload.leadUserId) || null : access.card.leadUserId,
      Object.prototype.hasOwnProperty.call(payload, 'leadName') ? trim(payload.leadName) : access.card.leadName,
      Object.prototype.hasOwnProperty.call(payload, 'leadEmail') ? normalizeEmail(payload.leadEmail) : access.card.leadEmail,
      Object.prototype.hasOwnProperty.call(payload, 'leadPosition') ? trim(payload.leadPosition) : access.card.leadPosition,
      Object.prototype.hasOwnProperty.call(payload, 'priority') ? trim(payload.priority) || 'planned' : access.card.priority,
      Object.prototype.hasOwnProperty.call(payload, 'tags') ? jsonArrayString(payload.tags) : jsonArrayString(access.card.tags),
      nextSortOrder,
      Object.prototype.hasOwnProperty.call(payload, 'startDate') ? normalizeDateYmd(payload.startDate) : access.card.startDate,
      Object.prototype.hasOwnProperty.call(payload, 'endDate')
        ? normalizeDateYmd(payload.endDate || payload.startDate)
        : access.card.endDate,
      Object.prototype.hasOwnProperty.call(payload, 'progress') ? clampProgress(payload.progress) : access.card.progress,
      timestamp,
      cardId,
    )
    .run();

  await refreshBoardTimestamp(env.DB, nextBoardId, timestamp);
  await refreshWorkspaceTimestamp(env.DB, access.card.workspaceId, timestamp);
  const card = await getCardById(env.DB, cardId);
  await publishWorkspaceEvent(env, access.card.workspaceId, {
    type: 'card.updated',
    entityType: 'card',
    entityId: cardId,
    version: card?.version,
    payload: { card },
  });
  return helpers.jsonResponse({ card });
};

const handleDeleteCard = async (request, env, helpers, cardId) => {
  const access = await ensureCardAccess(request, env, helpers, cardId);
  if (access.error) return access.error;
  const bodyResult = await helpers.readJsonObjectBody(request);
  if (bodyResult.ok) {
    const baseVersion = normalizeBaseVersion(bodyResult.payload.baseVersion);
    if (baseVersion != null && baseVersion !== access.card.version) {
      return helpers.jsonResponse({ error: '버전 충돌이 발생했습니다.', latest: access.card }, { status: 409 });
    }
  }
  const timestamp = nowMs();
  const { tasks } = await loadCardTasksAndDependencies(env.DB, cardId);
  const taskIds = tasks.map((task) => task.id);
  if (taskIds.length > 0) {
    const placeholders = taskIds.map(() => '?').join(', ');
    await env.DB.prepare(`DELETE FROM collab_card_task_dependencies WHERE task_id IN (${placeholders}) OR dependency_task_id IN (${placeholders})`).bind(...taskIds, ...taskIds).run();
    await env.DB.prepare(`DELETE FROM collab_card_tasks WHERE id IN (${placeholders})`).bind(...taskIds).run();
  }
  await env.DB.prepare('DELETE FROM collab_cards WHERE id = ?').bind(cardId).run();
  await refreshBoardTimestamp(env.DB, access.card.boardId, timestamp);
  await refreshWorkspaceTimestamp(env.DB, access.card.workspaceId, timestamp);
  await publishWorkspaceEvent(env, access.card.workspaceId, {
    type: 'card.deleted',
    entityType: 'card',
    entityId: cardId,
    payload: { id: cardId },
  });
  return helpers.jsonResponse({ ok: true, id: cardId });
};

const handleCreateTask = async (request, env, helpers) => {
  const bodyResult = await helpers.readJsonObjectBody(request);
  if (!bodyResult.ok) return helpers.errorResponse(bodyResult.message, { status: 400 });
  const payload = bodyResult.payload;
  const cardId = trim(payload.cardId);
  const title = trim(payload.title);
  if (!cardId || !title) return helpers.errorResponse('cardId와 title이 필요합니다.', { status: 400 });
  const access = await ensureCardAccess(request, env, helpers, cardId);
  if (access.error) return access.error;
  const timestamp = nowMs();
  const taskId = createId();
  const sortOrder = Object.prototype.hasOwnProperty.call(payload, 'sortOrder')
    ? Math.max(1, normalizeBaseVersion(payload.sortOrder) || 1)
    : await getNextTaskSortOrder(env.DB, cardId);
  await env.DB
    .prepare(
      [
        'INSERT INTO collab_card_tasks (',
        'id, card_id, title, assignee_user_id, assignee_name, assignee_email, assignee_position, start_date, end_date, progress, note, sort_order, version, created_by_user_id, created_at, updated_at',
        ') VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)',
      ].join(' '),
    )
    .bind(
      taskId,
      cardId,
      title,
      trim(payload.assigneeUserId) || null,
      trim(payload.assigneeName),
      normalizeEmail(payload.assigneeEmail),
      trim(payload.assigneePosition),
      normalizeDateYmd(payload.startDate),
      normalizeDateYmd(payload.endDate || payload.startDate),
      clampProgress(payload.progress),
      trim(payload.note),
      sortOrder,
      trim(access.user.id),
      timestamp,
      timestamp,
    )
    .run();

  const existing = await loadCardTasksAndDependencies(env.DB, cardId);
  const validTaskIds = new Set(existing.tasks.map((task) => task.id));
  const dependencyIds = sanitizeDependencyIds(taskId, payload.dependencyIds, validTaskIds);
  await replaceTaskDependencies(env.DB, taskId, dependencyIds, timestamp);
  const card = await refreshCardRollup(env.DB, cardId, timestamp);
  await refreshBoardTimestamp(env.DB, access.card.boardId, timestamp);
  await refreshWorkspaceTimestamp(env.DB, access.card.workspaceId, timestamp);
  const task = await getTaskById(env.DB, taskId);
  await publishWorkspaceEvent(env, access.card.workspaceId, {
    type: 'task.created',
    entityType: 'card-task',
    entityId: taskId,
    version: task?.version,
    payload: { task, card },
  });
  return helpers.jsonResponse({ task, card }, { status: 201 });
};

const handlePatchTask = async (request, env, helpers, taskId) => {
  const access = await ensureTaskAccess(request, env, helpers, taskId);
  if (access.error) return access.error;
  const bodyResult = await helpers.readJsonObjectBody(request);
  if (!bodyResult.ok) return helpers.errorResponse(bodyResult.message, { status: 400 });
  const payload = bodyResult.payload;
  const baseVersion = normalizeBaseVersion(payload.baseVersion);
  if (baseVersion == null) return helpers.errorResponse('baseVersion 값이 필요합니다.', { status: 400 });
  if (baseVersion !== access.task.version) {
    return helpers.jsonResponse({ error: '버전 충돌이 발생했습니다.', latest: access.task }, { status: 409 });
  }
  const timestamp = nowMs();
  await env.DB
    .prepare(
      [
        'UPDATE collab_card_tasks',
        'SET title = ?, assignee_user_id = ?, assignee_name = ?, assignee_email = ?, assignee_position = ?,',
        'start_date = ?, end_date = ?, progress = ?, note = ?, sort_order = ?, version = version + 1, updated_at = ?',
        'WHERE id = ?',
      ].join(' '),
    )
    .bind(
      Object.prototype.hasOwnProperty.call(payload, 'title') ? trim(payload.title) || access.task.title : access.task.title,
      Object.prototype.hasOwnProperty.call(payload, 'assigneeUserId') ? trim(payload.assigneeUserId) || null : access.task.assigneeUserId,
      Object.prototype.hasOwnProperty.call(payload, 'assigneeName') ? trim(payload.assigneeName) : access.task.assigneeName,
      Object.prototype.hasOwnProperty.call(payload, 'assigneeEmail') ? normalizeEmail(payload.assigneeEmail) : access.task.assigneeEmail,
      Object.prototype.hasOwnProperty.call(payload, 'assigneePosition') ? trim(payload.assigneePosition) : access.task.assigneePosition,
      Object.prototype.hasOwnProperty.call(payload, 'startDate') ? normalizeDateYmd(payload.startDate) : access.task.startDate,
      Object.prototype.hasOwnProperty.call(payload, 'endDate')
        ? normalizeDateYmd(payload.endDate || payload.startDate)
        : access.task.endDate,
      Object.prototype.hasOwnProperty.call(payload, 'progress') ? clampProgress(payload.progress) : access.task.progress,
      Object.prototype.hasOwnProperty.call(payload, 'note') ? trim(payload.note) : access.task.note,
      Object.prototype.hasOwnProperty.call(payload, 'sortOrder')
        ? Math.max(1, normalizeBaseVersion(payload.sortOrder) || 1)
        : access.task.sortOrder,
      timestamp,
      taskId,
    )
    .run();

  if (Object.prototype.hasOwnProperty.call(payload, 'dependencyIds')) {
    const loaded = await loadCardTasksAndDependencies(env.DB, access.card.id);
    const validTaskIds = new Set(loaded.tasks.map((task) => task.id));
    const dependencyIds = sanitizeDependencyIds(taskId, payload.dependencyIds, validTaskIds);
    await replaceTaskDependencies(env.DB, taskId, dependencyIds, timestamp);
  }

  const card = await refreshCardRollup(env.DB, access.card.id, timestamp);
  await refreshBoardTimestamp(env.DB, access.card.boardId, timestamp);
  await refreshWorkspaceTimestamp(env.DB, access.card.workspaceId, timestamp);
  const task = await getTaskById(env.DB, taskId);
  await publishWorkspaceEvent(env, access.card.workspaceId, {
    type: 'task.updated',
    entityType: 'card-task',
    entityId: taskId,
    version: task?.version,
    payload: { task, card },
  });
  return helpers.jsonResponse({ task, card });
};

const handleDeleteTask = async (request, env, helpers, taskId) => {
  const access = await ensureTaskAccess(request, env, helpers, taskId);
  if (access.error) return access.error;
  const bodyResult = await helpers.readJsonObjectBody(request);
  if (bodyResult.ok) {
    const baseVersion = normalizeBaseVersion(bodyResult.payload.baseVersion);
    if (baseVersion != null && baseVersion !== access.task.version) {
      return helpers.jsonResponse({ error: '버전 충돌이 발생했습니다.', latest: access.task }, { status: 409 });
    }
  }
  const timestamp = nowMs();
  await env.DB.prepare('DELETE FROM collab_card_task_dependencies WHERE task_id = ? OR dependency_task_id = ?').bind(taskId, taskId).run();
  await env.DB.prepare('DELETE FROM collab_card_tasks WHERE id = ?').bind(taskId).run();
  const card = await refreshCardRollup(env.DB, access.card.id, timestamp);
  await refreshBoardTimestamp(env.DB, access.card.boardId, timestamp);
  await refreshWorkspaceTimestamp(env.DB, access.card.workspaceId, timestamp);
  await publishWorkspaceEvent(env, access.card.workspaceId, {
    type: 'task.deleted',
    entityType: 'card-task',
    entityId: taskId,
    payload: { id: taskId, card },
  });
  return helpers.jsonResponse({ ok: true, id: taskId, card });
};

const handleCreateTimeOff = async (request, env, helpers) => {
  const bodyResult = await helpers.readJsonObjectBody(request);
  if (!bodyResult.ok) return helpers.errorResponse(bodyResult.message, { status: 400 });
  const workspaceId = trim(bodyResult.payload.workspaceId);
  if (!workspaceId) return helpers.errorResponse('workspaceId가 필요합니다.', { status: 400 });
  const access = await ensureWorkspaceAccess(request, env, helpers, workspaceId);
  if (access.error) return access.error;
  const title = trim(bodyResult.payload.title);
  const startDate = normalizeDateYmd(bodyResult.payload.startDate);
  const endDate = normalizeDateYmd(bodyResult.payload.endDate || bodyResult.payload.startDate);
  if (!title || !startDate) return helpers.errorResponse('title과 startDate가 필요합니다.', { status: 400 });
  const timestamp = nowMs();
  const entryId = createId();
  await env.DB
    .prepare(
      [
        'INSERT INTO collab_time_off_entries (',
        'id, workspace_id, member_user_id, member_name, member_email, title, start_date, end_date, version, created_at, updated_at',
        ') VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)',
      ].join(' '),
    )
    .bind(
      entryId,
      workspaceId,
      trim(bodyResult.payload.memberUserId) || null,
      trim(bodyResult.payload.memberName),
      normalizeEmail(bodyResult.payload.memberEmail),
      title,
      startDate,
      endDate || startDate,
      timestamp,
      timestamp,
    )
    .run();
  await refreshWorkspaceTimestamp(env.DB, workspaceId, timestamp);
  const entry = await getTimeOffById(env.DB, entryId);
  await publishWorkspaceEvent(env, workspaceId, {
    type: 'timeoff.created',
    entityType: 'time-off',
    entityId: entryId,
    version: entry?.version,
    payload: { entry },
  });
  return helpers.jsonResponse({ entry }, { status: 201 });
};

const handlePatchTimeOff = async (request, env, helpers, entryId) => {
  const access = await ensureTimeOffAccess(request, env, helpers, entryId);
  if (access.error) return access.error;
  const bodyResult = await helpers.readJsonObjectBody(request);
  if (!bodyResult.ok) return helpers.errorResponse(bodyResult.message, { status: 400 });
  const payload = bodyResult.payload;
  const baseVersion = normalizeBaseVersion(payload.baseVersion);
  if (baseVersion == null) return helpers.errorResponse('baseVersion 값이 필요합니다.', { status: 400 });
  if (baseVersion !== access.entry.version) {
    return helpers.jsonResponse({ error: '버전 충돌이 발생했습니다.', latest: access.entry }, { status: 409 });
  }
  const timestamp = nowMs();
  await env.DB
    .prepare(
      [
        'UPDATE collab_time_off_entries',
        'SET member_user_id = ?, member_name = ?, member_email = ?, title = ?, start_date = ?, end_date = ?, version = version + 1, updated_at = ?',
        'WHERE id = ?',
      ].join(' '),
    )
    .bind(
      Object.prototype.hasOwnProperty.call(payload, 'memberUserId') ? trim(payload.memberUserId) || null : access.entry.memberUserId,
      Object.prototype.hasOwnProperty.call(payload, 'memberName') ? trim(payload.memberName) : access.entry.memberName,
      Object.prototype.hasOwnProperty.call(payload, 'memberEmail') ? normalizeEmail(payload.memberEmail) : access.entry.memberEmail,
      Object.prototype.hasOwnProperty.call(payload, 'title') ? trim(payload.title) || access.entry.title : access.entry.title,
      Object.prototype.hasOwnProperty.call(payload, 'startDate') ? normalizeDateYmd(payload.startDate) : access.entry.startDate,
      Object.prototype.hasOwnProperty.call(payload, 'endDate')
        ? normalizeDateYmd(payload.endDate || payload.startDate)
        : access.entry.endDate,
      timestamp,
      entryId,
    )
    .run();
  await refreshWorkspaceTimestamp(env.DB, access.entry.workspaceId, timestamp);
  const entry = await getTimeOffById(env.DB, entryId);
  await publishWorkspaceEvent(env, access.entry.workspaceId, {
    type: 'timeoff.updated',
    entityType: 'time-off',
    entityId: entryId,
    version: entry?.version,
    payload: { entry },
  });
  return helpers.jsonResponse({ entry });
};

const handleDeleteTimeOff = async (request, env, helpers, entryId) => {
  const access = await ensureTimeOffAccess(request, env, helpers, entryId);
  if (access.error) return access.error;
  const bodyResult = await helpers.readJsonObjectBody(request);
  if (bodyResult.ok) {
    const baseVersion = normalizeBaseVersion(bodyResult.payload.baseVersion);
    if (baseVersion != null && baseVersion !== access.entry.version) {
      return helpers.jsonResponse({ error: '버전 충돌이 발생했습니다.', latest: access.entry }, { status: 409 });
    }
  }
  const timestamp = nowMs();
  await env.DB.prepare('DELETE FROM collab_time_off_entries WHERE id = ?').bind(entryId).run();
  await refreshWorkspaceTimestamp(env.DB, access.entry.workspaceId, timestamp);
  await publishWorkspaceEvent(env, access.entry.workspaceId, {
    type: 'timeoff.deleted',
    entityType: 'time-off',
    entityId: entryId,
    payload: { id: entryId },
  });
  return helpers.jsonResponse({ ok: true, id: entryId });
};

const handleCreateShareLink = async (request, env, helpers) => {
  const bodyResult = await helpers.readJsonObjectBody(request);
  if (!bodyResult.ok) return helpers.errorResponse(bodyResult.message, { status: 400 });
  const workspaceId = trim(bodyResult.payload.workspaceId);
  const scope = trim(bodyResult.payload.scope) === 'board' ? 'board' : 'workspace';
  const boardId = scope === 'board' ? trim(bodyResult.payload.boardId) : '';
  if (!workspaceId) return helpers.errorResponse('workspaceId가 필요합니다.', { status: 400 });
  const access = await ensureWorkspaceAccess(request, env, helpers, workspaceId);
  if (access.error) return access.error;
  if (scope === 'board') {
    const board = await getBoardById(env.DB, boardId);
    if (!board || board.workspaceId !== workspaceId) {
      return helpers.errorResponse('보드 공유 링크에는 boardId가 필요합니다.', { status: 400 });
    }
  }
  const timestamp = nowMs();
  const token = createShareToken();
  const tokenHash = await sha256Hex(token);
  const shareLinkId = createId();
  await env.DB
    .prepare(
      [
        'INSERT INTO collab_share_links (id, workspace_id, board_id, token_hash, token_hint, scope, created_by_user_id, created_at, updated_at)',
        'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      ].join(' '),
    )
    .bind(shareLinkId, workspaceId, boardId || null, tokenHash, token.slice(-8), scope, trim(access.user.id), timestamp, timestamp)
    .run();
  await refreshWorkspaceTimestamp(env.DB, workspaceId, timestamp);
  const row = await env.DB.prepare('SELECT * FROM collab_share_links WHERE id = ? LIMIT 1').bind(shareLinkId).first();
  const shareLink = mapShareLinkRow(row);
  await publishWorkspaceEvent(env, workspaceId, {
    type: 'share.created',
    entityType: 'share-link',
    entityId: shareLinkId,
    payload: { shareLink },
  });
  return helpers.jsonResponse({ shareLink, token, sharePath: `/share/${encodeURIComponent(token)}` }, { status: 201 });
};

const handleGetShareSnapshot = async (_request, env, helpers, token) => {
  const shareLink = await getShareLinkByToken(env.DB, token);
  if (!shareLink) return helpers.errorResponse('공유 링크를 찾을 수 없습니다.', { status: 404 });
  const snapshot = await buildShareSnapshotPayload(env.DB, shareLink);
  if (!snapshot) return helpers.errorResponse('공유 스냅샷을 찾을 수 없습니다.', { status: 404 });
  return helpers.jsonResponse(snapshot);
};

const handleImportLegacy = async (request, env, helpers) => {
  const auth = await helpers.ensureAuthenticatedUser(request, env);
  if (auth.error) return auth.error;
  const bodyResult = await helpers.readJsonObjectBody(request);
  if (!bodyResult.ok) return helpers.errorResponse(bodyResult.message, { status: 400 });
  const payload = bodyResult.payload;
  const schedulePayload = isPlainObject(payload.schedulePayload)
    ? payload.schedulePayload
    : {
        name: trim(payload.name),
        tasks: Array.isArray(payload.tasks) ? payload.tasks : [],
        vacations: Array.isArray(payload.vacations) ? payload.vacations : [],
      };

  let workspaceId = trim(payload.workspaceId);
  if (workspaceId) {
    const membership = await getMembership(env.DB, workspaceId, auth.user.id);
    if (!membership) return helpers.errorResponse('워크스페이스를 찾을 수 없거나 접근 권한이 없습니다.', { status: 404 });
  } else {
    const scaffold = await createWorkspaceScaffold(env.DB, auth.user, {
      name: trim(payload.workspaceName) || trim(schedulePayload.name) || '가져온 워크스페이스',
      description: trim(payload.workspaceDescription),
      boardName: trim(schedulePayload.name) || '가져온 보드',
    });
    workspaceId = scaffold.workspaceId;
  }

  const workspace = await getWorkspaceById(env.DB, workspaceId);
  if (!workspace) return helpers.errorResponse('워크스페이스를 찾을 수 없습니다.', { status: 404 });

  const timestamp = nowMs();
  const boardId = createId();
  await env.DB
    .prepare(
      [
        'INSERT INTO collab_boards (id, workspace_id, name, description, created_at, updated_at)',
        'VALUES (?, ?, ?, ?, ?, ?)',
      ].join(' '),
    )
    .bind(boardId, workspaceId, trim(payload.boardName) || trim(schedulePayload.name) || '가져온 보드', '', timestamp, timestamp)
    .run();
  await createBoardColumns(env.DB, boardId, timestamp);
  const columns = await listBoardColumns(env.DB, boardId);
  const rows = buildLegacyImportRows({
    workspaceId,
    boardId,
    schedulePayload,
    columnIdsByKind: columns,
    idFactory: createId,
    timestamp,
    actorUserId: auth.user.id,
  });

  const statements = [
    ...rows.cards.map((card) =>
      env.DB
        .prepare(
          [
            'INSERT INTO collab_cards (',
            'id, workspace_id, board_id, column_id, title, description, lead_user_id, lead_name, lead_email, lead_position,',
            'priority, tags_json, sort_order, start_date, end_date, progress, version, created_by_user_id, created_at, updated_at',
            ') VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          ].join(' '),
        )
        .bind(
          card.id,
          card.workspaceId,
          card.boardId,
          card.columnId,
          card.title,
          card.description,
          card.leadUserId,
          card.leadName,
          card.leadEmail,
          card.leadPosition,
          card.priority,
          jsonArrayString(card.tags),
          card.sortOrder,
          card.startDate,
          card.endDate,
          card.progress,
          card.version,
          card.createdByUserId,
          card.createdAt,
          card.updatedAt,
        ),
    ),
    ...rows.tasks.map((task) =>
      env.DB
        .prepare(
          [
            'INSERT INTO collab_card_tasks (',
            'id, card_id, title, assignee_user_id, assignee_name, assignee_email, assignee_position, start_date, end_date, progress, note, sort_order, version, created_by_user_id, created_at, updated_at',
            ') VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          ].join(' '),
        )
        .bind(
          task.id,
          task.cardId,
          task.title,
          task.assigneeUserId,
          task.assigneeName,
          task.assigneeEmail,
          task.assigneePosition,
          task.startDate,
          task.endDate,
          task.progress,
          task.note,
          task.sortOrder,
          task.version,
          task.createdByUserId,
          task.createdAt,
          task.updatedAt,
        ),
    ),
    ...rows.dependencies.map((dependency) =>
      env.DB
        .prepare(
          [
            'INSERT INTO collab_card_task_dependencies (task_id, dependency_task_id, created_at)',
            'VALUES (?, ?, ?)',
          ].join(' '),
        )
        .bind(dependency.taskId, dependency.dependencyTaskId, dependency.createdAt),
    ),
    ...rows.timeOffEntries.map((entry) =>
      env.DB
        .prepare(
          [
            'INSERT INTO collab_time_off_entries (',
            'id, workspace_id, member_user_id, member_name, member_email, title, start_date, end_date, version, created_at, updated_at',
            ') VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)',
          ].join(' '),
        )
        .bind(
          entry.id,
          entry.workspaceId,
          entry.memberUserId,
          entry.memberName,
          entry.memberEmail,
          entry.title,
          entry.startDate,
          entry.endDate,
          entry.createdAt,
          entry.updatedAt,
        ),
    ),
  ];

  if (statements.length) await env.DB.batch(statements);
  await refreshBoardTimestamp(env.DB, boardId, timestamp);
  await refreshWorkspaceTimestamp(env.DB, workspaceId, timestamp);
  await Promise.all(rows.cards.map((card) => refreshCardRollup(env.DB, card.id, timestamp)));

  await publishWorkspaceEvent(env, workspaceId, {
    type: 'legacy.imported',
    entityType: 'workspace',
    entityId: workspaceId,
    payload: { workspaceId, boardId },
  });

  const snapshot = await loadWorkspaceSnapshot(env.DB, workspaceId, { includeShareLinks: true });
  return helpers.jsonResponse({ workspace, boardId, snapshot }, { status: 201 });
};

const handleRealtimeRequest = async (request, env, helpers, url) => {
  const upgrade = trim(request.headers.get('Upgrade')).toLowerCase();
  if (upgrade !== 'websocket') {
    return helpers.errorResponse('WebSocket 업그레이드가 필요합니다.', { status: 426 });
  }
  if (!env.COLLAB_REALTIME) {
    return helpers.errorResponse('실시간 서비스가 설정되지 않았습니다.', { status: 501 });
  }

  const shareToken = trim(url.searchParams.get('shareToken'));
  let workspaceId = trim(url.searchParams.get('workspaceId'));
  let viewerId = '';
  let viewerEmail = '';
  let viewerName = '';
  let readOnly = false;

  if (shareToken) {
    const shareLink = await getShareLinkByToken(env.DB, shareToken);
    if (!shareLink) return helpers.errorResponse('공유 링크를 찾을 수 없습니다.', { status: 404 });
    workspaceId = shareLink.workspaceId;
    viewerId = `share:${shareLink.tokenHint || 'viewer'}`;
    viewerName = '공유 보기 사용자';
    readOnly = true;
  } else {
    const access = await ensureWorkspaceAccess(request, env, helpers, workspaceId);
    if (access.error) return access.error;
    viewerId = trim(access.user.id);
    viewerEmail = normalizeEmail(access.user.email);
    viewerName = viewerEmail || viewerId;
  }

  if (!workspaceId) return helpers.errorResponse('workspaceId가 필요합니다.', { status: 400 });

  const proxyHeaders = new Headers(request.headers);
  proxyHeaders.set('x-collab-workspace-id', workspaceId);
  proxyHeaders.set('x-collab-viewer-id', viewerId);
  proxyHeaders.set('x-collab-viewer-email', viewerEmail);
  proxyHeaders.set('x-collab-viewer-name', viewerName);
  proxyHeaders.set('x-collab-read-only', readOnly ? '1' : '0');

  const proxyRequest = new Request('https://collab.internal/connect', {
    method: 'GET',
    headers: proxyHeaders,
  });
  const stub = env.COLLAB_REALTIME.get(env.COLLAB_REALTIME.idFromName(`workspace:${workspaceId}`));
  return stub.fetch(proxyRequest);
};

export const handleCollabRequest = async ({ request, env, helpers, url, method, pathname }) => {
  if (method === 'GET' && pathname === '/api/v2/workspaces') return handleListWorkspaces(request, env, helpers);
  if (method === 'POST' && pathname === '/api/v2/workspaces') return handleCreateWorkspace(request, env, helpers);

  const workspaceSnapshotMatch = /^\/api\/v2\/workspaces\/([^/]+)\/snapshot$/.exec(pathname);
  if (method === 'GET' && workspaceSnapshotMatch) {
    return handleGetWorkspaceSnapshot(request, env, helpers, decodeURIComponent(workspaceSnapshotMatch[1]));
  }

  if (method === 'POST' && pathname === '/api/v2/boards') return handleCreateBoard(request, env, helpers);
  if (method === 'POST' && pathname === '/api/v2/board-columns') return handleCreateBoardColumn(request, env, helpers);
  if (method === 'POST' && pathname === '/api/v2/cards') return handleCreateCard(request, env, helpers);
  if (method === 'POST' && pathname === '/api/v2/card-tasks') return handleCreateTask(request, env, helpers);
  if (method === 'POST' && pathname === '/api/v2/time-off') return handleCreateTimeOff(request, env, helpers);
  if (method === 'POST' && pathname === '/api/v2/share-links') return handleCreateShareLink(request, env, helpers);
  if (method === 'POST' && pathname === '/api/v2/import/legacy') return handleImportLegacy(request, env, helpers);
  if (method === 'GET' && pathname === '/api/v2/realtime') return handleRealtimeRequest(request, env, helpers, url);

  const cardMatch = /^\/api\/v2\/cards\/([^/]+)$/.exec(pathname);
  if (cardMatch) {
    const cardId = decodeURIComponent(cardMatch[1]);
    if (method === 'PATCH') return handlePatchCard(request, env, helpers, cardId);
    if (method === 'DELETE') return handleDeleteCard(request, env, helpers, cardId);
  }

  const taskMatch = /^\/api\/v2\/card-tasks\/([^/]+)$/.exec(pathname);
  if (taskMatch) {
    const taskId = decodeURIComponent(taskMatch[1]);
    if (method === 'PATCH') return handlePatchTask(request, env, helpers, taskId);
    if (method === 'DELETE') return handleDeleteTask(request, env, helpers, taskId);
  }

  const timeOffMatch = /^\/api\/v2\/time-off\/([^/]+)$/.exec(pathname);
  if (timeOffMatch) {
    const entryId = decodeURIComponent(timeOffMatch[1]);
    if (method === 'PATCH') return handlePatchTimeOff(request, env, helpers, entryId);
    if (method === 'DELETE') return handleDeleteTimeOff(request, env, helpers, entryId);
  }

  const shareSnapshotMatch = /^\/api\/v2\/share-links\/([^/]+)\/snapshot$/.exec(pathname);
  if (method === 'GET' && shareSnapshotMatch) {
    return handleGetShareSnapshot(request, env, helpers, decodeURIComponent(shareSnapshotMatch[1]));
  }

  return helpers.errorResponse('찾을 수 없습니다.', { status: 404 });
};

const getConnectionMeta = (ws) => {
  try {
    return ws.deserializeAttachment() || {};
  } catch {
    return {};
  }
};

export class CollabWorkspaceRoom extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.ctx = ctx;
    this.env = env;
  }

  listPresence() {
    const deduped = new Map();
    this.ctx.getWebSockets().forEach((ws) => {
      const meta = getConnectionMeta(ws);
      const key = trim(meta.viewerId) || trim(meta.viewerEmail) || trim(meta.connectionId);
      if (!key) return;
      if (!deduped.has(key)) {
        deduped.set(key, {
          viewerId: trim(meta.viewerId) || null,
          viewerEmail: normalizeEmail(meta.viewerEmail) || null,
          viewerName: trim(meta.viewerName) || trim(meta.viewerEmail) || '참여자',
          readOnly: String(meta.readOnly) === '1',
        });
      }
    });
    return Array.from(deduped.values());
  }

  broadcast(payload) {
    const text = JSON.stringify(payload);
    this.ctx.getWebSockets().forEach((ws) => {
      try {
        ws.send(text);
      } catch {
        try {
          ws.close(1011, 'send failed');
        } catch {
          // ignore
        }
      }
    });
  }

  broadcastPresence() {
    this.broadcast({ type: 'presence', viewers: this.listPresence() });
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (request.method === 'POST' && url.pathname === '/broadcast') {
      const payload = await request.json().catch(() => null);
      if (!payload || !isPlainObject(payload)) {
        return new Response(JSON.stringify({ error: '잘못된 요청 본문입니다.' }), {
          status: 400,
          headers: { 'content-type': 'application/json; charset=utf-8' },
        });
      }
      this.broadcast({ type: 'event', event: payload.event || null });
      return new Response(JSON.stringify({ ok: true }), {
        headers: { 'content-type': 'application/json; charset=utf-8' },
      });
    }

    if (request.method === 'GET' && url.pathname === '/connect') {
      const upgrade = trim(request.headers.get('Upgrade')).toLowerCase();
      if (upgrade !== 'websocket') {
        return new Response('WebSocket 업그레이드가 필요합니다.', { status: 426 });
      }

      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      const meta = {
        connectionId: createId(),
        workspaceId: trim(request.headers.get('x-collab-workspace-id')),
        viewerId: trim(request.headers.get('x-collab-viewer-id')),
        viewerEmail: normalizeEmail(request.headers.get('x-collab-viewer-email')),
        viewerName: trim(request.headers.get('x-collab-viewer-name')),
        readOnly: trim(request.headers.get('x-collab-read-only')) === '1' ? '1' : '0',
      };
      server.serializeAttachment(meta);
      this.ctx.acceptWebSocket(server);
      server.send(
        JSON.stringify({
          type: 'hello',
          connectionId: meta.connectionId,
          workspaceId: meta.workspaceId,
          readOnly: meta.readOnly === '1',
          viewers: this.listPresence(),
        }),
      );
      this.broadcastPresence();
      return new Response(null, { status: 101, webSocket: client });
    }

    return new Response('찾을 수 없습니다.', { status: 404 });
  }

  webSocketMessage(ws, message) {
    let payload = null;
    try {
      payload = typeof message === 'string' ? JSON.parse(message) : null;
    } catch {
      payload = null;
    }
    if (payload?.type === 'ping') {
      ws.send(JSON.stringify({ type: 'pong', ts: nowMs() }));
      return;
    }
    if (payload?.type === 'presence:sync') {
      ws.send(JSON.stringify({ type: 'presence', viewers: this.listPresence() }));
    }
  }

  webSocketClose() {
    this.broadcastPresence();
  }

  webSocketError() {
    this.broadcastPresence();
  }
}

export const getCollabSchemaStatements = () => getCollabSchemaStatementsImpl();
