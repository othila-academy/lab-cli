import { test, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { main } from '../cli.mjs';
import { run } from '../commands/tutoriel.mjs';
import { PACKAGE_VERSION } from '../config.mjs';
import { captureIo } from '../test-helpers/io.mjs';

// lab tutoriel : un dossier jouable hors de tout cours.
let dir;
let originalCwd;
before(() => {
  originalCwd = process.cwd();
});
after(() => process.chdir(originalCwd));
beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'lab-tutoriel-'));
  process.chdir(dir);
});
afterEach(() => {
  process.chdir(originalCwd);
  rmSync(dir, { recursive: true, force: true });
});

const read = (...p) => readFileSync(path.join(dir, ...p), 'utf8');

test('tutoriel crée lab-tutoriel : package épinglé, manifeste minimal, .gitignore, dépôt git ; affiche la suite', async () => {
  const io = captureIo();
  assert.equal(await main(['tutoriel'], io), 0);
  const pkg = JSON.parse(read('lab-tutoriel', 'package.json'));
  assert.equal(pkg.private, true);
  assert.equal(pkg.devDependencies['@othila-academy/lab'], PACKAGE_VERSION);
  assert.deepEqual(JSON.parse(read('lab-tutoriel', '.othila-lab', 'formation.json')), { id: 'tutoriel', title: 'Prise en main de la commande lab', seances: [] });
  assert.equal(read('lab-tutoriel', '.othila-lab', '.gitignore'), 'local/\n');
  assert.equal(read('lab-tutoriel', '.gitignore'), 'node_modules/\n');
  assert.ok(existsSync(path.join(dir, 'lab-tutoriel', '.git')));
  const out = io.lines.join('\n');
  assert.match(out, /cd lab-tutoriel/);
  assert.match(out, /npm install/);
  assert.match(out, /npx lab start prise-en-main/);
});

test('un nom de dossier au choix', async () => {
  assert.equal(await main(['tutoriel', 'essai'], captureIo()), 0);
  assert.ok(existsSync(path.join(dir, 'essai', '.othila-lab', 'formation.json')));
});

test('dossier existant : refus, code 1, rien touché', async () => {
  await main(['tutoriel'], captureIo());
  const io = captureIo();
  assert.equal(await main(['tutoriel'], io), 1);
  assert.match(io.errors.join('\n'), /lab-tutoriel existe déjà : choisis un autre nom \(npx @othila-academy\/lab tutoriel <dossier>\)/);
});

test('sans git : le dossier est créé quand même, et c’est dit', async () => {
  const io = captureIo();
  const code = await run({
    positionals: [],
    flags: {},
    io,
    initRepo: () => {
      throw new Error('git introuvable');
    }
  });
  assert.equal(code, 0);
  assert.ok(existsSync(path.join(dir, 'lab-tutoriel', 'package.json')));
  assert.ok(!existsSync(path.join(dir, 'lab-tutoriel', '.git')));
  assert.match(io.errors.join('\n'), /git introuvable : le dossier reste sans dépôt git/);
});

test('le tutoriel se joue dans le dossier créé, même sans dépôt git', async () => {
  await run({
    positionals: [],
    flags: {},
    io: captureIo(),
    initRepo: () => {
      throw new Error('non');
    }
  });
  process.chdir(path.join(dir, 'lab-tutoriel'));
  const catalog = captureIo();
  catalog.isTTY = true;
  assert.equal(await main(['catalog'], catalog), 0);
  assert.match(catalog.lines.join('\n'), /Séance 0 · Prise en main/);
  assert.equal(await main(['start', 'prise-en-main'], captureIo()), 0);
  assert.equal(await main(['check', 'prise-en-main', 'machine', '--no-report'], captureIo()), 0);
});

test('dans le dépôt d’un cours : refus, rien de créé, le tutoriel s’y joue directement', async () => {
  mkdirSync(path.join(dir, '.othila-lab'));
  writeFileSync(path.join(dir, '.othila-lab', 'formation.json'), JSON.stringify({ id: 'cours', title: 'Cours', seances: [] }));
  mkdirSync(path.join(dir, 'packages'));
  process.chdir(path.join(dir, 'packages'));
  const io = captureIo();
  assert.equal(await main(['tutoriel'], io), 1);
  assert.match(io.errors.join('\n'), /tu es dans le dépôt d'un cours : npx lab start prise-en-main y joue le tutoriel, sans dossier à part/);
  assert.ok(!existsSync(path.join(dir, 'packages', 'lab-tutoriel')));
});

test('un nom avec une espace : la commande cd affichée est entre guillemets', async () => {
  const io = captureIo();
  assert.equal(await main(['tutoriel', 'mon dossier'], io), 0);
  assert.match(io.lines.join('\n'), /cd "mon dossier"/);
});
