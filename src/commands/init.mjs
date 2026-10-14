import { BASE_TAG } from '../chain.mjs';
import { formation } from '../config.mjs';
import { branchExists, checkoutNewBranch, isClean, tagExists } from '../git.mjs';
import { BUILTIN_IDS } from '../builtin.mjs';
import { catalogLabs, describeLab, listLabs } from '../labs.mjs';
import { formatCatalog } from '../sheet.mjs';
import { updateDefinitions } from '../update.mjs';

const USAGE = 'usage : lab init [--branch NOM]';
export const DEFAULT_BRANCH = 'my-project';

// Une fois, au début du cours : la branche de l'apprenant, partie du starter (tag base). Il y construit son projet, lab après lab.
export async function run({ flags, io }) {
  if (flags.branch === true) throw new Error(USAGE);
  const branch = flags.branch === undefined ? DEFAULT_BRANCH : String(flags.branch);
  const f = formation();

  if (!tagExists(BASE_TAG)) {
    io.err(`tag ${BASE_TAG} introuvable : récupère les tags (git fetch --tags) ou vérifie que tu es dans le dépôt du cours`);
    return 1;
  }
  if (branchExists(branch)) {
    io.err(`la branche ${branch} existe déjà : git checkout ${branch} pour y revenir`);
    return 1;
  }
  if (!isClean()) {
    io.err("l'arbre de travail a des modifications : commite ou mets de côté ton travail avant lab init");
    return 1;
  }

  checkoutNewBranch(branch, BASE_TAG);
  io.out(`branche ${branch} créée depuis ${BASE_TAG} : c'est ton projet, tu y travailles lab après lab`);
  // base fige le starter, souvent sans lab : les définitions viennent de la référence du cours.
  try {
    updateDefinitions({ cwd: f.root, f, io });
  } catch (error) {
    if (error.code !== 1 && error.code !== 2) throw error;
    io.err(`${error.message} : les labs restent ceux de ${BASE_TAG}, npx lab update plus tard`);
  }
  io.out('');
  const current = formation(f.root);
  const described = [];
  for (const { id } of catalogLabs(current)) described.push(await describeLab(id, current));
  for (const line of formatCatalog(described)) io.out(line);
  io.out('');
  // Le tutoriel d'abord, puis le premier lab de la formation s'il y en a un.
  const first = listLabs(current)[0];
  io.out(first
    ? `Ensuite : npx lab start ${BUILTIN_IDS[0]} pour prendre en main la commande, puis npx lab start ${first.id}`
    : `Ensuite : npx lab start ${BUILTIN_IDS[0]} pour prendre en main la commande ; npx lab update quand le formateur publie des labs`);
  return 0;
}
