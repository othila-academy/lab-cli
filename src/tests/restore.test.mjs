import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formation } from '../config.mjs';
import { acquiredLevel, restoreEvents } from '../restore.mjs';
import { makeCourse, tinyLab } from '../test-helpers/course.mjs';

const config = { session: 'S-1', learnerId: '00000000-0000-4000-8000-000000000001' };
const NOW = new Date('2026-10-28T09:00:00.000Z');
const empty = (extra = {}) => ({ hints: {}, predictions: {}, steps: {}, ...extra });

// Un cours de deux labs a et b ; options.labs complète ou remplace.
async function withCourse(labs, fn) {
  const course = makeCourse({ labs: labs ?? { a: tinyLab('A'), b: tinyLab('B') } });
  try {
    return await fn(formation(course.root, { checkVersion: false }));
  } finally {
    course.cleanup();
  }
}

test('acquiredLevel retrouve le niveau d’indice figé à partir des points acquis', () => {
  assert.equal(acquiredLevel(100, 90, 2), 1);
  assert.equal(acquiredLevel(100, undefined, 2), null);
  assert.equal(acquiredLevel(100, 100, 0), 0);
  assert.equal(acquiredLevel(1, 0, 3), 1); // le plus petit niveau qui redonne ces points
  assert.equal(acquiredLevel(100, 42, 0), 0); // aucun niveau ne correspond : hintLevel
});

test('restoreEvents : une étape par trace, dans l’ordre du catalogue, at strictement croissants ; lab retiré ignoré', async () => {
  await withCourse(undefined, async (f) => {
    const state = empty({
      steps: {
        'b/s': { state: 'vert', passed: 1, total: 1, runs: 1, submitted: true, green: true, points: 100 },
        'a/s': { state: 'en-echec', passed: 0, total: 1, runs: 2, submitted: false, green: false },
        'retire/s': { state: 'vert', passed: 1, total: 1, runs: 1, submitted: false, green: true }
      },
      hints: { 'a/s': 2 }
    });
    const events = await restoreEvents({ config, f, state, now: NOW });
    assert.deepEqual(events.map((e) => `${e.lab}/${e.step}`), ['a/s', 'b/s']);
    assert.ok(Date.parse(events[0].at) < Date.parse(events[1].at));
    assert.equal(events[0].at, NOW.toISOString());
    for (const e of events) {
      assert.equal(e.type, 'step.restored');
      assert.equal(e.session, 'S-1');
      assert.equal(e.learner, config.learnerId);
      assert.equal(e.source, 'reporter');
    }
    assert.deepEqual(events[0].payload, { state: 'en-echec', passed: 0, total: 1, runs: 2, submitted: false, hintLevel: 2, acquiredHintLevel: null, prediction: null });
    assert.deepEqual(events[1].payload, { state: 'vert', passed: 1, total: 1, runs: 1, submitted: true, hintLevel: 0, acquiredHintLevel: 0, prediction: null });
  });
});

test('restoreEvents : une prédiction seule donne state aucun, runs 0, et le promptId de l’étape', async () => {
  const predLab = {
    'index.mjs': "export const title = 'P';\nexport const steps = ['s'];\n",
    's.mjs': "export const prediction = { promptId: 'p', question: 'q ?', choices: ['x', 'y'], expected: 'x' };\nexport const checks = [{ id: 'k', label: 'k', run: async () => {} }, { id: 'l', label: 'l', run: async () => {} }];\n"
  };
  await withCourse({ a: predLab }, async (f) => {
    const events = await restoreEvents({ config, f, state: empty({ predictions: { 'a/s': { answer: 'x', correct: true } } }), now: NOW });
    assert.equal(events.length, 1);
    assert.deepEqual(events[0].payload, { state: 'aucun', passed: 0, total: 2, runs: 0, submitted: false, hintLevel: 0, acquiredHintLevel: null, prediction: { promptId: 'p', answer: 'x', correct: true } });
  });
});

test('restoreEvents : la prise en main fait partie du catalogue, en tête', async () => {
  await withCourse(undefined, async (f) => {
    const state = empty({
      steps: {
        'a/s': { state: 'vert', passed: 1, total: 1, runs: 1, submitted: false, green: true },
        'prise-en-main/machine': { state: 'vert', passed: 1, total: 1, runs: 1, submitted: false, green: true }
      }
    });
    const events = await restoreEvents({ config, f, state, now: NOW });
    assert.deepEqual(events.map((e) => `${e.lab}/${e.step}`), ['prise-en-main/machine', 'a/s']);
  });
});

test('restoreEvents : un lab dont une étape ne se charge pas est sauté, les autres sont restaurés', async () => {
  const broken = { 'index.mjs': "export const title = 'Cassé';\nexport const steps = ['s'];\n", 's.mjs': 'throw new Error("module cassé");\n' };
  await withCourse({ a: broken, b: tinyLab('B') }, async (f) => {
    const state = empty({
      steps: {
        'a/s': { state: 'vert', passed: 1, total: 1, runs: 1, submitted: false, green: true },
        'b/s': { state: 'vert', passed: 1, total: 1, runs: 1, submitted: false, green: true }
      }
    });
    const events = await restoreEvents({ config, f, state, now: NOW });
    assert.deepEqual(events.map((e) => `${e.lab}/${e.step}`), ['b/s']);
  });
});

test('restoreEvents : un état vide ne produit rien', async () => {
  await withCourse(undefined, async (f) => {
    assert.deepEqual(await restoreEvents({ config, f, state: empty(), now: NOW }), []);
  });
});
