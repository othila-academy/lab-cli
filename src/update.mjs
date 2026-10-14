// lab update : .othila-lab/ recopié depuis la référence du cours (origin/main par défaut), sans rien toucher d'autre.
// Les définitions de la tête de main font foi ; le code de l'apprenant, commité ou non, reste tel quel.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { HOME } from './config.mjs';
import { git } from './git.mjs';
import { alignPin, PIN_FILES, undoPin } from './pin.mjs';

const PACKAGE = '@othila-academy/lab';
// Les définitions, sans l'état local de l'apprenant, même s'il a été suivi par erreur.
const DEFINITIONS = [HOME, `:(exclude)${HOME}/local`];

const refError = (message, code) => Object.assign(new Error(message), { code });

// Récupère la référence : 'online' si le fetch passe, 'missing' si le remote répond sans cette branche, 'offline' sinon.
// La refspec est explicite : un clone --single-branch ou une configuration de fetch réduite mettent quand même à jour <remote>/<branch>.
function fetchReference(remote, branch, cwd) {
  try {
    git(['fetch', '--quiet', remote, `+refs/heads/${branch}:refs/remotes/${remote}/${branch}`], cwd);
    return 'online';
  } catch {
    try {
      git(['ls-remote', '--exit-code', '--heads', remote, branch], cwd);
      return 'offline'; // la branche existe : le fetch a échoué pour une autre raison, on se rabat sur la dernière référence
    } catch (error) {
      return error.status === 2 ? 'missing' : 'offline'; // 2 : le remote a répondu, sans cette branche
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
  // Une référence sans cours effacerait toutes les définitions, et avec elles le .gitignore qui protège local/.
  try {
    git(['cat-file', '-e', `${ref}:${HOME}/formation.json`], cwd);
  } catch {
    throw refError(`${ref} n'a pas de ${HOME}/formation.json : ce n'est pas la branche du cours (vérifie reference dans ${HOME}/formation.json)`, 1);
  }

  // Ajouts, modifications et retraits, dans l'index et l'arbre ; local/ n'est pas touché.
  git(['restore', `--source=${ref}`, '--staged', '--worktree', '--', ...DEFINITIONS], cwd);
  const changed = git(['diff', '--cached', '--name-only', '--', ...DEFINITIONS], cwd) !== '';
  // La version de lab-cli suit la référence, dans le même commit que les définitions (package.json et lock, tout ou rien).
  const pinned = alignPin(`refs/remotes/${ref}`, cwd);
  // Un commit limité à .othila-lab/ (et à l'épinglage) : ce que l'apprenant a indexé ailleurs reste indexé, hors du commit.
  if (changed || pinned) {
    const message = `labs à jour (${branch}@${sha})${pinned ? `, lab-cli ${pinned.version}` : ''}`;
    try {
      git(['commit', '--quiet', '--no-verify', '-m', message, '--', ...DEFINITIONS, ...(pinned ? PIN_FILES : [])], cwd);
    } catch (error) {
      // Tout ou rien : un épinglage non commité fuirait dans le prochain commit de l'apprenant.
      if (pinned) undoPin(cwd);
      throw error;
    }
  }

  const versions = packageVersions(ref, cwd);
  if (versions && versions.wanted !== versions.installed) {
    io.out(pinned
      ? `lab-cli ${versions.wanted} épinglée comme sur ${branch} : npm install`
      : `le cours utilise ${PACKAGE} ${versions.wanted} (installé : ${versions.installed}) : npm install --save-dev --save-exact ${PACKAGE}@${versions.wanted}`);
  }
  return { changed, pinned, offline: status === 'offline', sha };
}
