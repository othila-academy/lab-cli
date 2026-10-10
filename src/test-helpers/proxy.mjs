import http from 'node:http';
import net from 'node:net';

// Proxy HTTP minimal (même mécanique que le spike 1) : relais en clair avec en-tête Via,
// tunnel CONNECT. `log` garde une ligne par requête : c'est la preuve du passage.
export function startProxy() {
  const log = [];
  const server = http.createServer((req, res) => {
    const target = new URL(req.url);
    log.push(`${req.method} ${target.href}`);
    const headers = { ...req.headers, via: 'proxy-de-test' };
    delete headers['proxy-connection'];
    const upstream = http.request(
      { hostname: target.hostname, port: target.port || 80, path: target.pathname + target.search, method: req.method, headers },
      (up) => {
        res.writeHead(up.statusCode, up.headers);
        up.pipe(res);
      }
    );
    upstream.on('error', (error) => {
      res.writeHead(502);
      res.end(error.message);
    });
    req.pipe(upstream);
  });
  server.on('connect', (req, clientSocket, head) => {
    const [host, port] = req.url.split(':');
    log.push(`CONNECT ${req.url}`);
    const upstream = net.connect(Number(port || 443), host, () => {
      clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      upstream.write(head);
      upstream.pipe(clientSocket);
      clientSocket.pipe(upstream);
    });
    upstream.on('error', () => clientSocket.end());
    clientSocket.on('error', () => upstream.end());
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      resolve({ url: `http://127.0.0.1:${server.address().port}`, log, close: () => new Promise((done) => server.close(done)) });
    });
  });
}
