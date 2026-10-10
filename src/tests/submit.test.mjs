import { test, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { main } from '../cli.mjs';
import { startFakeEndpoint } from '../test-helpers/fake-endpoint.mjs';
import { captureIo } from '../test-helpers/io.mjs';
import { tempLabDir, writeTestSession } from '../test-helpers/tmp.mjs';

let endpoint;
let tmp;
before(async () => {
  endpoint = await startFakeEndpoint();
  process.env.OTHILA_LAB_ROOT = fileURLToPath(new URL('../fixtures/cours/', import.meta.url));
});
after(async () => {
  await endpoint.close();
  delete process.env.OTHILA_LAB_ROOT;
});
beforeEach(() => {
  tmp = tempLabDir();
  writeTestSession(tmp.dir, endpoint.url);
  endpoint.batches.length = 0;
});
afterEach(() => tmp.cleanup());

const submitted = () => endpoint.batches.flatMap((b) => b.events).filter((e) => e.type === 'answer.submitted');

test('--text envoie answer.submitted avec le texte', async () => {
  const io = captureIo();
  assert.equal(await main(['submit', 'demo', 'one', '--text', 'Le résolveur relit tout. DataLoader regroupe.'], io), 0);
  assert.equal(submitted()[0].payload.text, 'Le résolveur relit tout. DataLoader regroupe.');
  assert.equal(submitted()[0].step, 'one');
  assert.match(io.lines.join('\n'), /explication enregistrée/);
});

test("sans --text : lecture ligne à ligne jusqu'à une ligne vide, lignes jointes par un espace", async () => {
  const io = captureIo(['Première phrase.', 'Seconde phrase.', '']);
  assert.equal(await main(['submit', 'demo', 'one'], io), 0);
  assert.equal(submitted()[0].payload.text, 'Première phrase. Seconde phrase.');
});

test("texte vide ou trop long → 3, rien d'envoyé", async () => {
  assert.equal(await main(['submit', 'demo', 'one', '--text', '   '], captureIo()), 3);
  assert.equal(await main(['submit', 'demo', 'one', '--text', 'x'.repeat(2001)], captureIo()), 3);
  assert.equal(endpoint.batches.length, 0);
});
