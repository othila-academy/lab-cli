import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { makeCourse, tinyLab } from '../test-helpers/course.mjs';
import { tempLabDir } from '../test-helpers/tmp.mjs';
import {
  DEFAULT_ENDPOINT, endpointUrl, ensureGitignore, formation, graphqlUrl, labsDir, loadSession, loadState,
  localDir, projectRoot, readFormation, saveSession, saveState, serverScript
} from '../config.mjs';

let tmp;
let course;
let bare;
beforeEach(() => {
  tmp = tempLabDir();
  course = null;
  bare = null;
});
afterEach(() => {
  tmp.cleanup();
  course?.cleanup();
  if (bare) rmSync(bare, { recursive: true, force: true });
  for (const name of ['OTHILA_LAB_URL', 'OTHILA_LAB_ROOT', 'OTHILA_LAB_SERVER_SCRIPT', 'GRAPHQL_URL']) delete process.env[name];
});

const seances = [{ title: 'S', labs: ['a'] }];

test('formation.json : champs lus, défauts appliqués, clés inconnues ignorées', () => {
  course = makeCourse({
    labs: { a: tinyLab(), b: tinyLab() },
    seances: [{ title: ' Séance 1 ', labs: ['b'] }, { title: 'Séance 2', labs: ['a'] }],
    manifest: { futur: true }
  });
  const f = formation(course.root);
  assert.equal(f.id, 'cours-test');
  assert.equal(f.title, 'Cours de test');
  assert.deepEqual(f.seances, [{ title: 'Séance 1', labs: ['b'] }, { title: 'Séance 2', labs: ['a'] }]);
  assert.equal(f.server, 'packages/server-js/src/server.js');
  assert.equal(f.graphql, 'http://localhost:4000/graphql');
  assert.equal(f.endpoint, DEFAULT_ENDPOINT);
  assert.equal(f.root, course.root);
  assert.equal(f.labsDir, path.join(course.root, '.othila-lab', 'labs'));
  assert.equal('futur' in f, false);
});

test('formation.json : chaque erreur nomme le fichier et le champ', () => {
  course = makeCourse({ labs: { a: tinyLab() } });
  const cases = [
    [[], /formation\.json : racine : objet JSON attendu/],
    [{ title: 'T', seances }, /formation\.json : id : /],
    [{ id: 'GraphQL', title: 'T', seances }, /id : minuscules, chiffres et tirets/],
    [{ id: 'x', title: ' ', seances }, /title : texte non vide attendu/],
    [{ id: 'x', title: 'x'.repeat(201), seances }, /formation\.json : title : 200 caractères au plus/],
    [{ id: 'x', title: 'T', seances: [] }, /seances : liste non vide attendue/],
    [{ id: 'x', title: 'T', seances: [{ title: '', labs: ['a'] }] }, /seances\[0\]\.title : texte non vide attendu/],
    [{ id: 'x', title: 'T', seances: [{ title: 'x'.repeat(201), labs: ['a'] }] }, /seances\[0\]\.title : 200 caractères au plus/],
    [{ id: 'x', title: 'T', seances: [{ title: 'S', labs: [] }] }, /seances\[0\]\.labs : liste non vide attendue/],
    [{ id: 'x', title: 'T', seances: [{ title: 'S', labs: ['A'] }] }, /seances\[0\]\.labs\[0\] : identifiant de lab attendu/],
    [{ id: 'x', title: 'T', seances: [{ title: 'S', labs: ['a'] }, { title: 'S2', labs: ['a'] }] }, /seances\[1\]\.labs\[0\] : a est déjà cité/],
    [{ id: 'x', title: 'T', seances: [{ title: 'S', labs: ['absent'] }] }, /seances\[0\]\.labs\[0\] : absent n'a pas de dossier \.othila-lab\/labs\/absent\/ avec index\.mjs/],
    [{ id: 'x', title: 'T', seances, server: 3 }, /server : texte non vide attendu/]
  ];
  for (const [manifest, error] of cases) {
    course.write(manifest);
    assert.throws(() => formation(course.root), error);
  }
  course.write('{');
  assert.throws(() => formation(course.root), /\.othila-lab\/formation\.json illisible/);
});

test('formation.json enregistré avec un BOM : lu normalement', () => {
  course = makeCourse({ labs: { a: tinyLab() } });
  course.write(`﻿${JSON.stringify({ id: 'x', title: 'T', seances })}`);
  assert.equal(formation(course.root).id, 'x');
});

test('sans manifeste : readFormation vaut null, formation() explique, les défauts servent ; ancien format signalé', () => {
  bare = mkdtempSync(path.join(tmpdir(), 'sans-cours-'));
  assert.equal(readFormation(bare), null);
  assert.throws(() => formation(bare), /pas de \.othila-lab\/formation\.json ici ni dans les dossiers parents/);
  process.env.OTHILA_LAB_ROOT = bare;
  assert.equal(endpointUrl(), DEFAULT_ENDPOINT);
  assert.equal(graphqlUrl(undefined), 'http://localhost:4000/graphql');
  writeFileSync(path.join(bare, 'othila-lab.config.json'), '{}');
  assert.throws(() => formation(bare), /ancienne configuration othila-lab\.config\.json : déplace labs\/ dans \.othila-lab\/labs\//);
});

test("l'environnement prime sur formation.json, qui prime sur les défauts", () => {
  course = makeCourse({ labs: { a: tinyLab() }, manifest: { endpoint: 'http://e', graphql: 'http://g0', server: 's.js' } });
  process.env.OTHILA_LAB_ROOT = course.root;
  assert.equal(endpointUrl(), 'http://e');
  assert.equal(graphqlUrl(undefined), 'http://g0');
  assert.equal(serverScript(), 's.js');
  assert.equal(labsDir(), path.join(course.root, '.othila-lab', 'labs'));
  process.env.OTHILA_LAB_URL = 'http://autre';
  process.env.GRAPHQL_URL = 'http://g';
  process.env.OTHILA_LAB_SERVER_SCRIPT = 'x/server.js';
  assert.equal(endpointUrl(), 'http://autre');
  assert.equal(graphqlUrl(undefined), 'http://g');
  assert.equal(graphqlUrl('http://a'), 'http://a');
  assert.equal(serverScript(), 'x/server.js');
});

test('session.json et state.json dans le dossier local', () => {
  assert.equal(loadSession(), null);
  assert.deepEqual(loadState(), { hints: {}, predictions: {}, steps: {} });
  saveSession({ endpoint: 'http://e', session: 'S-1', learnerId: 'l', token: 't', firstName: 'N' });
  saveState({ hints: { 'n1/observe': 2 }, predictions: {} });
  assert.equal(localDir(), tmp.dir);
  assert.equal(loadSession().session, 'S-1');
  assert.equal(loadState().hints['n1/observe'], 2);
  assert.ok(existsSync(path.join(tmp.dir, 'session.json')));
});

test('sans OTHILA_LAB_DIR, le dossier local est .othila-lab/local de la racine', () => {
  course = makeCourse({ labs: { a: tinyLab() } });
  process.env.OTHILA_LAB_ROOT = course.root;
  delete process.env.OTHILA_LAB_DIR; // tmp.cleanup() la restaure
  assert.equal(localDir(), path.join(course.root, '.othila-lab', 'local'));
});

test('ensureGitignore : local/ dans .othila-lab/.gitignore, une seule fois, sans toucher au .gitignore du projet', () => {
  course = makeCourse({ labs: { a: tinyLab() } });
  const own = path.join(course.root, '.othila-lab', '.gitignore');
  writeFileSync(path.join(course.root, '.gitignore'), 'node_modules/\n');
  assert.equal(ensureGitignore(course.root), true);
  assert.equal(ensureGitignore(course.root), false);
  assert.equal(readFileSync(own, 'utf8'), 'local/\n');
  assert.equal(readFileSync(path.join(course.root, '.gitignore'), 'utf8'), 'node_modules/\n');
  writeFileSync(own, 'vendor/*.log');
  assert.equal(ensureGitignore(course.root), true);
  assert.equal(readFileSync(own, 'utf8'), 'vendor/*.log\nlocal/\n');
});

test('depuis un sous-dossier du cours, la racine est celle du manifeste ; un .othila-lab/local seul ne compte pas', () => {
  course = makeCourse({ labs: { a: tinyLab() } });
  const sub = path.join(course.root, 'packages', 'server-js');
  mkdirSync(path.join(sub, '.othila-lab', 'local'), { recursive: true });
  const previousCwd = process.cwd();
  const previousDir = process.env.OTHILA_LAB_DIR;
  delete process.env.OTHILA_LAB_DIR;
  process.chdir(sub);
  try {
    const real = realpathSync(course.root);
    assert.equal(realpathSync(projectRoot()), real);
    assert.equal(formation().id, 'cours-test');
    assert.equal(localDir(), path.join(real, '.othila-lab', 'local'));
    ensureGitignore();
    assert.ok(existsSync(path.join(course.root, '.othila-lab', '.gitignore')));
    assert.ok(!existsSync(path.join(sub, '.othila-lab', '.gitignore')));
  } finally {
    process.chdir(previousCwd);
    if (previousDir !== undefined) process.env.OTHILA_LAB_DIR = previousDir;
  }
});
