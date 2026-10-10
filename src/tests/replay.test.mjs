import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluate } from '../replay.mjs';

const result = (passed, failed, checks) => [{ lab: 'n1', step: 'observe', passed, failed: failed.map((id) => ({ id, label: id, message: 'ko' })), checks }];
const checks = [{ id: 'a', passesOnStart: true }, { id: 'b', passesOnStart: false }];

test('start : a doit passer, b doit échouer', () => {
  assert.deepEqual(evaluate('start', result(['a'], ['b'], checks)), []);
  assert.deepEqual(evaluate('start', result(['a', 'b'], [], checks)), ['n1/observe/b : passe sur start, attendu échoue']);
  assert.deepEqual(evaluate('start', result([], ['a', 'b'], checks)), ['n1/observe/a : échoue sur start, attendu passe']);
});

test('solution : tout doit passer', () => {
  assert.deepEqual(evaluate('solution', result(['a', 'b'], [], checks)), []);
  assert.deepEqual(evaluate('solution', result(['a'], ['b'], checks)), ['n1/observe/b : échoue sur solution, attendu passe']);
});

test('un échec hors liste (serveur injoignable) est une anomalie', () => {
  const r = [{ lab: 'n1', step: 'observe', passed: [], failed: [{ id: 'server-unreachable', label: 'x', message: 'injoignable' }], checks }];
  assert.ok(evaluate('start', r).some((p) => p.includes('server-unreachable : injoignable')));
});
