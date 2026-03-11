import { normalizeTasks, normalizeVacations } from '../utils/data';
import { requestJson as requestApiJson, trimTrailingSlashes } from '../utils/apiClient';
import {
  PublicSchedulesApiError,
  getPublicSchedule,
  getPublicSchedulesApiBase,
  getPublicSchedulesAuthToken,
  getPublicSchedulesWriteApiBase,
} from '../utils/publicSchedulesApi';

export const getCollabApiBase = () => {
  const writeBase = trimTrailingSlashes(getPublicSchedulesWriteApiBase());
  return writeBase || trimTrailingSlashes(getPublicSchedulesApiBase());
};

const ensureApiBase = () => {
  const base = getCollabApiBase();
  if (!base) {
    throw new PublicSchedulesApiError(
      '협업 API가 설정되지 않았습니다. VITE_PUBLIC_SCHEDULES_API_BASE 또는 VITE_PUBLIC_SCHEDULES_WRITE_API_BASE를 확인하세요.',
    );
  }
  return base;
};

const buildCollabUrl = (path) => {
  const base = ensureApiBase();
  return `${base}${path.startsWith('/') ? '' : '/'}${path}`;
};

const requestCollabJson = async (
  path,
  {
    method = 'GET',
    body,
    timeoutMs = 15000,
    headers,
    requiresAuth = false,
    credentials = 'include',
    suppressAuthErrorMessage = false,
  } = {},
) => {
  const safeMethod = String(method || 'GET').toUpperCase();
  const isWriteRequest = safeMethod !== 'GET' && safeMethod !== 'HEAD';

  try {
    return await requestApiJson({
      buildUrl: buildCollabUrl,
      path,
      method: safeMethod,
      body,
      timeoutMs,
      credentials,
      headers,
      authToken: getPublicSchedulesAuthToken(),
      attachAuthToken: requiresAuth || isWriteRequest,
      authErrorMessage: suppressAuthErrorMessage ? '' : '로그인한 계정으로 다시 시도해주세요.',
    });
  } catch (error) {
    if (error instanceof PublicSchedulesApiError) throw error;
    throw new PublicSchedulesApiError(error?.message || 'Request failed.', {
      status: Number(error?.status) || 0,
      details: error?.details ?? error?.message ?? String(error),
    });
  }
};

const unwrapCollection = (data, keys = []) => {
  if (Array.isArray(data)) return data;
  for (const key of keys) {
    const value = data?.[key];
    if (Array.isArray(value)) return value;
  }
  return [];
};

const extractScheduleIdFromReference = (reference) => {
  const safeReference = String(reference || '').trim();
  if (!safeReference) return '';
  if (!/^https?:\/\//i.test(safeReference)) return safeReference;
  try {
    const url = new URL(safeReference);
    const apiMatch = url.pathname.match(/\/api\/schedules\/([^/?#]+)/i);
    if (apiMatch?.[1]) return decodeURIComponent(apiMatch[1]);
    const lastSegment = url.pathname.split('/').filter(Boolean).pop();
    return decodeURIComponent(lastSegment || '');
  } catch {
    return '';
  }
};

const extractSchedulePayload = (raw) => {
  if (raw && typeof raw === 'object') {
    if (raw.data && typeof raw.data === 'object') return raw.data;
    if (raw.schedule && typeof raw.schedule === 'object') return raw.schedule;
  }
  return raw;
};

export const listCollabWorkspaces = async () => {
  const data = await requestCollabJson('/api/v2/workspaces', { requiresAuth: true });
  return unwrapCollection(data, ['items', 'workspaces']);
};

export const createCollabWorkspace = async ({ name, description = '' }) => {
  const safeName = String(name || '').trim();
  if (!safeName) throw new PublicSchedulesApiError('워크스페이스 이름이 필요합니다.');
  return requestCollabJson('/api/v2/workspaces', {
    method: 'POST',
    requiresAuth: true,
    body: { name: safeName, description: String(description || '').trim() },
  });
};

export const getCollabWorkspaceSnapshot = async (workspaceId) => {
  const safeId = encodeURIComponent(String(workspaceId || '').trim());
  if (!safeId) throw new PublicSchedulesApiError('잘못된 워크스페이스 ID입니다.');
  return requestCollabJson(`/api/v2/workspaces/${safeId}/snapshot`, { requiresAuth: true });
};

export const createCollabBoard = async ({ workspaceId, name }) => {
  const safeWorkspaceId = String(workspaceId || '').trim();
  const safeName = String(name || '').trim();
  if (!safeWorkspaceId || !safeName) throw new PublicSchedulesApiError('보드 생성 정보가 올바르지 않습니다.');
  return requestCollabJson('/api/v2/boards', {
    method: 'POST',
    requiresAuth: true,
    body: { workspaceId: safeWorkspaceId, name: safeName },
  });
};

export const createCollabCard = async (payload) =>
  requestCollabJson('/api/v2/cards', { method: 'POST', requiresAuth: true, body: payload });

export const updateCollabCard = async (cardId, payload) => {
  const safeId = encodeURIComponent(String(cardId || '').trim());
  if (!safeId) throw new PublicSchedulesApiError('잘못된 카드 ID입니다.');
  return requestCollabJson(`/api/v2/cards/${safeId}`, { method: 'PATCH', requiresAuth: true, body: payload });
};

export const deleteCollabCard = async (cardId, payload = {}) => {
  const safeId = encodeURIComponent(String(cardId || '').trim());
  if (!safeId) throw new PublicSchedulesApiError('잘못된 카드 ID입니다.');
  return requestCollabJson(`/api/v2/cards/${safeId}`, { method: 'DELETE', requiresAuth: true, body: payload });
};

export const createCollabCardTask = async (payload) =>
  requestCollabJson('/api/v2/card-tasks', { method: 'POST', requiresAuth: true, body: payload });

export const updateCollabCardTask = async (taskId, payload) => {
  const safeId = encodeURIComponent(String(taskId || '').trim());
  if (!safeId) throw new PublicSchedulesApiError('잘못된 하위 작업 ID입니다.');
  return requestCollabJson(`/api/v2/card-tasks/${safeId}`, { method: 'PATCH', requiresAuth: true, body: payload });
};

export const deleteCollabCardTask = async (taskId, payload = {}) => {
  const safeId = encodeURIComponent(String(taskId || '').trim());
  if (!safeId) throw new PublicSchedulesApiError('잘못된 하위 작업 ID입니다.');
  return requestCollabJson(`/api/v2/card-tasks/${safeId}`, { method: 'DELETE', requiresAuth: true, body: payload });
};

export const createOrUpdateTimeOffEntry = async (payload) => {
  const safeId = String(payload?.id || '').trim();
  if (safeId) {
    return requestCollabJson(`/api/v2/time-off/${encodeURIComponent(safeId)}`, {
      method: 'PATCH',
      requiresAuth: true,
      body: payload,
    });
  }
  return requestCollabJson('/api/v2/time-off', { method: 'POST', requiresAuth: true, body: payload });
};

export const deleteTimeOffEntry = async (entryId, payload = {}) => {
  const safeId = encodeURIComponent(String(entryId || '').trim());
  if (!safeId) throw new PublicSchedulesApiError('잘못된 휴무 ID입니다.');
  return requestCollabJson(`/api/v2/time-off/${safeId}`, { method: 'DELETE', requiresAuth: true, body: payload });
};

export const createShareLink = async (payload) =>
  requestCollabJson('/api/v2/share-links', { method: 'POST', requiresAuth: true, body: payload });

export const getShareSnapshot = async (token) => {
  const safeToken = encodeURIComponent(String(token || '').trim());
  if (!safeToken) throw new PublicSchedulesApiError('잘못된 공유 토큰입니다.');
  return requestCollabJson(`/api/v2/share-links/${safeToken}/snapshot`, {
    method: 'GET',
    requiresAuth: false,
    credentials: 'same-origin',
    suppressAuthErrorMessage: true,
  });
};

export const importLegacySchedule = async (payload) =>
  requestCollabJson('/api/v2/import/legacy', { method: 'POST', requiresAuth: true, body: payload });

export const buildRealtimeSocketUrl = ({ workspaceId = '', shareToken = '' } = {}) => {
  const base = getCollabApiBase();
  if (!base) return '';
  try {
    const url = new URL(base);
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    url.pathname = '/api/v2/realtime';
    url.search = '';
    if (workspaceId) url.searchParams.set('workspaceId', String(workspaceId).trim());
    if (shareToken) url.searchParams.set('shareToken', String(shareToken).trim());
    return url.toString();
  } catch {
    return '';
  }
};

export const resolveLegacyScheduleFromReference = async (reference) => {
  const scheduleId = extractScheduleIdFromReference(reference);
  if (!scheduleId) throw new PublicSchedulesApiError('공개 일정 URL 또는 일정 ID를 입력하세요.');

  const raw = await getPublicSchedule(scheduleId);
  const schedule = extractSchedulePayload(raw);

  return {
    sourceId: String(raw?.id || scheduleId).trim(),
    name: String(raw?.name || schedule?.name || '').trim() || `가져온 일정 ${scheduleId}`,
    tasks: normalizeTasks(schedule?.tasks || schedule?.data?.tasks || []),
    vacations: normalizeVacations(schedule?.vacations || schedule?.data?.vacations || []),
    raw,
  };
};
