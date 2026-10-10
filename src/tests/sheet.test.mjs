import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { main } from '../cli.mjs';
import { formation } from '../config.mjs';
import { describeLab, loadLab } from '../labs.mjs';
import { formatCatalog, formatSheet } from '../sheet.mjs';
import { makeCourse } from '../test-helpers/course.mjs';
import { captureIo } from '../test-helpers/io.mjs';

const root = fileURLToPath(new URL('../fixtures/cours/', import.meta.url));
const fixture = formation(root);

// Un lab à trois étapes, sans les champs facultatifs sur la deuxième.
const three = {
  id: 'trois', title: 'Trois étapes', seance: 'Séance 2 · Schéma', duration: '20 min',
  summary: 'Un contexte.\nSur deux lignes.', objectives: ['premier objectif', 'second objectif'],
  steps: [
    { id: 'a', title: 'Étape A', instructions: 'Fais A.', checks: [{ id: 'x', label: 'x passe' }] },
    { id: 'b', title: 'Étape B', instructions: null, checks: [{ id: 'y', label: 'y passe' }, { id: 'z', label: 'z passe' }] },
    { id: 'c', title: 'Étape C', instructions: 'Fais C.', checks: [{ id: 'w', label: 'w passe' }] }
  ]
};

test('describeLab lit les champs facultatifs du lab et la consigne de chaque étape', async () => {
  const lab = await describeLab('demo', fixture);
  assert.equal(lab.seance, 'Séance 0 · Démonstration');
  assert.equal(lab.duration, '10 min');
  assert.equal(lab.summary, 'Un serveur répond à __typename.\nUn des checks échoue exprès.');
  assert.deepEqual(lab.objectives, ['lancer un check', 'lire un échec']);
  assert.equal(lab.steps[0].instructions, "Lance le check de l'étape.\nObserve celui qui échoue.");
  assert.deepEqual(lab.steps[0].checks.map((c) => c.label), ['__typename répond', 'un check qui échoue']);
});

test('la fiche complète : en-tête, contexte, objectifs, étapes, ce qui sera vérifié, commande suivante', () => {
  const text = formatSheet(three).join('\n');
  assert.match(text, /^Trois étapes · Séance 2 · Schéma · 20 min$/m);
  assert.match(text, /^Un contexte\.\nSur deux lignes\.$/m);
  assert.match(text, /^Objectifs\n {2}• premier objectif\n {2}• second objectif$/m);
  assert.match(text, /^Étape 1\/3 · a · Étape A\n {2}Fais A\.\n {2}Ce qui sera vérifié :\n {4}□ x passe$/m);
  assert.match(text, /^Étape 2\/3 · b · Étape B\n {2}Ce qui sera vérifié :\n {4}□ y passe\n {4}□ z passe$/m);
  assert.match(text, /^Ensuite : npx lab check trois a$/m);
});

test('la fiche d’une seule étape garde sa position et propose son propre check', () => {
  const text = formatSheet(three, { step: 'c' }).join('\n');
  assert.match(text, /^Étape 3\/3 · c · Étape C$/m);
  assert.doesNotMatch(text, /Étape A|Étape B/);
  assert.match(text, /^Ensuite : npx lab check trois c$/m);
  assert.throws(() => formatSheet(three, { step: 'absente' }), /étape inconnue : absente \(étapes de trois : a, b, c\)/);
});

test('sans champs facultatifs : le titre seul, ni contexte ni objectifs', () => {
  const bare = { id: 'nu', title: 'Nu', seance: null, duration: null, summary: null, objectives: [], steps: [{ id: 's', title: 's', instructions: null, checks: [{ id: 'k', label: 'k' }] }] };
  const text = formatSheet(bare).join('\n');
  assert.match(text, /^Nu · hors formation$/m);
  assert.doesNotMatch(text, /Objectifs|undefined|null/);
});

test('le catalogue en tableau : groupé par séance, colonnes alignées, brouillons à part', () => {
  const second = { ...three, id: 'deux', title: 'Deux', seance: 'Séance 3 · Perf', duration: null };
  const draft = { ...three, id: 'nu', title: 'Nu', seance: null, duration: null };
  const lines = formatCatalog([three, second], [draft]);
  assert.match(lines[0], /^Labs du cours · 2$/);
  const header = lines.find((l) => l.includes('Titre'));
  assert.ok(header, 'ligne d’en-tête attendue');
  assert.doesNotMatch(header, /Séance|Section/);
  const row = lines.find((l) => l.includes('trois'));
  for (const [column, value] of [['Titre', 'Trois étapes'], ['Durée', '20 min']]) {
    assert.equal(row.indexOf(value), header.indexOf(column), `${column} aligné`);
  }
  assert.match(row, /\b3\s+4\b/, 'trois étapes, quatre checks');
  const at = (text) => lines.indexOf(text);
  assert.ok(at('Séance 2 · Schéma') > 0 && at('Séance 2 · Schéma') < lines.indexOf(row));
  assert.ok(lines.indexOf(row) < at('Séance 3 · Perf'));
  assert.ok(at('Hors formation · brouillons, jamais publiés') > at('Séance 3 · Perf'));
  assert.match(lines.find((l) => l.includes(' nu ')), /—/);
  assert.match(lines.at(-1), /npx lab show <lab>/);
});

test('lab catalog : tableau dans un terminal, JSON sinon ou avec --json', async () => {
  process.env.OTHILA_LAB_ROOT = root;
  try {
    const io = captureIo();
    Object.assign(io, { isTTY: true });
    assert.equal(await main(['catalog'], io), 0);
    assert.match(io.lines.join('\n'), /^Séance 0 · Démonstration\n {2}demo\s+Lab de démonstration/m);
    const json = captureIo();
    Object.assign(json, { isTTY: true });
    assert.equal(await main(['catalog', '--json'], json), 0);
    assert.equal(JSON.parse(json.lines.join('\n')).labs[0].id, 'demo');
    const piped = captureIo();
    Object.assign(piped, { isTTY: false });
    assert.equal(await main(['catalog'], piped), 0);
    assert.equal(JSON.parse(piped.lines.join('\n')).labs[0].id, 'demo');
  } finally {
    delete process.env.OTHILA_LAB_ROOT;
  }
});

test('lab show : la fiche d’un lab ou d’une étape, sans toucher à git ; lab inconnu en code 3', async () => {
  process.env.OTHILA_LAB_ROOT = root;
  try {
    const io = captureIo();
    assert.equal(await main(['show', 'demo'], io), 0);
    assert.match(io.lines.join('\n'), /^Lab de démonstration · Séance 0 · Démonstration · 10 min$/m);
    assert.match(io.lines.join('\n'), /□ un check qui échoue/);
    const step = captureIo();
    assert.equal(await main(['show', 'demo', 'one'], step), 0);
    assert.match(step.lines.join('\n'), /^Étape 1\/1 · one · Une étape \(100 points\)$/m);
    const unknown = captureIo();
    assert.equal(await main(['show', 'absent'], unknown), 3);
    assert.match(unknown.errors.join('\n'), /lab inconnu : absent/);
    const usage = captureIo();
    assert.equal(await main(['show'], usage), 3);
  } finally {
    delete process.env.OTHILA_LAB_ROOT;
  }
});

test('loadLab refuse des objectifs qui ne sont pas une liste de phrases', async () => {
  const course = makeCourse({ labs: { bad: { 'index.mjs': "export const title = 'x';\nexport const steps = ['s'];\nexport const objectives = 'une phrase';\n" } } });
  try {
    await assert.rejects(loadLab('bad', formation(course.root)), /objectives doit être une liste de phrases/);
  } finally {
    course.cleanup();
  }
});

test('la fiche affiche la valeur de chaque étape, le catalogue le total du lab', () => {
  const valued = { ...three, steps: three.steps.map((s, i) => ({ ...s, points: [50, 100, 200][i] })) };
  const text = formatSheet(valued).join('\n');
  assert.match(text, /^Étape 1\/3 · a · Étape A \(50 points\)$/m);
  assert.match(text, /^Étape 3\/3 · c · Étape C \(200 points\)$/m);
  const lines = formatCatalog([valued]);
  const header = lines.find((l) => l.includes('Titre'));
  const row = lines.find((l) => l.includes('trois'));
  assert.equal(row.indexOf('350'), header.indexOf('Points') + 'Points'.length - '350'.length, 'total aligné à droite sous Points');
});
