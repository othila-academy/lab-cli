// componentTest : un check qui lit le résultat d'un test de composant écrit par l'auteur du lab.
// Le test vit dans le dossier du lab ; lab check lance Vitest une fois par étape (ctx.components).
import path from 'node:path';

const TEST_FILE = /\.(js|jsx|mjs|ts|tsx)$/;

export function componentTest({ id, label, file, test = id, passesOnStart = false } = {}) {
  if (!id || !label) throw new Error('componentTest : id et label sont obligatoires');
  if (typeof file !== 'string' || !TEST_FILE.test(file)) {
    throw new Error(`componentTest ${id} : file doit nommer un fichier de test .js, .jsx, .mjs, .ts ou .tsx du dossier du lab`);
  }
  const normalized = path.posix.normalize(file.replaceAll('\\', '/'));
  // Un chemin absolu, y compris Windows (C:\…, C:…), sortirait du dossier du lab.
  if (path.posix.isAbsolute(normalized) || /^[A-Za-z]:/.test(normalized) || normalized === '..' || normalized.startsWith('../')) {
    throw new Error(`componentTest ${id} : file doit rester dans le dossier du lab : ${file}`);
  }
  return {
    id,
    label,
    ...(passesOnStart ? { passesOnStart: true } : {}),
    component: { file: normalized, test },
    run: async (ctx) => {
      if (!ctx.components) throw new Error('componentTest demande lab check 0.9.0 ou plus');
      const message = await ctx.components.outcome({ file: normalized, test });
      if (message) throw new Error(message);
    }
  };
}
