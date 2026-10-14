// La version de lab-cli épinglée dans la branche de l'apprenant suit la référence du cours, comme les définitions :
// package.json et package-lock.json reprennent la version de main, tout ou rien, jamais vers le bas.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { olderThan } from './config.mjs';
import { git } from './git.mjs';

const PACKAGE = '@othila-academy/lab';
const LOCK_KEY = `node_modules/${PACKAGE}`;
const EXACT = /^\d+\.\d+\.\d+$/;
export const PIN_FILES = ['package.json', 'package-lock.json'];

const parse = (text) => {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};
// Le champ qui déclare lab-cli : devDependencies, sinon dependencies ; null s'il n'y est pas.
const fieldOf = (deps) => (deps?.devDependencies?.[PACKAGE] !== undefined ? 'devDependencies' : deps?.dependencies?.[PACKAGE] !== undefined ? 'dependencies' : null);
// L'indentation du fichier d'origine (npm écrit deux espaces), ses fins de ligne (CRLF sous Windows) et son saut de ligne final.
const indentOf = (text) => /^\{\r?\n([ \t]+)"/.exec(text)?.[1] ?? 2;
const serialize = (value, text) => {
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const body = JSON.stringify(value, null, indentOf(text)).replace(/\n/g, eol);
  return `${body}${text.endsWith('\n') ? eol : ''}`;
};

// Calcule l'alignement sans rien écrire : { from, version, files } ou null s'il n'y a rien à faire, ou rien de sûr.
export function planPin({ refPackage, refLock, branchPackage, branchLock }) {
  const ref = parse(refPackage);
  const refField = fieldOf(ref);
  const version = refField ? ref[refField][PACKAGE] : null;
  const entry = parse(refLock)?.packages?.[LOCK_KEY];
  if (typeof version !== 'string' || !EXACT.test(version) || entry?.version !== version) return null;

  const pkg = parse(branchPackage);
  const lock = parse(branchLock);
  const field = fieldOf(pkg);
  const root = lock?.packages?.[''];
  const rootField = fieldOf(root);
  if (!field || !rootField || !lock.packages[LOCK_KEY]) return null;
  const from = pkg[field][PACKAGE];
  if (typeof from !== 'string' || !EXACT.test(from) || !olderThan(from, version)) return null;

  pkg[field][PACKAGE] = version;
  root[rootField][PACKAGE] = version;
  // L'entrée de la référence, avec le marqueur dev de la branche (lab-cli peut y être en dependencies).
  const copy = { ...entry };
  if ('dev' in lock.packages[LOCK_KEY]) copy.dev = lock.packages[LOCK_KEY].dev;
  else delete copy.dev;
  lock.packages[LOCK_KEY] = copy;
  // Lock v2 : la section dependencies héritée, lue par les npm anciens, suit aussi.
  const legacy = lock.dependencies?.[PACKAGE];
  if (legacy) lock.dependencies[PACKAGE] = { ...legacy, version, resolved: entry.resolved, integrity: entry.integrity };
  return { from, version, files: { 'package.json': serialize(pkg, branchPackage), 'package-lock.json': serialize(lock, branchLock) } };
}

const show = (ref, file, cwd) => {
  try {
    return git(['show', `${ref}:${file}`], cwd);
  } catch {
    return null;
  }
};

// Dans l'arbre de travail et l'index : { from, version } si les deux fichiers ont été réécrits, null sinon.
// Des modifications non commitées sur l'un des deux, indexées ou non : on n'y touche pas.
export function alignPin(ref, cwd) {
  const paths = PIN_FILES.map((file) => path.join(cwd, file));
  if (!paths.every((p) => existsSync(p))) return null;
  // Deux fichiers suivis par git (un lock ignoré ferait échouer git add), sans modification non commitée.
  try {
    git(['ls-files', '--error-unmatch', '--', ...PIN_FILES], cwd);
  } catch {
    return null;
  }
  if (git(['status', '--porcelain', '--', ...PIN_FILES], cwd) !== '') return null;
  const plan = planPin({
    refPackage: show(ref, 'package.json', cwd),
    refLock: show(ref, 'package-lock.json', cwd),
    branchPackage: readFileSync(paths[0], 'utf8'),
    branchLock: readFileSync(paths[1], 'utf8')
  });
  if (!plan) return null;
  for (const file of PIN_FILES) writeFileSync(path.join(cwd, file), plan.files[file]);
  git(['add', '--', ...PIN_FILES], cwd);
  return { from: plan.from, version: plan.version };
}

// Défait un alignement que le commit n'a pas pu enregistrer : les deux fichiers reviennent à HEAD, rien ne reste indexé.
export const undoPin = (cwd) => git(['restore', '--staged', '--worktree', '--source=HEAD', '--', ...PIN_FILES], cwd);
