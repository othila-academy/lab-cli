import { createInterface } from 'node:readline';
import { parseArgs } from './args.mjs';

export const USAGE = `othila-lab · commande lab

  lab join [--terminal] [--session CODE] [--email E] [--name PRÉNOM] [--endpoint URL]   rejoindre une session (navigateur par défaut)
  lab env                                                                   vérifier l'environnement
  lab init [--branch NOM]                                                   créer ta branche de projet depuis le départ du cours
  lab start <lab>                                                           afficher la fiche d'un lab et préparer son gabarit
  lab show <lab> [étape]                                                    afficher la fiche : contexte, objectifs, consignes
  lab check <lab> [étape] [--url URL] [--answer RÉPONSE] [--json] [--no-report]
  lab hint <lab> <étape> [--yes]                                            révéler l'indice suivant (son coût est annoncé)
  lab submit <lab> <étape> [--text EXPLICATION]                             soumettre une explication
  lab progress                                                              ton avancement et tes points, séance par séance
  lab update                                                                récupérer les nouveaux labs et les consignes à jour
  lab catchup <lab>                                                         repartir du départ d'un lab sur une nouvelle branche
  lab leave [--force]                                                       quitter la session et effacer le jeton de la machine
  lab catalog [--json] [--publish] [--endpoint URL]                         lister les labs ; --publish les publie comme formation (formateur)
  lab replay [--lab ID] [--keep] [--session CODE] [--endpoint URL]          rejouer les labs sur la chaîne base → solution/<lab> (formateur)

Codes de sortie : 0 tout passé · 1 un check en échec · 2 serveur injoignable · 3 erreur d'usage`;

// Les commandes sont importées à la demande : lab --help ne charge rien d'autre.
const COMMANDS = {
  join: () => import('./commands/join.mjs'),
  env: () => import('./commands/env.mjs'),
  init: () => import('./commands/init.mjs'),
  start: () => import('./commands/start.mjs'),
  check: () => import('./commands/check.mjs'),
  hint: () => import('./commands/hint.mjs'),
  submit: () => import('./commands/submit.mjs'),
  catalog: () => import('./commands/catalog.mjs'),
  show: () => import('./commands/show.mjs'),
  progress: () => import('./commands/progress.mjs'),
  leave: () => import('./commands/leave.mjs'),
  update: () => import('./commands/update.mjs'),
  catchup: () => import('./commands/catchup.mjs'),
  replay: () => import('./commands/replay.mjs')
};

// Entrées/sorties injectables : les tests capturent `out` et répondent aux questions.
export function terminalIo() {
  return {
    out: (line) => console.log(line),
    err: (line) => console.error(line),
    isTTY: Boolean(process.stdout.isTTY),
    question: (prompt) =>
      new Promise((resolve) => {
        const rl = createInterface({ input: process.stdin, output: process.stdout });
        rl.question(`${prompt} `, (answer) => {
          rl.close();
          resolve(answer.trim());
        });
      })
  };
}

export async function main(argv, io = terminalIo()) {
  const { command, positionals, flags } = parseArgs(argv);
  if (!command || flags.help) {
    io.out(USAGE);
    return command || flags.help ? 0 : 3;
  }
  const load = COMMANDS[command];
  if (!load) {
    io.err(`commande inconnue : ${command}`);
    io.err(USAGE);
    return 3;
  }
  try {
    const { run } = await load();
    return await run({ positionals, flags, io });
  } catch (error) {
    io.err(error?.message ?? String(error));
    return 3;
  }
}
