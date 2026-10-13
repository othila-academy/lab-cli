// Faux serveur graphql-ws piloté par le test : HTTP répond { __typename } (waitForServer), WebSocket sur path,
// protocole graphql-transport-ws écrit à la main pour provoquer ce qu'un vrai serveur ne fait pas sur commande.
import http from 'node:http';
import { WebSocketServer } from 'ws';

export function startFakeWs({ path = '/graphql', ack = true, closeOnInit = null, onSubscribe = () => {} } = {}) {
  const log = { inits: [], subscribes: [], completes: [], pongs: 0 };
  const sockets = new Set();
  const server = http.createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ data: { __typename: 'Query' } }));
  });
  const wss = new WebSocketServer({
    server,
    path,
    handleProtocols: (protocols) => (protocols.has('graphql-transport-ws') ? 'graphql-transport-ws' : false)
  });
  wss.on('connection', (socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
    const send = (message) => socket.send(JSON.stringify(message));
    socket.on('message', (raw) => {
      const message = JSON.parse(String(raw));
      if (message.type === 'connection_init') {
        log.inits.push(message.payload ?? null);
        if (closeOnInit) socket.close(closeOnInit.code, closeOnInit.reason);
        else if (ack) send({ type: 'connection_ack' });
      } else if (message.type === 'subscribe') {
        log.subscribes.push({ ...message, at: Date.now() });
        onSubscribe({ send, id: message.id, socket, payload: message.payload });
      } else if (message.type === 'complete') log.completes.push(message.id);
      else if (message.type === 'pong') log.pongs += 1;
    });
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({
        url: `ws://127.0.0.1:${port}${path}`,
        httpUrl: `http://127.0.0.1:${port}${path}`,
        port,
        log,
        open: () => sockets.size,
        // Attend que toutes les connexions soient fermées ; true si c'est le cas avant ms.
        async drained(ms = 1000) {
          const until = Date.now() + ms;
          while (sockets.size > 0 && Date.now() < until) await new Promise((r) => setTimeout(r, 20));
          return sockets.size === 0;
        },
        close: () =>
          new Promise((done) => {
            for (const socket of sockets) socket.terminate();
            wss.close();
            server.close(() => done());
          })
      });
    });
  });
}
