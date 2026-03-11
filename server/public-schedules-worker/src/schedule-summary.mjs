export const MAX_HOLDING_REASON_LENGTH = 280;
export const MAX_NEXT_ACTION_LENGTH = 280;

const MAX_ACTIVITY_LOG_ENTRIES = 20;
const STALE_PROJECT_DAYS = 7;
const MAX_RECENT_ACTIVITY_SUMMARY_ENTRIES = 5;
const SCHEDULE_STATUS_PLANNING = 'planning';
const SCHEDULE_STATUS_IN_PROGRESS = 'in_progress';
const SCHEDULE_STATUS_HOLDING = 'holding';
const SCHEDULE_STATUS_CLOSED = 'closed';

export const SCHEDULE_STATUS_DEFAULT = SCHEDULE_STATUS_PLANNING;

const SCHEDULE_SUMMARY_COLUMNS = [
  'holding_reason',
  'next_action',
  'recent_activity_json',
  'overview_json',
];

export const SCHEDULE_SUMMARY_SELECT_SQL = [
  'holding_reason',
  'next_action',
  'recent_activity_json',
  'overview_json',
].join(', ');

const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
const isPlainObject = (value) => value != null && typeof value === 'object' && !Array.isArray(value);
const normalizeEmail = (value) => String(value || '').trim().toLowerCase();
const parseJsonSafe = (text) => {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};

const toSafeTimestamp = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : null;
};

const nowMs = () => Date.now();

const randomHex = (size = 16) => {
  const bytes = new Uint8Array(Math.max(1, Number(size) || 16));
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
};

const normalizeShortText = (value, { maxLength = 280 } = {}) => String(value || '').trim().slice(0, maxLength);

const normalizeYmdLike = (value) => {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    const directMatch = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/.exec(trimmed);
    if (directMatch) {
      const year = Number(directMatch[1]);
      const month = Number(directMatch[2]);
      const day = Number(directMatch[3]);
      if (
        Number.isFinite(year) &&
        Number.isFinite(month) &&
        Number.isFinite(day) &&
        month >= 1 &&
        month <= 12 &&
        day >= 1 &&
        day <= 31
      ) {
        return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      }
    }
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

const ymdToUtcMidnightMs = (value) => {
  const safeYmd = normalizeYmdLike(value);
  if (!safeYmd) return Number.NaN;
  const [yearRaw, monthRaw, dayRaw] = safeYmd.split('-');
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  const day = Number(dayRaw);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return Number.NaN;
  return Date.UTC(year, month - 1, day);
};

const diffDaysFromMs = (startMs, endMs) => {
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return Number.NaN;
  return Math.floor((endMs - startMs) / (1000 * 60 * 60 * 24));
};

const normalizeProgress = (value) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return clamp(Math.round(n), 0, 100);
};

const normalizeTaskSummary = (rawTask) => {
  const task = isPlainObject(rawTask) ? rawTask : {};
  const startRaw = task.start ?? task.actStart ?? task.planStart ?? '';
  const endRaw = task.end ?? task.actEnd ?? task.planEnd ?? task.start ?? task.actStart ?? task.planStart ?? '';
  let start = normalizeYmdLike(startRaw);
  let end = normalizeYmdLike(endRaw);
  const startMs = ymdToUtcMidnightMs(start);
  const endMs = ymdToUtcMidnightMs(end);
  if (Number.isFinite(startMs) && Number.isFinite(endMs) && endMs < startMs) {
    const nextStart = end;
    end = start;
    start = nextStart;
  }
  return {
    category: normalizeShortText(task.category, { maxLength: 80 }),
    taskName: normalizeShortText(task.taskName, { maxLength: 140 }),
    department: normalizeShortText(task.department, { maxLength: 80 }),
    assignee: normalizeShortText(task.assignee, { maxLength: 80 }),
    assigneeEmail: normalizeEmail(task.assigneeEmail ?? task.assignee_email),
    start,
    end,
    progress: normalizeProgress(task.progress),
  };
};

export const normalizeScheduleStatus = (value) => {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return SCHEDULE_STATUS_DEFAULT;

  switch (raw) {
    case SCHEDULE_STATUS_PLANNING:
    case 'plan':
      return SCHEDULE_STATUS_PLANNING;
    case SCHEDULE_STATUS_IN_PROGRESS:
    case 'in progress':
    case 'in-progress':
    case 'inprogress':
    case 'progress':
      return SCHEDULE_STATUS_IN_PROGRESS;
    case SCHEDULE_STATUS_HOLDING:
    case 'hold':
    case 'on hold':
    case 'on_hold':
    case 'paused':
      return SCHEDULE_STATUS_HOLDING;
    case SCHEDULE_STATUS_CLOSED:
    case 'done':
    case 'complete':
    case 'completed':
      return SCHEDULE_STATUS_CLOSED;
    default:
      return SCHEDULE_STATUS_DEFAULT;
  }
};

const normalizeActivityEntry = (entry) => {
  const source = isPlainObject(entry) ? entry : {};
  const message = normalizeShortText(source.message, { maxLength: 220 });
  if (!message) return null;
  return {
    id: normalizeShortText(source.id, { maxLength: 64 }) || randomHex(8),
    type: normalizeShortText(source.type, { maxLength: 48 }) || 'update',
    message,
    actorEmail: normalizeEmail(source.actorEmail ?? source.actor_email),
    at: toSafeTimestamp(source.at ?? source.createdAt ?? source.created_at) ?? nowMs(),
  };
};

export const normalizeActivityLog = (entries) =>
  (Array.isArray(entries) ? entries : [])
    .map((entry) => normalizeActivityEntry(entry))
    .filter(Boolean)
    .sort((a, b) => Number(b.at || 0) - Number(a.at || 0))
    .slice(0, MAX_ACTIVITY_LOG_ENTRIES);

export const createActivityEntry = ({ type = 'update', message = '', actorEmail = '', at = nowMs() } = {}) =>
  normalizeActivityEntry({
    id: randomHex(8),
    type,
    message,
    actorEmail,
    at,
  });

export const appendActivityEntries = (existingEntries, newEntries) =>
  normalizeActivityLog([...(Array.isArray(newEntries) ? newEntries : []), ...normalizeActivityLog(existingEntries)]);

export const buildScheduleSummaryPayload = ({ data = null, updatedAt = null, status = SCHEDULE_STATUS_DEFAULT } = {}) => {
  const safeData = isPlainObject(data) ? data : {};
  return {
    holdingReason: normalizeShortText(safeData.holdingReason, { maxLength: MAX_HOLDING_REASON_LENGTH }),
    nextAction: normalizeShortText(safeData.nextAction, { maxLength: MAX_NEXT_ACTION_LENGTH }),
    recentActivity: normalizeActivityLog(safeData.activityLog).slice(0, MAX_RECENT_ACTIVITY_SUMMARY_ENTRIES),
    overview: buildScheduleOverview({ data: safeData, updatedAt, status }),
  };
};

export const encodeScheduleSummaryPayload = (summary) => ({
  holdingReason: normalizeShortText(summary?.holdingReason, { maxLength: MAX_HOLDING_REASON_LENGTH }),
  nextAction: normalizeShortText(summary?.nextAction, { maxLength: MAX_NEXT_ACTION_LENGTH }),
  recentActivityJson: JSON.stringify(Array.isArray(summary?.recentActivity) ? summary.recentActivity : []),
  overviewJson: JSON.stringify(isPlainObject(summary?.overview) ? summary.overview : {}),
});

export const readScheduleSummaryFromRow = (row) => {
  const hasSummaryColumns = SCHEDULE_SUMMARY_COLUMNS.some((key) => Object.prototype.hasOwnProperty.call(row || {}, key));
  if (!hasSummaryColumns) return null;
  const recentActivity = parseJsonSafe(String(row?.recent_activity_json || row?.recentActivityJson || '[]'));
  const overview = parseJsonSafe(String(row?.overview_json || row?.overviewJson || '{}'));
  return {
    holdingReason: normalizeShortText(row?.holding_reason ?? row?.holdingReason ?? '', {
      maxLength: MAX_HOLDING_REASON_LENGTH,
    }),
    nextAction: normalizeShortText(row?.next_action ?? row?.nextAction ?? '', {
      maxLength: MAX_NEXT_ACTION_LENGTH,
    }),
    recentActivity: normalizeActivityLog(recentActivity).slice(0, MAX_RECENT_ACTIVITY_SUMMARY_ENTRIES),
    overview: isPlainObject(overview)
      ? overview
      : buildScheduleOverview({
          data: { activityLog: Array.isArray(recentActivity) ? recentActivity : [] },
          updatedAt: row?.updated_at ?? row?.updatedAt,
          status: row?.status,
        }),
  };
};

export const buildScheduleOverview = ({ data = null, updatedAt = null, status = SCHEDULE_STATUS_DEFAULT } = {}) => {
  const safeData = isPlainObject(data) ? data : {};
  const safeTasks = Array.isArray(safeData.tasks) ? safeData.tasks.map((task) => normalizeTaskSummary(task)) : [];
  const normalizedStatus = normalizeScheduleStatus(status ?? safeData.status);
  const todayMs = ymdToUtcMidnightMs(new Date());

  const progressTotal = safeTasks.reduce((sum, task) => sum + normalizeProgress(task.progress), 0);
  const completedTasks = safeTasks.filter((task) => task.progress >= 100).length;
  const activeTasks = safeTasks.filter((task) => task.progress < 100).length;
  const activeTaskDates = safeTasks.filter((task) => task.progress < 100);

  const assigneeCounts = new Map();
  const departmentCounts = new Map();
  const assigneeSource = activeTaskDates.length > 0 ? activeTaskDates : safeTasks;
  assigneeSource.forEach((task) => {
    const assignee = String(task.assignee || '').trim();
    const department = String(task.department || '').trim();
    if (assignee) assigneeCounts.set(assignee, (assigneeCounts.get(assignee) || 0) + 1);
    if (department) departmentCounts.set(department, (departmentCounts.get(department) || 0) + 1);
  });

  const orderedAssignees = Array.from(
    new Set(safeTasks.map((task) => String(task.assignee || '').trim()).filter(Boolean)),
  ).sort((a, b) => a.localeCompare(b, 'ko'));
  const orderedDepartments = Array.from(
    new Set(safeTasks.map((task) => String(task.department || '').trim()).filter(Boolean)),
  ).sort((a, b) => a.localeCompare(b, 'ko'));

  const choosePrimaryValue = (counts, fallbackValues) => {
    const ordered = Array.from(counts.entries()).sort((a, b) => {
      if (b[1] !== a[1]) return b[1] - a[1];
      return a[0].localeCompare(b[0], 'ko');
    });
    if (ordered.length > 0) return ordered[0][0];
    return Array.isArray(fallbackValues) ? fallbackValues[0] || '' : '';
  };

  const taskDatePairs = safeTasks
    .map((task) => ({
      startMs: ymdToUtcMidnightMs(task.start),
      endMs: ymdToUtcMidnightMs(task.end),
      progress: task.progress,
    }))
    .filter((task) => Number.isFinite(task.startMs) || Number.isFinite(task.endMs));

  const startCandidates = taskDatePairs.map((task) => task.startMs).filter(Number.isFinite);
  const endCandidatesAll = taskDatePairs.map((task) => task.endMs).filter(Number.isFinite);
  const endCandidatesActive = taskDatePairs
    .filter((task) => task.progress < 100)
    .map((task) => task.endMs)
    .filter(Number.isFinite);

  const projectStartMs = startCandidates.length > 0 ? Math.min(...startCandidates) : Number.NaN;
  const projectEndMs =
    (endCandidatesActive.length > 0 ? Math.max(...endCandidatesActive) : Math.max(...endCandidatesAll)) || Number.NaN;

  const delayedTasks = taskDatePairs.filter(
    (task) => task.progress < 100 && Number.isFinite(task.endMs) && task.endMs < todayMs,
  ).length;
  const dueTodayTasks = taskDatePairs.filter((task) => task.progress < 100 && task.endMs === todayMs).length;
  const dueThisWeekTasks = taskDatePairs.filter((task) => {
    if (task.progress >= 100 || !Number.isFinite(task.endMs)) return false;
    const diff = diffDaysFromMs(todayMs, task.endMs);
    return diff >= 0 && diff <= 7;
  }).length;

  const safeUpdatedAt = toSafeTimestamp(updatedAt);
  const staleDays = safeUpdatedAt == null ? null : Math.max(0, diffDaysFromMs(safeUpdatedAt, nowMs()));
  const isStale = normalizedStatus !== SCHEDULE_STATUS_CLOSED && staleDays != null && staleDays >= STALE_PROJECT_DAYS;
  const isDelayed = delayedTasks > 0;
  const isDueToday = dueTodayTasks > 0;
  const isDueThisWeek = dueThisWeekTasks > 0;

  const riskLabels = [];
  if (isDelayed) riskLabels.push('지연');
  if (isDueToday) riskLabels.push('오늘 마감');
  if (!isDueToday && isDueThisWeek) riskLabels.push('이번 주 마감');
  if (isStale) riskLabels.push('오래 미갱신');
  if (normalizedStatus === SCHEDULE_STATUS_HOLDING) riskLabels.push('보류');

  let riskLevel = 'none';
  if (isDelayed || isDueToday) riskLevel = 'high';
  else if (isDueThisWeek || isStale || normalizedStatus === SCHEDULE_STATUS_HOLDING) riskLevel = 'medium';
  else if (activeTasks > 0) riskLevel = 'low';

  const activityLog = normalizeActivityLog(safeData.activityLog);

  return {
    progress: safeTasks.length > 0 ? Math.round(progressTotal / safeTasks.length) : 0,
    startDate: Number.isFinite(projectStartMs) ? normalizeYmdLike(projectStartMs) : '',
    endDate: Number.isFinite(projectEndMs) ? normalizeYmdLike(projectEndMs) : '',
    primaryAssignee: choosePrimaryValue(assigneeCounts, orderedAssignees),
    primaryDepartment: choosePrimaryValue(departmentCounts, orderedDepartments),
    assignees: orderedAssignees,
    departments: orderedDepartments,
    activeTasks,
    completedTasks,
    delayedTasks,
    dueTodayTasks,
    dueThisWeekTasks,
    staleDays,
    isDelayed,
    isDueToday,
    isDueThisWeek,
    isStale,
    riskLevel,
    riskLabels,
    lastActivityAt: activityLog[0]?.at ?? safeUpdatedAt,
  };
};

const scheduleStatusLabel = (value) => {
  switch (normalizeScheduleStatus(value)) {
    case SCHEDULE_STATUS_IN_PROGRESS:
      return 'In progress';
    case SCHEDULE_STATUS_HOLDING:
      return 'Holding';
    case SCHEDULE_STATUS_CLOSED:
      return 'Closed';
    case SCHEDULE_STATUS_PLANNING:
    default:
      return 'Planning';
  }
};

export const buildScheduleActivityEntries = ({
  mode = 'update',
  payload = null,
  existingData = null,
  nextData = null,
  actorEmail = '',
  at = nowMs(),
} = {}) => {
  const safePayload = isPlainObject(payload) ? payload : {};
  const previous = isPlainObject(existingData) ? existingData : {};
  const next = isPlainObject(nextData) ? nextData : {};
  const entries = [];

  if (mode === 'create') {
    entries.push(
      createActivityEntry({
        type: 'create',
        actorEmail,
        at,
        message: '프로젝트가 공개 보드에 등록되었습니다.',
      }),
    );
    return entries;
  }

  const previousStatus = normalizeScheduleStatus(previous.status);
  const nextStatus = normalizeScheduleStatus(next.status);
  if (previousStatus !== nextStatus) {
    entries.push(
      createActivityEntry({
        type: 'status',
        actorEmail,
        at,
        message: `상태 변경: ${scheduleStatusLabel(previousStatus)} -> ${scheduleStatusLabel(nextStatus)}`,
      }),
    );
  }

  const previousHoldingReason = normalizeShortText(previous.holdingReason, { maxLength: MAX_HOLDING_REASON_LENGTH });
  const nextHoldingReason = normalizeShortText(next.holdingReason, { maxLength: MAX_HOLDING_REASON_LENGTH });
  if (previousHoldingReason !== nextHoldingReason) {
    entries.push(
      createActivityEntry({
        type: 'holding_reason',
        actorEmail,
        at,
        message: nextHoldingReason ? 'Holding 사유가 업데이트되었습니다.' : 'Holding 사유가 제거되었습니다.',
      }),
    );
  }

  const previousNextAction = normalizeShortText(previous.nextAction, { maxLength: MAX_NEXT_ACTION_LENGTH });
  const nextNextAction = normalizeShortText(next.nextAction, { maxLength: MAX_NEXT_ACTION_LENGTH });
  if (previousNextAction !== nextNextAction) {
    entries.push(
      createActivityEntry({
        type: 'next_action',
        actorEmail,
        at,
        message: nextNextAction ? '다음 액션이 업데이트되었습니다.' : '다음 액션이 제거되었습니다.',
      }),
    );
  }

  if (String(previous.name || '').trim() !== String(next.name || '').trim()) {
    entries.push(
      createActivityEntry({
        type: 'rename',
        actorEmail,
        at,
        message: '프로젝트 제목이 변경되었습니다.',
      }),
    );
  }

  if (
    Object.prototype.hasOwnProperty.call(safePayload, 'tasks') ||
    Object.prototype.hasOwnProperty.call(safePayload, 'vacations') ||
    Object.prototype.hasOwnProperty.call(safePayload, 'rangePadding') ||
    Object.prototype.hasOwnProperty.call(safePayload, 'fitSettings') ||
    Object.prototype.hasOwnProperty.call(safePayload, 'zoomSettings')
  ) {
    entries.push(
      createActivityEntry({
        type: 'schedule',
        actorEmail,
        at,
        message: '일정 내용이 업데이트되었습니다.',
      }),
    );
  }

  if (entries.length === 0) {
    entries.push(
      createActivityEntry({
        type: 'update',
        actorEmail,
        at,
        message: '프로젝트 정보가 업데이트되었습니다.',
      }),
    );
  }

  return entries;
};
