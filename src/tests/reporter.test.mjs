import { test, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { appendFileSync, existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildEvent, createReporter, describeFlush, SCHEMA } from '../reporter.mjs';
import { startFakeEndpoint } from '../test-helpers/fake-endpoint.mjs';
import { tempLabDir, writeTestSession } from '../test-helpers/tmp.mjs';

const fixtures = fileURLToPath(new URL('../fixtures/contrat/', import.meta.url));
const canonical = fileURLToPath(new URL('../../contrat/exemples/', import.meta.url));
const example = (name) => JSON.parse(readFileSync(path.join(fixtures, name), 'utf8'));
const lines = (file) => (existsSync(file) ? readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []);

let tmp;
let config;
let endpoint;
before(async () => { endpoint = await startFakeEndpoint({ reject: (e) => (e.payload?.level === 4 ? 'invalid_payload' : null) }); });
after(() => endpoint.close());
beforeEach(() => {
  tmp = tempLabDir();
  config = writeTestSession(tmp.dir, endpoint.url);
  endpoint.batches.length = 0;
});
afterEach(() => tmp.cleanup());

test("les fixtures sont les sept exemples du contrat, à l'identique", () => {
  const names = readdirSync(fixtures).filter((f) => f.endsWith('.json')).sort();
  assert.equal(names.length, 7);
  for (const name of names) assert.equal(readFileSync(path.join(fixtures, name), 'utf8'), readFileSync(path.join(canonical, name), 'utf8'), name);
});

test("buildEvent produit l'enveloppe du contrat, mêmes clés que les exemples", () => {
  const event = buildEvent(config, 'hint.revealed', { lab: 'n1', step: 'observe', payload: { level: 2 } });
  assert.deepEqual(Object.keys(event).sort(), Object.keys(example('hint.revealed.json')).sort());
  assert.equal(event.schema, SCHEMA);
  assert.match(event.id, /^[0-9a-f-]{36}$/);
  assert.equal(event.session, 'GQL-TEST');
  assert.equal(event.learner, config.learnerId);
  assert.equal(event.source, 'reporter');
  assert.match(event.at, /^\d{4}-\d{2}-\d{2}T.*Z$/);
  const joined = buildEvent(config, 'session.joined', {});
  assert.equal(joined.lab, null);
  assert.equal(joined.step, null);
  assert.deepEqual(joined.payload, {});
});

test("record écrit dans outbox.jsonl ; flush envoie, vide l'outbox et porte le jeton", async () => {
  const reporter = createReporter({ config, dir: tmp.dir });
  reporter.record('hint.revealed', { lab: 'n1', step: 'observe', payload: { level: 1 } });
  reporter.record('answer.submitted', { lab: 'n1', step: 'observe', payload: { text: 'parce que' } });
  assert.equal(lines(path.join(tmp.dir, 'outbox.jsonl')).length, 2);
  const flush = await reporter.flush();
  assert.deepEqual(flush, { sent: 2, rejected: 0, pending: 0, offline: false });
  assert.equal(lines(path.join(tmp.dir, 'outbox.jsonl')).length, 0);
  assert.equal(endpoint.batches[0].authorization, 'Bearer jeton-de-test');
  assert.equal(endpoint.batches[0].events.length, 2);
});

test("réponse partielle : le rejeté va dans rejected.jsonl avec son motif et n'est jamais renvoyé", async () => {
  const reporter = createReporter({ config, dir: tmp.dir });
  reporter.record('hint.revealed', { lab: 'n1', step: 'observe', payload: { level: 1 } });
  reporter.record('hint.revealed', { lab: 'n1', step: 'observe', payload: { level: 4 } });
  const flush = await reporter.flush();
  assert.deepEqual(flush, { sent: 1, rejected: 1, pending: 0, offline: false });
  const rejected = lines(path.join(tmp.dir, 'rejected.jsonl'));
  assert.equal(rejected.length, 1);
  assert.equal(rejected[0].reason, 'invalid_payload');
  assert.equal(rejected[0].payload.level, 4);
  assert.equal(lines(path.join(tmp.dir, 'outbox.jsonl')).length, 0);
  await reporter.flush();
  assert.equal(endpoint.batches.length, 1, 'rien à renvoyer');
});

test('serveur injoignable : offline, outbox intacte, renvoyée au flush suivant', async () => {
  const down = createReporter({ config: { ...config, endpoint: 'http://127.0.0.1:1' }, dir: tmp.dir });
  down.record('hint.revealed', { lab: 'n1', step: 'observe', payload: { level: 1 } });
  const flush = await down.flush({ timeoutMs: 500 });
  assert.equal(flush.offline, true);
  assert.equal(flush.pending, 1);
  assert.equal(lines(path.join(tmp.dir, 'outbox.jsonl')).length, 1);
  const up = createReporter({ config, dir: tmp.dir });
  assert.deepEqual(await up.flush(), { sent: 1, rejected: 0, pending: 0, offline: false });
});

test('jeton périmé (401) : offline avec le motif HTTP, outbox conservée', async () => {
  const unauthorized = await startFakeEndpoint({ status: 401 });
  const reporter = createReporter({ config: { ...config, endpoint: unauthorized.url }, dir: tmp.dir });
  reporter.record('hint.revealed', { lab: 'n1', step: 'observe', payload: { level: 1 } });
  const flush = await reporter.flush();
  assert.equal(flush.offline, true);
  assert.equal(flush.reason, 'HTTP 401');
  assert.equal(lines(path.join(tmp.dir, 'outbox.jsonl')).length, 1);
  assert.match(describeFlush(flush, true), /lab join/);
  await unauthorized.close();
});

test('plus de 500 évènements : plusieurs lots', async () => {
  const reporter = createReporter({ config, dir: tmp.dir });
  for (let i = 0; i < 501; i += 1) reporter.record('hint.revealed', { lab: 'n1', step: 'observe', payload: { level: 1 } });
  const flush = await reporter.flush();
  assert.equal(flush.sent, 501);
  assert.equal(endpoint.batches.length, 2);
  assert.equal(endpoint.batches[0].events.length, 500);
});

test('sans config ou désactivé : record renvoie null, flush ne contacte rien', async () => {
  const anonymous = createReporter({ config: null, dir: tmp.dir });
  assert.equal(anonymous.connected, false);
  assert.equal(anonymous.record('hint.revealed', { lab: 'n1', step: 'observe', payload: { level: 1 } }), null);
  assert.deepEqual(await anonymous.flush(), { sent: 0, rejected: 0, pending: 0, offline: false });
  const disabled = createReporter({ config, dir: tmp.dir, enabled: false });
  assert.equal(disabled.record('hint.revealed', { lab: 'n1', step: 'observe', payload: { level: 1 } }), null);
  assert.equal(existsSync(path.join(tmp.dir, 'outbox.jsonl')), false);
});

test("une ligne corrompue dans l'outbox (processus tué en écriture) part dans rejected.jsonl, les autres sont envoyées", async () => {
  const reporter = createReporter({ config, dir: tmp.dir });
  const event = reporter.record('hint.revealed', { lab: 'n1', step: 'observe', payload: { level: 1 } });
  appendFileSync(path.join(tmp.dir, 'outbox.jsonl'), '{"schema":"othila-lab/1","id":"tronq\n');
  const flush = await reporter.flush();
  assert.equal(flush.sent, 1);
  assert.equal(flush.offline, false);
  assert.deepEqual(endpoint.batches[0].events.map((e) => e.id), [event.id]);
  assert.deepEqual(lines(path.join(tmp.dir, 'outbox.jsonl')), []);
  const [bad] = lines(path.join(tmp.dir, 'rejected.jsonl'));
  assert.equal(bad.reason, 'unparseable');
  assert.equal(bad.line, '{"schema":"othila-lab/1","id":"tronq');
});

test('buildEvent accepte une source simulator (rejeu vers une session simulée)', () => {
  assert.equal(buildEvent(config, 'check.completed', { lab: 'n1', step: 'observe', payload: {} }).source, 'reporter');
  assert.equal(buildEvent(config, 'check.completed', { lab: 'n1', step: 'observe', payload: {}, source: 'simulator' }).source, 'simulator');
});
