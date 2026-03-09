import { CollabWorkspaceRoom, getCollabSchemaStatements, handleCollabRequest } from './collab-api.mjs';
import { resolveAllowedOrigin } from './cors-utils.mjs';

const CORS_ALLOW_METHODS = 'GET,POST,PUT,PATCH,DELETE,OPTIONS';
const CORS_ALLOW_HEADERS =
  'Content-Type, X-Upload-Key, X-Folder-Admin-Key, Authorization, CF-Access-Authenticated-User-Email';
const CORS_MAX_AGE = '86400';

const MAX_FOLDER_DEPTH = 4;
const MAX_FOLDER_NAME_LENGTH = 40;
const MAX_JSON_BODY_BYTES = 1024 * 1024;
const MAX_HOLDING_REASON_LENGTH = 280;
const MAX_NEXT_ACTION_LENGTH = 280;
const MAX_ACTIVITY_LOG_ENTRIES = 20;
const STALE_PROJECT_DAYS = 7;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 128;
const PBKDF2_ITERATIONS = 100000;
const PBKDF2_MIN_ITERATIONS = 1000;
const PBKDF2_MAX_ITERATIONS = 100000;
const PBKDF2_KEY_LENGTH_BITS = 256;
const SESSION_COOKIE_NAME_DEFAULT = 'hl_scheduler_session';
const SESSION_COOKIE_PATH = '/';
const DEFAULT_AUTH_RATE_LIMIT_WINDOW_SECONDS = 300;
const DEFAULT_AUTH_RATE_LIMIT_MAX_ATTEMPTS = 10;

const STATUS_PENDING = 'pending';
const STATUS_APPROVED = 'approved';
const STATUS_REJECTED = 'rejected';
const STATUS_DISABLED = 'disabled';
const SCHEDULE_STATUS_PLANNING = 'planning';
const SCHEDULE_STATUS_IN_PROGRESS = 'in_progress';
const SCHEDULE_STATUS_HOLDING = 'holding';
const SCHEDULE_STATUS_CLOSED = 'closed';
const SCHEDULE_STATUS_DEFAULT = SCHEDULE_STATUS_PLANNING;

let runtimeSchemaReadyPromise = null;

const parseBoolean = (value, fallback = false) => {
  if (value == null) return fallback;
  const raw = String(value).trim().toLowerCase();
  if (!raw) return fallback;
  if (raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on') return true;
  if (raw === '0' || raw === 'false' || raw === 'no' || raw === 'off') return false;
  return fallback;
};

const clamp = (n, min, max) => Math.max(min, Math.min(max, n));

const toInt = (value, fallback) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.trunc(n);
};

const isPlainObject = (value) => value != null && typeof value === 'object' && !Array.isArray(value);

const normalizeEmail = (value) => String(value || '').trim().toLowerCase();
const isValidEmail = (value) => EMAIL_PATTERN.test(normalizeEmail(value));

const normalizeEmailList = (value) => {
  const source = Array.isArray(value) ? value : typeof value === 'string' ? value.split(/[\s,;]+/g) : [];
  const unique = new Set();
  const result = [];
  source.forEach((item) => {
    const email = normalizeEmail(item);
    if (!email || unique.has(email)) return;
    unique.add(email);
    result.push(email);
  });
  return result;
};

const parseJsonSafe = (text) => {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};

const readJsonObjectBody = async (request, { maxBytes = MAX_JSON_BODY_BYTES } = {}) => {
  const contentType = String(request.headers.get('content-type') || '').toLowerCase();
  if (!contentType.includes('application/json')) {
    return { ok: false, message: 'Content-Type은 application/json 이어야 합니다.' };
  }

  const text = await request.text();
  if (new TextEncoder().encode(text).length > maxBytes) {
    return { ok: false, message: '요청 본문이 너무 큽니다. (최대 약 1MB)' };
  }

  const payload = parseJsonSafe(text);
  if (payload == null) return { ok: false, message: '잘못된 JSON입니다.' };
  if (!isPlainObject(payload)) return { ok: false, message: '요청 본문은 객체여야 합니다.' };

  return { ok: true, payload };
};

const normalizeFolderId = (value) => {
  if (value == null) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  const lower = raw.toLowerCase();
  if (lower === 'null' || lower === 'uncategorized' || lower === '__uncategorized__') return null;
  return raw;
};

const normalizeFolderName = (value) => String(value || '').trim();
const getSharedScheduleId = (env) => String(env.SHARED_SCHEDULE_ID || '').trim();
const normalizeScheduleStatus = (value) => {
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

const buildCorsContext = (request, env) => {
  const origin = request.headers.get('origin');
  const allowedOrigin = resolveAllowedOrigin(origin, env);
  const headers = new Headers();

  if (origin && !allowedOrigin) {
    return { ok: false, headers };
  }

  if (allowedOrigin) {
    headers.set('Access-Control-Allow-Origin', allowedOrigin);
    if (allowedOrigin !== '*') {
      headers.set('Access-Control-Allow-Credentials', 'true');
      headers.set('Vary', 'Origin');
    }
  }

  return { ok: true, headers };
};

const withCorsHeaders = (response, corsHeaders) => {
  const headers = new Headers(response.headers);
  corsHeaders.forEach((value, key) => {
    headers.set(key, value);
  });
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
};

const jsonResponse = (payload, { status = 200, headers } = {}) => {
  const responseHeaders = new Headers(headers);
  responseHeaders.set('Content-Type', 'application/json; charset=utf-8');
  return new Response(JSON.stringify(payload), { status, headers: responseHeaders });
};

const textResponse = (text, { status = 200, headers } = {}) => {
  const responseHeaders = new Headers(headers);
  responseHeaders.set('Content-Type', 'text/plain; charset=utf-8');
  return new Response(String(text || ''), { status, headers: responseHeaders });
};

const errorResponse = (message, { status = 400, details, headers } = {}) =>
  jsonResponse(
    {
      error: String(message || 'Request failed.'),
      ...(details === undefined ? {} : { details }),
    },
    { status, headers },
  );

const decodePathSegment = (value) => {
  try {
    return decodeURIComponent(String(value || '').trim());
  } catch {
    return '';
  }
};

const nowMs = () => Date.now();

const getRequestUrl = (request) => new URL(request.url);

const buildScheduleUrl = (request, id) => {
  const url = getRequestUrl(request);
  return `${url.origin}/api/schedules/${encodeURIComponent(String(id || '').trim())}`;
};

const parseD1Rows = (result) => (Array.isArray(result?.results) ? result.results : []);

const toSafeTimestamp = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : null;
};

const utf8 = (value) => new TextEncoder().encode(String(value ?? ''));

const bytesToHex = (bytesLike) =>
  Array.from(new Uint8Array(bytesLike))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');

const hexToBytes = (hex) => {
  const normalized = String(hex || '').trim().toLowerCase();
  if (!normalized || normalized.length % 2 !== 0) return null;
  const out = new Uint8Array(normalized.length / 2);
  for (let i = 0; i < out.length; i += 1) {
    const chunk = normalized.slice(i * 2, i * 2 + 2);
    const parsed = Number.parseInt(chunk, 16);
    if (!Number.isFinite(parsed)) return null;
    out[i] = parsed;
  }
  return out;
};

const randomHex = (size = 16) => {
  const bytes = new Uint8Array(Math.max(1, Number(size) || 16));
  crypto.getRandomValues(bytes);
  return bytesToHex(bytes);
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

const normalizeActivityLog = (entries) =>
  (Array.isArray(entries) ? entries : [])
    .map((entry) => normalizeActivityEntry(entry))
    .filter(Boolean)
    .sort((a, b) => Number(b.at || 0) - Number(a.at || 0))
    .slice(0, MAX_ACTIVITY_LOG_ENTRIES);

const createActivityEntry = ({ type = 'update', message = '', actorEmail = '', at = nowMs() } = {}) =>
  normalizeActivityEntry({
    id: randomHex(8),
    type,
    message,
    actorEmail,
    at,
  });

const appendActivityEntries = (existingEntries, newEntries) =>
  normalizeActivityLog([...(Array.isArray(newEntries) ? newEntries : []), ...normalizeActivityLog(existingEntries)]);

const buildScheduleOverview = ({ data = null, updatedAt = null, status = SCHEDULE_STATUS_DEFAULT } = {}) => {
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
  const endCandidatesAll = taskDatePairs
    .map((task) => task.endMs)
    .filter(Number.isFinite);
  const endCandidatesActive = taskDatePairs
    .filter((task) => task.progress < 100)
    .map((task) => task.endMs)
    .filter(Number.isFinite);

  const projectStartMs = startCandidates.length > 0 ? Math.min(...startCandidates) : Number.NaN;
  const projectEndMs = (endCandidatesActive.length > 0 ? Math.max(...endCandidatesActive) : Math.max(...endCandidatesAll)) || Number.NaN;

  const delayedTasks = taskDatePairs.filter((task) => task.progress < 100 && Number.isFinite(task.endMs) && task.endMs < todayMs).length;
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

const buildScheduleActivityEntries = ({
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

const sha256Hex = async (value) => {
  const digest = await crypto.subtle.digest('SHA-256', utf8(value));
  return bytesToHex(digest);
};

const derivePbkdf2Hex = async (value, saltBytes, iterations = PBKDF2_ITERATIONS) => {
  const keyMaterial = await crypto.subtle.importKey('raw', utf8(value), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      hash: 'SHA-256',
      salt: saltBytes,
      iterations,
    },
    keyMaterial,
    PBKDF2_KEY_LENGTH_BITS,
  );
  return bytesToHex(bits);
};

const getPasswordPepper = (env) => String(env.PASSWORD_PEPPER || '').trim();

const hashPassword = async (password, env) => {
  const pepper = getPasswordPepper(env);
  const saltHex = randomHex(16);
  const saltBytes = hexToBytes(saltHex);
  const hashHex = await derivePbkdf2Hex(`${String(password)}${pepper}`, saltBytes, PBKDF2_ITERATIONS);
  return `pbkdf2_sha256$${PBKDF2_ITERATIONS}$${saltHex}$${hashHex}`;
};

const verifyPassword = async (password, encoded, env) => {
  const raw = String(encoded || '').trim();
  const [algorithm, iterationsRaw, saltHex, hashHex] = raw.split('$');
  if (algorithm !== 'pbkdf2_sha256' || !iterationsRaw || !saltHex || !hashHex) {
    return { ok: false, reason: 'invalid_hash' };
  }

  const parsedIterations = Number(iterationsRaw);
  if (!Number.isFinite(parsedIterations) || parsedIterations < PBKDF2_MIN_ITERATIONS) {
    return { ok: false, reason: 'invalid_hash' };
  }
  if (parsedIterations > PBKDF2_MAX_ITERATIONS) {
    return { ok: false, reason: 'iterations_not_supported' };
  }

  const iterations = clamp(Math.trunc(parsedIterations), PBKDF2_MIN_ITERATIONS, PBKDF2_MAX_ITERATIONS);
  const saltBytes = hexToBytes(saltHex);
  if (!saltBytes) return { ok: false, reason: 'invalid_hash' };

  const pepper = getPasswordPepper(env);
  try {
    const derived = await derivePbkdf2Hex(`${String(password)}${pepper}`, saltBytes, iterations);
    return { ok: derived === String(hashHex).toLowerCase(), reason: 'ok' };
  } catch (error) {
    return { ok: false, reason: 'derive_failed', details: String(error?.message || error) };
  }
};

const getSessionTtlHours = (env) => clamp(toInt(env.SESSION_TTL_HOURS, 12), 1, 168);
const getSessionTtlMs = (env) => getSessionTtlHours(env) * 60 * 60 * 1000;
const getSessionCookieName = (env) => String(env.SESSION_COOKIE_NAME || SESSION_COOKIE_NAME_DEFAULT).trim() || SESSION_COOKIE_NAME_DEFAULT;
const getSessionCookieDomain = (env) => String(env.SESSION_COOKIE_DOMAIN || '').trim().replace(/^\.+/, '');
const getSessionCookieSameSite = (env) => {
  const value = String(env.SESSION_COOKIE_SAME_SITE || 'None').trim().toLowerCase();
  if (value === 'lax') return 'Lax';
  if (value === 'strict') return 'Strict';
  return 'None';
};

const buildSessionCookie = (token, env) => {
  const name = getSessionCookieName(env);
  const domain = getSessionCookieDomain(env);
  const ttlSeconds = Math.max(60, Math.floor(getSessionTtlMs(env) / 1000));
  const sameSite = getSessionCookieSameSite(env);
  const parts = [
    `${name}=${encodeURIComponent(String(token || '').trim())}`,
    `Max-Age=${ttlSeconds}`,
    `Path=${SESSION_COOKIE_PATH}`,
    'HttpOnly',
    'Secure',
    `SameSite=${sameSite}`,
  ];
  if (domain) parts.push(`Domain=${domain}`);
  return parts.join('; ');
};

const buildSessionCookieClear = (env) => {
  const name = getSessionCookieName(env);
  const domain = getSessionCookieDomain(env);
  const sameSite = getSessionCookieSameSite(env);
  const parts = [
    `${name}=`,
    'Max-Age=0',
    `Path=${SESSION_COOKIE_PATH}`,
    'HttpOnly',
    'Secure',
    `SameSite=${sameSite}`,
  ];
  if (domain) parts.push(`Domain=${domain}`);
  return parts.join('; ');
};

const parseBearerToken = (request) => {
  const authHeader = String(request.headers.get('authorization') || '').trim();
  const match = /^Bearer\s+(.+)$/i.exec(authHeader);
  if (!match) return '';
  return String(match[1] || '').trim();
};

const parseCookieMap = (request) => {
  const header = String(request.headers.get('cookie') || '').trim();
  if (!header) return new Map();
  const map = new Map();
  header.split(';').forEach((part) => {
    const segment = String(part || '').trim();
    if (!segment) return;
    const idx = segment.indexOf('=');
    if (idx <= 0) return;
    const key = segment.slice(0, idx).trim();
    const value = segment.slice(idx + 1).trim();
    if (!key) return;
    try {
      map.set(key, decodeURIComponent(value));
    } catch {
      map.set(key, value);
    }
  });
  return map;
};

const parseSessionToken = (request, env) => {
  const bearer = parseBearerToken(request);
  if (bearer) return bearer;
  const cookieName = getSessionCookieName(env);
  const cookies = parseCookieMap(request);
  return String(cookies.get(cookieName) || '').trim();
};

const isAdminSurfaceEnabled = (env) =>
  parseBoolean(env.ENABLE_ADMIN_ENDPOINTS, parseBoolean(env.REQUIRE_ACCESS_EMAIL, false));

const isAllowedEmailDomain = (email, env) => {
  const expected = String(env.ALLOWED_FROM_DOMAIN || '').trim().toLowerCase();
  if (!expected) return true;
  return getEmailDomain(email) === expected;
};

const getEmailDomain = (email) => {
  const normalized = normalizeEmail(email);
  const at = normalized.lastIndexOf('@');
  if (at <= 0 || at === normalized.length - 1) return '';
  return normalized.slice(at + 1);
};

const buildUserPermissions = (user) => {
  const status = String(user?.status || '');
  const isApproved = status === STATUS_APPROVED;
  return {
    isApproved,
    canEditSchedules: isApproved,
    canManageFolders: isApproved && !!user?.isAdmin,
    canManageUsers: isApproved && !!user?.isAdmin,
  };
};

const mapUserRow = (row, env) => {
  if (!row) return null;
  const email = normalizeEmail(row.email);
  return {
    id: String(row.id || '').trim(),
    email,
    status: String(row.status || ''),
    requestedAt: toSafeTimestamp(row.requested_at ?? row.requestedAt),
    approvedAt: toSafeTimestamp(row.approved_at ?? row.approvedAt),
    approvedByEmail: normalizeEmail(row.approved_by_email ?? row.approvedByEmail),
    lastLoginAt: toSafeTimestamp(row.last_login_at ?? row.lastLoginAt),
    createdAt: toSafeTimestamp(row.created_at ?? row.createdAt),
    updatedAt: toSafeTimestamp(row.updated_at ?? row.updatedAt),
    isAdmin: normalizeEmailList(env.ALLOWED_ADMIN_EMAILS).includes(email),
  };
};

const mapUserPublic = (user) => ({
  id: user.id,
  email: user.email,
  status: user.status,
  isAdmin: !!user.isAdmin,
  requestedAt: user.requestedAt,
  approvedAt: user.approvedAt,
  approvedByEmail: user.approvedByEmail || null,
  lastLoginAt: user.lastLoginAt,
  createdAt: user.createdAt,
  updatedAt: user.updatedAt,
});

const getUserByEmail = async (env, email) => {
  const row = await env.DB.prepare('SELECT * FROM users WHERE email = ? LIMIT 1').bind(normalizeEmail(email)).first();
  return mapUserRow(row, env);
};

const getUserById = async (env, id) => {
  const row = await env.DB.prepare('SELECT * FROM users WHERE id = ? LIMIT 1').bind(String(id || '').trim()).first();
  return mapUserRow(row, env);
};

const getSessionUser = async (request, env) => {
  const token = parseSessionToken(request, env);
  if (!token) return null;
  const tokenHash = await sha256Hex(token);
  const now = nowMs();

  const row = await env.DB
    .prepare(
      [
        'SELECT u.id, u.email, u.status, u.requested_at, u.approved_at, u.approved_by_email,',
        'u.last_login_at, u.created_at, u.updated_at',
        'FROM auth_sessions s',
        'INNER JOIN users u ON u.id = s.user_id',
        'WHERE s.token_hash = ?',
        'AND s.revoked_at IS NULL',
        'AND s.expires_at > ?',
        'LIMIT 1',
      ].join(' '),
    )
    .bind(tokenHash, now)
    .first();

  return mapUserRow(row, env);
};

const ensureAuthenticatedUser = async (request, env) => {
  const user = await getSessionUser(request, env);
  if (!user) return { error: errorResponse('인증이 필요합니다.', { status: 401 }) };
  if (user.status !== STATUS_APPROVED) {
    return { error: errorResponse('Your account is not approved.', { status: 403 }) };
  }
  return { user };
};

const ensureAdminUser = async (request, env) => {
  const auth = await ensureAuthenticatedUser(request, env);
  if (auth.error) return auth;
  const user = auth.user;
  if (!user.isAdmin) {
    return { error: errorResponse('관리자 권한이 필요합니다.', { status: 403 }) };
  }

  if (parseBoolean(env.REQUIRE_ACCESS_EMAIL, false)) {
    const accessEmail = normalizeEmail(request.headers.get('CF-Access-Authenticated-User-Email'));
    if (!accessEmail || !isValidEmail(accessEmail)) {
      return { error: errorResponse('Cloudflare Access 인증이 필요합니다.', { status: 401 }) };
    }
    if (accessEmail !== user.email) {
      return { error: errorResponse('Access identity does not match the authenticated user.', { status: 403 }) };
    }
  }

  return { user };
};

const revokeSessionsForUser = async (env, userId) => {
  const timestamp = nowMs();
  await env.DB
    .prepare('UPDATE auth_sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL')
    .bind(timestamp, String(userId || '').trim())
    .run();
};

const ensureNotReadOnly = (env) => {
  if (parseBoolean(env.READ_ONLY_MODE, false)) {
    return errorResponse('This API is in read-only mode.', { status: 403 });
  }
  return null;
};

const ensureFolderExists = async (db, folderId) => {
  if (folderId == null) return true;
  const row = await db.prepare('SELECT id FROM folders WHERE id = ?').bind(folderId).first();
  return !!row;
};

const ensureRuntimeSchema = async (env) => {
  if (runtimeSchemaReadyPromise) return runtimeSchemaReadyPromise;

  runtimeSchemaReadyPromise = (async () => {
    await env.DB
      .prepare(
        [
          'CREATE TABLE IF NOT EXISTS schedules (',
          'id TEXT PRIMARY KEY,',
          'name TEXT NOT NULL,',
          'data TEXT NOT NULL,',
          `status TEXT NOT NULL DEFAULT '${SCHEDULE_STATUS_DEFAULT}',`,
          'tasks_count INTEGER NOT NULL DEFAULT 0,',
          'vacations_count INTEGER NOT NULL DEFAULT 0,',
          'folder_id TEXT,',
          'created_by_email TEXT,',
          'updated_by_email TEXT,',
          'created_at INTEGER NOT NULL,',
          'updated_at INTEGER NOT NULL',
          ')',
        ].join(' '),
      )
      .run();

	    const alterStatements = [
	      `ALTER TABLE schedules ADD COLUMN status TEXT NOT NULL DEFAULT '${SCHEDULE_STATUS_DEFAULT}'`,
	      'ALTER TABLE schedules ADD COLUMN folder_id TEXT',
	      'ALTER TABLE schedules ADD COLUMN created_by_email TEXT',
	      'ALTER TABLE schedules ADD COLUMN updated_by_email TEXT',
	    ];

    for (const sql of alterStatements) {
      try {
        await env.DB.prepare(sql).run();
      } catch (error) {
        const message = String(error?.message || '').toLowerCase();
        const isDuplicateColumn = message.includes('duplicate column name');
        if (!isDuplicateColumn) throw error;
      }
    }

    await env.DB
      .prepare(
        [
          'CREATE TABLE IF NOT EXISTS folders (',
          'id TEXT PRIMARY KEY,',
          'name TEXT NOT NULL,',
          'parent_id TEXT,',
          'depth INTEGER NOT NULL,',
          'sort_order INTEGER NOT NULL DEFAULT 0,',
          'created_at INTEGER NOT NULL,',
          'updated_at INTEGER NOT NULL,',
          'UNIQUE(parent_id, name)',
          ')',
        ].join(' '),
      )
      .run();
	    await env.DB.prepare('CREATE INDEX IF NOT EXISTS folders_parent_id ON folders(parent_id)').run();
	    await env.DB.prepare('CREATE INDEX IF NOT EXISTS folders_sort_order ON folders(sort_order)').run();
	    await env.DB.prepare('CREATE INDEX IF NOT EXISTS schedules_folder_id ON schedules(folder_id)').run();
	    await env.DB.prepare('CREATE INDEX IF NOT EXISTS schedules_status_idx ON schedules(status)').run();
	    await env.DB.prepare('CREATE INDEX IF NOT EXISTS schedules_updated_by_email_idx ON schedules(updated_by_email)').run();

    await env.DB
      .prepare(
        [
          'CREATE TABLE IF NOT EXISTS users (',
          'id TEXT PRIMARY KEY,',
          'email TEXT NOT NULL UNIQUE,',
          'password_hash TEXT NOT NULL,',
          'status TEXT NOT NULL,',
          'requested_at INTEGER NOT NULL,',
          'approved_at INTEGER,',
          'approved_by_email TEXT,',
          'last_login_at INTEGER,',
          'created_at INTEGER NOT NULL,',
          'updated_at INTEGER NOT NULL',
          ')',
        ].join(' '),
      )
      .run();
    await env.DB.prepare('CREATE INDEX IF NOT EXISTS users_status_idx ON users(status)').run();
    await env.DB.prepare('CREATE INDEX IF NOT EXISTS users_email_idx ON users(email)').run();

    await env.DB
      .prepare(
        [
          'CREATE TABLE IF NOT EXISTS auth_sessions (',
          'id TEXT PRIMARY KEY,',
          'user_id TEXT NOT NULL,',
          'token_hash TEXT NOT NULL UNIQUE,',
          'expires_at INTEGER NOT NULL,',
          'created_at INTEGER NOT NULL,',
          'revoked_at INTEGER',
          ')',
        ].join(' '),
      )
      .run();
    await env.DB.prepare('CREATE INDEX IF NOT EXISTS auth_sessions_user_id_idx ON auth_sessions(user_id)').run();
    await env.DB.prepare('CREATE INDEX IF NOT EXISTS auth_sessions_expires_at_idx ON auth_sessions(expires_at)').run();

    await env.DB
      .prepare(
        [
          'CREATE TABLE IF NOT EXISTS auth_rate_limits (',
          'key TEXT PRIMARY KEY,',
          'attempt_count INTEGER NOT NULL,',
          'window_started_at INTEGER NOT NULL,',
          'updated_at INTEGER NOT NULL',
          ')',
        ].join(' '),
      )
      .run();
    await env.DB.prepare('CREATE INDEX IF NOT EXISTS auth_rate_limits_updated_idx ON auth_rate_limits(updated_at)').run();

    for (const sql of getCollabSchemaStatements()) {
      await env.DB.prepare(sql).run();
    }
  })().catch((error) => {
    runtimeSchemaReadyPromise = null;
    throw error;
  });

  return runtimeSchemaReadyPromise;
};

const getClientIp = (request) => {
  const cfIp = String(request.headers.get('CF-Connecting-IP') || '').trim();
  if (cfIp) return cfIp;
  const xff = String(request.headers.get('X-Forwarded-For') || '').trim();
  if (!xff) return '';
  const first = xff.split(',')[0];
  return String(first || '').trim();
};

const getAuthRateLimitWindowMs = (env) =>
  clamp(toInt(env.AUTH_RATE_LIMIT_WINDOW_SECONDS, DEFAULT_AUTH_RATE_LIMIT_WINDOW_SECONDS), 30, 3600) * 1000;
const getAuthRateLimitMaxAttempts = (env) =>
  clamp(toInt(env.AUTH_RATE_LIMIT_MAX_ATTEMPTS, DEFAULT_AUTH_RATE_LIMIT_MAX_ATTEMPTS), 3, 100);

const consumeAuthRateLimit = async (request, env, { scope, email = '' } = {}) => {
  const keyScope = String(scope || 'auth').trim().toLowerCase() || 'auth';
  const keyEmail = normalizeEmail(email);
  const ip = getClientIp(request);
  const key = `${keyScope}:${keyEmail || '-'}:${ip || '-'}`;
  const now = nowMs();
  const windowMs = getAuthRateLimitWindowMs(env);
  const maxAttempts = getAuthRateLimitMaxAttempts(env);

  const row = await env.DB
    .prepare('SELECT attempt_count, window_started_at FROM auth_rate_limits WHERE key = ? LIMIT 1')
    .bind(key)
    .first();

  const currentCount = Number(row?.attempt_count || 0);
  const windowStartedAt = Number(row?.window_started_at || 0);
  const withinWindow = Number.isFinite(windowStartedAt) && now - windowStartedAt < windowMs;

  if (!withinWindow) {
    await env.DB
      .prepare(
        [
          'INSERT INTO auth_rate_limits (key, attempt_count, window_started_at, updated_at)',
          'VALUES (?, 1, ?, ?)',
          'ON CONFLICT(key) DO UPDATE SET attempt_count = 1, window_started_at = excluded.window_started_at, updated_at = excluded.updated_at',
        ].join(' '),
      )
      .bind(key, now, now)
      .run();
    return { limited: false, retryAfterSeconds: 0 };
  }

  if (currentCount >= maxAttempts) {
    const remainingMs = Math.max(0, windowMs - (now - windowStartedAt));
    return { limited: true, retryAfterSeconds: Math.max(1, Math.ceil(remainingMs / 1000)) };
  }

  await env.DB
    .prepare('UPDATE auth_rate_limits SET attempt_count = ?, updated_at = ? WHERE key = ?')
    .bind(currentCount + 1, now, key)
    .run();

  // Lightweight cleanup to avoid unbounded growth.
  if (Math.random() < 0.02) {
    const threshold = now - windowMs * 4;
    await env.DB.prepare('DELETE FROM auth_rate_limits WHERE updated_at < ?').bind(threshold).run();
  }

  return { limited: false, retryAfterSeconds: 0 };
};

const clearAuthRateLimit = async (request, env, { scope, email = '' } = {}) => {
  const keyScope = String(scope || 'auth').trim().toLowerCase() || 'auth';
  const keyEmail = normalizeEmail(email);
  const ip = getClientIp(request);
  const key = `${keyScope}:${keyEmail || '-'}:${ip || '-'}`;
  await env.DB.prepare('DELETE FROM auth_rate_limits WHERE key = ?').bind(key).run();
};

const compareFoldersForOrder = (a, b) => {
  const sortGap = (Number(a?.sortOrder) || 0) - (Number(b?.sortOrder) || 0);
  if (sortGap !== 0) return sortGap;
  return String(a?.name || '').localeCompare(String(b?.name || ''), 'ko', { sensitivity: 'base' });
};

const listFoldersFlat = async (db) => {
  const result = await db
    .prepare(
      [
        'SELECT id, name, parent_id, depth, sort_order, created_at, updated_at',
        'FROM folders',
        'ORDER BY sort_order ASC, name COLLATE NOCASE ASC',
      ].join(' '),
    )
    .all();
  return parseD1Rows(result).map((row) => {
    const id = String(row?.id || '').trim();
    return {
      id,
      name: String(row?.name || '').trim() || id,
      parentId: normalizeFolderId(row?.parent_id ?? row?.parentId),
      depth: Math.max(1, Number(row?.depth) || 1),
      sortOrder: Number(row?.sort_order ?? row?.sortOrder) || 0,
      createdAt: toSafeTimestamp(row?.created_at ?? row?.createdAt),
      updatedAt: toSafeTimestamp(row?.updated_at ?? row?.updatedAt),
    };
  });
};

const buildFolderContext = async (db) => {
  const flatFolders = await listFoldersFlat(db);
  const byId = new Map();
  const childrenByParent = new Map();

  flatFolders.forEach((folder) => {
    if (!folder.id) return;
    byId.set(folder.id, folder);
    const key = folder.parentId || '';
    if (!childrenByParent.has(key)) childrenByParent.set(key, []);
    childrenByParent.get(key).push(folder.id);
  });

  childrenByParent.forEach((childIds, key) => {
    childIds.sort((leftId, rightId) => compareFoldersForOrder(byId.get(leftId), byId.get(rightId)));
    childrenByParent.set(key, childIds);
  });

  const pathCache = new Map();
  const resolvePath = (folderId, visited = new Set()) => {
    if (!folderId) return '';
    if (pathCache.has(folderId)) return pathCache.get(folderId);
    if (visited.has(folderId)) return '';

    visited.add(folderId);
    const folder = byId.get(folderId);
    if (!folder) return '';

    const parentPath = folder.parentId ? resolvePath(folder.parentId, visited) : '';
    const path = parentPath ? `${parentPath} / ${folder.name}` : folder.name;
    pathCache.set(folderId, path);
    visited.delete(folderId);
    return path;
  };

  const pathById = new Map();
  flatFolders.forEach((folder) => {
    pathById.set(folder.id, resolvePath(folder.id));
  });

  const folders = [];
  const visitedFolderIds = new Set();
  const appendChildren = (parentId = '') => {
    const childIds = childrenByParent.get(parentId) || [];
    childIds.forEach((childId) => {
      if (!childId || visitedFolderIds.has(childId)) return;
      visitedFolderIds.add(childId);
      const folder = byId.get(childId);
      if (!folder) return;
      folders.push(folder);
      appendChildren(childId);
    });
  };
  appendChildren('');
  flatFolders.forEach((folder) => {
    if (!folder?.id || visitedFolderIds.has(folder.id)) return;
    visitedFolderIds.add(folder.id);
    folders.push(folder);
    appendChildren(folder.id);
  });

  return { folders, byId, childrenByParent, pathById };
};

const listSiblingFolders = async (db, parentId) => {
  const result = await db
    .prepare(
      [
        'SELECT id, name, parent_id, depth, sort_order, created_at, updated_at',
        'FROM folders',
        'WHERE parent_id IS ?',
        'ORDER BY sort_order ASC, name COLLATE NOCASE ASC',
      ].join(' '),
    )
    .bind(parentId)
    .all();

  return parseD1Rows(result)
    .map((row) => {
      const id = String(row?.id || '').trim();
      if (!id) return null;
      return {
        id,
        name: String(row?.name || '').trim() || id,
        parentId: normalizeFolderId(row?.parent_id ?? row?.parentId),
        depth: Math.max(1, Number(row?.depth) || 1),
        sortOrder: Number(row?.sort_order ?? row?.sortOrder) || 0,
        createdAt: toSafeTimestamp(row?.created_at ?? row?.createdAt),
        updatedAt: toSafeTimestamp(row?.updated_at ?? row?.updatedAt),
      };
    })
    .filter(Boolean)
    .sort(compareFoldersForOrder);
};

const resequenceSiblingFolders = async (db, siblings, timestamp) => {
  for (let index = 0; index < siblings.length; index += 1) {
    const folder = siblings[index];
    const nextSortOrder = index + 1;
    await db
      .prepare('UPDATE folders SET sort_order = ?, updated_at = ? WHERE id = ?')
      .bind(nextSortOrder, timestamp, folder.id)
      .run();
  }
};

const collectDescendantFolderIds = (folderId, childrenByParent) => {
  const root = String(folderId || '').trim();
  if (!root) return [];
  const result = [];
  const queue = [root];
  const seen = new Set();

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || seen.has(current)) continue;
    seen.add(current);
    result.push(current);

    const children = childrenByParent.get(current) || [];
    children.forEach((childId) => {
      if (!seen.has(childId)) queue.push(childId);
    });
  }

  return result;
};

const scheduleRowToSummary = (row, pathById) => {
  const folderId = normalizeFolderId(row?.folder_id ?? row?.folderId);
  const status = normalizeScheduleStatus(row?.status);
  const parsedData = parseJsonSafe(String(row?.data || ''));
  const safeData = isPlainObject(parsedData) ? parsedData : {};
  const holdingReason = normalizeShortText(safeData.holdingReason, { maxLength: MAX_HOLDING_REASON_LENGTH });
  const nextAction = normalizeShortText(safeData.nextAction, { maxLength: MAX_NEXT_ACTION_LENGTH });
  const recentActivity = normalizeActivityLog(safeData.activityLog).slice(0, 3);
  const overview = buildScheduleOverview({
    data: safeData,
    updatedAt: row?.updated_at ?? row?.updatedAt,
    status,
  });
  return {
    id: String(row?.id || '').trim(),
    name: String(row?.name || '').trim(),
    status,
    holdingReason,
    nextAction,
    recentActivity,
    overview,
    tasksCount: Number(row?.tasks_count ?? row?.tasksCount ?? 0) || 0,
    vacationsCount: Number(row?.vacations_count ?? row?.vacationsCount ?? 0) || 0,
    folderId,
    folderPath: folderId ? String(pathById.get(folderId) || '') : '',
    createdByEmail: normalizeEmail(row?.created_by_email ?? row?.createdByEmail),
    updatedByEmail: normalizeEmail(row?.updated_by_email ?? row?.updatedByEmail),
    createdAt: toSafeTimestamp(row?.created_at ?? row?.createdAt),
    updatedAt: toSafeTimestamp(row?.updated_at ?? row?.updatedAt),
  };
};

const scheduleRowToDetail = (row, pathById, request) => {
  const folderId = normalizeFolderId(row?.folder_id ?? row?.folderId);
  const parsedData = parseJsonSafe(String(row?.data || ''));
  const rawData = parsedData ?? row?.data ?? null;
  const status = normalizeScheduleStatus(row?.status ?? rawData?.status);
  const holdingReason = normalizeShortText(rawData?.holdingReason, { maxLength: MAX_HOLDING_REASON_LENGTH });
  const nextAction = normalizeShortText(rawData?.nextAction, { maxLength: MAX_NEXT_ACTION_LENGTH });
  const activityLog = normalizeActivityLog(rawData?.activityLog);
  const overview = buildScheduleOverview({
    data: rawData,
    updatedAt: row?.updated_at ?? row?.updatedAt,
    status,
  });
  const data = isPlainObject(rawData)
    ? {
        ...rawData,
        status,
        holdingReason,
        nextAction,
        activityLog,
      }
    : rawData;
  const id = String(row?.id || '').trim();

  return {
    id,
    name: String(row?.name || '').trim(),
    data,
    status,
    holdingReason,
    nextAction,
    activityLog,
    recentActivity: activityLog.slice(0, 5),
    overview,
    tasksCount: Number(row?.tasks_count ?? row?.tasksCount ?? 0) || 0,
    vacationsCount: Number(row?.vacations_count ?? row?.vacationsCount ?? 0) || 0,
    folderId,
    folderPath: folderId ? String(pathById.get(folderId) || '') : '',
    createdByEmail: normalizeEmail(row?.created_by_email ?? row?.createdByEmail),
    updatedByEmail: normalizeEmail(row?.updated_by_email ?? row?.updatedByEmail),
    createdAt: toSafeTimestamp(row?.created_at ?? row?.createdAt),
    updatedAt: toSafeTimestamp(row?.updated_at ?? row?.updatedAt),
    url: buildScheduleUrl(request, id),
  };
};

const parseScheduleWritePayload = (payload, existingData = null) => {
  const safeName = String(payload.name || existingData?.name || '').trim();
  if (!safeName) return { ok: false, message: 'name 값이 필요합니다.' };

  const tasks = Array.isArray(payload.tasks) ? payload.tasks : Array.isArray(existingData?.tasks) ? existingData.tasks : [];
  const vacations = Array.isArray(payload.vacations)
    ? payload.vacations
    : Array.isArray(existingData?.vacations)
      ? existingData.vacations
      : [];

  const nextData = {
    ...(isPlainObject(existingData) ? existingData : {}),
    ...payload,
    name: safeName,
    tasks,
    vacations,
  };

  const folderId = normalizeFolderId(payload.folderId ?? existingData?.folderId ?? null);
  const status = normalizeScheduleStatus(payload.status ?? existingData?.status);
  const holdingReason = normalizeShortText(payload.holdingReason ?? existingData?.holdingReason ?? '', {
    maxLength: MAX_HOLDING_REASON_LENGTH,
  });
  const nextAction = normalizeShortText(payload.nextAction ?? existingData?.nextAction ?? '', {
    maxLength: MAX_NEXT_ACTION_LENGTH,
  });
  const activityLog = normalizeActivityLog(existingData?.activityLog);
  return {
    ok: true,
    name: safeName,
    status,
    holdingReason,
    nextAction,
    tasks,
    vacations,
    folderId,
    data: {
      ...nextData,
      folderId,
      status,
      holdingReason,
      nextAction,
      activityLog,
    },
  };
};

const createAuthSession = async (env, userId) => {
  const token = randomHex(32);
  const tokenHash = await sha256Hex(token);
  const now = nowMs();
  const expiresAt = now + getSessionTtlMs(env);
  const sessionId = crypto.randomUUID();

  const runResult = await env.DB
    .prepare(
      [
        'INSERT INTO auth_sessions (id, user_id, token_hash, expires_at, created_at, revoked_at)',
        'VALUES (?, ?, ?, ?, ?, NULL)',
      ].join(' '),
    )
    .bind(sessionId, String(userId || '').trim(), tokenHash, expiresAt, now)
    .run();

  if (!runResult?.success) throw new Error('인증 세션 생성에 실패했습니다.');
  return { token, expiresAt };
};

const handleRegisterAuth = async (request, env) => {
  const bodyResult = await readJsonObjectBody(request);
  if (!bodyResult.ok) return errorResponse(bodyResult.message, { status: 400 });
  const email = normalizeEmail(bodyResult.payload.email);
  const password = String(bodyResult.payload.password || '');

  const rateLimit = await consumeAuthRateLimit(request, env, { scope: 'register', email });
  if (rateLimit.limited) {
    return errorResponse('회원가입 시도가 너무 많습니다. 잠시 후 다시 시도하세요.', {
      status: 429,
      details: { retryAfterSeconds: rateLimit.retryAfterSeconds },
    });
  }

  if (!email || !isValidEmail(email)) {
    return errorResponse('email은 올바른 이메일 형식으로 입력해야 합니다.', { status: 400 });
  }
  if (!isAllowedEmailDomain(email, env)) {
    return errorResponse(`@${String(env.ALLOWED_FROM_DOMAIN || '').trim()} 계정만 사용할 수 있습니다.`, { status: 400 });
  }
  if (password.length < MIN_PASSWORD_LENGTH || password.length > MAX_PASSWORD_LENGTH) {
    return errorResponse(
      `비밀번호 길이는 ${MIN_PASSWORD_LENGTH}자 이상 ${MAX_PASSWORD_LENGTH}자 이하여야 합니다.`,
      { status: 400 },
    );
  }

  const existing = await getUserByEmail(env, email);
  if (existing) {
    return errorResponse('이미 등록된 이메일입니다.', { status: 409 });
  }

  const isAdmin = normalizeEmailList(env.ALLOWED_ADMIN_EMAILS).includes(email);
  const now = nowMs();
  const id = crypto.randomUUID();
  const passwordHash = await hashPassword(password, env);
  const status = isAdmin ? STATUS_APPROVED : STATUS_PENDING;
  const approvedAt = isAdmin ? now : null;
  const approvedByEmail = isAdmin ? 'system:auto-admin-allowlist' : null;

  const runResult = await env.DB
    .prepare(
      [
        'INSERT INTO users (id, email, password_hash, status, requested_at, approved_at, approved_by_email, last_login_at, created_at, updated_at)',
        'VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)',
      ].join(' '),
    )
    .bind(id, email, passwordHash, status, now, approvedAt, approvedByEmail, now, now)
    .run();

  if (!runResult?.success) {
    return errorResponse('계정 등록에 실패했습니다.', { status: 500 });
  }

  return jsonResponse({
    ok: true,
    user: {
      id,
      email,
      status,
      isAdmin,
      requestedAt: now,
      approvedAt,
      approvedByEmail,
      createdAt: now,
      updatedAt: now,
    },
  });
};

const handleLoginAuth = async (request, env) => {
  const bodyResult = await readJsonObjectBody(request);
  if (!bodyResult.ok) return errorResponse(bodyResult.message, { status: 400 });
  const email = normalizeEmail(bodyResult.payload.email);
  const password = String(bodyResult.payload.password || '');

  const rateLimit = await consumeAuthRateLimit(request, env, { scope: 'login', email });
  if (rateLimit.limited) {
    return errorResponse('로그인 시도가 너무 많습니다. 잠시 후 다시 시도하세요.', {
      status: 429,
      details: { retryAfterSeconds: rateLimit.retryAfterSeconds },
    });
  }

  if (!email || !isValidEmail(email)) {
    return errorResponse('email은 올바른 이메일 형식으로 입력해야 합니다.', { status: 400 });
  }
  if (!password) {
    return errorResponse('비밀번호를 입력하세요.', { status: 400 });
  }

  const rawUser = await env.DB.prepare('SELECT * FROM users WHERE email = ? LIMIT 1').bind(email).first();
  if (!rawUser) return errorResponse('이메일 또는 비밀번호가 올바르지 않습니다.', { status: 401 });

  const verifyResult = await verifyPassword(password, rawUser.password_hash, env);
  if (!verifyResult.ok) {
    if (verifyResult.reason === 'iterations_not_supported') {
      return errorResponse('이 계정의 비밀번호는 관리자 초기화 후 다시 로그인해야 합니다.', {
        status: 403,
        details: { code: 'password_reset_required' },
      });
    }
    if (verifyResult.reason === 'derive_failed') {
      return errorResponse('비밀번호 확인에 실패했습니다. 관리자에게 비밀번호 초기화를 요청하세요.', {
        status: 403,
        details: { code: 'password_verify_failed' },
      });
    }
    return errorResponse('이메일 또는 비밀번호가 올바르지 않습니다.', { status: 401 });
  }

  const user = mapUserRow(rawUser, env);
  if (user.status !== STATUS_APPROVED) {
    return errorResponse('계정 승인 대기 중입니다.', { status: 403, details: { status: user.status } });
  }

  const session = await createAuthSession(env, user.id);
  const now = nowMs();
  await env.DB.prepare('UPDATE users SET last_login_at = ?, updated_at = ? WHERE id = ?').bind(now, now, user.id).run();
  const latestUser = await getUserById(env, user.id);
  await clearAuthRateLimit(request, env, { scope: 'login', email });

  return jsonResponse({
    token: session.token,
    expiresAt: session.expiresAt,
    user: mapUserPublic(latestUser),
    permissions: buildUserPermissions(latestUser),
  }, {
    headers: {
      'Set-Cookie': buildSessionCookie(session.token, env),
    },
  });
};

const handleAuthMe = async (request, env) => {
  const user = await getSessionUser(request, env);
  if (!user || user.status !== STATUS_APPROVED) {
    return jsonResponse({ authenticated: false, user: null, permissions: buildUserPermissions(null) });
  }

  return jsonResponse({
    authenticated: true,
    user: mapUserPublic(user),
    permissions: buildUserPermissions(user),
  });
};

const handleAuthLogout = async (request, env) => {
  const token = parseSessionToken(request, env);
  if (token) {
    const tokenHash = await sha256Hex(token);
    const now = nowMs();

    await env.DB
      .prepare('UPDATE auth_sessions SET revoked_at = ? WHERE token_hash = ? AND revoked_at IS NULL')
      .bind(now, tokenHash)
      .run();
  }

  return jsonResponse({ ok: true }, { headers: { 'Set-Cookie': buildSessionCookieClear(env) } });
};

const handleAdminListUsers = async (request, env) => {
  if (!isAdminSurfaceEnabled(env)) return errorResponse('Not found.', { status: 404 });
  const auth = await ensureAdminUser(request, env);
  if (auth.error) return auth.error;

  const url = getRequestUrl(request);
  const statusFilter = String(url.searchParams.get('status') || '').trim().toLowerCase();
  const query = String(url.searchParams.get('q') || '').trim().toLowerCase();
  const limit = clamp(toInt(url.searchParams.get('limit'), 100), 1, 200);
  const offset = Math.max(0, toInt(url.searchParams.get('offset'), 0));

  const where = [];
  const binds = [];
  if ([STATUS_PENDING, STATUS_APPROVED, STATUS_REJECTED, STATUS_DISABLED].includes(statusFilter)) {
    where.push('status = ?');
    binds.push(statusFilter);
  }
  if (query) {
    where.push('email LIKE ?');
    binds.push(`%${query}%`);
  }

  const sql = [
    'SELECT id, email, status, requested_at, approved_at, approved_by_email, last_login_at, created_at, updated_at',
    'FROM users',
    ...(where.length > 0 ? [`WHERE ${where.join(' AND ')}`] : []),
    'ORDER BY requested_at DESC, created_at DESC',
    'LIMIT ? OFFSET ?',
  ].join(' ');

  const result = await env.DB.prepare(sql).bind(...binds, limit, offset).all();
  const users = parseD1Rows(result).map((row) => mapUserPublic(mapUserRow(row, env)));
  return jsonResponse({ users });
};

const updateUserStatus = async (request, env, userId, nextStatus) => {
  if (!isAdminSurfaceEnabled(env)) return errorResponse('Not found.', { status: 404 });
  const auth = await ensureAdminUser(request, env);
  if (auth.error) return auth.error;

  const actor = auth.user;
  const user = await getUserById(env, userId);
  if (!user) return errorResponse('User not found.', { status: 404 });

  const now = nowMs();
  const approvedAt = nextStatus === STATUS_APPROVED ? now : null;
  const approvedByEmail = nextStatus === STATUS_APPROVED ? actor.email : null;

  const runResult = await env.DB
    .prepare('UPDATE users SET status = ?, approved_at = ?, approved_by_email = ?, updated_at = ? WHERE id = ?')
    .bind(nextStatus, approvedAt, approvedByEmail, now, user.id)
    .run();
  if (!runResult?.success) return errorResponse('Failed to update user status.', { status: 500 });

  if (nextStatus !== STATUS_APPROVED) {
    await revokeSessionsForUser(env, user.id);
  }

  const updated = await getUserById(env, user.id);
  return jsonResponse({ ok: true, user: mapUserPublic(updated) });
};

const handleAdminApproveUser = async (request, env, userId) => updateUserStatus(request, env, userId, STATUS_APPROVED);
const handleAdminRejectUser = async (request, env, userId) => updateUserStatus(request, env, userId, STATUS_REJECTED);

const handleAdminResetPassword = async (request, env, userId) => {
  if (!isAdminSurfaceEnabled(env)) return errorResponse('Not found.', { status: 404 });
  const auth = await ensureAdminUser(request, env);
  if (auth.error) return auth.error;

  const user = await getUserById(env, userId);
  if (!user) return errorResponse('User not found.', { status: 404 });

  const bodyResult = await readJsonObjectBody(request);
  if (!bodyResult.ok) return errorResponse(bodyResult.message, { status: 400 });
  const temporaryPassword = String(bodyResult.payload.temporaryPassword || '');
  if (temporaryPassword.length < MIN_PASSWORD_LENGTH || temporaryPassword.length > MAX_PASSWORD_LENGTH) {
    return errorResponse(
      `temporaryPassword length must be between ${MIN_PASSWORD_LENGTH} and ${MAX_PASSWORD_LENGTH} characters.`,
      { status: 400 },
    );
  }

  const now = nowMs();
  const passwordHash = await hashPassword(temporaryPassword, env);
  const runResult = await env.DB
    .prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?')
    .bind(passwordHash, now, user.id)
    .run();
  if (!runResult?.success) return errorResponse('Failed to reset password.', { status: 500 });

  await revokeSessionsForUser(env, user.id);
  return jsonResponse({ ok: true, user: mapUserPublic(await getUserById(env, user.id)) });
};

const handleListSchedules = async (request, env) => {
  const { DB } = env;
  const url = getRequestUrl(request);
  const sharedScheduleId = getSharedScheduleId(env);
  const folderContext = await buildFolderContext(DB);

  if (sharedScheduleId) {
	    const row = await DB
	      .prepare(
	        [
	          'SELECT id, name, data, status, tasks_count, vacations_count, folder_id, created_by_email, updated_by_email, created_at, updated_at',
	          'FROM schedules',
	          'WHERE id = ?',
	          'LIMIT 1',
        ].join(' '),
      )
      .bind(sharedScheduleId)
      .first();

    const offset = Math.max(0, toInt(url.searchParams.get('offset'), 0));
    if (offset > 0 || !row) return jsonResponse([]);
    return jsonResponse([scheduleRowToSummary(row, folderContext.pathById)]);
  }

  const query = String(url.searchParams.get('q') || '').trim();
  const limit = clamp(toInt(url.searchParams.get('limit'), 40), 1, 200);
  const offset = Math.max(0, toInt(url.searchParams.get('offset'), 0));
  const requestedFolderId = normalizeFolderId(url.searchParams.get('folderId'));
  const includeDescendants = parseBoolean(url.searchParams.get('includeDescendants'), true);

  const whereParts = [];
  const bindings = [];

  if (query) {
    whereParts.push('name LIKE ?');
    bindings.push(`%${query}%`);
  }

  if (url.searchParams.has('folderId')) {
    if (requestedFolderId == null) {
      whereParts.push('folder_id IS NULL');
    } else if (includeDescendants) {
      const ids = collectDescendantFolderIds(requestedFolderId, folderContext.childrenByParent);
      if (ids.length > 0) {
        whereParts.push(`folder_id IN (${ids.map(() => '?').join(',')})`);
        bindings.push(...ids);
      } else {
        whereParts.push('1 = 0');
      }
    } else {
      whereParts.push('folder_id = ?');
      bindings.push(requestedFolderId);
    }
  }

	  const sqlParts = [
	    'SELECT id, name, data, status, tasks_count, vacations_count, folder_id, created_by_email, updated_by_email, created_at, updated_at',
	    'FROM schedules',
	  ];
  if (whereParts.length > 0) {
    sqlParts.push(`WHERE ${whereParts.join(' AND ')}`);
  }
  sqlParts.push('ORDER BY updated_at DESC, created_at DESC');
  sqlParts.push('LIMIT ? OFFSET ?');
  bindings.push(limit, offset);

  const result = await DB.prepare(sqlParts.join(' ')).bind(...bindings).all();
  const rows = parseD1Rows(result);

  return jsonResponse(rows.map((row) => scheduleRowToSummary(row, folderContext.pathById)));
};

const handleGetSchedule = async (request, env, id) => {
  const sharedScheduleId = getSharedScheduleId(env);
  if (sharedScheduleId && id !== sharedScheduleId) {
    return errorResponse('Schedule not found.', { status: 404 });
  }

	  const row = await env.DB
	    .prepare(
	      [
	        'SELECT id, name, data, status, tasks_count, vacations_count, folder_id, created_by_email, updated_by_email, created_at, updated_at',
	        'FROM schedules',
	        'WHERE id = ?',
	        'LIMIT 1',
      ].join(' '),
    )
    .bind(id)
    .first();

  if (!row) return errorResponse('Schedule not found.', { status: 404 });

  const folderContext = await buildFolderContext(env.DB);
  return jsonResponse(scheduleRowToDetail(row, folderContext.pathById, request));
};

const handleCreateSchedule = async (request, env) => {
  const readOnlyError = ensureNotReadOnly(env);
  if (readOnlyError) return readOnlyError;

  const auth = await ensureAuthenticatedUser(request, env);
  if (auth.error) return auth.error;
  const actor = auth.user;

  const sharedScheduleId = getSharedScheduleId(env);
  if (sharedScheduleId) {
    return errorResponse('POST /api/schedules is disabled in shared-source mode.', { status: 403 });
  }

  const bodyResult = await readJsonObjectBody(request);
  if (!bodyResult.ok) return errorResponse(bodyResult.message, { status: 400 });
  const payload = bodyResult.payload;

  const parsed = parseScheduleWritePayload(payload, null);
  if (!parsed.ok) return errorResponse(parsed.message, { status: 400 });

  if (parsed.folderId != null) {
    const folderExists = await ensureFolderExists(env.DB, parsed.folderId);
    if (!folderExists) return errorResponse('folderId does not exist.', { status: 400 });
  }

  const createdByEmail = actor.email;
  const updatedByEmail = actor.email;

	  const id = crypto.randomUUID();
	  const timestamp = nowMs();
	  parsed.data.createdByEmail = createdByEmail;
	  parsed.data.updatedByEmail = updatedByEmail;
	  parsed.data.createdAt = timestamp;
	  parsed.data.updatedAt = timestamp;
	  parsed.data.activityLog = appendActivityEntries(
	    parsed.data.activityLog,
	    buildScheduleActivityEntries({
	      mode: 'create',
	      nextData: parsed.data,
	      actorEmail: actor.email,
	      at: timestamp,
	    }),
	  );

		  const runResult = await env.DB
	    .prepare(
	      [
	        'INSERT INTO schedules (id, name, data, status, tasks_count, vacations_count, folder_id, created_by_email, updated_by_email, created_at, updated_at)',
	        'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
	      ].join(' '),
	    )
	    .bind(
	      id,
	      parsed.name,
	      JSON.stringify(parsed.data),
	      parsed.status,
	      parsed.tasks.length,
	      parsed.vacations.length,
	      parsed.folderId,
      createdByEmail,
      updatedByEmail,
      timestamp,
      timestamp,
    )
    .run();

  if (!runResult?.success) {
    return errorResponse('Failed to create schedule.', { status: 500 });
  }

	  const folderContext = await buildFolderContext(env.DB);
	  const overview = buildScheduleOverview({ data: parsed.data, updatedAt: timestamp, status: parsed.status });
	  const recentActivity = normalizeActivityLog(parsed.data.activityLog).slice(0, 3);
	  return jsonResponse(
	    {
	      id,
	      name: parsed.name,
	      url: buildScheduleUrl(request, id),
	      createdAt: timestamp,
	      updatedAt: timestamp,
		      tasksCount: parsed.tasks.length,
		      vacationsCount: parsed.vacations.length,
		      status: parsed.status,
		      holdingReason: parsed.holdingReason,
		      nextAction: parsed.nextAction,
		      recentActivity,
		      overview,
		      folderId: parsed.folderId,
		      folderPath: parsed.folderId ? String(folderContext.pathById.get(parsed.folderId) || '') : '',
		      createdByEmail,
      updatedByEmail,
    },
    { status: 201 },
  );
};

const handleUpdateSchedule = async (request, env, id) => {
  const readOnlyError = ensureNotReadOnly(env);
  if (readOnlyError) return readOnlyError;

  const auth = await ensureAuthenticatedUser(request, env);
  if (auth.error) return auth.error;
  const actor = auth.user;

  const sharedScheduleId = getSharedScheduleId(env);
  if (sharedScheduleId && id !== sharedScheduleId) {
    return errorResponse(`Only schedule '${sharedScheduleId}' can be updated in shared mode.`, { status: 403 });
  }

  const bodyResult = await readJsonObjectBody(request);
  if (!bodyResult.ok) return errorResponse(bodyResult.message, { status: 400 });
  const payload = bodyResult.payload;

	  const existingRow = await env.DB
	    .prepare(
	      [
	        'SELECT id, name, data, status, tasks_count, vacations_count, folder_id, created_by_email, updated_by_email, created_at, updated_at',
	        'FROM schedules',
	        'WHERE id = ?',
	        'LIMIT 1',
      ].join(' '),
    )
    .bind(id)
    .first();

  if (!existingRow) return errorResponse('Schedule not found.', { status: 404 });

	  const existingData = parseJsonSafe(String(existingRow?.data || ''));
	  const existingScheduleData = isPlainObject(existingData)
	    ? {
	        ...existingData,
	        status: normalizeScheduleStatus(existingRow?.status ?? existingData?.status),
	      }
	    : null;
	  const parsed = parseScheduleWritePayload(payload, existingScheduleData);
  if (!parsed.ok) return errorResponse(parsed.message, { status: 400 });

  if (parsed.folderId != null) {
    const folderExists = await ensureFolderExists(env.DB, parsed.folderId);
    if (!folderExists) return errorResponse('folderId does not exist.', { status: 400 });
  }

  const updatedByEmail = actor.email;

  const expectedUnmodifiedAt = toSafeTimestamp(payload.ifUnmodifiedAt);
  const previousUpdatedAt = toSafeTimestamp(existingRow.updated_at ?? existingRow.updatedAt);
  if (expectedUnmodifiedAt != null && previousUpdatedAt != null && expectedUnmodifiedAt !== previousUpdatedAt) {
    return errorResponse('Schedule was modified by another user. Reload and retry.', { status: 409 });
  }

	  const timestamp = nowMs();
	  const createdByEmail = normalizeEmail(existingRow.created_by_email ?? existingRow.createdByEmail) || actor.email;
	  parsed.data.createdByEmail = createdByEmail;
	  parsed.data.updatedByEmail = updatedByEmail;
	  parsed.data.updatedAt = timestamp;
	  parsed.data.activityLog = appendActivityEntries(
	    existingScheduleData?.activityLog,
	    buildScheduleActivityEntries({
	      mode: 'update',
	      payload,
	      existingData: existingScheduleData,
	      nextData: parsed.data,
	      actorEmail: actor.email,
	      at: timestamp,
	    }),
	  );

		  const runResult = await env.DB
	    .prepare(
	      [
	        'UPDATE schedules',
	        'SET name = ?, data = ?, status = ?, tasks_count = ?, vacations_count = ?, folder_id = ?, created_by_email = ?, updated_by_email = ?, updated_at = ?',
	        'WHERE id = ?',
	      ].join(' '),
	    )
	    .bind(
	      parsed.name,
	      JSON.stringify(parsed.data),
	      parsed.status,
	      parsed.tasks.length,
	      parsed.vacations.length,
	      parsed.folderId,
      createdByEmail,
      updatedByEmail,
      timestamp,
      id,
    )
    .run();

	  if (!runResult?.success) {
	    return errorResponse('Failed to update schedule.', { status: 500 });
	  }

	  const folderContext = await buildFolderContext(env.DB);
	  const overview = buildScheduleOverview({ data: parsed.data, updatedAt: timestamp, status: parsed.status });
	  const recentActivity = normalizeActivityLog(parsed.data.activityLog).slice(0, 3);
	  return jsonResponse({
	    id,
	    name: parsed.name,
		    url: buildScheduleUrl(request, id),
		    updatedAt: timestamp,
		    status: parsed.status,
		    holdingReason: parsed.holdingReason,
		    nextAction: parsed.nextAction,
		    recentActivity,
		    overview,
		    tasksCount: parsed.tasks.length,
		    vacationsCount: parsed.vacations.length,
    folderId: parsed.folderId,
    folderPath: parsed.folderId ? String(folderContext.pathById.get(parsed.folderId) || '') : '',
    createdByEmail,
    updatedByEmail,
  });
};

const handleDeleteSchedule = async (request, env, id) => {
  if (!isAdminSurfaceEnabled(env)) return errorResponse('Not found.', { status: 404 });
  const readOnlyError = ensureNotReadOnly(env);
  if (readOnlyError) return readOnlyError;

  const auth = await ensureAdminUser(request, env);
  if (auth.error) return auth.error;

  const sharedScheduleId = getSharedScheduleId(env);
  if (sharedScheduleId) {
    return errorResponse('Schedule deletion is disabled in shared-source mode.', { status: 403 });
  }

  const schedule = await env.DB
    .prepare('SELECT id, name, folder_id FROM schedules WHERE id = ? LIMIT 1')
    .bind(id)
    .first();
  if (!schedule) return errorResponse('Schedule not found.', { status: 404 });

  const runResult = await env.DB.prepare('DELETE FROM schedules WHERE id = ?').bind(id).run();
  if (!runResult?.success) return errorResponse('Failed to delete schedule.', { status: 500 });

  return jsonResponse({
    ok: true,
    id,
    name: String(schedule?.name || '').trim(),
    folderId: normalizeFolderId(schedule?.folder_id ?? schedule?.folderId),
  });
};

const handlePatchScheduleFolder = async (request, env, id) => {
  if (!isAdminSurfaceEnabled(env)) return errorResponse('Not found.', { status: 404 });
  const readOnlyError = ensureNotReadOnly(env);
  if (readOnlyError) return readOnlyError;

  const auth = await ensureAdminUser(request, env);
  if (auth.error) return auth.error;

  const sharedScheduleId = getSharedScheduleId(env);
  if (sharedScheduleId && id !== sharedScheduleId) {
    return errorResponse(`Only schedule '${sharedScheduleId}' can move folders in shared mode.`, { status: 403 });
  }

  const bodyResult = await readJsonObjectBody(request);
  if (!bodyResult.ok) return errorResponse(bodyResult.message, { status: 400 });

  const folderId = normalizeFolderId(bodyResult.payload.folderId);

	  const schedule = await env.DB
	    .prepare('SELECT id, data, status, folder_id, updated_by_email FROM schedules WHERE id = ? LIMIT 1')
	    .bind(id)
	    .first();
	  if (!schedule) return errorResponse('Schedule not found.', { status: 404 });

  if (folderId != null) {
    const folderExists = await ensureFolderExists(env.DB, folderId);
    if (!folderExists) return errorResponse('folderId does not exist.', { status: 400 });
  }

	  const timestamp = nowMs();
	  const actorEmail = normalizeEmail(auth.user?.email);
	  const existingData = parseJsonSafe(String(schedule?.data || ''));
	  const nextData = isPlainObject(existingData)
	    ? {
	        ...existingData,
	        folderId,
	        updatedByEmail: actorEmail || normalizeEmail(schedule?.updated_by_email ?? schedule?.updatedByEmail),
	        updatedAt: timestamp,
	      }
	    : {
	        folderId,
	        status: normalizeScheduleStatus(schedule?.status),
	        updatedByEmail: actorEmail,
	        updatedAt: timestamp,
	        activityLog: [],
	      };
	  const folderContextBefore = await buildFolderContext(env.DB);
	  const previousFolderId = normalizeFolderId(schedule?.folder_id ?? schedule?.folderId);
	  const previousFolderPath = previousFolderId ? String(folderContextBefore.pathById.get(previousFolderId) || '') : '미분류';
	  const nextFolderPath = folderId ? String(folderContextBefore.pathById.get(folderId) || '') : '미분류';
	  nextData.activityLog = appendActivityEntries(
	    nextData.activityLog,
	    [
	      createActivityEntry({
	        type: 'folder',
	        actorEmail,
	        at: timestamp,
	        message: `폴더 이동: ${previousFolderPath || '미분류'} -> ${nextFolderPath || '미분류'}`,
	      }),
	    ],
	  );
	  const runResult = await env.DB
	    .prepare('UPDATE schedules SET data = ?, folder_id = ?, updated_by_email = ?, updated_at = ? WHERE id = ?')
	    .bind(JSON.stringify(nextData), folderId, actorEmail, timestamp, id)
	    .run();

  if (!runResult?.success) return errorResponse('Failed to update schedule folder.', { status: 500 });

	  const folderContext = await buildFolderContext(env.DB);
	  const overview = buildScheduleOverview({ data: nextData, updatedAt: timestamp, status: schedule?.status });
	  return jsonResponse({
	    id,
	    folderId,
	    folderPath: folderId ? String(folderContext.pathById.get(folderId) || '') : '',
	    updatedAt: timestamp,
	    updatedByEmail: actorEmail,
	    recentActivity: normalizeActivityLog(nextData.activityLog).slice(0, 3),
	    overview,
	  });
	};

const handlePatchFolderOrder = async (request, env, folderId) => {
  if (!isAdminSurfaceEnabled(env)) return errorResponse('Not found.', { status: 404 });
  const readOnlyError = ensureNotReadOnly(env);
  if (readOnlyError) return readOnlyError;

  const auth = await ensureAdminUser(request, env);
  if (auth.error) return auth.error;

  const bodyResult = await readJsonObjectBody(request);
  if (!bodyResult.ok) return errorResponse(bodyResult.message, { status: 400 });

  const direction = String(bodyResult.payload.direction || '').trim().toLowerCase();
  if (direction !== 'up' && direction !== 'down') {
    return errorResponse("direction must be 'up' or 'down'.", { status: 400 });
  }

  const currentFolder = await env.DB
    .prepare('SELECT id, name, parent_id, sort_order FROM folders WHERE id = ? LIMIT 1')
    .bind(folderId)
    .first();
  if (!currentFolder) return errorResponse('Folder not found.', { status: 404 });

  const parentId = normalizeFolderId(currentFolder?.parent_id ?? currentFolder?.parentId);
  const siblings = await listSiblingFolders(env.DB, parentId);
  const currentIndex = siblings.findIndex((folder) => folder.id === folderId);
  if (currentIndex < 0) return errorResponse('Folder not found.', { status: 404 });

  const targetIndex = currentIndex + (direction === 'up' ? -1 : 1);
  if (targetIndex < 0 || targetIndex >= siblings.length) {
    const folderContext = await buildFolderContext(env.DB);
    return jsonResponse({
      ok: true,
      moved: false,
      id: folderId,
      parentId,
      sortOrder: Number(siblings[currentIndex]?.sortOrder) || currentIndex + 1,
      path: String(folderContext.pathById.get(folderId) || currentFolder?.name || folderId),
    });
  }

  const reordered = [...siblings];
  const [movedFolder] = reordered.splice(currentIndex, 1);
  reordered.splice(targetIndex, 0, movedFolder);

  const timestamp = nowMs();
  reordered.forEach((folder, index) => {
    folder.sortOrder = index + 1;
  });
  await resequenceSiblingFolders(env.DB, reordered, timestamp);

  const folderContext = await buildFolderContext(env.DB);
  return jsonResponse({
    ok: true,
    moved: true,
    id: folderId,
    parentId,
    sortOrder: targetIndex + 1,
    path: String(folderContext.pathById.get(folderId) || currentFolder?.name || folderId),
    updatedAt: timestamp,
  });
};

const handleListFoldersTree = async (env) => {
  const { DB } = env;
  const folderContext = await buildFolderContext(DB);

  const countsResult = await DB.prepare('SELECT folder_id, COUNT(*) AS count FROM schedules GROUP BY folder_id').all();
  const directCountById = new Map();
  parseD1Rows(countsResult).forEach((row) => {
    const folderId = normalizeFolderId(row?.folder_id ?? row?.folderId);
    if (folderId == null) return;
    directCountById.set(folderId, Number(row?.count || 0) || 0);
  });

  const aggregateCache = new Map();
  const aggregateCount = (folderId) => {
    if (aggregateCache.has(folderId)) return aggregateCache.get(folderId);
    let count = Number(directCountById.get(folderId) || 0);
    const children = folderContext.childrenByParent.get(folderId) || [];
    children.forEach((childId) => {
      count += aggregateCount(childId);
    });
    aggregateCache.set(folderId, count);
    return count;
  };

  const rows = folderContext.folders.map((folder) => ({
    id: folder.id,
    name: folder.name,
    parentId: folder.parentId,
    depth: folder.depth,
    sortOrder: folder.sortOrder,
    path: String(folderContext.pathById.get(folder.id) || folder.name),
    projectCount: aggregateCount(folder.id),
    createdAt: folder.createdAt,
    updatedAt: folder.updatedAt,
  }));

  return jsonResponse(rows);
};

const handleCreateFolder = async (request, env) => {
  if (!isAdminSurfaceEnabled(env)) return errorResponse('Not found.', { status: 404 });
  const readOnlyError = ensureNotReadOnly(env);
  if (readOnlyError) return readOnlyError;

  const auth = await ensureAdminUser(request, env);
  if (auth.error) return auth.error;

  const bodyResult = await readJsonObjectBody(request);
  if (!bodyResult.ok) return errorResponse(bodyResult.message, { status: 400 });
  const payload = bodyResult.payload;

  const name = normalizeFolderName(payload.name);
  if (!name) return errorResponse('name is required.', { status: 400 });
  if (name.length > MAX_FOLDER_NAME_LENGTH) {
    return errorResponse(`Folder name is too long (max ${MAX_FOLDER_NAME_LENGTH}).`, { status: 400 });
  }

  const parentId = normalizeFolderId(payload.parentId);
  let depth = 1;
  if (parentId) {
    const parentRow = await env.DB
      .prepare('SELECT id, depth FROM folders WHERE id = ? LIMIT 1')
      .bind(parentId)
      .first();
    if (!parentRow) return errorResponse('parentId does not exist.', { status: 400 });
    depth = Math.max(1, Number(parentRow.depth) || 1) + 1;
  }

  if (depth > MAX_FOLDER_DEPTH) {
    return errorResponse(`Folder depth limit exceeded (max ${MAX_FOLDER_DEPTH}).`, { status: 400 });
  }

  const nextSortResult = await env.DB
    .prepare('SELECT COALESCE(MAX(sort_order), 0) AS max_sort_order FROM folders WHERE parent_id IS ?')
    .bind(parentId)
    .first();

  const nextSortOrder = Number(nextSortResult?.max_sort_order ?? nextSortResult?.maxSortOrder ?? 0) + 1;
  const timestamp = nowMs();
  const id = crypto.randomUUID();

  try {
    const runResult = await env.DB
      .prepare(
        [
          'INSERT INTO folders (id, name, parent_id, depth, sort_order, created_at, updated_at)',
          'VALUES (?, ?, ?, ?, ?, ?, ?)',
        ].join(' '),
      )
      .bind(id, name, parentId, depth, nextSortOrder, timestamp, timestamp)
      .run();

    if (!runResult?.success) return errorResponse('Failed to create folder.', { status: 500 });
  } catch (error) {
    const message = String(error?.message || '');
    if (message.toLowerCase().includes('unique')) {
      return errorResponse('Folder name already exists under the same parent.', { status: 409 });
    }
    return errorResponse('Failed to create folder.', { status: 500, details: message });
  }

  const folderContext = await buildFolderContext(env.DB);
  return jsonResponse(
    {
      id,
      name,
      parentId,
      depth,
      sortOrder: nextSortOrder,
      path: String(folderContext.pathById.get(id) || name),
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    { status: 201 },
  );
};

const handleDeleteFolder = async (request, env, folderId) => {
  if (!isAdminSurfaceEnabled(env)) return errorResponse('Not found.', { status: 404 });
  const readOnlyError = ensureNotReadOnly(env);
  if (readOnlyError) return readOnlyError;

  const auth = await ensureAdminUser(request, env);
  if (auth.error) return auth.error;

  const folder = await env.DB
    .prepare('SELECT id, name, parent_id, depth FROM folders WHERE id = ? LIMIT 1')
    .bind(folderId)
    .first();
  if (!folder) return errorResponse('Folder not found.', { status: 404 });

  const child = await env.DB.prepare('SELECT id FROM folders WHERE parent_id = ? LIMIT 1').bind(folderId).first();
  if (child) {
    return errorResponse('Folder has child folders. Delete children first.', { status: 409 });
  }

  const schedule = await env.DB.prepare('SELECT id FROM schedules WHERE folder_id = ? LIMIT 1').bind(folderId).first();
  if (schedule) {
    return errorResponse('Folder is not empty. Move schedules first.', { status: 409 });
  }

  const runResult = await env.DB.prepare('DELETE FROM folders WHERE id = ?').bind(folderId).run();
  if (!runResult?.success) return errorResponse('Failed to delete folder.', { status: 500 });

  return jsonResponse({ ok: true, id: folderId });
};

const handleRequest = async (request, env) => {
  const url = getRequestUrl(request);
  const method = String(request.method || 'GET').toUpperCase();
  const pathname = url.pathname.replace(/\/+$/, '') || '/';
  const adminSurfaceEnabled = isAdminSurfaceEnabled(env);

  if (method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Methods': CORS_ALLOW_METHODS,
        'Access-Control-Allow-Headers': CORS_ALLOW_HEADERS,
        'Access-Control-Max-Age': CORS_MAX_AGE,
      },
    });
  }

  if (method === 'GET' && pathname === '/healthz') {
    return jsonResponse({ ok: true });
  }

  if (method === 'GET' && pathname === '/') {
    return textResponse('HL Scheduler public schedules worker');
  }

  if (pathname.startsWith('/api/v2/')) {
    return handleCollabRequest({
      request,
      env,
      url,
      method,
      pathname,
      helpers: {
        jsonResponse,
        errorResponse,
        readJsonObjectBody,
        ensureAuthenticatedUser,
      },
    });
  }

  if (method === 'POST' && pathname === '/api/auth/register') {
    return handleRegisterAuth(request, env);
  }

  if (method === 'POST' && pathname === '/api/auth/login') {
    return handleLoginAuth(request, env);
  }

  if (method === 'GET' && pathname === '/api/auth/me') {
    return handleAuthMe(request, env);
  }

  if (method === 'POST' && pathname === '/api/auth/logout') {
    return handleAuthLogout(request, env);
  }

  if (pathname.startsWith('/api/admin/') && !adminSurfaceEnabled) {
    return errorResponse('Not found.', { status: 404 });
  }

  if (method === 'GET' && pathname === '/api/admin/users') {
    return handleAdminListUsers(request, env);
  }

  const adminUserApproveMatch = /^\/api\/admin\/users\/([^/]+)\/approve$/.exec(pathname);
  if (method === 'POST' && adminUserApproveMatch) {
    const userId = decodePathSegment(adminUserApproveMatch[1]);
    if (!userId) return errorResponse('Invalid user id.', { status: 400 });
    return handleAdminApproveUser(request, env, userId);
  }

  const adminUserRejectMatch = /^\/api\/admin\/users\/([^/]+)\/reject$/.exec(pathname);
  if (method === 'POST' && adminUserRejectMatch) {
    const userId = decodePathSegment(adminUserRejectMatch[1]);
    if (!userId) return errorResponse('Invalid user id.', { status: 400 });
    return handleAdminRejectUser(request, env, userId);
  }

  const adminUserResetPasswordMatch = /^\/api\/admin\/users\/([^/]+)\/reset-password$/.exec(pathname);
  if (method === 'POST' && adminUserResetPasswordMatch) {
    const userId = decodePathSegment(adminUserResetPasswordMatch[1]);
    if (!userId) return errorResponse('Invalid user id.', { status: 400 });
    return handleAdminResetPassword(request, env, userId);
  }

  if (method === 'GET' && pathname === '/api/schedules') {
    return handleListSchedules(request, env);
  }

  const scheduleIdMatch = /^\/api\/schedules\/([^/]+)$/.exec(pathname);
  if (scheduleIdMatch) {
    const id = decodePathSegment(scheduleIdMatch[1]);
    if (!id) return errorResponse('Invalid schedule id.', { status: 400 });
    if (method === 'GET') return handleGetSchedule(request, env, id);
    if (method === 'PUT') return handleUpdateSchedule(request, env, id);
    if (method === 'DELETE') return handleDeleteSchedule(request, env, id);
  }

  if (method === 'POST' && pathname === '/api/schedules') {
    return handleCreateSchedule(request, env);
  }

  const scheduleFolderMatch = /^\/api\/schedules\/([^/]+)\/folder$/.exec(pathname);
  if (method === 'PATCH' && scheduleFolderMatch) {
    const id = decodePathSegment(scheduleFolderMatch[1]);
    if (!id) return errorResponse('Invalid schedule id.', { status: 400 });
    return handlePatchScheduleFolder(request, env, id);
  }

  if (method === 'GET' && pathname === '/api/folders/tree') {
    return handleListFoldersTree(env);
  }

  if (method === 'POST' && pathname === '/api/folders') {
    return handleCreateFolder(request, env);
  }

  const folderOrderMatch = /^\/api\/folders\/([^/]+)\/order$/.exec(pathname);
  if (method === 'PATCH' && folderOrderMatch) {
    const id = decodePathSegment(folderOrderMatch[1]);
    if (!id) return errorResponse('Invalid folder id.', { status: 400 });
    return handlePatchFolderOrder(request, env, id);
  }

  const folderIdMatch = /^\/api\/folders\/([^/]+)$/.exec(pathname);
  if (method === 'DELETE' && folderIdMatch) {
    const id = decodePathSegment(folderIdMatch[1]);
    if (!id) return errorResponse('Invalid folder id.', { status: 400 });
    return handleDeleteFolder(request, env, id);
  }

  return errorResponse('Not found.', { status: 404 });
};

export default {
  async fetch(request, env) {
    const cors = buildCorsContext(request, env);
    if (!cors.ok) {
      return errorResponse('CORS origin is not allowed.', { status: 403 });
    }

    if (String(request.method || '').toUpperCase() === 'OPTIONS') {
      const preflight = new Response(null, {
        status: 204,
        headers: {
          ...Object.fromEntries(cors.headers.entries()),
          'Access-Control-Allow-Methods': CORS_ALLOW_METHODS,
          'Access-Control-Allow-Headers': CORS_ALLOW_HEADERS,
          'Access-Control-Max-Age': CORS_MAX_AGE,
        },
      });
      return preflight;
    }

    try {
      await ensureRuntimeSchema(env);
      const response = await handleRequest(request, env);
      return withCorsHeaders(response, cors.headers);
    } catch (error) {
      const message = error?.message || 'Internal server error.';
      return withCorsHeaders(errorResponse(message, { status: 500 }), cors.headers);
    }
  },
};

export { CollabWorkspaceRoom };
