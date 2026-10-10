// Même faux serveur, lançable en processus fils : lit PORT, comme le serveur du cours.
import http from 'node:http';

const port = Number(process.env.PORT ?? 0);
if (process.env.TINY_EXIT === '1') {
  console.error('je refuse de démarrer');
  process.exit(1);
}
http
  .createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ data: { __typename: 'Query' }, extensions: { othila: { repositoryCalls: Number(process.env.TINY_CALLS ?? 1) } } }));
  })
  .listen(port, '127.0.0.1', () => console.log(`prêt sur ${port}`));
