import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planPin } from '../pin.mjs';

// L'alignement de l'épinglage, calculé sans git : tout ou rien, jamais vers le bas, mise en forme conservée.
const P = '@othila-academy/lab';
const entry = (v) => ({ version: v, resolved: `https://registry.npmjs.org/@othila-academy/lab/-/lab-${v}.tgz`, integrity: `sha512-${v}`, dev: true, license: 'MIT', bin: { lab: 'bin/lab.mjs' }, engines: { node: '>=22' } });
const pkg = (v, field = 'devDependencies') => ({ name: 'cours', private: true, [field]: { prettier: '3.0.0', [P]: v }, engines: { node: '>=22.22.0' } });
const lock = (v, field = 'devDependencies') => ({
  name: 'cours',
  lockfileVersion: 3,
  requires: true,
  packages: { '': { name: 'cours', [field]: { prettier: '3.0.0', [P]: v } }, [`node_modules/${P}`]: entry(v), 'node_modules/prettier': { version: '3.0.0' } }
});
const text = (value, indent = 2) => `${JSON.stringify(value, null, indent)}\n`;
const input = (ref, branch, opts = {}) => ({
  refPackage: text(pkg(ref, opts.field)),
  refLock: text(lock(ref, opts.field)),
  branchPackage: text(pkg(branch, opts.field), opts.indent),
  branchLock: text(lock(branch, opts.field), opts.indent)
});

test('aligne package.json et le lock sur la référence, entrée de lock recopiée', () => {
  const plan = planPin(input('0.11.0', '0.10.1'));
  assert.deepEqual([plan.from, plan.version], ['0.10.1', '0.11.0']);
  assert.equal(plan.files['package.json'], text(pkg('0.11.0')));
  assert.equal(plan.files['package-lock.json'], text(lock('0.11.0')));
});

test('même version : rien', () => assert.equal(planPin(input('0.11.0', '0.11.0')), null));

test('jamais de descente', () => assert.equal(planPin(input('0.10.1', '0.11.0')), null));

test('référence sans version exacte : rien', () => {
  const i = input('0.11.0', '0.10.1');
  i.refPackage = text(pkg('^0.11.0'));
  assert.equal(planPin(i), null);
});

test('lock de la référence sans entrée : rien', () => {
  const i = input('0.11.0', '0.10.1');
  const l = lock('0.11.0');
  delete l.packages[`node_modules/${P}`];
  i.refLock = text(l);
  assert.equal(planPin(i), null);
});

test('lock de la branche sans entrée (espace de travail, lock ancien) : rien', () => {
  const i = input('0.11.0', '0.10.1');
  const l = lock('0.10.1');
  delete l.packages[`node_modules/${P}`];
  i.branchLock = text(l);
  assert.equal(planPin(i), null);
});

test('branche qui ne déclare pas lab-cli : rien', () => {
  const i = input('0.11.0', '0.10.1');
  i.branchPackage = text({ name: 'cours' });
  assert.equal(planPin(i), null);
});

test('dependencies plutôt que devDependencies : aligné là où il est déclaré', () => {
  const plan = planPin(input('0.11.0', '0.10.1', { field: 'dependencies' }));
  assert.equal(JSON.parse(plan.files['package.json']).dependencies[P], '0.11.0');
  assert.equal(JSON.parse(plan.files['package-lock.json']).packages[''].dependencies[P], '0.11.0');
});

test('mise en forme conservée : indentation de quatre espaces, ordre des clés', () => {
  const plan = planPin(input('0.11.0', '0.10.1', { indent: 4 }));
  assert.equal(plan.files['package.json'], text(pkg('0.11.0'), 4));
  assert.deepEqual(Object.keys(JSON.parse(plan.files['package.json'])), ['name', 'private', 'devDependencies', 'engines']);
});

test('JSON illisible d’un côté ou de l’autre : rien', () => {
  const i = input('0.11.0', '0.10.1');
  i.branchLock = '{';
  assert.equal(planPin(i), null);
  const j = input('0.11.0', '0.10.1');
  j.refPackage = null;
  assert.equal(planPin(j), null);
});

test('fins de ligne CRLF conservées', () => {
  const i = input('0.11.0', '0.10.1');
  i.branchPackage = i.branchPackage.replace(/\n/g, '\r\n');
  i.branchLock = i.branchLock.replace(/\n/g, '\r\n');
  const plan = planPin(i);
  for (const file of ['package.json', 'package-lock.json']) {
    assert.ok(plan.files[file].includes('\r\n'), file);
    assert.ok(!/[^\r]\n/.test(plan.files[file]), `${file} : aucun LF seul`);
    assert.ok(plan.files[file].endsWith('\r\n'));
  }
});

test('lock v2 : la section dependencies héritée suit aussi', () => {
  const i = input('0.11.0', '0.10.1');
  const l = lock('0.10.1');
  l.lockfileVersion = 2;
  l.dependencies = { [P]: { version: '0.10.1', resolved: entry('0.10.1').resolved, integrity: 'sha512-0.10.1', dev: true } };
  i.branchLock = text(l);
  const out = JSON.parse(planPin(i).files['package-lock.json']);
  assert.deepEqual(out.dependencies[P], { version: '0.11.0', resolved: entry('0.11.0').resolved, integrity: 'sha512-0.11.0', dev: true });
});

test('l’entrée recopiée garde le marqueur dev de la branche', () => {
  const i = input('0.11.0', '0.10.1', { field: 'dependencies' });
  const l = lock('0.10.1', 'dependencies');
  delete l.packages[`node_modules/${P}`].dev;
  i.branchLock = text(l);
  const out = JSON.parse(planPin(i).files['package-lock.json']);
  assert.equal('dev' in out.packages[`node_modules/${P}`], false);
  assert.equal(out.packages[`node_modules/${P}`].version, '0.11.0');
});
