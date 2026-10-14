import { NO_SERVER, formation, graphqlUrl, loadSession, loadState, saveState, serverScript } from '../config.mjs';
import { componentRunner } from '../component/runner.mjs';
import { formatResults, runChecks } from '../checks.mjs';
import { describe } from '../git.mjs';
import { gql, unreachableMessage, waitForServer } from '../graphql.mjs';
import { loadLab, loadStep, stepDigest } from '../labs.mjs';
import { applyCheck, pointsFor } from '../points.mjs';
import { createReporter, describeFlush } from '../reporter.mjs';
import { startServer } from '../servers.mjs';

const USAGE = 'usage : lab check <lab> [étape] [--url URL] [--answer RÉPONSE] [--json] [--no-report]';
const SERVER_WAIT_MS = 5000;

async function askPrediction(io, prediction, answerFlag) {
  if (answerFlag !== undefined) return String(answerFlag);
  io.out(`\nAvant de lancer : ${prediction.question}`);
  if (prediction.choices?.length) io.out(`  choix : ${prediction.choices.join(' · ')}`);
  return io.question('ta prédiction :');
}

// Le serveur ne répond pas (code 2), ou répond par une erreur : c'est alors au code de l'apprenant de changer (code 1).
const unreachable = (url, error) => ({
  passed: [],
  failed: [
    error?.status
      ? { id: 'server-error', label: 'le serveur du fil rouge répond', message: error.message }
      : { id: 'server-unreachable', label: 'le serveur du fil rouge répond', message: unreachableMessage(url) }
  ],
  durationMs: 0
});

export async function run({ positionals: [labId, stepId], flags, io }) {
  if (!labId) throw new Error(USAGE);
  const f = formation();
  const lab = await loadLab(labId, f);
  const stepIds = stepId ? [stepId] : lab.steps;
  const config = loadSession();
  const reporter = createReporter({ config, enabled: !flags['no-report'] });
  // Sans serveur déclaré (formation front), rien n'est attendu et gql le dit.
  const hasServer = serverScript() !== null;
  const url = hasServer ? graphqlUrl(flags.url) : null;
  const query = hasServer ? (q, options) => gql(url, q, options) : async () => { throw new Error(NO_SERVER); };
  const state = loadState();
  const results = [];
  let exit = 0;

  for (const id of stepIds) {
    const step = await loadStep(lab, id);
    const key = `${lab.id}/${step.id}`;

    // Prédire avant d'exécuter : une fois par étape, puis on compare à l'observation.
    // Une sortie --json est faite pour une machine (rejeu) : aucune question au terminal,
    // la prédiction n'est prise en compte que si --answer la fournit.
    const askable = flags.answer !== undefined || !flags.json;
    if (step.prediction && !state.predictions[key] && askable) {
      const answer = (await askPrediction(io, step.prediction, flags.answer)).trim();
      if (!answer) throw new Error('une prédiction est attendue avant de lancer les checks');
      const correct = step.prediction.expected === undefined ? null : answer === String(step.prediction.expected);
      state.predictions[key] = { answer, correct };
      saveState(state);
      reporter.record('prediction.submitted', { lab: lab.id, step: step.id, payload: { promptId: step.prediction.promptId, answer, correct } });
    }

    let outcome = null;
    if (hasServer) {
      try {
        await waitForServer(url, SERVER_WAIT_MS);
      } catch (error) {
        outcome = unreachable(url, error);
      }
    }
    if (!outcome) {
      const components = componentRunner({ f, lab, step, graphqlUrl: url });
      outcome = await runChecks(step.checks, { url, gql: query, state: {}, lab, step, io, startServer, runChecks, components });
    }

    reporter.record('check.completed', {
      lab: lab.id,
      step: step.id,
      payload: { durationMs: outcome.durationMs, passed: outcome.passed, failed: outcome.failed, courseRef: describe().slice(0, 100), stepDigest: stepDigest(step.file) }
    });

    const down = outcome.failed.some((f) => f.id === 'server-unreachable');
    // green suit chaque check envoyé, injoignable compris : le serveur le compte comme un échec,
    // et une soumission qui suit n'acquiert rien, ni ici ni là-bas (points/regle.md).
    const { green } = applyCheck({}, !down && outcome.failed.length === 0);
    if (down && state.steps[key]) {
      state.steps[key] = { ...state.steps[key], green };
      saveState(state);
    }
    if (!down) {
      // Dernier résultat de l'étape, pour lab progress ; un nouveau check rouvre une étape soumise.
      state.steps[key] = {
        state: outcome.failed.length === 0 ? 'vert' : 'en-echec',
        passed: outcome.passed.length,
        total: step.checks.length,
        runs: (state.steps[key]?.runs ?? 0) + 1,
        submitted: false,
        green,
        // Les points acquis restent : un nouveau check en échec ne les reprend pas (points/regle.md).
        ...(state.steps[key]?.points !== undefined ? { points: state.steps[key].points } : {})
      };
      saveState(state);
    }
    if (down) exit = 2;
    else if (outcome.failed.length > 0 && exit === 0) exit = 1;

    results.push({
      lab: lab.id, step: step.id, passed: outcome.passed, failed: outcome.failed, durationMs: outcome.durationMs,
      checks: step.checks.map((c) => ({ id: c.id, passesOnStart: Boolean(c.passesOnStart) })),
      prediction: state.predictions[key] ?? null
    });

    if (!flags.json) {
      io.out(`\n${lab.title} › ${step.title}`);
      for (const line of formatResults(outcome, step.checks)) io.out(line);
      const prediction = step.prediction && state.predictions[key];
      if (prediction) {
        const verdict = prediction.correct === null ? '' : prediction.correct ? ' · juste' : ` · attendu ${step.prediction.expected}`;
        io.out(`  prédiction : ${prediction.answer}${verdict}`);
      }
      if (!down && outcome.failed.length === 0) {
        const acquired = state.steps[key]?.points !== undefined;
        io.out(acquired
          ? `  Étape validée. Explique en deux phrases : npx lab submit ${lab.id} ${step.id}`
          : `  Étape validée. Explique en deux phrases pour acquérir ${pointsFor(step.points, state.hints[key] ?? 0)} points : npx lab submit ${lab.id} ${step.id}`);
      }
    }
    if (down) break;
  }

  const flush = await reporter.flush();
  if (flags.json) io.out(JSON.stringify({ results, flush }));
  else if (!flags['no-report']) io.out(describeFlush(flush, reporter.connected));
  return exit;
}
