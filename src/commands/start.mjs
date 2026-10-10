import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { legacyLocalFiles } from '../config.mjs';
import { branchExists, currentBranch, isClean, startBranch, tagExists } from '../git.mjs';
import { describeLab, loadLab } from '../labs.mjs';
import { formatSheet } from '../sheet.mjs';

const USAGE = 'usage : lab start <lab>';

export async function run({ positionals: [labId], io }) {
  if (!labId) throw new Error(USAGE);
  const lab = await loadLab(labId);
  const tag = `lab-${lab.id}-start`;
  const branch = `lab-${lab.id}`;

  if (!tagExists(tag)) {
    io.err(`tag ${tag} introuvable : récupère les tags (git fetch --tags) ou vérifie que tu es dans le dépôt du cours`);
    return 1;
  }
  if (branchExists(branch)) {
    io.err(`la branche ${branch} existe déjà : git checkout ${branch} pour y revenir`);
    return 1;
  }
  // Avant le contrôle de l'arbre : sinon son conseil (git add -A) ferait commiter l'ancien jeton.
  const legacy = legacyLocalFiles();
  if (legacy.length > 0) {
    io.err(`ancien état local : ${legacy.join(', ')}. Il n'est plus lu ni ignoré par git, ne le commite pas : mv .othila-lab/state.json .othila-lab/local/ pour garder ta progression, supprime les autres fichiers, puis npx lab join`);
    return 1;
  }
  if (!isClean()) {
    io.err(`l'arbre de travail a des modifications : commite ton travail sur ${currentBranch()} : git add -A && git commit -m "mon travail", puis relance lab start`);
    return 1;
  }

  startBranch({ tag, branch });
  io.out(`branche ${branch} créée depuis ${tag}`);

  if (lab.mine && !existsSync(lab.mine.path)) {
    mkdirSync(path.dirname(lab.mine.path), { recursive: true });
    copyFileSync(path.join(lab.dir, lab.mine.template), lab.mine.path);
    io.out(`${path.relative(process.cwd(), lab.mine.path)} créé depuis le gabarit : c'est là que tu écris ton check`);
  }
  io.out('');
  for (const line of formatSheet(await describeLab(lab.id))) io.out(line);
  return 0;
}
