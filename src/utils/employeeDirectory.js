import employeeDirectoryCsv from '../data/employee-directory.csv?raw';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const normalizeText = (value) => String(value ?? '').trim();
const normalizeEmail = (value) => normalizeText(value).toLowerCase();

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
  const columnIndex = {
    name: header.findIndex((col) => col === '이름'),
    department: header.findIndex((col) => col === '부서'),
    position: header.findIndex((col) => col === '직위'),
    email: header.findIndex((col) => col === 'e-메일주소'),
    company: header.findIndex((col) => col === '회사'),
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
