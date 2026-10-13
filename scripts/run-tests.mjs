// Lance la suite du paquet sur toutes les versions annoncées (Node ≥ 22) et tous les systèmes :
// node --test n'accepte des motifs qu'à partir de Node 21, et cmd.exe ne développe pas les motifs.
// On liste donc les fichiers nous-mêmes. Hors de « files », ce script n'est pas publié.
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = fileURLToPath(new URL('../src/tests/', import.meta.url));
const files = readdirSync(dir).filter((f) => f.endsWith('.test.mjs')).sort().map((f) => path.join(dir, f));
if (files.length === 0) {
  console.error(`aucun fichier de test dans ${dir}`);
  process.exit(1);
}
const { status } = spawnSync(process.execPath, ['--test', ...files], { stdio: 'inherit' });
process.exit(status ?? 1);
