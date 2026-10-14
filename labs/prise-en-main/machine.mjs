import { execFileSync } from 'node:child_process';
import { assert } from '../../src/index.mjs';
import { MIN_NODE_MAJOR } from '../../src/env.mjs';

export const title = 'Ta machine est prête';
export const points = 10;
export const instructions = `Lance npx lab check prise-en-main machine : il vérifie que Node, npm et git répondent sur ta machine.
Tout est vert ? Une étape se termine par une explication : npx lab submit prise-en-main machine, en deux phrases, à la question « Que vérifie un check, et que ferais-tu si une ligne était rouge ? »`;

// npm est un script .cmd sous Windows : il faut un shell pour le lancer.
const answers = (command) => {
  try {
    execFileSync(command, ['--version'], { stdio: ['ignore', 'pipe', 'ignore'], shell: process.platform === 'win32' });
    return true;
  } catch {
    return false;
  }
};

export const checks = [
  {
    id: 'node',
    label: `Node ${MIN_NODE_MAJOR} ou plus`,
    passesOnStart: true,
    run: async () => {
      const major = Number(process.versions.node.split('.')[0]);
      assert(major >= MIN_NODE_MAJOR, `Node ${process.versions.node} : il faut Node ${MIN_NODE_MAJOR} ou plus ; installe la version LTS depuis nodejs.org, puis rouvre ton terminal`);
    }
  },
  {
    id: 'npm',
    label: 'npm répond',
    passesOnStart: true,
    run: async () => assert(answers('npm'), "npm ne répond pas : il s'installe avec Node ; vérifie npm --version dans ton terminal")
  },
  {
    id: 'git',
    label: 'git répond',
    passesOnStart: true,
    run: async () => assert(answers('git'), 'git ne répond pas : installe-le depuis git-scm.com, puis vérifie git --version')
  }
];
