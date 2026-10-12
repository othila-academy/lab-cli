// lab update : .othila-lab/ recopié depuis la référence du cours (origin/main par défaut), sans rien toucher d'autre.
// Les définitions de la tête de main font foi ; le code de l'apprenant, commité ou non, reste tel quel.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { HOME } from './config.mjs';
import { git } from './git.mjs';

const PACKAGE = '@othila-academy/lab';

const refError = (message, code) => Object.assign(new Error(message), { code });

// Récupère la référence : 'online' si le fetch passe, 'missing' si le remote répond sans cette branche, 'offline' sinon.
function fetchReference(remote, branch, cwd) {
  try {
    git(['fetch', '--quiet', remote, branch], cwd);
    return 'online';
  } catch {
    try {
      git(['ls-remote', '--heads', remote], cwd);
      return 'missing';
    } catch {
      return 'offline';
    }
  }
}

// La version du paquet que déclare le package.json de la référence, et celle installée chez l'apprenant ; null si l'une manque.
function packageVersions(ref, cwd) {
  try {
    const declared = JSON.parse(git(['show', `${ref}:package.json`], cwd));
    const wanted = declared.devDependencies?.[PACKAGE] ?? declared.dependencies?.[PACKAGE];
    const installed = JSON.parse(readFileSync(path.join(cwd, 'node_modules', ...PACKAGE.split('/'), 'package.json'), 'utf8')).version;
    return wanted && installed ? { wanted, installed } : null;
  } catch {
    return null;
  }
}

export function updateDefinitions({ cwd, f, io }) {
  const { remote, branch } = f.reference;
  const ref = `${remote}/${branch}`;
  const status = fetchReference(remote, branch, cwd);
  if (status === 'missing') throw refError(`${ref} introuvable : le remote ${remote} n'a pas de branche ${branch} (vérifie reference dans ${HOME}/formation.json)`, 1);
  let sha;
  try {
    sha = git(['rev-parse', '--short', `refs/remotes/${ref}`], cwd);
  } catch {
    throw refError(`${ref} introuvable : vérifie le remote du cours (git remote -v)`, status === 'offline' ? 2 : 1);
  }
  if (status === 'offline') io.out(`hors ligne : labs de la dernière référence récupérée (${ref}@${sha})`);

  // Ajouts, modifications et retraits, dans l'index et l'arbre ; local/, non suivi, n'est pas touché.
  git(['restore', `--source=${ref}`, '--staged', '--worktree', '--', HOME], cwd);
  const changed = git(['diff', '--cached', '--name-only', '--', HOME], cwd) !== '';
  // Un commit limité à .othila-lab/ : ce que l'apprenant a indexé ailleurs reste indexé, hors du commit.
  if (changed) git(['commit', '--quiet', '--no-verify', '-m', `labs à jour (${branch}@${sha})`, '--', HOME], cwd);

  const versions = packageVersions(ref, cwd);
  if (versions && versions.wanted !== versions.installed) {
    io.out(`le cours utilise ${PACKAGE} ${versions.wanted} (installé : ${versions.installed}) : npm install --save-dev --save-exact ${PACKAGE}@${versions.wanted}`);
  }
  return { changed, offline: status === 'offline', sha };
}
