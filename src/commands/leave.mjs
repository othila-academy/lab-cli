import { rmSync } from 'node:fs';
import path from 'node:path';
import { localDir, loadSession } from '../config.mjs';
import { createReporter } from '../reporter.mjs';

// Quitter la session : envoyer ce qui attend, puis effacer le jeton de la machine (poste d'école partagé).
// La progression locale (state.json) reste ; lab join suffit pour revenir.
export async function run({ flags, io }) {
  const config = loadSession();
  if (!config) {
    io.out('aucune session sur cette machine : rien à quitter');
    return 0;
  }
  const dir = localDir();
  const flush = await createReporter({ config, dir }).flush();
  if (flush.pending > 0 && !flags.force) {
    io.err(`${flush.pending} évènement(s) en attente n'ont pas pu partir (${flush.reason}) : reconnecte-toi au réseau et relance lab leave, ou lab leave --force pour les abandonner`);
    return 2;
  }
  rmSync(path.join(dir, 'session.json'), { force: true });
  if (flags.force) rmSync(path.join(dir, 'outbox.jsonl'), { force: true });
  io.out(`session ${config.session} quittée : jeton effacé de cette machine. Ta progression reste visible avec npx lab progress. Pour revenir : npx lab join`);
  return 0;
}
