import { formation, loadSession, loadState, saveState } from '../config.mjs';
import { applySubmit } from '../points.mjs';
import { totals } from '../totals.mjs';
import { loadLab, loadStep } from '../labs.mjs';
import { createReporter, describeFlush } from '../reporter.mjs';

const USAGE = 'usage : lab submit <lab> <étape> [--text EXPLICATION]';
const MAX_LENGTH = 2000;

async function readExplanation(io) {
  io.out('ton explication, en deux phrases (ligne vide pour terminer) :');
  const lines = [];
  for (;;) {
    const line = await io.question('>');
    if (line === '') break;
    lines.push(line);
  }
  return lines.join(' ');
}

export async function run({ positionals: [labId, stepId], flags, io }) {
  if (!labId || !stepId) throw new Error(USAGE);
  const lab = await loadLab(labId);
  const step = await loadStep(lab, stepId);
  const text = (flags.text !== undefined ? String(flags.text) : await readExplanation(io)).trim();
  if (text.length === 0) {
    io.err("l'explication est vide");
    return 3;
  }
  if (text.length > MAX_LENGTH) {
    io.err(`${MAX_LENGTH} caractères au plus (${text.length} reçus)`);
    return 3;
  }

  const reporter = createReporter({ config: loadSession(), enabled: !flags['no-report'] });
  reporter.record('answer.submitted', { lab: lab.id, step: step.id, payload: { text } });
  io.out(`explication enregistrée pour ${lab.id} › ${step.id}`);
  if (!flags['no-report']) io.out(describeFlush(await reporter.flush(), reporter.connected));

  const key = `${lab.id}/${step.id}`;
  const state = loadState();
  const entry = { ...(state.steps[key] ?? { state: 'aucun', passed: 0, total: step.checks.length, runs: 0 }), submitted: true };
  // Acquise à la première soumission faite au vert ; figée ensuite (points/regle.md).
  // green manque dans un state.json d'avant la 0.6.0 : on retombe sur l'état du dernier check.
  const rec = applySubmit({ green: entry.green ?? entry.state === 'vert', hintLevel: state.hints[key] ?? 0, points: entry.points }, step.points);
  const acquiring = entry.points === undefined && rec.points !== undefined;
  if (acquiring) entry.points = rec.points;
  state.steps[key] = entry;
  saveState(state);

  if (acquiring) {
    const sum = await totals(formation(), state);
    const own = sum.labs.get(lab.id);
    // Un brouillon n'est pas dans le manifeste : ni total de lab ni total de formation qui aient un sens.
    io.out(own ? `+${entry.points} points · ${lab.id} : ${own.points} / ${own.max} · formation : ${sum.points} / ${sum.max}` : `+${entry.points} points`);
  } else if (entry.points === undefined) {
    io.out(`les points s’acquièrent sur une étape verte : npx lab check ${lab.id} ${step.id}`);
  }

  // La suite : l'étape suivante du lab, ou la fin du lab.
  const next = lab.steps[lab.steps.indexOf(step.id) + 1];
  if (next) {
    io.out(`Étape suivante : npx lab show ${lab.id} ${next}`);
  } else {
    io.out(`Lab terminé. Commite ton travail : git add -A && git commit -m "lab ${lab.id}"`);
    io.out('Lab suivant : npx lab catalog, puis npx lab start <lab>');
  }
  return 0;
}
