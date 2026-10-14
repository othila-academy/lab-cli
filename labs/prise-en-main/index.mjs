export const title = 'Prendre en main la commande lab';
export const steps = ['machine', 'reparer', 'predire', 'indice'];
export const duration = '15 min';
export const summary = `Avant les labs de la formation, tu prends en main la commande lab sur un petit fichier, ton carnet.
En salle, tu as rejoint la session avec npx lab join (le formateur donne le code) : il suit ta progression sur son écran, et npx lab env vérifie aussi l'accès au serveur othila-lab.
Seul, sans session, rien n'est envoyé : tout se passe sur ta machine.
En fin de session, npx lab leave envoie ce qui attend encore et efface le jeton de la machine.`;
export const objectives = [
  'lancer un check et lire son résultat',
  "corriger d'après un message d'échec, puis soumettre une explication",
  'prédire avant de vérifier',
  'demander un indice et connaître son coût en points'
];
// Les fichiers de travail copiés par lab start dans le bac à sable : <localDir>/prise-en-main/.
export const sandbox = ['carnet.json'];
