import { test, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { formatEnvChecks, runEnvChecks, REQUIRED_CHECKS } from '../env.mjs';
import { main } from '../cli.mjs';
import { startFakeEndpoint } from '../test-helpers/fake-endpoint.mjs';
import { captureIo } from '../test-helpers/io.mjs';
import { tempLabDir, writeTestSession } from '../test-helpers/tmp.mjs';

let endpoint;
let tmp;
before(async () => { endpoint = await startFakeEndpoint(); });
after(() => endpoint.close());
beforeEach(() => {
  tmp = tempLabDir();
  endpoint.batches.length = 0;
  process.env.OTHILA_LAB_REGISTRY_URL = `${endpoint.url}/api/health`;
  delete process.env.HTTP_PROXY;
  delete process.env.HTTPS_PROXY;
});
afterEach(() => {
  tmp.cleanup();
  delete process.env.OTHILA_LAB_REGISTRY_URL;
});

test('tout va bien : les trois checks obligatoires et les deux informatifs', async () => {
  const checks = await runEnvChecks({ endpoint: endpoint.url, version: 'v24.1.0' });
  assert.deepEqual(checks.map((c) => c.id), ['node-version', 'npm-registry', 'endpoint', 'git', 'proxy']);
  assert.ok(REQUIRED_CHECKS.every((id) => checks.find((c) => c.id === id).ok));
  assert.equal(checks[0].detail, 'v24.1.0');
  assert.match(checks[2].detail, /^200 en \d+ ms$/);
  assert.match(checks[3].detail, /^git version/);
  assert.equal(checks[4].detail, 'aucun proxy');
  assert.ok(checks.every((c) => c.detail.length <= 200));
});

test('Node trop vieux, endpoint injoignable, proxy présent', async () => {
  process.env.HTTPS_PROXY = 'http://proxy.ecole:3128';
  const checks = await runEnvChecks({ endpoint: 'https://127.0.0.1:1', version: 'v16.20.0', timeoutMs: 500 });
  const byId = Object.fromEntries(checks.map((c) => [c.id, c]));
  assert.equal(byId['node-version'].ok, false);
  assert.match(byId['node-version'].detail, /20 minimum/);
  assert.equal(byId.endpoint.ok, false);
  assert.equal(byId.proxy.detail, 'proxy détecté : http://proxy.ecole:3128/');
  assert.match(formatEnvChecks(checks).join('\n'), /✗ node-version/);
});

test('Node 20 passe avec la mention « 24 recommandé »', async () => {
  const [node] = await runEnvChecks({ endpoint: endpoint.url, version: 'v20.19.3' });
  assert.equal(node.ok, true);
  assert.match(node.detail, /24 recommandé/);
});

test('lab env : imprime le tableau, remonte env.checked, code 0', async () => {
  writeTestSession(tmp.dir, endpoint.url);
  const io = captureIo();
  assert.equal(await main(['env'], io), 0);
  assert.match(io.lines.join('\n'), /✓ endpoint/);
  const [batch] = endpoint.batches;
  assert.equal(batch.events[0].type, 'env.checked');
  assert.equal(batch.events[0].lab, null);
  assert.ok(batch.events[0].payload.checks.some((c) => c.id === 'npm-registry'));
});

test("lab env : registre injoignable → code 1, mais l'évènement part quand même", async () => {
  writeTestSession(tmp.dir, endpoint.url);
  process.env.OTHILA_LAB_REGISTRY_URL = 'http://127.0.0.1:1/';
  const io = captureIo();
  assert.equal(await main(['env'], io), 1);
  assert.equal(endpoint.batches.length, 1);
  assert.equal(endpoint.batches[0].events[0].payload.checks.find((c) => c.id === 'npm-registry').ok, false);
});

test('lab env sans config : fonctionne, dit de lancer lab join, ne remonte rien', async () => {
  const io = captureIo();
  await main(['env', '--endpoint', endpoint.url], io);
  assert.match(io.lines.join('\n'), /lab join/);
  assert.equal(endpoint.batches.length, 0);
});

test('Node 18 est refusé, Node 20 accepté : le plancher du paquet', async () => {
  const [old] = await runEnvChecks({ endpoint: 'https://127.0.0.1:1', version: 'v18.20.4', timeoutMs: 200 });
  assert.equal(old.ok, false);
  assert.match(old.detail, /20 minimum/);
  const [floor] = await runEnvChecks({ endpoint: 'https://127.0.0.1:1', version: 'v20.0.0', timeoutMs: 200 });
  assert.equal(floor.ok, true);
});
