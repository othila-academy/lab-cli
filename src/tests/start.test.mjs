import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { main } from '../cli.mjs';
import { isClean } from '../git.mjs';
import { captureIo } from '../test-helpers/io.mjs';

// Un dépôt git temporaire avec un lab « demo » qui déclare un gabarit ; le tag lab-demo-start, de l'ancien modèle, n'est plus lu.
let repo;
let originalCwd;
const git = (...args) => execFileSync('git', args, { cwd: repo, stdio: 'pipe' }).toString().trim();

before(() => { originalCwd = process.cwd(); });
after(() => process.chdir(originalCwd));
beforeEach(() => {
  repo = mkdtempSync(path.join(tmpdir(), 'lab-start-'));
  const home = path.join(repo, '.othila-lab');
  const labs = path.join(home, 'labs');
  mkdirSync(path.join(labs, 'demo'), { recursive: true });
  writeFileSync(path.join(labs, 'demo', 'index.mjs'), "export const title = 'Démo';\nexport const steps = ['one'];\nexport const mine = { template: 'mine.template.mjs', target: 'packages/server-js/test/demo-mine.check.mjs' };\n");
  writeFileSync(path.join(labs, 'demo', 'one.mjs'), "export const checks = [{ id: 'a', label: 'a', run: async () => {} }];\n");
  writeFileSync(path.join(labs, 'demo', 'mine.template.mjs'), '// gabarit\nexport const checks = [];\n');
  writeFileSync(path.join(home, 'formation.json'), JSON.stringify({ id: 'demo-cours', title: 'Démo', seances: [{ title: 'Séance 1', labs: ['demo'] }] }));
  writeFileSync(path.join(home, '.gitignore'), 'local/\n');
  git('init', '-q', '-b', 'labs');
  git('-c', 'user.name=t', '-c', 'user.email=t@t', 'add', '.');
  git('-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '-m', 'init');
  git('tag', 'lab-demo-start');
  process.chdir(repo);
});

test('affiche la fiche et copie le gabarit, sans changer de branche ni chercher de tag', async () => {
  git('tag', '-d', 'lab-demo-start');
  const head = git('rev-parse', 'HEAD');
  const io = captureIo();
  assert.equal(await main(['start', 'demo'], io), 0);
  assert.equal(git('branch', '--show-current'), 'labs');
  assert.equal(git('rev-parse', 'HEAD'), head);
  assert.equal(git('branch', '--list').split('\n').length, 1);
  const mine = path.join(repo, 'packages', 'server-js', 'test', 'demo-mine.check.mjs');
  assert.equal(readFileSync(mine, 'utf8'), '// gabarit\nexport const checks = [];\n');
  assert.match(io.lines.join('\n'), /packages\/server-js\/test\/demo-mine\.check\.mjs créé depuis le gabarit/);
  assert.match(io.lines.join('\n'), /lab check demo one/);
  assert.doesNotMatch(io.lines.join('\n'), /branche/);
});

test('le gabarit déjà copié n’est pas écrasé ; un arbre modifié ne bloque pas', async () => {
  const mine = path.join(repo, 'packages', 'server-js', 'test', 'demo-mine.check.mjs');
  mkdirSync(path.dirname(mine), { recursive: true });
  writeFileSync(mine, '// mon check\n');
  writeFileSync(path.join(repo, '.othila-lab', 'labs', 'demo', 'one.mjs'), "export const checks = [{ id: 'a', label: 'a', run: async () => {} }];\n// modifié\n");
  const io = captureIo();
  assert.equal(await main(['start', 'demo'], io), 0);
  assert.equal(readFileSync(mine, 'utf8'), '// mon check\n');
  assert.doesNotMatch(io.lines.join('\n'), /créé depuis le gabarit/);
  assert.equal(isClean(), false);
});

test('lab inconnu : code 3 et le conseil npx lab update', async () => {
  const io = captureIo();
  assert.equal(await main(['start', 'nouveau'], io), 3);
  assert.match(io.errors.join('\n'), /lab inconnu : nouveau \(disponibles : demo\) ; npx lab update pour récupérer les nouveaux labs/);
});

test("l'ancien état local, à la racine de .othila-lab/, bloque lab start sans conseiller de le commiter", async () => {
  // Un dépôt migré : la ligne .othila-lab/ a quitté le .gitignore, l'ancien jeton et l'ancienne progression restent.
  writeFileSync(path.join(repo, '.othila-lab', 'config.json'), '{"token":"secret"}');
  writeFileSync(path.join(repo, '.othila-lab', 'state.json'), '{}');
  const io = captureIo();
  assert.equal(await main(['start', 'demo'], io), 1);
  const err = io.errors.join('\n');
  assert.match(err, /ancien état local : \.othila-lab\/config\.json, \.othila-lab\/state\.json/);
  assert.match(err, /mv \.othila-lab\/state\.json \.othila-lab\/local\//);
  assert.doesNotMatch(err, /git add/);
  assert.equal(git('branch', '--show-current'), 'labs');
});
