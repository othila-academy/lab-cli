// Garde-fou de publication : le paquet ne contient que le code de la commande, son contrat, la règle des points et leur documentation.
// Le workflow de publication le lance avant npm publish ; hors de « files », ce script n'est pas publié.
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ALLOWED = [
  /^package\.json$/, /^README\.md$/, /^LICENSE$/,
  /^bin\/[^/]+\.mjs$/,
  /^src\/(?!tests\/|fixtures\/|test-helpers\/).+\.mjs$/,
  /^contrat\/evenements-v1\.md$/, /^contrat\/exemples\/[^/]+\.json$/,
  /^points\/(regle\.md|exemples\.json)$/,
  /^labs\/[a-z0-9-]+\/[^/]+\.(mjs|json)$/
];

// Les chemins qui n'ont rien à faire dans le paquet publié, dans l'ordre reçu.
export const unexpectedFiles = (paths) => paths.filter((p) => /\.test\.mjs$/.test(p) || !ALLOWED.some((r) => r.test(p)));

// La liste des fichiers d'un `npm pack --dry-run --json`.
export const packedFiles = (json) => JSON.parse(json)[0].files.map((f) => f.path);

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const cli = fileURLToPath(new URL('../', import.meta.url));
  const files = packedFiles(execFileSync('npm', ['pack', '--dry-run', '--json'], { cwd: cli, encoding: 'utf8' }));
  const unexpected = unexpectedFiles(files);
  if (unexpected.length > 0) {
    console.error(`contenu inattendu dans le paquet : ${unexpected.join(', ')}`);
    process.exit(1);
  }
  console.log(`contenu du paquet vérifié : ${files.length} fichiers`);
}
