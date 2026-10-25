// Les questions posées à l'apprenant : la prédiction (toujours affichée, réponse reconnue sans exiger la frappe exacte)
// et la question de l'explication (explain), rappelée au vert et au moment de soumettre.
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { main } from '../cli.mjs';
import { loadState } from '../config.mjs';
import { makeCourse } from '../test-helpers/course.mjs';
import { captureIo } from '../test-helpers/io.mjs';
import { tempLabDir } from '../test-helpers/tmp.mjs';

let course;
let tmp;
afterEach(() => {
  course?.cleanup();
  tmp?.cleanup();
  delete process.env.OTHILA_LAB_ROOT;
});

const passe = "export const checks = [{ id: 'k', label: 'un check qui passe', run: async () => {} }];\n";
const prediction = "export const prediction = { promptId: 'p', question: 'Supprimer un adhérent référencé…', choices: ['est refusé', 'il s’arrête'], expected: 'il s’arrête' };\n";
const explain = "export const explain = 'Pourquoi la suppression est-elle refusée ?';\n";

function cours(files) {
  course = makeCourse({ labs: { q: { 'index.mjs': "export const title = 'Q';\nexport const steps = ['s'];\n", 's.mjs': files } } });
  process.env.OTHILA_LAB_ROOT = course.root;
  tmp = tempLabDir();
}

test('check --answer : la question et ses choix sont affichés quand même, avec la réponse donnée', async () => {
  cours(passe + prediction);
  const io = captureIo();
  assert.equal(await main(['check', 'q', '--answer', 'est refusé', '--no-report'], io), 0);
  const out = io.lines.join('\n');
  assert.match(out, /Avant de lancer : Supprimer un adhérent référencé…/);
  assert.match(out, /choix : est refusé · il s’arrête/);
  assert.match(out, /ta prédiction : est refusé/);
});

test('la réponse est reconnue sans majuscules, accents ni apostrophe typographique exigés', async () => {
  cours(passe + prediction);
  assert.equal(await main(['check', 'q', '--answer', "  IL S'ARRETE ", '--no-report'], captureIo()), 0);
  assert.deepEqual(loadState().predictions['q/s'], { answer: 'il s’arrête', correct: true });
});

test('au terminal, une réponse hors des choix est redemandée', async () => {
  cours(passe + prediction);
  const io = captureIo(['peut-être', 'est refuse']);
  assert.equal(await main(['check', 'q', '--no-report'], io), 0);
  assert.match(io.lines.join('\n'), /réponds par l'un des choix : est refusé · il s’arrête/);
  assert.deepEqual(loadState().predictions['q/s'], { answer: 'est refusé', correct: false });
});

test('--answer hors des choix : refusé (code 3), aucun check joué, rien d’enregistré', async () => {
  cours(passe + prediction);
  const io = captureIo();
  assert.equal(await main(['check', 'q', '--answer', 'peut-être', '--no-report'], io), 3);
  assert.match(io.errors.join('\n'), /peut-être n'est pas l'un des choix : est refusé · il s’arrête/);
  assert.equal(loadState().predictions['q/s'], undefined);
  assert.equal(loadState().steps['q/s'], undefined);
});

test('une prédiction sans choix accepte toute réponse non vide, telle quelle', async () => {
  cours(passe + "export const prediction = { promptId: 'p', question: 'Combien ?' };\n");
  assert.equal(await main(['check', 'q', '--answer', 'Trois ou quatre', '--no-report'], captureIo()), 0);
  assert.deepEqual(loadState().predictions['q/s'], { answer: 'Trois ou quatre', correct: null });
});

test('explain : rappelée quand l’étape passe au vert, et avant de lire l’explication', async () => {
  cours(passe + explain);
  const check = captureIo();
  assert.equal(await main(['check', 'q', '--no-report'], check), 0);
  assert.match(check.lines.join('\n'), /Étape validée\. .*npx lab submit q s\n  Question : Pourquoi la suppression est-elle refusée \?/);
  const submit = captureIo(['Parce que.', '']);
  assert.equal(await main(['submit', 'q', 's', '--no-report'], submit), 0);
  assert.equal(submit.lines[0], 'Question : Pourquoi la suppression est-elle refusée ?');
});

test('explain : rappelée aussi avec --text', async () => {
  cours(passe + explain);
  const io = captureIo();
  assert.equal(await main(['submit', 'q', 's', '--text', 'Parce que.', '--no-report'], io), 0);
  assert.equal(io.lines[0], 'Question : Pourquoi la suppression est-elle refusée ?');
});

test('sans explain, rien ne change', async () => {
  cours(passe);
  const io = captureIo();
  assert.equal(await main(['submit', 'q', 's', '--text', 'Parce que.', '--no-report'], io), 0);
  assert.doesNotMatch(io.lines.join('\n'), /Question :/);
});

test('explain qui n’est pas un texte : refusé au chargement de l’étape', async () => {
  cours(passe + 'export const explain = 42;\n');
  const io = captureIo();
  assert.equal(await main(['check', 'q', '--no-report'], io), 3);
  assert.match(io.errors.join('\n'), /explain : la question de l'explication, en texte/);
});
