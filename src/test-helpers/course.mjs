import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

// Un lab minimal : une étape « s » dont le check passe.
export const tinyLab = (title = 'Lab') => ({
  'index.mjs': `export const title = ${JSON.stringify(title)};\nexport const steps = ['s'];\n`,
  's.mjs': "export const checks = [{ id: 'k', label: 'k', run: async () => {} }];\n"
});

// Un dépôt de cours jetable : .othila-lab/formation.json et ses labs, écrits fichier par fichier.
// Par défaut, une seule séance qui cite tous les labs donnés ; manifest complète ou remplace les champs.
export function makeCourse({ labs = {}, seances, manifest = {} } = {}) {
  const root = mkdtempSync(path.join(tmpdir(), 'othila-cours-'));
  const home = path.join(root, '.othila-lab');
  mkdirSync(home, { recursive: true });
  for (const [id, files] of Object.entries(labs)) {
    mkdirSync(path.join(home, 'labs', id), { recursive: true });
    for (const [name, content] of Object.entries(files)) writeFileSync(path.join(home, 'labs', id, name), content);
  }
  const file = path.join(home, 'formation.json');
  const write = (value) => writeFileSync(file, typeof value === 'string' ? value : JSON.stringify(value, null, 2));
  write({ id: 'cours-test', title: 'Cours de test', seances: seances ?? [{ title: 'Séance 1', labs: Object.keys(labs) }], ...manifest });
  return { root, home, file, write, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}
