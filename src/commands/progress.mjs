import { formation, loadSession, loadState } from '../config.mjs';
import { catalogLabs, describeLab } from '../labs.mjs';
import { totals } from '../totals.mjs';

const STATUS = { vert: 'vert', 'en-echec': 'en échec', aucun: 'aucun' };

// L'avancement de cette machine, séance par séance, lab par lab et étape par étape, lu dans l'état local : marche hors ligne.
export async function run({ io }) {
  const session = loadSession();
  const state = loadState();
  const f = formation();
  const sum = await totals(f, state);
  io.out(session ? `Progression · session ${session.session} · ${session.firstName}` : 'Progression · non connecté à une session');
  let current = null;
  for (const { id, seance } of catalogLabs(f)) {
    if (seance !== current) {
      current = seance;
      io.out('');
      io.out(seance);
    }
    const lab = await describeLab(id, f);
    const own = sum.labs.get(lab.id);
    io.out(`  ${lab.id} · ${lab.title} · ${own.points} / ${own.max}`);
    const width = Math.max(...lab.steps.map((s) => s.id.length));
    for (const s of lab.steps) {
      const key = `${lab.id}/${s.id}`;
      const entry = state.steps[key];
      const pts = `${entry?.points ?? '—'}/${s.points}`;
      if (!entry) {
        io.out(`    ${s.id.padEnd(width)}  —  ${pts}`);
        continue;
      }
      const hints = state.hints[key] ?? 0;
      const cells = [s.id.padEnd(width), (entry.submitted ? 'soumis' : STATUS[entry.state] ?? entry.state).padEnd(8), `${entry.passed}/${entry.total}`, pts];
      if (hints > 0) cells.push(`${hints} indice(s)`);
      io.out(`    ${cells.join('  ')}`);
    }
  }
  io.out('');
  io.out(`Total : ${sum.points} / ${sum.max}`);
  io.out('');
  io.out('Progression de cette machine. Le formateur suit la session sur son écran.');
  return 0;
}
