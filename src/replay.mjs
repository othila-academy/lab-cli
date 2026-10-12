// Rejeu des labs sur la chaîne, depuis la machine du formateur.
// Pour chaque lab et chaque état (start = son départ, solution = solution/<lab>) : worktree git sur le tag, npm ci,
// .othila-lab/ et le paquet lab de l'arbre courant posés dessus, serveur en processus fils,
// `lab check --json --no-report`, puis comparaison à la règle : tout échoue au départ sauf passesOnStart, tout passe sur la solution.
// Le tag fige le code ; la définition du lab et la commande sont celles d'aujourd'hui.
import { execFileSync, spawn } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { HOME, formation, projectRoot } from './config.mjs';
import { git } from './git.mjs';
import { getJson, postJson } from './http.mjs';
import { buildEvent } from './reporter.mjs';
import { startServer } from './servers.mjs';

export const STATES = ['start', 'solution'];

export function evaluate(state, results) {
  const problems = [];
  for (const r of results) {
    for (const check of r.checks) {
      const passed = r.passed.includes(check.id);
      const expected = state === 'solution' || Boolean(check.passesOnStart);
      if (passed !== expected) problems.push(`${r.lab}/${r.step}/${check.id} : ${passed ? 'passe' : 'échoue'} sur ${state}, attendu ${expected ? 'passe' : 'échoue'}`);
    }
    for (const failure of r.failed) {
      if (!r.checks.some((c) => c.id === failure.id)) problems.push(`${r.lab}/${r.step}/${failure.id} : ${failure.message}`);
    }
  }
  return problems;
}

// Le paquet qui exécute le rejeu : sa commande joue les checks, et les labs l'importent sous @othila-academy/lab.
const PACKAGE_ROOT = fileURLToPath(new URL('../', import.meta.url));
const LAB_BINARY = path.join(PACKAGE_ROOT, 'bin', 'lab.mjs');

// Après npm ci : les définitions de l'arbre courant (sans l'état local) et le paquet courant remplacent ceux de l'état.
function overlay(repo, dir) {
  const source = path.join(repo, HOME);
  const target = path.join(dir, HOME);
  const local = path.join(source, 'local');
  rmSync(target, { recursive: true, force: true });
  cpSync(source, target, { recursive: true, filter: (p) => p !== local && !p.startsWith(local + path.sep) });
  const link = path.join(dir, 'node_modules', '@othila-academy', 'lab');
  rmSync(link, { recursive: true, force: true });
  mkdirSync(path.dirname(link), { recursive: true }); // absent quand le cours n'a aucune dépendance
  symlinkSync(PACKAGE_ROOT, link, 'dir');
}

function runCheckJson({ dir, labId, url, stateDir }) {
  const env = { ...process.env, OTHILA_LAB_DIR: stateDir };
  delete env.OTHILA_LAB_ROOT; // la commande trouve la racine du worktree elle-même
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [LAB_BINARY, 'check', labId, '--json', '--no-report', '--url', url], {
      cwd: dir,
      env,
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let out = '';
    let err = '';
    child.stdout.on('data', (c) => (out += c));
    child.stderr.on('data', (c) => (err += c));
    child.on('close', () => {
      const last = out.trim().split('\n').pop();
      try {
        resolve(JSON.parse(last).results);
      } catch {
        reject(new Error(`sortie illisible de lab check :\n${out.slice(-500)}\n${err.slice(-500)}`));
      }
    });
  });
}

// start et solution : les tags des deux états du lab, donnés par la chaîne (chainOf).
export async function replayLab(labId, { start, solution, repo = projectRoot(), keep = false, log = () => {} }) {
  const base = mkdtempSync(path.join(tmpdir(), `othila-rejeu-${labId}-`));
  const tags = { start, solution };
  const states = [];
  for (const state of STATES) {
    const tag = tags[state];
    const dir = path.join(base, state);
    log(`[rejeu] ${labId} · ${state} · worktree ${dir} sur ${tag}`);
    git(['worktree', 'add', '--detach', dir, tag], repo);
    let server = null;
    try {
      const started = Date.now();
      execFileSync('npm', ['ci', '--no-audit', '--no-fund'], { cwd: dir, stdio: 'pipe' });
      const installMs = Date.now() - started;
      overlay(repo, dir);
      server = await startServer({ cwd: dir, script: formation(dir).server });
      const results = await runCheckJson({ dir, labId, url: server.url, stateDir: path.join(base, `${state}-othila-lab`) });
      states.push({ state, tag, results, problems: evaluate(state, results), installMs });
    } finally {
      if (server) await server.stop();
      if (!keep) git(['worktree', 'remove', '--force', dir], repo);
    }
  }
  if (!keep) rmSync(base, { recursive: true, force: true });
  git(['worktree', 'prune'], repo);
  return { lab: labId, states };
}

export function formatReport(report) {
  const lines = ['| Lab | État | Étape | ✓ | ✗ | Anomalies |', '|---|---|---|---|---|---|'];
  for (const s of report.states) {
    for (const r of s.results) {
      const related = s.problems.filter((p) => p.startsWith(`${r.lab}/${r.step}/`));
      lines.push(`| ${report.lab} | ${s.state} | ${r.step} | ${r.passed.length} | ${r.failed.length} | ${related.length ? related.join(' ; ') : 'aucune'} |`);
    }
  }
  return lines;
}

// Erreur de remontée : `unreachable` distingue le serveur injoignable (code 2) d'un refus (code 1).
const failure = (message, unreachable = false) => Object.assign(new Error(message), { unreachable });

async function call(fn, endpoint) {
  try {
    return await fn();
  } catch (error) {
    throw failure(`serveur othila-lab injoignable sur ${endpoint} : ${error.message}`, true);
  }
}

// Crée la session simulée avec le catalogue, ou vérifie que celle qui existe l'est. Appelée avant
// le rejeu : une mauvaise clé, une mauvaise URL ou une session réelle se découvrent tout de suite,
// et aucun apprenant « Rejeu » n'est inscrit dans une vraie session.
export async function ensureReplaySession({ endpoint, key, session, catalog }) {
  const auth = { authorization: `Bearer ${key}` };
  const created = await call(() => postJson(`${endpoint}/api/sessions`, { code: session, title: `Rejeu ${session}`, simulated: true, labs: catalog }, { headers: auth, timeoutMs: 5000 }), endpoint);
  if (created.status === 401) throw failure('clé formateur refusée par le serveur othila-lab : vérifie FORMATEUR_KEY');
  if (created.status === 201) return 'created';
  if (created.status !== 409) throw failure(`création de la session ${session} refusée (HTTP ${created.status})${created.json?.error ? ` : ${created.json.error}` : ''}`);
  const board = await call(() => getJson(`${endpoint}/api/sessions/${encodeURIComponent(session)}/board`, { headers: auth, timeoutMs: 5000 }), endpoint);
  if (board.status !== 200 || !board.json?.session) throw failure(`lecture de la session ${session} impossible (HTTP ${board.status})`);
  if (!board.json.session.simulated) throw failure(`la session ${session} existe et n'est pas simulée : choisis un autre code, par exemple SIM-REPLAY`);
  return 'existing';
}

// Pousse le résultat d'un rejeu dans une session simulée déjà vérifiée : un apprenant
// par état (« Rejeu n1 start », « Rejeu n1 solution »), un check.completed par étape, source
// simulator, clé formateur. L'écran montre alors les deux lignes.
export async function reportReplay(report, { endpoint, key, session }) {
  const auth = { authorization: `Bearer ${key}` };

  let sent = 0;
  const rejected = [];
  for (const s of report.states) {
    const joined = await call(() => postJson(
      `${endpoint}/api/sessions/${encodeURIComponent(session)}/join`,
      { email: `rejeu-${report.lab}-${s.state}@othila.invalid`, firstName: `Rejeu ${report.lab} ${s.state}` },
      { timeoutMs: 5000 }
    ), endpoint);
    if (joined.status !== 200 || !joined.json?.learnerId) throw failure(`inscription du rejeu dans ${session} refusée (HTTP ${joined.status})`);
    const config = { session, learnerId: joined.json.learnerId };
    const events = s.results.map((r) =>
      buildEvent(config, 'check.completed', {
        lab: r.lab,
        step: r.step,
        source: 'simulator',
        payload: {
          durationMs: r.durationMs,
          passed: r.passed,
          failed: r.failed.map((f) => ({ id: f.id, label: String(f.label || f.id).slice(0, 200), message: String(f.message ?? '').slice(0, 1000) })),
          courseRef: s.tag
        }
      })
    );
    if (events.length === 0) continue;
    const res = await call(() => postJson(`${endpoint}/api/events`, events, { headers: auth, timeoutMs: 5000 }), endpoint);
    if (res.status !== 200 || !res.json) throw failure(`envoi du rejeu refusé (HTTP ${res.status})`);
    sent += res.json.accepted?.length ?? 0;
    rejected.push(...(res.json.rejected ?? []));
  }
  return { sent, rejected };
}
