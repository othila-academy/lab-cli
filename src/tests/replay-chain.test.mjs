import { test, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { main } from '../cli.mjs';
import { makeCourse } from '../test-helpers/course.mjs';
import { commitAll, gitIn } from '../test-helpers/git.mjs';
import { captureIo } from '../test-helpers/io.mjs';

const PACKAGE_ROOT = realpathSync(fileURLToPath(new URL('../../', import.meta.url)));

let course;
let git;
let kept = [];
let originalCwd;
before(() => { originalCwd = process.cwd(); });
after(() => process.chdir(originalCwd));
afterEach(() => {
  process.chdir(originalCwd);
  for (const dir of kept) rmSync(dir, { recursive: true, force: true });
  kept = [];
  course?.cleanup();
  course = null;
});

// Un check qui lit { answer } sur le serveur du cours ; extra ajoute un second check, présent seulement en tête de main.
const step = ({ extra = false } = {}) => `import { assert, expectData } from '@othila-academy/lab';
export const checks = [
  { id: 'answer', label: 'answer vaut 42', run: async ({ gql }) => {
    const data = expectData(await gql('{ answer }'), 'answer');
    assert(data.answer === 42, 'answer vaut ' + data.answer);
  } }${extra ? `,
  { id: 'head-only', label: 'ajouté après coup', run: async ({ gql }) => {
    assert(expectData(await gql('{ answer }'), 'answer').answer >= 42, 'trop petit');
  } }` : ''}
];
`;

// Un cours sans dépendance : un serveur qui répond { answer } lu dans answer.txt, un lab a ;
// base (answer 0) puis solution/a (answer 42) sur main.
function setup() {
  course = makeCourse({
    labs: { a: { 'index.mjs': "export const title = 'A';\nexport const steps = ['s'];\n", 's.mjs': step() } },
    manifest: { server: 'server.mjs' }
  });
  const file = (name, content) => writeFileSync(path.join(course.root, name), content);
  file('package.json', JSON.stringify({ name: 'cours-test', version: '1.0.0', private: true }));
  file('package-lock.json', JSON.stringify({ name: 'cours-test', version: '1.0.0', lockfileVersion: 3, requires: true, packages: { '': { name: 'cours-test', version: '1.0.0' } } }));
  file('.gitignore', 'node_modules/\n');
  writeFileSync(path.join(course.home, '.gitignore'), 'local/\n');
  file('server.mjs', `import http from 'node:http';
import { readFileSync } from 'node:fs';
http.createServer((_req, res) => {
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ data: { __typename: 'Query', answer: Number(readFileSync('answer.txt', 'utf8')) } }));
}).listen(Number(process.env.PORT), '127.0.0.1');
`);
  file('answer.txt', '0');
  git = gitIn(course.root);
  git('init', '-q', '-b', 'main');
  commitAll(course.root, 'starter');
  git('tag', 'base');
  file('answer.txt', '42');
  commitAll(course.root, 'solution a');
  git('tag', 'solution/a');
  process.chdir(course.root);
}

const replay = async (...args) => {
  const io = captureIo();
  const code = await main(['replay', ...args], io);
  return { code, out: io.lines.join('\n'), err: io.errors.join('\n') };
};

test('lab replay : départ base, solution solution/a, conforme', async () => {
  setup();
  const { code, out } = await replay();
  assert.equal(code, 0, out);
  assert.match(out, /\[rejeu\] a · start · worktree .* sur base/);
  assert.match(out, /\[rejeu\] a · solution · worktree .* sur solution\/a/);
  assert.match(out, /\| a \| start \| s \| 0 \| 1 \| aucune \|/);
  assert.match(out, /\| a \| solution \| s \| 1 \| 0 \| aucune \|/);
  assert.match(out, /rejeu : conforme/);
});

test('lab replay : la définition de la tête de main est jouée sur les états tagués', async () => {
  setup();
  writeFileSync(path.join(course.home, 'labs', 'a', 's.mjs'), step({ extra: true }));
  commitAll(course.root, 'un check de plus, sans déplacer de tag');
  const { code, out } = await replay();
  assert.equal(code, 0, out);
  assert.match(out, /\| a \| solution \| s \| 2 \| 0 \| aucune \|/);
  assert.match(out, /\| a \| start \| s \| 0 \| 2 \| aucune \|/);
});

test('lab replay : chaîne incomplète, anomalie affichée, code 1, aucun worktree', async () => {
  setup();
  git('tag', '-d', 'solution/a');
  const { code, err } = await replay();
  assert.equal(code, 1);
  assert.match(err, /solution\/a introuvable : pose le tag sur le commit de solution du lab a/);
  assert.equal(git('worktree', 'list').split('\n').length, 1);
});

test('lab replay --keep : le worktree relie le paquet courant et reçoit .othila-lab sans local/', async () => {
  setup();
  mkdirSync(path.join(course.home, 'local'), { recursive: true });
  writeFileSync(path.join(course.home, 'local', 'state.json'), '{}');
  const { code, out } = await replay('--lab', 'a', '--keep');
  assert.equal(code, 0, out);
  const dirs = [...out.matchAll(/worktree (\S+) sur/g)].map((m) => m[1]);
  assert.equal(dirs.length, 2);
  kept = dirs.map((d) => path.dirname(d));
  for (const dir of dirs) {
    assert.equal(realpathSync(path.join(dir, 'node_modules', '@othila-academy', 'lab')), PACKAGE_ROOT);
    assert.equal(existsSync(path.join(dir, '.othila-lab', 'local')), false);
    assert.ok(existsSync(path.join(dir, '.othila-lab', 'labs', 'a', 's.mjs')));
  }
  for (const dir of dirs) git('worktree', 'remove', '--force', dir);
});

test('lab replay --lab : lab inconnu en code 3', async () => {
  setup();
  const { code, err } = await replay('--lab', 'zz');
  assert.equal(code, 3);
  assert.match(err, /lab inconnu : zz/);
});
