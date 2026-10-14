import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runChecks } from '../checks.mjs';
import { tempLabDir } from '../test-helpers/tmp.mjs';

// Le lab de prise en main, joué check par check sur des carnets écrits dans un bac à sable temporaire (OTHILA_LAB_DIR).
const LAB = fileURLToPath(new URL('../../labs/prise-en-main/', import.meta.url));
const step = (id) => import(new URL(`../../labs/prise-en-main/${id}.mjs`, import.meta.url));
const TEMPLATE = readFileSync(path.join(LAB, 'carnet.json'), 'utf8');

let lab;
beforeEach(() => {
  lab = tempLabDir();
});
afterEach(() => lab.cleanup());

const writeCarnet = (text) => {
  mkdirSync(path.join(lab.dir, 'prise-en-main'), { recursive: true });
  writeFileSync(path.join(lab.dir, 'prise-en-main', 'carnet.json'), text);
};
const run = async (id) => runChecks((await step(id)).checks, {});
const messages = (outcome) => Object.fromEntries(outcome.failed.map((f) => [f.id, f.message]));
const FIXED = JSON.stringify({ prenom: 'Ada', objectifs: ['comprendre GraphQL'], arrivee: '2026-10-14' }, null, 2);

test('index : titre, quatre étapes, 15 min, bac à sable', async () => {
  const index = await import(new URL('../../labs/prise-en-main/index.mjs', import.meta.url));
  assert.equal(index.title, 'Prendre en main la commande lab');
  assert.deepEqual(index.steps, ['machine', 'reparer', 'predire', 'indice']);
  assert.equal(index.duration, '15 min');
  assert.deepEqual(index.sandbox, ['carnet.json']);
  assert.match(index.summary, /npx lab join/);
  assert.match(index.summary, /npx lab leave/);
});

test('chaque étape vaut 10 points', async () => {
  for (const id of ['machine', 'reparer', 'predire', 'indice']) assert.equal((await step(id)).points, 10);
});

test('machine : Node, npm et git passent sur cette machine, dès le départ', async () => {
  const outcome = await run('machine');
  assert.deepEqual(outcome.passed, ['node', 'npm', 'git']);
  assert.ok((await step('machine')).checks.every((c) => c.passesOnStart === true));
});

test('sans carnet : chaque étape du carnet dit de lancer lab start', async () => {
  for (const id of ['reparer', 'predire', 'indice']) {
    const outcome = await run(id);
    assert.ok(outcome.failed.length > 0);
    assert.match(outcome.failed[0].message, /pas de carnet : lance d'abord npx lab start prise-en-main/);
  }
});

test('carnet de départ : virgule de trop, avec la ligne ; prénom et suite renvoient à reparer', async () => {
  writeCarnet(TEMPLATE);
  const reparer = messages(await run('reparer'));
  assert.match(reparer.lisible, /carnet\.json ne se lit pas \(ligne 5, colonne 1\)/);
  assert.match(reparer.lisible, /une virgule de trop avant \} ou \] \?/);
  assert.match(reparer.prenom, /le carnet ne se lit pas encore : corrige d'abord l'erreur de lecture signalée au-dessus/);
  assert.match(messages(await run('predire')).liste, /répare d'abord le carnet/);
  assert.match(messages(await run('indice')).date, /répare d'abord le carnet/);
});

test('carnet lisible : prénom vide, liste vide, date au mauvais format', async () => {
  writeCarnet(TEMPLATE.replace('",\n}', '"\n}'));
  const reparer = await run('reparer');
  assert.deepEqual(reparer.passed, ['lisible']);
  assert.match(messages(reparer).prenom, /prenom est vide : écris ton prénom entre les guillemets/);
  const predire = await run('predire');
  assert.deepEqual(predire.passed, ['liste']);
  assert.match(messages(predire)['un-objectif'], /la liste objectifs est vide : ajoute au moins un objectif, entre guillemets/);
  assert.equal(messages(await run('indice')).date, 'arrivee est au mauvais format');
});

test('carnet corrigé : tout passe', async () => {
  writeCarnet(FIXED);
  for (const id of ['reparer', 'predire', 'indice']) assert.deepEqual((await run(id)).failed, []);
});

test('carnet Windows (BOM, CRLF) : même verdict qu’un fichier Unix', async () => {
  writeCarnet(`﻿${FIXED.replace(/\n/g, '\r\n')}`);
  for (const id of ['reparer', 'predire', 'indice']) assert.deepEqual((await run(id)).failed, []);
});

test('types inattendus : prénom nombre, objectifs texte, date impossible', async () => {
  writeCarnet(JSON.stringify({ prenom: 42, objectifs: 'tout', arrivee: '2026-02-30' }));
  assert.match(messages(await run('reparer')).prenom, /prenom doit être un texte entre guillemets/);
  assert.match(messages(await run('predire')).liste, /objectifs doit être une liste : \["…"\]/);
  assert.equal(messages(await run('indice')).date, 'arrivee est au mauvais format');
});

test('arrivee absente : le message dit ce qui manque', async () => {
  writeCarnet(JSON.stringify({ prenom: 'Ada', objectifs: ['x'] }));
  assert.match(messages(await run('indice')).date, /arrivee manque : la date de ton arrivée en formation/);
});

test('predire : prédiction fermée, attendu non', async () => {
  const { prediction } = await step('predire');
  assert.deepEqual(prediction.choices, ['oui', 'non']);
  assert.equal(prediction.expected, 'non');
  assert.equal(prediction.promptId, 'prise-en-main-liste-vide');
});

test('indice : trois indices, du plus vague au plus précis', async () => {
  const { hints } = await step('indice');
  assert.equal(hints.length, 3);
  assert.match(hints[0], /jour et le mois/);
  assert.match(hints[2], /"2026-10-14"/);
});

test('chaque étape finit sa consigne par la question de la soumission', async () => {
  for (const id of ['machine', 'reparer', 'predire', 'indice']) {
    assert.match((await step(id)).instructions, new RegExp(`npx lab submit prise-en-main ${id}`));
  }
});

test('machine sous Windows : une seule chaîne de commande, sans tableau d’arguments avec shell (DEP0190 sous Node 24)', async () => {
  const { answers } = await step('machine');
  const calls = [];
  const run = {
    execFileSync: (...args) => calls.push(['execFileSync', ...args]),
    execSync: (...args) => calls.push(['execSync', ...args])
  };
  assert.equal(answers('npm', 'win32', run), true);
  assert.deepEqual(calls.map(([fn, cmd]) => [fn, cmd]), [['execSync', 'npm --version']]);
  calls.length = 0;
  assert.equal(answers('git', 'linux', run), true);
  assert.deepEqual(calls.map(([fn, cmd, args]) => [fn, cmd, args]), [['execFileSync', 'git', ['--version']]]);
  assert.ok(!('shell' in calls[0][3]), 'pas de shell hors Windows');
  const failing = { execFileSync: () => { throw new Error('absent'); }, execSync: () => { throw new Error('absent'); } };
  assert.equal(answers('npm', 'win32', failing), false);
});

test('carnet de départ enregistré sous Windows (BOM, CRLF) : la même ligne et la même colonne', async () => {
  writeCarnet(`\uFEFF${TEMPLATE.replace(/\n/g, '\r\n')}`);
  assert.match(messages(await run('reparer')).lisible, /\(ligne 5, colonne 1\)/);
});
