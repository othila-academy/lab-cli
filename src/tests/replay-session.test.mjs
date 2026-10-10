import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { main } from '../cli.mjs';
import { ensureReplaySession, reportReplay } from '../replay.mjs';
import { startFakeEndpoint } from '../test-helpers/fake-endpoint.mjs';
import { captureIo } from '../test-helpers/io.mjs';

const catalog = [{ id: 'n1', title: 'N+1', steps: [{ id: 'observe', title: 'Observer', checks: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }] }] }];
const report = {
  lab: 'n1',
  states: [
    { state: 'start', tag: 'lab-n1-start', problems: [], results: [{ lab: 'n1', step: 'observe', passed: ['a'], failed: [{ id: 'b', label: 'B', message: 'ko' }], durationMs: 12, checks: [] }] },
    { state: 'solution', tag: 'lab-n1-solution', problems: [], results: [{ lab: 'n1', step: 'observe', passed: ['a', 'b'], failed: [], durationMs: 9, checks: [] }] }
  ]
};

let endpoint;
before(async () => {
  endpoint = await startFakeEndpoint();
  process.env.OTHILA_LAB_ROOT = fileURLToPath(new URL('../fixtures/cours/', import.meta.url));
});
after(() => {
  delete process.env.OTHILA_LAB_ROOT;
  return endpoint.close();
});
beforeEach(() => { endpoint.batches.length = 0; endpoint.sessions.length = 0; endpoint.joins.length = 0; });

async function withEndpoint(options, fn) {
  const other = await startFakeEndpoint(options);
  try {
    return await fn(other);
  } finally {
    await other.close();
  }
}

test('ensureReplaySession crée la session simulée avec le catalogue et la clé formateur', async () => {
  assert.equal(await ensureReplaySession({ endpoint: endpoint.url, key: 'cle-formateur', session: 'SIM-REPLAY', catalog }), 'created');
  assert.deepEqual(endpoint.sessions[0].body, { code: 'SIM-REPLAY', title: 'Rejeu SIM-REPLAY', simulated: true, labs: catalog });
  assert.equal(endpoint.sessions[0].authorization, 'Bearer cle-formateur');
});

test('session simulée existante (409) : reprise', async () => {
  await withEndpoint({ sessionStatus: 409, boardSimulated: true }, async (e) => {
    assert.equal(await ensureReplaySession({ endpoint: e.url, key: 'k', session: 'SIM-REPLAY', catalog }), 'existing');
  });
});

test('session réelle existante : refus avant toute inscription', async () => {
  await withEndpoint({ sessionStatus: 409, boardSimulated: false }, async (e) => {
    await assert.rejects(ensureReplaySession({ endpoint: e.url, key: 'k', session: 'GQL-2026-10', catalog }), /GQL-2026-10 existe et n'est pas simulée/);
    assert.deepEqual(e.joins, []);
  });
});

test('clé formateur refusée : message explicite', async () => {
  await withEndpoint({ sessionStatus: 401 }, async (e) => {
    await assert.rejects(ensureReplaySession({ endpoint: e.url, key: 'mauvaise', session: 'SIM-REPLAY', catalog }), /clé formateur refusée/);
  });
});

test('reportReplay : un check.completed par étape et par état, source simulator, sans recréer la session', async () => {
  const result = await reportReplay(report, { endpoint: endpoint.url, key: 'cle-formateur', session: 'SIM-REPLAY' });
  assert.deepEqual(result, { sent: 2, rejected: [] });
  assert.deepEqual(endpoint.sessions, []);
  assert.deepEqual(endpoint.joins, ['Rejeu n1 start', 'Rejeu n1 solution']);
  assert.equal(endpoint.batches.length, 2);
  const [start, solution] = endpoint.batches.map((b) => b.events[0]);
  assert.equal(endpoint.batches[0].authorization, 'Bearer cle-formateur');
  assert.equal(start.type, 'check.completed');
  assert.equal(start.source, 'simulator');
  assert.equal(start.session, 'SIM-REPLAY');
  assert.equal(start.learner, '00000000-0000-4000-8000-000000000001');
  assert.deepEqual(start.payload, { durationMs: 12, passed: ['a'], failed: [{ id: 'b', label: 'B', message: 'ko' }], courseRef: 'lab-n1-start' });
  assert.equal(solution.payload.courseRef, 'lab-n1-solution');
  assert.deepEqual(solution.payload.failed, []);
});

test('rejets du serveur : remontés tels quels', async () => {
  const strict = await startFakeEndpoint({ reject: () => 'session_not_simulated' });
  try {
    const result = await reportReplay(report, { endpoint: strict.url, key: 'k', session: 'SIM-REPLAY' });
    assert.equal(result.sent, 0);
    assert.deepEqual([...new Set(result.rejected.map((r) => r.reason))], ['session_not_simulated']);
  } finally {
    await strict.close();
  }
});

test('--session sans code : code 3', async () => {
  const io = captureIo();
  assert.equal(await main(['replay', '--session'], io), 3);
  assert.match(io.errors.join('\n'), /--session demande un code de session/);
});

test('--session sans FORMATEUR_KEY : code 3 et conseil, avant tout rejeu', async () => {
  const previous = process.env.FORMATEUR_KEY;
  delete process.env.FORMATEUR_KEY;
  try {
    const io = captureIo();
    assert.equal(await main(['replay', '--session', 'SIM-REPLAY'], io), 3);
    assert.match(io.errors.join('\n'), /FORMATEUR_KEY=… npx lab replay --session/);
    assert.equal(io.lines.some((l) => l.includes('[rejeu]')), false);
  } finally {
    if (previous !== undefined) process.env.FORMATEUR_KEY = previous;
  }
});

test('--session : serveur othila-lab injoignable, code 2 avant tout rejeu', async () => {
  const previous = process.env.FORMATEUR_KEY;
  process.env.FORMATEUR_KEY = 'cle-formateur';
  try {
    const io = captureIo();
    assert.equal(await main(['replay', '--lab', 'n1', '--session', 'SIM-REPLAY', '--endpoint', 'http://127.0.0.1:9'], io), 2);
    assert.match(io.errors.join('\n'), /injoignable/);
    assert.equal(io.lines.some((l) => l.includes('[rejeu]')), false);
  } finally {
    if (previous === undefined) delete process.env.FORMATEUR_KEY;
    else process.env.FORMATEUR_KEY = previous;
  }
});

test('--session sur une session réelle : code 1 avant tout rejeu', async () => {
  const previous = process.env.FORMATEUR_KEY;
  process.env.FORMATEUR_KEY = 'cle-formateur';
  try {
    await withEndpoint({ sessionStatus: 409, boardSimulated: false }, async (e) => {
      const io = captureIo();
      assert.equal(await main(['replay', '--lab', 'n1', '--session', 'GQL-2026-10', '--endpoint', e.url], io), 1);
      assert.match(io.errors.join('\n'), /n'est pas simulée/);
      assert.equal(io.lines.some((l) => l.includes('[rejeu]')), false);
      assert.deepEqual(e.joins, []);
    });
  } finally {
    if (previous === undefined) delete process.env.FORMATEUR_KEY;
    else process.env.FORMATEUR_KEY = previous;
  }
});
