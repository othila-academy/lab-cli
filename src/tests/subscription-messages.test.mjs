import { test } from 'node:test';
import assert from 'node:assert/strict';
import { unreachableMessage } from '../graphql.mjs';
import { closedBeforeReady, handshakeRefused, noAck, unreachable } from '../subscription/messages.mjs';

test('injoignable : la formule de lab check, partagée', () => {
  assert.equal(
    unreachableMessage('http://localhost:4000/graphql'),
    'injoignable sur http://localhost:4000/graphql : lance `npm run start:server-js` dans un autre terminal, ou précise --url'
  );
  assert.equal(
    unreachable('http://localhost:4000/graphql'),
    'serveur injoignable sur http://localhost:4000/graphql : lance `npm run start:server-js` dans un autre terminal, ou précise --url'
  );
});

test('poignée de main refusée : l’adresse WebSocket et la piste graphql-ws', () => {
  assert.equal(
    handshakeRefused('ws://localhost:4000/graphql'),
    'Le serveur ne répond pas en WebSocket sur ws://localhost:4000/graphql : as-tu ouvert un serveur WebSocket (graphql-ws) sur ce chemin, branché sur le même serveur HTTP ?'
  );
});

test('pas de connection_ack : le délai en secondes, virgule décimale', () => {
  assert.equal(
    noAck(3000),
    "Le serveur WebSocket n'a pas accepté la connexion en 3 s (connection_ack attendu) : useServer({ schema }, wsServer) est-il appelé ?"
  );
  assert.match(noAck(200), /en 0,2 s/);
});

test('fermeture avant l’abonnement : 4403, 4406, autre code avec ou sans raison', () => {
  assert.equal(
    closedBeforeReady(4403, 'Forbidden'),
    "Le serveur WebSocket refuse la connexion (4403) : onConnect l'a-t-il rejetée ? Il reçoit les connectionParams."
  );
  assert.equal(
    closedBeforeReady(4406, 'Subprotocol not acceptable'),
    "Le serveur WebSocket ne parle pas graphql-transport-ws : utilise graphql-ws (useServer), pas l'ancien subscriptions-transport-ws."
  );
  assert.equal(closedBeforeReady(4400, 'Bad'), "Le serveur WebSocket a fermé la connexion (code 4400 : Bad) avant l'abonnement.");
  assert.equal(closedBeforeReady(1011, ''), "Le serveur WebSocket a fermé la connexion (code 1011) avant l'abonnement.");
});
