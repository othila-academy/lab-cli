import { test, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { main } from '../cli.mjs';
import { makeCourse, tinyLab } from '../test-helpers/course.mjs';
import { isolateGitEnv, publishCourse } from '../test-helpers/git.mjs';
import { captureIo } from '../test-helpers/io.mjs';

// La version de lab-cli suit main à init, catchup et update : base épingle 0.10.1, main passe ensuite à 0.11.0.
const P = '@othila-academy/lab';
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

const text = (v) => `${JSON.stringify(v, null, 2)}\n`;
const entry = (v) => ({ version: v, resolved: `https://registry.npmjs.org/@othila-academy/lab/-/lab-${v}.tgz`, integrity: `sha512-${v}`, dev: true, license: 'MIT', bin: { lab: 'bin/lab.mjs' } });
const writePin = (dir, v) => {
  writeFileSync(path.join(dir, 'package.json'), text({ name: 'cours', private: true, devDependencies: { [P]: v } }));
  writeFileSync(path.join(dir, 'package-lock.json'), text({ name: 'cours', lockfileVersion: 3, requires: true, packages: { '': { name: 'cours', devDependencies: { [P]: v } }, [`node_modules/${P}`]: entry(v) } }));
};
// Le paquet tel que npm install le pose chez l'apprenant : seule sa version compte ici.
const installed = (dir, v) => {
  const pkg = path.join(dir, 'node_modules', '@othila-academy', 'lab');
  mkdirSync(pkg, { recursive: true });
  writeFileSync(path.join(pkg, 'package.json'), JSON.stringify({ name: P, version: v }));
};
const pinOf = (dir) => JSON.parse(readFileSync(path.join(dir, 'package.json'), 'utf8')).devDependencies[P];
const lockOf = (dir) => JSON.parse(readFileSync(path.join(dir, 'package-lock.json'), 'utf8'));

function setup({ learnerBranch = 'my-project' } = {}) {
  course = makeCourse({ labs: { a: tinyLab('A') } });
  writeFileSync(path.join(course.home, '.gitignore'), 'local/\n');
  writeFileSync(path.join(course.root, '.gitignore'), 'node_modules/\n');
  writePin(course.root, '0.10.1');
  published = publishCourse(course, { learnerBranch });
  writePin(course.root, '0.11.0');
  published.publish('lab-cli 0.11.0');
  process.chdir(published.learnerDir);
}

test('lab update : épinglage aligné sur main dans le commit des labs, message court', async () => {
  setup();
  installed(published.learnerDir, '0.10.1');
  const io = captureIo();
  assert.equal(await main(['update'], io), 0, io.errors.join('\n'));
  assert.equal(pinOf(published.learnerDir), '0.11.0');
  assert.equal(lockOf(published.learnerDir).packages[`node_modules/${P}`].resolved, 'https://registry.npmjs.org/@othila-academy/lab/-/lab-0.11.0.tgz');
  assert.match(published.learner('log', '-1', '--format=%s'), /^labs à jour \(main@[0-9a-f]+\), lab-cli 0\.11\.0$/);
  const files = published.learner('show', '--name-only', '--format=', 'HEAD').split('\n').filter((f) => f && !f.startsWith('.othila-lab/'));
  assert.deepEqual(files.sort(), ['package-lock.json', 'package.json']);
  assert.equal(published.learner('status', '--porcelain'), '');
  assert.match(io.lines.join('\n'), /lab-cli 0\.11\.0 épinglée comme sur main : npm install/);
});

test('lab update : package.json modifié sans commit, rien n’est réécrit, ses modifications restent', async () => {
  setup();
  installed(published.learnerDir, '0.10.1');
  const mine = text({ name: 'cours', private: true, devDependencies: { [P]: '0.10.1', zod: '3.0.0' } });
  writeFileSync(path.join(published.learnerDir, 'package.json'), mine);
  const io = captureIo();
  assert.equal(await main(['update'], io), 0, io.errors.join('\n'));
  assert.equal(readFileSync(path.join(published.learnerDir, 'package.json'), 'utf8'), mine);
  assert.equal(lockOf(published.learnerDir).packages[`node_modules/${P}`].version, '0.10.1');
  assert.match(io.lines.join('\n'), /npm install --save-dev --save-exact @othila-academy\/lab@0\.11\.0/);
});

test('lab catchup : le départ du lab est aligné ; npm install installera main', async () => {
  setup();
  installed(published.learnerDir, '0.11.0');
  const io = captureIo();
  assert.equal(await main(['catchup', 'a'], io), 0, io.errors.join('\n'));
  assert.equal(published.learner('branch', '--show-current'), 'catchup-a');
  assert.equal(pinOf(published.learnerDir), '0.11.0');
  assert.equal(published.learner('status', '--porcelain'), '');
});

test('lab init : my-project part de base et passe aussitôt à la version de main', async () => {
  setup({ learnerBranch: 'autre' });
  installed(published.learnerDir, '0.11.0');
  const io = captureIo();
  assert.equal(await main(['init'], io), 0, io.errors.join('\n'));
  assert.equal(published.learner('branch', '--show-current'), 'my-project');
  assert.equal(pinOf(published.learnerDir), '0.11.0');
  assert.doesNotMatch(io.lines.join('\n'), /npm install/);
});
