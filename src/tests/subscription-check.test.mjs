import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import * as lab from '../index.mjs';
import { runChecks } from '../checks.mjs';
import { main } from '../cli.mjs';
import { NO_SERVER } from '../config.mjs';
import { makeCourse } from '../test-helpers/course.mjs';
import { startFakeWs } from '../test-helpers/fake-ws.mjs';
import { captureIo } from '../test-helpers/io.mjs';
import { tempLabDir } from '../test-helpers/tmp.mjs';

let server;
let course;
let tmp;
afterEach(async () => {
  await server?.close();
  server = null;
  course?.cleanup();
  course = null;
  tmp?.cleanup();
  tmp = null;
  delete process.env.OTHILA_LAB_ROOT;
});

const Q = 'subscription { created }';

test('@othila-academy/lab exporte subscribe', () => {
  assert.equal(typeof lab.subscribe, 'function');
});

test('chaque check a son subscribe, adresse déduite de ctx.url ; tout est fermé après un check réussi, raté ou qui lève', async () => {
  server = await startFakeWs({ onSubscribe: ({ send, id }) => send({ id, type: 'next', payload: { data: { created: 'x' } } }) });
  const opens = async ({ subscribe }) => {
    const sub = await subscribe(Q, { ready: 0 });
    return sub.next();
  };
  const outcome = await runChecks(
    [
      { id: 'passe', label: 'passe', run: async (ctx) => assert.deepEqual(await opens(ctx), { data: { created: 'x' } }) },
      { id: 'rate', label: 'rate', run: async (ctx) => { await opens(ctx); throw new Error('raté'); } },
      { id: 'leve', label: 'lève', run: async (ctx) => { await opens(ctx); throw 'pas une Error'; } }
    ],
    { url: server.httpUrl, state: {} }
  );
  assert.deepEqual(outcome.passed, ['passe']);
  assert.deepEqual(outcome.failed.map((f) => f.id), ['rate', 'leve']);
  assert.equal(server.log.subscribes.length, 3);
  assert.ok(await server.drained(), 'aucune connexion ne reste ouverte');
  assert.deepEqual(server.log.completes, ['1', '1', '1']);
});

test('un subscribe encore en cours quand le check se termine est fermé dès qu’il aboutit', async () => {
  server = await startFakeWs();
  const outcome = await runChecks(
    [{ id: 'tous', label: 'tous', run: ({ subscribe }) => Promise.all([subscribe(Q, { ready: 100 }), Promise.reject(new Error('autre échec'))]) }],
    { url: server.httpUrl }
  );
  assert.equal(outcome.failed[0].message, 'autre échec');
  // L'abonnement aboutit après la fin du check : attendre que le serveur l'ait reçu, puis le délai ready.
  for (let i = 0; i < 100 && server.log.subscribes.length === 0; i++) await new Promise((r) => setTimeout(r, 10));
  assert.equal(server.log.subscribes.length, 1);
  await new Promise((resolve) => setTimeout(resolve, 200));
  assert.ok(await server.drained(1000), 'aucune connexion ne reste ouverte');
});

test('un subscribe oublié qui échoue plus tard ne laisse pas de rejet non géré', async () => {
  server = await startFakeWs({ closeOnInit: { code: 4403, reason: 'Forbidden' } });
  const unhandled = [];
  const listener = (reason) => unhandled.push(reason);
  process.on('unhandledRejection', listener);
  try {
    const outcome = await runChecks([{ id: 'oubli', label: 'oubli', run: ({ subscribe }) => { subscribe(Q); } }], { url: server.httpUrl });
    assert.deepEqual(outcome.passed, ['oubli']);
    await new Promise((resolve) => setTimeout(resolve, 300));
  } finally {
    process.off('unhandledRejection', listener);
  }
  assert.deepEqual(unhandled, []);
});

test('sans serveur GraphQL (ctx.url nul) : subscribe lève NO_SERVER', async () => {
  const outcome = await runChecks([{ id: 's', label: 's', run: ({ subscribe }) => subscribe(Q) }], { url: null });
  assert.equal(outcome.failed[0].message, NO_SERVER);
});

test('un abonnement impossible fait échouer le check avec son message', async () => {
  server = await startFakeWs({ closeOnInit: { code: 4403, reason: 'Forbidden' } });
  const outcome = await runChecks([{ id: 's', label: 's', run: ({ subscribe }) => subscribe(Q) }], { url: server.httpUrl });
  assert.match(outcome.failed[0].message, /refuse la connexion \(4403\)/);
});

test('lab check : un check de subscription passe, la commande se termine, plus de connexion ouverte', async () => {
  server = await startFakeWs({ onSubscribe: ({ send, id }) => setTimeout(() => send({ id, type: 'next', payload: { data: { created: 'x' } } }), 20) });
  const step = `export const checks = [{ id: 'recoit', label: 'reçoit', run: async ({ subscribe }) => {
  const sub = await subscribe('subscription { created }');
  const message = await sub.next({ timeout: 1000 });
  if (message?.data?.created !== 'x') throw new Error('rien reçu');
} }];
`;
  course = makeCourse({
    labs: { s: { 'index.mjs': "export const title = 'S';\nexport const steps = ['e'];\n", 'e.mjs': step } },
    manifest: { server: 'server.mjs' }
  });
  process.env.OTHILA_LAB_ROOT = course.root;
  tmp = tempLabDir();
  const io = captureIo();
  assert.equal(await main(['check', 's', '--url', server.httpUrl, '--json', '--no-report'], io), 0);
  const [{ results }] = io.lines.map((l) => JSON.parse(l));
  assert.deepEqual(results[0].passed, ['recoit']);
  assert.ok(await server.drained());
});
