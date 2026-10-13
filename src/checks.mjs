import { NO_SERVER } from './config.mjs';
import { subscribe as open, wsUrlOf } from './subscription/client.mjs';

// Joue les checks d'une étape dans l'ordre. Un check qui lève est un échec, quoi qu'il lève.
// Chaque check reçoit son propre subscribe : ses abonnements sont fermés quand il se termine.
export async function runChecks(checks, ctx) {
  const started = Date.now();
  const passed = [];
  const failed = [];
  for (const check of checks) {
    const subscriptions = [];
    let ended = false;
    // Un abonnement qui aboutit après la fin du check (Promise.all, await oublié) est fermé aussitôt ;
    // son échec éventuel est déjà géré ici, pour ne jamais laisser de rejet orphelin.
    const subscribe = (query, options) => {
      const pending = ctx.url
        ? open(wsUrlOf(ctx.url), query, options).then((sub) => {
            if (ended) sub.close();
            else subscriptions.push(sub);
            return sub;
          })
        : Promise.reject(new Error(NO_SERVER));
      pending.catch(() => {});
      return pending;
    };
    try {
      await check.run({ ...ctx, subscribe });
      passed.push(check.id);
    } catch (error) {
      const message = error && typeof error === 'object' && 'message' in error ? String(error.message) : String(error);
      failed.push({ id: check.id, label: check.label, message: message.slice(0, 1000) });
    } finally {
      ended = true;
      for (const sub of subscriptions) sub.close();
    }
  }
  return { passed, failed, durationMs: Date.now() - started };
}

export function formatResults({ passed, failed }, checks) {
  const known = new Set(checks.map((c) => c.id));
  const lines = [];
  for (const check of checks) {
    if (passed.includes(check.id)) lines.push(`  ✓ ${check.label}`);
    const failure = failed.find((f) => f.id === check.id);
    if (failure) lines.push(`  ✗ ${check.label}`, `    ${failure.message}`);
  }
  for (const failure of failed) {
    if (!known.has(failure.id)) lines.push(`  ✗ ${failure.label}`, `    ${failure.message}`);
  }
  return lines;
}
