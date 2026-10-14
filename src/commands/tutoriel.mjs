// lab tutoriel : un dossier jouable hors de tout cours, pour prendre la commande en main avant la formation.
// Les gestes y sont ceux d'un cours : npm install, puis npx lab start prise-en-main. Aucune session : rien n'est envoyé.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { BUILTIN_IDS } from '../builtin.mjs';
import { HOME, MANIFEST, PACKAGE_VERSION } from '../config.mjs';

const DEFAULT_DIR = 'lab-tutoriel';
const json = (value) => `${JSON.stringify(value, null, 2)}\n`;
const gitInit = (dir) => execFileSync('git', ['init', '-q'], { cwd: dir, stdio: 'ignore' });

// initRepo est injectable : les tests simulent une machine sans git.
export async function run({ positionals: [name = DEFAULT_DIR], io, initRepo = gitInit }) {
  const dir = path.resolve(process.cwd(), String(name));
  if (existsSync(dir)) {
    io.err(`${name} existe déjà : choisis un autre nom (npx @othila-academy/lab tutoriel <dossier>)`);
    return 1;
  }
  mkdirSync(path.join(dir, HOME), { recursive: true });
  writeFileSync(path.join(dir, 'package.json'), json({ name: 'lab-tutoriel', private: true, devDependencies: { '@othila-academy/lab': PACKAGE_VERSION } }));
  writeFileSync(path.join(dir, '.gitignore'), 'node_modules/\n');
  writeFileSync(path.join(dir, HOME, MANIFEST), json({ id: 'tutoriel', title: 'Prise en main de la commande lab', seances: [] }));
  writeFileSync(path.join(dir, HOME, '.gitignore'), 'local/\n');
  try {
    initRepo(dir);
  } catch {
    io.err('git introuvable : le dossier reste sans dépôt git ; le tutoriel marche quand même, installe git avant la formation');
  }
  io.out(`${name} créé : le tutoriel de la commande lab, hors de tout cours`);
  io.out('');
  io.out('Ensuite :');
  io.out(`  cd ${name}`);
  io.out('  npm install');
  io.out(`  npx lab start ${BUILTIN_IDS[0]}`);
  return 0;
}
