import { execFileSync } from 'node:child_process';

export const git = (args, cwd = process.cwd()) => execFileSync('git', args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] }).toString().trim();

// courseRef du contrat : tag, distance et commit, suffixe -dirty si l'arbre a des modifications.
export function describe(cwd = process.cwd()) {
  try {
    return git(['describe', '--tags', '--dirty', '--always'], cwd);
  } catch {
    return 'unknown';
  }
}

export function currentBranch(cwd = process.cwd()) {
  try {
    return git(['branch', '--show-current'], cwd) || 'ta branche';
  } catch {
    return 'ta branche';
  }
}

export const isClean = (cwd = process.cwd()) => git(['status', '--porcelain'], cwd) === '';

const refExists = (ref, cwd) => {
  try {
    git(['rev-parse', '--verify', '--quiet', ref], cwd);
    return true;
  } catch {
    return false;
  }
};
export const branchExists = (branch, cwd = process.cwd()) => refExists(`refs/heads/${branch}`, cwd);
export const tagExists = (tag, cwd = process.cwd()) => refExists(`refs/tags/${tag}`, cwd);

export const checkoutNewBranch = (branch, ref, cwd = process.cwd()) => git(['checkout', '-q', '-b', branch, ref], cwd);

// Vrai si ancestor précède descendant dans l'historique : git répond par son code de sortie, sans rien écrire.
export function isAncestor(ancestor, descendant, cwd = process.cwd()) {
  try {
    git(['merge-base', '--is-ancestor', ancestor, descendant], cwd);
    return true;
  } catch {
    return false;
  }
}
