import { chainOf } from '../chain.mjs';
import { formation } from '../config.mjs';
import { branchExists, checkoutNewBranch, currentBranch, git, isClean, tagExists } from '../git.mjs';
import { updateDefinitions } from '../update.mjs';

const USAGE = 'usage : lab catchup <lab>';

// Le premier nom libre : catchup-<lab>, puis catchup-<lab>-2, -3…
function freeBranch(labId) {
  const base = `catchup-${labId}`;
  if (!branchExists(base)) return base;
  let n = 2;
  while (branchExists(`${base}-${n}`)) n += 1;
  return `${base}-${n}`;
}

// Rattraper son retard : une nouvelle branche au départ du lab (la solution du précédent, ou base), définitions à jour.
// La branche quittée n'est pas touchée.
export async function run({ positionals: [labId], io }) {
  if (!labId) throw new Error(USAGE);
  const f = formation();
  const chain = chainOf(f);
  const step = chain.find((s) => s.lab === labId);
  if (!step) {
    throw new Error(`lab inconnu : ${labId} (disponibles : ${chain.map((s) => s.lab).join(', ') || 'aucun'}) ; npx lab update pour récupérer les nouveaux labs`);
  }
  if (!isClean(f.root)) {
    io.err("l'arbre de travail a des modifications : commite ou mets de côté ton travail avant lab catchup");
    return 1;
  }
  // Les tags de solution publiés depuis le clone, et ceux que le formateur a déplacés (--force) : ils appartiennent au cours.
  // Hors ligne, ceux déjà là suffisent peut-être.
  try {
    git(['fetch', '--quiet', '--force', '--tags', f.reference.remote, f.reference.branch], f.root);
  } catch {
    // le départ est cherché en local juste après
  }
  if (!tagExists(step.start, f.root)) {
    io.err(`${step.start} introuvable : le départ du lab ${labId} manque (git fetch --tags, ou préviens le formateur)`);
    return 1;
  }

  const from = currentBranch(f.root); // « ta branche » hors de toute branche
  const branch = freeBranch(labId);
  checkoutNewBranch(branch, step.start, f.root);
  io.out(`branche ${branch} créée depuis ${step.start} ; ${from === 'ta branche' ? 'ton travail précédent reste intact' : `ta branche ${from} reste intacte`}`);
  try {
    const { changed } = updateDefinitions({ cwd: f.root, f, io });
    if (changed) io.out('labs mis à jour');
  } catch (error) {
    if (error.code !== 1 && error.code !== 2) throw error;
    io.err(`${error.message} : les labs restent ceux de ${step.start}`);
  }
  io.out('');
  io.out(`Ensuite : npm install (les dépendances du départ peuvent différer), puis npx lab start ${labId}`);
  return 0;
}
