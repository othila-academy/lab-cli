import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { pointsFor, stepPoints } from '../points.mjs';

const examples = JSON.parse(readFileSync(fileURLToPath(new URL('../../points/exemples.json', import.meta.url)), 'utf8'));

for (const e of examples) {
  test(`règle des points : ${e.name}`, () => {
    assert.equal(stepPoints(e.value, e.events), e.expected);
  });
}

test('pointsFor : malus 0, 10, 25, 50 %, niveau borné à 0..3', () => {
  assert.deepEqual([0, 1, 2, 3].map((level) => pointsFor(200, level)), [200, 180, 150, 100]);
  assert.equal(pointsFor(100, 7), 50);
  assert.equal(pointsFor(100, -1), 100);
});
