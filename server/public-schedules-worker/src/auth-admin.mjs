export const createAuthAdminDomain = ({
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
}) => {
  const utf8 = (value) => new TextEncoder().encode(String(value ?? ''));

  const bytesToHex = (bytesLike) =>
    Array.from(bytesLike instanceof Uint8Array ? bytesLike : new Uint8Array(bytesLike))
      .map((value) => value.toString(16).padStart(2, '0'))
      .join('');

  const hexToBytes = (hex) => {
    const raw = String(hex || '').trim();
    if (!raw || raw.length % 2 !== 0 || /[^0-9a-f]/i.test(raw)) return null;
    const bytes = new Uint8Array(raw.length / 2);
    for (let index = 0; index < raw.length; index += 2) {
      bytes[index / 2] = Number.parseInt(raw.slice(index, index + 2), 16);
    }
    return bytes;
  };

  const randomHex = (size = 16) => {
    const bytes = new Uint8Array(Math.max(1, Number(size) || 16));
    crypto.getRandomValues(bytes);
    return bytesToHex(bytes);
  };

  const constantTimeEqualHex = (left, right) => {
    const a = String(left || '');
    const b = String(right || '');
    const maxLength = Math.max(a.length, b.length);
    let diff = a.length ^ b.length;
    for (let index = 0; index < maxLength; index += 1) {
      diff |= (a.charCodeAt(index) || 0) ^ (b.charCodeAt(index) || 0);
    }
    return diff === 0;
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
      return { ok: constantTimeEqualHex(derived, hashHex) };
    } catch {
      return { ok: false, reason: 'derive_failed' };
    }
  };

  const getSessionTtlHours = (env) => clamp(toInt(env.SESSION_TTL_HOURS, 12), 1, 168);
  const getSessionTtlMs = (env) => getSessionTtlHours(env) * 60 * 60 * 1000;
  const getSessionCookieName = (env) =>
    String(env.SESSION_COOKIE_NAME || SESSION_COOKIE_NAME_DEFAULT).trim() || SESSION_COOKIE_NAME_DEFAULT;
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
    const cookieHeader = String(request.headers.get('cookie') || '');
    const result = new Map();
    if (!cookieHeader) return result;
    cookieHeader.split(';').forEach((pair) => {
      const [name, ...rest] = pair.split('=');
      const key = String(name || '').trim();
      if (!key) return;
      const value = rest.join('=').trim();
      result.set(key, decodeURIComponent(value || ''));
    });
    return result;
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

  const getEmailDomain = (email) => {
    const normalized = normalizeEmail(email);
    const at = normalized.lastIndexOf('@');
    if (at <= 0 || at === normalized.length - 1) return '';
    return normalized.slice(at + 1);
  };

  const isAllowedEmailDomain = (email, env) => {
    const expected = String(env.ALLOWED_FROM_DOMAIN || '').trim().toLowerCase();
    if (!expected) return true;
    return getEmailDomain(email) === expected;
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
      return errorResponse(`비밀번호 길이는 ${MIN_PASSWORD_LENGTH}자 이상 ${MAX_PASSWORD_LENGTH}자 이하여야 합니다.`, {
        status: 400,
      });
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

    return jsonResponse(
      {
        token: session.token,
        expiresAt: session.expiresAt,
        user: mapUserPublic(latestUser),
        permissions: buildUserPermissions(latestUser),
      },
      {
        headers: {
          'Set-Cookie': buildSessionCookie(session.token, env),
        },
      },
    );
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

  return {
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
  };
};
