import { formationForUpdate, versionProblemAt } from '../config.mjs';
import { updateDefinitions } from '../update.mjs';

// Les nouveaux labs et les définitions à jour, depuis la référence du cours : seuls .othila-lab/ et l'épinglage de lab-cli
// (package.json et package-lock.json, alignés sur la référence) changent ; le code de l'apprenant ne bouge pas.
// Un cours qui exige une version plus récente de lab-cli est recopié quand même, puis l'avertissement le dit.
export async function run({ io }) {
  const f = formationForUpdate();
  try {
    const { changed, pinned } = updateDefinitions({ cwd: f.root, f, io });
    if (changed) io.out('labs mis à jour : npx lab catalog pour les voir');
    else if (pinned) io.out(`labs déjà à jour ; lab-cli épinglée en ${pinned.version}, comme sur ${f.reference.branch}`);
    else io.out('labs déjà à jour');
    const problem = versionProblemAt(f.root);
    if (problem) io.out(`attention : ${problem}`);
    return 0;
  } catch (error) {
    if (error.code !== 1 && error.code !== 2) throw error;
    io.err(error.message);
    return error.code;
  }
}
