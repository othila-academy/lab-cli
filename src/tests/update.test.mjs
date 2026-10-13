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
  if (course) {
    for (const dir of [published?.remote, published?.learnerDir]) if (dir) rmSync(dir, { recursive: true, force: true });
    course.cleanup();
  }
  course = null;
  published = null;
});

const manifest = (labs) => ({ id: 'cours-test', title: 'Cours de test', seances: labs.length ? [{ title: 'S1', labs }] : [] });

// Le cours de l'auteur avec un lab a, publié ; l'apprenant est sur my-project, dans son clone.
function setup() {
  course = makeCourse({ labs: { a: tinyLab('A') } });
  writeFileSync(path.join(course.home, '.gitignore'), 'local/\n');
  writeFileSync(path.join(course.root, '.gitignore'), 'node_modules/\n');
  writeFileSync(path.join(course.root, 'package.json'), JSON.stringify({ private: true, devDependencies: { '@othila-academy/lab': '0.8.0' } }));
  published = publishCourse(course);
  installedLab(published.learnerDir, '0.8.0');
  process.chdir(published.learnerDir);
  return published;
}

// Le paquet tel que npm install le pose chez l'apprenant : seule sa version compte ici.
function installedLab(dir, version) {
  const pkg = path.join(dir, 'node_modules', '@othila-academy', 'lab');
  mkdirSync(pkg, { recursive: true });
  writeFileSync(path.join(pkg, 'package.json'), JSON.stringify({ name: '@othila-academy/lab', version }));
}

const learnerFile = (...parts) => path.join(published.learnerDir, ...parts);
const addLab = (id, title) => {
  mkdirSync(path.join(course.home, 'labs', id), { recursive: true });
  for (const [name, content] of Object.entries(tinyLab(title))) writeFileSync(path.join(course.home, 'labs', id, name), content);
};

test('lab update : un lab ajouté sur main arrive chez l’apprenant, dans un commit à part', async () => {
  const { learner, publish } = setup();
  addLab('b', 'B');
  course.write(manifest(['a', 'b']));
  publish('lab b');
  const io = captureIo();
  assert.equal(await main(['update'], io), 0);
  assert.ok(existsSync(learnerFile('.othila-lab', 'labs', 'b', 'index.mjs')));
  assert.match(learner('log', '-1', '--format=%s'), /^labs à jour \(main@[0-9a-f]{7,}\)$/);
  assert.deepEqual(learner('show', '--name-only', '--format=', 'HEAD').split('\n').sort(), ['.othila-lab/formation.json', '.othila-lab/labs/b/index.mjs', '.othila-lab/labs/b/s.mjs']);
  assert.equal(learner('branch', '--show-current'), 'my-project');
  assert.match(io.lines.join('\n'), /labs mis à jour/);
});

test('lab update : une consigne modifiée et un lab retiré suivent main', async () => {
  const { publish } = setup();
  addLab('b', 'B');
  course.write(manifest(['a', 'b']));
  publish('lab b');
  assert.equal(await main(['update'], captureIo()), 0);
  writeFileSync(path.join(course.home, 'labs', 'b', 'index.mjs'), "export const title = 'B revu';\nexport const steps = ['s'];\n");
  rmSync(path.join(course.home, 'labs', 'a'), { recursive: true });
  course.write(manifest(['b']));
  publish('a retiré, b revu');
  assert.equal(await main(['update'], captureIo()), 0);
  assert.match(readFileSync(learnerFile('.othila-lab', 'labs', 'b', 'index.mjs'), 'utf8'), /B revu/);
  assert.equal(existsSync(learnerFile('.othila-lab', 'labs', 'a')), false);
});

test('lab update : le travail de l’apprenant, commité ou non, et son état local restent tels quels', async () => {
  const { learner, publish } = setup();
  // du code commité, un fichier modifié non commité, un fichier indexé non commité, l'état local
  mkdirSync(learnerFile('packages'), { recursive: true });
  writeFileSync(learnerFile('packages', 'server.js'), 'v1\n');
  learner('add', '-A');
  learner('commit', '-q', '-m', 'mon serveur');
  writeFileSync(learnerFile('packages', 'server.js'), 'v2 en cours\n');
  writeFileSync(learnerFile('packages', 'schema.graphql'), 'type Query\n');
  learner('add', 'packages/schema.graphql');
  mkdirSync(learnerFile('.othila-lab', 'local'), { recursive: true });
  writeFileSync(learnerFile('.othila-lab', 'local', 'state.json'), '{"progress":1}');
  addLab('b', 'B');
  course.write(manifest(['a', 'b']));
  publish('lab b');

  assert.equal(await main(['update'], captureIo()), 0);
  assert.equal(readFileSync(learnerFile('packages', 'server.js'), 'utf8'), 'v2 en cours\n');
  assert.equal(readFileSync(learnerFile('.othila-lab', 'local', 'state.json'), 'utf8'), '{"progress":1}');
  assert.deepEqual(learner('status', '--porcelain').split('\n').sort(), [' M packages/server.js', 'A  packages/schema.graphql']);
  assert.equal(learner('show', '--name-only', '--format=', 'HEAD').includes('packages/'), false);
  assert.equal(learner('log', '-1', '--format=%s', 'HEAD~1'), 'mon serveur');
});

test('lab update : rien de neuf, aucun commit', async () => {
  const { learner } = setup();
  const head = learner('rev-parse', 'HEAD');
  const io = captureIo();
  assert.equal(await main(['update'], io), 0);
  assert.match(io.lines.join('\n'), /labs déjà à jour/);
  assert.equal(learner('rev-parse', 'HEAD'), head);
});

test('lab update : hors ligne, la dernière référence récupérée sert, et la commande le dit', async () => {
  const { learner } = setup();
  learner('remote', 'set-url', 'origin', path.join(published.learnerDir, 'introuvable.git'));
  const io = captureIo();
  assert.equal(await main(['update'], io), 0);
  assert.match(io.lines.join('\n'), /hors ligne : labs de la dernière référence récupérée \(origin\/main@[0-9a-f]{7,}\)/);
});

test('lab update : hors ligne sans référence locale, code 2 ; référence introuvable en ligne, code 1', async () => {
  const { learner } = setup();
  learner('update-ref', '-d', 'refs/remotes/origin/main');
  learner('remote', 'set-url', 'origin', path.join(published.learnerDir, 'introuvable.git'));
  const offline = captureIo();
  assert.equal(await main(['update'], offline), 2);
  assert.match(offline.errors.join('\n'), /origin\/main introuvable : vérifie le remote du cours \(git remote -v\)/);
  learner('remote', 'set-url', 'origin', published.remote);
  course.write({ ...manifest(['a']), reference: { branch: 'absente' } });
  writeFileSync(learnerFile('.othila-lab', 'formation.json'), JSON.stringify({ ...manifest(['a']), reference: { branch: 'absente' } }));
  const online = captureIo();
  assert.equal(await main(['update'], online), 1);
  assert.match(online.errors.join('\n'), /origin\/absente introuvable/);
});

test('lab update : une autre version du paquet sur main est annoncée, pas installée', async () => {
  const { publish } = setup();
  writeFileSync(path.join(course.root, 'package.json'), JSON.stringify({ private: true, devDependencies: { '@othila-academy/lab': '0.9.0' } }));
  publish('lab 0.9.0');
  const io = captureIo();
  assert.equal(await main(['update'], io), 0);
  assert.match(io.lines.join('\n'), /le cours utilise @othila-academy\/lab 0\.9\.0 \(installé : 0\.8\.0\) : npm install --save-dev --save-exact @othila-academy\/lab@0\.9\.0/);
  assert.equal(JSON.parse(readFileSync(learnerFile('node_modules', '@othila-academy', 'lab', 'package.json'), 'utf8')).version, '0.8.0');
});

test('lab update : une référence sans .othila-lab/ est refusée, rien n’est effacé', async () => {
  const { learner, author } = setup();
  author('checkout', '-q', '--orphan', 'vide');
  author('rm', '-rq', '--cached', '.');
  writeFileSync(path.join(course.root, 'autre.txt'), 'autre\n');
  author('add', 'autre.txt');
  author('commit', '-q', '-m', 'branche sans cours');
  author('push', '-q', 'origin', 'vide');
  const head = learner('rev-parse', 'HEAD');
  writeFileSync(learnerFile('.othila-lab', 'formation.json'), JSON.stringify({ ...manifest(['a']), reference: { branch: 'vide' } }));
  learner('commit', '-q', '-am', 'référence vide');
  const io = captureIo();
  assert.equal(await main(['update'], io), 1);
  assert.match(io.errors.join('\n'), /origin\/vide n'a pas de \.othila-lab\/formation\.json/);
  assert.ok(existsSync(learnerFile('.othila-lab', 'formation.json')));
  assert.notEqual(learner('rev-parse', 'HEAD'), head);
  assert.equal(learner('log', '-1', '--format=%s'), 'référence vide');
});

test('lab update : un état local suivi par erreur (git add -f) n’est ni supprimé ni commité', async () => {
  const { learner, publish } = setup();
  mkdirSync(learnerFile('.othila-lab', 'local'), { recursive: true });
  writeFileSync(learnerFile('.othila-lab', 'local', 'state.json'), '{"progress":2}');
  learner('add', '-f', '.othila-lab/local/state.json');
  learner('commit', '-q', '-m', 'oups');
  addLab('b', 'B');
  course.write(manifest(['a', 'b']));
  publish('lab b');
  assert.equal(await main(['update'], captureIo()), 0);
  assert.equal(readFileSync(learnerFile('.othila-lab', 'local', 'state.json'), 'utf8'), '{"progress":2}');
  assert.equal(learner('show', '--name-only', '--format=', 'HEAD').includes('local/'), false);
  assert.ok(existsSync(learnerFile('.othila-lab', 'labs', 'b', 'index.mjs')));
});

test('lab update : un manifeste qui exige une version plus récente est recopié, puis avertit (code 0)', async () => {
  const { publish } = setup();
  course.write({ ...manifest(['a']), lab: '99.0.0' });
  publish('le cours exige 99.0.0');
  const io = captureIo();
  assert.equal(await main(['update'], io), 0);
  assert.match(readFileSync(learnerFile('.othila-lab', 'formation.json'), 'utf8'), /"lab": "99\.0\.0"/);
  assert.match(io.lines.join('\n'), /attention : ce cours demande @othila-academy\/lab 99\.0\.0 ou plus/);
  const after = captureIo();
  assert.equal(await main(['catalog'], after), 3);
  assert.match(after.errors.join('\n'), /npm install --save-dev --save-exact @othila-academy\/lab@99\.0\.0/);
});

test('lab update : marche aussi quand le manifeste local exige déjà une version plus récente', async () => {
  const { publish } = setup();
  course.write({ ...manifest(['a']), lab: '99.0.0' });
  publish('le cours exige 99.0.0');
  assert.equal(await main(['update'], captureIo()), 0);
  addLab('b', 'B');
  course.write({ ...manifest(['a', 'b']), lab: '99.0.0' });
  publish('lab b');
  assert.equal(await main(['update'], captureIo()), 0);
  assert.ok(existsSync(learnerFile('.othila-lab', 'labs', 'b', 'index.mjs')));
});

test('lab update : un manifeste de forme future qui exige une version plus récente est recopié, puis avertit', async () => {
  const { publish } = setup();
  course.write({ ...manifest(['a']), lab: '99.0.0', client: [{ dir: 'a' }, { dir: 'b' }] });
  publish('forme future');
  const io = captureIo();
  assert.equal(await main(['update'], io), 0, io.errors.join('\n'));
  assert.match(io.lines.join('\n'), /attention : ce cours demande @othila-academy\/lab 99\.0\.0 ou plus/);
});
