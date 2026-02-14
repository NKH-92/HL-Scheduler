import assert from 'node:assert/strict';
import { formatDate, parseYmd, toUtcMidnightMs } from '../src/utils/dates.js';
import { normalizeTasks, normalizeVacations } from '../src/utils/data.js';
import { applyDependencyScheduling, findDependencyCycleIds } from '../src/utils/dependencies.js';

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

console.log('sanity-check ok');
