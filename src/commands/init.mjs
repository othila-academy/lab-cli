import { BASE_TAG } from '../chain.mjs';
import { formation } from '../config.mjs';
import { branchExists, checkoutNewBranch, isClean, tagExists } from '../git.mjs';
import { describeLab, listLabs } from '../labs.mjs';
import { formatCatalog } from '../sheet.mjs';

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
  io.out('');
  const labs = listLabs(f);
  if (labs.length === 0) {
    io.out("aucun lab pour l'instant : npx lab update quand le formateur en publie");
    return 0;
  }
  const described = [];
  for (const { id } of labs) described.push(await describeLab(id, f));
  for (const line of formatCatalog(described)) io.out(line);
  io.out('');
  io.out(`Ensuite : npx lab start ${labs[0].id}`);
  return 0;
}
