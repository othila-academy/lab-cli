// La chaîne d'un cours : base, puis la solution de chaque lab, dans l'ordre de formation.json.
// La solution d'un lab est le départ du suivant. Les tags ne figent que le code, jamais la définition des labs.
import { listLabs } from './labs.mjs';
import { isAncestor, tagExists } from './git.mjs';

export const BASE_TAG = 'base';
export const solutionTag = (labId) => `solution/${labId}`;

export function chainOf(f) {
  let start = BASE_TAG;
  return listLabs(f).map(({ id }) => {
    const step = { lab: id, start, solution: solutionTag(id) };
    start = step.solution;
    return step;
  });
}

export const startOf = (labId, f) => chainOf(f).find((step) => step.lab === labId)?.start ?? null;

// Les anomalies de la chaîne, vide si elle est saine : d'abord les tags manquants, puis l'ordre des états.
// Avec until, la chaîne s'arrête à ce lab : les labs suivants, encore en écriture, ne comptent pas.
export function verifyChain(f, cwd = process.cwd(), { until } = {}) {
  const whole = chainOf(f);
  const end = until === undefined ? whole.length : whole.findIndex((step) => step.lab === until) + 1;
  const chain = whole.slice(0, end);
  const missing = [];
  if (!tagExists(BASE_TAG, cwd)) missing.push(`${BASE_TAG} introuvable : pose le tag ${BASE_TAG} sur le starter`);
  for (const step of chain) {
    if (!tagExists(step.solution, cwd)) missing.push(`${step.solution} introuvable : pose le tag sur le commit de solution du lab ${step.lab}`);
  }
  if (missing.length > 0) return missing;
  const broken = [];
  if (chain.length > 0 && !isAncestor(BASE_TAG, chain[0].solution, cwd)) {
    broken.push(`${BASE_TAG} n’est pas un ancêtre de ${chain[0].solution} : la chaîne est cassée au départ`);
  }
  for (let i = 1; i < chain.length; i += 1) {
    const [prev, next] = [chain[i - 1], chain[i]];
    if (!isAncestor(prev.solution, next.solution, cwd)) {
      broken.push(`${prev.solution} n’est pas un ancêtre de ${next.solution} : la chaîne est cassée entre ${prev.lab} et ${next.lab}`);
    }
  }
  return broken;
}
