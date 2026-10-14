import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { formation } from '../config.mjs';
import { runVitest, satisfiesNode } from '../component/runner.mjs';
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

test('satisfiesNode : les plages courantes des engines', () => {
  const range = '^22.12.0 || ^24.0.0 || >=26.0.0';
  assert.equal(satisfiesNode('20.20.2', range), false);
  assert.equal(satisfiesNode('22.12.0', range), true);
  assert.equal(satisfiesNode('24.21.0', range), true);
  assert.equal(satisfiesNode('25.1.0', range), false);
  assert.equal(satisfiesNode('26.3.0', range), true);
  assert.equal(satisfiesNode('20.1.0', '>=18'), true);
  assert.equal(satisfiesNode('20.1.0', '>=18 <20'), false);
  assert.equal(satisfiesNode('20.1.0', '~20.1.0'), true);
  assert.equal(satisfiesNode('20.2.0', '~20.1.0'), false);
  assert.equal(satisfiesNode('20.1.0', 'n’importe quoi'), null);
});

test('Node trop ancien pour le Vitest du cours : le dire avant de lancer', async () => {
  course = makeCourse({ labs: { a: tinyLab() }, manifest: { client: { dir: 'client' } } });
  const clientDir = path.join(course.root, 'client');
  mkdirSync(clientDir);
  const vitest = installFakeVitest(clientDir, { files: {} }, { engines: '>=99.0.0' });
  const run = await runVitest({ f: formation(course.root), labDir: path.join(course.home, 'labs', 'a'), files: ['t.test.js'] });
  assert.deepEqual(run, { error: `vitest 0.0.0-faux demande Node >=99.0.0 (installé : ${process.versions.node}) : change de version de Node` });
  assert.equal(vitest.calls().length, 0);
});

const alive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};
const until = async (condition, ms = 5000) => {
  const end = Date.now() + ms;
  while (!condition() && Date.now() < end) await new Promise((r) => setTimeout(r, 25));
  return condition();
};

test('délai dépassé : les processus de travail de Vitest sont arrêtés avec lui', { skip: process.platform === 'win32' && 'groupe de processus Unix' }, async () => {
  course = makeCourse({ labs: { a: tinyLab() }, manifest: { client: { dir: 'client' } } });
  const clientDir = path.join(course.root, 'client');
  mkdirSync(clientDir);
  const vitest = installFakeVitest(clientDir, { sleepMs: 10000, worker: true });
  await runVitest({ f: formation(course.root), labDir: path.join(course.home, 'labs', 'a'), files: ['t.test.js'], timeoutMs: 500 });
  const { vitest: main, worker } = vitest.pids();
  assert.ok(await until(() => !alive(main) && !alive(worker)), 'Vitest ou son processus de travail tourne encore');
});

test('Ctrl+C pendant les tests : Vitest et ses processus de travail arrêtés, dossier temporaire supprimé, code 130', { skip: process.platform === 'win32' && 'signaux Unix' }, async () => {
  course = makeCourse({ labs: { a: tinyLab() }, manifest: { client: { dir: 'client' } } });
  const clientDir = path.join(course.root, 'client');
  mkdirSync(clientDir);
  const vitest = installFakeVitest(clientDir, { sleepMs: 30000, worker: true });
  const { spawn } = await import('node:child_process');
  const { existsSync } = await import('node:fs');
  const runner = new URL('../component/runner.mjs', import.meta.url).href;
  const config = new URL('../config.mjs', import.meta.url).href;
  const driver = spawn(
    process.execPath,
    ['--input-type=module', '-e', `
      const { runVitest } = await import(${JSON.stringify(runner)});
      const { formation } = await import(${JSON.stringify(config)});
      await runVitest({ f: formation(${JSON.stringify(course.root)}), labDir: ${JSON.stringify(path.join(course.home, 'labs', 'a'))}, files: ['t.test.js'] });
    `],
    { stdio: 'ignore' }
  );
  const exited = new Promise((resolve) => driver.on('exit', (code, signal) => resolve({ code, signal })));
  assert.ok(await until(() => vitest.pids() !== null), 'le faux Vitest n’a pas démarré');
  const out = path.dirname(vitest.calls()[0].args.find((a) => a.startsWith('--outputFile=')).slice('--outputFile='.length));
  driver.kill('SIGINT');
  assert.deepEqual(await exited, { code: 130, signal: null });
  const { vitest: main, worker } = vitest.pids();
  assert.ok(await until(() => !alive(main) && !alive(worker)), 'Vitest ou son processus de travail tourne encore');
  assert.equal(existsSync(out), false, 'le dossier temporaire du rapport reste');
});

test('stopTree sous Windows : taskkill /T /F sur le pid de Vitest, pour emporter ses processus de travail', async () => {
  const { stopTree } = await import('../component/runner.mjs');
  const calls = [];
  stopTree({ pid: 4242, kill: () => calls.push('child.kill') }, { platform: 'win32', runSync: (...args) => calls.push(args) });
  assert.deepEqual(calls, [['taskkill', ['/pid', '4242', '/T', '/F'], { stdio: 'ignore', windowsHide: true }]]);
});
