import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { outcomeOf } from '../component/results.mjs';

const fixture = (name) => JSON.parse(readFileSync(new URL(`../fixtures/vitest/${name}.json`, import.meta.url), 'utf8'));
const where = {
  labDir: path.resolve('/cours/.othila-lab/labs/client-apollo'),
  root: path.resolve('/cours'),
  clientDir: path.resolve('/cours/packages/client-react')
};
const file = 'tests/liste.test.jsx';

test('test passé : null ; test en échec : le message traduit', () => {
  assert.equal(outcomeOf(fixture('mixte'), { ...where, file, test: 'liste-affiche' }), null);
  assert.equal(outcomeOf(fixture('mixte'), { ...where, file, test: 'echec-volontaire' }), "Message en français pour l'étudiant");
});

test('fichier qui ne charge pas : son message traduit pour chaque check', () => {
  assert.equal(outcomeOf(fixture('fichier-absent'), { ...where, file, test: 'liste-affiche' }), 'packages/client-react/src/EventsList.jsx introuvable : as-tu créé ce fichier ?');
});

test('test introuvable, fichier absent du rapport, test non joué', () => {
  assert.equal(outcomeOf(fixture('mixte'), { ...where, file, test: 'inconnu' }), 'test « inconnu » introuvable dans tests/liste.test.jsx');
  assert.equal(outcomeOf(fixture('mixte'), { ...where, file: 'tests/autre.test.jsx', test: 'x' }), 'aucun résultat pour tests/autre.test.jsx : Vitest ne l’a pas joué');
  const skipped = { testResults: [{ name: path.join(where.labDir, file), status: 'passed', message: '', assertionResults: [{ ancestorTitles: [], fullName: 't', title: 't', status: 'skipped', failureMessages: [] }] }] };
  assert.equal(outcomeOf(skipped, { ...where, file, test: 't' }), 'le test « t » n’a pas été joué (skipped)');
});

test('nom complet avec describe : accepté comme le titre', () => {
  const nested = { testResults: [{ name: path.join(where.labDir, file), status: 'passed', message: '', assertionResults: [{ ancestorTitles: ['liste'], fullName: 'liste affiche', title: 'affiche', status: 'passed', failureMessages: [] }] }] };
  assert.equal(outcomeOf(nested, { ...where, file, test: 'liste affiche' }), null);
  assert.equal(outcomeOf(nested, { ...where, file, test: 'affiche' }), null);
});

const tmp = mkdtempSync(path.join(tmpdir(), 'othila-liens-'));
after(() => rmSync(tmp, { recursive: true, force: true }));

test('chemins par lien symbolique (/var ↔ /private/var) : la correspondance tient', () => {
  const real = path.join(tmp, 'reel');
  mkdirSync(path.join(real, 'tests'), { recursive: true });
  writeFileSync(path.join(real, file), '');
  const link = path.join(tmp, 'lien');
  symlinkSync(real, link, process.platform === 'win32' ? 'junction' : 'dir');
  const report = { testResults: [{ name: path.join(realpathSync(real), file), status: 'passed', message: '', assertionResults: [{ ancestorTitles: [], fullName: 't', title: 't', status: 'passed', failureMessages: [] }] }] };
  assert.equal(outcomeOf(report, { ...where, labDir: link, file, test: 't' }), null);
});
