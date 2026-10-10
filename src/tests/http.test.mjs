import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { getJson, postJson, proxyFor, request } from '../http.mjs';
import { startFakeEndpoint } from '../test-helpers/fake-endpoint.mjs';
import { startProxy } from '../test-helpers/proxy.mjs';

let endpoint;
let proxy;
before(async () => {
  endpoint = await startFakeEndpoint();
  proxy = await startProxy();
});
after(async () => {
  await endpoint.close();
  await proxy.close();
});
beforeEach(() => {
  for (const name of ['HTTP_PROXY', 'HTTPS_PROXY', 'NO_PROXY', 'http_proxy', 'https_proxy', 'no_proxy']) delete process.env[name];
  proxy.log.length = 0;
});

test('postJson en direct : statut et JSON', async () => {
  const { status, json } = await postJson(`${endpoint.url}/api/events`, [{ id: 'a' }]);
  assert.equal(status, 200);
  assert.deepEqual(json, { accepted: ['a'], rejected: [] });
  assert.equal(endpoint.batches.at(-1).via, null);
});

test('getJson : /api/health', async () => {
  const { status, json } = await getJson(`${endpoint.url}/api/health`);
  assert.equal(status, 200);
  assert.equal(json.ok, true);
});

test('HTTP_PROXY : la requête en clair passe par le proxy, avec un en-tête Via', async () => {
  process.env.HTTP_PROXY = proxy.url;
  const { status } = await postJson(`${endpoint.url}/api/events`, [{ id: 'b' }]);
  assert.equal(status, 200);
  assert.equal(proxy.log.length, 1);
  assert.equal(endpoint.batches.at(-1).via, 'proxy-de-test');
});

test("NO_PROXY contenant l'hôte : le proxy est ignoré", async () => {
  process.env.HTTP_PROXY = proxy.url;
  process.env.NO_PROXY = 'localhost,127.0.0.1';
  await postJson(`${endpoint.url}/api/events`, [{ id: 'c' }]);
  assert.equal(proxy.log.length, 0);
  assert.equal(proxyFor(new URL('http://127.0.0.1:4000/graphql')), null);
  assert.equal(proxyFor(new URL('http://exemple.fr/')).href, `${proxy.url}/`);
});

test('proxyFor distingue HTTP et HTTPS et accepte les minuscules', () => {
  process.env.http_proxy = 'http://p1:1';
  process.env.https_proxy = 'http://p2:2';
  assert.equal(proxyFor(new URL('http://a/')).port, '1');
  assert.equal(proxyFor(new URL('https://a/')).port, '2');
});

test('délai dépassé : erreur explicite, socket fermée', async () => {
  const slow = http.createServer(() => { /* ne répond jamais */ });
  await new Promise((resolve) => slow.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${slow.address().port}/`;
  await assert.rejects(request(url, { timeoutMs: 200 }), /délai de 200 ms dépassé/);
  slow.closeAllConnections();
  await new Promise((resolve) => slow.close(resolve));
});

test('corps non JSON : json vaut null, le statut reste', async () => {
  const { status, json } = await getJson(`${endpoint.url}/pas-une-route-json`);
  assert.equal(status, 404);
  assert.deepEqual(json, { error: 'route inconnue' });
  const plain = http.createServer((_req, res) => res.end('texte'));
  await new Promise((resolve) => plain.listen(0, '127.0.0.1', resolve));
  const r = await getJson(`http://127.0.0.1:${plain.address().port}/`);
  assert.equal(r.status, 200);
  assert.equal(r.json, null);
  await new Promise((resolve) => plain.close(resolve));
});
