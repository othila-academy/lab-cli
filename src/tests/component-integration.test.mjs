import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { main } from '../cli.mjs';
import { captureIo } from '../test-helpers/io.mjs';
import { tempLabDir } from '../test-helpers/tmp.mjs';

// Vitest 5 et jsdom 30 demandent Node ≥ 22.12 : sous Node 20, ce test est sauté (la CI le joue sous Node 24).
const [major, minor] = process.versions.node.split('.').map(Number);
const supported = major > 22 || (major === 22 && minor >= 12);

let tmp;
afterEach(() => {
  tmp?.cleanup();
  delete process.env.OTHILA_LAB_ROOT;
});

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
