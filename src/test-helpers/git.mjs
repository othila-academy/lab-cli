import { execFileSync } from 'node:child_process';

// git dans un dossier de test, avec une identité et sans signature : la configuration de la machine n'entre pas en jeu.
export const gitIn = (cwd) => (...args) =>
  execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false', '-c', 'tag.gpgsign=false', ...args], { cwd, stdio: 'pipe' })
    .toString()
    .trim();

// Tout l'arbre dans un commit.
export function commitAll(cwd, message) {
  const git = gitIn(cwd);
  git('add', '-A');
  git('commit', '-q', '--allow-empty', '-m', message);
}
