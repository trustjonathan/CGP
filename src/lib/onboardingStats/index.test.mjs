import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const output = join(tmpdir(), 'cgp-onboarding-stats-tests.mjs');
const typesOutput = join(tmpdir(), 'cgp-onboarding-types-tests.mjs');
await build({
  entryPoints: ['src/lib/onboardingStats/index.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile: output,
});
await build({
  entryPoints: ['src/lib/types.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile: typesOutput,
});
const stats = await import(pathToFileURL(output).href);
const dashboardCalculations = await import(pathToFileURL(typesOutput).href);

function course(id, creditUnits, percentage = null, semesterId = 's1', completed) {
  return {
    id,
    name: id,
    code: '',
    creditUnits,
    targetGradePoint: 0,
    semesterId,
    assessments: percentage === null ? [] : [{
      id: `${id}-a`,
      name: 'Assessment',
      weight: 100,
      obtained: percentage,
      total: 100,
    }],
    topics: [],
    documents: [],
    ...(completed === undefined ? {} : { completed }),
    createdAt: 0,
  };
}

test('course weights use entered credits (worked 4+3+4+3 example)', () => {
  const weights = stats.courseWeights([
    course('one', 4),
    course('two', 3),
    course('three', 4),
    course('four', 3),
  ]);
  assert.deepEqual(weights.map(({ percent }) => Number(percent.toFixed(1))), [28.6, 21.4, 28.6, 21.4]);
});

test('course weights and GPA handle empty and zero-credit input', () => {
  assert.deepEqual(stats.courseWeights([]), []);
  assert.equal(stats.courseWeights([course('zero', 0)]).length, 0);
  assert.equal(stats.semesterGpa([], 's1'), null);
  assert.equal(stats.cumulativeCgpa([]), null);
});

test('partial coverage reports scored courses and excludes invalid scores', () => {
  const coverage = stats.scoreCoverage([
    course('scored', 3, 80),
    course('unscored', 3),
    course('invalid', 3, 110),
  ]);
  assert.deepEqual(coverage, {
    scored: 1,
    total: 3,
    status: 'partial',
    label: '1 of 3 courses scored',
  });
  assert.equal(stats.cumulativeCgpa([course('invalid', 3, -1)]), null);
});

test('semester and cumulative GPA delegate to the configured grade scale', () => {
  const courses = [course('one', 3, 80), course('two', 3, 70, 's2')];
  assert.equal(stats.semesterGpa(courses, 's1'), 5);
  assert.equal(stats.cumulativeCgpa(courses), 4.5);
});

test('provisional onboarding GPA includes incomplete scores while official GPA does not', () => {
  const courses = [
    course('complete', 3, 80, 's1', true),
    course('in-progress', 3, 70, 's1', false),
    course('legacy', 3, 80),
  ];
  assert.equal(stats.semesterGpa(courses, 's1'), 5);
  assert.ok(Math.abs(stats.provisionalSemesterGpa(courses, 's1') - 14 / 3) < 1e-12);
  assert.equal(stats.courseContributions(courses).length, 2);
  assert.equal(stats.provisionalCourseContributions(courses).length, 3);
});

test('required average returns reachable, not reachable, secured, or unavailable', () => {
  assert.deepEqual(stats.requiredAverageForRemaining(4, 10, 35, 10), {
    status: 'reachable',
    average: 4.5,
  });
  assert.deepEqual(stats.requiredAverageForRemaining(5.5, 10, 35, 10), {
    status: 'not reachable',
    average: null,
  });
  assert.deepEqual(stats.requiredAverageForRemaining(3, 10, 40, 4), {
    status: 'already secured',
    average: null,
  });
  assert.deepEqual(stats.requiredAverageForRemaining(4, 10, 35, 0), {
    status: 'not reachable',
    average: null,
  });
  assert.equal(stats.requiredAverageForRemaining(-1, 10, 35, 10), null);
  assert.deepEqual(stats.requiredAverageForRemaining(4, 0, 0, 0), {
    status: 'not reachable',
    average: null,
  });
});

test('honours lookup requires caller-supplied configuration', () => {
  assert.equal(stats.honoursBracketFor(4.5, []), null);
  assert.deepEqual(stats.honoursBracketFor(4.5, [
    { label: 'Configured class', minimum: 4, maximum: 5 },
  ]), { label: 'Configured class', minimum: 4, maximum: 5 });
});

test('configured honours bands include their stated boundary values', () => {
  assert.equal(stats.honoursBracketFor(4.4).label, 'First Class (Honours)');
  assert.equal(stats.honoursBracketFor(4.39).label, 'Second Class Honours (Upper Division)');
  assert.equal(stats.honoursBracketFor(3.6).label, 'Second Class Honours (Upper Division)');
  assert.equal(stats.honoursBracketFor(3.59).label, 'Second Class Honours (Lower Division)');
  assert.equal(stats.honoursBracketFor(2.8).label, 'Second Class Honours (Lower Division)');
  assert.equal(stats.honoursBracketFor(2.79).label, 'Pass');
  assert.equal(stats.honoursBracketFor(2).label, 'Pass');
  assert.equal(stats.honoursBracketFor(1.99), null);
});

test('trajectory series is ordered and only includes explicit projections', () => {
  const semesters = [
    { id: 's2', academicYear: '2025/2026', semesterNumber: 2, createdAt: 2 },
    { id: 's1', academicYear: '2025/2026', semesterNumber: 1, createdAt: 1 },
  ];
  const series = stats.trajectorySeries(semesters, [
    course('first', 3, 80, 's1'),
    course('second', 3, 70, 's2'),
  ], {
    s2: { semesterGpa: 4, cumulativeCgpa: 4.5 },
  });
  assert.deepEqual(series.map(({ semesterId }) => semesterId), ['s1', 's2']);
  assert.equal(series[0].projectedCgpa, null);
  assert.equal(series[1].projectedCgpa, 4.5);
});

test('course contributions use only valid, scored, officially complete results', () => {
  const contributions = stats.courseContributions([
    course('scored', 3, 80),
    course('provisional', 3, 100, 's1', false),
    course('unscored', 3),
    course('invalid', 3, 120),
  ]);
  assert.equal(contributions.length, 1);
  assert.equal(contributions[0].qualityPoints, 15);
  assert.equal(contributions[0].percentOfEnteredQualityPoints, 100);
});

test('summary GPA values match the Dashboard calculation functions', () => {
  const courses = [
    course('first', 3, 80, 's1'),
    course('second', 3, 70, 's1'),
    course('third', 4, 75, 's2'),
  ];
  assert.equal(stats.cumulativeCgpa(courses), dashboardCalculations.cgpa(courses));
  assert.equal(stats.semesterGpa(courses, 's1'), dashboardCalculations.semesterGPA(courses, 's1'));

  const totals = stats.academicTotals(courses);
  const remainingAverage = stats.requiredAverageForRemaining(4.6, totals.credits, totals.qualityPoints, 4);
  assert.equal(remainingAverage.status, 'reachable');
  assert.ok(Math.abs(remainingAverage.average - 4.85) < Number.EPSILON * 16);
});

test('baseline input is parsed and committed as one complete snapshot', () => {
  const partial = stats.parseAcademicBaseline({
    cgpa: '4.20',
    creditsEarned: '',
    semesters: [{ id: 's1', label: 'Year 1 semester 1', gpa: '4.00', credits: '' }],
  });
  assert.equal(partial.cgpa, null);
  assert.equal(partial.creditsEarned, null);
  assert.deepEqual(partial.semesters, []);

  const complete = stats.parseAcademicBaseline({
    cgpa: '4.20',
    creditsEarned: '30',
    semesters: [
      { id: 's1', label: 'Year 1 semester 1', gpa: '4.00', credits: '15' },
      { id: 's2', label: 'Year 1 semester 2', gpa: '4.40', credits: '15' },
    ],
  });
  assert.equal(stats.academicTotals([], complete).cgpa, 4.2);
  assert.equal(stats.academicTotals([], complete).credits, 30);
});

test('baseline semester totals build cumulative history without invented course data', () => {
  const series = stats.trajectoryWithBaseline([], [], {
    cgpa: null,
    creditsEarned: null,
    semesters: [
      { id: 'old-1', label: 'Year 1 semester 1', gpa: 4, credits: 15 },
      { id: 'old-2', label: 'Year 1 semester 2', gpa: 4.4, credits: 15 },
    ],
  });
  assert.deepEqual(series.map(({ cumulativeCgpa }) => cumulativeCgpa), [4, 4.2]);
});
