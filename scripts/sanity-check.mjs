import assert from 'node:assert/strict';
import { formatDate, parseYmd, toUtcMidnightMs } from '../src/utils/dates.js';
import { normalizeTasks, normalizeVacations } from '../src/utils/data.js';
import { applyDependencyScheduling, findDependencyCycleIds } from '../src/utils/dependencies.js';
import { resolvePostAuthNavigation } from '../src/utils/authRedirect.js';
import { resolveImportedProjectName, stripUtf8Bom } from '../src/utils/imports.js';
import { getPublicScheduleStatusLabel, normalizePublicScheduleStatus } from '../src/utils/publicScheduleStatus.js';
import {
  buildTeamLeadStats,
  buildWeeklyReportCsv,
  buildWeeklyReportMarkdown,
  filterTeamLeadSchedules,
  normalizeBoardOverview,
} from '../src/utils/publicSchedulesBoard.js';

const parsed = parseYmd('2024-02-03');
assert.ok(parsed, 'parseYmd should parse valid date');
assert.equal(formatDate(parsed), '2024-02-03');
assert.ok(Number.isFinite(toUtcMidnightMs('2024-02-03')));

const normalizedTasks = normalizeTasks([
  { start: '2024-05-10', end: '2024-05-01', progress: 150 },
  { start: 'invalid', end: '2024-05-02', progress: -5 },
]);
assert.equal(normalizedTasks[0].start, '2024-05-01');
assert.equal(normalizedTasks[0].end, '2024-05-10');
assert.equal(normalizedTasks[0].progress, 100);
assert.equal(normalizedTasks[1].progress, 0);

const normalizedVacations = normalizeVacations([
  { start: '2024-01-03', end: '2024-01-01' },
  { start: '' },
]);
assert.equal(normalizedVacations.length, 1);
assert.equal(normalizedVacations[0].start, '2024-01-01');
assert.equal(normalizedVacations[0].end, '2024-01-03');

const schedulingResult = applyDependencyScheduling([
  { id: 'a', start: '2024-01-01', end: '2024-01-01', dependencies: [] },
  { id: 'b', start: '2023-12-28', end: '2023-12-30', dependencies: ['a'] },
]);
const shiftedTask = schedulingResult.tasks.find((task) => task.id === 'b');
assert.ok(shiftedTask);
assert.equal(shiftedTask.start, '2024-01-02');
assert.equal(shiftedTask.end, '2024-01-04');
assert.ok(schedulingResult.shiftedTaskIds.includes('b'));

const cycleIds = new Set(
  findDependencyCycleIds([
    { id: 'x', dependencies: ['y'] },
    { id: 'y', dependencies: ['x'] },
    { id: 'z', dependencies: [] },
  ]),
);
assert.equal(cycleIds.has('x'), true);
assert.equal(cycleIds.has('y'), true);
assert.equal(cycleIds.has('z'), false);

assert.equal(stripUtf8Bom('\ufeff{"ok":true}'), '{"ok":true}');
assert.equal(resolveImportedProjectName({ sourceName: '공유 일정' }), '공유 일정');
assert.equal(resolveImportedProjectName({ parsedName: '파일 프로젝트', sourceName: '공유 일정' }), '파일 프로젝트');

assert.equal(normalizePublicScheduleStatus('In progress'), 'in_progress');
assert.equal(normalizePublicScheduleStatus('completed'), 'closed');
assert.equal(getPublicScheduleStatusLabel('holding'), 'Holding');

const teamLeadFixtures = [
  {
    id: 'schedule-1',
    name: 'Alpha',
    status: 'in_progress',
    holdingReason: '',
    nextAction: 'QA review',
    updatedAt: Date.UTC(2026, 2, 7),
    overview: {
      progress: 65,
      primaryAssignee: 'Kim',
      primaryDepartment: 'Planning',
      assignees: ['Kim'],
      departments: ['Planning'],
      isDelayed: true,
      isDueToday: false,
      isDueThisWeek: true,
      isStale: false,
      riskLevel: 'high',
      riskLabels: ['지연', '이번 주 마감'],
      endDate: '2026-03-08',
    },
  },
  {
    id: 'schedule-2',
    name: 'Beta',
    status: 'holding',
    holdingReason: '외부 승인 대기',
    nextAction: '승인 요청 재발송',
    updatedAt: Date.UTC(2026, 2, 1),
    overview: {
      progress: 20,
      primaryAssignee: 'Lee',
      primaryDepartment: 'Design',
      assignees: ['Lee'],
      departments: ['Design'],
      isDelayed: false,
      isDueToday: false,
      isDueThisWeek: false,
      isStale: true,
      riskLevel: 'medium',
      riskLabels: ['보류', '오래 미갱신'],
      endDate: '2026-03-20',
    },
  },
];

assert.equal(normalizeBoardOverview(teamLeadFixtures[0]).primaryAssignee, 'Kim');
assert.equal(filterTeamLeadSchedules(teamLeadFixtures, { assignee: 'Kim' }).length, 1);
assert.equal(filterTeamLeadSchedules(teamLeadFixtures, { risk: 'holding' }).length, 1);

const teamLeadStats = buildTeamLeadStats(teamLeadFixtures);
assert.equal(teamLeadStats.totalProjects, 2);
assert.equal(teamLeadStats.inProgress, 1);
assert.equal(teamLeadStats.holding, 1);
assert.equal(teamLeadStats.delayed, 1);
assert.equal(teamLeadStats.stale, 1);
assert.equal(teamLeadStats.averageProgress, 43);

const weeklyMarkdown = buildWeeklyReportMarkdown({
  folderName: '신규사업',
  items: teamLeadFixtures,
  assigneeFilter: '',
  departmentFilter: '',
  riskFilter: 'all',
  generatedAt: Date.UTC(2026, 2, 7, 9, 0, 0),
});
assert.match(weeklyMarkdown, /주간 프로젝트 현황 보고서/);
assert.match(weeklyMarkdown, /Alpha/);
assert.match(weeklyMarkdown, /Holding 사유: 외부 승인 대기/);

const weeklyCsv = buildWeeklyReportCsv({
  folderName: '신규사업',
  items: teamLeadFixtures,
  generatedAt: Date.UTC(2026, 2, 7, 9, 0, 0),
});
assert.match(weeklyCsv, /project_name,status,primary_assignee/);
assert.match(weeklyCsv, /Alpha/);
assert.match(weeklyCsv, /외부 승인 대기/);

assert.deepEqual(
  resolvePostAuthNavigation({
    user: { isAdmin: true },
    appRole: 'admin',
    adminAppUrl: 'https://admin.example.com',
    publicAppUrl: 'https://public.example.com',
  }),
  { action: 'stay', activeMainTab: 'edit', activeEditorTab: 'tasks' },
);
assert.deepEqual(
  resolvePostAuthNavigation({
    user: { isAdmin: false },
    appRole: 'admin',
    adminAppUrl: 'https://admin.example.com',
    publicAppUrl: 'https://public.example.com',
  }),
  { action: 'redirect', url: 'https://public.example.com' },
);

console.log('sanity-check ok');
