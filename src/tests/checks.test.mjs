import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatResults, runChecks } from '../checks.mjs';

const check = (id, run, label = id) => ({ id, label, run });

test('runChecks sépare passés et échoués, mesure la durée', async () => {
  const outcome = await runChecks([check('a', async () => {}), check('b', async () => { throw new Error('ko'); })], {});
  assert.deepEqual(outcome.passed, ['a']);
  assert.deepEqual(outcome.failed, [{ id: 'b', label: 'b', message: 'ko' }]);
  assert.ok(outcome.durationMs >= 0);
});

test("un check qui lève autre chose qu'une Error ne fait pas planter la commande", async () => {
  const outcome = await runChecks([
    check('texte', async () => { throw 'juste du texte'; }),
    check('objet', async () => { throw { code: 42 }; }),
    check('long', async () => { throw new Error('x'.repeat(5000)); })
  ], {});
  assert.deepEqual(outcome.failed.map((f) => f.id), ['texte', 'objet', 'long']);
  assert.equal(outcome.failed[0].message, 'juste du texte');
  assert.equal(outcome.failed[1].message, '[object Object]');
  assert.equal(outcome.failed[2].message.length, 1000);
});

test('le contexte est transmis tel quel', async () => {
  let seen;
  await runChecks([check('ctx', async (ctx) => { seen = ctx; })], { url: 'u', state: {} });
  assert.deepEqual(seen, { url: 'u', state: {} });
});

test('formatResults : ✓ et ✗ avec le libellé, message indenté, échec hors liste affiché', () => {
  const checks = [check('a', null, 'A passe'), check('b', null, 'B échoue')];
  const lines = formatResults({ passed: ['a'], failed: [{ id: 'b', label: 'B échoue', message: 'regarde la trace' }, { id: 'server-unreachable', label: 'le serveur répond', message: 'injoignable' }] }, checks);
  assert.deepEqual(lines, ['  ✓ A passe', '  ✗ B échoue', '    regarde la trace', '  ✗ le serveur répond', '    injoignable']);
});
