import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { formation } from '../config.mjs';
import { chainOf, startOf, verifyChain, solutionTag, BASE_TAG } from '../chain.mjs';
import { makeCourse, tinyLab } from '../test-helpers/course.mjs';

let course;
afterEach(() => course?.cleanup());

const git = (...args) => execFileSync('git', args, { cwd: course.root, stdio: 'pipe' }).toString().trim();
const commit = (message) => {
  writeFileSync(path.join(course.root, 'note.txt'), message);
  git('add', '-A');
  git('-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false', 'commit', '-q', '-m', message);
};

// Un cours de trois labs sur deux séances, et sa chaîne sur main : base, puis une solution par lab.
const chainCourse = () => {
  course = makeCourse({
    labs: { a: tinyLab('A'), b: tinyLab('B'), c: tinyLab('C') },
    seances: [{ title: 'S1', labs: ['a', 'b'] }, { title: 'S2', labs: ['c'] }]
  });
  git('init', '-q', '-b', 'main');
  commit('base');
  git('tag', 'base');
  for (const id of ['a', 'b', 'c']) {
    commit(`solution ${id}`);
    git('tag', solutionTag(id));
  }
  return formation(course.root);
};

test('noms des tags : base, solution/<lab>', () => {
  assert.equal(BASE_TAG, 'base');
  assert.equal(solutionTag('n1'), 'solution/n1');
});

test('chainOf : départ = base puis solution du précédent, dans l’ordre de formation.json, séances enchaînées', () => {
  const f = chainCourse();
  assert.deepEqual(chainOf(f), [
    { lab: 'a', start: 'base', solution: 'solution/a' },
    { lab: 'b', start: 'solution/a', solution: 'solution/b' },
    { lab: 'c', start: 'solution/b', solution: 'solution/c' }
  ]);
  assert.equal(startOf('a', f), 'base');
  assert.equal(startOf('c', f), 'solution/b');
  assert.equal(startOf('absent', f), null);
});

test('chainOf : l’ordre est celui du manifeste, pas l’ordre alphabétique des dossiers', () => {
  course = makeCourse({ labs: { a: tinyLab(), b: tinyLab() }, seances: [{ title: 'S', labs: ['b', 'a'] }] });
  assert.deepEqual(chainOf(formation(course.root)).map((s) => [s.lab, s.start]), [['b', 'base'], ['a', 'solution/b']]);
});

test('verifyChain : une chaîne saine ne remonte aucune anomalie', () => {
  const f = chainCourse();
  assert.deepEqual(verifyChain(f, course.root), []);
});

test('verifyChain : un tag de solution manquant est nommé, avec le lab concerné', () => {
  const f = chainCourse();
  git('tag', '-d', 'solution/b');
  assert.deepEqual(verifyChain(f, course.root), ['solution/b introuvable : pose le tag sur le commit de solution du lab b']);
});

test('verifyChain : un tag de solution posé hors de la chaîne casse la chaîne des deux côtés', () => {
  const f = chainCourse();
  git('tag', '-d', 'solution/b');
  // solution/b posé sur une branche parallèle, partie de base
  git('checkout', '-q', '-b', 'ailleurs', 'base');
  commit('ailleurs');
  git('tag', 'solution/b');
  git('checkout', '-q', 'main');
  assert.deepEqual(verifyChain(f, course.root), [
    'solution/a n’est pas un ancêtre de solution/b : la chaîne est cassée entre a et b',
    'solution/b n’est pas un ancêtre de solution/c : la chaîne est cassée entre b et c'
  ]);
});

test('verifyChain : base qui ne précède pas la première solution', () => {
  const f = chainCourse();
  // base déplacé sur un commit qui ne précède pas solution/a
  git('checkout', '-q', '--orphan', 'autre');
  commit('autre départ');
  git('tag', '-f', 'base');
  git('checkout', '-q', 'main');
  assert.deepEqual(verifyChain(f, course.root), ['base n’est pas un ancêtre de solution/a : la chaîne est cassée au départ']);
});

test('verifyChain : une chaîne sans lab ne demande que base', () => {
  course = makeCourse({ seances: [] });
  git('init', '-q', '-b', 'main');
  commit('starter');
  const f = formation(course.root);
  assert.deepEqual(chainOf(f), []);
  assert.deepEqual(verifyChain(f, course.root), ['base introuvable : pose le tag base sur le starter']);
  git('tag', 'base');
  assert.deepEqual(verifyChain(f, course.root), []);
});

test('verifyChain until : seule la chaîne jusqu’au lab demandé compte', () => {
  const f = chainCourse();
  git('tag', '-d', 'solution/c');
  assert.deepEqual(verifyChain(f, course.root, { until: 'b' }), []);
  assert.deepEqual(verifyChain(f, course.root, { until: 'c' }), ['solution/c introuvable : pose le tag sur le commit de solution du lab c']);
});

test('verifyChain : une solution posée hors de main est signalée, même si elle descend de la précédente', () => {
  const f = chainCourse();
  git('tag', '-d', 'solution/c');
  git('checkout', '-q', '-b', 'side', 'solution/b');
  commit('solution c hors de main');
  git('tag', 'solution/c');
  git('checkout', '-q', 'main');
  git('reset', '-q', '--hard', 'solution/b');
  assert.deepEqual(verifyChain(f, course.root), ['solution/c n’est pas sur main : pose le tag sur un commit de main']);
  assert.deepEqual(verifyChain(f, course.root, { until: 'b' }), []);
});
