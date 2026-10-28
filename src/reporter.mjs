// Le reporter : fabrique les évènements du contrat, les garde dans une outbox JSONL,
// et les envoie par lots. Hors ligne, rien n'est perdu : l'outbox repart au lancement suivant.
import { randomUUID } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { localDir, loadSession } from './config.mjs';
import { postJson } from './http.mjs';

export const SCHEMA = 'othila-lab/1';
const BATCH = 500;

export function buildEvent(config, type, { lab = null, step = null, payload = {}, at = new Date(), source = 'reporter' } = {}) {
  return {
    schema: SCHEMA,
    id: randomUUID(),
    type,
    session: config.session,
    learner: config.learnerId,
    lab,
    step,
    at: at.toISOString(),
    source,
    payload
  };
}

const readLines = (file) => (existsSync(file) ? readFileSync(file, 'utf8').split('\n').filter(Boolean) : []);

// Lit l'outbox. Une ligne illisible (processus tué pendant l'écriture) est mise de côté dans
// rejected.jsonl avec le motif unparseable, pour que les autres évènements repartent quand même.
function readOutbox(outbox, rejectedFile) {
  const events = [];
  for (const line of readLines(outbox)) {
    try {
      events.push(JSON.parse(line));
    } catch {
      appendFileSync(rejectedFile, `${JSON.stringify({ reason: 'unparseable', line })}\n`);
    }
  }
  return events;
}
function writeLines(file, items) {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, items.map((item) => JSON.stringify(item)).join('\n') + (items.length ? '\n' : ''));
}

export function createReporter({ config = loadSession(), dir = localDir(), enabled = true } = {}) {
  const outbox = path.join(dir, 'outbox.jsonl');
  const rejectedFile = path.join(dir, 'rejected.jsonl');
  const active = Boolean(config) && enabled;

  return {
    connected: Boolean(config),

    record(type, options) {
      if (!active) return null;
      const event = buildEvent(config, type, options);
      mkdirSync(dir, { recursive: true });
      appendFileSync(outbox, `${JSON.stringify(event)}\n`);
      return event;
    },

    // Un évènement déjà construit (le rattrapage du join) : même outbox, même envoi.
    append(event) {
      if (!active) return null;
      mkdirSync(dir, { recursive: true });
      appendFileSync(outbox, `${JSON.stringify(event)}\n`);
      return event;
    },

    async flush({ timeoutMs = 3000 } = {}) {
      if (!active) return { sent: 0, rejected: 0, pending: 0, offline: false };
      let pending = readOutbox(outbox, rejectedFile);
      let sent = 0;
      let rejected = 0;
      while (pending.length > 0) {
        const batch = pending.slice(0, BATCH);
        let res;
        try {
          res = await postJson(`${config.endpoint}/api/events`, batch, { headers: { authorization: `Bearer ${config.token}` }, timeoutMs });
        } catch (error) {
          writeLines(outbox, pending);
          return { sent, rejected, pending: pending.length, offline: true, reason: error.message };
        }
        if (res.status !== 200 || !res.json) {
          writeLines(outbox, pending);
          return { sent, rejected, pending: pending.length, offline: true, reason: `HTTP ${res.status}` };
        }
        const accepted = new Set(res.json.accepted ?? []);
        const reasons = new Map((res.json.rejected ?? []).map((r) => [r.id, r.reason]));
        const done = new Set();
        for (const event of batch) {
          if (accepted.has(event.id)) {
            sent += 1;
            done.add(event.id);
          } else if (reasons.has(event.id)) {
            rejected += 1;
            done.add(event.id);
            appendFileSync(rejectedFile, `${JSON.stringify({ ...event, reason: reasons.get(event.id) })}\n`);
          }
        }
        pending = pending.filter((event) => !done.has(event.id));
        if (done.size === 0) {
          // Réponse 200 sans aucun id connu : on garde tout plutôt que de boucler.
          writeLines(outbox, pending);
          return { sent, rejected, pending: pending.length, offline: true, reason: 'réponse sans id reconnu' };
        }
      }
      writeLines(outbox, []);
      return { sent, rejected, pending: 0, offline: false };
    }
  };
}

// Une ligne pour l'apprenant, après chaque commande.
export function describeFlush(flush, connected) {
  if (!connected) return 'non connecté à une session : lance `lab join` pour remonter tes résultats au formateur';
  if (flush.offline) {
    const hint = flush.reason === 'HTTP 401' ? ' ; jeton refusé, relance `lab join`' : '';
    return `hors ligne : ${flush.pending} évènement(s) conservé(s), renvoyé(s) au prochain lancement (${flush.reason})${hint}`;
  }
  const parts = [`${flush.sent} évènement(s) envoyé(s) au formateur`];
  if (flush.rejected) parts.push(`${flush.rejected} rejeté(s), voir .othila-lab/local/rejected.jsonl`);
  return parts.join(' · ');
}
