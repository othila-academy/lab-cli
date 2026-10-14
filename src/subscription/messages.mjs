// Ce qui empêche un abonnement d'exister, dit à l'apprenant. Le reste (rien reçu, erreurs GraphQL,
// connexion coupée ensuite) appartient au check, qui connaît le scénario.
import { unreachableMessage } from '../graphql.mjs';

export const unreachable = (httpUrl) => `serveur ${unreachableMessage(httpUrl)}`;

export const handshakeRefused = (wsUrl) =>
  `Le serveur ne répond pas en WebSocket sur ${wsUrl} : as-tu ouvert un serveur WebSocket (graphql-ws) sur ce chemin, branché sur le même serveur HTTP ?`;

const seconds = (ms) => String(ms / 1000).replace('.', ',');

export const noAck = (ms) =>
  `Le serveur WebSocket n'a pas accepté la connexion en ${seconds(ms)} s (connection_ack attendu) : useServer({ schema }, wsServer) est-il appelé ?`;

export function closedBeforeReady(code, reason) {
  if (code === 4403)
    return "Le serveur WebSocket refuse la connexion (4403) : onConnect l'a-t-il rejetée ? Il reçoit les connectionParams.";
  if (code === 4406)
    return "Le serveur WebSocket ne parle pas graphql-transport-ws : utilise graphql-ws (useServer), pas l'ancien subscriptions-transport-ws.";
  return `Le serveur WebSocket a fermé la connexion (code ${code}${reason ? ` : ${reason}` : ''}) avant l'abonnement.`;
}
