import { test, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { main } from '../cli.mjs';
import { makeCourse, tinyLab } from '../test-helpers/course.mjs';
import { captureIo } from '../test-helpers/io.mjs';
import { commitAll, gitIn } from '../test-helpers/git.mjs';

// Le tutoriel joué avec les vraies commandes, dans un cours git qui déclare un serveur et un client :
// le tutoriel ne doit toucher ni à l'un ni à l'autre.
let course;
let originalCwd;
before(() => {
  originalCwd = process.cwd();
});
after(() => process.chdir(originalCwd));
beforeEach(() => {
  course = makeCourse({ labs: { a: tinyLab('A') }, manifest: { server: 'serveur-absent.js', graphql: 'http://127.0.0.1:9/graphql', client: { dir: 'client' } } });
  writeFileSync(path.join(course.home, '.gitignore'), 'local/\n');
  gitIn(course.root)('init', '-q', '-b', 'main');
  commitAll(course.root, 'cours');
  process.chdir(course.root);
});
afterEach(() => {
  process.chdir(originalCwd);
  course.cleanup();
});

const carnet = () => path.join(course.home, 'local', 'prise-en-main', 'carnet.json');
const cli = async (...args) => {
  const io = captureIo();
  const code = await main(args, io);
  return { code, out: io.lines.join('\n'), err: io.errors.join('\n') };
};

test('start crée le carnet dans le bac à sable, l’annonce, ne l’écrase jamais ; git status reste propre', async () => {
  const first = await cli('start', 'prise-en-main');
  assert.equal(first.code, 0);
  assert.ok(existsSync(carnet()));
  assert.match(first.out, /\.othila-lab\/local\/prise-en-main\/carnet\.json créé/);
  writeFileSync(carnet(), '{"prenom":"Ada"}');
  const again = await cli('start', 'prise-en-main');
  assert.equal(readFileSync(carnet(), 'utf8'), '{"prenom":"Ada"}');
  assert.doesNotMatch(again.out, /carnet\.json créé/);
  assert.equal(gitIn(course.root)('status', '--porcelain'), '');
});

test('start depuis un sous-dossier : carnet à la racine du cours, chemin juste depuis là', async () => {
  mkdirSync(path.join(course.root, 'packages', 'server-js'), { recursive: true });
  process.chdir(path.join(course.root, 'packages', 'server-js'));
  const { out } = await cli('start', 'prise-en-main');
  assert.ok(existsSync(carnet()));
  assert.match(out, /\.\.\/\.\.\/\.othila-lab\/local\/prise-en-main\/carnet\.json créé/);
});

test('check du tutoriel : n’attend pas le serveur déclaré, ne touche pas au client', async () => {
  await cli('start', 'prise-en-main');
  const started = Date.now();
  const { code, out } = await cli('check', 'prise-en-main', 'machine', '--no-report');
  assert.equal(code, 0);
  assert.ok(Date.now() - started < 5000, 'aucune attente de serveur');
  assert.doesNotMatch(out, /serveur|injoignable/);
  assert.match(out, /Étape validée/);
});

test('le parcours complet : échec lu, corrigé, prédiction, indice, points 9 / 10, fin de lab', async () => {
  await cli('start', 'prise-en-main');
  const failed = await cli('check', 'prise-en-main', 'reparer', '--no-report');
  assert.equal(failed.code, 1);
  assert.match(failed.out, /ligne 5, colonne 1/);
  writeFileSync(carnet(), JSON.stringify({ prenom: 'Ada', objectifs: [], arrivee: '14/10/2026' }));
  assert.equal((await cli('check', 'prise-en-main', 'reparer', '--no-report')).code, 0);
  assert.match((await cli('submit', 'prise-en-main', 'reparer', '--text', 'Le message donnait la ligne.', '--no-report')).out, /\+10 points/);
  const predicted = await cli('check', 'prise-en-main', 'predire', '--answer', 'non', '--no-report');
  assert.match(predicted.out, /prédiction : non · juste/);
  assert.equal((await cli('hint', 'prise-en-main', 'indice', '--yes', '--no-report')).code, 0);
  writeFileSync(carnet(), JSON.stringify({ prenom: 'Ada', objectifs: ['GraphQL'], arrivee: '2026-10-14' }));
  assert.equal((await cli('check', 'prise-en-main', 'indice', '--no-report')).code, 0);
  const last = await cli('submit', 'prise-en-main', 'indice', '--text', 'Quand je tourne en rond.', '--no-report');
  assert.match(last.out, /\+9 points/);
  assert.match(last.out, /Prise en main terminée\. Tes points : npx lab progress/);
  assert.match(last.out, /Premier lab de la formation : npx lab start a/);
  assert.match(last.out, /En salle, en fin de session : npx lab leave/);
  assert.doesNotMatch(last.out, /git commit/);
  const progress = await cli('progress');
  assert.match(progress.out, /Séance 0 · Prise en main/);
  assert.match(progress.out, /indice\s+soumis\s+1\/1\s+9\/10/);
});

test('lab catchup prise-en-main : le tutoriel n’a pas de départ, et c’est dit', async () => {
  const { code, err } = await cli('catchup', 'prise-en-main');
  assert.equal(code, 3);
  assert.match(err, /prise-en-main est le tutoriel fourni par lab-cli : il n'a pas de départ, npx lab start prise-en-main suffit/);
});

test('un client présent n’est ni lu ni modifié par le tutoriel', async () => {
  mkdirSync(path.join(course.root, 'client'), { recursive: true });
  writeFileSync(path.join(course.root, 'client', 'package.json'), '{"name":"client"}\n');
  await cli('start', 'prise-en-main');
  writeFileSync(carnet(), JSON.stringify({ prenom: 'Ada', objectifs: ['x'], arrivee: '2026-10-14' }));
  for (const s of ['machine', 'reparer', 'predire', 'indice']) assert.equal((await cli('check', 'prise-en-main', s, '--answer', 'non', '--no-report')).code, 0);
  assert.deepEqual(readdirSync(path.join(course.root, 'client')), ['package.json']);
});
