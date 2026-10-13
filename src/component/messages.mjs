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

// Un test en échec : `AssertionError: <message>: expected …` et `Error: <message>` rendent le message de l'auteur.
export function testFailure(failureMessage) {
  const line = firstLine(failureMessage);
  const assertion = line.match(/^AssertionError: (.+?): expected /);
  if (assertion) return assertion[1];
  const error = line.match(/^Error: (.+)$/);
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
