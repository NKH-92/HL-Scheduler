const parseCsv = (value) =>
  String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

export const normalizeOrigin = (value) => String(value || '').trim().replace(/\/+$/, '').toLowerCase();

const unique = (values) => Array.from(new Set(values.filter(Boolean)));

const toOriginCandidate = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (raw === '*') return '*';
  try {
    return normalizeOrigin(new URL(raw).origin);
  } catch {
    return normalizeOrigin(raw);
  }
};

export const getAllowedOrigins = (env = {}) => {
  const explicit = unique(parseCsv(env.CORS_ALLOWED_ORIGINS).map((item) => toOriginCandidate(item)));
  if (explicit.length > 0) return explicit;

  return unique([toOriginCandidate(env.PUBLIC_APP_URL), toOriginCandidate(env.ADMIN_APP_URL)]);
};

export const resolveAllowedOrigin = (requestOrigin, env = {}) => {
  const origin = String(requestOrigin || '').trim();
  if (!origin) return null;

  const allowedOrigins = getAllowedOrigins(env);
  if (allowedOrigins.includes('*')) return '*';

  const normalized = normalizeOrigin(origin);
  return allowedOrigins.includes(normalized) ? origin : null;
};
