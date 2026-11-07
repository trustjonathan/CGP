import assert from 'node:assert/strict';
import test from 'node:test';
import { unlink } from 'node:fs/promises';
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const output = join(tmpdir(), 'cgp-shared-setup-tests.mjs');
await build({
  entryPoints: ['src/lib/sharedSetup.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile: output,
});
const sharedSetup = await import(pathToFileURL(output).href);
await unlink(output);

function payload({ assessmentName = 'Mid-term test', topicTitle = 'Cell structure' } = {}) {
  return {
    version: 1,
    semesters: [{
      academicYear: '2025/2026',
      semesterNumber: 1,
      courses: [{
        name: 'Biology',
        code: 'BIO 101',
        creditUnits: 3,
        targetGradePoint: 5,
        assessments: [{ name: assessmentName, weight: 40, total: 100 }],
        topics: [{ title: topicTitle }],
      }],
    }],
  };
}

test('ordinary assessment and topic detail is eligible for sharing', () => {
  const setup = payload();
  assert.equal(sharedSetup.isSharedSetupPayload(setup), true);
  assert.deepEqual(
    sharedSetup.getSharedSetupPrivacyIssues(setup, 'Biology setup', true, true),
    [],
  );
});

test('privacy preflight identifies the unsafe detail without returning its value', () => {
  const setup = payload({
    assessmentName: 'Contact student@example.com',
    topicTitle: 'Cell structure',
  });
  const issues = sharedSetup.getSharedSetupPrivacyIssues(setup, 'Biology setup', true, true);
  assert.equal(issues.length, 1);
  assert.match(issues[0].location, /assessment 1 name/);
  assert.match(issues[0].reason, /email address/);
  assert.equal(JSON.stringify(issues).includes('student@example.com'), false);
});

test('optional content is checked only when selected for the share', () => {
  const setup = payload({
    assessmentName: 'Student ID 12345',
    topicTitle: 'Call 123-456-7890',
  });
  assert.deepEqual(
    sharedSetup.getSharedSetupPrivacyIssues(setup, 'Biology setup', false, false),
    [],
  );
  const issues = sharedSetup.getSharedSetupPrivacyIssues(setup, 'Biology setup', true, true);
  assert.equal(issues.length, 2);
  assert.match(issues[0].reason, /identifier/);
  assert.match(issues[1].reason, /phone number/);
});

test('shared payload validation rejects scores, completion state, and unknown fields', () => {
  const scored = payload();
  scored.semesters[0].courses[0].assessments[0].obtained = 20;
  assert.equal(sharedSetup.isSharedSetupPayload(scored), false);

  const completed = payload();
  completed.semesters[0].courses[0].topics[0].completed = true;
  assert.equal(sharedSetup.isSharedSetupPayload(completed), false);
});
