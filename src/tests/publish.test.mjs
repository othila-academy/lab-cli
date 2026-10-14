import { test, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { main } from '../cli.mjs';
import { startFakeEndpoint } from '../test-helpers/fake-endpoint.mjs';
import { captureIo } from '../test-helpers/io.mjs';

// Un dépôt de cours jetable : une copie du cours de fixtures, dont on réécrit le manifeste.
const fixtureRoot = fileURLToPath(new URL('../fixtures/cours/', import.meta.url));
// Les labs importent @othila-academy/lab : le cours jetable reçoit un node_modules où le paquet est ce dépôt.
const packageRoot = fileURLToPath(new URL('../../', import.meta.url));
const fixtureManifest = JSON.parse(readFileSync(path.join(fixtureRoot, '.othila-lab', 'formation.json'), 'utf8'));
let endpoint;
let project;
let originalCwd;
const saved = {};

before(async () => {
  endpoint = await startFakeEndpoint();
  originalCwd = process.cwd();
});
after(async () => {
  process.chdir(originalCwd);
  await endpoint.close();
});
beforeEach(() => {
  for (const name of ['FORMATEUR_KEY', 'OTHILA_LAB_ROOT', 'OTHILA_LAB_URL']) saved[name] = process.env[name];
  project = mkdtempSync(path.join(tmpdir(), 'lab-publish-'));
  cpSync(fixtureRoot, project, { recursive: true });
  mkdirSync(path.join(project, 'node_modules', '@othila-academy'), { recursive: true });
  symlinkSync(packageRoot, path.join(project, 'node_modules', '@othila-academy', 'lab'), 'dir');
  process.chdir(project);
  delete process.env.OTHILA_LAB_ROOT;
  process.env.FORMATEUR_KEY = 'cle-formateur';
  delete process.env.OTHILA_LAB_URL;
  endpoint.formations.length = 0;
});
afterEach(() => {
  process.chdir(originalCwd);
  rmSync(project, { recursive: true, force: true });
  for (const [name, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

const config = (extra) => writeFileSync(path.join(project, '.othila-lab', 'formation.json'), JSON.stringify({ ...fixtureManifest, ...extra }));
const run = async (...argv) => {
  const io = captureIo();
  const code = await main(argv, io);
  return { code, out: io.lines.join('\n'), err: io.errors.join('\n') };
};

test('publie le catalogue du cours sous la formation déclarée, avec la clé formateur', async () => {
  config({ id: 'graphql', title: 'GraphQL' });
  const { code, out } = await run('catalog', '--publish', '--endpoint', endpoint.url);
  assert.equal(code, 0);
  assert.match(out, /formation graphql publiée : 2 lab\(s\), 5 étape\(s\)/);
  const [published] = endpoint.formations;
  assert.equal(published.id, 'graphql');
  assert.equal(published.authorization, 'Bearer cle-formateur');
  assert.equal(published.body.title, 'GraphQL');
  assert.deepEqual(published.body.catalog.map((l) => l.id), ['prise-en-main', 'demo']);
  assert.equal(published.body.catalog[1].seance, 'Séance 0 · Démonstration');
});

test('l’adresse vient de OTHILA_LAB_URL, puis de la configuration, si --endpoint manque', async () => {
  config({ id: 'graphql', title: 'GraphQL', endpoint: 'http://127.0.0.1:9' });
  process.env.OTHILA_LAB_URL = endpoint.url;
  assert.equal((await run('catalog', '--publish')).code, 0);
  assert.equal(endpoint.formations.length, 1);
});

test('sans FORMATEUR_KEY ou sans manifeste : code 3 et la marche à suivre', async () => {
  config({ id: 'graphql', title: 'GraphQL' });
  delete process.env.FORMATEUR_KEY;
  const noKey = await run('catalog', '--publish', '--endpoint', endpoint.url);
  assert.equal(noKey.code, 3);
  assert.match(noKey.err, /FORMATEUR_KEY=… npx lab catalog --publish/);
  process.env.FORMATEUR_KEY = 'cle-formateur';
  rmSync(path.join(project, '.othila-lab', 'formation.json'));
  const noFormation = await run('catalog', '--publish', '--endpoint', endpoint.url);
  assert.equal(noFormation.code, 3);
  assert.match(noFormation.err, /pas de \.othila-lab\/formation\.json/);
  assert.equal(endpoint.formations.length, 0);
});

test('serveur injoignable : code 2 ; clé refusée : code 1', async () => {
  config({ id: 'graphql', title: 'GraphQL' });
  const down = await run('catalog', '--publish', '--endpoint', 'http://127.0.0.1:9');
  assert.equal(down.code, 2);
  assert.match(down.err, /injoignable/);
  const refusing = await startFakeEndpoint({ formationStatus: 401 });
  try {
    const refused = await run('catalog', '--publish', '--endpoint', refusing.url);
    assert.equal(refused.code, 1);
    assert.match(refused.err, /clé formateur refusée/);
  } finally {
    await refusing.close();
  }
});

test('les brouillons, hors du manifeste, ne partent jamais et sont signalés dans le tableau', async () => {
  cpSync(path.join(project, '.othila-lab', 'labs', 'demo'), path.join(project, '.othila-lab', 'labs', 'brouillon'), { recursive: true });
  config({ id: 'graphql', title: 'GraphQL' });
  assert.equal((await run('catalog', '--publish', '--endpoint', endpoint.url)).code, 0);
  assert.deepEqual(endpoint.formations[0].body.catalog.map((l) => l.id), ['prise-en-main', 'demo']);
  const io = captureIo();
  Object.assign(io, { isTTY: true });
  assert.equal(await main(['catalog'], io), 0);
  assert.match(io.lines.join('\n'), /^Hors formation · brouillons, jamais publiés\n {2}brouillon\b/m);
});

test('publication refusée : le détail du serveur est affiché, champ par champ', async () => {
  config({ id: 'graphql', title: 'GraphQL' });
  const refusing = await startFakeEndpoint({ formationStatus: 400 });
  try {
    const refused = await run('catalog', '--publish', '--endpoint', refusing.url);
    assert.equal(refused.code, 1);
    assert.match(refused.err, /publication refusée \(HTTP 400\) : corps invalide : catalog\.0\.steps\.0\.points: Too big/);
  } finally {
    await refusing.close();
  }
});

test('un brouillon cassé ne fait pas échouer le tableau : il est signalé hors formation, avec son erreur', async () => {
  mkdirSync(path.join(project, '.othila-lab', 'labs', 'casse'));
  writeFileSync(path.join(project, '.othila-lab', 'labs', 'casse', 'index.mjs'), "export const title = 'Cassé';\n");
  const io = captureIo();
  Object.assign(io, { isTTY: true });
  assert.equal(await main(['catalog'], io), 0);
  const out = io.lines.join('\n');
  assert.match(out, /^ {2}demo\b/m);
  assert.match(out, /^ {2}casse +illisible : .*doit exporter title et steps/m);
});
