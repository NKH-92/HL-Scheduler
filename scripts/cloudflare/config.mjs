import process from 'node:process';

const DEPLOY_ENV_VALUES = new Set(['staging', 'production']);
const SURFACE_VALUES = new Set(['public', 'admin']);

const DEFAULT_LOCAL_ORIGINS = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:4173',
  'http://127.0.0.1:4173',
];

const trim = (value) => String(value ?? '').trim();
const trimUrl = (value) => trim(value).replace(/\/+$/, '');

const parseFlag = (value, fallback = '0') => {
  const raw = trim(value).toLowerCase();
  if (!raw) return fallback;
  if (['1', 'true', 'yes', 'on'].includes(raw)) return '1';
  if (['0', 'false', 'no', 'off'].includes(raw)) return '0';
  throw new Error(`Invalid boolean flag: ${value}`);
};

const unique = (values) => {
  const seen = new Set();
  const result = [];

  values.forEach((value) => {
    const normalized = trimUrl(value);
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    result.push(normalized);
  });

  return result;
};

const parseArgMap = (argv = process.argv.slice(2)) => {
  const args = new Map();

  for (let index = 0; index < argv.length; index += 1) {
    const entry = String(argv[index] || '');
    if (!entry.startsWith('--')) continue;

    const [name, inlineValue] = entry.split('=', 2);
    if (inlineValue !== undefined) {
      args.set(name, inlineValue);
      continue;
    }

    const next = argv[index + 1];
    if (next && !String(next).startsWith('--')) {
      args.set(name, String(next));
      index += 1;
      continue;
    }

    args.set(name, '1');
  }

  return args;
};

export const getArgValue = (name, argv) => parseArgMap(argv).get(name) || '';

export const normalizeDeployEnv = (value) => {
  const normalized = trim(value).toLowerCase();
  if (!DEPLOY_ENV_VALUES.has(normalized)) {
    throw new Error(`DEPLOY_ENV must be one of: ${Array.from(DEPLOY_ENV_VALUES).join(', ')}`);
  }
  return normalized;
};

export const normalizeSurface = (value, flagName = 'surface') => {
  const normalized = trim(value).toLowerCase();
  if (!SURFACE_VALUES.has(normalized)) {
    throw new Error(`${flagName} must be one of: ${Array.from(SURFACE_VALUES).join(', ')}`);
  }
  return normalized;
};

const requireValue = (name, value) => {
  const normalized = trim(value);
  if (!normalized) {
    throw new Error(`${name} is required for Cloudflare staging/production deployment.`);
  }
  return normalized;
};

const normalizeWorkersSubdomain = (value) =>
  trim(value)
    .replace(/^https?:\/\//i, '')
    .replace(/\/+$/, '')
    .replace(/\.workers\.dev$/i, '')
    .replace(/\.+$/, '');

const getDefaultWorkerName = (surface, deployEnv) =>
  deployEnv === 'production' ? `hl-scheduler-${surface}-api` : `hl-scheduler-${surface}-api-staging`;

const getDefaultPagesProjectName = (surface, deployEnv) =>
  deployEnv === 'production' ? `hl-scheduler-${surface}` : `hl-scheduler-${surface}-staging`;

const buildPagesUrl = (projectName) => `https://${projectName}.pages.dev`;
const buildWorkersUrl = (workerName, workersSubdomain) => `https://${workerName}.${workersSubdomain}.workers.dev`;

const resolveDerivedUrl = ({ explicitUrl, derivedUrl, explicitName, derivedName }) => {
  const explicit = trimUrl(explicitUrl);
  if (explicit) return explicit;
  const derived = trimUrl(derivedUrl);
  if (derived) return derived;
  throw new Error(`${explicitName} is required, or ${derivedName} must be set so it can be derived.`);
};

const buildCorsOrigins = ({ publicAppUrl, adminAppUrl, extraOrigins, explicitOrigins }) => {
  const combined = [
    ...trim(explicitOrigins)
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean),
    ...trim(extraOrigins)
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean),
    publicAppUrl,
    adminAppUrl,
    ...DEFAULT_LOCAL_ORIGINS,
  ];

  return unique(combined).join(',');
};

export const getCloudflareDeployConfig = ({ deployEnv: deployEnvInput } = {}) => {
  const deployEnv = normalizeDeployEnv(deployEnvInput || getArgValue('--env') || process.env.DEPLOY_ENV);
  const workersSubdomain = normalizeWorkersSubdomain(process.env.CLOUDFLARE_WORKERS_SUBDOMAIN);

  const publicWorkerName = trim(process.env.CLOUDFLARE_PUBLIC_WORKER_NAME) || getDefaultWorkerName('public', deployEnv);
  const adminWorkerName = trim(process.env.CLOUDFLARE_ADMIN_WORKER_NAME) || getDefaultWorkerName('admin', deployEnv);
  const publicPagesProject = trim(process.env.CLOUDFLARE_PUBLIC_PAGES_PROJECT) || getDefaultPagesProjectName('public', deployEnv);
  const adminPagesProject = trim(process.env.CLOUDFLARE_ADMIN_PAGES_PROJECT) || getDefaultPagesProjectName('admin', deployEnv);

  const publicApiUrl = resolveDerivedUrl({
    explicitUrl: process.env.CLOUDFLARE_PUBLIC_API_URL,
    derivedUrl: workersSubdomain ? buildWorkersUrl(publicWorkerName, workersSubdomain) : '',
    explicitName: 'CLOUDFLARE_PUBLIC_API_URL',
    derivedName: 'CLOUDFLARE_WORKERS_SUBDOMAIN',
  });
  const adminApiUrl = resolveDerivedUrl({
    explicitUrl: process.env.CLOUDFLARE_ADMIN_API_URL,
    derivedUrl: workersSubdomain ? buildWorkersUrl(adminWorkerName, workersSubdomain) : '',
    explicitName: 'CLOUDFLARE_ADMIN_API_URL',
    derivedName: 'CLOUDFLARE_WORKERS_SUBDOMAIN',
  });
  const publicAppUrl = resolveDerivedUrl({
    explicitUrl: process.env.CLOUDFLARE_PUBLIC_APP_URL,
    derivedUrl: buildPagesUrl(publicPagesProject),
    explicitName: 'CLOUDFLARE_PUBLIC_APP_URL',
    derivedName: 'CLOUDFLARE_PUBLIC_PAGES_PROJECT',
  });
  const adminAppUrl = resolveDerivedUrl({
    explicitUrl: process.env.CLOUDFLARE_ADMIN_APP_URL,
    derivedUrl: buildPagesUrl(adminPagesProject),
    explicitName: 'CLOUDFLARE_ADMIN_APP_URL',
    derivedName: 'CLOUDFLARE_ADMIN_PAGES_PROJECT',
  });

  const d1DatabaseId = requireValue('CLOUDFLARE_D1_DATABASE_ID', process.env.CLOUDFLARE_D1_DATABASE_ID);
  const d1DatabaseName =
    trim(process.env.CLOUDFLARE_D1_DATABASE_NAME) || (deployEnv === 'production' ? 'hl-scheduler' : 'hl-scheduler-staging');
  const previewDatabaseId = trim(process.env.CLOUDFLARE_D1_PREVIEW_DATABASE_ID) || d1DatabaseId;
  const allowedAdminEmails = requireValue('CLOUDFLARE_ALLOWED_ADMIN_EMAILS', process.env.CLOUDFLARE_ALLOWED_ADMIN_EMAILS);
  const allowedFromDomain = trim(process.env.CLOUDFLARE_ALLOWED_FROM_DOMAIN) || 'hanlim.com';
  const sharedScheduleId = trim(process.env.CLOUDFLARE_SHARED_SCHEDULE_ID);

  const corsAllowedOrigins = buildCorsOrigins({
    publicAppUrl,
    adminAppUrl,
    extraOrigins: process.env.CLOUDFLARE_EXTRA_CORS_ALLOWED_ORIGINS,
    explicitOrigins: process.env.CLOUDFLARE_CORS_ALLOWED_ORIGINS,
  });

  const sessionCookieDomain =
    trim(process.env.CLOUDFLARE_SESSION_COOKIE_DOMAIN) || (workersSubdomain ? `${workersSubdomain}.workers.dev` : '');

  const sharedWorkerVars = {
    READ_ONLY_MODE: parseFlag(process.env.CLOUDFLARE_READ_ONLY_MODE, '0'),
    ALLOWED_ADMIN_EMAILS: allowedAdminEmails,
    CORS_ALLOWED_ORIGINS: corsAllowedOrigins,
    SHARED_SCHEDULE_ID: sharedScheduleId,
    ALLOWED_FROM_DOMAIN: allowedFromDomain,
    SESSION_TTL_HOURS: trim(process.env.CLOUDFLARE_SESSION_TTL_HOURS) || '12',
    SESSION_COOKIE_SAME_SITE: trim(process.env.CLOUDFLARE_SESSION_COOKIE_SAME_SITE) || 'None',
    AUTH_RATE_LIMIT_WINDOW_SECONDS: trim(process.env.CLOUDFLARE_AUTH_RATE_LIMIT_WINDOW_SECONDS) || '300',
    AUTH_RATE_LIMIT_MAX_ATTEMPTS: trim(process.env.CLOUDFLARE_AUTH_RATE_LIMIT_MAX_ATTEMPTS) || '10',
  };

  if (sessionCookieDomain) {
    sharedWorkerVars.SESSION_COOKIE_DOMAIN = sessionCookieDomain;
  }

  if (trim(process.env.CLOUDFLARE_SESSION_COOKIE_NAME)) {
    sharedWorkerVars.SESSION_COOKIE_NAME = trim(process.env.CLOUDFLARE_SESSION_COOKIE_NAME);
  }

  return {
    deployEnv,
    branchName: deployEnv === 'production' ? 'main' : 'staging',
    d1: {
      databaseId: d1DatabaseId,
      previewDatabaseId: previewDatabaseId,
      databaseName: d1DatabaseName,
    },
    pages: {
      public: {
        projectName: publicPagesProject,
        url: publicAppUrl,
        viteEnv: {
          VITE_APP_ROLE: 'public',
          VITE_PUBLIC_SCHEDULES_API_BASE: publicApiUrl,
          VITE_PUBLIC_SCHEDULES_WRITE_API_BASE: publicApiUrl,
          VITE_AUTH_API_BASE: publicApiUrl,
          VITE_ADMIN_API_BASE: adminApiUrl,
          VITE_PUBLIC_APP_URL: publicAppUrl,
          VITE_ADMIN_APP_URL: adminAppUrl,
          VITE_SHARED_SCHEDULE_ID: sharedScheduleId,
        },
      },
      admin: {
        projectName: adminPagesProject,
        url: adminAppUrl,
        viteEnv: {
          VITE_APP_ROLE: 'admin',
          VITE_PUBLIC_SCHEDULES_API_BASE: adminApiUrl,
          VITE_PUBLIC_SCHEDULES_WRITE_API_BASE: adminApiUrl,
          VITE_AUTH_API_BASE: adminApiUrl,
          VITE_ADMIN_API_BASE: adminApiUrl,
          VITE_PUBLIC_APP_URL: publicAppUrl,
          VITE_ADMIN_APP_URL: adminAppUrl,
          VITE_SHARED_SCHEDULE_ID: sharedScheduleId,
        },
      },
    },
    workers: {
      public: {
        name: publicWorkerName,
        apiUrl: publicApiUrl,
        vars: {
          ...sharedWorkerVars,
          REQUIRE_ACCESS_EMAIL: parseFlag(process.env.CLOUDFLARE_PUBLIC_REQUIRE_ACCESS_EMAIL, '0'),
          ENABLE_ADMIN_ENDPOINTS: parseFlag(process.env.CLOUDFLARE_PUBLIC_ENABLE_ADMIN_ENDPOINTS, '0'),
        },
      },
      admin: {
        name: adminWorkerName,
        apiUrl: adminApiUrl,
        vars: {
          ...sharedWorkerVars,
          REQUIRE_ACCESS_EMAIL: parseFlag(process.env.CLOUDFLARE_ADMIN_REQUIRE_ACCESS_EMAIL, '1'),
          ENABLE_ADMIN_ENDPOINTS: parseFlag(process.env.CLOUDFLARE_ADMIN_ENABLE_ADMIN_ENDPOINTS, '1'),
        },
      },
    },
  };
};
