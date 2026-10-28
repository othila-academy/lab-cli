import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { browserCommand } from '../browser.mjs';
import { run } from '../commands/join.mjs';
import { main } from '../cli.mjs';
import { loadSession } from '../config.mjs';
import { getJson } from '../http.mjs';
import { startFakeEndpoint } from '../test-helpers/fake-endpoint.mjs';
import { captureIo } from '../test-helpers/io.mjs';
import { makeCourse, tinyLab } from '../test-helpers/course.mjs';
import { tempLabDir } from '../test-helpers/tmp.mjs';

const pending = { status: 200, body: { status: 'pending' } };
const joined = { status: 200, body: { status: 'joined', session: 'GQL-2026-10', learnerId: '00000000-0000-4000-8000-000000000001', token: 'jeton-du-navigateur', firstName: 'Nadia' } };

let tmp;
let project;
let originalCwd;
beforeEach(() => {
  tmp = tempLabDir();
  originalCwd = process.cwd();
  project = mkdtempSync(path.join(tmpdir(), 'lab-join-nav-'));
  process.chdir(project);
});
afterEach(() => {
  process.chdir(originalCwd);
  tmp.cleanup();
  rmSync(project, { recursive: true, force: true });
});

// Un terminal interactif capturé, un navigateur qui s'ouvre ou non, une attente instantanée.
function setup({ opens = true } = {}) {
  const io = Object.assign(captureIo(), { isTTY: true });
  const opened = [];
  const deps = { open: async (url) => { opened.push(url); return opens; }, sleep: async () => {} };
  return { io, opened, deps };
}
const out = (io) => io.lines.join('\n');

test('affiche le code, ouvre le formulaire, attend, puis enregistre la session', async () => {
  const endpoint = await startFakeEndpoint({ pairing: { polls: [pending, pending, joined] } });
  try {
    const { io, opened, deps } = setup();
    assert.equal(await run({ positionals: [], flags: { endpoint: endpoint.url }, io, deps }), 0);
    assert.match(out(io), /^Code de jonction : KQ7M-4TXP$/m);
    assert.deepEqual(opened, [`${endpoint.url}/rejoindre?code=KQ7M-4TXP`]);
    assert.match(out(io), /bienvenue Nadia, session GQL-2026-10/);
    assert.deepEqual(endpoint.pairingPolls, ['Bearer secret-de-test', 'Bearer secret-de-test', 'Bearer secret-de-test']);
    assert.deepEqual(loadSession(), { endpoint: endpoint.url, session: 'GQL-2026-10', learnerId: '00000000-0000-4000-8000-000000000001', token: 'jeton-du-navigateur', firstName: 'Nadia' });
    assert.equal(readFileSync(path.join(project, '.othila-lab', '.gitignore'), 'utf8'), 'local/\n');
  } finally {
    await endpoint.close();
  }
});

test("navigateur impossible à ouvrir : l'adresse reste affichée, --terminal est rappelé, l'attente continue", async () => {
  const endpoint = await startFakeEndpoint({ pairing: { polls: [joined] } });
  try {
    const { io, deps } = setup({ opens: false });
    assert.equal(await run({ positionals: [], flags: { endpoint: endpoint.url }, io, deps }), 0);
    assert.match(out(io), new RegExp(`Ouvre ${endpoint.url}/rejoindre\\?code=KQ7M-4TXP`));
    assert.match(out(io), /npx lab join --terminal/);
    assert.ok(loadSession());
  } finally {
    await endpoint.close();
  }
});

test('une coupure réseau pendant l’attente ne fait pas abandonner', async () => {
  const endpoint = await startFakeEndpoint({ pairing: { polls: [pending, joined] } });
  try {
    const { io, deps } = setup();
    let first = true;
    // Premier poll en échec réseau : l'attente doit continuer et le poll suivant aboutir.
    deps.getJson = async (url, options) => {
      if (first) {
        first = false;
        throw new Error('ECONNRESET');
      }
      return getJson(url, options);
    };
    assert.equal(await run({ positionals: [], flags: { endpoint: endpoint.url }, io, deps }), 0);
    assert.equal(first, false, 'la coupure simulée a bien eu lieu');
    assert.ok(loadSession());
  } finally {
    await endpoint.close();
  }
});

test('l’expiration se compte en temps, même quand chaque interrogation dure', async () => {
  const endpoint = await startFakeEndpoint({ pairing: { polls: [pending] } });
  try {
    const { io, deps } = setup();
    let clock = 0;
    let calls = 0;
    deps.now = () => clock;
    deps.sleep = async (ms) => { clock += ms; };
    // Chaque interrogation part en délai dépassé au bout de 5 s : 2 s d'attente + 5 s, sur 600 s.
    deps.getJson = async () => { calls += 1; clock += 5000; throw new Error('délai dépassé'); };
    assert.equal(await run({ positionals: [], flags: { endpoint: endpoint.url }, io, deps }), 1);
    assert.match(io.errors.join('\n'), /délai dépassé, relance npx lab join/);
    assert.ok(calls >= Math.floor(600 / 7) && calls <= Math.ceil(600 / 7) + 1, `${calls} interrogations pour 600 s`);
  } finally {
    await endpoint.close();
  }
});

test('expiration, secret refusé, session clôturée : code 1 et la marche à suivre', async () => {
  const cases = [
    [{ polls: [{ status: 410, body: { error: 'jonction expirée ou déjà utilisée' } }] }, /jonction expirée ou déjà utilisée : relance npx lab join/],
    [{ polls: [{ status: 410, body: null }] }, /délai dépassé, relance npx lab join/],
    [{ polls: [{ status: 401, body: { error: 'secret de jonction attendu' } }] }, /jonction refusée : relance npx lab join/],
    [{ polls: [{ status: 409, body: { error: 'session clôturée' } }] }, /session clôturée/],
    [{ created: { interval: 1, expiresIn: 3 }, polls: [pending] }, /délai dépassé, relance npx lab join/]
  ];
  for (const [pairing, message] of cases) {
    const endpoint = await startFakeEndpoint({ pairing });
    try {
      const { io, deps } = setup();
      assert.equal(await run({ positionals: [], flags: { endpoint: endpoint.url }, io, deps }), 1);
      assert.match(io.errors.join('\n'), message);
      assert.equal(loadSession(), null);
    } finally {
      await endpoint.close();
    }
  }
});

test('serveur othila-lab injoignable : code 2', async () => {
  const { io, deps } = setup();
  assert.equal(await run({ positionals: [], flags: { endpoint: 'http://127.0.0.1:9' }, io, deps }), 2);
  assert.match(io.errors.join('\n'), /impossible de joindre http:\/\/127\.0\.0\.1:9/);
});

test('--terminal, les options ou un terminal non interactif gardent la saisie au terminal', async () => {
  const endpoint = await startFakeEndpoint({ pairing: { polls: [joined] } });
  try {
    const viaFlag = setup();
    viaFlag.io.question = async () => { throw new Error('pas de question attendue avec les options'); };
    assert.equal(await run({ positionals: [], flags: { terminal: true, session: 'gql-test', email: 'n@x.fr', name: 'Nadia', endpoint: endpoint.url }, io: viaFlag.io, deps: viaFlag.deps }), 0);
    assert.deepEqual(viaFlag.opened, []);
    const typed = Object.assign(captureIo(['GQL-TEST', 'n@x.fr', 'Nadia']), { isTTY: true });
    assert.equal(await main(['join', '--terminal', '--endpoint', endpoint.url], typed), 0);
    const piped = captureIo(['GQL-TEST', 'n@x.fr', 'Nadia']); // isTTY absent
    assert.equal(await main(['join', '--endpoint', endpoint.url], piped), 0);
    assert.deepEqual(endpoint.pairingPolls, []);
    assert.deepEqual(endpoint.joins, ['Nadia', 'Nadia', 'Nadia']);
  } finally {
    await endpoint.close();
  }
});

test('browserCommand : open, cmd /c start, xdg-open', () => {
  const url = 'https://lab.othila-academy.com/rejoindre?code=KQ7M-4TXP';
  assert.deepEqual(browserCommand(url, 'darwin'), ['open', [url]]);
  assert.deepEqual(browserCommand(url, 'win32'), ['cmd', ['/c', 'start', '', url]]);
  assert.deepEqual(browserCommand(url, 'linux'), ['xdg-open', [url]]);
});

test('une erreur 5xx du serveur ou du proxy pendant l’attente ne fait pas abandonner', async () => {
  const endpoint = await startFakeEndpoint({ pairing: { polls: [{ status: 503, body: { error: 'base indisponible' } }, { status: 504, body: null }, joined] } });
  try {
    const { io, deps } = setup();
    assert.equal(await run({ positionals: [], flags: { endpoint: endpoint.url }, io, deps }), 0);
    assert.ok(loadSession());
  } finally {
    await endpoint.close();
  }
});

test('un serveur sans jonction par le navigateur (antérieur à la 0.6.0) : bascule sur la saisie au terminal', async () => {
  const endpoint = await startFakeEndpoint(); // pas d'appairage : POST /api/pairings répond 404
  try {
    const io = Object.assign(captureIo(['GQL-TEST', 'n@x.fr', 'Nadia']), { isTTY: true });
    const opened = [];
    assert.equal(await run({ positionals: [], flags: { endpoint: endpoint.url }, io, deps: { open: async (url) => { opened.push(url); return true; }, sleep: async () => {} } }), 0);
    assert.match(io.lines.join('\n'), /ce serveur ne propose pas la jonction par le navigateur : saisie au terminal/);
    assert.deepEqual(opened, []);
    assert.deepEqual(endpoint.joins, ['Nadia']);
  } finally {
    await endpoint.close();
  }
});

test('le rappel --terminal reste affiché même quand le navigateur s’ouvre', async () => {
  const endpoint = await startFakeEndpoint({ pairing: { polls: [joined] } });
  try {
    const { io, deps } = setup({ opens: true });
    assert.equal(await run({ positionals: [], flags: { endpoint: endpoint.url }, io, deps }), 0);
    assert.match(io.lines.join('\n'), /npx lab join --terminal/);
  } finally {
    await endpoint.close();
  }
});

test('par le navigateur aussi, le join remonte les étapes déjà faites', async () => {
  const endpoint = await startFakeEndpoint({ pairing: { polls: [joined] } });
  const course = makeCourse({ labs: { a: tinyLab('A') } });
  try {
    process.chdir(course.root);
    writeFileSync(path.join(tmp.dir, 'state.json'), JSON.stringify({ steps: { 'a/s': { state: 'vert', passed: 1, total: 1, runs: 1, submitted: false, green: true } } }));
    const { io, deps } = setup();
    assert.equal(await run({ positionals: [], flags: { endpoint: endpoint.url }, io, deps }), 0);
    const events = endpoint.batches.flatMap((b) => b.events);
    assert.deepEqual(events.map((e) => [e.type, e.session, `${e.lab}/${e.step}`]), [['step.restored', 'GQL-2026-10', 'a/s']]);
    assert.equal(endpoint.batches[0].authorization, 'Bearer jeton-du-navigateur');
    assert.match(out(io), /1 étape\(s\) déjà faite\(s\) remontée\(s\)/);
  } finally {
    course.cleanup();
    await endpoint.close();
  }
});
