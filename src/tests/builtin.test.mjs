import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { catalog, catalogLabs, describeLab, listLabs, loadLab } from '../labs.mjs';
import { chainOf } from '../chain.mjs';
import { formation } from '../config.mjs';
import { totals } from '../totals.mjs';
import { makeCourse, tinyLab } from '../test-helpers/course.mjs';

// Les labs fournis par lab-cli : en séance 0 du catalogue, jamais dans la chaîne.
let course;
afterEach(() => course?.cleanup());

test('catalogLabs : prise-en-main en séance 0, puis les labs du manifeste ; listLabs et la chaîne ne le voient pas', () => {
  course = makeCourse({ labs: { a: tinyLab('A') } });
  const f = formation(course.root);
  assert.deepEqual(catalogLabs(f), [{ id: 'prise-en-main', seance: 'Séance 0 · Prise en main' }, { id: 'a', seance: 'Séance 1' }]);
  assert.deepEqual(listLabs(f).map((l) => l.id), ['a']);
  assert.deepEqual(chainOf(f).map((s) => s.lab), ['a']);
});

test('loadLab résout le lab intégré depuis le paquet, marqué builtIn, avec son bac à sable', async () => {
  course = makeCourse({ labs: { a: tinyLab('A') } });
  const lab = await loadLab('prise-en-main', formation(course.root));
  assert.equal(lab.builtIn, true);
  assert.equal(lab.seance, 'Séance 0 · Prise en main');
  assert.deepEqual(lab.sandbox, ['carnet.json']);
  assert.equal((await loadLab('a', formation(course.root))).builtIn, false);
});

test('catalog() (publication, création de session) : le tutoriel en tête, 40 points', async () => {
  course = makeCourse({ labs: { a: tinyLab('A') } });
  const { labs } = await catalog(formation(course.root));
  assert.deepEqual(labs.map((l) => [l.id, l.seance]), [['prise-en-main', 'Séance 0 · Prise en main'], ['a', 'Séance 1']]);
  assert.equal(labs[0].steps.reduce((n, s) => n + s.points, 0), 40);
  assert.equal(labs[0].steps.find((s) => s.id === 'predire').hasPrediction, true);
});

test('totals compte le tutoriel', async () => {
  course = makeCourse({ labs: { a: tinyLab('A') } });
  const sum = await totals(formation(course.root), { steps: {} });
  assert.equal(sum.max, 140);
  assert.equal(sum.labs.get('prise-en-main').max, 40);
});

test('un manifeste qui cite prise-en-main est refusé, avec le conseil de renommer', () => {
  course = makeCourse({ labs: { 'prise-en-main': tinyLab('Copie') } });
  assert.throws(() => formation(course.root), /prise-en-main est un lab fourni par lab-cli : renomme le lab du cours/);
});

test('un dossier de cours prise-en-main non cité : loadLab refuse aussi', async () => {
  course = makeCourse({ labs: { a: tinyLab('A') } });
  mkdirSync(path.join(course.home, 'labs', 'prise-en-main'));
  writeFileSync(path.join(course.home, 'labs', 'prise-en-main', 'index.mjs'), "export const title = 'x';\nexport const steps = ['s'];\n");
  await assert.rejects(loadLab('prise-en-main', formation(course.root)), /prise-en-main est un lab fourni par lab-cli/);
});

test('describeLab du tutoriel : quatre étapes, dans un cours sans lab', async () => {
  course = makeCourse({ labs: {}, seances: [] });
  const lab = await describeLab('prise-en-main', formation(course.root));
  assert.deepEqual(lab.steps.map((s) => s.id), ['machine', 'reparer', 'predire', 'indice']);
});
