import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { assert as labAssert, expectData, expectErrorCode, gql, waitForServer } from '../graphql.mjs';

function serve(handler) {
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      const { status, payload } = handler(JSON.parse(body));
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(payload));
    });
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ url: `http://127.0.0.1:${server.address().port}/graphql`, close: () => new Promise((r) => server.close(r)) })));
}

test('gql poste la requête, accepte un 400 de validation, lève sur un autre statut', async () => {
  const ok = await serve(({ query }) => ({ status: query.includes('bad') ? 400 : 200, payload: query.includes('bad') ? { errors: [{ message: 'Cannot query field bad' }] } : { data: { __typename: 'Query' } } }));
  try {
    assert.deepEqual((await gql(ok.url, '{ __typename }')).data, { __typename: 'Query' });
    assert.equal((await gql(ok.url, '{ bad }')).errors.length, 1);
  } finally {
    await ok.close();
  }
  const down = await serve(() => ({ status: 500, payload: {} }));
  try {
    await assert.rejects(gql(down.url, '{ __typename }'), /HTTP 500/);
  } finally {
    await down.close();
  }
});

test('assert, expectData et expectErrorCode lèvent avec le libellé', () => {
  assert.throws(() => labAssert(false, 'faux'), /faux/);
  assert.throws(() => expectData({ errors: [{ message: 'x' }] }, 'lecture'), /lecture : erreurs inattendues/);
  assert.deepEqual(expectData({ data: { a: 1 } }, 'lecture'), { a: 1 });
  assert.throws(() => expectErrorCode({ data: {} }, 'FORBIDDEN', 'accès'), /FORBIDDEN attendu, reçu aucune erreur/);
  expectErrorCode({ errors: [{ extensions: { code: 'FORBIDDEN' } }] }, 'FORBIDDEN', 'accès');
});

test('waitForServer rend la main dès que le serveur répond, lève après le délai', async () => {
  const server = await serve(() => ({ status: 200, payload: { data: { __typename: 'Query' } } }));
  try {
    await waitForServer(server.url, 1000);
  } finally {
    await server.close();
  }
  await assert.rejects(waitForServer('http://127.0.0.1:1/graphql', 300), /injoignable/);
});
