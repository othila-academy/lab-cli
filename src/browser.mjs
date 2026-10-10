import { spawn } from 'node:child_process';

// La commande qui ouvre une adresse dans le navigateur par défaut, selon le système.
// Sous Windows, start prend un titre de fenêtre en premier argument : la chaîne vide.
export function browserCommand(url, platform = process.platform) {
  if (platform === 'darwin') return ['open', [url]];
  if (platform === 'win32') return ['cmd', ['/c', 'start', '', url]];
  return ['xdg-open', [url]];
}

// true si la commande a pu être lancée. Sans navigateur (SSH, poste verrouillé), false : l'appelant affiche l'adresse.
export function openBrowser(url) {
  const [command, args] = browserCommand(url);
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(command, args, { stdio: 'ignore', detached: true, windowsHide: true });
    } catch {
      resolve(false);
      return;
    }
    child.once('error', () => resolve(false));
    child.once('spawn', () => {
      child.unref();
      resolve(true);
    });
  });
}
