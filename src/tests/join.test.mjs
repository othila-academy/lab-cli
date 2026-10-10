import { test, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { main } from '../cli.mjs';
import { loadSession } from '../config.mjs';
import { startFakeEndpoint } from '../test-helpers/fake-endpoint.mjs';
import { captureIo } from '../test-helpers/io.mjs';
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
