import { formatDate, toUtcMidnightMs } from './dates.js';
import { getPublicScheduleStatusLabel, normalizePublicScheduleStatus } from './publicScheduleStatus.js';

export const TEAM_LEAD_RISK_FILTERS = [
  { id: 'all', label: '전체 위험도' },
  { id: 'high', label: '고위험' },
  { id: 'delayed', label: '지연' },
  { id: 'today', label: '오늘 마감' },
  { id: 'week', label: '이번 주 마감' },
  { id: 'stale', label: '오래 미갱신' },
  { id: 'holding', label: '보류 중' },
];

const DEFAULT_OVERVIEW = Object.freeze({
  progress: 0,
  startDate: '',
  endDate: '',
  primaryAssignee: '',
  primaryDepartment: '',
  assignees: [],
  departments: [],
  activeTasks: 0,
  completedTasks: 0,
  delayedTasks: 0,
  dueTodayTasks: 0,
  dueThisWeekTasks: 0,
  staleDays: null,
  isDelayed: false,
  isDueToday: false,
  isDueThisWeek: false,
  isStale: false,
  riskLevel: 'none',
  riskLabels: [],
  lastActivityAt: null,
});

export const normalizeBoardOverview = (item) => {
  const raw = item?.overview && typeof item.overview === 'object' ? item.overview : {};
  return {
    ...DEFAULT_OVERVIEW,
    ...raw,
    progress: Number.isFinite(Number(raw.progress)) ? Math.max(0, Math.min(100, Math.round(Number(raw.progress)))) : 0,
    assignees: Array.isArray(raw.assignees) ? raw.assignees.filter(Boolean) : [],
    departments: Array.isArray(raw.departments) ? raw.departments.filter(Boolean) : [],
    activeTasks: Number(raw.activeTasks) || 0,
    completedTasks: Number(raw.completedTasks) || 0,
    delayedTasks: Number(raw.delayedTasks) || 0,
    dueTodayTasks: Number(raw.dueTodayTasks) || 0,
    dueThisWeekTasks: Number(raw.dueThisWeekTasks) || 0,
    staleDays: Number.isFinite(Number(raw.staleDays)) ? Math.max(0, Math.round(Number(raw.staleDays))) : null,
    riskLevel: String(raw.riskLevel || 'none').trim() || 'none',
    riskLabels: Array.isArray(raw.riskLabels) ? raw.riskLabels.filter(Boolean) : [],
    lastActivityAt: Number.isFinite(Number(raw.lastActivityAt)) ? Number(raw.lastActivityAt) : null,
  };
};

export const normalizeBoardActivity = (entries) =>
  (Array.isArray(entries) ? entries : [])
    .map((entry) => ({
      id: String(entry?.id || '').trim(),
      type: String(entry?.type || '').trim(),
      message: String(entry?.message || '').trim(),
      actorEmail: String(entry?.actorEmail || '').trim().toLowerCase(),
      at: Number.isFinite(Number(entry?.at)) ? Number(entry.at) : null,
    }))
    .filter((entry) => entry.message)
    .sort((a, b) => Number(b.at || 0) - Number(a.at || 0));

export const collectTeamLeadFilterOptions = (items) => {
  const assigneeSet = new Set();
  const departmentSet = new Set();

  (Array.isArray(items) ? items : []).forEach((item) => {
    const overview = normalizeBoardOverview(item);
    overview.assignees.forEach((assignee) => assigneeSet.add(String(assignee || '').trim()));
    overview.departments.forEach((department) => departmentSet.add(String(department || '').trim()));
  });

  return {
    assignees: Array.from(assigneeSet).filter(Boolean).sort((a, b) => a.localeCompare(b, 'ko')),
    departments: Array.from(departmentSet).filter(Boolean).sort((a, b) => a.localeCompare(b, 'ko')),
  };
};

export const filterTeamLeadSchedules = (items, { assignee = '', department = '', risk = 'all' } = {}) =>
  (Array.isArray(items) ? items : []).filter((item) => {
    const overview = normalizeBoardOverview(item);

    if (assignee && !overview.assignees.includes(assignee)) return false;
    if (department && !overview.departments.includes(department)) return false;

    switch (risk) {
      case 'high':
        return overview.riskLevel === 'high';
      case 'delayed':
        return overview.isDelayed;
      case 'today':
        return overview.isDueToday;
      case 'week':
        return overview.isDueThisWeek;
      case 'stale':
        return overview.isStale;
      case 'holding':
        return normalizePublicScheduleStatus(item?.status) === 'holding';
      default:
        return true;
    }
  });

export const buildTeamLeadStats = (items) => {
  const safeItems = Array.isArray(items) ? items : [];
  const assigneeStats = new Map();

  const summary = safeItems.reduce(
    (acc, item) => {
      const overview = normalizeBoardOverview(item);
      const status = normalizePublicScheduleStatus(item?.status);

      acc.totalProjects += 1;
      if (status === 'in_progress') acc.inProgress += 1;
      if (status === 'holding') acc.holding += 1;
      if (status === 'closed') acc.closed += 1;
      if (overview.isDelayed) acc.delayed += 1;
      if (overview.isDueToday) acc.dueToday += 1;
      if (overview.isDueThisWeek) acc.dueThisWeek += 1;
      if (overview.isStale) acc.stale += 1;
      acc.progressTotal += overview.progress;

      overview.assignees.forEach((assignee) => {
        const key = String(assignee || '').trim();
        if (!key) return;
        const current = assigneeStats.get(key) || { name: key, projectCount: 0, delayedCount: 0 };
        current.projectCount += 1;
        if (overview.isDelayed) current.delayedCount += 1;
        assigneeStats.set(key, current);
      });

      return acc;
    },
    {
      totalProjects: 0,
      inProgress: 0,
      holding: 0,
      closed: 0,
      delayed: 0,
      dueToday: 0,
      dueThisWeek: 0,
      stale: 0,
      progressTotal: 0,
    },
  );

  return {
    ...summary,
    averageProgress:
      summary.totalProjects > 0 ? Math.round(summary.progressTotal / summary.totalProjects) : 0,
    assigneeStats: Array.from(assigneeStats.values()).sort((a, b) => {
      if (b.projectCount !== a.projectCount) return b.projectCount - a.projectCount;
      return a.name.localeCompare(b.name, 'ko');
    }),
  };
};

export const getRiskToneClass = (overview) => {
  const normalized = normalizeBoardOverview({ overview });
  if (normalized.riskLevel === 'high') return 'border-rose-300 bg-rose-50/60';
  if (normalized.riskLevel === 'medium') return 'border-amber-300 bg-amber-50/60';
  if (normalized.riskLevel === 'low') return 'border-sky-300 bg-sky-50/60';
  return '';
};

export const buildWeeklyReportMarkdown = ({
  folderName = '',
  items = [],
  assigneeFilter = '',
  departmentFilter = '',
  riskFilter = 'all',
  generatedAt = Date.now(),
} = {}) => {
  const stats = buildTeamLeadStats(items);
  const generatedAtLabel = new Date(Number(generatedAt) || Date.now()).toLocaleString();
  const lines = [
    '# 주간 프로젝트 현황 보고서',
    '',
    `- 생성 시각: ${generatedAtLabel}`,
    `- 기준 폴더: ${folderName || '전체'}`,
    `- 담당자 필터: ${assigneeFilter || '전체'}`,
    `- 부서 필터: ${departmentFilter || '전체'}`,
    `- 위험 필터: ${(TEAM_LEAD_RISK_FILTERS.find((item) => item.id === riskFilter) || TEAM_LEAD_RISK_FILTERS[0]).label}`,
    '',
    '## 요약',
    '',
    `- 전체 프로젝트: ${stats.totalProjects}`,
    `- 평균 진행률: ${stats.averageProgress}%`,
    `- 진행 중: ${stats.inProgress}`,
    `- 보류: ${stats.holding}`,
    `- 종료: ${stats.closed}`,
    `- 지연: ${stats.delayed}`,
    `- 오늘 마감: ${stats.dueToday}`,
    `- 이번 주 마감: ${stats.dueThisWeek}`,
    `- 오래 미갱신: ${stats.stale}`,
    '',
    '## 프로젝트 목록',
    '',
  ];

  (Array.isArray(items) ? items : []).forEach((item) => {
    const overview = normalizeBoardOverview(item);
    const risks = overview.riskLabels.length > 0 ? overview.riskLabels.join(', ') : '정상';
    lines.push(`### ${String(item?.name || '').trim() || '제목 없음'}`);
    lines.push(`- 상태: ${getPublicScheduleStatusLabel(item?.status)}`);
    lines.push(`- 담당자: ${overview.primaryAssignee || overview.assignees.join(', ') || '-'}`);
    lines.push(`- 부서: ${overview.primaryDepartment || overview.departments.join(', ') || '-'}`);
    lines.push(`- 진행률: ${overview.progress}%`);
    lines.push(`- 종료예정일: ${overview.endDate || '-'}`);
    lines.push(`- 최근 수정: ${item?.updatedAt ? new Date(item.updatedAt).toLocaleString() : '-'}`);
    lines.push(`- 위험: ${risks}`);
    lines.push(`- Holding 사유: ${String(item?.holdingReason || '').trim() || '-'}`);
    lines.push(`- 다음 액션: ${String(item?.nextAction || '').trim() || '-'}`);
    lines.push('');
  });

  return lines.join('\n');
};

const csvEscape = (value) => {
  const text = String(value ?? '');
  if (!/[",\n]/.test(text)) return text;
  return `"${text.replace(/"/g, '""')}"`;
};

export const buildWeeklyReportCsv = ({
  folderName = '',
  items = [],
  generatedAt = Date.now(),
} = {}) => {
  const header = [
    'folder',
    'generated_at',
    'project_name',
    'status',
    'primary_assignee',
    'departments',
    'progress',
    'due_date',
    'updated_at',
    'risk_level',
    'risk_labels',
    'holding_reason',
    'next_action',
  ];

  const rows = (Array.isArray(items) ? items : []).map((item) => {
    const overview = normalizeBoardOverview(item);
    return [
      folderName || '전체',
      new Date(Number(generatedAt) || Date.now()).toISOString(),
      String(item?.name || '').trim(),
      getPublicScheduleStatusLabel(item?.status),
      overview.primaryAssignee || overview.assignees.join(', '),
      overview.departments.join(', '),
      `${overview.progress}%`,
      overview.endDate || '',
      item?.updatedAt ? new Date(item.updatedAt).toISOString() : '',
      overview.riskLevel,
      overview.riskLabels.join(', '),
      String(item?.holdingReason || '').trim(),
      String(item?.nextAction || '').trim(),
    ];
  });

  return [header, ...rows].map((row) => row.map(csvEscape).join(',')).join('\n');
};

export const summarizeActivityDate = (timestamp) => {
  const value = Number(timestamp);
  if (!Number.isFinite(value)) return '';
  return new Date(value).toLocaleString();
};

export const formatOverviewDate = (value) => {
  if (!value) return '';
  const ms = toUtcMidnightMs(value);
  if (!Number.isFinite(ms)) return '';
  return formatDate(ms);
};
