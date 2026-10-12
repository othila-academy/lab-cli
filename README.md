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
  "seances": [
    { "title": "Séance 2 · Schéma avancé", "labs": ["interface-node"] },
    { "title": "Séance 4 · Performances", "labs": ["n1"] }
  ],
  "server": "packages/server-js/src/server.js",
  "graphql": "http://localhost:4000/graphql",
  "endpoint": "https://lab.othila-academy.com"
}
```

`id`, `title` et `seances` sont obligatoires ; `server`, `graphql` et `endpoint` prennent ces valeurs par défaut. L'ordre des séances et des labs est celui du catalogue, de la progression et de l'écran. Un lab présent dans `labs/` mais cité par aucune séance est un brouillon : `lab start`, `lab check` et `lab show` le jouent, `lab catalog` le signale (un brouillon illisible y figure avec son erreur, sans faire échouer le tableau), `--publish` ne l'envoie jamais.

La racine du dépôt est le premier dossier, en remontant, qui contient `.othila-lab/formation.json` : `npx lab` marche aussi depuis `packages/server-js/`.

Dans `package.json`, un raccourci : `"lab": "lab"`. L'apprenant lance alors `npm run lab -- check n1 observe`, ou `npx lab check n1 observe`. `lab join` vérifie que `.othila-lab/.gitignore` contient `local/` ; il ne touche pas au `.gitignore` du projet.

**Depuis l'ancien format** (`othila-lab.config.json` à la racine) : déplacer `labs/` dans `.othila-lab/labs/`, écrire `formation.json` (l'ancien champ `formation` donne `id` et `title`, les `section` des labs donnent les séances), retirer `section` des `index.mjs`, supprimer `othila-lab.config.json`, retirer `.othila-lab/` du `.gitignore` du projet, puis reposer les tags des labs. Sur chaque machine où `lab join` avait servi, l'ancien état local reste à la racine de `.othila-lab/` et n'est plus ignoré : déplacer `state.json` dans `.othila-lab/local/` pour garder la progression, supprimer `config.json`, `outbox.jsonl` et `rejected.jsonl`, puis relancer `lab join`. Tant qu'il reste, `lab start` refuse et le dit.

## Commandes

| Commande | Rôle | Code de sortie |
|---|---|---|
| `lab join [--terminal]` | rejoindre une session : le navigateur s'ouvre sur un formulaire (code de session, e-mail, prénom) et le terminal attend, en rappelant `npx lab join --terminal` pour un poste sans navigateur ; `--terminal`, ou les options `--session`, `--email`, `--name`, gardent la saisie au terminal | 0, 1 session inconnue, refus ou délai dépassé, 2 endpoint injoignable, 3 champs manquants |
| `lab env` | Node, registre npm, endpoint, git, proxy | 0 si les trois premiers passent, 1 sinon |
| `lab start <lab>` | branche `lab-<id>` depuis le tag `lab-<id>-start`, gabarit du check apprenant | 0, 1 refus |
| `lab check <lab> [étape]` | prédiction au premier passage, puis checks | 0, 1 échec, 2 serveur injoignable |
| `lab hint <lab> <étape> [--yes]` | indice suivant, trois niveaux ; son coût en points est annoncé et confirmé (`--yes` pour ne pas demander) | 0 |
| `lab submit <lab> <étape>` | explication en deux phrases | 0, 3 texte vide |
| `lab show <lab> [étape]` | fiche du lab : contexte, objectifs, consigne de chaque étape, ce qui sera vérifié | 0, 3 lab inconnu |
| `lab progress` | ton avancement et tes points sur cette machine, séance par séance : jamais lancé, en échec, vert, soumis, indices, points | 0 |
| `lab leave [--force]` | quitte la session : envoie ce qui attend, puis efface le jeton de la machine ; `--force` abandonne ce qui ne part pas | 0, 2 évènements en attente hors ligne |
| `lab catalog [--json] [--publish]` | tableau des labs, groupé par séance, brouillons à part, dans un terminal ; JSON pour créer la session si la sortie est redirigée ou avec `--json` ; avec `--publish` et `FORMATEUR_KEY`, publie le catalogue comme formation, pour créer des sessions depuis l'écran | 0, 1 clé refusée, 2 serveur injoignable, 3 clé ou manifeste absent |
| `lab replay [--lab ID] [--session CODE]` | formateur : rejoue un lab sur ses tags start et solution ; avec `--session CODE` et `FORMATEUR_KEY`, pousse le résultat dans une session simulée, vérifiée avant le rejeu | 0, 1 écart, rejet ou session réelle, 2 serveur othila-lab injoignable, 3 usage |

Options utiles : `--url` (serveur de l'apprenant), `--answer` (prédiction sans question), `--text` (explication), `--json` (sortie machine : aucune question posée, la prédiction n'est prise que via `--answer`), `--no-report`.

## Le parcours d'une étape

`lab check` jusqu'au vert, puis `lab submit` : c'est la soumission qui termine l'étape. Après un check tout vert, la commande affiche la soumission à faire ; après une soumission, l'étape suivante, ou à la fin du lab le commit à faire et le catalogue. Les labs ne s'enchaînent pas : chacun repart de son tag de départ, donc on commite son travail avant `lab start` d'un autre lab, et on relance son serveur.

## Écrire un lab

Un dossier `.othila-lab/labs/<id>/` avec `index.mjs` et un module par étape. `lab start` et `lab show` affichent la fiche tirée de ces champs.

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
export const checks = [{ id: 'slug', label: 'phrase affichée', passesOnStart: false, run: async ({ url, gql, state, lab, step, startServer, runChecks }) => { /* assert… */ } }];
export const hints = ['une question', 'une direction', 'une quasi-solution'];   // trois au plus
export const points = 200;   // facultatif, valeur de l'étape : entier de 1 à 1000, 100 par défaut
```

Une étape est acquise à la première explication soumise au vert ; chaque indice révélé avant réduit ses points de 10, 25 puis 50 % (voir [`points/regle.md`](points/regle.md)).

L'objectif à atteindre d'une étape est la liste des libellés de ses checks : la fiche les affiche sous « Ce qui sera vérifié ». Les messages d'échec nomment le geste de diagnostic, jamais la réponse. `passesOnStart: true` marque un check qui passe déjà sur l'état de départ.

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

Seul un administrateur du dépôt peut poser un tag `v*`. Le workflow `Publier @othila-academy/lab` rejoue d'abord les tests sur Node 20 et Node 24 ; la publication n'est demandée qu'ensuite, dans l'environnement GitHub `npm`, réservé à ces tags et soumis à validation manuelle. Elle vérifie que le tag correspond à la version de `package.json` et que le commit tagué est sur `main`, installe sans exécuter aucun script, vérifie que le paquet ne contient que `bin/`, `src/` (sans tests ni fixtures), `contrat/`, `points/`, `README.md`, `LICENSE` et `package.json`, puis publie avec `--provenance`. Si la version est déjà sur npmjs, il le signale et s'arrête sans erreur : on peut le relancer après une panne.

**2. Vérifier**, dans n'importe quel projet qui l'installe : `npm audit signatures` contrôle la signature du registre et l'attestation de provenance.

**3. La faire entrer dans un cours**, sur la branche `labs` :

```bash
npm install --save-dev --save-exact @othila-academy/lab@0.7.1
git add package.json package-lock.json
git commit -m "chore: @othila-academy/lab 0.7.1"
```

Une version exacte : le lockfile garde son empreinte d'intégrité, et chaque tag de lab fige la version de l'outil avec laquelle il se joue. Puis reposer les tags `lab-<id>-start` et `lab-<id>-solution`, et lancer `npx lab replay` : voir [Mettre à jour un lab](docs/ecrire-un-lab.md#mettre-à-jour-un-lab).

**Historique** : jusqu'à la 0.6.1, le paquet était publié sur un registre privé et les cours l'embarquaient en archive dans `.othila-lab/vendor/` ; les 0.6.2 et 0.6.3 ont été publiées sur npmjs sans provenance. Un cours qui embarque encore une archive continue de fonctionner jusqu'à sa migration vers la dépendance npm.

**Réglages de sécurité** :

- npmjs, paquet `@othila-academy/lab` : éditeur de confiance `othila-academy/lab-cli`, workflow `publish.yml`, environnement `npm` ; publication par jeton interdite ; double authentification exigée dans l'organisation ;
- GitHub : environnement `npm` limité aux tags `v*`, avec validation manuelle, administrateurs compris ; tags `v*` réservés aux administrateurs ; `main` protégée (CI requise, pas de push forcé, pas de suppression), les administrateurs pouvant passer outre ; workflows en lecture seule par défaut ; seules les actions de GitHub sont autorisées, épinglées par empreinte (exigé par le dépôt) et suivies par Dependabot.

Signaler une faille : voir [`SECURITY.md`](SECURITY.md).
