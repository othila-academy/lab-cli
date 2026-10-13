// Le client parle-t-il le vrai protocole ? useServer de graphql-ws, un schéma avec une subscription,
// un émetteur minimal à la place d'un PubSub.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { buildSchema } from 'graphql';
import { useServer } from 'graphql-ws/use/ws';
import { WebSocketServer } from 'ws';
import { subscribe } from '../subscription/client.mjs';

const schema = buildSchema('type Query { ok: Boolean } type Subscription { created: String! }');
const listeners = new Set();
const publish = (value) => {
  for (const listener of listeners) listener(value);
};
async function* created() {
  const queue = [];
  let wake = null;
  const listener = (value) => {
    queue.push(value);
    wake?.();
  };
  listeners.add(listener);
  try {
    for (;;) {
      while (queue.length > 0) yield { created: queue.shift() };
      await new Promise((resolve) => (wake = resolve));
    }
  } finally {
    listeners.delete(listener);
  }
}

let server;
let wss;
let url;
const subs = [];
before(async () => {
  server = http.createServer();
  wss = new WebSocketServer({ server, path: '/graphql' });
  useServer(
    {
      schema,
      roots: { subscription: { created } },
      onConnect: (ctx) => ctx.connectionParams?.authorization !== 'Bearer refusé'
    },
    wss
  );
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  url = `ws://127.0.0.1:${server.address().port}/graphql`;
});
after(async () => {
  for (const sub of subs) sub.close();
  await new Promise((resolve) => wss.close(resolve));
  await new Promise((resolve) => server.close(resolve));
});
const open = async (...args) => {
  const sub = await subscribe(...args);
  subs.push(sub);
  return sub;
};

test('un abonné reçoit ce qui est publié après subscribe', async () => {
  const sub = await open(url, 'subscription { created }');
  publish('a');
  assert.deepEqual(await sub.next(), { data: { created: 'a' } });
  assert.equal(await sub.next({ timeout: 200 }), null);
});

test('deux abonnés : deux connexions, chacun reçoit', async () => {
  const one = await open(url, 'subscription { created }');
  const two = await open(url, 'subscription { created }');
  publish('b');
  assert.deepEqual(await one.next(), { data: { created: 'b' } });
  assert.deepEqual(await two.next(), { data: { created: 'b' } });
});

test('champ inconnu : { errors } comme une réponse de gql', async () => {
  const sub = await open(url, 'subscription { inconnu }');
  const message = await sub.next();
  assert.match(message.errors[0].message, /Cannot query field "inconnu" on type "Subscription"/);
  assert.equal(await sub.next({ timeout: 2000 }), null);
});

test('onConnect qui refuse le jeton : 4403 et son message', async () => {
  await assert.rejects(subscribe(url, 'subscription { created }', { token: 'refusé' }), { message: /refuse la connexion \(4403\)/ });
});
