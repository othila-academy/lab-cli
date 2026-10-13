// Lance le Vitest du cours une fois sur les tests de composants d'une étape, avec la config de lab-cli,
// et rend son rapport JSON ; ou un message commun à tous les checks de composants quand rien n'a pu tourner.
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { outcomeOf } from './results.mjs';

export const COMPONENT_TIMEOUT_MS = 60000;
const CONFIG = fileURLToPath(new URL('./vitest.config.mjs', import.meta.url));
const posix = (p) => p.split(path.sep).join('/');
const shownDir = (root, dir) => posix(path.relative(root, dir)) || '.';

// Le bin de Vitest tel que le client le résout : celui du cours, hissé à la racine ou non ; null s'il manque.
export function vitestBin(clientDir) {
  try {
    const manifest = createRequire(path.join(clientDir, 'package.json')).resolve('vitest/package.json');
    const { bin } = JSON.parse(readFileSync(manifest, 'utf8'));
    const relative = typeof bin === 'string' ? bin : bin?.vitest;
    return relative ? path.resolve(path.dirname(manifest), relative) : null;
  } catch {
    return null;
  }
}

// Sous Unix, Vitest et ses processus de travail forment un groupe : le délai les arrête tous.
function spawnWithTimeout(args, options, timeoutMs) {
  return new Promise((resolve) => {
    const group = process.platform !== 'win32';
    const child = spawn(process.execPath, args, { ...options, detached: group, stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    let timedOut = false;
    child.stderr.on('data', (chunk) => (stderr += chunk));
    const timer = setTimeout(() => {
      timedOut = true;
      try {
        if (group) process.kill(-child.pid, 'SIGKILL');
        else child.kill('SIGKILL');
      } catch {
        child.kill('SIGKILL');
      }
    }, timeoutMs);
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code, stderr, timedOut });
    });
  });
}

export async function runVitest({ f, labDir, files, graphqlUrl = null, timeoutMs = COMPONENT_TIMEOUT_MS }) {
  if (!f.client) return { error: 'cette formation ne déclare pas de client (client dans .othila-lab/formation.json)' };
  const clientDir = f.client.path;
  const shown = shownDir(f.root, clientDir);
  if (!existsSync(clientDir)) return { error: `${shown} n'existe pas : as-tu créé le client ?` };
  const bin = vitestBin(clientDir);
  if (!bin) return { error: `Vitest n'est pas installé pour ${shown} : installe-le avec jsdom et @testing-library/react, en dépendances de développement du client` };

  const out = mkdtempSync(path.join(tmpdir(), 'othila-vitest-'));
  const outputFile = path.join(out, 'rapport.json');
  const env = {
    ...process.env,
    NO_COLOR: '1',
    LAB_CLIENT_DIR: clientDir,
    LAB_DIR: labDir,
    LAB_TEST_FILES: JSON.stringify(files.map(posix)),
    LAB_SETUP: f.client.setupPath ?? ''
  };
  if (graphqlUrl) env.LAB_GRAPHQL_URL = graphqlUrl;
  else delete env.LAB_GRAPHQL_URL;
  try {
    const args = [bin, 'run', '--config', CONFIG, '--reporter=json', `--outputFile=${outputFile}`];
    const { code, stderr, timedOut } = await spawnWithTimeout(args, { cwd: clientDir, env }, timeoutMs);
    if (timedOut) return { error: `les tests ont dépassé ${timeoutMs / 1000} s : un composant attend-il une réponse qui ne vient pas ?` };
    try {
      return { report: JSON.parse(readFileSync(outputFile, 'utf8')) };
    } catch {
      return { error: `Vitest n'a pas produit de rapport (code ${code}) : ${stderr.trim().slice(-500)}` };
    }
  } finally {
    rmSync(out, { recursive: true, force: true });
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
      return outcomeOf(run.report, { file, test, labDir: lab.dir, root: f.root, clientDir: f.client.path });
    }
  };
}
