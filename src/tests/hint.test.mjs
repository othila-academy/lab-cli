import { test, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { main } from '../cli.mjs';
import { loadState } from '../config.mjs';
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

const levels = () => endpoint.batches.flatMap((b) => b.events).filter((e) => e.type === 'hint.revealed').map((e) => e.payload.level);

test("révèle les indices dans l'ordre, un par appel, et les remonte", async () => {
  for (const expected of ['indice un', 'indice deux', 'indice trois']) {
    const io = captureIo();
    assert.equal(await main(['hint', 'demo', 'one'], io), 0);
    assert.match(io.lines[0], new RegExp(`^indice \\d/3 : ${expected}$`));
  }
  assert.deepEqual(levels(), [1, 2, 3]);
  assert.equal(loadState().hints['demo/one'], 3);
});

test('au-delà du dernier indice : rappel des trois, aucun évènement', async () => {
  for (let i = 0; i < 3; i += 1) await main(['hint', 'demo', 'one'], captureIo());
  endpoint.batches.length = 0;
  const io = captureIo();
  assert.equal(await main(['hint', 'demo', 'one'], io), 0);
  assert.match(io.lines[0], /déjà révélés/);
  assert.equal(io.lines.length, 4);
  assert.equal(endpoint.batches.length, 0);
});

test('--no-report révèle sans remonter ; usage incomplet → 3', async () => {
  assert.equal(await main(['hint', 'demo', 'one', '--no-report'], captureIo()), 0);
  assert.equal(endpoint.batches.length, 0);
  assert.equal(loadState().hints['demo/one'], 1);
  assert.equal(await main(['hint', 'demo'], captureIo()), 3);
});
