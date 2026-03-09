export const DEFAULT_BOARD_COLUMN_PRESETS = [
  { name: '예정', kind: 'todo', sortOrder: 1 },
  { name: '진행 중', kind: 'doing', sortOrder: 2 },
  { name: '완료', kind: 'done', sortOrder: 3 },
];

const trim = (value) => String(value ?? '').trim();

const clampProgress = (value) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
};

export const normalizeDateYmd = (value) => {
  const raw = trim(value);
  if (!raw) return '';
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : '';
};

export const toUtcMidnightMs = (value) => {
  const ymd = normalizeDateYmd(value);
  if (!ymd) return Number.NaN;
  const parsed = Date.parse(`${ymd}T00:00:00Z`);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
};

export const deriveColumnKindFromProgress = (value) => {
  const progress = clampProgress(value);
  if (progress >= 100) return 'done';
  if (progress > 0) return 'doing';
  return 'todo';
};

export const buildColumnMap = (columns) => {
  const safeColumns = Array.isArray(columns) ? columns : [];
  const byKind = new Map();
  safeColumns.forEach((column) => {
    const kind = trim(column?.kind).toLowerCase();
    if (!kind || byKind.has(kind)) return;
    byKind.set(kind, trim(column?.id));
  });
  return byKind;
};

export const rollupCardSummary = (card, tasks) => {
  const safeTasks = Array.isArray(tasks) ? tasks : [];
  if (!safeTasks.length) {
    return {
      progress: clampProgress(card?.progress),
      startDate: normalizeDateYmd(card?.startDate),
      endDate: normalizeDateYmd(card?.endDate),
    };
  }

  let progressTotal = 0;
  let progressCount = 0;
  let startMs = Number.POSITIVE_INFINITY;
  let endMs = Number.NEGATIVE_INFINITY;

  safeTasks.forEach((task) => {
    progressTotal += clampProgress(task?.progress);
    progressCount += 1;

    const taskStartMs = toUtcMidnightMs(task?.startDate);
    const taskEndMs = toUtcMidnightMs(task?.endDate || task?.startDate);
    if (Number.isFinite(taskStartMs)) startMs = Math.min(startMs, taskStartMs);
    if (Number.isFinite(taskEndMs)) endMs = Math.max(endMs, taskEndMs);
  });

  return {
    progress: progressCount > 0 ? clampProgress(progressTotal / progressCount) : clampProgress(card?.progress),
    startDate: Number.isFinite(startMs) ? new Date(startMs).toISOString().slice(0, 10) : normalizeDateYmd(card?.startDate),
    endDate: Number.isFinite(endMs) ? new Date(endMs).toISOString().slice(0, 10) : normalizeDateYmd(card?.endDate),
  };
};

export const normalizeLegacySchedulePayload = (payload, fallbackName = '') => {
  if (Array.isArray(payload)) {
    return {
      name: trim(fallbackName) || 'Imported schedule',
      tasks: payload,
      vacations: [],
    };
  }

  if (!payload || typeof payload !== 'object') {
    throw new Error('기존 일정 payload는 객체 또는 작업 배열이어야 합니다.');
  }

  return {
    name: trim(payload.name || fallbackName) || '가져온 일정',
    tasks: Array.isArray(payload.tasks) ? payload.tasks : [],
    vacations: Array.isArray(payload.vacations) ? payload.vacations : [],
  };
};

const normalizeLegacyTask = (task, index) => {
  const safeTask = task && typeof task === 'object' ? task : {};
  const title = trim(safeTask.taskName || safeTask.title || `가져온 작업 ${index + 1}`) || `가져온 작업 ${index + 1}`;
  const note = trim(safeTask.memo ?? safeTask.note ?? '');
  const startDate = normalizeDateYmd(safeTask.start);
  const endDate = normalizeDateYmd(safeTask.end || safeTask.start);
  return {
    legacyId: trim(safeTask.id) || `legacy-${index + 1}`,
    title,
    description: note,
    category: trim(safeTask.category),
    department: trim(safeTask.department),
    assigneeName: trim(safeTask.assignee),
    assigneeEmail: trim(safeTask.assigneeEmail || safeTask.assignee_email).toLowerCase(),
    assigneePosition: trim(safeTask.assigneePosition || safeTask.assignee_position || safeTask.position),
    note,
    startDate,
    endDate,
    progress: clampProgress(safeTask.progress),
    dependencyIds: Array.isArray(safeTask.dependencies)
      ? safeTask.dependencies.map((value) => trim(value)).filter(Boolean)
      : [],
  };
};

const normalizeLegacyVacation = (entry, index) => {
  const safeEntry = entry && typeof entry === 'object' ? entry : {};
  const startDate = normalizeDateYmd(safeEntry.start);
  const endDate = normalizeDateYmd(safeEntry.end || safeEntry.start);
  if (!startDate) return null;
  return {
    legacyId: trim(safeEntry.id) || `vacation-${index + 1}`,
    title: trim(safeEntry.title || safeEntry.name || '휴무') || '휴무',
    startDate,
    endDate,
  };
};

export const buildLegacyImportRows = ({
  workspaceId,
  boardId,
  schedulePayload,
  columnIdsByKind,
  idFactory,
  timestamp,
  actorUserId,
}) => {
  const safeTimestamp = Number(timestamp) || Date.now();
  const makeId = typeof idFactory === 'function' ? idFactory : () => crypto.randomUUID();
  const normalized = normalizeLegacySchedulePayload(schedulePayload);
  const safeColumnIds = columnIdsByKind instanceof Map ? columnIdsByKind : buildColumnMap(columnIdsByKind);
  const taskIdByLegacyId = new Map();

  const cards = normalized.tasks.map((item, index) => {
    const legacyTask = normalizeLegacyTask(item, index);
    const cardId = makeId();
    const taskId = makeId();
    const kind = deriveColumnKindFromProgress(legacyTask.progress);
    const tags = [legacyTask.category, legacyTask.department].filter(Boolean);
    const columnId = safeColumnIds.get(kind) || '';

    taskIdByLegacyId.set(legacyTask.legacyId, taskId);

    return {
      card: {
        id: cardId,
        workspaceId,
        boardId,
        columnId,
        title: legacyTask.title,
        description: legacyTask.description,
        leadUserId: null,
        leadName: legacyTask.assigneeName,
        leadEmail: legacyTask.assigneeEmail,
        leadPosition: legacyTask.assigneePosition,
        priority: kind === 'done' ? 'done' : kind === 'doing' ? 'active' : 'planned',
        tags,
        sortOrder: index + 1,
        startDate: legacyTask.startDate,
        endDate: legacyTask.endDate,
        progress: legacyTask.progress,
        version: 1,
        createdByUserId: actorUserId,
        createdAt: safeTimestamp,
        updatedAt: safeTimestamp,
      },
      task: {
        id: taskId,
        cardId,
        title: legacyTask.title,
        assigneeUserId: null,
        assigneeName: legacyTask.assigneeName,
        assigneeEmail: legacyTask.assigneeEmail,
        assigneePosition: legacyTask.assigneePosition,
        startDate: legacyTask.startDate,
        endDate: legacyTask.endDate,
        progress: legacyTask.progress,
        note: legacyTask.note,
        sortOrder: 1,
        version: 1,
        createdByUserId: actorUserId,
        createdAt: safeTimestamp,
        updatedAt: safeTimestamp,
      },
      dependencyIds: legacyTask.dependencyIds,
    };
  });

  const dependencies = [];
  cards.forEach((entry) => {
    entry.dependencyIds.forEach((legacyDependencyId) => {
      const dependencyTaskId = taskIdByLegacyId.get(legacyDependencyId);
      if (!dependencyTaskId) return;
      dependencies.push({
        taskId: entry.task.id,
        dependencyTaskId,
        createdAt: safeTimestamp,
      });
    });
  });

  const timeOffEntries = normalized.vacations
    .map((entry, index) => normalizeLegacyVacation(entry, index))
    .filter(Boolean)
    .map((entry) => ({
      id: makeId(),
      workspaceId,
      memberUserId: null,
      memberName: '',
      memberEmail: '',
      title: entry.title,
      startDate: entry.startDate,
      endDate: entry.endDate,
      createdAt: safeTimestamp,
      updatedAt: safeTimestamp,
    }));

  return {
    boardName: normalized.name,
    cards: cards.map((entry) => entry.card),
    tasks: cards.map((entry) => entry.task),
    dependencies,
    timeOffEntries,
  };
};
