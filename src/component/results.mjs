// Le résultat d'un check de composant dans le rapport JSON de Vitest : null si son test passe, sinon le message pour l'étudiant.
import { realpathSync } from 'node:fs';
import path from 'node:path';
import { fileFailure, testFailure } from './messages.mjs';

// Vitest rapporte des chemins réels : on compare des chemins réels (liens symboliques, /var ↔ /private/var).
const real = (p) => {
  try {
    return realpathSync(p);
  } catch {
    return path.resolve(p);
  }
};

export function outcomeOf(report, { file, test, labDir, root, clientDir }) {
  const wanted = real(path.join(labDir, file));
  const entry = report.testResults.find((r) => real(r.name) === wanted);
  if (!entry) return `aucun résultat pour ${file} : Vitest ne l’a pas joué`;
  const result = entry.assertionResults.find((a) => a.title === test || a.fullName === test);
  if (!result) {
    if (entry.assertionResults.length === 0 && entry.message) return fileFailure(entry.message, { root, clientDir });
    return `test « ${test} » introuvable dans ${file}`;
  }
  if (result.status === 'passed') return null;
  if (result.status === 'failed') return testFailure(result.failureMessages[0]) || `le test « ${test} » a échoué`;
  return `le test « ${test} » n’a pas été joué (${result.status})`;
}
