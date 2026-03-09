import { generateId, normalizeTasks, normalizeVacations } from '../utils/data.js';
import { formatDate, toUtcMidnightMs } from '../utils/dates.js';

const clampProgress = (value) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
};

const uniqueIds = (values, ownId = '') => {
  const seen = new Set();
  const result = [];

  (Array.isArray(values) ? values : []).forEach((value) => {
    const id = String(value || '').trim();
    if (!id || id === ownId || seen.has(id)) return;
    seen.add(id);
    result.push(id);
  });

  return result;
};

export const createDefaultColumns = () => [
  { kind: 'todo', name: '예정', sortOrder: 1 },
  { kind: 'doing', name: '진행 중', sortOrder: 2 },
  { kind: 'done', name: '완료', sortOrder: 3 },
];

export const deriveColumnKindFromProgress = (progress) => {
  const safeProgress = clampProgress(progress);
  if (safeProgress >= 100) return 'done';
  if (safeProgress <= 0) return 'todo';
  return 'doing';
};

export const normalizeCardTaskDependencies = (tasks) => {
  const validIds = new Set((Array.isArray(tasks) ? tasks : []).map((task) => String(task?.id || '').trim()).filter(Boolean));

  return (Array.isArray(tasks) ? tasks : []).map((task) => {
    const id = String(task?.id || '').trim();
    return {
      ...(task || {}),
      id,
      dependencyIds: uniqueIds(task?.dependencyIds ?? task?.dependencies ?? [], id).filter((depId) => validIds.has(depId)),
    };
  });
};

const minDate = (values) =>
  values.reduce((current, value) => {
    const ms = toUtcMidnightMs(value);
    if (!Number.isFinite(ms)) return current;
    if (current == null || ms < current) return ms;
    return current;
  }, null);

const maxDate = (values) =>
  values.reduce((current, value) => {
    const ms = toUtcMidnightMs(value);
    if (!Number.isFinite(ms)) return current;
    if (current == null || ms > current) return ms;
    return current;
  }, null);

export const computeCardRollup = ({ tasks = [], fallbackProgress = 0, fallbackStartDate = '', fallbackEndDate = '' } = {}) => {
  const safeTasks = Array.isArray(tasks) ? tasks : [];
  if (safeTasks.length === 0) {
    return {
      progress: clampProgress(fallbackProgress),
      startDate: String(fallbackStartDate || '').trim(),
      endDate: String(fallbackEndDate || '').trim(),
    };
  }

  const progress =
    safeTasks.length === 0
      ? clampProgress(fallbackProgress)
      : Math.round(safeTasks.reduce((sum, task) => sum + clampProgress(task?.progress), 0) / safeTasks.length);

  const earliest = minDate(safeTasks.flatMap((task) => [task?.startDate, task?.start]));
  const latest = maxDate(safeTasks.flatMap((task) => [task?.endDate, task?.end, task?.startDate, task?.start]));

  return {
    progress: clampProgress(progress),
    startDate: earliest == null ? String(fallbackStartDate || '').trim() : formatDate(earliest),
    endDate: latest == null ? String(fallbackEndDate || '').trim() : formatDate(latest),
  };
};

const createId = (prefix, rawId = '') => {
  const safeRaw = String(rawId || '').trim();
  return safeRaw ? `${prefix}-${safeRaw}` : `${prefix}-${generateId()}`;
};

export const buildLegacyBoardImport = (payload) => {
  const scheduleId = String(payload?.scheduleId || payload?.id || '').trim() || generateId();
  const boardId = createId('board', scheduleId);
  const columns = createDefaultColumns().map((column) => ({
    id: createId(`column-${column.kind}`, `${scheduleId}-${column.kind}`),
    boardId,
    kind: column.kind,
    name: column.name,
    sortOrder: column.sortOrder,
  }));
  const columnIdByKind = new Map(columns.map((column) => [column.kind, column.id]));

  const normalizedTasks = normalizeTasks(payload?.tasks || []);
  const normalizedVacations = normalizeVacations(payload?.vacations || []);

  const cards = [];
  const cardTasks = [];
  normalizedTasks.forEach((task, index) => {
    const cardId = createId('card', task.id || `${scheduleId}-${index + 1}`);
    const taskId = createId('card-task', task.id || `${scheduleId}-${index + 1}`);
    const columnKind = deriveColumnKindFromProgress(task.progress);
    const cardTask = {
      id: taskId,
      cardId,
      assigneeName: String(task.assignee || '').trim(),
      assigneeEmail: String(task.assigneeEmail || '').trim().toLowerCase(),
      title: String(task.taskName || '').trim() || `가져온 작업 ${index + 1}`,
      startDate: String(task.start || '').trim(),
      endDate: String(task.end || task.start || '').trim(),
      progress: clampProgress(task.progress),
      note: String(task.memo || '').trim(),
      dependencyIds: [],
      legacyTaskId: String(task.id || '').trim(),
    };

    const rollup = computeCardRollup({ tasks: [cardTask] });

    cards.push({
      id: cardId,
      boardId,
      columnId: columnIdByKind.get(columnKind) || columnIdByKind.get('todo'),
      columnKind,
      title: String(task.taskName || '').trim() || `가져온 작업 ${index + 1}`,
      description: String(task.memo || '').trim(),
      leadName: String(task.assignee || '').trim(),
      leadEmail: String(task.assigneeEmail || '').trim().toLowerCase(),
      rolledUpProgress: rollup.progress,
      rolledUpStart: rollup.startDate,
      rolledUpEnd: rollup.endDate,
      version: 1,
      legacyTaskId: String(task.id || '').trim(),
      legacyCategory: String(task.category || '').trim(),
      legacyDepartment: String(task.department || '').trim(),
    });

    cardTasks.push(cardTask);
  });

  const taskIdByLegacyId = new Map(cardTasks.map((task) => [String(task.legacyTaskId || '').trim(), task.id]));
  const normalizedCardTasks = normalizeCardTaskDependencies(
    cardTasks.map((task) => {
      const sourceTask = normalizedTasks.find((item) => String(item.id || '').trim() === String(task.legacyTaskId || '').trim());
      return {
        ...task,
        dependencyIds: (sourceTask?.dependencies || []).map((depId) => taskIdByLegacyId.get(String(depId || '').trim())).filter(Boolean),
      };
    }),
  );

  const timeOffEntries = normalizedVacations.map((vacation, index) => ({
    id: createId('time-off', vacation.id || `${scheduleId}-${index + 1}`),
    memberUserId: null,
    title: String(vacation.title || '휴무').trim() || '휴무',
    startDate: String(vacation.start || '').trim(),
    endDate: String(vacation.end || vacation.start || '').trim(),
    kind: 'global',
  }));

  return {
    board: {
      id: boardId,
      name: String(payload?.name || '가져온 보드').trim() || '가져온 보드',
      legacyScheduleId: scheduleId,
    },
    columns,
    cards,
    cardTasks: normalizedCardTasks,
    timeOffEntries,
  };
};
