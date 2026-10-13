# Écrire un lab

Ce guide s'adresse à l'auteur d'un cours qui utilise la commande `lab` (paquet `@othila-academy/lab`) : concevoir un lab, l'écrire, l'ajouter à la chaîne du cours, le rejouer, le publier, puis le mettre à jour. Ouvrir et suivre une session se fait sur le serveur othila-lab, hors de ce guide. L'exemple qui court tout du long est `interface-node`, un lab du cours GraphQL d'Othila Academy.

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
| **chaîne** | la suite des états de référence du cours sur `main` : `base`, puis `solution/<id>` de chaque lab, dans l'ordre de `formation.json` |
| **base** | le tag du starter : le code minimal et l'outillage d'où part tout le cours ; l'apprenant y crée sa branche avec `lab init` |
| **état solution** | le commit tagué `solution/<id>` sur `main`, où tous les checks du lab passent |
| **état de départ** | la solution du lab précédent (ou `base` pour le premier) : c'est le code de l'apprenant quand il arrive au lab |
| **définitions** | `.othila-lab/` : manifeste et dossiers des labs ; celles de la tête de `main` font foi, l'apprenant les reçoit par `lab update` |
| **rejeu** | `npx lab replay` : vérifie la chaîne, puis que tout échoue au départ et que tout passe sur la solution |
| **catalogue** | la liste des labs, de leurs étapes et de leurs checks ; elle donne les colonnes de l'écran |
| **session** | une salle, identifiée par un code ; réelle pour de vrais apprenants, simulée pour le simulateur et le rejeu |

Un lab prend une ou plusieurs de ces quatre formes :

| Forme | L'apprenant… | Au départ (la solution du lab précédent) |
|---|---|---|
| **construire** | ajoute une fonctionnalité | la fonctionnalité n'existe pas encore |
| **panne** | diagnostique et répare | un défaut que le code a naturellement à ce stade (un N+1, une erreur non gérée), ou une variante cassée figée dans le cours, choisie par variable d'environnement |
| **tester le test** | écrit un check qui échoue sur la version cassée et passe sur la corrigée | une version cassée et une version corrigée accessibles par variable d'environnement |
| **prédire** | prédit, observe et explique l'écart | l'état actuel suffit souvent |

Dans la chaîne, le départ d'un lab n'est jamais un état retouché pour l'occasion : c'est le code de l'apprenant qui a fini le lab précédent. Un lab ne retire donc pas une fonctionnalité pour la faire reconstruire ; il fait construire ce qui manque, ou réparer ce qui est réellement fragile.

## Construire un lab, pas à pas

### 0. Avant de commencer

Tout se passe dans le dépôt du cours, **sur `main`, à la tête de la chaîne** : le nouveau lab part de la solution du dernier lab. Vérifier avant chaque commit ou tag :

```bash
git branch --show-current     # doit afficher main
git status --short            # doit être vide
npx lab replay                # la chaîne existante est saine (facultatif, mais rassurant)
```

Le dernier commit de `main` doit porter le tag de solution du dernier lab, ou ne contenir après lui que des commits de définitions (`.othila-lab/`). Le premier lab d'un cours part de `base` : le starter, commité et tagué (`git tag base`).

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

Tant que le lab n'est pas cité dans `formation.json`, c'est un brouillon. Pour l'ajouter **en fin de chaîne**, le citer en dernier dans `.othila-lab/formation.json`, dans la dernière séance ou une nouvelle :

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

Le code de `main` est le départ du lab : la solution du lab précédent.

```bash
npm run start:server-js                                   # autre terminal
npx lab check interface-node --answer Event --no-report
```

Chaque check doit échouer, sauf ceux marqués `passesOnStart: true`, et chaque message doit pointer un geste de diagnostic. Relire les messages comme un apprenant qui ne connaît pas la solution.

### 6. Commiter les définitions

```bash
git add .othila-lab/labs/interface-node .othila-lab/formation.json
git commit -m "feat(labs): lab interface-node, exposer l'interface Node"
```

Ce commit ne touche que `.othila-lab/` : le code reste celui du départ.

### 7. Écrire la solution et la taguer

Appliquer la correction attendue sur `main`, telle qu'un bon apprenant l'écrirait, puis la taguer :

```bash
# écrire la correction
npx lab check interface-node --answer Event --no-report     # tout doit passer
git add -A
git commit -m "solution(interface-node): node(id) dans Query"
git tag solution/interface-node
```

Le commit de solution ne contient que du code. Si le lab demande à l'apprenant d'écrire un check (`mine`), la solution contient aussi ce check rempli. Ce commit devient le départ du lab suivant.

### 8. Rejouer

```bash
npx lab replay --lab interface-node
```

```
| Lab            | État     | Étape  | ✓ | ✗ | Anomalies |
| interface-node | start    | expose | 0 | 4 | aucune    |
| interface-node | solution | expose | 4 | 0 | aucune    |

rejeu : conforme
```

Le rejeu vérifie d'abord la chaîne jusqu'au lab : chaque tag existe et chaque état est un ancêtre du suivant. Puis il crée deux worktrees temporaires, l'un sur le départ (ici la solution du lab précédent), l'autre sur `solution/interface-node`, fait `npm ci`, y pose les définitions et la commande `lab` de l'arbre courant, lance le serveur de chaque état sur un port libre et joue tous les checks. Une anomalie nomme le lab, l'étape et le check fautifs. `--keep` garde les worktrees pour les inspecter. Pour voir le résultat sur l'écran formateur, ajouter `--session SIM-REPLAY` avec `FORMATEUR_KEY`.

Sans `--lab`, `npx lab replay` rejoue toute la chaîne.

### 9. Relire le parcours de l'apprenant

Dans un clone jetable, comme un apprenant : `npx lab init --branch essai`, puis `npx lab start interface-node`. Ou, pour un apprenant qui arrive au lab : `npx lab catchup interface-node`.

### 10. Publier

Tant que rien n'est poussé, on peut tout refaire. Quand le lab est prêt :

```bash
git push origin main
git push origin solution/interface-node
```

Les apprenants récupèrent le lab avec `npx lab update` : leur `.othila-lab/` suit `main`, leur code ne bouge pas.

## Écrire de bons checks

**La valeur d'une étape** (`export const points`) dit son poids dans le lab : 100 par défaut ; plus pour l'étape qui porte l'apprentissage principal (la correction), moins pour une observation. L'apprenant voit ses points, et le coût d'un indice lui est annoncé ; le formateur les lit dans le détail d'un apprenant et dans les exports, jamais dans la grille. La règle complète est dans [`points/regle.md`](../points/regle.md).

**Le contexte d'un check.** `run` reçoit un objet avec :

| Champ | Usage |
|---|---|
| `gql(query, { variables, token })` | une requête vers le serveur de l'apprenant ; rend `{ data, errors, extensions }` |
| `url` | l'URL GraphQL de l'apprenant ; `null` dans une formation sans serveur, où `gql` lève une erreur |
| `lab`, `step` | le lab et l'étape en cours, dont `lab.dir`, le dossier du lab |
| `startServer({ env })` | lance un second serveur du cours, sur un port libre, avec des variables d'environnement ; rend `{ url, stop }` |
| `runChecks(checks, ctx)` | joue une liste de checks, par exemple ceux écrits par l'apprenant |

Le paquet exporte aussi `assert`, `expectData`, `expectErrorCode`, `loginAs(gql, email)` pour les labs qui demandent un compte connecté, et `componentTest` pour les labs de client (voir [Un lab de client](#un-lab-de-client--tests-de-composants)).

**Les règles :**

- **Observer un comportement, jamais le code.** Un check interroge le serveur, par requête ou par introspection. Il ne lit pas les fichiers de l'apprenant. C'est ce qui permet à la piste Python de faire les mêmes labs. Exception : un test de composant (voir [Un lab de client](#un-lab-de-client--tests-de-composants)) rend le composant de l'apprenant et observe le DOM ; il l'importe par un chemin que la consigne annonce.
- **Un message d'échec nomme un geste de diagnostic.** « Demande `__typename` pour voir ce qui revient », pas « il manque `__resolveType` ». La réponse est réservée au troisième indice.
- **Une erreur GraphQL se montre telle quelle**, suivie de la question du cours : « Qui a tort, la requête ou le serveur ? ». Le catalogue d'erreurs du cours (`docs/ERREURS.md`) aide l'apprenant à trancher.
- **Un libellé est une phrase observable** : « node(id: "999") rend null, sans erreur ». C'est ce que l'apprenant lit comme objectif.
- **Les checks sont indépendants.** Leur ordre ne doit pas compter. Un check qui crée des données utilise des valeurs uniques ou nettoie derrière lui, car le serveur de l'apprenant garde ses données en mémoire entre deux lancements.
- **`passesOnStart: true`** marque un check qui passe déjà au départ, par exemple « les données restent justes ». Le rejeu l'attend vert sur les deux états.
- **Un check ne doit pas dépendre des labs suivants.** Il est joué sur la solution du lab précédent et sur la sienne, jamais plus loin dans la chaîne.
- **Trois indices au plus**, du plus ouvert au plus guidant.

**Un lab de panne avec « tester le test ».** Le serveur du cours expose deux variantes figées d'une partie du code, choisies par une variable d'environnement, comme `LAB_REFERENCE_FIX=broken` et `LAB_REFERENCE_FIX=1` pour le lab N+1. L'étape lance deux serveurs avec `startServer({ env })` et y joue le check de l'apprenant, chargé depuis le fichier `mine.target` du lab, relatif à la racine du dépôt (pour le n1 : `packages/server-js/test/n1-mine.check.mjs`), dont le chemin absolu arrive dans `ctx.lab.mine.path`. Il doit échouer sur la version cassée et passer sur la corrigée. Le modèle complet est le lab `n1`, avec `shared.mjs` et `test-the-test.mjs`. Le gabarit du check apprenant est déclaré dans `index.mjs` :

```js
export const mine = { template: 'mine.template.mjs', target: 'packages/server-js/test/n1-mine.check.mjs' };   // copié par lab start s'il n'existe pas
```

## Un lab de client : tests de composants

Un check ordinaire interroge le serveur. Pour vérifier un client (React, par exemple), le lab fournit des **tests de composants** écrits avec Vitest et Testing Library, et chaque check en lit un résultat.

**Le principe.**

- Le lab range ses tests dans son dossier, par exemple `.othila-lab/labs/client-apollo/tests/brancher.test.jsx`.
- `componentTest({ id, label, file, test })` relie un check à un test : `file` est relatif au dossier du lab, `test` est le titre exact du test (ou son nom complet, titres des `describe` compris), l'`id` du check par défaut. `passesOnStart` s'utilise comme pour les autres checks.
- `lab check` lance le Vitest **du cours** une seule fois par étape, sous jsdom, sur les seuls fichiers cités par l'étape : les tests de l'apprenant ne tournent pas. La config Vite du client (plugins, JSX) est reprise.
- Une étape peut mélanger checks serveur et checks de composants.

**`formation.json`.** `client.dir` désigne le client ; `client.setup`, facultatif, un fichier chargé avant chaque fichier de test du lab. Dans les tests, `@client/` désigne `client.dir`, et `process.env.LAB_GRAPHQL_URL` l'URL du serveur GraphQL quand le cours en a un (celle de `lab check`, `--url` compris).

```js
// .othila-lab/shared/client-setup.js : la préparation du cours
import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
vi.stubEnv('VITE_GRAPHQL_URL', process.env.LAB_GRAPHQL_URL);   // le client lit son URL dans import.meta.env
afterEach(cleanup);
```

```js
// .othila-lab/labs/client-apollo/brancher.mjs
import { componentTest } from '@othila-academy/lab';

export const checks = [
  componentTest({ id: 'liste-affiche', label: 'la liste affiche les titres renvoyés par events', file: 'tests/brancher.test.jsx' }),
  { id: 'login-fonctionne', label: 'login répond pour Bilal', run: async ({ gql }) => { /* … */ } }
];
```

```jsx
// .othila-lab/labs/client-apollo/tests/brancher.test.jsx
import { render, screen, waitFor } from '@testing-library/react';
import { ApolloProvider } from '@apollo/client/react';
import { expect, test } from 'vitest';
import { client } from '@client/src/apollo.js';
import EventsList from '@client/src/EventsList.jsx';

test('liste-affiche', async () => {
  expect(client, "src/apollo.js n'exporte pas client").toBeTruthy();
  const res = await fetch(process.env.LAB_GRAPHQL_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query: '{ events { title } }' })
  });
  const { data } = await res.json();
  render(<ApolloProvider client={client}><EventsList /></ApolloProvider>);
  for (const { title } of data.events) {
    await waitFor(() => expect(screen.queryByText(title, { exact: false }), `Le titre « ${title} » n'apparaît pas : le composant lit-il data.events ?`).not.toBeNull());
  }
});
```

**Les règles d'écriture.**

- **Toujours passer un message à `expect`** : `expect(x, 'message pour l'apprenant')`. L'apprenant ne lit que ce message ; sans lui, il lit l'anglais de Testing Library.
- **Pas de `findBy*` ni de `getBy*` dans un test** : ils échouent avant `expect`, et l'apprenant lit l'anglais de Testing Library. Utiliser `queryBy*` dans `expect`, et `waitFor` pour attendre un rendu asynchrone.
- **Un message sur une seule ligne** : seule la première ligne de l'échec est gardée.
- **Un échec choisi par le test** (plusieurs causes possibles) : `expect.fail('message')` ou `throw new Error('message')` ; l'apprenant lit le message seul.
- **Vérifier les exports attendus explicitement.** Sous Vite, un export nommé absent vaut `undefined`, sans erreur au chargement.
- **Annoncer dans la consigne le chemin et les exports que le test importe** (`src/EventsList.jsx`, export par défaut) : c'est un contrat avec l'apprenant. C'est la seule exception à la règle « observer un comportement, jamais le code » : le test rend le composant de l'apprenant et observe le DOM.
- **L'outillage de test est au cours.** Vitest, jsdom et `@testing-library/react` sont des devDependencies du client. Les tests du lab et la préparation vivent dans `.othila-lab/` et résolvent leurs imports depuis la racine du dépôt : le client est donc à la racine, ou un workspace du cours (dépendances hissées à la racine). Vitest 5 et jsdom 30 demandent Node 22.22, 24.15 ou plus récent ; `lab check` le vérifie avant de lancer Vitest.
- **Monter `lab` dans `formation.json`** (`"lab": "0.9.0"`) dès qu'un lab utilise `componentTest` : un apprenant resté sur une version plus ancienne lit alors quelle version installer.

**Ce que voit l'apprenant.**

| Vitest renvoie | L'apprenant lit |
|---|---|
| `AssertionError: <message>: expected …` | `<message>` |
| `Error: <message>`, levée par le test | `<message>` |
| un autre échec, sans message | sa première ligne, telle quelle |
| `Failed to resolve import "@client/<chemin>"` | « packages/client-react/<chemin> introuvable : as-tu créé ce fichier ? » |
| `Failed to resolve import "./Foo.jsx" from "src/App.jsx"` | « packages/client-react/src/Foo.jsx introuvable (importé par packages/client-react/src/App.jsx) » |
| `Failed to resolve import "<paquet>"` | « le paquet <paquet> n'est pas installé pour le client (packages/client-react) » |
| `Failed to resolve import "<paquet>"` depuis un test du lab ou la préparation | « le paquet <paquet> est introuvable depuis .othila-lab/… : installe-le dans le client, qui doit être un workspace du cours (ou à la racine du dépôt) » |
| un hook (`beforeAll`, préparation) en échec | la cause du fichier, au lieu de « n'a pas été joué » |
| une erreur de compilation | « packages/client-react/src/X.jsx ne compile pas (ligne N) : <raison> » |

Quand les tests ne peuvent pas tourner, chaque check de composant de l'étape échoue avec le même message : pas de `client` dans le manifeste, dossier du client absent (« packages/client-react n'existe pas : as-tu créé le client ? »), Vitest introuvable, version de Node refusée par Vitest ou jsdom, plus de 60 s d'exécution.

**Au rejeu**, `npm ci` installe le client s'il est un workspace du cours. Au départ d'un lab qui crée le client, le client absent fait échouer ses checks de composants, comme attendu ; sur la solution, ils passent contre le serveur que démarre le rejeu.

## Un lab de subscription

Un check s'abonne comme un client : `subscribe` ouvre une connexion WebSocket (protocole graphql-transport-ws, celui de graphql-ws) à l'adresse du serveur GraphQL du check, `http` devenant `ws` (`--url` et le rejeu suivent). lab-cli ferme les abonnements du check quand il se termine, qu'il passe ou non.

```js
// .othila-lab/labs/subscriptions/souscrire.mjs
import { assert } from '@othila-academy/lab';

const CREATED = 'subscription { eventCreated { id title organizer { name } } }';

export const checks = [
  {
    id: 'recoit',
    label: 'un abonné à eventCreated reçoit l’évènement créé ensuite, en moins de 3 s',
    run: async ({ gql, subscribe }) => {
      const sub = await subscribe(CREATED);
      const created = await createAs(gql, 'bilal');            // une aide du cours
      const message = await sub.next({ timeout: 3000 });
      assert(message, 'Abonné, rien reçu en 3 s : createEvent publie-t-il sur le même canal que celui de la subscription ?');
      assert(!message.errors, `La subscription répond « ${message.errors?.[0]?.message} ».`);
      assert(message.data.eventCreated.id === created.id, 'L’abonné a reçu un autre évènement que celui créé.');
    }
  },
  {
    id: 'un-seul',
    label: 'l’abonné reçoit l’évènement une fois',
    run: async ({ gql, subscribe }) => {
      const sub = await subscribe(CREATED);
      await createAs(gql, 'bilal');
      assert(await sub.next({ timeout: 3000 }), 'Abonné, rien reçu : regarde le check recoit.');
      assert(!(await sub.next({ timeout: 500 })), 'L’abonné a reçu l’évènement deux fois : publies-tu à deux endroits ?');
    }
  }
];
```

**Les règles d'écriture.**

- **Déclencher après le retour de `subscribe`** : il ne rend la main qu'une fois l'abonnement prêt (connexion acceptée, abonnement envoyé, puis un court délai, `ready`, 200 ms par défaut, car graphql-ws n'accuse pas réception d'un abonnement).
- **Toujours passer un délai à `next`** (3000 ms par défaut) ; `null` veut dire « rien reçu » : le check écrit alors son message.
- **Vérifier l'absence de doublon** par un second `next` au délai court (500 ms).
- **Une erreur GraphQL** (champ inconnu, validation) arrive comme `{ errors }`, à traduire comme une réponse de `gql`.
- **Un abonné par connexion** : deux appels à `subscribe` font deux clients, comme deux onglets.
- **Jeton** : `subscribe(query, { token })` l'envoie dans les `connectionParams` (`authorization: 'Bearer …'`), que le serveur lit dans `onConnect` ou `context`.
- Après `complete`, une erreur ou une coupure, `next` rend `null` tout de suite ; `sub.closed` donne alors `{ code, reason }`.
- Hors d'un check, `subscribe(url, query, options)` est exporté par `@othila-academy/lab` (adresse `ws://` explicite) ; il faut alors appeler `sub.close()`.

## Mettre à jour un lab

### Ce qui change, et ce qu'il faut refaire

| Changement | À refaire |
|---|---|
| texte : consigne, contexte, objectifs, indices, message d'échec | un commit sur `main`, rejouer ; aucun tag ne bouge |
| un check : ajouté, retiré, modifié | idem, puis recréer le catalogue d'une session pas encore commencée |
| le paquet `lab` | `npm install --save-dev --save-exact @othila-academy/lab@<version>` sur `main` (voir le [README](../README.md#livrer-une-version)), rejouer ; aucun tag ne bouge |
| le code d'un état (une solution à corriger) | rebaser la chaîne à partir de cet état et déplacer les tags suivants : voir ci-dessous |
| insérer un lab au milieu de la chaîne | idem : sa solution s'insère, les solutions suivantes sont rebasées dessus |

Le rejeu joue toujours les définitions et la commande de l'arbre courant sur le code figé par les tags : retoucher un lab n'oblige jamais à reposer ses tags.

Le catalogue d'une session est figé à sa création : les colonnes de l'écran sont ses étapes, et le total de checks de chaque étape vient de lui. Dans une session déjà ouverte, une étape nouvelle apparaît en fin de grille dès qu'un apprenant la joue, mais le total d'une étape modifiée reste l'ancien. Une session pas encore commencée se recrée avec le nouveau catalogue.

### Changer le code d'un état

Corriger la solution du lab `schema` quand `n1` vient après : la correction remonte dans tous les états suivants.

```bash
git checkout -b reprise solution/schema
# corriger
git commit -am "solution(schema): …"
git rebase --onto reprise solution/schema main       # rejoue n1 et les commits suivants sur la correction
git tag -f solution/schema reprise
git tag -f solution/n1 <nouveau commit de solution de n1>    # git log --oneline pour le retrouver
git checkout main && git branch -D reprise
npx lab replay
```

C'est une réécriture de l'historique de `main` : à réserver à un cours que personne n'a encore cloné, ou à faire entre deux promotions. Sinon, préférer un commit de correction en tête de `main`, qui deviendra le départ du lab suivant.

### Des tags déjà poussés

`git fetch --tags` ne remplace pas un tag que l'apprenant a déjà. Après avoir déplacé un tag publié :

```bash
git push --force-with-lease origin main
git push --force origin solution/<id>
```

Chez l'apprenant, `lab catchup` récupère les tags du cours avant de créer sa branche ; un tag déplacé se récupère avec `git fetch origin --tags --force`.

### Un apprenant a déjà commencé

Il est sur sa branche (`my-project`), avec son code. Une retouche de lab lui arrive par :

```bash
npx lab update
```

Seul `.othila-lab/` change, dans un commit à part ; son code, commité ou non, ne bouge pas. Si la commande annonce une autre version du paquet, il lance la commande `npm install` qu'elle affiche.

S'il est trop loin du départ d'un lab (absent, projet bloqué), il repart du départ de référence sur une nouvelle branche ; la sienne reste intacte :

```bash
git add -A && git commit -m "mon travail"
npx lab catchup n1
npm install
```

### Retirer un lab

Le retirer de `formation.json` et supprimer son dossier `.othila-lab/labs/<id>/` sur `main`, commiter. Les apprenants le perdent au prochain `lab update`. Si c'est le dernier lab de la chaîne, supprimer aussi son tag (`git tag -d solution/<id>`, et `git push origin --delete solution/<id>` s'il était publié). Au milieu de la chaîne, le lab suivant part maintenant de la solution d'avant : rejouer, et si son départ ne convient plus, retirer aussi le code de la solution retirée, comme pour un changement de code d'un état.

## Dépannage

| Symptôme | Cause et geste |
|---|---|
| `lab inconnu : x` | le lab n'est pas encore dans les définitions de l'apprenant : `npx lab update` ; ou il n'est pas encore publié |
| `section a migré dans .othila-lab/formation.json` | retirer `section` de `index.mjs` et citer le lab dans une séance du manifeste |
| `ancienne configuration othila-lab.config.json` | migrer le dépôt : [README](../README.md#configurer-un-dépôt-de-cours), section « Configurer un dépôt de cours » |
| `tag base introuvable` (`lab init`) | les tags ne sont pas récupérés : `git fetch origin --tags` ; côté auteur, le starter n'est pas encore tagué |
| `lab init` refuse : la branche existe | la branche de projet existe déjà : `git checkout my-project` pour y revenir |
| `lab init` ou `lab catchup` refusent : arbre modifié | du travail non commité : le commiter ou le mettre de côté (`git stash`) |
| `solution/x introuvable : le départ du lab y manque` (`lab catchup`) | le lab précédent n'a pas de solution publiée : prévenir le formateur |
| `solution/x introuvable` (`lab replay`) | le commit de solution du lab x n'est pas tagué : `git tag solution/x <commit>` |
| `solution/x n'est pas un ancêtre de solution/y` | un tag est posé hors de `main`, ou la chaîne a été réécrite sans déplacer les tags suivants : voir [Changer le code d'un état](#changer-le-code-dun-état) |
| `origin/main introuvable` (`lab update`) | le remote du cours n'est pas `origin`, ou sa branche n'est pas `main` : `git remote -v`, et le champ `reference` de `formation.json` |
| « hors ligne : labs de la dernière référence récupérée » | `lab update` n'a pas joint le remote : les définitions viennent du dernier fetch ; relancer une fois en ligne |
| `lab check` sort en code 2 | le serveur de l'apprenant ne répond pas : `npm run start:server-js`, ou préciser `--url` |
| `Vitest n'est pas installé pour …` | installer Vitest, jsdom et `@testing-library/react` en devDependencies du client |
| `le paquet X est introuvable depuis .othila-lab/…` | le client n'est ni à la racine ni un workspace du cours : ses dépendances ne sont pas visibles depuis `.othila-lab/` ; en faire un workspace (`"workspaces": ["packages/*"]`), ou installer le paquet à la racine |
| `test « x » introuvable dans tests/….test.jsx` | le titre du test et le `test` du check (ou son `id`) diffèrent |
| `vitest … demande Node …` ou `jsdom … demande Node …` | changer de version de Node (Vitest 5 et jsdom 30 : Node 22.22, 24.15 ou plus récent) |
| `ce cours demande @othila-academy/lab X ou plus` | installer la version indiquée : `npm install --save-dev --save-exact @othila-academy/lab@X` |
| `cette formation n'a pas de serveur GraphQL` | un check appelle `gql` dans une formation sans `server` : déclarer `server` dans `formation.json`, ou retirer l'appel |
| « hors ligne : N évènement(s) conservé(s) » | le serveur othila-lab est injoignable ; tout repart à la commande suivante |
| « jeton refusé, relance lab join » | l'apprenant a rejoint depuis un autre poste, ce qui invalide l'ancien jeton |
| `npx lab update` ou `lab init` inconnus | l'apprenant a une version du paquet antérieure à la 0.8 : `npm install --save-dev --save-exact @othila-academy/lab@<version du cours>` |
| le rejeu signale un check qui passe sur `start` | la solution du lab précédent fait déjà ce que le lab demande, ou le check ne mesure pas la bonne chose ; sinon `passesOnStart: true` |
| le rejeu signale un check qui échoue sur `solution` | la solution est incomplète, ou le check est trop strict |
| `la session X existe et n'est pas simulée` | `lab replay --session` ou le simulateur visent une vraie session : choisir un autre code, par exemple `SIM-REPLAY` |
| `inscription refusée (HTTP 409) : session clôturée` | la session est clôturée : le formateur peut la rouvrir depuis sa console si c'est une erreur |
| des évènements rejetés en `session_closed` dans `rejected.jsonl` | ils sont arrivés plus de 24 heures après la clôture ; ils ne comptent plus dans l'export |
| Un check de subscription échoue sur « Le serveur ne répond pas en WebSocket sur ws://… » | Le serveur répond en HTTP mais pas en WebSocket sur ce chemin : `startStandaloneServer` ne gère pas les WebSockets ; ouvrir un serveur `ws` avec `useServer` de graphql-ws, branché sur le même serveur HTTP et le même chemin |
| « n'a pas accepté la connexion en 3 s (connection_ack attendu) » | Une WebSocket est ouverte, mais rien ne parle graphql-ws dessus : `useServer({ schema }, wsServer)` manque |
| « refuse la connexion (4403) » | `onConnect` du serveur a rejeté la connexion : il reçoit les `connectionParams` (le jeton passé par `subscribe(query, { token })`) |
| « ne parle pas graphql-transport-ws » (4406) | Le serveur a accepté la connexion puis refusé le protocole : utiliser graphql-ws (`useServer`), pas l'ancien subscriptions-transport-ws (qui, lui, fait échouer la poignée de main : « ne répond pas en WebSocket ») |
| « a fermé la connexion (code … : …) avant l’abonnement » | Le serveur a coupé avant que l'abonnement soit prêt ; le code et la raison viennent de lui. Souvent 4500 : le `context` de `useServer` lève (un jeton absent ou illisible dans les `connectionParams`, par exemple) |
| « serveur injoignable sur http://… » levé par `subscribe` | Plus rien ne répond, même en HTTP : le serveur s'est arrêté pendant le check, ou `--url` désigne une autre adresse |
