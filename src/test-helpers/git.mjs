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

// Pour les commits que fait la commande elle-même : une identité et pas de signature, comme sur une CI sans configuration.
export function isolateGitEnv() {
  const saved = { ...process.env };
  Object.assign(process.env, {
    GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t',
    GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: 'commit.gpgsign', GIT_CONFIG_VALUE_0: 'false'
  });
  return () => {
    for (const key of Object.keys(process.env)) if (!(key in saved)) delete process.env[key];
    Object.assign(process.env, saved);
  };
}

// Un cours publié : le dépôt de l'auteur (main, tag base), son remote nu, et le clone d'un apprenant sur my-project.
// Les trois vivent sous le dossier du cours de l'auteur, supprimé avec lui.
export function publishCourse(course, { learnerBranch = 'my-project' } = {}) {
  const author = gitIn(course.root);
  author('init', '-q', '-b', 'main');
  commitAll(course.root, 'starter');
  author('tag', 'base');
  const remote = `${course.root}.remote.git`;
  const learnerDir = `${course.root}.learner`;
  execFileSync('git', ['clone', '-q', '--bare', course.root, remote], { stdio: 'pipe' });
  author('remote', 'add', 'origin', remote);
  author('fetch', '-q', 'origin');
  execFileSync('git', ['clone', '-q', remote, learnerDir], { stdio: 'pipe' });
  const learner = gitIn(learnerDir);
  learner('checkout', '-q', '-b', learnerBranch, 'base');
  // L'auteur publie : commit sur main et push, tags compris.
  const publish = (message) => {
    commitAll(course.root, message);
    author('push', '-q', '--tags', 'origin', 'main');
  };
  return { author, learner, learnerDir, remote, publish };
}
