import { test, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, appendFileSync } from 'node:fs';
import path from 'node:path';
import { main } from '../cli.mjs';
import { loadState } from '../config.mjs';
import { startFakeEndpoint } from '../test-helpers/fake-endpoint.mjs';
import { startFakeGraphql } from '../test-helpers/fake-graphql.mjs';
import { makeCourse } from '../test-helpers/course.mjs';
import { captureIo } from '../test-helpers/io.mjs';
import { tempLabDir, writeTestSession } from '../test-helpers/tmp.mjs';

// Deux labs jetables : « vert » (deux étapes qui passent) et « rouge » (une étape qui échoue).
const lab = (title, steps) => {
  const files = { 'index.mjs': `export const title = ${JSON.stringify(title)};\nexport const steps = ${JSON.stringify(Object.keys(steps))};\n` };
  for (const [step, passes] of Object.entries(steps)) {
    files[`${step}.mjs`] = `export const title = 'Étape ${step}';\nexport const checks = [{ id: 'k', label: 'k', run: async () => { ${passes ? '' : "throw new Error('ko');"} } }];\n`;
  }
  return files;
};
const course = makeCourse({
  labs: { vert: lab('Tout vert', { a: true, b: true }), rouge: lab('Tout rouge', { x: false }) },
  seances: [{ title: 'Séance 1 · Vert', labs: ['vert'] }, { title: 'Séance 2 · Rouge', labs: ['rouge'] }]
});

let endpoint;
let graphql;
let tmp;
before(async () => {
  endpoint = await startFakeEndpoint();
  graphql = await startFakeGraphql();
  process.env.OTHILA_LAB_ROOT = course.root;
});
after(async () => {
  await endpoint.close();
  await graphql.close();
  delete process.env.OTHILA_LAB_ROOT;
  course.cleanup();
});
beforeEach(() => {
  tmp = tempLabDir();
  writeTestSession(tmp.dir, endpoint.url);
});
afterEach(() => tmp.cleanup());

const run = async (...argv) => {
  const io = captureIo();
  const code = await main(argv, io);
  return { code, out: io.lines.join('\n'), err: io.errors.join('\n') };
};

test('check tout vert : étape validée, la commande de soumission, et l’état local', async () => {
  const { code, out } = await run('check', 'vert', 'a', '--url', graphql.url);
  assert.equal(code, 0);
  assert.match(out, /Étape validée\. Explique en deux phrases pour acquérir 100 points : npx lab submit vert a/);
  assert.deepEqual(loadState().steps['vert/a'], { state: 'vert', passed: 1, total: 1, runs: 1, submitted: false, green: true });
});

test('check en échec : pas d’étape validée, état en échec', async () => {
  const { code, out } = await run('check', 'rouge', '--url', graphql.url);
  assert.equal(code, 1);
  assert.doesNotMatch(out, /Étape validée/);
  assert.deepEqual(loadState().steps['rouge/x'], { state: 'en-echec', passed: 0, total: 1, runs: 1, submitted: false, green: false });
});

test('submit : l’étape suivante, puis la fin du lab avec le commit et le catalogue', async () => {
  await run('check', 'vert', 'a', '--url', graphql.url);
  const first = await run('submit', 'vert', 'a', '--text', 'Parce que.');
  assert.match(first.out, /Étape suivante : npx lab show vert b/);
  assert.equal(loadState().steps['vert/a'].submitted, true);
  const last = await run('submit', 'vert', 'b', '--text', 'Parce que.');
  assert.match(last.out, /Lab terminé\./);
  assert.match(last.out, /git add -A && git commit -m "lab vert"/);
  assert.match(last.out, /npx lab catalog/);
});

test('progress : chaque lab et chaque étape, avec l’état, les checks et les indices', async () => {
  await run('check', 'vert', 'a', '--url', graphql.url);
  await run('submit', 'vert', 'a', '--text', 'Parce que.');
  await run('check', 'rouge', '--url', graphql.url);
  const { code, out } = await run('progress');
  assert.equal(code, 0);
  assert.match(out, /^Progression · session GQL-TEST · Test$/m);
  // L'ordre du manifeste : vert (Séance 1) avant rouge (Séance 2), contre l'ordre alphabétique.
  assert.match(out, /^Séance 1 · Vert\n {2}vert · Tout vert · 100 \/ 200$/m);
  assert.match(out, /^Séance 2 · Rouge\n {2}rouge · Tout rouge · 0 \/ 100$/m);
  assert.ok(out.indexOf('Séance 1 · Vert') < out.indexOf('Séance 2 · Rouge'));
  assert.match(out, /^ {2}rouge · Tout rouge · 0 \/ 100$/m);
  assert.match(out, /^ {4}x +en échec +0\/1 +—\/100$/m);
  assert.match(out, /^ {4}a +soumis +1\/1 +100\/100$/m);
  assert.match(out, /^ {4}b +— +—\/100$/m);
});

test('progress sans session : le dit, et montre quand même l’avancement local', async () => {
  await run('leave');
  const { code, out } = await run('progress');
  assert.equal(code, 0);
  assert.match(out, /^Progression · non connecté à une session$/m);
  assert.match(out, /^ {2}vert · Tout vert · /m);
});

test('leave : envoie ce qui attend, efface le jeton, garde la progression ; deuxième leave sans effet', async () => {
  await run('check', 'vert', 'a', '--url', graphql.url, '--no-report');
  const { code, out } = await run('leave');
  assert.equal(code, 0);
  assert.match(out, /jeton effacé de cette machine/);
  assert.match(out, /npx lab join/);
  assert.equal(existsSync(path.join(tmp.dir, 'session.json')), false);
  assert.equal(loadState().steps['vert/a'].state, 'vert');
  const again = await run('leave');
  assert.equal(again.code, 0);
  assert.match(again.out, /aucune session sur cette machine/);
});

test('leave hors ligne avec des évènements en attente : refus en code 2 ; --force les abandonne', async () => {
  writeTestSession(tmp.dir, 'http://127.0.0.1:9');
  appendFileSync(path.join(tmp.dir, 'outbox.jsonl'), `${JSON.stringify({ id: 'en-attente' })}\n`);
  const refused = await run('leave');
  assert.equal(refused.code, 2);
  assert.match(refused.err, /1 évènement\(s\) en attente/);
  assert.match(refused.err, /lab leave --force/);
  assert.equal(existsSync(path.join(tmp.dir, 'session.json')), true);
  const forced = await run('leave', '--force');
  assert.equal(forced.code, 0);
  assert.equal(existsSync(path.join(tmp.dir, 'session.json')), false);
  assert.equal(existsSync(path.join(tmp.dir, 'outbox.jsonl')), false);
});
