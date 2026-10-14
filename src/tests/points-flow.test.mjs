import { test, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { main } from '../cli.mjs';
import { loadState } from '../config.mjs';
import { makeCourse } from '../test-helpers/course.mjs';
import { startFakeEndpoint } from '../test-helpers/fake-endpoint.mjs';
import { startFakeGraphql } from '../test-helpers/fake-graphql.mjs';
import { captureIo } from '../test-helpers/io.mjs';
import { tempLabDir, writeTestSession } from '../test-helpers/tmp.mjs';

// Un lab « n1 » : « observe » vaut 200 avec trois indices, « fix » 100 par défaut. Le check d'observe
// lit OTHILA_TEST_GREEN pour passer ou échouer à la demande.
const step = (points, hints) => `${points ? `export const points = ${points};\n` : ''}export const hints = ${JSON.stringify(hints)};
export const checks = [{ id: 'k', label: 'k', run: async () => { if (process.env.OTHILA_TEST_GREEN !== '1') throw new Error('ko'); } }];
`;
const course = makeCourse({
  labs: {
    n1: { 'index.mjs': "export const title = 'N+1';\nexport const steps = ['observe', 'fix'];\n", 'observe.mjs': step(200, ['q', 'd', 's']), 'fix.mjs': step(null, ['q']) },
    brouillon: { 'index.mjs': "export const title = 'Brouillon';\nexport const steps = ['s'];\n", 's.mjs': step(null, []) }
  },
  seances: [{ title: 'Séance 1', labs: ['n1'] }],
  manifest: { server: 'server.mjs' } // un cours avec serveur ; le fichier n'a pas besoin d'exister
});

let endpoint;
let graphql;
let tmp;
before(async () => {
  endpoint = await startFakeEndpoint();
  graphql = await startFakeGraphql();
  process.env.OTHILA_LAB_ROOT = course.root;
});
after(async () => {
  await endpoint.close();
  await graphql.close();
  delete process.env.OTHILA_LAB_ROOT;
  course.cleanup();
});
beforeEach(() => {
  tmp = tempLabDir();
  writeTestSession(tmp.dir, endpoint.url);
});
afterEach(() => {
  tmp.cleanup();
  delete process.env.OTHILA_TEST_GREEN;
});

const run = async (argv, { tty = false, answers = [] } = {}) => {
  const io = Object.assign(captureIo(answers), tty ? { isTTY: true } : {});
  const code = await main(argv, io);
  return { code, out: io.lines.join('\n'), err: io.errors.join('\n') };
};
const green = (on) => { process.env.OTHILA_TEST_GREEN = on ? '1' : '0'; };

test('hint annonce le coût et demande confirmation ; « non » ne révèle rien et n’envoie rien', async () => {
  const refused = await run(['hint', 'n1', 'observe'], { tty: true, answers: ['n'] });
  assert.equal(refused.code, 0);
  assert.match(refused.out, /Indice 1\/3 : ton étape passe de 200 à 180 points \(sur 200\)\./);
  assert.match(refused.out, /indice non révélé/);
  assert.equal(loadState().hints['n1/observe'], undefined);
  assert.equal(endpoint.batches.length, 0);
  const accepted = await run(['hint', 'n1', 'observe'], { tty: true, answers: ['oui'] });
  assert.match(accepted.out, /indice 1\/3 : q/);
  const second = await run(['hint', 'n1', 'observe'], { tty: true, answers: ['o'] });
  assert.match(second.out, /Indice 2\/3 : ton étape passe de 180 à 150 points/);
  assert.equal(loadState().hints['n1/observe'], 2);
});

test('--yes ou un terminal non interactif : pas de question', async () => {
  const yes = await run(['hint', 'n1', 'observe', '--yes', '--no-report'], { tty: true, answers: [] });
  assert.doesNotMatch(yes.out, /ton étape passe de/);
  assert.equal(loadState().hints['n1/observe'], 1);
  const piped = await run(['hint', 'n1', 'observe', '--no-report']);
  assert.doesNotMatch(piped.out, /ton étape passe de/);
  assert.equal(loadState().hints['n1/observe'], 2);
});

test('check annonce les points à acquérir ; submit au vert les acquiert et donne les totaux', async () => {
  await run(['hint', 'n1', 'observe', '--yes', '--no-report']);
  green(true);
  const checked = await run(['check', 'n1', 'observe', '--url', graphql.url, '--no-report']);
  assert.match(checked.out, /Étape validée\. Explique en deux phrases pour acquérir 180 points : npx lab submit n1 observe/);
  const submitted = await run(['submit', 'n1', 'observe', '--text', 'Parce que.', '--no-report']);
  assert.match(submitted.out, /\+180 points · n1 : 180 \/ 300 · formation : 180 \/ 340/);
  assert.equal(loadState().steps['n1/observe'].points, 180);
});

test('soumise en échec : rien d’acquis, et la marche à suivre ; puis au vert', async () => {
  green(false);
  await run(['check', 'n1', 'observe', '--url', graphql.url, '--no-report']);
  const early = await run(['submit', 'n1', 'observe', '--text', 'Je crois.', '--no-report']);
  assert.match(early.out, /^les points s'acquièrent sur une étape verte : npx lab check n1 observe$/m);
  assert.equal(early.out.match(/explication enregistrée/g).length, 1, 'une seule fois « explication enregistrée »');
  assert.equal(loadState().steps['n1/observe'].points, undefined);
  green(true);
  await run(['check', 'n1', 'observe', '--url', graphql.url, '--no-report']);
  const late = await run(['submit', 'n1', 'observe', '--text', 'Parce que.', '--no-report']);
  assert.match(late.out, /\+200 points/);
});

test('acquise : indice gratuit, nouveau check en échec sans perte, nouvelle soumission sans points', async () => {
  green(true);
  await run(['check', 'n1', 'observe', '--url', graphql.url, '--no-report']);
  await run(['submit', 'n1', 'observe', '--text', 'Parce que.', '--no-report']);
  const free = await run(['hint', 'n1', 'observe', '--no-report'], { tty: true, answers: [] });
  assert.match(free.out, /étape acquise : cet indice est gratuit/);
  assert.doesNotMatch(free.out, /ton étape passe de/);
  green(false);
  await run(['check', 'n1', 'observe', '--url', graphql.url, '--no-report']);
  assert.equal(loadState().steps['n1/observe'].points, 200);
  green(true);
  await run(['check', 'n1', 'observe', '--url', graphql.url, '--no-report']);
  const again = await run(['submit', 'n1', 'observe', '--text', 'Encore.', '--no-report']);
  assert.doesNotMatch(again.out, /points/);
  assert.equal(loadState().steps['n1/observe'].points, 200);
});

test('progress : points par étape, total du lab, total de la formation', async () => {
  green(true);
  await run(['check', 'n1', 'observe', '--url', graphql.url, '--no-report']);
  await run(['submit', 'n1', 'observe', '--text', 'Parce que.', '--no-report']);
  const { out } = await run(['progress']);
  assert.match(out, /^ {2}n1 · N\+1 · 200 \/ 300$/m);
  assert.match(out, /^ {4}observe +soumis +1\/1 +200\/200$/m);
  assert.match(out, /^ {4}fix +— +—\/100$/m);
  assert.match(out, /^Total : 200 \/ 340$/m);
});

test('un check injoignable après le vert compte comme un échec : soumettre ensuite n’acquiert rien, comme côté serveur', async () => {
  green(true);
  await run(['check', 'n1', 'observe', '--url', graphql.url, '--no-report']);
  const down = await run(['check', 'n1', 'observe', '--url', 'http://127.0.0.1:9', '--no-report']);
  assert.equal(down.code, 2);
  const early = await run(['submit', 'n1', 'observe', '--text', 'Parce que.', '--no-report']);
  assert.doesNotMatch(early.out, /\+\d+ points/);
  assert.match(early.out, /les points s'acquièrent sur une étape verte : npx lab check n1 observe/);
  assert.equal(loadState().steps['n1/observe'].points, undefined);
  await run(['check', 'n1', 'observe', '--url', graphql.url, '--no-report']);
  assert.match((await run(['submit', 'n1', 'observe', '--text', 'Parce que.', '--no-report'])).out, /\+200 points/);
});

test('un lab brouillon : seulement +N points, sans total de lab ni de formation', async () => {
  green(true);
  await run(['check', 'brouillon', 's', '--url', graphql.url, '--no-report']);
  const { out } = await run(['submit', 'brouillon', 's', '--text', 'Parce que.', '--no-report']);
  assert.match(out, /^\+100 points$/m);
  assert.doesNotMatch(out, /formation :/);
});
