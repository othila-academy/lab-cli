import http from 'node:http';

// Faux serveur GraphQL : répond { data: { __typename: 'Query' } } à tout, avec un journal des requêtes.
export function startFakeGraphql(respond = () => ({ data: { __typename: 'Query' } })) {
  const queries = [];
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      const { query } = body ? JSON.parse(body) : {};
      queries.push(query);
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(respond(query)));
    });
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      resolve({ url: `http://127.0.0.1:${server.address().port}/graphql`, queries, close: () => new Promise((done) => server.close(done)) });
    });
  });
}
