import assert from 'node:assert/strict';
import { formatDate, parseYmd, toUtcMidnightMs } from '../src/utils/dates.js';
import { normalizeTasks, normalizeVacations } from '../src/utils/data.js';

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

console.log('sanity-check ok');
