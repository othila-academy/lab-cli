import { loadSession, loadState, saveState } from '../config.mjs';
import { pointsFor } from '../points.mjs';
import { loadLab, loadStep } from '../labs.mjs';
import { createReporter, describeFlush } from '../reporter.mjs';

const USAGE = 'usage : lab hint <lab> <étape> [--yes]';

export async function run({ positionals: [labId, stepId], flags, io }) {
  if (!labId || !stepId) throw new Error(USAGE);
  const lab = await loadLab(labId);
  const step = await loadStep(lab, stepId);
  const state = loadState();
  const key = `${lab.id}/${step.id}`;
  const revealed = state.hints[key] ?? 0;

  if (revealed >= step.hints.length) {
    if (step.hints.length === 0) io.out("pas d'indice pour cette étape");
    else {
      io.out(`les ${step.hints.length} indices sont déjà révélés :`);
      step.hints.forEach((hint, i) => io.out(`  ${i + 1}. ${hint}`));
    }
    return 0;
  }

  const level = revealed + 1;
  // Le coût d'un indice est annoncé et confirmé ; une étape acquise a ses points figés (points/regle.md).
  const acquired = state.steps[key]?.points !== undefined;
  if (acquired) {
    io.out('étape acquise : cet indice est gratuit');
  } else if (io.isTTY && !flags.yes) {
    const before = pointsFor(step.points, revealed);
    const after = pointsFor(step.points, level);
    io.out(`Indice ${level}/${step.hints.length} : ton étape passe de ${before} à ${after} points (sur ${step.points}).`);
    const answer = (await io.question('Le révéler ? [o/N]')).trim().toLowerCase();
    if (answer !== 'o' && answer !== 'oui') {
      io.out('indice non révélé');
      return 0;
    }
  }
  state.hints[key] = level;
  saveState(state);
  io.out(`indice ${level}/${step.hints.length} : ${step.hints[level - 1]}`);

  const reporter = createReporter({ config: loadSession(), enabled: !flags['no-report'] });
  reporter.record('hint.revealed', { lab: lab.id, step: step.id, payload: { level } });
  if (!flags['no-report']) io.out(describeFlush(await reporter.flush(), reporter.connected));
  return 0;
}
