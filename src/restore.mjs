// Le rattrapage au join (contrat 4.7) : l'état local de chaque étape travaillée, remonté en step.restored
// à la session tout juste rejointe, pour que le formateur voie où en est l'apprenant.
import { catalogLabs, loadLab, loadStep } from './labs.mjs';
import { HINT_MALUS_PERCENT, pointsFor } from './points.mjs';
import { buildEvent } from './reporter.mjs';

// Le niveau d'indice figé à l'acquisition, que state.json ne garde pas : le plus petit niveau qui redonne
// les points acquis avec la valeur de l'étape ; à défaut, le niveau actuel. null si l'étape n'est pas acquise.
export function acquiredLevel(value, points, hintLevel) {
  if (points === undefined) return null;
  for (let level = 0; level < HINT_MALUS_PERCENT.length; level++) if (pointsFor(value, level) === points) return level;
  return hintLevel;
}

// Les évènements à envoyer, dans l'ordre du catalogue (labs intégrés compris), à at strictement croissants :
// le serveur en tire l'étape courante, la plus avancée. Un lab qui ne se charge plus est sauté.
export async function restoreEvents({ config, f, state, now = new Date() }) {
  const events = [];
  for (const { id } of catalogLabs(f)) {
    let lab;
    const steps = [];
    try {
      lab = await loadLab(id, f);
      for (const stepId of lab.steps) {
        const key = `${lab.id}/${stepId}`;
        if (state.steps[key] || state.hints[key] !== undefined || state.predictions[key]) steps.push(await loadStep(lab, stepId));
      }
    } catch {
      continue;
    }
    for (const step of steps) {
      const key = `${lab.id}/${step.id}`;
      const entry = state.steps[key];
      const hintLevel = state.hints[key] ?? 0;
      const prediction = state.predictions[key];
      const payload = {
        state: entry?.state ?? 'aucun',
        passed: entry?.passed ?? 0,
        total: entry?.total ?? step.checks.length,
        runs: entry?.runs ?? 0,
        submitted: Boolean(entry?.submitted),
        hintLevel,
        acquiredHintLevel: acquiredLevel(step.points, entry?.points, hintLevel),
        prediction: prediction && step.prediction?.promptId ? { promptId: step.prediction.promptId, answer: prediction.answer, correct: prediction.correct } : null
      };
      events.push(buildEvent(config, 'step.restored', { lab: lab.id, step: step.id, payload, at: new Date(now.getTime() + events.length) }));
    }
  }
  return events;
}
