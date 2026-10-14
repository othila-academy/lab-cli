// Les échecs de Vitest, traduits pour l'étudiant : le message de l'auteur du test quand il y en a un,
// sinon une phrase qui désigne le fichier du client en cause, depuis la racine du dépôt.
import path from 'node:path';

const ANSI = /\x1b\[[0-9;]*m/g;
const lines = (text) => String(text ?? '').replace(ANSI, '').split('\n').map((l) => l.trim()).filter(Boolean);
const firstLine = (text) => lines(text)[0] ?? '';

// Un chemin vu par Vite (absolu, ou relatif au client) montré depuis la racine du dépôt, en séparateurs /.
function shown(file, { root, clientDir }) {
  const absolute = path.isAbsolute(file) ? file : path.resolve(clientDir, file);
  return path.relative(root, absolute).split(path.sep).join('/');
}
const clientLabel = ({ root, clientDir }) => path.relative(root, clientDir).split(path.sep).join('/') || '.';
const packageName = (spec) => spec.split('/').slice(0, spec.startsWith('@') ? 2 : 1).join('/');
// Un fichier hors du client (test du lab, préparation du cours) résout ses imports depuis la racine du dépôt.
const outsideClient = (file, { clientDir }) => {
  const relative = path.relative(clientDir, path.resolve(clientDir, file));
  return relative.startsWith('..') || path.isAbsolute(relative);
};

// Le texte d'une erreur avant sa pile d'appels, ses lignes jointes par un espace.
const beforeStack = (text) => lines(String(text ?? '').replace(ANSI, '').split(/\n\s+at /)[0]).join(' ');

// La suite d'une assertion de Vitest, `expected <valeur> to …` ou `not to …` : une valeur entre guillemets,
// crochets ou accolades, ou un mot. Elle sépare le message de l'auteur de l'assertion, même quand
// le message ou la valeur contiennent eux-mêmes « : expected ».
const ASSERTION = /^expected (?:'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"|\[[\s\S]*?\]|\{[\s\S]*?\}|\S+) (?:not )?to /;
function authorMessage(text) {
  for (let at = text.indexOf(': expected '); at !== -1; at = text.indexOf(': expected ', at + 1)) {
    if (ASSERTION.test(text.slice(at + 2))) return text.slice(0, at);
  }
  const first = text.indexOf(': expected ');
  return first === -1 ? null : text.slice(0, first);
}

const seconds = (ms) => String(ms / 1000).replace('.', ',');

// Un test en échec : `AssertionError: <message>: expected …`, `Error: <message>` et `AssertionError: <message>`
// (expect.fail) rendent le message de l'auteur, en entier ; une assertion sans message (`expected …`) garde sa ligne.
// Le délai de Vitest dépassé est dit en français.
export function testFailure(failureMessage) {
  const line = firstLine(failureMessage);
  const timedOut = line.match(/^Error: Test timed out in (\d+)ms/);
  if (timedOut) return `le test a dépassé ${seconds(Number(timedOut[1]))} s : un composant attend-il une réponse qui ne vient pas ?`;
  const text = beforeStack(failureMessage);
  if (/^AssertionError: /.test(text)) {
    const body = text.slice('AssertionError: '.length);
    const message = /^expected /.test(body) ? null : authorMessage(body);
    if (message) return message;
    if (!/^expected /.test(body) && body !== 'expect.fail()') return body;
    return line;
  }
  const error = text.match(/^Error: (.+)$/);
  if (error) return error[1];
  return line;
}

// Un fichier de test qui n'a pas pu se charger : import introuvable, paquet absent, code qui ne compile pas.
export function fileFailure(message, where) {
  const text = lines(message);
  const head = text[0] ?? '';
  const unresolved = head.match(/^Failed to resolve import "([^"]+)" from "([^"]+)"/);
  if (unresolved) {
    const [, spec, importer] = unresolved;
    if (spec.startsWith('@client/')) return `${shown(spec.slice('@client/'.length), where)} introuvable : as-tu créé ce fichier ?`;
    if (spec.startsWith('.')) {
      const missing = path.join(path.dirname(path.resolve(where.clientDir, importer)), spec);
      return `${shown(missing, where)} introuvable (importé par ${shown(importer, where)})`;
    }
    if (outsideClient(importer, where)) {
      return `le paquet ${packageName(spec)} est introuvable depuis ${shown(importer, where)} : installe-le dans le client, qui doit être un workspace du cours (ou à la racine du dépôt)`;
    }
    return `le paquet ${packageName(spec)} n'est pas installé pour le client (${clientLabel(where)})`;
  }
  if (/^Transform failed/.test(head)) {
    const oxc = text.join('\n').match(/\[\s*([^\]\s]+?):(\d+):\d+\s*\]/);
    const reason = text.find((l) => /^\[[A-Z_]+\]/.test(l))?.replace(/^\[[A-Z_]+\]\s*/, '');
    if (oxc && reason) return `${shown(oxc[1], where)} ne compile pas (ligne ${oxc[2]}) : ${reason}`;
    const esbuild = text.map((l) => l.match(/^(.+?):(\d+):\d+: ERROR: (.+)$/)).find(Boolean);
    if (esbuild) return `${shown(esbuild[1], where)} ne compile pas (ligne ${esbuild[2]}) : ${esbuild[3]}`;
    return `un fichier ne compile pas : ${text[1] ?? head}`;
  }
  return testFailure(head);
}

// Vitest n'a pas démarré (pas de rapport) : la config Vite du client en cause et la première erreur lisible,
// plutôt que la fin brute de sa sortie d'erreur. config : la config de lab-cli, que Vitest cite aussi.
export function startupFailure(stderr, where, config) {
  const text = lines(stderr);
  const failedConfig = text
    .map((l) => l.match(/^failed to load config from (.+)$/)?.[1])
    .find((file) => file && path.resolve(file) !== path.resolve(config));
  const error = text
    .map((l) => l.match(/^\w*Error(?: \[[A-Z_]+\])?: (.+)$/)?.[1])
    .find(Boolean)
    ?.replace(/ imported from .+$/, '');
  if (failedConfig) return `la config Vite du client (${shown(failedConfig, where)}) ne se charge pas${error ? ` : ${error}` : ''}`;
  if (error) return `Vitest ne démarre pas : ${error}`;
  return `Vitest ne démarre pas : ${text.filter((l) => !/^at /.test(l)).slice(-3).join(' ').slice(-300)}`;
}
