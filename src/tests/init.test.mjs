import { test, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { main } from '../cli.mjs';
import { makeCourse, tinyLab } from '../test-helpers/course.mjs';
import { commitAll, gitIn } from '../test-helpers/git.mjs';
import { captureIo } from '../test-helpers/io.mjs';

let course;
let git;
let originalCwd;
before(() => { originalCwd = process.cwd(); });
after(() => process.chdir(originalCwd));
afterEach(() => {
  process.chdir(originalCwd);
  course?.cleanup();
});

// Un cours sur main, tag base posé sur le starter.
function setup(options = { labs: { a: tinyLab('Premier lab'), b: tinyLab('Second lab') } }) {
  course = makeCourse(options);
  writeFileSync(path.join(course.home, '.gitignore'), 'local/\n');
  git = gitIn(course.root);
  git('init', '-q', '-b', 'main');
  commitAll(course.root, 'starter');
  git('tag', 'base');
  process.chdir(course.root);
}

test('lab init : branche my-project depuis base, puis le premier lab à démarrer', async () => {
  setup();
  commitAll(course.root, 'un commit de main après base');
  const io = captureIo();
  assert.equal(await main(['init'], io), 0);
  assert.equal(git('branch', '--show-current'), 'my-project');
  assert.equal(git('rev-parse', 'HEAD'), git('rev-parse', 'base'));
  const out = io.lines.join('\n');
  assert.match(out, /branche my-project créée depuis base/);
  assert.match(out, /Premier lab/);
  assert.match(out, /npx lab start a/);
});

test('lab init --branch : le nom de branche se choisit ; sans valeur, erreur d’usage', async () => {
  setup();
  assert.equal(await main(['init', '--branch', 'nadia'], captureIo()), 0);
  assert.equal(git('branch', '--show-current'), 'nadia');
  git('checkout', '-q', 'main');
  const io = captureIo();
  assert.equal(await main(['init', '--branch'], io), 3);
  assert.match(io.errors.join('\n'), /usage : lab init \[--branch NOM\]/);
});

test('lab init : refuse un arbre modifié, sans créer de branche', async () => {
  setup();
  writeFileSync(path.join(course.root, 'brouillon.txt'), 'en cours');
  const io = captureIo();
  assert.equal(await main(['init'], io), 1);
  assert.match(io.errors.join('\n'), /l'arbre de travail a des modifications : commite ou mets de côté ton travail avant lab init/);
  assert.equal(git('branch', '--list', 'my-project'), '');
  assert.equal(git('branch', '--show-current'), 'main');
});

test('lab init : refuse sans tag base, avec le conseil git fetch --tags', async () => {
  setup();
  git('tag', '-d', 'base');
  const io = captureIo();
  assert.equal(await main(['init'], io), 1);
  assert.match(io.errors.join('\n'), /tag base introuvable : récupère les tags \(git fetch --tags\)/);
});

test('lab init : refuse une branche existante et dit comment y revenir', async () => {
  setup();
  git('branch', 'my-project');
  const io = captureIo();
  assert.equal(await main(['init'], io), 1);
  assert.match(io.errors.join('\n'), /la branche my-project existe déjà : git checkout my-project pour y revenir/);
  assert.equal(git('branch', '--show-current'), 'main');
});

test('lab init : un cours sans lab le dit', async () => {
  setup({ seances: [] });
  const io = captureIo();
  assert.equal(await main(['init'], io), 0);
  assert.equal(git('branch', '--show-current'), 'my-project');
  assert.match(io.lines.join('\n'), /aucun lab pour l'instant : npx lab update quand le formateur en publie/);
});
