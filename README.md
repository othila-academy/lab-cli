# @othila-academy/lab

La commande `lab` d'othila-lab, l'outillage de salle d'Othila Academy : des checks joués en local contre le serveur de l'apprenant, un retour immédiat, et une remontée au formateur qui marche hors ligne et derrière un proxy.

Ce dépôt contient aussi ce que tout client doit respecter : le contrat d'évènements [`othila-lab/1`](contrat/evenements-v1.md) et ses exemples, et la [règle des points](points/regle.md) et ses exemples. Pour écrire un lab, voir le [guide d'écriture des labs](docs/ecrire-un-lab.md).

## Configurer un dépôt de cours

Tout ce qu'othila-lab pose dans un dépôt de cours vit dans `.othila-lab/` :

```
.othila-lab/
├── formation.json   # la formation : séances, ordre des labs, configuration de l'outil
├── .gitignore       # contient « local/ »
├── labs/<id>/       # un dossier par lab
└── local/           # état de l'apprenant : jeton, progression, évènements en attente ; jamais commité
```

```bash
npm install --save-dev --save-exact @othila-academy/lab@<version>
```

Le paquet est publié en public sur npmjs : les élèves l'installent avec le reste du cours, sans compte ni jeton.

`.othila-lab/formation.json` :

```json
{
  "id": "graphql",
  "title": "GraphQL",
  "lab": "0.9.0",
  "seances": [
    { "title": "Les bases", "labs": ["hello", "schema"] },
    { "title": "Performances", "labs": ["n1"] }
  ],
  "server": "packages/server-js/src/server.js",
  "graphql": "http://localhost:4000/graphql",
  "client": { "dir": "packages/client-react", "setup": ".othila-lab/shared/client-setup.js" },
  "endpoint": "https://lab.othila-academy.com",
  "reference": { "remote": "origin", "branch": "main" }
}
```

`id`, `title` et `seances` sont obligatoires ; `seances` peut être vide au départ (`[]`), une séance cite au moins un lab. `server` désigne le serveur GraphQL du cours : sans lui, la formation n'a pas de serveur (une formation front), `lab check` n'en attend aucun et le rejeu n'en démarre aucun. `client` désigne le client vérifié par des tests de composants (`dir`, relatif à la racine du dépôt, `"."` pour un client à la racine) et le fichier qui prépare ces tests (`setup`, facultatif). `lab` est la version minimale de `@othila-academy/lab` exigée par le cours : une commande plus ancienne s'arrête et donne la commande d'installation ; `lab update` recopie quand même les labs, puis avertit. `graphql`, `endpoint` et `reference` prennent ces valeurs par défaut ; `reference` dit d'où `lab update` tire les définitions des labs. L'ordre des séances et des labs est celui du catalogue, de la progression et de l'écran. Un lab présent dans `labs/` mais cité par aucune séance est un brouillon : `lab start`, `lab check` et `lab show` le jouent, `lab catalog` le signale (un brouillon illisible y figure avec son erreur, sans faire échouer le tableau), `--publish` ne l'envoie jamais.

La racine du dépôt est le premier dossier, en remontant, qui contient `.othila-lab/formation.json` : `npx lab` marche aussi depuis `packages/server-js/`.

### La chaîne de labs

Le cours est une suite de labs sur une seule branche, `main`. Chaque lab part de la solution du précédent, et l'apprenant construit son projet lab après lab, sur son propre code.

```
main : base ── solution/hello ── solution/schema ── solution/n1 ── (commits de définitions)
```

- `base` : tag du starter, avec l'outillage (`.othila-lab/`, la devDependency `@othila-academy/lab`).
- `solution/<lab>` : tag du commit de solution d'un lab. Le **départ** d'un lab est la solution du lab qui le précède dans l'ordre de `formation.json` ; le premier part de `base`.
- Les tags ne figent que le code. Les définitions des labs (`.othila-lab/`) de la tête de `main` font foi : une retouche de consigne, de check ou d'indice, ou une montée du paquet, ne déplace aucun tag.

L'apprenant crée sa branche une fois (`lab init`), reçoit les nouveaux labs avec `lab update`, et ne change de branche que pour rattraper son retard (`lab catchup <lab>`). L'auteur vérifie la chaîne et chaque lab avec `lab replay`. Le pas à pas : [guide d'écriture des labs](docs/ecrire-un-lab.md).

**La version de lab-cli suit main.** Chaque état de la chaîne porte son `package.json`, donc sa version de lab-cli. `lab init`, `lab catchup` et `lab update` alignent l'épinglage de la branche de l'apprenant (`package.json` et `package-lock.json`) sur celui de main, dans le commit des labs ; jamais vers une version plus ancienne, et jamais sur des fichiers modifiés non commités. Monter la version de lab-cli d'un cours se fait donc par un commit en tête de main, sans réécrire la chaîne.

Dans `package.json`, un raccourci : `"lab": "lab"`. L'apprenant lance alors `npm run lab -- check n1 observe`, ou `npx lab check n1 observe`. `lab join` vérifie que `.othila-lab/.gitignore` contient `local/` ; il ne touche pas au `.gitignore` du projet.

**Depuis l'ancien format** (`othila-lab.config.json` à la racine) : déplacer `labs/` dans `.othila-lab/labs/`, écrire `formation.json` (l'ancien champ `formation` donne `id` et `title`, les `section` des labs donnent les séances), retirer `section` des `index.mjs`, supprimer `othila-lab.config.json`, retirer `.othila-lab/` du `.gitignore` du projet, puis construire la chaîne (voir « Depuis la branche labs »). Sur chaque machine où `lab join` avait servi, l'ancien état local reste à la racine de `.othila-lab/` et n'est plus ignoré : déplacer `state.json` dans `.othila-lab/local/` pour garder la progression, supprimer `config.json`, `outbox.jsonl` et `rejected.jsonl`, puis relancer `lab join`. Tant qu'il reste, `lab start` refuse et le dit.

**Depuis la branche `labs`** (0.7 et avant : une branche `labs`, des tags `lab-<id>-start` et `lab-<id>-solution`, une branche `lab-<id>` par apprenant et par lab) : `lab start` ne crée plus de branche et ne lit plus ces tags. Archiver l'ancien état (`git tag archive/labs labs`), puis sur `main` : y amener `.othila-lab/` avec `seances: []` et la devDependency 0.8, écrire le starter, poser `base` ; réécrire ensuite chaque lab en fin de chaîne (son dossier, son inscription dans `formation.json`, sa solution, le tag `solution/<lab>`, `lab replay --lab <lab>`). Les anciens tags `lab-*` peuvent alors être supprimés.

**Passer à 0.9** : sans `server` dans `formation.json`, il n'y a plus de serveur par défaut (`packages/server-js/src/server.js`) ; un cours qui comptait sur ce défaut doit le déclarer. Pour profiter des tests de composants, déclarer `client`, et `"lab": "0.9.0"` pour que les apprenants restés en 0.8 soient prévenus dès 0.9.

**Passer à 0.10** : lab-cli exige Node 22 ou plus (le client WebSocket natif de Node sert aux checks de subscription). Un cours qui utilise `subscribe` déclare `"lab": "0.10.0"`.

**Passer à 0.11** : le tutoriel `prise-en-main` apparaît en séance 0 de tout cours ; un lab du cours ne peut plus porter cet identifiant. Monter la devDependency et `"lab": "0.11.0"` sur main, puis republier le catalogue (`lab catalog --publish`) pour que le tutoriel apparaisse sur l'écran du formateur. Les apprenants dont la branche part d'un état plus ancien passent à 0.11 au prochain `lab update` ou `lab catchup`.

**0.10.1**, sans changement pour un cours : un serveur qui répond par une erreur n'est plus dit « injoignable » (`server-error`, code 1) ; Ctrl+C arrête Vitest et ses processus de travail ; la config de test du client ne s'invite plus dans lab check ; `componentTest` refuse `?` et `#` dans `file`.

## Commandes

| Commande | Rôle | Code de sortie |
|---|---|---|
| `lab join [--terminal]` | rejoindre une session : le navigateur s'ouvre sur un formulaire (code de session, e-mail, prénom) et le terminal attend, en rappelant `npx lab join --terminal` pour un poste sans navigateur ; `--terminal`, ou les options `--session`, `--email`, `--name`, gardent la saisie au terminal | 0, 1 session inconnue, refus ou délai dépassé, 2 endpoint injoignable, 3 champs manquants |
| `lab env` | Node, registre npm, endpoint, git, proxy | 0 si les trois premiers passent, 1 sinon |
| `lab tutoriel [dossier]` | hors de tout cours : crée un dossier (`lab-tutoriel` par défaut) où jouer le tutoriel `prise-en-main` ; ensuite `npm install` puis `npx lab start prise-en-main` | 0, 1 dossier existant |
| `lab init [--branch NOM]` | une fois, au début du cours : crée ta branche (`my-project` par défaut) depuis `base`, y apporte les labs de `main` (comme `lab update`) et les affiche ; refuse un arbre modifié, un `base` introuvable ou une branche existante | 0, 1 refus, 3 usage |
| `lab start <lab>` | fiche du lab et gabarit du check apprenant s'il manque ; ne change pas de branche | 0, 1 ancien état local, 3 lab inconnu |
| `lab check <lab> [étape]` | prédiction au premier passage, puis checks | 0, 1 échec, 2 serveur injoignable |
| `lab hint <lab> <étape> [--yes]` | indice suivant, trois niveaux ; son coût en points est annoncé et confirmé (`--yes` pour ne pas demander) | 0 |
| `lab submit <lab> <étape>` | explication en deux phrases | 0, 3 texte vide |
| `lab show <lab> [étape]` | fiche du lab : contexte, objectifs, consigne de chaque étape, ce qui sera vérifié | 0, 3 lab inconnu |
| `lab progress` | ton avancement et tes points sur cette machine, séance par séance : jamais lancé, en échec, vert, soumis, indices, points | 0 |
| `lab update` | recopie `.othila-lab/` depuis la référence (`origin/main` par défaut) et le commite seul (`labs à jour (main@<sha>)`) : nouveaux labs, consignes à jour, labs retirés ; ton code, commité ou non, et `.othila-lab/local/` ne bougent pas. Hors ligne, prend la dernière référence récupérée et le dit. Annonce la commande `npm install` si le cours a changé de version du paquet | 0, 1 référence introuvable, 2 hors ligne sans référence locale |
| `lab catchup <lab>` | rattraper son retard : récupère les tags du cours (un tag déplacé par le formateur remplace l'ancien), nouvelle branche `catchup-<lab>` (suffixée `-2`, `-3`… si elle existe) depuis le départ du lab, puis `lab update` ; la branche quittée reste intacte ; `npm install` ensuite | 0, 1 refus, 3 usage ou lab inconnu |
| `lab leave [--force]` | quitte la session : envoie ce qui attend, puis efface le jeton de la machine ; `--force` abandonne ce qui ne part pas | 0, 2 évènements en attente hors ligne |
| `lab catalog [--json] [--publish]` | tableau des labs, groupé par séance, brouillons à part, dans un terminal ; JSON pour créer la session si la sortie est redirigée ou avec `--json` ; avec `--publish` et `FORMATEUR_KEY`, publie le catalogue comme formation, pour créer des sessions depuis l'écran | 0, 1 clé refusée, 2 serveur injoignable, 3 clé ou manifeste absent |
| `lab replay [--lab ID] [--keep] [--session CODE]` | formateur : vérifie la chaîne (tags présents, chacun ancêtre du suivant), puis rejoue chaque lab sur son départ et sa solution, avec les définitions et la commande d'aujourd'hui ; `--keep` garde les worktrees ; avec `--session CODE` et `FORMATEUR_KEY`, pousse le résultat dans une session simulée, vérifiée avant le rejeu | 0, 1 écart, rejet ou session réelle, 2 serveur othila-lab injoignable, 3 usage |

Options utiles : `--url` (serveur de l'apprenant), `--answer` (prédiction sans question), `--text` (explication), `--json` (sortie machine : aucune question posée, la prédiction n'est prise que via `--answer`), `--no-report`.

## Prendre la commande en main

Avant le premier lab, `npx lab start prise-en-main` : un tutoriel de quinze minutes, fourni par lab-cli et présent dans tout cours, en « Séance 0 · Prise en main ». On y répare un petit fichier, `carnet.json`, créé dans `.othila-lab/local/prise-en-main/` (jamais commité) : lancer un check, lire un échec, soumettre une explication, prédire avant de vérifier, demander un indice et voir son coût. Il ne demande aucun serveur. En salle, après `npx lab join`, le formateur voit la progression sur son écran (`lab catalog --publish` l'inclut dans le catalogue).

Hors de tout cours, avant la formation : `npx @othila-academy/lab tutoriel` crée un dossier `lab-tutoriel`, puis `cd lab-tutoriel && npm install && npx lab start prise-en-main`.

## Le parcours d'une étape

Une fois au début du cours : `git clone`, `npm install`, `npx lab join`, `npx lab init`, puis le tutoriel (`npx lab start prise-en-main`). Ensuite, pour chaque lab : `npx lab start <lab>` pour la fiche, et pour chaque étape `lab check` jusqu'au vert, puis `lab submit` : c'est la soumission qui termine l'étape. Après un check tout vert, la commande affiche la soumission à faire ; après une soumission, l'étape suivante, ou à la fin du lab le commit à faire et le catalogue.

Les labs s'enchaînent sur ton code : le lab suivant part de là où tu as fini le précédent. Quand le formateur publie de nouveaux labs, `npx lab update`. Si tu es trop loin du départ d'un lab (absence, projet bloqué), `npx lab catchup <lab>` te donne une branche sur son départ de référence ; ta branche reste là.

## Écrire un lab

Un dossier `.othila-lab/labs/<id>/` avec `index.mjs` et un module par étape, inscrit dans `formation.json`, et sa solution taguée `solution/<id>` sur `main`. `lab start` et `lab show` affichent la fiche tirée de ces champs.

```js
// .othila-lab/labs/<id>/index.mjs
export const title = 'Le problème N+1';
export const steps = ['observe', 'fix'];
export const duration = '45 min';                          // facultatif
export const summary = `Le contexte ou le scénario, en quelques lignes.`;   // facultatif
export const objectives = ['ce que l\'apprenant saura faire', '…'];       // facultatif
export const mine = { template: 'mine.template.mjs', target: 'packages/server-js/test/<id>-mine.check.mjs' };   // si l'apprenant écrit un check : gabarit dans le dossier du lab, cible relative à la racine du dépôt, un module .mjs ou .js
```

La séance d'un lab se déclare dans `formation.json`, pas dans `index.mjs` : `section` est refusée. Un check d'étape lit le chemin du check de l'apprenant dans `ctx.lab.mine.path`.

```js
// .othila-lab/labs/<id>/<étape>.mjs
import { assert, expectData } from '@othila-academy/lab';
export const title = 'Observer';
export const instructions = `La consigne, en deux à quatre lignes.`;   // facultatif
export const prediction = { promptId: 'slug', question: '…', choices: ['1', '21'], expected: '21' };   // facultatif
export const checks = [{ id: 'slug', label: 'phrase affichée', passesOnStart: false, run: async ({ url, gql, subscribe, state, lab, step, startServer, runChecks }) => { /* assert… */ } }];
export const hints = ['une question', 'une direction', 'une quasi-solution'];   // trois au plus
export const points = 200;   // facultatif, valeur de l'étape : entier de 1 à 1000, 100 par défaut
```

Une étape est acquise à la première explication soumise au vert ; chaque indice révélé avant réduit ses points de 10, 25 puis 50 % (voir [`points/regle.md`](points/regle.md)).

L'objectif à atteindre d'une étape est la liste des libellés de ses checks : la fiche les affiche sous « Ce qui sera vérifié ». Les messages d'échec nomment le geste de diagnostic, jamais la réponse. `passesOnStart: true` marque un check qui passe déjà sur l'état de départ (la solution du lab précédent).

Un lab de client vérifie le travail de l'apprenant par des tests de composants : le lab fournit ses tests Vitest, et `componentTest({ id, label, file, test })` relie un check à l'un d'eux. Le pas à pas : [guide d'écriture des labs](docs/ecrire-un-lab.md#un-lab-de-client--tests-de-composants).

Un lab de subscription vérifie qu'un abonné reçoit ce que le serveur publie : `subscribe(query, { variables, token, connectionParams })` ouvre un abonnement graphql-ws (protocole graphql-transport-ws) à l'adresse du serveur GraphQL (`http` devient `ws`), et `sub.next({ timeout })` rend le message suivant, ou `null`. lab-cli ferme les abonnements à la fin de chaque check. Le pas à pas : [guide d'écriture des labs](docs/ecrire-un-lab.md#un-lab-de-subscription).

## Variables d'environnement

`OTHILA_LAB_URL`, `OTHILA_LAB_DIR` (état local, `.othila-lab/local` par défaut), `OTHILA_LAB_ROOT` (racine du dépôt, pour les tests), `OTHILA_LAB_SERVER_SCRIPT`, `OTHILA_LAB_REGISTRY_URL`, `GRAPHQL_URL`, et les classiques `HTTP_PROXY`, `HTTPS_PROXY`, `NO_PROXY`.

## Contrat et règle des points

- [`contrat/evenements-v1.md`](contrat/evenements-v1.md) : le contrat `othila-lab/1`, normatif, que la commande produit et que le serveur othila-lab valide ; [`contrat/exemples/`](contrat/exemples/) en donne un exemple valide par type d'évènement.
- [`points/regle.md`](points/regle.md) : la règle des points ; [`points/exemples.json`](points/exemples.json), ses cas de référence.

Ces fichiers sont publiés dans le paquet et exposés par son champ `exports` (`@othila-academy/lab/contrat/*`, `@othila-academy/lab/points/*`) : les tests de ce paquet et ceux du serveur othila-lab rejouent les mêmes exemples, à la version déclarée. Une évolution du contrat se fait ici d'abord, dans une version du paquet ; le serveur suit en montant sa dépendance.

## Livrer une version

Le paquet est publié **en public sur npmjs** (`@othila-academy/lab`), depuis la CI de ce dépôt, par **publication de confiance** : aucun jeton npm n'existe, ni sur un poste ni dans les secrets du dépôt. Chaque version porte une **attestation de provenance** et ne part qu'après une **validation manuelle**.

Toujours monter la version, même pour une retouche : une version publiée sur npmjs ne se remplace pas, et ne se retire plus après 72 heures.

**1. Publier**, sur `main` à jour :

```bash
npm version 0.7.2 --no-git-tag-version
npm test
git commit -am "0.7.2"
git push                      # puis attendre la CI verte de main
git tag v0.7.2
git push origin v0.7.2
```

Seul un administrateur du dépôt peut poser un tag `v*`. Le workflow `Publier @othila-academy/lab` rejoue d'abord les tests sur Node 22 et Node 24 ; la publication n'est demandée qu'ensuite, dans l'environnement GitHub `npm`, réservé à ces tags et soumis à validation manuelle. Elle vérifie que le tag correspond à la version de `package.json` et que le commit tagué est sur `main`, installe sans exécuter aucun script, vérifie que le paquet ne contient que `bin/`, `src/` (sans tests ni fixtures), `contrat/`, `points/`, `README.md`, `LICENSE` et `package.json`, puis publie avec `--provenance`. Si la version est déjà sur npmjs, il le signale et s'arrête sans erreur : on peut le relancer après une panne.

**2. Vérifier**, dans n'importe quel projet qui l'installe : `npm audit signatures` contrôle la signature du registre et l'attestation de provenance.

**3. La faire entrer dans un cours**, sur `main` :

```bash
npm install --save-dev --save-exact @othila-academy/lab@0.8.0
npx lab replay
git add package.json package-lock.json
git commit -m "chore: @othila-academy/lab 0.8.0"
```

Une version exacte : le lockfile garde son empreinte d'intégrité. Aucun tag ne bouge : le rejeu joue chaque état avec la commande installée sur `main`. Les apprenants voient la nouvelle version annoncée par `npx lab update`, avec la commande `npm install` à lancer.

**Historique** : jusqu'à la 0.6.1, le paquet était publié sur un registre privé et les cours l'embarquaient en archive dans `.othila-lab/vendor/` ; les 0.6.2 et 0.6.3 ont été publiées sur npmjs sans provenance. Un cours qui embarque encore une archive continue de fonctionner jusqu'à sa migration vers la dépendance npm.

**Réglages de sécurité** :

- npmjs, paquet `@othila-academy/lab` : éditeur de confiance `othila-academy/lab-cli`, workflow `publish.yml`, environnement `npm` ; publication par jeton interdite ; double authentification exigée dans l'organisation ;
- GitHub : environnement `npm` limité aux tags `v*`, avec validation manuelle, administrateurs compris ; tags `v*` réservés aux administrateurs ; `main` protégée (CI requise, pas de push forcé, pas de suppression), les administrateurs pouvant passer outre ; workflows en lecture seule par défaut ; seules les actions de GitHub sont autorisées, épinglées par empreinte (exigé par le dépôt) et suivies par Dependabot.

Signaler une faille : voir [`SECURITY.md`](SECURITY.md).
