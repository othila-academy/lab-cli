import { test, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { main } from '../cli.mjs';
import { loadSession } from '../config.mjs';
import { startFakeEndpoint } from '../test-helpers/fake-endpoint.mjs';
import { captureIo } from '../test-helpers/io.mjs';
import { makeCourse, tinyLab } from '../test-helpers/course.mjs';
import { tempLabDir } from '../test-helpers/tmp.mjs';

// La commande pose .othila-lab/.gitignore dans le dossier courant : les tests se placent dans un projet jetable.
let endpoint;
let tmp;
let originalCwd;
before(async () => {
  endpoint = await startFakeEndpoint();
  originalCwd = process.cwd();
});
after(async () => {
  process.chdir(originalCwd);
  await endpoint.close();
});
let project;
beforeEach(() => {
  tmp = tempLabDir();
  project = mkdtempSync(path.join(tmpdir(), 'lab-join-'));
  process.chdir(project);
});
afterEach(() => {
  process.chdir(originalCwd);
  tmp.cleanup();
  rmSync(project, { recursive: true, force: true });
});

test('lab join écrit la config, met le code en majuscules et salue', async () => {
  const io = captureIo();
  assert.equal(await main(['join', '--session', 'gql-test', '--email', 'n@x.fr', '--name', 'Nadia', '--endpoint', endpoint.url], io), 0);
  const config = loadSession();
  assert.equal(config.session, 'GQL-TEST');
  assert.equal(config.token, 'jeton-de-test');
  assert.equal(config.endpoint, endpoint.url);
  assert.equal(config.firstName, 'Nadia');
  assert.match(io.lines.join('\n'), /bienvenue Nadia/);
  // local/ est ajouté au .gitignore de .othila-lab/ ; le .gitignore du projet n'est pas créé.
  assert.equal(readFileSync(path.join(project, '.othila-lab', '.gitignore'), 'utf8'), 'local/\n');
  assert.equal(existsSync(path.join(project, '.gitignore')), false);
  assert.match(io.lines.join('\n'), /local\/ ajouté/);
});

test('les questions sont posées quand les options manquent', async () => {
  const io = captureIo(['GQL-TEST', 'n@x.fr', 'Nadia']);
  assert.equal(await main(['join', '--endpoint', endpoint.url], io), 0);
  assert.equal(loadSession().session, 'GQL-TEST');
});

test('session inconnue : 1 ; endpoint injoignable : 2 ; champs vides : 3', async () => {
  const unknown = await startFakeEndpoint({ join: '404' });
  try {
    const io1 = captureIo();
    assert.equal(await main(['join', '--session', 'X-1', '--email', 'a@b.fr', '--name', 'A', '--endpoint', unknown.url], io1), 1);
    assert.match(io1.errors.join('\n'), /inconnue/);
  } finally {
    await unknown.close(); // sinon un échec d'assertion laisse le serveur ouvert et Node ne sort jamais
  }
  const io2 = captureIo();
  assert.equal(await main(['join', '--session', 'X-1', '--email', 'a@b.fr', '--name', 'A', '--endpoint', 'http://127.0.0.1:1'], io2), 2);
  const io3 = captureIo(['']);
  assert.equal(await main(['join', '--session', 'X-1', '--name', 'A', '--endpoint', endpoint.url], io3), 3);
  assert.equal(loadSession(), null);
});

// Le rattrapage (contrat 4.7) : le join se fait dans un dépôt de cours, avec un état local déjà rempli.
const green = { state: 'vert', passed: 1, total: 1, runs: 1, submitted: false, green: true };
function inCourse(state) {
  const course = makeCourse({ labs: { a: tinyLab('A'), b: tinyLab('B') }, manifest: { endpoint: endpoint.url } });
  process.chdir(course.root);
  if (state) writeFileSync(path.join(tmp.dir, 'state.json'), JSON.stringify(state));
  return course;
}
const joinArgs = () => ['join', '--session', 'gql-test', '--email', 'n@x.fr', '--name', 'Nadia', '--endpoint', endpoint.url];
const restored = (target) => target.batches.flatMap((b) => b.events).filter((e) => e.type === 'step.restored');

test('au join, les étapes déjà faites remontent en step.restored, après la bienvenue', async () => {
  endpoint.batches.length = 0;
  const course = inCourse({ hints: {}, predictions: {}, steps: { 'a/s': green, 'b/s': { ...green, submitted: true, points: 100 } } });
  try {
    const io = captureIo();
    assert.equal(await main(joinArgs(), io), 0);
    const events = restored(endpoint);
    assert.deepEqual(events.map((e) => `${e.lab}/${e.step}`), ['a/s', 'b/s']);
    assert.ok(events.every((e) => e.session === 'GQL-TEST' && e.learner === '00000000-0000-4000-8000-000000000001'));
    assert.equal(endpoint.batches.at(-1).authorization, 'Bearer jeton-de-test');
    const text = io.lines.join('\n');
    assert.match(text, /bienvenue Nadia[\s\S]*2 étape\(s\) déjà faite\(s\) remontée\(s\) au formateur/);
  } finally {
    course.cleanup();
  }
});

test('au join sans state.json : aucun envoi, aucune ligne de rattrapage', async () => {
  endpoint.batches.length = 0;
  const course = inCourse(null);
  try {
    const io = captureIo();
    assert.equal(await main(joinArgs(), io), 0);
    assert.equal(endpoint.batches.length, 0);
    assert.doesNotMatch(io.lines.join('\n'), /remontée/);
  } finally {
    course.cleanup();
  }
});

test('au join hors d’un dépôt de cours : bienvenue, aucun envoi', async () => {
  endpoint.batches.length = 0;
  writeFileSync(path.join(tmp.dir, 'state.json'), JSON.stringify({ steps: { 'a/s': green } }));
  const io = captureIo();
  assert.equal(await main(joinArgs(), io), 0);
  assert.match(io.lines.join('\n'), /bienvenue Nadia/);
  assert.equal(endpoint.batches.length, 0);
});

test('au join, serveur des évènements en panne : le rattrapage reste dans l’outbox, la ligne hors ligne le dit', async () => {
  const down = await startFakeEndpoint({ status: 503 });
  const course = makeCourse({ labs: { a: tinyLab('A'), b: tinyLab('B') } });
  try {
    process.chdir(course.root);
    writeFileSync(path.join(tmp.dir, 'state.json'), JSON.stringify({ steps: { 'a/s': green, 'b/s': green } }));
    const io = captureIo();
    assert.equal(await main(['join', '--session', 'gql-test', '--email', 'n@x.fr', '--name', 'Nadia', '--endpoint', down.url], io), 0);
    assert.match(io.lines.join('\n'), /hors ligne : 2 évènement\(s\) conservé\(s\)/);
    const outbox = readFileSync(path.join(tmp.dir, 'outbox.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
    assert.deepEqual(outbox.map((e) => e.type), ['step.restored', 'step.restored']);
  } finally {
    course.cleanup();
    await down.close();
  }
});
