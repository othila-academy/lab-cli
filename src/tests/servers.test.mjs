import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { freePort, startServer } from '../servers.mjs';
import { gql } from '../graphql.mjs';
import { makeCourse, tinyLab } from '../test-helpers/course.mjs';

const tiny = fileURLToPath(new URL('../test-helpers/tiny-graphql-server.mjs', import.meta.url));

test('freePort renvoie un port libre', async () => {
  const a = await freePort();
  assert.ok(a > 0);
});

test("startServer lance le script sur un port libre, attend, puis l'arrête", async () => {
  const server = await startServer({ script: tiny, env: { TINY_CALLS: '7' } });
  assert.match(server.url, /^http:\/\/127\.0\.0\.1:\d+\/graphql$/);
  const result = await gql(server.url, '{ __typename }');
  assert.equal(result.extensions.othila.repositoryCalls, 7);
  await server.stop();
  await assert.rejects(gql(server.url, '{ __typename }'));
});

test('le script par défaut vient de OTHILA_LAB_SERVER_SCRIPT', async () => {
  process.env.OTHILA_LAB_SERVER_SCRIPT = tiny;
  const server = await startServer();
  await server.stop();
  delete process.env.OTHILA_LAB_SERVER_SCRIPT;
});

test('un script qui meurt au démarrage : erreur avec sa sortie', async () => {
  await assert.rejects(startServer({ script: tiny, env: { TINY_EXIT: '1' }, timeoutMs: 1500 }), /je refuse de démarrer/);
});

test('startServer sans script ni serveur déclaré : erreur qui le dit', async () => {
  const course = makeCourse({ labs: { a: tinyLab() } });
  const previous = process.env.OTHILA_LAB_ROOT;
  process.env.OTHILA_LAB_ROOT = course.root;
  try {
    await assert.rejects(startServer(), /cette formation n'a pas de serveur GraphQL \(server dans \.othila-lab\/formation\.json\)/);
  } finally {
    if (previous === undefined) delete process.env.OTHILA_LAB_ROOT;
    else process.env.OTHILA_LAB_ROOT = previous;
    course.cleanup();
  }
});
