import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

// Un faux Vitest installé dans le node_modules d'un client de test. Il note chaque lancement (arguments, dossier,
// variables utiles) dans calls.jsonl et écrit le rapport que décrit plan.json :
// { sleepMs?, noReport?, files: { "<fichier relatif au lab>": { message?, tests: { "<titre>": "passed" | "skipped" | { failed: "<message>" } } } } }
const SCRIPT = `import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const plan = JSON.parse(readFileSync(path.join(here, 'plan.json'), 'utf8'));
const args = process.argv.slice(2);
const pick = (k) => process.env[k] ?? null;
appendFileSync(path.join(here, 'calls.jsonl'), JSON.stringify({ args, cwd: process.cwd(), env: Object.fromEntries(['LAB_CLIENT_DIR', 'LAB_DIR', 'LAB_TEST_FILES', 'LAB_SETUP', 'LAB_GRAPHQL_URL', 'NO_COLOR'].map((k) => [k, pick(k)])) }) + '\\n');
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

export function installFakeVitest(clientDir, plan = { files: {} }) {
  const dir = path.join(clientDir, 'node_modules', 'vitest');
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'vitest', version: '0.0.0-faux', type: 'module', bin: { vitest: 'vitest.mjs' }, exports: { './package.json': './package.json' } }));
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
  return { setPlan, calls };
}
