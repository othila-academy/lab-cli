import { formation, versionProblemAt } from '../config.mjs';
import { updateDefinitions } from '../update.mjs';

// Les nouveaux labs et les définitions à jour, depuis la référence du cours : seul .othila-lab/ change.
// Un cours qui exige une version plus récente de lab-cli est recopié quand même, puis l'avertissement le dit.
export async function run({ io }) {
  const f = formation(undefined, { checkVersion: false });
  try {
    const { changed } = updateDefinitions({ cwd: f.root, f, io });
    io.out(changed ? 'labs mis à jour : npx lab catalog pour les voir' : 'labs déjà à jour');
    const problem = versionProblemAt(f.root);
    if (problem) io.out(`attention : ${problem}`);
    return 0;
  } catch (error) {
    if (error.code !== 1 && error.code !== 2) throw error;
    io.err(error.message);
    return error.code;
  }
}
