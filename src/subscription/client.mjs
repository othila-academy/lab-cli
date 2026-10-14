// Un client graphql-ws (protocole graphql-transport-ws) pour les checks, sur le WebSocket global de Node 22 :
// une connexion par abonnement, les messages en file, null quand rien n'arrive ou que tout est fini.
import { closedBeforeReady, handshakeRefused, noAck, unreachable } from './messages.mjs';

const PROTOCOL = 'graphql-transport-ws';
const ID = '1';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export const wsUrlOf = (url) => url.replace(/^http/, 'ws');
export const httpUrlOf = (url) => url.replace(/^ws/, 'http');

// Le serveur répond-il en HTTP ? Sépare un serveur arrêté d'un serveur sans WebSocket :
// le WebSocket de Node ne détaille pas un échec de connexion (error, puis 1006).
async function answers(httpUrl) {
  try {
    await fetch(httpUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query: '{ __typename }' }),
      signal: AbortSignal.timeout(2000)
    });
    return true;
  } catch {
    return false;
  }
}

async function explain(failure, url) {
  // Délai écoulé sans même ouvrir la connexion : c'est la poignée de main qui ne répond pas, pas graphql-ws.
  if (failure.timeout && failure.opened) return noAck(failure.timeout);
  if (!failure.opened) return (await answers(httpUrlOf(url))) ? handshakeRefused(url) : unreachable(httpUrlOf(url));
  return closedBeforeReady(failure.code, failure.reason);
}

// L'adresse d'un abonnement, contrôlée avant de l'ouvrir : le WebSocket de Node lèverait en anglais.
function checkedUrl(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`adresse WebSocket invalide : ${url}`);
  }
  if (parsed.protocol !== 'ws:' && parsed.protocol !== 'wss:') throw new Error(`adresse ws:// ou wss:// attendue, reçu : ${url}`);
  return url;
}

export async function subscribe(url, query, { variables, token, connectionParams, ready = 200, ackTimeout = 3000 } = {}) {
  checkedUrl(url);
  const params = { ...connectionParams, ...(token ? { authorization: `Bearer ${token}` } : {}) };
  const queue = [];
  const waiters = [];
  let done = false;
  let opened = false;
  let closed = null;

  const push = (item) => {
    const waiter = waiters.shift();
    if (waiter) waiter(item);
    else queue.push(item);
  };
  const finish = () => {
    done = true;
    while (waiters.length > 0) waiters.shift()(null);
  };

  let settle;
  const acked = new Promise((resolve, reject) => (settle = { resolve, reject }));
  const ws = new WebSocket(url, PROTOCOL);
  const send = (message) => ws.send(JSON.stringify(message));

  ws.addEventListener('open', () => {
    opened = true;
    send(Object.keys(params).length > 0 ? { type: 'connection_init', payload: params } : { type: 'connection_init' });
  });
  ws.addEventListener('message', (event) => {
    let message;
    try {
      message = JSON.parse(event.data);
    } catch {
      return;
    }
    // Un message qui n'est pas un objet (null, nombre) n'appartient pas au protocole : on l'ignore.
    if (!message || typeof message !== 'object') return;
    if (message.type === 'connection_ack') settle.resolve();
    else if (message.type === 'ping') send({ type: 'pong' });
    else if (message.id !== ID) return;
    else if (message.type === 'next') push(message.payload);
    else if (message.type === 'error') {
      push({ errors: message.payload });
      finish();
    } else if (message.type === 'complete') finish();
  });
  // Une connexion qui échoue avant d'ouvrir conclut sur error : Node 24 émet ensuite close (1006),
  // Node 22 non, la socket y reste « en connexion ». Après l'ouverture, c'est close qui conclut.
  ws.addEventListener('error', () => {
    if (!opened) settle.reject({ opened: false });
  });
  ws.addEventListener('close', (event) => {
    closed = { code: event.code, reason: event.reason };
    finish();
    settle.reject({ opened, code: event.code, reason: event.reason });
  });

  const timer = setTimeout(() => {
    settle.reject({ timeout: ackTimeout, opened });
    ws.close();
  }, ackTimeout);
  try {
    await acked;
  } catch (failure) {
    ws.close();
    throw new Error(await explain(failure, url));
  } finally {
    clearTimeout(timer);
  }

  send({ id: ID, type: 'subscribe', payload: { query, variables } });
  // graphql-ws n'accuse pas réception d'un subscribe : on laisse au serveur le temps d'écouter.
  await sleep(ready);
  // Fermée avant d'être prête (souvent un context qui lève côté serveur) : le dire, plutôt qu'un « rien reçu ».
  if (closed && queue.length === 0) throw new Error(closedBeforeReady(closed.code, closed.reason));

  return {
    get closed() {
      return closed;
    },
    // timeout : 3000 ms par défaut ; Infinity attend sans limite (setTimeout ramènerait Infinity à 1 ms).
    next(options) {
      const timeout = options?.timeout ?? 3000;
      if (queue.length > 0) return Promise.resolve(queue.shift());
      if (done) return Promise.resolve(null);
      return new Promise((resolve) => {
        const waiter = (item) => {
          clearTimeout(timer);
          resolve(item);
        };
        const timer =
          timeout === Infinity
            ? null
            : setTimeout(() => {
                waiters.splice(waiters.indexOf(waiter), 1);
                resolve(null);
              }, timeout);
        waiters.push(waiter);
      });
    },
    close() {
      if (ws.readyState === WebSocket.OPEN) {
        if (!done) send({ id: ID, type: 'complete' });
        ws.close(1000);
      }
      finish();
    }
  };
}
