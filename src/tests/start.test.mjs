import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { main } from '../cli.mjs';
import { branchExists, describe, isClean, tagExists } from '../git.mjs';
import { captureIo } from '../test-helpers/io.mjs';

// Un dépôt git temporaire avec un lab « demo » qui déclare un gabarit, et le tag lab-demo-start.
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

test('crée la branche depuis le tag et copie le gabarit', async () => {
  const io = captureIo();
  assert.equal(await main(['start', 'demo'], io), 0);
  assert.equal(git('branch', '--show-current'), 'lab-demo');
  assert.ok(existsSync(path.join(repo, 'packages', 'server-js', 'test', 'demo-mine.check.mjs')));
  assert.equal(readFileSync(path.join(repo, 'packages', 'server-js', 'test', 'demo-mine.check.mjs'), 'utf8'), '// gabarit\nexport const checks = [];\n');
  assert.match(io.lines.join('\n'), /packages\/server-js\/test\/demo-mine\.check\.mjs créé depuis le gabarit/);
  assert.match(io.lines.join('\n'), /lab check demo one/);
  assert.equal(isClean(), false, 'le check de l’apprenant est un nouveau fichier non suivi');
  assert.match(describe(), /^lab-demo-start/);
});

test("refuse si la branche existe, si le tag manque, ou si l'arbre est modifié", async () => {
  git('branch', 'lab-demo');
  const io1 = captureIo();
  assert.equal(await main(['start', 'demo'], io1), 1);
  assert.match(io1.errors.join('\n'), /existe déjà/);
  git('branch', '-D', 'lab-demo');
  git('tag', '-d', 'lab-demo-start');
  const io2 = captureIo();
  assert.equal(await main(['start', 'demo'], io2), 1);
  assert.match(io2.errors.join('\n'), /tag lab-demo-start introuvable/);
  git('tag', 'lab-demo-start');
  writeFileSync(path.join(repo, '.othila-lab', 'labs', 'demo', 'one.mjs'), '// modifié\n');
  const io3 = captureIo();
  assert.equal(await main(['start', 'demo'], io3), 1);
  assert.match(io3.errors.join('\n'), /modifications/);
  assert.match(io3.errors.join('\n'), /commite ton travail sur labs : git add -A && git commit/);
  assert.equal(branchExists('lab-demo'), false);
  assert.equal(tagExists('lab-demo-start'), true);
  assert.equal(tagExists('absent'), false);
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
  assert.equal(branchExists('lab-demo'), false);
});
