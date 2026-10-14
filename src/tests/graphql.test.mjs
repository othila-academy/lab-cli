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

// Un serveur qui répond toujours le même statut et le même texte (express.json() oublié : 500).
function answerWith(status, text) {
  const server = http.createServer((req, res) => {
    req.resume();
    req.on('end', () => {
      res.writeHead(status, { 'content-type': 'text/html' });
      res.end(text);
    });
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ url: `http://127.0.0.1:${server.address().port}/graphql`, close: () => new Promise((r) => server.close(r)) })));
}

test('waitForServer : un serveur qui répond par une erreur est dit, avec son statut et le début de sa réponse, sans attendre tout le délai', async () => {
  const server = await answerWith(500, '\n  req.body is not set; this probably means you forgot to set up the `json` middleware before the Apollo Server middleware.\n<br>  at stack');
  const started = Date.now();
  try {
    const error = await waitForServer(server.url, 5000).then(() => null, (e) => e);
    assert.ok(error, 'waitForServer aurait dû lever');
    assert.equal(error.status, 500);
    assert.match(error.excerpt, /^req\.body is not set; this probably means/);
    assert.doesNotMatch(error.excerpt, /at stack/);
    assert.match(error.message, /répond HTTP 500/);
    assert.ok(Date.now() - started < 2500, `trop long : ${Date.now() - started} ms`);
  } finally {
    await server.close();
  }
});

test('waitForServer : le message d’une réponse GraphQL en erreur est repris tel quel', async () => {
  const server = await serve(() => ({ status: 500, payload: { errors: [{ message: 'context creation failed: boom' }] } }));
  try {
    const error = await waitForServer(server.url, 3000).then(() => null, (e) => e);
    assert.equal(error.excerpt, 'context creation failed: boom');
  } finally {
    await server.close();
  }
});
