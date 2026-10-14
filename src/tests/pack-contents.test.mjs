import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { packedFiles, unexpectedFiles } from '../../scripts/pack-contents.mjs';

const cli = fileURLToPath(new URL('../../', import.meta.url));

test('le contenu admis : code, contrat, points, README, LICENSE ; ni tests, ni fixtures, ni outillage du dépôt', () => {
  const ok = ['package.json', 'README.md', 'LICENSE', 'bin/lab.mjs', 'src/cli.mjs', 'src/commands/join.mjs',
    'contrat/evenements-v1.md', 'contrat/exemples/hint.revealed.json', 'points/regle.md', 'points/exemples.json',
    'labs/prise-en-main/index.mjs', 'labs/prise-en-main/carnet.json'];
  assert.deepEqual(unexpectedFiles(ok), []);
  const bad = ['src/tests/join.test.mjs', 'src/fixtures/cours/.othila-lab/formation.json', 'src/test-helpers/tmp.mjs', 'src/labs.test.mjs',
    '.env', '.npmrc', 'scripts/pack-contents.mjs', 'src/notes.txt', 'docs/ecrire-un-lab.md', 'SECURITY.md', '.github/workflows/ci.yml',
    'contrat/notes.txt', 'points/brouillon.json', 'labs/notes.md', 'labs/prise-en-main/sous/dossier.mjs'];
  assert.deepEqual(unexpectedFiles([...ok, ...bad]), bad);
});

test('le paquet tel que npm le construirait ne contient que le contenu admis', () => {
  const files = packedFiles(execFileSync('npm', ['pack', '--dry-run', '--json'], { cwd: cli, encoding: 'utf8' }));
  assert.ok(files.includes('bin/lab.mjs') && files.includes('src/cli.mjs'), 'le code est bien dans le paquet');
  assert.ok(files.includes('contrat/exemples/check.completed.json') && files.includes('points/exemples.json'), 'contrat et points sont dans le paquet');
  assert.ok(['index.mjs', 'carnet.mjs', 'carnet.json', 'machine.mjs'].every((f) => files.includes(`labs/prise-en-main/${f}`)), 'le tutoriel est dans le paquet');
  assert.deepEqual(unexpectedFiles(files), []);
});
