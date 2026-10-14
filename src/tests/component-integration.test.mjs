import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { satisfiesNode } from '../component/runner.mjs';
import { main } from '../cli.mjs';
import { captureIo } from '../test-helpers/io.mjs';
import { tempLabDir } from '../test-helpers/tmp.mjs';

// Vitest 5 et jsdom 30 demandent une version récente de Node : ailleurs (Node 20), ces tests sont sautés ; la CI les joue sous Node 24.
const enginesOf = (name) => JSON.parse(readFileSync(new URL(`../../node_modules/${name}/package.json`, import.meta.url), 'utf8')).engines?.node ?? '*';
const supported = ['vitest', 'jsdom'].every((name) => satisfiesNode(process.versions.node, enginesOf(name)) !== false);
const FIXTURE = fileURLToPath(new URL('../fixtures/front/', import.meta.url));

let tmp;
let linkDir;
let copy;
afterEach(() => {
  tmp?.cleanup();
  if (linkDir) rmSync(linkDir, { recursive: true, force: true });
  linkDir = null;
  if (copy) rmSync(copy, { recursive: true, force: true });
  copy = null;
  delete process.env.OTHILA_LAB_ROOT;
});

const expectBonjour = async () => {
  tmp = tempLabDir();
  const io = captureIo();
  assert.equal(await main(['check', 'bonjour', '--json', '--no-report'], io), 1, io.errors.join('\n'));
  const [{ results }] = io.lines.map((l) => JSON.parse(l));
  const messages = Object.fromEntries(results[0].failed.map((f) => [f.id, f.message]));
  assert.deepEqual({ passed: results[0].passed, messages }, {
    passed: ['affiche'],
    messages: { 'au-revoir': 'Le composant ne dit pas au revoir', absent: 'client/src/Absent.jsx introuvable : as-tu créé ce fichier ?' }
  });
};

test('vrai Vitest : le composant rendu, le message de l’auteur, le fichier absent traduit', { skip: !supported && 'Node ≥ 22.12 requis par Vitest 5' }, async () => {
  process.env.OTHILA_LAB_ROOT = fileURLToPath(new URL('../fixtures/front/', import.meta.url));
  tmp = tempLabDir();
  const io = captureIo();
  assert.equal(await main(['check', 'bonjour', '--json', '--no-report'], io), 1, io.errors.join('\n'));
  const [{ results }] = io.lines.map((l) => JSON.parse(l));
  assert.deepEqual(results[0].passed, ['affiche']);
  const messages = Object.fromEntries(results[0].failed.map((f) => [f.id, f.message]));
  assert.deepEqual(messages, {
    'au-revoir': 'Le composant ne dit pas au revoir',
    absent: 'client/src/Absent.jsx introuvable : as-tu créé ce fichier ?'
  });
});

test('vrai Vitest, racine du cours atteinte par un lien symbolique : mêmes résultats', { skip: !supported && 'version de Node non prise en charge par Vitest ou jsdom' }, async () => {
  linkDir = mkdtempSync(path.join(tmpdir(), 'othila-lien-'));
  const link = path.join(linkDir, 'cours');
  symlinkSync(FIXTURE, link, process.platform === 'win32' ? 'junction' : 'dir');
  process.env.OTHILA_LAB_ROOT = link;
  await expectBonjour();
});

// Une copie du cours front, modifiée par files ({ chemin relatif: contenu }). Elle reste dans l'arbre de lab-cli
// pour que Vitest et @othila-academy/lab s'y résolvent comme dans le cours.
function fixtureWith(files) {
  copy = mkdtempSync(path.join(path.dirname(FIXTURE), '.tmp-front-'));
  cpSync(FIXTURE, copy, { recursive: true, filter: (src) => !src.split(path.sep).includes('node_modules') });
  for (const [file, content] of Object.entries(files)) writeFileSync(path.join(copy, file), content);
  process.env.OTHILA_LAB_ROOT = copy;
}

const checkBonjour = async () => {
  tmp = tempLabDir();
  const io = captureIo();
  await main(['check', 'bonjour', '--json', '--no-report'], io);
  const [{ results }] = io.lines.map((l) => JSON.parse(l));
  return { passed: results[0].passed, messages: Object.fromEntries(results[0].failed.map((f) => [f.id, f.message])) };
};

test('vrai Vitest : la config de test de l’étudiant (projects, coverage, globalSetup, browser, typecheck) ne s’invite pas', { skip: !supported && 'Node ≥ 22.12 requis par Vitest 5' }, async () => {
  fixtureWith({
    'client/vite.config.js': `export default {
  test: {
    globalSetup: ['./global-setup.js'],
    coverage: { enabled: true, provider: 'v8' },
    typecheck: { enabled: true },
    browser: { enabled: true, instances: [{ browser: 'chromium' }] },
    projects: ['./autre']
  }
};
`,
    'client/global-setup.js': "throw new Error('globalSetup de l’étudiant');\n"
  });
  await expectBonjour();
});

test('vrai Vitest : une config Vite qui ne se charge pas est nommée, avec sa première erreur', { skip: !supported && 'Node ≥ 22.12 requis par Vitest 5' }, async () => {
  fixtureWith({ 'client/vite.config.js': "import nope from 'plugin-inexistant';\nexport default { plugins: [nope()] };\n" });
  const { passed, messages } = await checkBonjour();
  assert.deepEqual(passed, []);
  for (const message of Object.values(messages)) {
    assert.equal(message, "la config Vite du client (client/vite.config.js) ne se charge pas : Cannot find package 'plugin-inexistant'");
  }
});

// Vitest prend un fichier existant tel quel, même si son nom ressemble à un motif ; ? et # sont refusés par componentTest.
for (const name of ['[nom] (bis)', 'voir{plus}', 'a*b', '!a', 'a+(b)']) {
  test(`vrai Vitest : un fichier de test au nom qui contient des caractères de motif (${name}) est joué`, { skip: !supported && 'Node ≥ 22.12 requis par Vitest 5' }, async () => {
    fixtureWith({
      [`.othila-lab/labs/bonjour/tests/${name}.test.jsx`]: readFileSync(path.join(FIXTURE, '.othila-lab/labs/bonjour/tests/bonjour.test.jsx'), 'utf8'),
      '.othila-lab/labs/bonjour/s.mjs': `import { componentTest } from '@othila-academy/lab';

export const checks = [componentTest({ id: 'motif', label: 'joué malgré le motif', file: 'tests/${name}.test.jsx', test: 'affiche' })];
`
    });
    const { passed, messages } = await checkBonjour();
    assert.deepEqual({ passed, messages }, { passed: ['motif'], messages: {} });
  });
}
