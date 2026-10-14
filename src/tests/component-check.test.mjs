import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, realpathSync, symlinkSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { main } from '../cli.mjs';
import { componentTest } from '../index.mjs';
import { makeCourse } from '../test-helpers/course.mjs';
import { installFakeVitest } from '../test-helpers/fake-vitest.mjs';
import { startFakeGraphql } from '../test-helpers/fake-graphql.mjs';
import { captureIo } from '../test-helpers/io.mjs';
import { tempLabDir } from '../test-helpers/tmp.mjs';

let course;
let tmp;
let graphql;
afterEach(async () => {
  course?.cleanup();
  tmp?.cleanup();
  await graphql?.close();
  course = tmp = graphql = null;
  delete process.env.OTHILA_LAB_ROOT;
});

const STEP = `import { componentTest } from '@othila-academy/lab';
export const checks = [
  componentTest({ id: 'affiche', label: 'la liste s’affiche', file: 'tests/liste.test.jsx' }),
  componentTest({ id: 'titres', label: 'les titres', file: 'tests/liste.test.jsx', test: 'liste titres' }),
  { id: 'simple', label: 'un check ordinaire', run: async () => {} },
  componentTest({ id: 'connexion', label: 'le formulaire', file: 'tests/connexion.test.jsx' })
];
`;

// Les labs d'un cours temporaire importent @othila-academy/lab : on y relie ce paquet, comme le fait le rejeu.
const PACKAGE_ROOT = fileURLToPath(new URL('../../', import.meta.url));
function linkPackage(root) {
  const link = path.join(root, 'node_modules', '@othila-academy', 'lab');
  mkdirSync(path.dirname(link), { recursive: true });
  symlinkSync(PACKAGE_ROOT, link, process.platform === 'win32' ? 'junction' : 'dir');
}

// Un cours front : client dans client/, préparation dans .othila-lab/shared/setup.js, un lab « front » d'une étape « s ».
function setup({ manifest = {}, client = true } = {}) {
  course = makeCourse({
    labs: { front: { 'index.mjs': "export const title = 'Front';\nexport const steps = ['s'];\n", 's.mjs': STEP } },
    manifest: { client: { dir: 'client', setup: '.othila-lab/shared/setup.js' }, ...manifest }
  });
  linkPackage(course.root);
  process.env.OTHILA_LAB_ROOT = course.root;
  tmp = tempLabDir();
  const clientDir = path.join(course.root, 'client');
  if (client) mkdirSync(clientDir, { recursive: true });
  return { clientDir };
}

const check = async (...extra) => {
  const io = captureIo();
  const code = await main(['check', 'front', '--json', '--no-report', ...extra], io);
  const [{ results }] = io.lines.map((l) => JSON.parse(l));
  return { code, result: results[0], messages: Object.fromEntries(results[0].failed.map((f) => [f.id, f.message])) };
};

test('componentTest : forme du check, test par défaut = id, file normalisé, refus hors du lab', () => {
  const c = componentTest({ id: 'a', label: 'A', file: 'tests/./a.test.jsx', passesOnStart: true });
  assert.deepEqual({ ...c, run: typeof c.run }, { id: 'a', label: 'A', passesOnStart: true, component: { file: 'tests/a.test.jsx', test: 'a' }, run: 'function' });
  assert.throws(() => componentTest({ id: 'b', label: 'B', file: '../ailleurs.test.jsx' }), /componentTest b : file doit rester dans le dossier du lab/);
  assert.throws(() => componentTest({ id: 'w', label: 'W', file: 'C:\\ailleurs\\x.test.js' }), /componentTest w : file doit rester dans le dossier du lab/);
  assert.throws(() => componentTest({ id: 'v', label: 'V', file: 'c:x.test.js' }), /componentTest v : file doit rester dans le dossier du lab/);
  assert.throws(() => componentTest({ id: 'c', label: 'C', file: 'tests/c.css' }), /componentTest c : file doit nommer un fichier de test \.js, \.jsx, \.mjs, \.ts ou \.tsx/);
  assert.throws(() => componentTest({ id: 'd', file: 'd.test.js' }), /componentTest : id et label sont obligatoires/);
});

test('une étape mélangée : un seul lancement, checks reliés à leurs tests, messages traduits, arguments et environnement', async () => {
  const { clientDir } = setup();
  const vitest = installFakeVitest(clientDir, {
    files: {
      'tests/liste.test.jsx': { tests: { affiche: 'passed', 'liste titres': { failed: "AssertionError: Le titre « Atelier » n'apparaît pas: expected null not to be null" } } },
      'tests/connexion.test.jsx': { message: 'Failed to resolve import "@client/src/Login.jsx" from "../.othila-lab/labs/front/tests/connexion.test.jsx". Does the file exist?' }
    }
  });
  const { code, result, messages } = await check();
  assert.equal(code, 1);
  assert.deepEqual(result.passed, ['affiche', 'simple']);
  assert.deepEqual(messages, { titres: "Le titre « Atelier » n'apparaît pas", connexion: 'client/src/Login.jsx introuvable : as-tu créé ce fichier ?' });
  const calls = vitest.calls();
  assert.equal(calls.length, 1);
  const [{ args, cwd, env }] = calls;
  assert.equal(args[0], 'run');
  assert.equal(args[1], '--config');
  assert.match(args[2], /src[\\/]component[\\/]vitest\.config\.mjs$/);
  assert.equal(args[3], '--reporter=json');
  assert.match(args[4], /^--outputFile=/);
  assert.equal(realpathSync(cwd), realpathSync(clientDir));
  // Chemins réels : Vite les compare à sa liste d'accès.
  assert.equal(env.LAB_CLIENT_DIR, realpathSync(clientDir));
  assert.equal(env.LAB_DIR, realpathSync(path.join(course.home, 'labs', 'front')));
  assert.deepEqual(JSON.parse(env.LAB_TEST_FILES), ['tests/liste.test.jsx', 'tests/connexion.test.jsx']);
  assert.equal(env.LAB_SETUP, path.join(realpathSync(course.home), 'shared', 'setup.js')); // le fichier n'existe pas : son dossier parent est réel
  assert.equal(env.LAB_GRAPHQL_URL, null);
  assert.equal(env.NO_COLOR, '1');
});

test('avec un serveur : LAB_GRAPHQL_URL porte l’URL de lab check', async () => {
  graphql = await startFakeGraphql();
  const { clientDir } = setup({ manifest: { server: 'server.mjs' } });
  const vitest = installFakeVitest(clientDir, { files: {} });
  await check('--url', graphql.url);
  assert.equal(vitest.calls()[0].env.LAB_GRAPHQL_URL, graphql.url);
});

test('client absent du disque : chaque check de composant le dit, aucun lancement, le check ordinaire passe', async () => {
  setup({ client: false });
  const { result, messages } = await check();
  assert.deepEqual(result.passed, ['simple']);
  for (const id of ['affiche', 'titres', 'connexion']) assert.equal(messages[id], "client n'existe pas : as-tu créé le client ?");
});

test('Vitest absent : le dire, avec ce qu’il faut installer', async () => {
  setup();
  const { messages } = await check();
  assert.equal(messages.affiche, "Vitest n'est pas installé pour client : installe-le avec jsdom et @testing-library/react, en dépendances de développement du client");
});

test('pas de client dans formation.json : le dire', async () => {
  course = makeCourse({ labs: { front: { 'index.mjs': "export const title = 'Front';\nexport const steps = ['s'];\n", 's.mjs': STEP } } });
  linkPackage(course.root);
  process.env.OTHILA_LAB_ROOT = course.root;
  tmp = tempLabDir();
  const { messages } = await check();
  assert.equal(messages.affiche, 'cette formation ne déclare pas de client (client dans .othila-lab/formation.json)');
});

test('Vitest sans rapport : la fin de sa sortie d’erreur', async () => {
  const { clientDir } = setup();
  installFakeVitest(clientDir, { noReport: true });
  const { messages } = await check();
  assert.equal(messages.affiche, 'Vitest ne démarre pas : plantage simulé');
});

test('messages avec chemins absolus réels (racine derrière un lien, comme /var sous macOS) : chemins depuis la racine du dépôt', async () => {
  const { clientDir } = setup();
  const real = realpathSync(clientDir);
  installFakeVitest(clientDir, {
    files: {
      'tests/liste.test.jsx': { message: `Transform failed with 1 error:\n${path.join(real, 'src', 'A.jsx')}:3:7: ERROR: Expected ";" but found "x"` },
      'tests/connexion.test.jsx': { message: `Failed to resolve import "react" from "${path.join(real, 'src', 'App.jsx')}". Does the file exist?` }
    }
  });
  const { messages } = await check();
  assert.equal(messages.affiche, 'client/src/A.jsx ne compile pas (ligne 3) : Expected ";" but found "x"');
  assert.equal(messages.connexion, "le paquet react n'est pas installé pour le client (client)");
});

test('componentTest : ? et # refusés dans file, Vite les lit comme une requête ou une ancre d’URL', () => {
  assert.throws(() => componentTest({ id: 'q', label: 'Q', file: 'tests/a?b.test.jsx' }), /componentTest q : file ne peut pas contenir \? ni # \(Vite les lit comme une requête ou une ancre d'URL\) : tests\/a\?b\.test\.jsx/);
  assert.throws(() => componentTest({ id: 'h', label: 'H', file: 'tests/a#b.test.jsx' }), /componentTest h : file ne peut pas contenir \? ni #/);
  assert.doesNotThrow(() => componentTest({ id: 'c', label: 'C', file: 'tests/[nom] (bis).test.jsx' }));
});
