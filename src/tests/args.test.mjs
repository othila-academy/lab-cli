import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseArgs } from '../args.mjs';

test('sépare la commande, les positionnels et les options', () => {
  assert.deepEqual(parseArgs(['check', 'n1', 'observe', '--url', 'http://x', '--json']), {
    command: 'check', positionals: ['n1', 'observe'], flags: { url: 'http://x', json: true }
  });
});

test('une option sans valeur vaut true, une valeur vide reste vide', () => {
  assert.deepEqual(parseArgs(['submit', 'n1', 'fix', '--text', '', '--no-report']).flags, { text: '', 'no-report': true });
  assert.deepEqual(parseArgs(['hint', '--help']).flags, { help: true });
});

test('sans argument, pas de commande', () => {
  assert.equal(parseArgs([]).command, undefined);
});
