import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

// Un faux Vitest installé dans le node_modules d'un client de test. Il note chaque lancement (arguments, dossier,
// variables utiles) dans calls.jsonl et écrit le rapport que décrit plan.json :
// { sleepMs?, worker?, noReport?, files: { "<fichier relatif au lab>": { message?, tests: { "<titre>": "passed" | "skipped" | { failed: "<message>" } } } } }
const SCRIPT = `import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const plan = JSON.parse(readFileSync(path.join(here, 'plan.json'), 'utf8'));
const args = process.argv.slice(2);
const pick = (k) => process.env[k] ?? null;
appendFileSync(path.join(here, 'calls.jsonl'), JSON.stringify({ args, cwd: process.cwd(), env: Object.fromEntries(['LAB_CLIENT_DIR', 'LAB_DIR', 'LAB_TEST_FILES', 'LAB_SETUP', 'LAB_GRAPHQL_URL', 'NO_COLOR'].map((k) => [k, pick(k)])) }) + '\\n');
// worker : un processus de travail, comme ceux de Vitest ; les pids sont notés dans pids.json.
if (plan.worker) {
  const { spawn } = await import('node:child_process');
  const worker = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 60000)'], { stdio: 'ignore' });
  writeFileSync(path.join(here, 'pids.json'), JSON.stringify({ vitest: process.pid, worker: worker.pid }));
}
if (plan.sleepMs) await new Promise((r) => setTimeout(r, plan.sleepMs));
if (plan.noReport) { console.error('plantage simulé'); process.exit(1); }
const out = args.find((a) => a.startsWith('--outputFile=')).slice('--outputFile='.length);
const testResults = JSON.parse(process.env.LAB_TEST_FILES).map((file) => {
  const spec = plan.files?.[file] ?? { tests: {} };
  return {
    name: path.join(process.env.LAB_DIR, file),
    status: 'failed',
    message: spec.message ?? '',
    assertionResults: Object.entries(spec.tests ?? {}).map(([title, r]) => ({
      ancestorTitles: [], fullName: title, title,
      status: typeof r === 'string' ? r : 'failed',
      failureMessages: typeof r === 'string' ? [] : [r.failed]
    }))
  };
});
writeFileSync(out, JSON.stringify({ success: false, testResults }));
process.exit(1);
`;

export function installFakeVitest(clientDir, plan = { files: {} }, { engines } = {}) {
  const dir = path.join(clientDir, 'node_modules', 'vitest');
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'vitest', version: '0.0.0-faux', type: 'module', bin: { vitest: 'vitest.mjs' }, exports: { './package.json': './package.json' }, ...(engines ? { engines: { node: engines } } : {}) }));
  writeFileSync(path.join(dir, 'vitest.mjs'), SCRIPT);
  const setPlan = (next) => writeFileSync(path.join(dir, 'plan.json'), JSON.stringify(next));
  setPlan(plan);
  const calls = () => {
    try {
      return readFileSync(path.join(dir, 'calls.jsonl'), 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
    } catch {
      return [];
    }
  };
  const pids = () => {
    try {
      return JSON.parse(readFileSync(path.join(dir, 'pids.json'), 'utf8'));
    } catch {
      return null;
    }
  };
  return { setPlan, calls, pids };
}
