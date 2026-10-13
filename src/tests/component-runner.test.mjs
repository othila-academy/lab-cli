import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { formation } from '../config.mjs';
import { runVitest } from '../component/runner.mjs';
import { makeCourse, tinyLab } from '../test-helpers/course.mjs';
import { installFakeVitest } from '../test-helpers/fake-vitest.mjs';

let course;
afterEach(() => course?.cleanup());

test('délai dépassé : Vitest arrêté, message commun', async () => {
  course = makeCourse({ labs: { a: tinyLab() }, manifest: { client: { dir: 'client' } } });
  const clientDir = path.join(course.root, 'client');
  mkdirSync(clientDir);
  installFakeVitest(clientDir, { sleepMs: 10000 });
  const started = Date.now();
  const run = await runVitest({ f: formation(course.root), labDir: path.join(course.home, 'labs', 'a'), files: ['t.test.js'], timeoutMs: 300 });
  assert.ok(Date.now() - started < 5000);
  assert.deepEqual(run, { error: 'les tests ont dépassé 0.3 s : un composant attend-il une réponse qui ne vient pas ?' });
});

test('client sans setup : LAB_SETUP vide', async () => {
  course = makeCourse({ labs: { a: tinyLab() }, manifest: { client: { dir: 'client' } } });
  const clientDir = path.join(course.root, 'client');
  mkdirSync(clientDir);
  const vitest = installFakeVitest(clientDir, { files: {} });
  const run = await runVitest({ f: formation(course.root), labDir: path.join(course.home, 'labs', 'a'), files: ['t.test.js'] });
  assert.equal(run.report.testResults.length, 1);
  assert.equal(vitest.calls()[0].env.LAB_SETUP, '');
});
