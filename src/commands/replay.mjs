import { chainOf, verifyChain } from '../chain.mjs';
import { endpointUrl, formation } from '../config.mjs';
import { catalog } from '../labs.mjs';
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
  if (flags.lab === true) {
    io.err('--lab demande un identifiant de lab : npx lab replay --lab n1');
    return 3;
  }
  const f = formation();
  const chain = chainOf(f);
  const only = flags.lab === undefined ? null : String(flags.lab);
  const steps = only ? chain.filter((s) => s.lab === only) : chain;
  if (only && steps.length === 0) {
    io.err(`lab inconnu : ${only} (disponibles : ${chain.map((s) => s.lab).join(', ') || 'aucun'})`);
    return 3;
  }
  if (steps.length === 0) {
    io.err('aucun lab à rejouer : la chaîne de formation.json est vide');
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

  // La chaîne d'abord : un tag manquant ou mal placé s'annonce avant tout worktree.
  const problems = verifyChain(f, f.root, { until: only ?? undefined });
  if (problems.length > 0) {
    for (const problem of problems) io.err(problem);
    io.err('rejeu impossible : répare la chaîne (docs/ecrire-un-lab.md, « Dépannage »)');
    return 1;
  }

  let failed = false;
  for (const step of steps) {
    const report = await replayLab(step.lab, { start: step.start, solution: step.solution, repo: f.root, keep: Boolean(flags.keep), log: io.out });
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
