// Lance un serveur GraphQL en processus fils sur un port libre, attend qu'il réponde, l'arrête.
// Sert aux étapes qui ont besoin d'un second serveur (tester le test) et au rejeu.
import { spawn } from 'node:child_process';
import net from 'node:net';
import { NO_SERVER, projectRoot, serverScript } from './config.mjs';
import { waitForServer } from './graphql.mjs';

export function freePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

export async function startServer({ script = serverScript(), env = {}, cwd = projectRoot(), timeoutMs = 15000 } = {}) {
  if (!script) throw new Error(NO_SERVER);
  const port = await freePort();
  const child = spawn(process.execPath, [script], {
    cwd,
    env: { ...process.env, GRAPHQL_TRACE: '0', ...env, PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let output = '';
  child.stdout.on('data', (chunk) => (output += chunk));
  child.stderr.on('data', (chunk) => (output += chunk));
  const url = `http://127.0.0.1:${port}/graphql`;

  const stop = () =>
    new Promise((resolve) => {
      if (child.exitCode !== null || child.signalCode !== null) return resolve();
      child.once('exit', () => resolve());
      child.kill('SIGTERM');
      setTimeout(() => child.kill('SIGKILL'), 3000).unref();
    });

  try {
    await waitForServer(url, timeoutMs);
  } catch (error) {
    await stop();
    throw new Error(`${error.message}\n${output.trim().slice(-500)}`);
  }
  return { url, port, output: () => output, stop };
}
