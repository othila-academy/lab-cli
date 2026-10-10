# Écrire un lab

Ce guide s'adresse à l'auteur d'un cours qui utilise la commande `lab` (paquet `@othila-academy/lab`) : concevoir un lab, l'écrire, fixer ses états de référence, le rejouer, le publier, puis le mettre à jour. Ouvrir et suivre une session se fait sur le serveur othila-lab, hors de ce guide. L'exemple qui court tout du long est `interface-node`, un lab du cours GraphQL d'Othila Academy.

- [Vocabulaire](#vocabulaire)
- [Construire un lab, pas à pas](#construire-un-lab-pas-à-pas)
- [Écrire de bons checks](#écrire-de-bons-checks)
- [Mettre à jour un lab](#mettre-à-jour-un-lab)
- [Dépannage](#dépannage)

## Vocabulaire

| Terme | Sens |
|---|---|
| **lab** | un exercice : un dossier `.othila-lab/labs/<id>/` du dépôt du cours, cité par une séance de `.othila-lab/formation.json`, une ou plusieurs étapes |
| **séance** | un groupe ordonné de labs dans `formation.json` ; l'écran, `lab catalog` et `lab progress` suivent cet ordre |
| **brouillon** | un lab présent dans `.othila-lab/labs/` que le manifeste ne cite pas : jouable, jamais publié |
| **étape** | une unité de travail, avec sa consigne, ses checks, ses indices et éventuellement une prédiction |
| **check** | une vérification d'un comportement observable du serveur de l'apprenant, jouée en local |
| **prédiction** | une question posée avant le premier check de l'étape, comparée ensuite à l'observation |
| **indice** | trois niveaux au plus : une question, une direction, une quasi-solution |
| **soumission** | l'explication en deux phrases qui termine l'étape ; le formateur la lit sur son écran |
| **état de départ** | le commit tagué `lab-<id>-start`, d'où part l'apprenant avec `lab start` |
| **état solution** | le commit tagué `lab-<id>-solution`, où tous les checks passent |
| **rejeu** | `npx lab replay` : vérifie que tout échoue au départ et que tout passe sur la solution |
| **catalogue** | la liste des labs, de leurs étapes et de leurs checks ; elle donne les colonnes de l'écran |
| **session** | une salle, identifiée par un code ; réelle pour de vrais apprenants, simulée pour le simulateur et le rejeu |

Un lab prend une ou plusieurs de ces quatre formes :

| Forme | L'apprenant… | État de départ |
|---|---|---|
| **construire** | ajoute une fonctionnalité | la fonctionnalité absente |
| **panne** | diagnostique et répare | une panne introduite exprès |
| **tester le test** | écrit un check qui échoue sur la version cassée et passe sur la corrigée | une version cassée et une version corrigée accessibles par variable d'environnement |
| **prédire** | prédit, observe et explique l'écart | l'état actuel suffit souvent |

## Construire un lab, pas à pas

### 0. Avant de commencer

Tout se passe dans le dépôt du cours, **sur la branche `labs`**. Vérifier avant chaque commit ou tag, surtout après avoir joué un lab, car `lab start` laisse sur une branche `lab-<id>` :

```bash
git branch --show-current     # doit afficher labs
git status --short            # doit être vide
```

### 1. Écrire la fiche du lab

Avant tout code, une fiche d'une page, à faire relire. C'est elle qui fixe ce que l'apprenant voit et ce qui est vérifié.

```markdown
## Fiche <id>

Objectif pédagogique : ce que l'apprenant comprend, en une phrase.
Forme : construire, panne, tester le test, prédire.
Départ : ce qui manque ou ce qui est cassé, et comment on le prépare.
Solution : ce qui répare, en quelques lignes.

Étape <id-étape> · <titre>
  Consigne : deux à quatre lignes.
  Prédiction : la question, les choix, la réponse attendue.
  Checks : identifiant, ce qu'il vérifie, message d'échec.
  Indices : une question, une direction, une quasi-solution.
  Soumission : la question à laquelle l'explication répond.
```

### 2. Créer le dossier et `index.mjs`

```js
// .othila-lab/labs/interface-node/index.mjs
export const title = "L'interface Node";
export const steps = ['expose'];                              // l'ordre des étapes
export const duration = '15 min';
export const summary = `Une interface Node existe dans le schéma, avec sa résolution de type,
mais aucun client ne peut l'atteindre.`;
export const objectives = [
  'exposer une interface par un champ de Query',
  "comprendre comment GraphQL choisit le type concret à l'exécution"
];
```

L'identifiant du lab est le nom du dossier : minuscules, chiffres et tirets. Seuls `title` et `steps` sont obligatoires, mais la fiche affichée à l'apprenant par `lab start` et `lab show` vient des autres champs.

Tant que le lab n'est pas cité dans `formation.json`, c'est un brouillon. Pour le publier, l'ajouter à sa séance dans `.othila-lab/formation.json` :

```json
{ "title": "Séance 2 · Schéma avancé", "labs": ["interface-node"] }
```

### 3. Écrire chaque étape

Un module par étape, nommé d'après son identifiant :

```js
// .othila-lab/labs/interface-node/expose.mjs
import { assert, expectData } from '@othila-academy/lab';

export const title = "Exposer l'interface Node";
export const instructions = `Ajoute à Query un champ node qui prend un id et renvoie un User ou un Event.
Un id inconnu rend null.`;

export const prediction = {
  promptId: 'node-101-typename',                 // un identifiant stable de la question
  question: 'Une fois node(id) en place, que renvoie { node(id: "101") { __typename } } ?',
  choices: ['User', 'Event', 'une erreur'],
  expected: 'Event'                              // sans expected, la question est ouverte
};

export const checks = [
  {
    id: 'node-user',
    label: 'node(id: "1") rend l\'utilisatrice Alice',
    run: async ({ gql }) => {
      const result = await gql('query ($id: ID!) { node(id: $id) { __typename ... on User { name } } }', { variables: { id: '1' } });
      if (result.errors?.length) throw new Error(`node(id: "1") répond « ${result.errors[0].message} ». Qui a tort, la requête ou le serveur ?`);
      assert(result.data.node?.__typename === 'User', 'node(id: "1") devrait rendre un User : demande __typename pour voir ce qui revient');
    }
  }
];

export const hints = [
  "Le type Node existe, sa résolution de type aussi. Qu'est-ce qui manque pour qu'un client puisse l'atteindre ?",
  "Ajoute à Query un champ qui prend un id et renvoie l'interface.",
  'node(id: ID!): Node dans typeDefs.js, et son résolveur dans query.js.'
];
```

L'objectif à atteindre d'une étape, c'est la liste des `label` de ses checks : la fiche les affiche sous « Ce qui sera vérifié ». Le code complet de l'exemple est dans `.othila-lab/labs/interface-node/` du dépôt du cours, et le format de référence dans le [README](../README.md#écrire-un-lab).

### 4. Relire la fiche et le catalogue

```bash
npx lab show interface-node     # ce que l'apprenant verra au lancement
npx lab catalog                 # le tableau des labs : le nouveau doit y être
```

### 5. Jouer le lab sur l'état de départ

```bash
npm run start:server-js                                   # autre terminal
npx lab check interface-node --answer Event --no-report
```

Chaque check doit échouer, sauf ceux marqués `passesOnStart: true`, et chaque message doit pointer un geste de diagnostic. Relire les messages comme un apprenant qui ne connaît pas la solution.

### 6. Commiter le lab sur `labs`

```bash
git add .othila-lab/labs/interface-node .othila-lab/formation.json
git commit -m "feat(labs): lab interface-node, exposer l'interface Node"
```

### 7. Poser l'état de départ

**Si l'état actuel de `labs` convient comme départ**, cas de `interface-node` où le champ n'existe pas encore :

```bash
git tag lab-interface-node-start labs
```

**Si le départ retire ou casse quelque chose**, cas d'un lab « construire » sur une fonctionnalité déjà présente, ou d'un lab de panne : le départ est un commit **dérivé** de `labs`, jamais un commit sur `labs` lui-même, sinon la fonctionnalité disparaîtrait pour tous les autres labs.

```bash
git checkout --detach labs
# retirer la fonctionnalité, ou introduire la panne
git commit -am "lab deprecation: départ"
git tag lab-deprecation-start
```

### 8. Construire la solution

À partir du départ, appliquer la correction attendue, telle qu'un bon apprenant l'écrirait :

```bash
git checkout --detach lab-interface-node-start
# écrire la correction
git commit -am "lab interface-node: solution"
git tag lab-interface-node-solution
git checkout labs
```

Si le lab demande à l'apprenant d'écrire un check (`mine`), la solution contient aussi ce check rempli.

### 9. Rejouer

```bash
npx lab replay --lab interface-node
```

```
| Lab            | État     | Étape  | ✓ | ✗ | Anomalies |
| interface-node | start    | expose | 0 | 4 | aucune    |
| interface-node | solution | expose | 4 | 0 | aucune    |

rejeu : conforme
```

Le rejeu crée deux worktrees temporaires, fait `npm ci`, lance le serveur de chaque état sur un port libre et joue tous les checks. Une anomalie nomme le lab, l'étape et le check fautifs. Pour voir le résultat sur l'écran formateur, ajouter `--session SIM-REPLAY` avec `FORMATEUR_KEY`.

### 10. Publier

Tant que rien n'est poussé, on peut tout refaire. Quand le lab est prêt :

```bash
git push origin labs
git push origin lab-interface-node-start lab-interface-node-solution
```

Les apprenants récupèrent le lab avec `git fetch origin --tags && git checkout labs && npm install`.

## Écrire de bons checks

**La valeur d'une étape** (`export const points`) dit son poids dans le lab : 100 par défaut ; plus pour l'étape qui porte l'apprentissage principal (la correction), moins pour une observation. L'apprenant voit ses points, et le coût d'un indice lui est annoncé ; le formateur les lit dans le détail d'un apprenant et dans les exports, jamais dans la grille. La règle complète est dans [`points/regle.md`](../points/regle.md).

**Le contexte d'un check.** `run` reçoit un objet avec :

| Champ | Usage |
|---|---|
| `gql(query, { variables, token })` | une requête vers le serveur de l'apprenant ; rend `{ data, errors, extensions }` |
| `url` | l'URL GraphQL de l'apprenant |
| `lab`, `step` | le lab et l'étape en cours, dont `lab.dir`, le dossier du lab |
| `startServer({ env })` | lance un second serveur du cours, sur un port libre, avec des variables d'environnement ; rend `{ url, stop }` |
| `runChecks(checks, ctx)` | joue une liste de checks, par exemple ceux écrits par l'apprenant |

Le paquet exporte aussi `assert`, `expectData`, `expectErrorCode` et `loginAs(gql, email)` pour les labs qui demandent un compte connecté.

**Les règles :**

- **Observer un comportement, jamais le code.** Un check interroge le serveur, par requête ou par introspection. Il ne lit pas les fichiers de l'apprenant. C'est ce qui permet à la piste Python de faire les mêmes labs.
- **Un message d'échec nomme un geste de diagnostic.** « Demande `__typename` pour voir ce qui revient », pas « il manque `__resolveType` ». La réponse est réservée au troisième indice.
- **Une erreur GraphQL se montre telle quelle**, suivie de la question du cours : « Qui a tort, la requête ou le serveur ? ». Le catalogue d'erreurs du cours (`docs/ERREURS.md`) aide l'apprenant à trancher.
- **Un libellé est une phrase observable** : « node(id: "999") rend null, sans erreur ». C'est ce que l'apprenant lit comme objectif.
- **Les checks sont indépendants.** Leur ordre ne doit pas compter. Un check qui crée des données utilise des valeurs uniques ou nettoie derrière lui, car le serveur de l'apprenant garde ses données en mémoire entre deux lancements.
- **`passesOnStart: true`** marque un check qui passe déjà au départ, par exemple « les données restent justes ». Le rejeu l'attend vert sur les deux états.
- **Trois indices au plus**, du plus ouvert au plus guidant.

**Un lab de panne avec « tester le test ».** Le serveur du cours expose deux variantes figées d'une partie du code, choisies par une variable d'environnement, comme `LAB_REFERENCE_FIX=broken` et `LAB_REFERENCE_FIX=1` pour le lab N+1. L'étape lance deux serveurs avec `startServer({ env })` et y joue le check de l'apprenant, chargé depuis le fichier `mine.target` du lab, relatif à la racine du dépôt (pour le n1 : `packages/server-js/test/n1-mine.check.mjs`), dont le chemin absolu arrive dans `ctx.lab.mine.path`. Il doit échouer sur la version cassée et passer sur la corrigée. Le modèle complet est le lab `n1`, avec `shared.mjs` et `test-the-test.mjs`. Le gabarit du check apprenant est déclaré dans `index.mjs` :

```js
export const mine = { template: 'mine.template.mjs', target: 'packages/server-js/test/n1-mine.check.mjs' };   // copié par lab start
```

## Mettre à jour un lab

### Ce qui change, et ce qu'il faut refaire

| Changement | À refaire |
|---|---|
| texte : consigne, contexte, objectifs, indices, message d'échec | commiter sur `labs`, reposer les tags, rejouer |
| un check : ajouté, retiré, modifié | idem, puis recréer le catalogue d'une session pas encore commencée |
| l'état de départ ou la solution | reconstruire les commits dérivés et les tags, rejouer |
| le paquet `lab` | `npm install --save-dev --save-exact @othila-academy/lab@<version>` (voir le [README](../README.md#livrer-une-version)), puis reposer les tags de tous les labs |

Le catalogue d'une session est figé à sa création : les colonnes de l'écran sont ses étapes, et le total de checks de chaque étape vient de lui. Dans une session déjà ouverte, une étape nouvelle apparaît en fin de grille dès qu'un apprenant la joue, mais le total d'une étape modifiée reste l'ancien. Une session pas encore commencée se recrée avec le nouveau catalogue.

### Reposer les tags d'un lab

Les tags pointent sur un état précis de `labs`. Quand `labs` avance, avec un texte retouché, un autre lab ou une nouvelle version du paquet, les tags doivent suivre, sinon l'apprenant part d'un état ancien.

**Lab dont le départ est `labs` lui-même**, comme `interface-node` :

```bash
git checkout labs
git diff lab-interface-node-start lab-interface-node-solution > /tmp/solution.patch
git tag -f lab-interface-node-start labs
git checkout --detach lab-interface-node-start
git apply /tmp/solution.patch
git commit -am "lab interface-node: solution"
git tag -f lab-interface-node-solution
git checkout labs
npx lab replay --lab interface-node
```

**Lab dont le départ est un commit dérivé**, un lab de panne ou de retrait : rejouer les deux commits dérivés sur le nouveau `labs`.

```bash
git checkout --detach labs
git cherry-pick lab-deprecation-start          # le commit « départ »
git tag -f lab-deprecation-start
git cherry-pick lab-deprecation-solution       # le commit « solution »
git tag -f lab-deprecation-solution
git checkout labs
npx lab replay --lab deprecation
```

### Des tags déjà poussés

`git fetch --tags` ne remplace pas un tag que l'apprenant a déjà. Après avoir reposé un tag publié :

```bash
git push origin labs
git push --force origin lab-<id>-start lab-<id>-solution
```

Et chez l'apprenant :

```bash
git fetch origin --tags --force
git checkout labs && git pull && npm install
```

`lab start` cherche toujours `lab-<id>-start` : ne pas créer de tag `-v2`, l'outil ne le trouverait pas.

### Un apprenant a déjà commencé le lab

Sa branche `lab-<id>` fige l'état de départ et la version de l'outil du moment où il l'a créée. Pour qu'il récupère une mise à jour sans perdre son travail :

```bash
git add -A && git commit -m "lab <id> : mon travail"
git merge labs
npm install
```

S'il préfère repartir de zéro, au prix de son travail :

```bash
git checkout -- . && git checkout labs
git branch -D lab-<id>
npm install && npx lab start <id>
```

### Retirer un lab

Supprimer le dossier `.othila-lab/labs/<id>/` et sa mention dans `formation.json` sur `labs`, commiter, puis supprimer les tags : `git tag -d lab-<id>-start lab-<id>-solution`, et `git push origin --delete lab-<id>-start lab-<id>-solution` s'ils étaient publiés.

## Dépannage

| Symptôme | Cause et geste |
|---|---|
| `lab inconnu : x` | le dossier `.othila-lab/labs/x/` n'existe pas sur la branche courante : `git checkout labs`, ou le lab n'est pas encore publié |
| `section a migré dans .othila-lab/formation.json` | retirer `section` de `index.mjs` et citer le lab dans une séance du manifeste |
| `ancienne configuration othila-lab.config.json` | migrer le dépôt : [README](../README.md#configurer-un-dépôt-de-cours), section « Configurer un dépôt de cours » |
| `tag lab-x-start introuvable` | les tags ne sont pas récupérés : `git fetch origin --tags` |
| `lab start` refuse : arbre modifié | du travail non commité : la commande exacte à lancer est dans le message |
| `lab start` refuse : la branche existe | le lab a déjà été commencé : `git checkout lab-x` pour y revenir |
| `lab check` sort en code 2 | le serveur de l'apprenant ne répond pas : `npm run start:server-js`, ou préciser `--url` |
| « hors ligne : N évènement(s) conservé(s) » | le serveur othila-lab est injoignable ; tout repart à la commande suivante |
| « jeton refusé, relance lab join » | l'apprenant a rejoint depuis un autre poste, ce qui invalide l'ancien jeton |
| `npx lab show` ou `lab progress` inconnus | la branche de l'apprenant porte une ancienne version de l'outil : voir [Un apprenant a déjà commencé le lab](#un-apprenant-a-déjà-commencé-le-lab) |
| le rejeu signale un check qui passe sur `start` | l'état de départ n'est pas assez cassé, ou le check ne mesure pas la bonne chose ; sinon `passesOnStart: true` |
| le rejeu signale un check qui échoue sur `solution` | la solution est incomplète, ou le check est trop strict |
| `la session X existe et n'est pas simulée` | `lab replay --session` ou le simulateur visent une vraie session : choisir un autre code, par exemple `SIM-REPLAY` |
| `inscription refusée (HTTP 409) : session clôturée` | la session est clôturée : le formateur peut la rouvrir depuis sa console si c'est une erreur |
| des évènements rejetés en `session_closed` dans `rejected.jsonl` | ils sont arrivés plus de 24 heures après la clôture ; ils ne comptent plus dans l'export |
