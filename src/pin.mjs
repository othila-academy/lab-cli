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
// L'indentation du fichier d'origine (npm écrit deux espaces) et son saut de ligne final.
const indentOf = (text) => /^\{\r?\n([ \t]+)"/.exec(text)?.[1] ?? 2;
const serialize = (value, text) => `${JSON.stringify(value, null, indentOf(text))}${text.endsWith('\n') ? '\n' : ''}`;

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
  lock.packages[LOCK_KEY] = entry;
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
