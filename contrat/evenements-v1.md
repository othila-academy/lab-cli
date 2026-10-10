# Contrat d'évènements othila-lab — v1

> **Statut :** figé le 6 octobre 2026. Identifiant de version : `othila-lab/1`.
> **Producteurs :** le reporter de la commande `lab` (ce paquet) et le simulateur du serveur othila-lab. **Consommateur :** l'endpoint `POST /api/events` du serveur othila-lab, qui dérive le tableau formateur.
> **Normatif**, sauf la section 6 qui est informative. Les exemples de la section 9 sont versionnés dans [`exemples/`](exemples/) et servent de fixtures au paquet comme au serveur.

## 1. Principes

1. Un évènement est un **fait** daté, jamais un état. Les états (`en échec`, `vert`, `bloqué`…) sont dérivés par le serveur et ne circulent pas.
2. Un évènement est **immuable** et identifié par un UUID v4 produit par le producteur. Le serveur ignore silencieusement un id déjà reçu : renvoyer un lot est toujours sûr.
3. L'identité est l'**identifiant apprenant émis par le serveur**. L'e-mail ne figure dans aucun évènement.
4. Un évènement invalide est **rejeté individuellement**, avec un motif, sans bloquer le reste du lot.
5. Les champs inconnus sont **ignorés** par le consommateur. Ajouter un champ optionnel ne change pas la version ; retirer, renommer ou changer le type d'un champ exige `othila-lab/2`.

## 2. Transport

- `POST /api/events`, corps JSON : un tableau de 1 à 500 évènements, 1 Mio au plus.
- En-tête `Authorization: Bearer <jeton>`. Jeton apprenant, obtenu par `POST /api/sessions/:code/join`, ou clé formateur.
- Réponse `200` : `{ "accepted": ["<id>", …], "rejected": [{ "id": "<id>", "reason": "<motif>" }, …] }`. Un id déjà connu est compté dans `accepted`.
- `400` corps illisible, tableau vide ou trop long ; `401` jeton invalide ; `404` session inconnue ; `413` corps trop gros ; `503` base indisponible. Dans tous ces cas le producteur **conserve** le lot et réessaie plus tard.
- Le reporter ne retire de son outbox que les ids présents dans `accepted` ou `rejected`. Un rejet est définitif : le reporter le journalise localement et n'insiste pas.

## 3. Enveloppe

| Champ | Type | Règle |
|---|---|---|
| `schema` | string | exactement `othila-lab/1` |
| `id` | string | UUID v4, unique par évènement, clé d'idempotence |
| `type` | string | un des six types de la section 4 |
| `session` | string | code de session, `^[A-Z0-9][A-Z0-9-]{2,31}$` |
| `learner` | string | identifiant apprenant émis par le serveur, UUID |
| `lab` | string ou null | slug `^[a-z0-9][a-z0-9-]{0,63}$` ; `null` pour `session.joined` et `env.checked`, obligatoire pour les autres types |
| `step` | string ou null | même slug, mêmes règles que `lab` |
| `at` | string | date ISO 8601 avec fuseau, horloge du producteur |
| `source` | string | `reporter` ou `simulator` |
| `payload` | object | selon le type, section 4 |

**Autorisation.** Avec un jeton apprenant, `learner` doit être l'apprenant du jeton et `source` doit valoir `reporter`. Avec la clé formateur, `source` doit valoir `simulator` et la session doit être marquée `simulated`.

**Horodatage serveur.** Le serveur ajoute `receivedAt`, son horloge, à l'enregistrement. Ce champ n'est jamais envoyé par le producteur ; s'il est présent dans un évènement reçu, il est ignoré.

**Motifs de rejet.** `schema_unsupported`, `invalid_envelope`, `unknown_type`, `invalid_payload`, `learner_mismatch`, `source_not_allowed`, `session_not_simulated`, `lab_required`, `lab_forbidden`, `session_closed`.

**Session clôturée.** Une session clôturée par le formateur accepte encore pendant 24 heures les évènements de ses apprenants, pour les outbox parties hors ligne avant la clôture. Au-delà, chaque évènement est rejeté avec le motif `session_closed`, et une nouvelle inscription reçoit `409`.

## 4. Types

### 4.1 `session.joined`

Quand : à chaque `POST /api/sessions/:code/join` réussi, y compris une nouvelle arrivée avec un e-mail déjà connu. Émis par le serveur lui-même avec `source: reporter` ; posté explicitement par le simulateur. `lab` et `step` sont nuls.

Payload : `{}`.

### 4.2 `env.checked`

Quand : à chaque `lab env`. `lab` et `step` sont nuls.

| Champ | Type | Règle |
|---|---|---|
| `checks` | array | 1 à 20 éléments |
| `checks[].id` | string | slug ; `node-version`, `npm-registry` et `endpoint` sont toujours présents |
| `checks[].ok` | boolean | |
| `checks[].detail` | string | 0 à 200 caractères, ex. `v24.1.0`, `ETIMEDOUT`, `proxy détecté : http://proxy.ecole:3128` |

Si l'endpoint est injoignable, l'évènement est conservé dans l'outbox et parvient au formateur plus tard, avec `endpoint.ok = false`.

### 4.3 `check.completed`

Quand : à la fin de chaque exécution des checks d'une étape, que le serveur de l'apprenant ait répondu ou non.

| Champ | Type | Règle |
|---|---|---|
| `durationMs` | integer | ≥ 0 |
| `passed` | array de string | slugs des checks passés, peut être vide |
| `failed` | array | éléments `{ id, label, message }` ; `label` 1 à 200 caractères, `message` 0 à 1000 caractères |
| `courseRef` | string | 1 à 100 caractères, sortie de `git describe --tags --dirty --always`, ou `unknown` |
| `stepDigest` | string, optionnel | SHA-256 hexadécimal du module d'étape, 64 caractères |

Règles : un id de check apparaît au plus une fois, dans `passed` ou dans `failed` ; `passed.length + failed.length ≥ 1`. Quand le serveur de l'apprenant est injoignable, `passed` est vide et `failed` contient un unique élément d'id `server-unreachable`.

### 4.4 `hint.revealed`

Quand : à chaque révélation d'un niveau d'indice par `lab hint`.

| Champ | Type | Règle |
|---|---|---|
| `level` | integer | 1, 2 ou 3 |
| `checkId` | string, optionnel | slug du check visé |

Le reporter révèle les niveaux dans l'ordre ; le serveur ne l'impose pas, pour que le simulateur puisse jouer un profil qui saute un niveau.

### 4.5 `prediction.submitted`

Quand : au premier `lab check` d'une étape qui déclare une prédiction, avant l'exécution des checks.

| Champ | Type | Règle |
|---|---|---|
| `promptId` | string | slug |
| `answer` | string | 1 à 500 caractères |
| `correct` | boolean ou null | `null` pour une question ouverte |

### 4.6 `answer.submitted`

Quand : à chaque `lab submit`, que les checks soient verts ou non.

| Champ | Type | Règle |
|---|---|---|
| `text` | string | 1 à 2000 caractères |

L'état du check au moment de la soumission est dérivé par le serveur, pas envoyé.

## 5. Validation et ordre

- Le serveur enregistre dans l'ordre d'arrivée. La dérivation trie par `effectiveAt = min(at, receivedAt)`, puis par `receivedAt`. Un `at` dans le futur est ainsi ramené à l'heure de réception, pas rejeté.
- Pour une session `simulated`, `effectiveAt = at` : le temps est celui de la ligne de temps virtuelle, et la réception n'intervient ni dans l'ordre ni dans les seuils. Sans cela, un simulateur accéléré, dont les `at` dépassent l'horloge réelle en quelques secondes, verrait tous ses évènements ramenés à l'instant de réception.
- Un évènement visant un lab ou une étape absents du catalogue de la session est accepté ; l'étape est ajoutée en fin de grille.
- Le serveur ne vérifie pas `stepDigest` en v1 ; il le stocke.
- Les validations de forme sont implémentées en Zod côté serveur ; les exemples de la section 9 doivent tous passer, et chaque motif de rejet a au moins un contre-exemple dans les tests.

## 6. États dérivés (informatif)

Cette section décrit ce que le serveur calcule à partir des évènements. Elle guide l'implémentation de `deriveBoard` et n'engage pas les producteurs.

**Horloge.** `now` est l'horloge du serveur pour une session réelle, le plus grand `at` reçu pour une session `simulated`.

**État d'une étape, par apprenant.** Le dernier évènement de l'étape parmi `check.completed` et `answer.submitted` décide :

- `inactif` : aucun évènement sur l'étape ;
- `en échec` : dernier `check.completed` avec `failed` non vide ;
- `vert` : dernier `check.completed` avec `failed` vide ;
- `soumis` : un `answer.submitted` postérieur au dernier `check.completed`, assorti de l'état de ce check (`vert`, `en échec`, ou `aucun` si jamais lancé).

**Progrès.** Un `check.completed` dont le nombre de `passed` dépasse strictement celui du précédent `check.completed` de la même étape et du même apprenant ; le premier run compte comme progrès si `passed` n'est pas vide. Le passage à `vert` compte toujours.

**Blocage.** Une étape ni `vert` ni `soumis` est bloquée si l'un des deux seuils est atteint : nombre d'indices révélés sur l'étape ≥ `hintLevelForBlocked` (défaut 2), ou `now − lastProgressAt ≥ minutesWithoutProgress` (défaut 10), `lastProgressAt` étant le dernier progrès ou, à défaut, le premier évènement de l'étape. `blockedSince` est le plus ancien des deux déclencheurs. L'écran trie par `now − blockedSince` décroissant.

**Étape courante.** Celle du dernier évènement de l'apprenant portant un `lab`.

**Dernier signe de vie.** `lastSeenAt` est le plus grand `effectiveAt` de l'apprenant ; « silencieux depuis » vaut `now − lastSeenAt`.

**Hors ligne reconstitué.** Pour une session réelle seulement : tout évènement dont `receivedAt − at` dépasse 60 secondes définit un intervalle `[at, receivedAt]` affiché comme période travaillée hors ligne ; les intervalles qui se chevauchent sont fusionnés. Pour une session simulée, cette reconstitution est désactivée, puisque `at` y est virtuel.

**Signal collectif.** Pour chaque triplet `(lab, step, checkId)`, les apprenants dont le dernier `check.completed` de l'étape liste ce check dans `failed`. Affiché à partir de `collectiveMinLearners` apprenants (défaut 3).

**Explications.** Tous les `answer.submitted`, avec l'état du dernier check de l'étape au moment de la soumission et le `correct` de la prédiction de l'étape, s'il y en a une.

**Environnement.** Le dernier `env.checked` de l'apprenant : `ok` si tous les checks le sont, sinon la liste des ids en échec.

**Points (0.6.0).** Une étape est acquise à la première `answer.submitted` dont le dernier `check.completed` précédent n'a aucun échec ; ses points valent la valeur de l'étape au catalogue (100 par défaut) diminuée de 10, 25 ou 50 % selon le plus haut `hint.revealed.level` antérieur, arrondis à l'entier inférieur. Règle et exemples : [`points/regle.md`](../points/regle.md), [`points/exemples.json`](../points/exemples.json). Aucun changement normatif.

## 7. Évolution

- Un ajout de champ optionnel, de valeur de `detail` ou de motif de rejet reste en `othila-lab/1`.
- Un nouveau type d'évènement reste en `othila-lab/1` si les consommateurs v1 peuvent l'ignorer sans fausser le tableau ; sinon `othila-lab/2`.
- Retirer, renommer ou changer le type d'un champ, ou rendre obligatoire un champ optionnel, exige `othila-lab/2`. Le serveur accepte alors les deux versions pendant une période de transition annoncée.
- Toute évolution est tracée dans ce document, avec sa date, dans la section « Historique ».

## 8. Historique

- **10 octobre 2026.** Le contrat et ses exemples rejoignent le dépôt public `othila-academy/lab-cli` et sont publiés dans le paquet `@othila-academy/lab` (0.7.0). Aucun changement de format ; la version reste `othila-lab/1`.
- **7 octobre 2026, version 0.6.0 du paquet.** Section 6 : dérivation des points (informative). Aucun changement de format ; la version reste `othila-lab/1`.
- **7 octobre 2026, console de sessions.** Section 3 : nouveau motif de rejet `session_closed` et règle de la session clôturée. Ajout d'un motif, la version reste `othila-lab/1` (section 7).
- **6 octobre 2026, revue du serveur.** Section 5 : précision pour les sessions `simulated`, `effectiveAt = at`. Clarification de la dérivation, sans changement de format pour les producteurs ; la version reste `othila-lab/1`.

## 9. Exemples

Un fichier par type dans [`exemples/`](exemples/), tous valides contre `othila-lab/1`. Exemple complet d'un `check.completed` :

```json
{
  "schema": "othila-lab/1",
  "id": "6f1c2d9e-3b4a-4c5d-8e7f-9a0b1c2d3e4f",
  "type": "check.completed",
  "session": "GQL-2026-10",
  "learner": "b7e2a1c4-5d6f-4a8b-9c0d-1e2f3a4b5c6d",
  "lab": "n1",
  "step": "observe",
  "at": "2026-10-13T09:42:17.512+02:00",
  "source": "reporter",
  "payload": {
    "durationMs": 1840,
    "passed": ["counter-exposed"],
    "failed": [
      {
        "id": "one-call-per-list",
        "label": "la liste des événements interroge le dépôt des utilisateurs une seule fois",
        "message": "11 accès au dépôt pour 10 événements : regarde la trace du serveur, puis Event.organizer"
      }
    ],
    "courseRef": "lab-n1-start-2-g3f9a1c",
    "stepDigest": "9b74c9897bac770ffc029102a200c5de3f3b2f0c3f1c2d9e3b4a4c5d8e7f9a0b"
  }
}
```
