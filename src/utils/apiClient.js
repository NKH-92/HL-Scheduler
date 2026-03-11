export class ApiClientError extends Error {
  constructor(message, { status = 0, details } = {}) {
    super(message);
    this.name = 'ApiClientError';
    this.status = status;
    this.details = details;
  }
}

export const trimTrailingSlashes = (value) => String(value || '').replace(/\/+$/, '');

export const readJsonBody = async (response) => {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
};

export const extractApiErrorMessage = (data, status) => {
  if (data && typeof data === 'object') {
    const message = data.error || data.message;
    if (message) return String(message);
  }
  if (typeof data === 'string' && data.trim()) return data.trim();
  return `Request failed (${status}).`;
};

export const requestJson = async ({
  buildUrl,
  path,
  method = 'GET',
  body,
  timeoutMs = 15000,
  credentials = 'same-origin',
  headers,
  authToken = '',
  attachAuthToken = false,
  authErrorMessage = '',
  suppressAuthErrorMessage = false,
}) => {
  const safeMethod = String(method || 'GET').toUpperCase();
  const serializedBody =
    body == null ? undefined : typeof body === 'string' ? body : JSON.stringify(body);
  const controller = new AbortController();
  const timer = globalThis.setTimeout(() => controller.abort(), Math.max(5000, Number(timeoutMs) || 15000));

  try {
    const response = await fetch(buildUrl(path), {
      method: safeMethod,
      body: serializedBody,
      credentials,
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        ...(body == null ? null : { 'Content-Type': 'application/json' }),
        ...(attachAuthToken && authToken ? { Authorization: `Bearer ${authToken}` } : null),
        ...(headers || null),
      },
    });

    const data = await readJsonBody(response);
    if (!response.ok) {
      const isAuthDenied = response.status === 401 || response.status === 403;
      const message =
        isAuthDenied && authErrorMessage && !suppressAuthErrorMessage
          ? authErrorMessage
          : extractApiErrorMessage(data, response.status);
      throw new ApiClientError(String(message), { status: response.status, details: data });
    }

    return data;
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new ApiClientError('Request timed out.', { status: 0 });
    }
    if (error instanceof ApiClientError) throw error;
    throw new ApiClientError('Network request failed.', { status: 0, details: error?.message || String(error) });
  } finally {
    globalThis.clearTimeout(timer);
  }
};
