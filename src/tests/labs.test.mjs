import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { formation } from '../config.mjs';
import { catalog, listDrafts, listLabs, loadLab, loadStep, stepDigest } from '../labs.mjs';
import { main } from '../cli.mjs';
import { makeCourse, tinyLab } from '../test-helpers/course.mjs';
import { captureIo } from '../test-helpers/io.mjs';
import * as api from '../index.mjs';

const root = fileURLToPath(new URL('../fixtures/cours/', import.meta.url));
const fixture = formation(root);

// Un cours jetable, le temps d'un test.
async function withCourse(options, fn) {
  const course = makeCourse(options);
  try {
    return await fn(formation(course.root), course);
  } finally {
    course.cleanup();
  }
}
const indexWith = (extra) => ({ ...tinyLab(), 'index.mjs': `export const title = 'A';\nexport const steps = ['s'];\n${extra}\n` });

test('listLabs et loadLab sur le cours de fixtures', async () => {
  assert.deepEqual(listLabs(fixture), [{ id: 'demo', seance: 'Séance 0 · Démonstration' }]);
  const lab = await loadLab('demo', fixture);
  assert.equal(lab.title, 'Lab de démonstration');
  assert.equal(lab.seance, 'Séance 0 · Démonstration');
  assert.deepEqual(lab.steps, ['one']);
  assert.equal(lab.mine, null);
  await assert.rejects(loadLab('absent', fixture), /lab inconnu : absent \(disponibles : prise-en-main, demo\)/);
  await assert.rejects(loadLab('../x', fixture), /lab inconnu/);
});

test("l'ordre est celui du manifeste ; les brouillons sont à part, sans séance", async () => {
  await withCourse({
    labs: { alpha: tinyLab('Alpha'), zeta: tinyLab('Zêta'), brouillon: tinyLab('Brouillon') },
    seances: [{ title: 'Séance 1', labs: ['zeta'] }, { title: 'Séance 2', labs: ['alpha'] }]
  }, async (f) => {
    assert.deepEqual(listLabs(f), [{ id: 'zeta', seance: 'Séance 1' }, { id: 'alpha', seance: 'Séance 2' }]);
    assert.deepEqual(listDrafts(f), ['brouillon']);
    assert.equal((await loadLab('brouillon', f)).seance, null);
    assert.deepEqual((await catalog(f)).labs.map((l) => [l.id, l.seance]), [['prise-en-main', 'Séance 0 · Prise en main'], ['zeta', 'Séance 1'], ['alpha', 'Séance 2']]);
    await assert.rejects(loadLab('absent', f), /disponibles : prise-en-main, zeta, alpha, brouillon/);
  });
});

test("un dossier sans index.mjs ou au nom invalide n'est ni un brouillon ni une erreur", async () => {
  await withCourse({ labs: { a: tinyLab() } }, async (f, course) => {
    mkdirSync(path.join(course.home, 'labs', 'notes'));
    mkdirSync(path.join(course.home, 'labs', '_partage'));
    writeFileSync(path.join(course.home, 'labs', '_partage', 'index.mjs'), '');
    writeFileSync(path.join(course.home, 'labs', 'README.md'), '# labs\n');
    assert.deepEqual(listDrafts(f), []);
    assert.deepEqual((await catalog(f)).labs.map((l) => l.id), ['prise-en-main', 'a']);
  });
});

test('section est refusée : elle a migré dans formation.json', async () => {
  await withCourse({ labs: { a: indexWith("export const section = 'Séance 1';") } }, async (f) => {
    await assert.rejects(loadLab('a', f), /index\.mjs : section a migré dans \.othila-lab\/formation\.json \(seances\)/);
  });
});

test('mine : target relatif à la racine du dépôt, chemin absolu dans mine.path', async () => {
  await withCourse({ labs: { a: indexWith("export const mine = { template: 'mine.template.mjs', target: 'packages/server-js/test/a-mine.check.mjs' };") } }, async (f, course) => {
    const lab = await loadLab('a', f);
    assert.equal(lab.mine.template, 'mine.template.mjs');
    assert.equal(lab.mine.target, 'packages/server-js/test/a-mine.check.mjs');
    assert.equal(lab.mine.path, path.join(course.root, 'packages', 'server-js', 'test', 'a-mine.check.mjs'));
  });
});

test('mine : refusé sans template ni target, avec un target absolu, hors du dépôt, sur la racine ou sans extension de module', async () => {
  for (const mine of ["{ template: 'm.mjs' }", "{ template: 'm.mjs', target: '/tmp/x.mjs' }", "{ template: 'm.mjs', target: '../x.mjs' }", "{ template: 'm.mjs', target: 'a/../../x.mjs' }", "{ template: 'm.mjs', target: '.' }", "{ template: 'm.mjs', target: 'packages' }", "{ template: 'm.mjs', target: 'notes.txt' }"]) {
    await withCourse({ labs: { a: indexWith(`export const mine = ${mine};`) } }, async (f) => {
      await assert.rejects(loadLab('a', f), /mine\.target/);
    });
  }
});

test('loadStep charge checks, hints et prediction ; refuse une étape inconnue', async () => {
  const lab = await loadLab('demo', fixture);
  const step = await loadStep(lab, 'one');
  assert.equal(step.id, 'one');
  assert.equal(step.title, 'Une étape');
  assert.deepEqual(step.checks.map((c) => c.id), ['typename', 'always-fails']);
  assert.equal(step.hints.length, 3);
  assert.equal(step.prediction.expected, '2');
  assert.ok(step.file.endsWith('one.mjs'));
  await assert.rejects(loadStep(lab, 'two'), /étape inconnue : two \(étapes de demo : one\)/);
});

test('stepDigest : 64 hexadécimaux, stable', async () => {
  const lab = await loadLab('demo', fixture);
  const step = await loadStep(lab, 'one');
  assert.match(stepDigest(step.file), /^[0-9a-f]{64}$/);
  assert.equal(stepDigest(step.file), stepDigest(step.file));
});

test('catalog : la forme attendue par create-session, avec la séance', async () => {
  // Le tutoriel fourni par lab-cli ouvre toujours le catalogue (builtin.test.mjs le détaille) ; ici, le lab du cours.
  const { labs } = await catalog(fixture);
  assert.deepEqual(labs.map((l) => l.id), ['prise-en-main', 'demo']);
  assert.deepEqual({ labs: labs.slice(1) }, {
    labs: [{
      id: 'demo',
      title: 'Lab de démonstration',
      seance: 'Séance 0 · Démonstration',
      steps: [{ id: 'one', title: 'Une étape', checks: [{ id: 'typename', label: '__typename répond' }, { id: 'always-fails', label: 'un check qui échoue' }], hasPrediction: true, points: 100 }]
    }]
  });
});

test('lab catalog imprime le JSON du catalogue', async () => {
  process.env.OTHILA_LAB_ROOT = root;
  try {
    const io = captureIo();
    assert.equal(await main(['catalog'], io), 0);
    assert.equal(JSON.parse(io.lines.join('\n')).labs.find((l) => l.id === 'demo').seance, 'Séance 0 · Démonstration');
  } finally {
    delete process.env.OTHILA_LAB_ROOT;
  }
});

test("l'API publique du paquet expose les aides des labs", () => {
  for (const name of ['assert', 'expectData', 'expectErrorCode', 'gql', 'loginAs', 'waitForServer', 'runChecks']) assert.equal(typeof api[name], 'function', name);
});

test('points : 100 par défaut, la valeur de l’étape sinon ; refusée hors de 1 à 1000', async () => {
  const stepWith = (points) => ({ 'index.mjs': "export const title = 'A';\nexport const steps = ['s'];\n", 's.mjs': `export const points = ${points};\nexport const checks = [{ id: 'k', label: 'k', run: async () => {} }];\n` });
  await withCourse({ labs: { a: stepWith(250) } }, async (f) => {
    assert.equal((await loadStep(await loadLab('a', f), 's')).points, 250);
    assert.equal((await catalog(f)).labs.find((l) => l.id === 'a').steps[0].points, 250);
  });
  for (const bad of ['0', '1001', '2.5', "'100'"]) {
    await withCourse({ labs: { a: stepWith(bad) } }, async (f) => {
      await assert.rejects(loadStep(await loadLab('a', f), 's'), /points : entier de 1 à 1000/);
    });
  }
  assert.equal((await loadStep(await loadLab('demo', fixture), 'one')).points, 100);
});
