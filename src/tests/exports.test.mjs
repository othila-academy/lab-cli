import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// othila-lab résout le contrat et les exemples par le nom du paquet : ces chemins doivent rester exposés.
test('le paquet expose son contrat, ses exemples et son package.json', () => {
  for (const spec of [
    '@othila-academy/lab/package.json',
    '@othila-academy/lab/contrat/evenements-v1.md',
    '@othila-academy/lab/contrat/exemples/session.joined.json',
    '@othila-academy/lab/points/exemples.json'
  ]) {
    assert.ok(existsSync(fileURLToPath(import.meta.resolve(spec))), spec);
  }
});
