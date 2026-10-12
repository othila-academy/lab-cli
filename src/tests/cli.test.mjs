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

test('--help : le parcours de la chaîne de labs, dans l’ordre où l’apprenant le vit', async () => {
  const io = captureIo();
  assert.equal(await main(['--help'], io), 0);
  const help = io.lines.join('\n');
  const order = ['lab join', 'lab env', 'lab init', 'lab start', 'lab show', 'lab check', 'lab hint', 'lab submit', 'lab progress', 'lab update', 'lab catchup', 'lab leave', 'lab catalog', 'lab replay'];
  const positions = order.map((c) => help.indexOf(`  ${c} `));
  assert.ok(positions.every((p) => p >= 0), `commandes absentes : ${order.filter((_, i) => positions[i] < 0).join(', ')}`);
  assert.deepEqual([...positions].sort((a, b) => a - b), positions);
  assert.match(help, /lab start <lab> +afficher la fiche d'un lab et préparer son gabarit/);
  assert.match(help, /lab replay .* rejouer les labs sur la chaîne base → solution\/<lab> \(formateur\)/);
  assert.doesNotMatch(help, /depuis son tag/);
});
