// Vérification d'environnement avant la session : ce qui bloque (Node, registre npm, endpoint)
// et ce qui éclaire (git, proxy). Les ids des trois premiers sont imposés par le contrat.
import { execFileSync } from 'node:child_process';
import { getJson, proxyFor } from './http.mjs';

export const MIN_NODE_MAJOR = 20;
export const RECOMMENDED_NODE_MAJOR = 24;
export const REQUIRED_CHECKS = ['node-version', 'npm-registry', 'endpoint'];
const DEFAULT_REGISTRY = 'https://registry.npmjs.org/-/ping';

const clip = (text) => String(text).slice(0, 200);

async function probe(url, timeoutMs) {
  const started = Date.now();
  try {
    const { status, json } = await getJson(url, { timeoutMs });
    return { status, json, ms: Date.now() - started, error: null };
  } catch (error) {
    return { status: null, json: null, ms: Date.now() - started, error: error.message };
  }
}

export async function runEnvChecks({ endpoint, registryUrl = process.env.OTHILA_LAB_REGISTRY_URL ?? DEFAULT_REGISTRY, timeoutMs = 5000, version = process.version } = {}) {
  const major = Number(version.replace(/^v/, '').split('.')[0]);
  const checks = [];

  checks.push({
    id: 'node-version',
    ok: major >= MIN_NODE_MAJOR,
    detail: clip(major >= RECOMMENDED_NODE_MAJOR ? version : `${version} (${RECOMMENDED_NODE_MAJOR} recommandé, ${MIN_NODE_MAJOR} minimum)`)
  });

  const registry = await probe(registryUrl, timeoutMs);
  checks.push({ id: 'npm-registry', ok: registry.status !== null && registry.status < 500, detail: clip(registry.error ?? `${registry.status} en ${registry.ms} ms`) });

  const health = await probe(`${endpoint}/api/health`, timeoutMs);
  checks.push({ id: 'endpoint', ok: health.status === 200 && health.json?.ok === true, detail: clip(health.error ?? `${health.status} en ${health.ms} ms`) });

  let gitVersion = null;
  try {
    gitVersion = execFileSync('git', ['--version'], { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    gitVersion = null;
  }
  checks.push({ id: 'git', ok: gitVersion !== null, detail: clip(gitVersion ?? 'git introuvable') });

  const proxy = proxyFor(new URL(endpoint));
  checks.push({ id: 'proxy', ok: true, detail: clip(proxy ? `proxy détecté : ${proxy.href}` : 'aucun proxy') });

  return checks;
}

export const formatEnvChecks = (checks) => checks.map((c) => `  ${c.ok ? '✓' : '✗'} ${c.id.padEnd(13)} ${c.detail}`);
