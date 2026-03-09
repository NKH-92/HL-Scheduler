import { formatDate, toDate, toUtcMidnightMs } from './dates.js';
import { sanitizeTaskDependencies } from './dependencies.js';

export const generateId = () => {
  const cryptoObj = globalThis.crypto;
  if (cryptoObj && typeof cryptoObj.randomUUID === 'function') return cryptoObj.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
};

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
  {
    id: '1',
    category: '기획',
    taskName: '요구사항 분석',
    department: 'PM',
    assignee: '김민수',
    start: '2024-05-01',
    end: '2024-05-09',
    progress: 100,
    memo: '',
    dependencies: [],
  },
  {
    id: '2',
    category: '디자인',
    taskName: 'UI/UX 초안',
    department: '디자인',
    assignee: '이서연',
    start: '2024-05-12',
    end: '2024-05-25',
    progress: 60,
    memo: '',
    dependencies: ['1'],
  },
  {
    id: '3',
    category: '개발',
    taskName: '아키텍처 구성',
    department: '개발',
    assignee: '박준호',
    start: '2024-05-15',
    end: '2024-06-05',
    progress: 45,
    memo: '',
    dependencies: ['1'],
  },
  {
    id: '4',
    category: '개발',
    taskName: 'API 연동',
    department: '개발',
    assignee: '최유진',
    start: '2024-06-01',
    end: '2024-06-20',
    progress: 0,
    memo: '',
    dependencies: ['3'],
  },
  {
    id: '5',
    category: 'QA',
    taskName: '시스템 테스트',
    department: 'QA',
    assignee: '정하늘',
    start: '2024-06-15',
    end: '2024-06-30',
    progress: 0,
    memo: '',
    dependencies: ['4'],
  },
];

export const normalizeTasks = (arr) => {
  if (!Array.isArray(arr)) return [];

  const seen = new Set();
  const baseTasks = arr.map((raw) => {
    const t = raw && typeof raw === 'object' ? raw : {};
    const startRaw = t.start || t.actStart || t.planStart || '';
    const endRaw = t.end || t.actEnd || t.planEnd || '';

    const start = normalizeYmd(startRaw);
    const end = normalizeYmd(endRaw);
    let normalizedStart = start;
    let normalizedEnd = end;

    if (start && end) {
      const startMs = toUtcMidnightMs(start);
      const endMs = toUtcMidnightMs(end);
      if (Number.isFinite(startMs) && Number.isFinite(endMs) && endMs < startMs) {
        normalizedStart = end;
        normalizedEnd = start;
      }
    }

    let id = t.id != null ? String(t.id) : generateId();
    while (seen.has(id)) id = generateId();
    seen.add(id);

    return {
      id,
      category: t.category || '',
      taskName: t.taskName || '',
      department: t.department || '',
      assignee: t.assignee || '',
      assigneeEmail: t.assigneeEmail || t.assignee_email || '',
      assigneePosition: t.assigneePosition || t.assignee_position || t.position || '',
      start: normalizedStart,
      end: normalizedEnd,
      progress: clampProgress(t.progress),
      memo: String(t.memo ?? t.note ?? ''),
      dependencies: t.dependencies ?? t.dependsOn ?? t.predecessors ?? [],
    };
  });

  return sanitizeTaskDependencies(baseTasks);
};

export const normalizeVacations = (arr) => {
  if (!Array.isArray(arr)) return [];
  const seen = new Set();
  return arr
    .map((raw) => {
      const v = raw && typeof raw === 'object' ? raw : {};

      let id = v.id != null ? String(v.id) : generateId();
      while (seen.has(id)) id = generateId();
      seen.add(id);

      const start = normalizeYmd(v.start || v.startDate || '');
      const end = normalizeYmd(v.end || v.endDate || v.start || v.startDate || '');
      let normalizedStart = start;
      let normalizedEnd = end;
      if (start && end) {
        const startMs = toUtcMidnightMs(start);
        const endMs = toUtcMidnightMs(end);
        if (Number.isFinite(startMs) && Number.isFinite(endMs) && endMs < startMs) {
          normalizedStart = end;
          normalizedEnd = start;
        }
      }

      return {
        id,
        title: v.title || v.name || '휴무',
        start: normalizedStart,
        end: normalizedEnd,
      };
    })
    .filter((v) => v.start);
};

export const defaultRangePadding = {
  Day: { before: 15, after: 15 },
  Week: { before: 2, after: 2 },
  Month: { before: 1, after: 1 },
};

export const defaultFitSettings = {
  Day: { enabled: false },
  Week: { enabled: false },
  Month: { enabled: false },
};

export const defaultZoomSettings = {
  Day: 100,
  Week: 100,
  Month: 100,
};

export const newTaskTemplate = () => {
  const today = formatDate(new Date());
  return {
    category: '',
    taskName: '',
    department: '',
    assignee: '',
    assigneeEmail: '',
    assigneePosition: '',
    start: today,
    end: today,
    progress: 0,
    memo: '',
    dependencies: [],
  };
};
