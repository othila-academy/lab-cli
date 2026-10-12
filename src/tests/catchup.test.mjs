import { test, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { main } from '../cli.mjs';
import { makeCourse, tinyLab } from '../test-helpers/course.mjs';
import { isolateGitEnv, publishCourse } from '../test-helpers/git.mjs';
import { captureIo } from '../test-helpers/io.mjs';

let course;
let published;
let restoreEnv;
let originalCwd;
before(() => {
  originalCwd = process.cwd();
  restoreEnv = isolateGitEnv();
});
after(() => {
  process.chdir(originalCwd);
  restoreEnv();
});
afterEach(() => {
  process.chdir(originalCwd);
  for (const dir of [published?.remote, published?.learnerDir]) if (dir) rmSync(dir, { recursive: true, force: true });
  course?.cleanup();
  course = null;
  published = null;
});

// La chaîne publiée : base (code.txt = base), solution/a, solution/b, puis un lab c ajouté sur main après coup.
// L'apprenant a cloné au tout début : il est sur my-project depuis base, sans les tags de solution.
function setup() {
  course = makeCourse({ labs: { a: tinyLab('A'), b: tinyLab('B') } });
  writeFileSync(path.join(course.home, '.gitignore'), 'local/\n');
  writeFileSync(path.join(course.root, 'code.txt'), 'base\n');
  published = publishCourse(course);
  const { author, publish } = published;
  for (const id of ['a', 'b']) {
    writeFileSync(path.join(course.root, 'code.txt'), `solution ${id}\n`);
    publish(`solution ${id}`);
    author('tag', `solution/${id}`);
    author('push', '-q', 'origin', `solution/${id}`);
  }
  mkdirSync(path.join(course.home, 'labs', 'c'), { recursive: true });
  for (const [name, content] of Object.entries(tinyLab('C'))) writeFileSync(path.join(course.home, 'labs', 'c', name), content);
  course.write({ id: 'cours-test', title: 'Cours de test', seances: [{ title: 'S1', labs: ['a', 'b', 'c'] }] });
  publish('lab c');
  process.chdir(published.learnerDir);
  return published;
}

const learnerFile = (...parts) => path.join(published.learnerDir, ...parts);

test('lab catchup : le premier lab repart de base, un autre de la solution du précédent', async () => {
  const { learner } = setup();
  const io = captureIo();
  assert.equal(await main(['catchup', 'b'], io), 0);
  assert.equal(learner('branch', '--show-current'), 'catchup-b');
  assert.equal(readFileSync(learnerFile('code.txt'), 'utf8'), 'solution a\n');
  const out = io.lines.join('\n');
  assert.match(out, /branche catchup-b créée depuis solution\/a ; ta branche my-project reste intacte/);
  assert.match(out, /Ensuite : npm install .*, puis npx lab start b/);

  learner('checkout', '-q', 'my-project');
  assert.equal(await main(['catchup', 'a'], captureIo()), 0);
  assert.equal(learner('branch', '--show-current'), 'catchup-a');
  assert.equal(readFileSync(learnerFile('code.txt'), 'utf8'), 'base\n');
});

test('lab catchup : les définitions sont celles de main, pas celles figées au départ', async () => {
  const { learner } = setup();
  assert.equal(await main(['catchup', 'b'], captureIo()), 0);
  assert.ok(existsSync(learnerFile('.othila-lab', 'labs', 'c', 'index.mjs')), 'le lab c, ajouté après solution/b, est là');
  assert.match(learner('log', '-1', '--format=%s'), /^labs à jour \(main@/);
});

test('lab catchup : la branche quittée reste intacte, une branche existante reçoit un suffixe', async () => {
  const { learner } = setup();
  writeFileSync(learnerFile('mon-travail.txt'), 'à moi\n');
  learner('add', '-A');
  learner('commit', '-q', '-m', 'mon travail');
  const mine = learner('rev-parse', 'my-project');
  assert.equal(await main(['catchup', 'b'], captureIo()), 0);
  learner('checkout', '-q', 'my-project');
  const io = captureIo();
  assert.equal(await main(['catchup', 'b'], io), 0);
  assert.equal(learner('branch', '--show-current'), 'catchup-b-2');
  assert.match(io.lines.join('\n'), /branche catchup-b-2 créée/);
  assert.equal(learner('rev-parse', 'my-project'), mine);
  assert.ok(learner('branch', '--list', 'catchup-b').includes('catchup-b'));
});

test('lab catchup : refus sur arbre modifié, lab inconnu, départ manquant, lab absent', async () => {
  const { learner, author } = setup();
  writeFileSync(learnerFile('brouillon.txt'), 'en cours\n');
  const dirty = captureIo();
  assert.equal(await main(['catchup', 'b'], dirty), 1);
  assert.match(dirty.errors.join('\n'), /l'arbre de travail a des modifications : commite ou mets de côté ton travail avant lab catchup/);
  rmSync(learnerFile('brouillon.txt'));

  const unknown = captureIo();
  assert.equal(await main(['catchup', 'zz'], unknown), 3);
  assert.match(unknown.errors.join('\n'), /lab inconnu : zz.*npx lab update/);

  const usage = captureIo();
  assert.equal(await main(['catchup'], usage), 3);
  assert.match(usage.errors.join('\n'), /usage : lab catchup <lab>/);

  author('push', '-q', 'origin', ':refs/tags/solution/a');
  learner('fetch', '-q', '--prune', '--prune-tags', 'origin');
  const missing = captureIo();
  assert.equal(await main(['catchup', 'b'], missing), 1);
  assert.match(missing.errors.join('\n'), /solution\/a introuvable : le départ du lab b manque/);
  assert.equal(learner('branch', '--show-current'), 'my-project');
});

test('lab catchup : un tag de départ déplacé par le formateur remplace l’ancien', async () => {
  const { learner, author } = setup();
  learner('fetch', '-q', '--tags', 'origin');
  assert.equal(learner('rev-parse', 'solution/a'), author('rev-parse', 'solution/a'));
  // le formateur corrige la solution de a et déplace son tag
  author('checkout', '-q', '-b', 'reprise', 'solution/a');
  writeFileSync(path.join(course.root, 'code.txt'), 'solution a v2\n');
  author('commit', '-q', '-am', 'solution a v2');
  author('tag', '-f', 'solution/a');
  author('push', '-q', '--force', 'origin', 'solution/a');
  author('checkout', '-q', 'main');
  assert.equal(await main(['catchup', 'b'], captureIo()), 0);
  assert.equal(readFileSync(learnerFile('code.txt'), 'utf8'), 'solution a v2\n');
});

test('lab catchup : rappelle npm install, les dépendances du départ peuvent différer', async () => {
  setup();
  const io = captureIo();
  assert.equal(await main(['catchup', 'a'], io), 0);
  assert.match(io.lines.join('\n'), /npm install/);
});
