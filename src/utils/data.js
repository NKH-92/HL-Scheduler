import { formatDate, toDate } from './dates';

const normalizeYmd = (value) => {
  const d = toDate(value);
  return d ? formatDate(d) : '';
};

const clampProgress = (value) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, n));
};

export const INITIAL_TASKS = [
  { id: 1, category: '기획', taskName: '요구사항 분석', department: '기획팀', assignee: '김기획', start: '2024-05-01', end: '2024-05-09', progress: 100 },
  { id: 2, category: '디자인', taskName: 'UI/UX 시안 제작', department: '디자인팀', assignee: '이디자', start: '2024-05-12', end: '2024-05-25', progress: 60 },
  { id: 3, category: '개발', taskName: '프론트엔드 구조 설계', department: '개발팀', assignee: '박개발', start: '2024-05-15', end: '2024-06-05', progress: 45 },
  { id: 4, category: '개발', taskName: 'API 연동', department: '개발팀', assignee: '최서버', start: '2024-06-01', end: '2024-06-20', progress: 0 },
  { id: 5, category: '테스트', taskName: '단위 테스트', department: 'QA팀', assignee: '정테스', start: '2024-06-15', end: '2024-06-30', progress: 0 },
];

export const normalizeTasks = (arr) => {
  if (!Array.isArray(arr)) return [];
  return arr.map((t, idx) => {
    const startRaw = t.start || t.actStart || t.planStart || '';
    const endRaw = t.end || t.actEnd || t.planEnd || '';

    const start = normalizeYmd(startRaw);
    const end = normalizeYmd(endRaw);

    return {
      id: (t.id ?? Date.now() + idx),
      category: t.category || '',
      taskName: t.taskName || '',
      department: t.department || '',
      assignee: t.assignee || '',
      start,
      end,
      progress: clampProgress(t.progress),
    };
  });
};

export const normalizeVacations = (arr) => {
  if (!Array.isArray(arr)) return [];
  return arr
    .map((v, idx) => ({
      id: (v.id ?? Date.now() + idx),
      title: v.title || v.name || '휴가',
      start: normalizeYmd(v.start || v.startDate || ''),
      end: normalizeYmd(v.end || v.endDate || v.start || v.startDate || ''),
    }))
    .filter((v) => v.start);
};

export const defaultRangePadding = {
  Day: { before: 15, after: 15 },
  Week: { before: 2, after: 2 },
  Month: { before: 1, after: 1 },
};

export const defaultFitSettings = {
  Day: { enabled: false, pages: 1 },
  Week: { enabled: false, pages: 1 },
  Month: { enabled: false, pages: 1 },
};

export const newTaskTemplate = () => {
  const today = formatDate(new Date());
  return { category: '', taskName: '', department: '', assignee: '', start: today, end: today, progress: 0 };
};
