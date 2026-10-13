import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { httpUrlOf, subscribe, wsUrlOf } from '../subscription/client.mjs';
import { startFakeWs } from '../test-helpers/fake-ws.mjs';

const Q = 'subscription { created }';
let server;
let others = [];
let subs = [];
afterEach(async () => {
  for (const sub of subs) sub.close();
  subs = [];
  await server?.close();
  server = null;
  for (const other of others) await new Promise((done) => other.close(done));
  others = [];
});
const open = async (...args) => {
  const sub = await subscribe(...args);
  subs.push(sub);
  return sub;
};
const until = async (condition, ms = 1000) => {
  const end = Date.now() + ms;
  while (!condition() && Date.now() < end) await new Promise((r) => setTimeout(r, 10));
  return condition();
};
// Un port libre, sur lequel plus rien n'écoute.
const closedPort = () =>
  new Promise((resolve) => {
    const s = http.createServer();
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address();
      s.close(() => resolve(port));
    });
  });

test('adresses : http → ws, https → wss, et retour', () => {
  assert.equal(wsUrlOf('http://localhost:4000/graphql'), 'ws://localhost:4000/graphql');
  assert.equal(wsUrlOf('https://a.example/graphql?x=1'), 'wss://a.example/graphql?x=1');
  assert.equal(httpUrlOf('wss://a.example/graphql'), 'https://a.example/graphql');
  assert.equal(httpUrlOf('ws://localhost:4000/graphql'), 'http://localhost:4000/graphql');
});

test('chemin heureux : subscribe id 1 avec query et variables, messages dans l’ordre', async () => {
  server = await startFakeWs({
    onSubscribe: ({ send, id }) =>
      setTimeout(() => {
        send({ id, type: 'next', payload: { data: { created: 'a' } } });
        send({ id, type: 'next', payload: { data: { created: 'b' } } });
      }, 50)
  });
  const sub = await open(server.url, Q, { variables: { x: 1 } });
  assert.equal(server.log.subscribes[0].id, '1');
  assert.deepEqual(server.log.subscribes[0].payload, { query: Q, variables: { x: 1 } });
  assert.deepEqual(await sub.next(), { data: { created: 'a' } });
  assert.deepEqual(await sub.next(), { data: { created: 'b' } });
  assert.equal(sub.closed, null);
});

test('ready : subscribe ne rend la main qu’après le délai', async () => {
  server = await startFakeWs();
  await open(server.url, Q, { ready: 150 });
  assert.ok(Date.now() - server.log.subscribes[0].at >= 140);
});

test('message arrivé pendant ready : gardé dans la file', async () => {
  server = await startFakeWs({ onSubscribe: ({ send, id }) => send({ id, type: 'next', payload: { data: { created: 'tôt' } } }) });
  const sub = await open(server.url, Q, { ready: 100 });
  assert.deepEqual(await sub.next({ timeout: 10 }), { data: { created: 'tôt' } });
});

test('rien reçu : null au bout du délai', async () => {
  server = await startFakeWs();
  const sub = await open(server.url, Q, { ready: 0 });
  const started = Date.now();
  assert.equal(await sub.next({ timeout: 100 }), null);
  assert.ok(Date.now() - started >= 90);
});

test('attentes concurrentes : servies dans l’ordre', async () => {
  server = await startFakeWs({
    onSubscribe: ({ send, id }) =>
      setTimeout(() => {
        send({ id, type: 'next', payload: { data: { created: 1 } } });
        send({ id, type: 'next', payload: { data: { created: 2 } } });
      }, 50)
  });
  const sub = await open(server.url, Q, { ready: 0 });
  const [first, second] = await Promise.all([sub.next(), sub.next()]);
  assert.deepEqual([first, second], [{ data: { created: 1 } }, { data: { created: 2 } }]);
});

test('complete : la file d’abord, puis null tout de suite', async () => {
  server = await startFakeWs({
    onSubscribe: ({ send, id }) => {
      send({ id, type: 'next', payload: { data: { created: 'x' } } });
      send({ id, type: 'complete' });
    }
  });
  const sub = await open(server.url, Q, { ready: 50 });
  assert.deepEqual(await sub.next(), { data: { created: 'x' } });
  const started = Date.now();
  assert.equal(await sub.next({ timeout: 2000 }), null);
  assert.ok(Date.now() - started < 500);
});

test('error : { errors }, puis null tout de suite', async () => {
  const errors = [{ message: 'Cannot query field "x" on type "Subscription".' }];
  server = await startFakeWs({ onSubscribe: ({ send, id }) => send({ id, type: 'error', payload: errors }) });
  const sub = await open(server.url, Q, { ready: 50 });
  assert.deepEqual(await sub.next(), { errors });
  const started = Date.now();
  assert.equal(await sub.next({ timeout: 2000 }), null);
  assert.ok(Date.now() - started < 500);
});

test('fermeture pendant l’attente : null tout de suite, closed garde code et raison', async () => {
  server = await startFakeWs({ onSubscribe: ({ socket }) => setTimeout(() => socket.close(4400, 'bye'), 100) });
  const sub = await open(server.url, Q, { ready: 0 });
  const started = Date.now();
  assert.equal(await sub.next({ timeout: 3000 }), null);
  assert.ok(Date.now() - started < 1000);
  assert.deepEqual(sub.closed, { code: 4400, reason: 'bye' });
});

test('ping : le client répond pong', async () => {
  server = await startFakeWs({ onSubscribe: ({ send }) => send({ type: 'ping' }) });
  await open(server.url, Q, { ready: 0 });
  assert.ok(await until(() => server.log.pongs === 1));
});

test('message illisible : ignoré', async () => {
  server = await startFakeWs({
    onSubscribe: ({ socket, send, id }) => {
      socket.send('pas du json');
      send({ id, type: 'next', payload: { data: { created: 'ok' } } });
    }
  });
  const sub = await open(server.url, Q, { ready: 50 });
  assert.deepEqual(await sub.next(), { data: { created: 'ok' } });
});

test('close : complete envoyé, connexion fermée, idempotent, next rend null', async () => {
  server = await startFakeWs();
  const sub = await open(server.url, Q, { ready: 0 });
  sub.close();
  sub.close();
  assert.ok(await server.drained());
  assert.deepEqual(server.log.completes, ['1']);
  assert.equal(await sub.next({ timeout: 1000 }), null);
});

test('close après complete du serveur : pas de complete renvoyé', async () => {
  server = await startFakeWs({ onSubscribe: ({ send, id }) => send({ id, type: 'complete' }) });
  const sub = await open(server.url, Q, { ready: 50 });
  sub.close();
  assert.ok(await server.drained());
  assert.deepEqual(server.log.completes, []);
});

test('connectionParams et token : l’authorization du jeton l’emporte ; sans rien, pas de payload', async () => {
  server = await startFakeWs();
  await open(server.url, Q, { ready: 0, connectionParams: { a: 1, authorization: 'x' }, token: 't' });
  await open(server.url, Q, { ready: 0 });
  assert.deepEqual(server.log.inits, [{ a: 1, authorization: 'Bearer t' }, null]);
});

test('serveur arrêté : injoignable, avec l’adresse HTTP', async () => {
  const port = await closedPort();
  await assert.rejects(subscribe(`ws://127.0.0.1:${port}/graphql`, Q), {
    message: `serveur injoignable sur http://127.0.0.1:${port}/graphql : lance \`npm run start:server-js\` dans un autre terminal, ou précise --url`
  });
});

test('serveur HTTP sans WebSocket : poignée de main refusée', async () => {
  const plain = http.createServer((_req, res) => res.end('{}'));
  others.push(plain);
  await new Promise((r) => plain.listen(0, '127.0.0.1', r));
  const url = `ws://127.0.0.1:${plain.address().port}/graphql`;
  await assert.rejects(subscribe(url, Q), {
    message: `Le serveur ne répond pas en WebSocket sur ${url} : as-tu ouvert un serveur WebSocket (graphql-ws) sur ce chemin, branché sur le même serveur HTTP ?`
  });
});

test('mauvais chemin : poignée de main refusée, avec le chemin demandé', async () => {
  server = await startFakeWs({ path: '/graphql' });
  const url = `ws://127.0.0.1:${server.port}/autre`;
  await assert.rejects(subscribe(url, Q), { message: new RegExp(`ne répond pas en WebSocket sur ${url.replaceAll('/', '\\/')}`) });
});

test('pas d’ack : message, et plus de connexion', async () => {
  server = await startFakeWs({ ack: false });
  await assert.rejects(subscribe(server.url, Q, { ackTimeout: 200 }), { message: /n'a pas accepté la connexion en 0,2 s/ });
  assert.ok(await server.drained());
});

test('fermetures avant l’abonnement : 4403, 4406, autre code', async () => {
  for (const [code, reason, expected] of [
    [4403, 'Forbidden', /refuse la connexion \(4403\)/],
    [4406, 'Subprotocol not acceptable', /ne parle pas graphql-transport-ws/],
    [4400, 'Bad', /a fermé la connexion \(code 4400 : Bad\) avant l’abonnement/]
  ]) {
    server = await startFakeWs({ closeOnInit: { code, reason } });
    await assert.rejects(subscribe(server.url, Q), { message: expected });
    await server.close();
    server = null;
  }
});
