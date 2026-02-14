const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const normalizeEmail = (value) => String(value || '').trim().toLowerCase();

export const isValidEmail = (value) => EMAIL_PATTERN.test(normalizeEmail(value));

export const parseEmailList = (value) => {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || '').trim()).filter(Boolean);
  }

  return String(value || '')
    .split(/[\s,;]+/g)
    .map((item) => item.trim())
    .filter(Boolean);
};

export const normalizeEmailList = (value) => {
  const unique = new Set();
  const result = [];

  parseEmailList(value).forEach((item) => {
    const email = normalizeEmail(item);
    if (!email || unique.has(email)) return;
    unique.add(email);
    result.push(email);
  });

  return result;
};
