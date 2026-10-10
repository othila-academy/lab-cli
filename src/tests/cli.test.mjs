import { test } from 'node:test';
import assert from 'node:assert/strict';
import { main } from '../cli.mjs';
import { captureIo } from '../test-helpers/io.mjs';

test('sans commande : usage et code 3 ; commande inconnue : code 3', async () => {
  const io = captureIo();
  assert.equal(await main([], io), 3);
  assert.match(io.lines.join('\n'), /lab join/);
  const io2 = captureIo();
  assert.equal(await main(['frobnicate'], io2), 3);
  assert.match(io2.errors.join('\n'), /commande inconnue/);
});

test("--help affiche l'usage et sort en 0", async () => {
  const io = captureIo();
  assert.equal(await main(['--help'], io), 0);
  assert.match(io.lines.join('\n'), /lab check/);
});
