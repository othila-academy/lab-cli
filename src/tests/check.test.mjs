import { test, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { main } from '../cli.mjs';
import { loadState } from '../config.mjs';
import { startFakeEndpoint } from '../test-helpers/fake-endpoint.mjs';
import { startFakeGraphql } from '../test-helpers/fake-graphql.mjs';
import { captureIo } from '../test-helpers/io.mjs';
import { tempLabDir, writeTestSession } from '../test-helpers/tmp.mjs';

let endpoint;
let graphql;
let tmp;
before(async () => {
  endpoint = await startFakeEndpoint();
  graphql = await startFakeGraphql();
  process.env.OTHILA_LAB_ROOT = fileURLToPath(new URL('../fixtures/cours/', import.meta.url));
});
after(async () => {
  await endpoint.close();
  await graphql.close();
  delete process.env.OTHILA_LAB_ROOT;
});
beforeEach(() => {
  tmp = tempLabDir();
  writeTestSession(tmp.dir, endpoint.url);
  endpoint.batches.length = 0;
});
afterEach(() => tmp.cleanup());

const types = () => endpoint.batches.flatMap((b) => b.events.map((e) => e.type));

test('check --json : résultats, prédiction juste, évènements remontés, code 1', async () => {
  const io = captureIo();
  assert.equal(await main(['check', 'demo', '--url', graphql.url, '--answer', '2', '--json'], io), 1);
  const { results, flush } = JSON.parse(io.lines.at(-1));
  assert.equal(results.length, 1);
  assert.deepEqual(results[0].passed, ['typename']);
  assert.equal(results[0].failed[0].id, 'always-fails');
  assert.deepEqual(results[0].checks, [{ id: 'typename', passesOnStart: true }, { id: 'always-fails', passesOnStart: false }]);
  assert.deepEqual(results[0].prediction, { answer: '2', correct: true });
  assert.equal(flush.sent, 2);
  assert.deepEqual(types(), ['prediction.submitted', 'check.completed']);
  const completed = endpoint.batches[0].events[1];
  assert.equal(completed.lab, 'demo');
  assert.equal(completed.step, 'one');
  assert.equal(typeof completed.payload.courseRef, 'string');
  assert.match(completed.payload.stepDigest, /^[0-9a-f]{64}$/);
  assert.equal(loadState().predictions['demo/one'].correct, true);
});

test("la prédiction n'est demandée qu'une fois ; ensuite --answer est ignoré", async () => {
  await main(['check', 'demo', '--url', graphql.url, '--answer', '2', '--json'], captureIo());
  endpoint.batches.length = 0;
  await main(['check', 'demo', '--url', graphql.url, '--answer', '1', '--json'], captureIo());
  assert.deepEqual(types(), ['check.completed']);
  assert.equal(loadState().predictions['demo/one'].answer, '2');
});

test("sortie humaine : ✓, ✗, la prédiction comparée à l'attendu, et la ligne de remontée", async () => {
  const io = captureIo(['1']);
  assert.equal(await main(['check', 'demo', 'one', '--url', graphql.url], io), 1);
  const text = io.lines.join('\n');
  assert.match(text, /Avant de lancer : Combien \?/);
  assert.match(text, /✓ __typename répond/);
  assert.match(text, /✗ un check qui échoue\n\s+échec attendu/);
  assert.match(text, /prédiction : 1 · attendu 2/);
  assert.match(text, /2 évènement\(s\) envoyé\(s\) au formateur/);
});

test('serveur du fil rouge injoignable : code 2, check.completed avec server-unreachable, conseil', async () => {
  const io = captureIo();
  assert.equal(await main(['check', 'demo', '--url', 'http://127.0.0.1:1/graphql', '--answer', '2'], io), 2);
  const completed = endpoint.batches[0].events.find((e) => e.type === 'check.completed');
  assert.deepEqual(completed.payload.passed, []);
  assert.equal(completed.payload.failed[0].id, 'server-unreachable');
  assert.match(io.lines.join('\n'), /npm run start:server-js/);
});

test("--no-report : rien n'est enregistré ni envoyé", async () => {
  await main(['check', 'demo', '--url', graphql.url, '--answer', '2', '--no-report', '--json'], captureIo());
  assert.equal(endpoint.batches.length, 0);
  assert.equal(existsSync(path.join(tmp.dir, 'outbox.jsonl')), false);
});

test("sans config : le check tourne, dit de lancer lab join, rien n'est écrit", async () => {
  tmp.cleanup();
  tmp = tempLabDir();
  const io = captureIo();
  assert.equal(await main(['check', 'demo', '--url', graphql.url, '--answer', '2'], io), 1);
  assert.match(io.lines.join('\n'), /lab join/);
  assert.equal(existsSync(path.join(tmp.dir, 'outbox.jsonl')), false);
});

test("erreurs d'usage : sans lab, étape inconnue → 3", async () => {
  assert.equal(await main(['check'], captureIo()), 3);
  const io = captureIo();
  assert.equal(await main(['check', 'demo', 'two', '--url', graphql.url], io), 3);
  assert.match(io.errors.join('\n'), /étape inconnue/);
});

test('check --json sans --answer : aucune question posée, prédiction nulle, checks joués (cas du rejeu)', async () => {
  const io = captureIo();
  assert.equal(await main(['check', 'demo', '--url', graphql.url, '--json', '--no-report'], io), 1);
  const [{ results }] = io.lines.map((l) => JSON.parse(l));
  assert.equal(results[0].prediction, null);
  assert.deepEqual(results[0].passed, ['typename']);
  assert.equal(loadState().predictions['demo/one'], undefined);
});

test('serveur du fil rouge qui répond par une erreur : code 1, server-error, statut et début de réponse, pas de « lance npm run »', async () => {
  const http = await import('node:http');
  const broken = http.createServer((req, res) => {
    req.resume();
    req.on('end', () => {
      res.writeHead(500, { 'content-type': 'text/html' });
      res.end('req.body is not set; this probably means you forgot to set up the `json` middleware');
    });
  });
  await new Promise((resolve) => broken.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${broken.address().port}/graphql`;
  try {
    const io = captureIo();
    assert.equal(await main(['check', 'demo', '--url', url, '--answer', '2'], io), 1);
    const completed = endpoint.batches[0].events.find((e) => e.type === 'check.completed');
    assert.equal(completed.payload.failed[0].id, 'server-error');
    const text = io.lines.join('\n');
    assert.match(text, /répond HTTP 500 sur http:\/\/127\.0\.0\.1:\d+\/graphql/);
    assert.match(text, /req\.body is not set/);
    assert.match(text, /console du serveur/);
    assert.doesNotMatch(text, /npm run start:server-js/);
  } finally {
    await new Promise((resolve) => broken.close(resolve));
  }
});
