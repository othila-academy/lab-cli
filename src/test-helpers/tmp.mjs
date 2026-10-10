import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

// Un dossier d'état local temporaire, pointé par OTHILA_LAB_DIR le temps d'un test.
export function tempLabDir() {
  const dir = mkdtempSync(path.join(tmpdir(), 'othila-lab-'));
  const previous = process.env.OTHILA_LAB_DIR;
  process.env.OTHILA_LAB_DIR = dir;
  return {
    dir,
    cleanup() {
      if (previous === undefined) delete process.env.OTHILA_LAB_DIR;
      else process.env.OTHILA_LAB_DIR = previous;
      rmSync(dir, { recursive: true, force: true });
    }
  };
}

export function writeTestSession(dir, endpoint, extra = {}) {
  const session = { endpoint, session: 'GQL-TEST', learnerId: '00000000-0000-4000-8000-000000000001', token: 'jeton-de-test', firstName: 'Test', ...extra };
  writeFileSync(path.join(dir, 'session.json'), JSON.stringify(session));
  return session;
}
