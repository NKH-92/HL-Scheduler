const trimTrailingSlashes = (value) => String(value || '').replace(/\/+$/, '');
const normalizeRole = (value) => (String(value || '').trim().toLowerCase() === 'admin' ? 'admin' : 'public');

const WRITE_AUTH_ERROR_MESSAGE = 'Write access denied. Please sign in with an approved account.';
const ADMIN_AUTH_ERROR_MESSAGE = 'Admin access denied. Sign in with an approved admin account.';
const AUTH_TOKEN_STORAGE_KEY = 'hl_scheduler_auth_token';

export const PUBLIC_UNCATEGORIZED_FOLDER_ID = '__uncategorized__';

export const getSchedulerAppRole = () => normalizeRole(import.meta.env.VITE_APP_ROLE);
export const isAdminAppRole = () => getSchedulerAppRole() === 'admin';
export const getSharedScheduleId = () => String(import.meta.env.VITE_SHARED_SCHEDULE_ID || '').trim();
export const getPublicAppUrl = () => trimTrailingSlashes(import.meta.env.VITE_PUBLIC_APP_URL);
export const getAdminAppUrl = () => trimTrailingSlashes(import.meta.env.VITE_ADMIN_APP_URL);

export const getPublicSchedulesApiBase = () => trimTrailingSlashes(import.meta.env.VITE_PUBLIC_SCHEDULES_API_BASE);

export const getPublicSchedulesWriteApiBase = () => {
  const writeBase = trimTrailingSlashes(import.meta.env.VITE_PUBLIC_SCHEDULES_WRITE_API_BASE);
  return writeBase || getPublicSchedulesApiBase();
};

export const getAuthApiBase = () => {
  const authBase = trimTrailingSlashes(import.meta.env.VITE_AUTH_API_BASE);
  return authBase || getPublicSchedulesApiBase();
};

export const getAdminApiBase = () => {
  const adminBase = trimTrailingSlashes(import.meta.env.VITE_ADMIN_API_BASE);
  return adminBase || getPublicSchedulesWriteApiBase();
};

export const isPublicSchedulesEnabled = () => Boolean(getPublicSchedulesApiBase());
export const isPublicSchedulesWriteEnabled = () => Boolean(getPublicSchedulesWriteApiBase());
export const isAuthApiEnabled = () => Boolean(getAuthApiBase());
export const isAdminApiEnabled = () => Boolean(getAdminApiBase());

let authToken = '';

try {
  const saved = localStorage.getItem(AUTH_TOKEN_STORAGE_KEY);
  if (saved) authToken = String(saved).trim();
} catch {
  // ignore storage failures
}

export const getPublicSchedulesAuthToken = () => String(authToken || '').trim();

export const setPublicSchedulesAuthToken = (token) => {
  authToken = String(token || '').trim();
  try {
    if (authToken) {
      localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, authToken);
    } else {
      localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
    }
  } catch {
    // ignore storage failures
  }
};

class PublicSchedulesApiError extends Error {
  constructor(message, { status, details } = {}) {
    super(message);
    this.name = 'PublicSchedulesApiError';
    this.status = status;
    this.details = details;
  }
}

const buildApiUrl = (path, { api = 'read' } = {}) => {
  const base =
    api === 'admin'
      ? getAdminApiBase()
      : api === 'auth'
        ? getAuthApiBase()
        : api === 'write'
          ? getPublicSchedulesWriteApiBase()
          : getPublicSchedulesApiBase();

  if (!base) {
    const message =
      api === 'admin'
        ? 'Admin API is not configured. Set VITE_ADMIN_API_BASE and rebuild the app.'
        : api === 'auth'
          ? 'Auth API is not configured. Set VITE_AUTH_API_BASE and rebuild the app.'
          : api === 'write'
            ? 'Public schedules write server is not configured. Set VITE_PUBLIC_SCHEDULES_WRITE_API_BASE and rebuild the app.'
            : 'Public schedules server is not configured. Set VITE_PUBLIC_SCHEDULES_API_BASE and rebuild the app.';
    throw new PublicSchedulesApiError(message);
  }
  return `${base}${path.startsWith('/') ? '' : '/'}${path}`;
};

const readJsonBody = async (res) => {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
};

const extractResponseErrorMessage = (data, status) => {
  if (data && typeof data === 'object') {
    const message = data.error || data.message;
    if (message) return String(message);
  }
  if (typeof data === 'string' && data.trim()) return data.trim();
  return `Request failed (${status})`;
};

const requestJson = async (
  path,
  { timeoutMs = 15000, api = 'read', requiresAuth = false, suppressAuthErrorMessage = false, ...options } = {},
) => {
  const method = String(options.method || 'GET').toUpperCase();
  const isWriteRequest = api === 'write' || api === 'admin' || (method !== 'GET' && method !== 'HEAD');
  const needsCredentials = api === 'auth' || api === 'admin' || isWriteRequest;
  const token = getPublicSchedulesAuthToken();

  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), Math.max(5000, Number(timeoutMs) || 15000));

  try {
    const headers = {
      Accept: 'application/json',
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {}),
      ...((requiresAuth || isWriteRequest) && token ? { Authorization: `Bearer ${token}` } : {}),
    };

    const res = await fetch(buildApiUrl(path, { api }), {
      ...options,
      credentials: options.credentials ?? (needsCredentials ? 'include' : 'same-origin'),
      headers,
      signal: controller.signal,
    });

    const data = await readJsonBody(res);
    if (!res.ok) {
      const isAuthDenied = res.status === 401 || res.status === 403;
      const message =
        isAuthDenied && !suppressAuthErrorMessage
          ? api === 'admin'
            ? ADMIN_AUTH_ERROR_MESSAGE
            : isWriteRequest
              ? WRITE_AUTH_ERROR_MESSAGE
              : extractResponseErrorMessage(data, res.status)
          : extractResponseErrorMessage(data, res.status);

      throw new PublicSchedulesApiError(String(message), { status: res.status, details: data });
    }

    return data;
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new PublicSchedulesApiError('Request timed out.', { status: 0 });
    }
    if (error instanceof PublicSchedulesApiError) throw error;
    throw new PublicSchedulesApiError('Network error.', { status: 0, details: error?.message || String(error) });
  } finally {
    window.clearTimeout(timer);
  }
};

const normalizeFolderIdForPayload = (folderId) => {
  if (folderId == null) return null;
  const raw = String(folderId).trim();
  if (!raw) return null;
  if (raw === PUBLIC_UNCATEGORIZED_FOLDER_ID) return null;
  return raw;
};

const normalizeFolderIdForFilter = (folderId) => {
  if (folderId === undefined) return undefined;
  const normalized = normalizeFolderIdForPayload(folderId);
  if (normalized == null) return PUBLIC_UNCATEGORIZED_FOLDER_ID;
  return normalized;
};

export const listPublicSchedules = async ({
  query = '',
  limit = 40,
  offset = 0,
  folderId,
  includeDescendants = true,
} = {}) => {
  const params = new URLSearchParams();
  if (query) params.set('q', query);
  params.set('limit', String(Math.max(1, Math.min(200, Number(limit) || 40))));
  params.set('offset', String(Math.max(0, Number(offset) || 0)));

  const safeFolderFilter = normalizeFolderIdForFilter(folderId);
  if (safeFolderFilter !== undefined) {
    params.set('folderId', safeFolderFilter);
    params.set('includeDescendants', includeDescendants ? '1' : '0');
  }

  const data = await requestJson(`/api/schedules?${params.toString()}`);
  if (!Array.isArray(data)) {
    throw new PublicSchedulesApiError('Invalid list response from server.', { details: data });
  }
  return data;
};

export const getPublicSchedule = async (id) => {
  const safeId = encodeURIComponent(String(id || '').trim());
  if (!safeId) throw new PublicSchedulesApiError('Invalid schedule id.');

  const data = await requestJson(`/api/schedules/${safeId}`);
  if (!data || typeof data !== 'object') {
    throw new PublicSchedulesApiError('Invalid schedule response from server.', { details: data });
  }
  return data;
};

export const uploadPublicSchedule = async (payload) => {
  if (!payload || typeof payload !== 'object') throw new PublicSchedulesApiError('Invalid schedule payload.');

  const body = {
    ...payload,
    folderId: normalizeFolderIdForPayload(payload.folderId),
  };

  const data = await requestJson('/api/schedules', {
    method: 'POST',
    api: 'write',
    requiresAuth: true,
    body: JSON.stringify(body),
  });

  if (!data || typeof data !== 'object') {
    throw new PublicSchedulesApiError('Invalid upload response from server.', { details: data });
  }
  return data;
};

export const updatePublicSchedule = async (id, payload) => {
  const safeId = encodeURIComponent(String(id || '').trim());
  if (!safeId) throw new PublicSchedulesApiError('Invalid schedule id.');
  if (!payload || typeof payload !== 'object') throw new PublicSchedulesApiError('Invalid schedule payload.');

  const body = {
    ...payload,
    ...(Object.prototype.hasOwnProperty.call(payload, 'folderId')
      ? { folderId: normalizeFolderIdForPayload(payload.folderId) }
      : {}),
  };

  if (Object.prototype.hasOwnProperty.call(body, 'updatedByEmail')) {
    delete body.updatedByEmail;
  }

  const data = await requestJson(`/api/schedules/${safeId}`, {
    method: 'PUT',
    api: 'write',
    requiresAuth: true,
    body: JSON.stringify(body),
  });

  if (!data || typeof data !== 'object') {
    throw new PublicSchedulesApiError('Invalid update response from server.', { details: data });
  }
  return data;
};

export const listPublicFoldersTree = async () => {
  const data = await requestJson('/api/folders/tree');
  if (!Array.isArray(data)) {
    throw new PublicSchedulesApiError('Invalid folders response from server.', { details: data });
  }
  return data;
};

export const createPublicFolder = async ({ name, parentId = null } = {}) => {
  const safeName = String(name || '').trim();
  if (!safeName) throw new PublicSchedulesApiError('Folder name is required.');

  const data = await requestJson('/api/folders', {
    method: 'POST',
    api: 'admin',
    requiresAuth: true,
    body: JSON.stringify({
      name: safeName,
      parentId: normalizeFolderIdForPayload(parentId),
    }),
  });

  if (!data || typeof data !== 'object') {
    throw new PublicSchedulesApiError('Invalid folder create response from server.', { details: data });
  }
  return data;
};

export const deletePublicFolder = async (folderId) => {
  const safeId = encodeURIComponent(String(folderId || '').trim());
  if (!safeId) throw new PublicSchedulesApiError('Invalid folder id.');

  const data = await requestJson(`/api/folders/${safeId}`, {
    method: 'DELETE',
    api: 'admin',
    requiresAuth: true,
  });

  if (!data || typeof data !== 'object') {
    throw new PublicSchedulesApiError('Invalid folder delete response from server.', { details: data });
  }
  return data;
};

export const updatePublicScheduleFolder = async (id, folderId) => {
  const safeId = encodeURIComponent(String(id || '').trim());
  if (!safeId) throw new PublicSchedulesApiError('Invalid schedule id.');

  const data = await requestJson(`/api/schedules/${safeId}/folder`, {
    method: 'PATCH',
    api: 'admin',
    requiresAuth: true,
    body: JSON.stringify({
      folderId: normalizeFolderIdForPayload(folderId),
    }),
  });

  if (!data || typeof data !== 'object') {
    throw new PublicSchedulesApiError('Invalid folder update response from server.', { details: data });
  }
  return data;
};

export const registerAuthUser = async ({ email, password }) => {
  const data = await requestJson('/api/auth/register', {
    method: 'POST',
    api: 'auth',
    suppressAuthErrorMessage: true,
    body: JSON.stringify({
      email: String(email || '').trim(),
      password: String(password || ''),
    }),
  });
  if (!data || typeof data !== 'object') {
    throw new PublicSchedulesApiError('Invalid register response from server.', { details: data });
  }
  return data;
};

export const loginAuthUser = async ({ email, password }) => {
  const data = await requestJson('/api/auth/login', {
    method: 'POST',
    api: 'auth',
    suppressAuthErrorMessage: true,
    body: JSON.stringify({
      email: String(email || '').trim(),
      password: String(password || ''),
    }),
  });
  if (!data || typeof data !== 'object') {
    throw new PublicSchedulesApiError('Invalid login response from server.', { details: data });
  }
  return data;
};

export const getAuthMe = async () => {
  const data = await requestJson('/api/auth/me', {
    method: 'GET',
    api: 'auth',
    requiresAuth: true,
    suppressAuthErrorMessage: true,
  });
  if (!data || typeof data !== 'object') {
    throw new PublicSchedulesApiError('Invalid session response from server.', { details: data });
  }
  return data;
};

export const logoutAuthSession = async () => {
  const data = await requestJson('/api/auth/logout', {
    method: 'POST',
    api: 'auth',
    requiresAuth: true,
    suppressAuthErrorMessage: true,
  });
  if (!data || typeof data !== 'object') {
    throw new PublicSchedulesApiError('Invalid logout response from server.', { details: data });
  }
  return data;
};

export const listAdminUsers = async ({ status = '', query = '', limit = 100, offset = 0 } = {}) => {
  const params = new URLSearchParams();
  const safeStatus = String(status || '').trim();
  if (safeStatus) params.set('status', safeStatus);
  const safeQuery = String(query || '').trim();
  if (safeQuery) params.set('q', safeQuery);
  params.set('limit', String(Math.max(1, Math.min(200, Number(limit) || 100))));
  params.set('offset', String(Math.max(0, Number(offset) || 0)));

  const data = await requestJson(`/api/admin/users?${params.toString()}`, {
    method: 'GET',
    api: 'admin',
    requiresAuth: true,
  });
  const users = Array.isArray(data?.users) ? data.users : null;
  if (!users) {
    throw new PublicSchedulesApiError('Invalid admin users response from server.', { details: data });
  }
  return users;
};

export const approveAdminUser = async (userId) => {
  const safeId = encodeURIComponent(String(userId || '').trim());
  if (!safeId) throw new PublicSchedulesApiError('Invalid user id.');

  const data = await requestJson(`/api/admin/users/${safeId}/approve`, {
    method: 'POST',
    api: 'admin',
    requiresAuth: true,
  });
  if (!data || typeof data !== 'object') {
    throw new PublicSchedulesApiError('Invalid approve response from server.', { details: data });
  }
  return data;
};

export const rejectAdminUser = async (userId) => {
  const safeId = encodeURIComponent(String(userId || '').trim());
  if (!safeId) throw new PublicSchedulesApiError('Invalid user id.');

  const data = await requestJson(`/api/admin/users/${safeId}/reject`, {
    method: 'POST',
    api: 'admin',
    requiresAuth: true,
  });
  if (!data || typeof data !== 'object') {
    throw new PublicSchedulesApiError('Invalid reject response from server.', { details: data });
  }
  return data;
};

export const resetAdminUserPassword = async (userId, temporaryPassword) => {
  const safeId = encodeURIComponent(String(userId || '').trim());
  if (!safeId) throw new PublicSchedulesApiError('Invalid user id.');

  const data = await requestJson(`/api/admin/users/${safeId}/reset-password`, {
    method: 'POST',
    api: 'admin',
    requiresAuth: true,
    body: JSON.stringify({
      temporaryPassword: String(temporaryPassword || ''),
    }),
  });
  if (!data || typeof data !== 'object') {
    throw new PublicSchedulesApiError('Invalid reset-password response from server.', { details: data });
  }
  return data;
};

export { PublicSchedulesApiError, AUTH_TOKEN_STORAGE_KEY };
