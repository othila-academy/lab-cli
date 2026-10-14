import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileFailure, testFailure } from '../component/messages.mjs';

const report = (name) => JSON.parse(readFileSync(new URL(`../fixtures/vitest/${name}.json`, import.meta.url), 'utf8'));
const where = { root: path.resolve('/cours'), clientDir: path.resolve('/cours/packages/client-react') };

test('échec d’assertion avec message : seul le message de l’auteur reste', () => {
  const failure = report('mixte').testResults[0].assertionResults.find((a) => a.title === 'echec-volontaire');
  assert.equal(testFailure(failure.failureMessages[0]), "Message en français pour l'étudiant");
});

test('Error: levée par le test : préfixe retiré ; autres erreurs et assertions sans message : première ligne', () => {
  assert.equal(testFailure('Error: Le titre manque\n    at x'), 'Le titre manque');
  assert.equal(testFailure('TypeError: fetch failed\n    at y'), 'TypeError: fetch failed');
  assert.equal(testFailure('AssertionError: expected 1 to be 2 // Object.is equality'), 'AssertionError: expected 1 to be 2 // Object.is equality');
  const failure = report('export-absent').testResults[0].assertionResults.find((a) => a.title === 'liste-affiche');
  assert.match(testFailure(failure.failureMessages[0]), /^Invariant Violation: ApolloProvider was not passed a client instance/);
});

test('expect.fail(message) : préfixe AssertionError retiré ; sans message, la ligne reste', () => {
  assert.equal(testFailure('AssertionError: Après « Voir plus », rien : fetchMore ?\n    at z'), 'Après « Voir plus », rien : fetchMore ?');
  assert.equal(testFailure('AssertionError: expect.fail()'), 'AssertionError: expect.fail()');
});

test('fichier du client absent : désigné depuis la racine du dépôt', () => {
  assert.equal(fileFailure(report('fichier-absent').testResults[0].message, where), 'packages/client-react/src/EventsList.jsx introuvable : as-tu créé ce fichier ?');
});

test('paquet absent : nommé, sans son sous-chemin', () => {
  assert.equal(fileFailure(report('paquet-absent').testResults[0].message, where), "le paquet apollo-inexistant n'est pas installé pour le client (packages/client-react)");
  assert.equal(fileFailure('Failed to resolve import "@apollo/client/react" from "src/main.jsx". Does the file exist?', where), "le paquet @apollo/client n'est pas installé pour le client (packages/client-react)");
});

test('import relatif absent dans le code du client : le fichier manquant et celui qui l’importe', () => {
  assert.equal(
    fileFailure('Failed to resolve import "./Foo.jsx" from "src/App.jsx". Does the file exist?', where),
    'packages/client-react/src/Foo.jsx introuvable (importé par packages/client-react/src/App.jsx)'
  );
});

test('erreur de compilation : fichier, ligne, message, sans codes couleur', () => {
  assert.equal(
    fileFailure(report('syntaxe').testResults[0].message, where),
    "packages/client-react/src/EventsList.jsx ne compile pas (ligne 1) : Unexpected token. Did you mean `{'}'}` or `&rbrace;`?"
  );
  assert.equal(
    fileFailure('Transform failed with 1 error:\n/cours/packages/client-react/src/A.jsx:3:7: ERROR: Expected ";" but found "x"', where),
    'packages/client-react/src/A.jsx ne compile pas (ligne 3) : Expected ";" but found "x"'
  );
});

test('client à la racine du dépôt : chemins sans préfixe', () => {
  const atRoot = { root: path.resolve('/cours'), clientDir: path.resolve('/cours') };
  assert.equal(fileFailure('Failed to resolve import "@client/src/A.jsx" from "x". Does the file exist?', atRoot), 'src/A.jsx introuvable : as-tu créé ce fichier ?');
  assert.equal(fileFailure('Failed to resolve import "react" from "src/A.jsx". Does the file exist?', atRoot), "le paquet react n'est pas installé pour le client (.)");
});

test('autre erreur de fichier : première ligne non vide', () => {
  assert.equal(fileFailure('\nquelque chose a cassé\ndétail', where), 'quelque chose a cassé');
});

test('paquet introuvable depuis un test du lab : le client doit être un workspace, ou ses dépendances à la racine', () => {
  assert.equal(
    fileFailure('Failed to resolve import "@testing-library/react" from "../../.othila-lab/labs/client-apollo/tests/liste.test.jsx". Does the file exist?', where),
    "le paquet @testing-library/react est introuvable depuis .othila-lab/labs/client-apollo/tests/liste.test.jsx : installe-le dans le client, qui doit être un workspace du cours (ou à la racine du dépôt)"
  );
});

// Messages réels de Vitest 5 (rapport JSON), pile d'appels raccourcie.
test('message d’auteur sur plusieurs lignes, ou qui contient lui-même « : expected » : rendu en entier', () => {
  assert.equal(
    testFailure('AssertionError: Première ligne.\nDeuxième ligne : expected à la fin ?: expected 1 to be 2 // Object.is equality\n    at /x/sample.test.mjs:2:7'),
    'Première ligne. Deuxième ligne : expected à la fin ?'
  );
  assert.equal(
    testFailure('AssertionError: Le titre : expected « A » ici: expected 1 to be 2 // Object.is equality\n    at /x/sample.test.mjs:3:7'),
    'Le titre : expected « A » ici'
  );
  // La valeur reçue peut elle aussi contenir « : expected » : le message de l'auteur s'arrête avant.
  assert.equal(
    testFailure("AssertionError: Le message: expected 'a: expected b' to be 'c' // Object.is equality\n    at /x/sample.test.mjs:5:7"),
    'Le message'
  );
  assert.equal(testFailure('Error: Le titre manque,\nrelis la consigne\n    at x'), 'Le titre manque, relis la consigne');
});

test('délai de Vitest dépassé : dit en français, en secondes', () => {
  const timedOut = (ms) =>
    `Error: Test timed out in ${ms}ms.\nIf this is a long-running test, pass a timeout value as the last argument or configure it globally with "testTimeout".\n    at task (file:///x/vitest/dist/runner.js:1:1)`;
  assert.equal(testFailure(timedOut(5000)), 'le test a dépassé 5 s : un composant attend-il une réponse qui ne vient pas ?');
  assert.equal(testFailure(timedOut(300)), 'le test a dépassé 0,3 s : un composant attend-il une réponse qui ne vient pas ?');
});

test('Vitest ne démarre pas : la première erreur, sans pile ni couleurs ; à défaut, la fin de la sortie', async () => {
  const { startupFailure } = await import('../component/messages.mjs');
  const config = '/lab-cli/src/component/vitest.config.mjs';
  const stderr = '\x1b[31m⎯⎯⎯ Startup Error ⎯⎯⎯\x1b[0m\nError: Browser Mode was enabled, but provider was not specified anywhere.\n    at resolveConfig (file:///x.js:1:1)\n';
  assert.equal(startupFailure(stderr, where, config), 'Vitest ne démarre pas : Browser Mode was enabled, but provider was not specified anywhere.');
  assert.equal(
    startupFailure(`failed to load config from ${config}\nsortie inattendue\n    at x (y.js:1:1)\nfin`, where, config),
    'Vitest ne démarre pas : failed to load config from /lab-cli/src/component/vitest.config.mjs sortie inattendue fin'
  );
});
