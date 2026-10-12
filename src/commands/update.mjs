import { formation } from '../config.mjs';
import { updateDefinitions } from '../update.mjs';

// Les nouveaux labs et les définitions à jour, depuis la référence du cours : seul .othila-lab/ change.
export async function run({ io }) {
  const f = formation();
  try {
    const { changed } = updateDefinitions({ cwd: f.root, f, io });
    io.out(changed ? 'labs mis à jour : npx lab catalog pour les voir' : 'labs déjà à jour');
    return 0;
  } catch (error) {
    if (error.code !== 1 && error.code !== 2) throw error;
    io.err(error.message);
    return error.code;
  }
}
