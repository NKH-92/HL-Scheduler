import employeeDirectoryCsv from '../data/employee-directory.csv?raw';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const normalizeText = (value) => String(value ?? '').trim();
const normalizeEmail = (value) => normalizeText(value).toLowerCase();
const normalizeHeader = (value) =>
  normalizeText(value)
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[._-]/g, '');

const splitCsvLine = (line) => {
  const result = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];

    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
        continue;
      }
      inQuotes = !inQuotes;
      continue;
    }

    if (ch === ',' && !inQuotes) {
      result.push(current);
      current = '';
      continue;
    }

    current += ch;
  }

  result.push(current);
  return result.map((cell) => normalizeText(cell));
};

const parseEmployeeDirectory = (csvText) => {
  const lines = String(csvText || '')
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/g)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) return [];
  const header = splitCsvLine(lines[0]);
  const normalizedHeader = header.map((col) => normalizeHeader(col));
  const findColumnIndex = (candidates, { contains = [] } = {}) => {
    const normalizedCandidates = (Array.isArray(candidates) ? candidates : []).map((item) => normalizeHeader(item));
    for (const candidate of normalizedCandidates) {
      const idx = normalizedHeader.indexOf(candidate);
      if (idx >= 0) return idx;
    }

    const normalizedContains = (Array.isArray(contains) ? contains : []).map((item) => normalizeHeader(item));
    if (normalizedContains.length === 0) return -1;
    return normalizedHeader.findIndex((col) => normalizedContains.some((keyword) => keyword && col.includes(keyword)));
  };

  const columnIndex = {
    name: findColumnIndex(['이름', '성명', 'name'], { contains: ['이름', '성명', 'name'] }),
    department: findColumnIndex(['부서', '팀', 'department'], { contains: ['부서', '팀', 'department'] }),
    position: findColumnIndex(['직위', '직책', 'position', 'title'], { contains: ['직위', '직책', 'position', 'title'] }),
    email: findColumnIndex(['e-메일주소', '이메일', '메일주소', 'email', 'e-mail'], {
      contains: ['이메일', '메일', 'email', 'mail'],
    }),
    company: findColumnIndex(['회사', '법인', 'company'], { contains: ['회사', '법인', 'company'] }),
  };

  return lines
    .slice(1)
    .map((line, idx) => {
      const cols = splitCsvLine(line);
      const name = normalizeText(cols[columnIndex.name] ?? '');
      const department = normalizeText(cols[columnIndex.department] ?? '');
      const position = normalizeText(cols[columnIndex.position] ?? '');
      const email = normalizeEmail(cols[columnIndex.email] ?? '');
      const company = normalizeText(cols[columnIndex.company] ?? '');
      const id = `emp-${idx + 1}`;

      if (!name && !email) return null;
      return {
        id,
        name,
        department,
        position,
        email: EMAIL_PATTERN.test(email) ? email : '',
        company,
      };
    })
    .filter(Boolean);
};

const EMPLOYEE_DIRECTORY = Object.freeze(parseEmployeeDirectory(employeeDirectoryCsv));

export const getEmployeeDirectory = () => EMPLOYEE_DIRECTORY;

export const findEmployeeByEmail = (email, directory = EMPLOYEE_DIRECTORY) => {
  const target = normalizeEmail(email);
  if (!target) return null;
  const list = Array.isArray(directory) ? directory : [];
  return list.find((employee) => normalizeEmail(employee?.email) === target) || null;
};
