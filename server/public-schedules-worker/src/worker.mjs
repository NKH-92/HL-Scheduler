import { CollabWorkspaceRoom, getCollabSchemaStatements, handleCollabRequest } from './collab-api.mjs';
import { createAuthAdminDomain } from './auth-admin.mjs';
import { resolveAllowedOrigin } from './cors-utils.mjs';
import {
  buildFolderContext as buildFolderContextBase,
  collectDescendantFolderIds,
  ensureFolderExists as ensureFolderExistsBase,
  resolveFolderPath as resolveFolderPathBase,
} from './folder-service.mjs';
import { createFolderDomain } from './folders.mjs';
import {
  MAX_HOLDING_REASON_LENGTH,
  MAX_NEXT_ACTION_LENGTH,
  SCHEDULE_STATUS_DEFAULT,
  SCHEDULE_SUMMARY_SELECT_SQL,
  appendActivityEntries,
  buildScheduleActivityEntries,
  buildScheduleOverview,
  buildScheduleSummaryPayload,
  createActivityEntry,
  encodeScheduleSummaryPayload,
  normalizeActivityLog,
  normalizeScheduleStatus,
  readScheduleSummaryFromRow,
} from './schedule-summary.mjs';
import { routeWorkerRequest } from './worker-router.mjs';

const CORS_ALLOW_METHODS = 'GET,POST,PUT,PATCH,DELETE,OPTIONS';
const CORS_ALLOW_HEADERS =
  'Content-Type, X-Upload-Key, X-Folder-Admin-Key, Authorization, CF-Access-Authenticated-User-Email';
const CORS_MAX_AGE = '86400';

const MAX_FOLDER_DEPTH = 4;
const MAX_FOLDER_NAME_LENGTH = 40;
const MAX_JSON_BODY_BYTES = 1024 * 1024;
const MAX_LIST_OFFSET = 5000;
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

const folderServiceDeps = { normalizeFolderId, parseD1Rows, toSafeTimestamp };
const buildFolderContext = (db) => buildFolderContextBase(db, folderServiceDeps);
const resolveFolderPath = (db, folderId) => resolveFolderPathBase(db, folderId, {
  normalizeFolderId,
  parseD1Rows,
});
const ensureFolderExists = (db, folderId) => ensureFolderExistsBase(db, folderId);

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

const ensureNotReadOnly = (env) => {
  if (parseBoolean(env.READ_ONLY_MODE, false)) {
    return errorResponse('This API is in read-only mode.', { status: 403 });
  }
  return null;
};

const {
  buildUserPermissions,
  ensureAdminUser,
  ensureAuthenticatedUser,
  handleAdminApproveUser,
  handleAdminListUsers,
  handleAdminRejectUser,
  handleAdminResetPassword,
  handleAuthLogout,
  handleAuthMe,
  handleLoginAuth,
  handleRegisterAuth,
  isAdminSurfaceEnabled,
} = createAuthAdminDomain({
  DEFAULT_AUTH_RATE_LIMIT_MAX_ATTEMPTS,
  DEFAULT_AUTH_RATE_LIMIT_WINDOW_SECONDS,
  MAX_PASSWORD_LENGTH,
  MIN_PASSWORD_LENGTH,
  PBKDF2_ITERATIONS,
  PBKDF2_KEY_LENGTH_BITS,
  PBKDF2_MAX_ITERATIONS,
  PBKDF2_MIN_ITERATIONS,
  SESSION_COOKIE_NAME_DEFAULT,
  SESSION_COOKIE_PATH,
  STATUS_APPROVED,
  STATUS_DISABLED,
  STATUS_PENDING,
  STATUS_REJECTED,
  clamp,
  errorResponse,
  getRequestUrl,
  isValidEmail,
  jsonResponse,
  normalizeEmail,
  normalizeEmailList,
  nowMs,
  parseBoolean,
  parseD1Rows,
  readJsonObjectBody,
  toInt,
  toSafeTimestamp,
});

const {
  handleCreateFolder,
  handleDeleteFolder,
  handleListFoldersTree,
  handlePatchFolderOrder,
} = createFolderDomain({
  MAX_FOLDER_DEPTH,
  MAX_FOLDER_NAME_LENGTH,
  buildFolderContextDeps: folderServiceDeps,
  ensureAdminUser,
  ensureNotReadOnly,
  errorResponse,
  getSharedScheduleId,
  isAdminSurfaceEnabled,
  jsonResponse,
  normalizeFolderId,
  normalizeFolderName,
  nowMs,
  parseD1Rows,
  readJsonObjectBody,
  resolveFolderPath,
});

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
          'holding_reason TEXT,',
          'next_action TEXT,',
          'recent_activity_json TEXT,',
          'overview_json TEXT,',
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
	      'ALTER TABLE schedules ADD COLUMN holding_reason TEXT',
	      'ALTER TABLE schedules ADD COLUMN next_action TEXT',
	      'ALTER TABLE schedules ADD COLUMN recent_activity_json TEXT',
	      'ALTER TABLE schedules ADD COLUMN overview_json TEXT',
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
	    await env.DB.prepare('CREATE INDEX IF NOT EXISTS schedules_updated_created_idx ON schedules(updated_at DESC, created_at DESC)').run();
	    await env.DB.prepare('CREATE INDEX IF NOT EXISTS schedules_folder_updated_created_idx ON schedules(folder_id, updated_at DESC, created_at DESC)').run();

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

const scheduleRowToSummary = (row, pathById) => {
  const folderId = normalizeFolderId(row?.folder_id ?? row?.folderId);
  const status = normalizeScheduleStatus(row?.status);
  const cachedSummary = readScheduleSummaryFromRow(row);
  const parsedData = cachedSummary ? null : parseJsonSafe(String(row?.data || ''));
  const safeData = isPlainObject(parsedData) ? parsedData : {};
  const summary = cachedSummary || buildScheduleSummaryPayload({
    data: safeData,
    updatedAt: row?.updated_at ?? row?.updatedAt,
    status,
  });
  return {
    id: String(row?.id || '').trim(),
    name: String(row?.name || '').trim(),
    status,
    holdingReason: summary.holdingReason,
    nextAction: summary.nextAction,
    recentActivity: summary.recentActivity.slice(0, 3),
    overview: summary.overview,
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
  const cachedSummary = readScheduleSummaryFromRow(row);
  const holdingReason = normalizeShortText(
    rawData?.holdingReason ?? cachedSummary?.holdingReason ?? '',
    { maxLength: MAX_HOLDING_REASON_LENGTH },
  );
  const nextAction = normalizeShortText(
    rawData?.nextAction ?? cachedSummary?.nextAction ?? '',
    { maxLength: MAX_NEXT_ACTION_LENGTH },
  );
  const activityLog = normalizeActivityLog(rawData?.activityLog);
  const overview = cachedSummary?.overview || buildScheduleOverview({
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

const handleListSchedules = async (request, env) => {
  const { DB } = env;
  const url = getRequestUrl(request);
  const sharedScheduleId = getSharedScheduleId(env);

  if (sharedScheduleId) {
	    const row = await DB
	      .prepare(
	        [
	          `SELECT id, name, status, tasks_count, vacations_count, folder_id, ${SCHEDULE_SUMMARY_SELECT_SQL}, created_by_email, updated_by_email, created_at, updated_at`,
	          'FROM schedules',
	          'WHERE id = ?',
	          'LIMIT 1',
        ].join(' '),
      )
      .bind(sharedScheduleId)
      .first();

    const offset = Math.max(0, toInt(url.searchParams.get('offset'), 0));
    if (offset > 0 || !row) return jsonResponse([]);
    return jsonResponse([scheduleRowToSummary(row, new Map())]);
  }

  const query = String(url.searchParams.get('q') || '').trim();
  const limit = clamp(toInt(url.searchParams.get('limit'), 40), 1, 200);
  const offset = clamp(Math.max(0, toInt(url.searchParams.get('offset'), 0)), 0, MAX_LIST_OFFSET);
  const requestedFolderId = normalizeFolderId(url.searchParams.get('folderId'));
  const includeDescendants = parseBoolean(url.searchParams.get('includeDescendants'), true);

  const whereParts = [];
  const bindings = [];
  let folderContext = null;

  if (query) {
    whereParts.push('name LIKE ?');
    bindings.push(`%${query}%`);
  }

  if (url.searchParams.has('folderId')) {
    if (requestedFolderId == null) {
      whereParts.push('folder_id IS NULL');
    } else if (includeDescendants) {
      folderContext = await buildFolderContext(DB);
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
	    `SELECT id, name, status, tasks_count, vacations_count, folder_id, ${SCHEDULE_SUMMARY_SELECT_SQL}, created_by_email, updated_by_email, created_at, updated_at`,
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

  return jsonResponse(rows.map((row) => scheduleRowToSummary(row, new Map())));
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

  const pathById = new Map();
  const folderId = normalizeFolderId(row?.folder_id ?? row?.folderId);
  if (folderId) pathById.set(folderId, await resolveFolderPath(env.DB, folderId));
  return jsonResponse(scheduleRowToDetail(row, pathById, request));
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
  const summary = buildScheduleSummaryPayload({ data: parsed.data, updatedAt: timestamp, status: parsed.status });
  const encodedSummary = encodeScheduleSummaryPayload(summary);

		  const runResult = await env.DB
	    .prepare(
	      [
	        'INSERT INTO schedules (id, name, data, status, tasks_count, vacations_count, folder_id, holding_reason, next_action, recent_activity_json, overview_json, created_by_email, updated_by_email, created_at, updated_at)',
	        'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
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
        encodedSummary.holdingReason,
        encodedSummary.nextAction,
        encodedSummary.recentActivityJson,
        encodedSummary.overviewJson,
      createdByEmail,
      updatedByEmail,
      timestamp,
      timestamp,
    )
    .run();

  if (!runResult?.success) {
    return errorResponse('Failed to create schedule.', { status: 500 });
  }

  const folderPath = await resolveFolderPath(env.DB, parsed.folderId);
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
		      recentActivity: summary.recentActivity.slice(0, 3),
		      overview: summary.overview,
		      folderId: parsed.folderId,
		      folderPath,
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
  const summary = buildScheduleSummaryPayload({ data: parsed.data, updatedAt: timestamp, status: parsed.status });
  const encodedSummary = encodeScheduleSummaryPayload(summary);

		  const runResult = await env.DB
	    .prepare(
	      [
	        'UPDATE schedules',
	        'SET name = ?, data = ?, status = ?, tasks_count = ?, vacations_count = ?, folder_id = ?, holding_reason = ?, next_action = ?, recent_activity_json = ?, overview_json = ?, created_by_email = ?, updated_by_email = ?, updated_at = ?',
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
        encodedSummary.holdingReason,
        encodedSummary.nextAction,
        encodedSummary.recentActivityJson,
        encodedSummary.overviewJson,
      createdByEmail,
      updatedByEmail,
      timestamp,
      id,
    )
    .run();

	  if (!runResult?.success) {
	    return errorResponse('Failed to update schedule.', { status: 500 });
	  }

  const folderPath = await resolveFolderPath(env.DB, parsed.folderId);
	  return jsonResponse({
	    id,
	    name: parsed.name,
		    url: buildScheduleUrl(request, id),
		    updatedAt: timestamp,
		    status: parsed.status,
		    holdingReason: parsed.holdingReason,
		    nextAction: parsed.nextAction,
		    recentActivity: summary.recentActivity.slice(0, 3),
		    overview: summary.overview,
		    tasksCount: parsed.tasks.length,
		    vacationsCount: parsed.vacations.length,
    folderId: parsed.folderId,
    folderPath,
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
  const previousFolderId = normalizeFolderId(schedule?.folder_id ?? schedule?.folderId);
  const previousFolderPath = previousFolderId ? await resolveFolderPath(env.DB, previousFolderId) : '미분류';
  const nextFolderPath = folderId ? await resolveFolderPath(env.DB, folderId) : '미분류';
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
  const summary = buildScheduleSummaryPayload({
    data: nextData,
    updatedAt: timestamp,
    status: schedule?.status,
  });
  const encodedSummary = encodeScheduleSummaryPayload(summary);
  const runResult = await env.DB
    .prepare('UPDATE schedules SET data = ?, folder_id = ?, holding_reason = ?, next_action = ?, recent_activity_json = ?, overview_json = ?, updated_by_email = ?, updated_at = ? WHERE id = ?')
    .bind(
      JSON.stringify(nextData),
      folderId,
      encodedSummary.holdingReason,
      encodedSummary.nextAction,
      encodedSummary.recentActivityJson,
      encodedSummary.overviewJson,
      actorEmail,
      timestamp,
      id,
    )
    .run();

  if (!runResult?.success) return errorResponse('Failed to update schedule folder.', { status: 500 });

  return jsonResponse({
    id,
    folderId,
    folderPath: nextFolderPath,
    updatedAt: timestamp,
    updatedByEmail: actorEmail,
    recentActivity: summary.recentActivity.slice(0, 3),
    overview: summary.overview,
  });
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

  return routeWorkerRequest({
    request,
    env,
    url,
    method,
    pathname,
    adminSurfaceEnabled,
    decodePathSegment,
    textResponse,
    jsonResponse,
    errorResponse,
    handleCollabRequest,
    handleRegisterAuth,
    handleLoginAuth,
    handleAuthMe,
    handleAuthLogout,
    handleAdminListUsers,
    handleAdminApproveUser,
    handleAdminRejectUser,
    handleAdminResetPassword,
    handleListSchedules,
    handleGetSchedule,
    handleUpdateSchedule,
    handleDeleteSchedule,
    handleCreateSchedule,
    handlePatchScheduleFolder,
    handleListFoldersTree,
    handleCreateFolder,
    handlePatchFolderOrder,
    handleDeleteFolder,
    helpers: {
      jsonResponse,
      errorResponse,
      readJsonObjectBody,
      ensureAuthenticatedUser,
    },
  });
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
