import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

// Un seul domaine pour la remontée. Le manifeste peut le surcharger, l'environnement aussi.
export const DEFAULT_ENDPOINT = 'https://lab.othila-academy.com';
// Tout ce qu'othila-lab pose dans un dépôt de cours vit dans ce dossier.
export const HOME = '.othila-lab';
export const MANIFEST = 'formation.json';
export const LEGACY_FILE = 'othila-lab.config.json';

const SLUG = /^[a-z0-9][a-z0-9-]{0,63}$/;
const MAX_TITLE = 200; // limite du catalogue côté serveur
const DEFAULTS = { graphql: 'http://localhost:4000/graphql', endpoint: DEFAULT_ENDPOINT };
const VERSION = /^\d+\.\d+\.\d+$/;

// Sans serveur déclaré, la formation n'en a pas : gql et startServer le disent avec ce message.
export const NO_SERVER = "cette formation n'a pas de serveur GraphQL (server dans .othila-lab/formation.json)";
const REFERENCE_DEFAULTS = { remote: 'origin', branch: 'main' };

function findUp(from, name) {
  let dir = path.resolve(from);
  for (;;) {
    if (existsSync(path.join(dir, name))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

// La racine du dépôt de cours : OTHILA_LAB_ROOT s'il est posé, sinon le premier dossier, en remontant,
// qui porte .othila-lab/formation.json. Ainsi `npx lab` marche aussi depuis packages/server-js/.
// Sans manifeste trouvé, le dossier de départ.
export function projectRoot(from = process.cwd()) {
  if (process.env.OTHILA_LAB_ROOT) return path.resolve(process.env.OTHILA_LAB_ROOT);
  return findUp(from, path.join(HOME, MANIFEST)) ?? path.resolve(from);
}

export const labsDir = (root = projectRoot()) => path.join(root, HOME, 'labs');

const fail = (field, message) => {
  throw new Error(`${HOME}/${MANIFEST} : ${field} : ${message}`);
};
const isText = (value) => typeof value === 'string' && value.trim() !== '';

// Un chemin du manifeste : relatif à la racine du dépôt, et qui y reste ; renvoie le chemin absolu.
function inside(root, value, field) {
  const target = path.resolve(root, value);
  const relative = path.relative(root, target);
  if (path.isAbsolute(value) || relative.startsWith('..') || path.isAbsolute(relative)) {
    fail(field, `chemin relatif à la racine du dépôt, qui y reste, attendu : ${value}`);
  }
  return target;
}

// Le client d'une formation front : son dossier, et le fichier qui prépare les tests de composants.
// Le dossier peut ne pas exister encore (un lab le fait créer).
function clientOf(raw, root) {
  if (raw === undefined) return null;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) fail('client', 'objet attendu, par exemple { "dir": "packages/client-react" }');
  if (!isText(raw.dir)) fail('client.dir', 'texte non vide attendu');
  if (raw.setup !== undefined && !isText(raw.setup)) fail('client.setup', 'texte non vide attendu');
  return {
    dir: raw.dir,
    path: inside(root, raw.dir, 'client.dir'),
    setup: raw.setup ?? null,
    setupPath: raw.setup === undefined ? null : inside(root, raw.setup, 'client.setup')
  };
}

// Valide le manifeste lu et le complète par les défauts. Chaque erreur nomme le champ fautif.
function validate(raw, dir, root) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) fail('racine', 'objet JSON attendu');
  if (typeof raw.id !== 'string' || !SLUG.test(raw.id)) fail('id', 'minuscules, chiffres et tirets attendus');
  if (!isText(raw.title)) fail('title', 'texte non vide attendu');
  if (raw.title.trim().length > MAX_TITLE) fail('title', `${MAX_TITLE} caractères au plus`);
  if (!Array.isArray(raw.seances)) fail('seances', 'liste attendue');
  const seen = new Set();
  const seances = raw.seances.map((seance, i) => {
    if (!isText(seance?.title)) fail(`seances[${i}].title`, 'texte non vide attendu');
    if (seance.title.trim().length > MAX_TITLE) fail(`seances[${i}].title`, `${MAX_TITLE} caractères au plus`);
    if (!Array.isArray(seance.labs) || seance.labs.length === 0) fail(`seances[${i}].labs`, 'liste non vide attendue');
    seance.labs.forEach((id, j) => {
      const field = `seances[${i}].labs[${j}]`;
      if (typeof id !== 'string' || !SLUG.test(id)) fail(field, 'identifiant de lab attendu (minuscules, chiffres et tirets)');
      if (seen.has(id)) fail(field, `${id} est déjà cité`);
      if (!existsSync(path.join(dir, id, 'index.mjs'))) fail(field, `${id} n'a pas de dossier ${HOME}/labs/${id}/ avec index.mjs`);
      seen.add(id);
    });
    return { title: seance.title.trim(), labs: [...seance.labs] };
  });
  for (const key of ['server', ...Object.keys(DEFAULTS)]) {
    if (raw[key] !== undefined && !isText(raw[key])) fail(key, 'texte non vide attendu');
  }
  if (raw.lab !== undefined && (typeof raw.lab !== 'string' || !VERSION.test(raw.lab))) fail('lab', 'version x.y.z attendue, par exemple 0.9.0');
  const client = clientOf(raw.client, root);
  // D'où lab update tire les définitions des labs : la branche de référence du cours.
  const reference = raw.reference ?? {};
  if (typeof reference !== 'object' || Array.isArray(reference)) fail('reference', 'objet attendu');
  for (const key of Object.keys(REFERENCE_DEFAULTS)) {
    if (reference[key] !== undefined && !isText(reference[key])) fail(`reference.${key}`, 'texte non vide attendu');
  }
  return {
    id: raw.id,
    title: raw.title.trim(),
    seances,
    server: raw.server ?? null,
    graphql: raw.graphql ?? DEFAULTS.graphql,
    endpoint: raw.endpoint ?? DEFAULTS.endpoint,
    lab: raw.lab ?? null,
    client,
    reference: {
      remote: reference.remote ?? REFERENCE_DEFAULTS.remote,
      branch: reference.branch ?? REFERENCE_DEFAULTS.branch
    }
  };
}

// Le manifeste de la formation, validé, ou null si le dépôt n'en a pas.
// checkVersion : la version exigée (lab) passe avant la validation, car un manifeste écrit pour une version
// future peut avoir une forme que celle-ci refuse ; l'apprenant lit alors quelle version installer.
export function readFormation(root = projectRoot(), { checkVersion = false } = {}) {
  const raw = readRaw(root);
  if (raw === null) return null;
  if (checkVersion) {
    const problem = versionProblem({ lab: requiredVersion(raw) });
    if (problem) throw new Error(problem);
  }
  const dir = labsDir(root);
  return { ...validate(raw, dir, root), root, labsDir: dir };
}

function readRaw(root) {
  const file = path.join(root, HOME, MANIFEST);
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(readFileSync(file, 'utf8').replace(/^﻿/, '')); // BOM des éditeurs Windows
  } catch (error) {
    throw new Error(`${HOME}/${MANIFEST} illisible : ${error.message}`);
  }
}

const requiredVersion = (raw) => (raw && typeof raw.lab === 'string' && VERSION.test(raw.lab) ? raw.lab : null);

// Pour lab update : le manifeste validé ; ou, s'il a une forme que cette version refuse alors qu'il exige une version
// plus récente, seulement la racine et la référence, qui suffisent à récupérer les labs.
export function formationForUpdate(root = projectRoot()) {
  try {
    return formation(root, { checkVersion: false });
  } catch (error) {
    if (!versionProblemAt(root)) throw error;
    const reference = readRaw(root)?.reference;
    const field = (key) => (reference && isText(reference[key]) ? reference[key] : REFERENCE_DEFAULTS[key]);
    return { root, reference: { remote: field('remote'), branch: field('branch') } };
  }
}

// Pour lab update : le message de version du manifeste tel qu'il est sur le disque, sans le valider ; null sinon.
export function versionProblemAt(root) {
  try {
    return versionProblem({ lab: requiredVersion(readRaw(root)) });
  } catch {
    return null;
  }
}

// La version de ce paquet, comparée au champ lab du manifeste (x.y.z ; une préversion compte comme sa version).
export const PACKAGE_VERSION = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;
const numbers = (version) => String(version).match(/^(\d+)\.(\d+)\.(\d+)/).slice(1).map(Number);

export function olderThan(installed, wanted) {
  const a = numbers(installed);
  const b = numbers(wanted);
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] < b[i];
  return false;
}

// Le message à donner quand le cours exige une version plus récente que celle installée ; null sinon.
export function versionProblem(f, installed = PACKAGE_VERSION) {
  if (!f.lab || !olderThan(installed, f.lab)) return null;
  return `ce cours demande @othila-academy/lab ${f.lab} ou plus (installé : ${installed}) : npm install --save-dev --save-exact @othila-academy/lab@${f.lab}`;
}

// Le manifeste, obligatoire : les commandes qui touchent aux labs en ont besoin. Il peut exiger une version de lab-cli.
export function formation(root = projectRoot(), { checkVersion = true } = {}) {
  const found = readFormation(root, { checkVersion });
  if (found) return found;
  if (findUp(root, LEGACY_FILE)) {
    throw new Error(
      `ce dépôt utilise l'ancienne configuration ${LEGACY_FILE} : déplace labs/ dans ${HOME}/labs/, écris ${HOME}/${MANIFEST} (id, title, seances), ` +
        `supprime ${LEGACY_FILE}, retire ${HOME}/ du .gitignore du projet et range l'ancien état local (state.json dans ${HOME}/local/, les autres fichiers à supprimer). Détail : node_modules/@othila-academy/lab/README.md, section « Configurer un dépôt de cours »`
    );
  }
  throw new Error(`pas de ${HOME}/${MANIFEST} ici ni dans les dossiers parents : lance lab depuis le dépôt du cours`);
}

// L'environnement prime sur le manifeste, qui prime sur les défauts. Sans manifeste, les défauts.
const setting = (key) => readFormation()?.[key] ?? DEFAULTS[key];
export const endpointUrl = () => process.env.OTHILA_LAB_URL ?? setting('endpoint');
export const serverScript = () => process.env.OTHILA_LAB_SERVER_SCRIPT ?? readFormation()?.server ?? null;
export const graphqlUrl = (flag) => flag ?? process.env.GRAPHQL_URL ?? setting('graphql');

// L'état de l'apprenant sur cette machine, jamais commité : .othila-lab/local/, ou OTHILA_LAB_DIR.
export const localDir = () => path.resolve(projectRoot(), process.env.OTHILA_LAB_DIR ?? path.join(HOME, 'local'));

// Le bac à sable d'un lab intégré : ses fichiers de travail, dans l'état local, jamais commités.
export const sandboxDir = (labId) => path.join(localDir(), labId);

const file = (name) => path.join(localDir(), name);

function readJson(name, fallback) {
  try {
    return JSON.parse(readFileSync(file(name), 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJson(name, value) {
  mkdirSync(localDir(), { recursive: true });
  writeFileSync(file(name), `${JSON.stringify(value, null, 2)}\n`);
}

// L'état local d'avant .othila-lab/local/ : à la racine de .othila-lab/, il n'est plus lu ni ignoré par git.
const LEGACY_LOCAL = ['config.json', 'state.json', 'outbox.jsonl', 'rejected.jsonl'];
export const legacyLocalFiles = (root = projectRoot()) =>
  LEGACY_LOCAL.map((name) => path.join(HOME, name)).filter((name) => existsSync(path.join(root, name)));

// session.json : { endpoint, session, learnerId, token, firstName }, écrit par lab join.
export const loadSession = () => readJson('session.json', null);
export const saveSession = (session) => writeJson('session.json', session);

// state.json : { hints: { "lab/step": niveau }, predictions: { "lab/step": { answer, correct } },
//   steps: { "lab/step": { state, passed, total, runs, submitted } } } ; steps alimente lab progress.
export const loadState = () => ({ hints: {}, predictions: {}, steps: {}, ...readJson('state.json', {}) });
export const saveState = (state) => writeJson('state.json', state);

// Garantit la ligne local/ dans .othila-lab/.gitignore. Le .gitignore du projet n'est jamais touché.
// Renvoie true si la ligne a été ajoutée.
export function ensureGitignore(root = projectRoot()) {
  const gitignore = path.join(root, HOME, '.gitignore');
  const current = existsSync(gitignore) ? readFileSync(gitignore, 'utf8') : '';
  if (current.split('\n').some((line) => line.trim() === 'local/')) return false;
  mkdirSync(path.dirname(gitignore), { recursive: true });
  appendFileSync(gitignore, `${current.endsWith('\n') || current === '' ? '' : '\n'}local/\n`);
  return true;
}
