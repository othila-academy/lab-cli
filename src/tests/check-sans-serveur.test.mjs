import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { main } from '../cli.mjs';
import { makeCourse } from '../test-helpers/course.mjs';
import { captureIo } from '../test-helpers/io.mjs';
import { tempLabDir } from '../test-helpers/tmp.mjs';

let course;
let tmp;
afterEach(() => {
  course?.cleanup();
  tmp?.cleanup();
  delete process.env.OTHILA_LAB_ROOT;
});

const step = `export const checks = [
  { id: 'local', label: 'un check sans serveur', run: async ({ url }) => { if (url !== null) throw new Error('url ' + url); } },
  { id: 'requete', label: 'un check qui interroge le serveur', run: async ({ gql }) => { await gql('{ __typename }'); } }
];
`;

test('formation sans serveur : rien n’est attendu, gql le dit, code 1 et jamais 2', async () => {
  course = makeCourse({ labs: { f: { 'index.mjs': "export const title = 'F';\nexport const steps = ['s'];\n", 's.mjs': step } } });
  process.env.OTHILA_LAB_ROOT = course.root;
  tmp = tempLabDir();
  const io = captureIo();
  const started = Date.now();
  assert.equal(await main(['check', 'f', '--json', '--no-report'], io), 1);
  assert.ok(Date.now() - started < 4000, 'aucune attente de serveur');
  const [{ results }] = io.lines.map((l) => JSON.parse(l));
  assert.deepEqual(results[0].passed, ['local']);
  assert.equal(results[0].failed.length, 1);
  assert.equal(results[0].failed[0].id, 'requete');
  assert.match(results[0].failed[0].message, /cette formation n'a pas de serveur GraphQL/);
});
