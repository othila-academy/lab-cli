import { endpointUrl } from '../config.mjs';
import { catalog, listLabs } from '../labs.mjs';
import { ensureReplaySession, formatReport, replayLab, reportReplay } from '../replay.mjs';

// lab replay [--lab ID] [--keep] [--session CODE] [--endpoint URL] : depuis la racine du dépôt de cours,
// machine du formateur. Avec --session, le résultat alimente une session simulée (FORMATEUR_KEY requis).
export async function run({ flags, io }) {
  if (flags.session === true) {
    io.err('--session demande un code de session : npx lab replay --session SIM-REPLAY');
    return 3;
  }
  const session = flags.session === undefined ? null : String(flags.session).toUpperCase();
  const key = process.env.FORMATEUR_KEY;
  if (session && !key) {
    io.err('--session demande la clé formateur : FORMATEUR_KEY=… npx lab replay --session ' + session);
    return 3;
  }
  const labs = flags.lab ? [String(flags.lab)] : listLabs().map((l) => l.id);
  if (labs.length === 0) {
    io.err('aucun lab à rejouer : lance la commande depuis la racine du dépôt de cours');
    return 3;
  }
  const endpoint = flags.endpoint ? String(flags.endpoint) : endpointUrl();
  // Remontée en échec : 2 si le serveur othila-lab est injoignable, 1 pour un refus (clé, session réelle).
  const reportFailure = (error) => {
    io.err(error.message);
    return error.unreachable ? 2 : 1;
  };
  if (session) {
    try {
      const state = await ensureReplaySession({ endpoint, key, session, catalog: (await catalog()).labs });
      io.out(`session ${session} ${state === 'created' ? 'créée' : 'reprise'}, simulée`);
    } catch (error) {
      return reportFailure(error);
    }
  }

  let failed = false;
  for (const labId of labs) {
    const report = await replayLab(labId, { keep: Boolean(flags.keep), log: io.out });
    io.out('');
    for (const line of formatReport(report)) io.out(line);
    if (report.states.some((s) => s.problems.length > 0)) failed = true;
    if (session) {
      let outcome;
      try {
        outcome = await reportReplay(report, { endpoint, key, session });
      } catch (error) {
        return reportFailure(error);
      }
      const { sent, rejected } = outcome;
      const reasons = [...new Set(rejected.map((r) => r.reason))];
      io.out(`session ${session} : ${sent} évènement(s) envoyé(s)${rejected.length ? `, ${rejected.length} rejeté(s) : ${reasons.join(', ')}` : ''}`);
      if (rejected.length > 0) failed = true;
    }
  }
  io.out(failed ? '\nrejeu : des écarts à corriger' : '\nrejeu : conforme');
  return failed ? 1 : 0;
}
