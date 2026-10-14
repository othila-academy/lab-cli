// Lance le Vitest du cours une fois sur les tests de composants d'une étape, avec la config de lab-cli,
// et rend son rapport JSON ; ou un message commun à tous les checks de composants quand rien n'a pu tourner.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startupFailure } from './messages.mjs';
import { outcomeOf, realPath } from './results.mjs';

export const COMPONENT_TIMEOUT_MS = 60000;
const CONFIG = fileURLToPath(new URL('./vitest.config.mjs', import.meta.url));
const posix = (p) => p.split(path.sep).join('/');
const shownDir = (root, dir) => posix(path.relative(root, dir)) || '.';

// Le package.json d'un paquet tel que le client le résout (celui du cours, hissé à la racine ou non) ; null s'il manque.
function packageOf(clientDir, name) {
  try {
    const file = createRequire(path.join(clientDir, 'package.json')).resolve(`${name}/package.json`);
    return { file, json: JSON.parse(readFileSync(file, 'utf8')) };
  } catch {
    return null;
  }
}

// Le bin de Vitest tel que le client le résout ; null s'il manque.
export function vitestBin(clientDir) {
  const found = packageOf(clientDir, 'vitest');
  const bin = found?.json.bin;
  const relative = typeof bin === 'string' ? bin : bin?.vitest;
  return relative ? path.resolve(path.dirname(found.file), relative) : null;
}

// Une version de Node contre une plage d'engines (^, ~, >=, >, <=, <, =, alternatives ||) ; null si la plage n'est pas lue.
const versionOf = (text) => {
  const m = String(text).trim().replace(/^v/, '').match(/^(\d+)(?:\.(\d+))?(?:\.(\d+))?/);
  return m ? [Number(m[1]), Number(m[2] ?? 0), Number(m[3] ?? 0)] : null;
};
const compare = (a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];

export function satisfiesNode(version, range) {
  const node = versionOf(version);
  let unknown = false;
  const alternatives = String(range).split('||').map((alternative) =>
    alternative.trim().split(/\s+/).filter(Boolean).every((token) => {
      const m = token.match(/^(\^|~|>=|<=|>|<|=)?(v?\d+(?:\.\d+){0,2})$/);
      if (!m) {
        unknown = true;
        return true;
      }
      const [, op = '=', text] = m;
      const v = versionOf(text);
      const c = compare(node, v);
      if (op === '>=') return c >= 0;
      if (op === '>') return c > 0;
      if (op === '<=') return c <= 0;
      if (op === '<') return c < 0;
      if (op === '^') return c >= 0 && (v[0] > 0 ? node[0] === v[0] : node[1] === v[1]);
      if (op === '~') return c >= 0 && node[0] === v[0] && node[1] === v[1];
      return c === 0;
    })
  );
  if (unknown) return null;
  return alternatives.some(Boolean);
}

// Vitest et jsdom refusent de tourner sur un Node qu'ils ne prennent pas en charge, sans le dire clairement.
function engineProblem(clientDir) {
  for (const name of ['vitest', 'jsdom']) {
    const found = packageOf(clientDir, name);
    const range = found?.json.engines?.node;
    if (range && satisfiesNode(process.versions.node, range) === false) {
      return `${name} ${found.json.version} demande Node ${range} (installé : ${process.versions.node}) : change de version de Node`;
    }
  }
  return null;
}

// Arrête Vitest et ses processus de travail. Sous Unix, ils forment un groupe : on tue le groupe ;
// sous Windows, child.kill n'atteint pas les processus de travail : taskkill /T emporte l'arbre.
export function stopTree(child, { platform = process.platform, runSync = spawnSync } = {}) {
  if (platform === 'win32') {
    runSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
    return;
  }
  try {
    process.kill(-child.pid, 'SIGKILL');
  } catch {
    child.kill('SIGKILL');
  }
}

const EXIT_ON = { SIGINT: 130, SIGTERM: 143 };

// Lance Vitest avec un délai. Ctrl+C (ou SIGTERM) pendant les tests arrête Vitest et ses processus de travail,
// appelle cleanup (le dossier du rapport), puis termine lab avec le code d'usage (130, 143).
function spawnWithTimeout(args, options, timeoutMs, cleanup) {
  return new Promise((resolve) => {
    const group = process.platform !== 'win32';
    const child = spawn(process.execPath, args, { ...options, detached: group, stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true });
    let stderr = '';
    let timedOut = false;
    child.stderr.on('data', (chunk) => (stderr += chunk));
    const timer = setTimeout(() => {
      timedOut = true;
      stopTree(child);
    }, timeoutMs);
    const interrupted = (signal) => {
      clearTimeout(timer);
      stopTree(child);
      cleanup();
      process.exit(EXIT_ON[signal]);
    };
    for (const signal of Object.keys(EXIT_ON)) process.once(signal, interrupted);
    child.on('close', (code) => {
      clearTimeout(timer);
      for (const signal of Object.keys(EXIT_ON)) process.off(signal, interrupted);
      resolve({ code, stderr, timedOut });
    });
  });
}

export async function runVitest({ f, labDir, files, graphqlUrl = null, timeoutMs = COMPONENT_TIMEOUT_MS }) {
  if (!f.client) return { error: 'cette formation ne déclare pas de client (client dans .othila-lab/formation.json)' };
  const shown = shownDir(f.root, f.client.path);
  if (!existsSync(f.client.path)) return { error: `${shown} n'existe pas : as-tu créé le client ?` };
  // Chemins réels : Vite compare des chemins réels à sa liste d'accès (liens, jonctions, chemins courts de Windows).
  const clientDir = realpathSync(f.client.path);
  const bin = vitestBin(clientDir);
  if (!bin) return { error: `Vitest n'est pas installé pour ${shown} : installe-le avec jsdom et @testing-library/react, en dépendances de développement du client` };
  const engines = engineProblem(clientDir);
  if (engines) return { error: engines };

  const out = mkdtempSync(path.join(tmpdir(), 'othila-vitest-'));
  const outputFile = path.join(out, 'rapport.json');
  const env = {
    ...process.env,
    NO_COLOR: '1',
    LAB_CLIENT_DIR: clientDir,
    LAB_DIR: realPath(labDir),
    LAB_TEST_FILES: JSON.stringify(files.map(posix)),
    LAB_SETUP: f.client.setupPath ? realPath(f.client.setupPath) : ''
  };
  if (graphqlUrl) env.LAB_GRAPHQL_URL = graphqlUrl;
  else delete env.LAB_GRAPHQL_URL;
  const cleanup = () => rmSync(out, { recursive: true, force: true });
  try {
    const args = [bin, 'run', '--config', CONFIG, '--reporter=json', `--outputFile=${outputFile}`];
    const { code, stderr, timedOut } = await spawnWithTimeout(args, { cwd: clientDir, env }, timeoutMs, cleanup);
    if (timedOut) return { error: `les tests ont dépassé ${timeoutMs / 1000} s : un composant attend-il une réponse qui ne vient pas ?` };
    try {
      return { report: JSON.parse(readFileSync(outputFile, 'utf8')) };
    } catch {
      return { error: startupFailure(stderr, { root: realPath(f.root), clientDir }, CONFIG, code) };
    }
  } finally {
    cleanup();
  }
}

// Le lanceur d'une étape : Vitest joue une seule fois tous les fichiers cités par ses componentTest.
export function componentRunner({ f, lab, step, graphqlUrl = null }) {
  const files = [...new Set(step.checks.filter((c) => c.component).map((c) => c.component.file))];
  let pending = null;
  return {
    async outcome({ file, test }) {
      pending ??= runVitest({ f, labDir: lab.dir, files, graphqlUrl });
      const run = await pending;
      if (run.error) return run.error;
      // Chemins réels, comme ceux que rapporte Vitest : les messages restent relatifs à la racine du dépôt.
      return outcomeOf(run.report, { file, test, labDir: lab.dir, root: realPath(f.root), clientDir: realPath(f.client.path) });
    }
  };
}
