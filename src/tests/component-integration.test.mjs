import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { satisfiesNode } from '../component/runner.mjs';
import { main } from '../cli.mjs';
import { captureIo } from '../test-helpers/io.mjs';
import { tempLabDir } from '../test-helpers/tmp.mjs';

// Vitest 5 et jsdom 30 demandent une version récente de Node : ailleurs (Node 20), ces tests sont sautés ; la CI les joue sous Node 24.
const enginesOf = (name) => JSON.parse(readFileSync(new URL(`../../node_modules/${name}/package.json`, import.meta.url), 'utf8')).engines?.node ?? '*';
const supported = ['vitest', 'jsdom'].every((name) => satisfiesNode(process.versions.node, enginesOf(name)) !== false);
const FIXTURE = fileURLToPath(new URL('../fixtures/front/', import.meta.url));

let tmp;
let linkDir;
afterEach(() => {
  tmp?.cleanup();
  if (linkDir) rmSync(linkDir, { recursive: true, force: true });
  linkDir = null;
  delete process.env.OTHILA_LAB_ROOT;
});

const expectBonjour = async () => {
  tmp = tempLabDir();
  const io = captureIo();
  assert.equal(await main(['check', 'bonjour', '--json', '--no-report'], io), 1, io.errors.join('\n'));
  const [{ results }] = io.lines.map((l) => JSON.parse(l));
  const messages = Object.fromEntries(results[0].failed.map((f) => [f.id, f.message]));
  assert.deepEqual({ passed: results[0].passed, messages }, {
    passed: ['affiche'],
    messages: { 'au-revoir': 'Le composant ne dit pas au revoir', absent: 'client/src/Absent.jsx introuvable : as-tu créé ce fichier ?' }
  });
};

test('vrai Vitest : le composant rendu, le message de l’auteur, le fichier absent traduit', { skip: !supported && 'Node ≥ 22.12 requis par Vitest 5' }, async () => {
  process.env.OTHILA_LAB_ROOT = fileURLToPath(new URL('../fixtures/front/', import.meta.url));
  tmp = tempLabDir();
  const io = captureIo();
  assert.equal(await main(['check', 'bonjour', '--json', '--no-report'], io), 1, io.errors.join('\n'));
  const [{ results }] = io.lines.map((l) => JSON.parse(l));
  assert.deepEqual(results[0].passed, ['affiche']);
  const messages = Object.fromEntries(results[0].failed.map((f) => [f.id, f.message]));
  assert.deepEqual(messages, {
    'au-revoir': 'Le composant ne dit pas au revoir',
    absent: 'client/src/Absent.jsx introuvable : as-tu créé ce fichier ?'
  });
});

test('vrai Vitest, racine du cours atteinte par un lien symbolique : mêmes résultats', { skip: !supported && 'version de Node non prise en charge par Vitest ou jsdom' }, async () => {
  linkDir = mkdtempSync(path.join(tmpdir(), 'othila-lien-'));
  const link = path.join(linkDir, 'cours');
  symlinkSync(FIXTURE, link, process.platform === 'win32' ? 'junction' : 'dir');
  process.env.OTHILA_LAB_ROOT = link;
  await expectBonjour();
});
