import http from 'node:http';
import nodemailer from 'nodemailer';

const BIND_HOST = String(process.env.MAIL_RELAY_BIND || '127.0.0.1').trim() || '127.0.0.1';
const BIND_PORT = Math.max(1, Math.min(65535, Number(process.env.MAIL_RELAY_PORT) || 8788));
const RELAY_TOKEN = String(process.env.MAIL_RELAY_TOKEN || '').trim();
const ALLOW_INSECURE_NO_TOKEN = String(process.env.MAIL_RELAY_ALLOW_INSECURE_NO_TOKEN || '').trim() === '1';
const LOOPBACK_HOSTS = new Set(['127.0.0.1', '::1', 'localhost']);

const isLoopbackHost = (value) => LOOPBACK_HOSTS.has(String(value || '').trim().toLowerCase());
const isLoopbackBinding = isLoopbackHost(BIND_HOST);

if (!RELAY_TOKEN && !isLoopbackBinding && !ALLOW_INSECURE_NO_TOKEN) {
  throw new Error(
    'MAIL_RELAY_TOKEN is required when MAIL_RELAY_BIND is not loopback. Set MAIL_RELAY_TOKEN or MAIL_RELAY_ALLOW_INSECURE_NO_TOKEN=1 (not recommended).',
  );
}

const SMTP_HOST = String(process.env.SMTP_HOST || 'omail.hanlim.com').trim() || 'omail.hanlim.com';
const SMTP_PORT = Math.max(1, Math.min(65535, Number(process.env.SMTP_PORT) || 25));
const SMTP_SECURE = String(process.env.SMTP_SECURE || 'false').trim().toLowerCase() === 'true';

const MAX_BODY_BYTES = 1024 * 1024;
const MAX_NOTIFICATION_RECIPIENTS = 50;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const normalizeEmail = (value) => String(value || '').trim().toLowerCase();
const isValidEmail = (value) => EMAIL_PATTERN.test(normalizeEmail(value));

const normalizeEmailList = (value) => {
  const source = Array.isArray(value) ? value : [];
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

const sendJson = (res, statusCode, payload) => {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
};

const readJson = (req) =>
  new Promise((resolve, reject) => {
    let total = 0;
    const chunks = [];

    req.on('data', (chunk) => {
      total += chunk.length;
      if (total > MAX_BODY_BYTES) {
        reject(new Error('Payload too large.'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });

    req.on('end', () => {
      if (chunks.length === 0) {
        resolve(null);
        return;
      }
      try {
        const text = Buffer.concat(chunks).toString('utf8');
        resolve(JSON.parse(text));
      } catch {
        reject(new Error('Invalid JSON.'));
      }
    });

    req.on('error', reject);
  });

const formatKstDateTime = (value) => {
  const date = typeof value === 'number' ? new Date(value) : new Date(String(value || ''));
  if (Number.isNaN(date.getTime())) return String(value || '');
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(date);
};

const buildSubject = (projectName) => `[Scheduler] 일정 업데이트 알림 - ${projectName}`;

const buildPlainText = ({ projectName, updatedByEmail, updatedAt }) => {
  return [
    '일정이 업데이트되었습니다.',
    '',
    `[프로젝트명]: ${projectName}`,
    `[수정자]: ${updatedByEmail}`,
    `[수정시각]: ${formatKstDateTime(updatedAt)}`,
    '',
    '감사합니다.',
  ].join('\n');
};

const transporter = nodemailer.createTransport({
  host: SMTP_HOST,
  port: SMTP_PORT,
  secure: SMTP_SECURE,
  auth: undefined,
});

const server = http.createServer(async (req, res) => {
  try {
    const { method, url = '' } = req;

    if (method === 'GET' && url === '/healthz') {
      sendJson(res, 200, { ok: true });
      return;
    }

    if (method !== 'POST' || url !== '/notify/schedule-updated') {
      sendJson(res, 404, { error: 'Not found' });
      return;
    }

    if (RELAY_TOKEN) {
      const authHeader = String(req.headers.authorization || '').trim();
      if (authHeader !== `Bearer ${RELAY_TOKEN}`) {
        sendJson(res, 401, { error: 'Unauthorized' });
        return;
      }
    } else if (!isLoopbackBinding && !ALLOW_INSECURE_NO_TOKEN) {
      sendJson(res, 503, { error: 'Relay token is required by server configuration.' });
      return;
    }

    const payload = await readJson(req);
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      sendJson(res, 400, { error: 'Payload must be an object.' });
      return;
    }

    const projectName = String(payload.projectName || '').trim();
    const updatedByEmail = normalizeEmail(payload.updatedByEmail);
    const recipients = normalizeEmailList(payload.recipients);
    const updatedAt = payload.updatedAt ?? new Date().toISOString();

    if (!projectName) {
      sendJson(res, 400, { error: 'projectName is required.' });
      return;
    }
    if (!updatedByEmail || !isValidEmail(updatedByEmail)) {
      sendJson(res, 400, { error: 'updatedByEmail is required and must be a valid email.' });
      return;
    }
    if (recipients.length === 0) {
      sendJson(res, 400, { error: 'recipients must include at least one valid email.' });
      return;
    }
    if (recipients.length > MAX_NOTIFICATION_RECIPIENTS) {
      sendJson(res, 400, { error: `Too many recipients (max ${MAX_NOTIFICATION_RECIPIENTS}).` });
      return;
    }
    if (recipients.some((email) => !isValidEmail(email))) {
      sendJson(res, 400, { error: 'recipients contains invalid email address.' });
      return;
    }

    const message = {
      from: updatedByEmail,
      to: recipients.join(','),
      subject: buildSubject(projectName),
      text: buildPlainText({ projectName, updatedByEmail, updatedAt }),
    };

    const result = await transporter.sendMail(message);
    sendJson(res, 200, {
      ok: true,
      messageId: result?.messageId || null,
      recipientCount: recipients.length,
    });
  } catch (error) {
    const message = error?.message || String(error);
    console.error('mail relay error', message);
    sendJson(res, 500, { error: message });
  }
});

server.listen(BIND_PORT, BIND_HOST, () => {
  console.log(`mail relay listening on http://${BIND_HOST}:${BIND_PORT}`);
  console.log(`smtp target: ${SMTP_HOST}:${SMTP_PORT} (secure=${SMTP_SECURE})`);
  if (RELAY_TOKEN) {
    console.log('auth mode: bearer token required');
  } else if (ALLOW_INSECURE_NO_TOKEN) {
    console.warn('auth mode: disabled by MAIL_RELAY_ALLOW_INSECURE_NO_TOKEN=1');
  } else {
    console.log('auth mode: no token (loopback binding only)');
  }
});
