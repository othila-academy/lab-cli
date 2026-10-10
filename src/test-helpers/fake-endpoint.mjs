import http from 'node:http';

// Faux serveur othila-lab : /api/health, POST /api/sessions, /api/sessions/:code/join, /api/events.
// `reject(event)` renvoie un motif pour rejeter un évènement, null sinon.
// `status` force le code de réponse de /api/events (503 pour simuler une base en panne).
// `sessionStatus` force celui de POST /api/sessions ; `boardSimulated` dit si la session lue par GET …/board est simulée.
// pairing : { created?, createStatus?, polls: [{ status, body }] } pour POST /api/pairings et GET /api/pairings/p-1 ; le dernier poll se répète.
export function startFakeEndpoint({ reject = () => null, status = 200, health = true, join = 'ok', delayMs = 0, sessionStatus = 201, boardSimulated = true, formationStatus = 201, pairing = null } = {}) {
  const batches = [];
  const sessions = [];
  const joins = [];
  const formations = [];
  const pairingPolls = [];
  let requests = 0;
  const server = http.createServer((req, res) => {
    requests += 1;
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      const send = (code, payload) => {
        setTimeout(() => {
          res.writeHead(code, { 'content-type': 'application/json' });
          res.end(JSON.stringify(payload));
        }, delayMs);
      };
      if (req.method === 'GET' && req.url === '/api/health') return send(health ? 200 : 503, { ok: health, version: 'othila-lab/1' });
      if (req.method === 'POST' && req.url === '/api/sessions') {
        sessions.push({ body: JSON.parse(body), authorization: req.headers.authorization });
        return send(sessionStatus, sessionStatus === 201 ? { code: JSON.parse(body).code } : { error: sessionStatus === 401 ? 'clé formateur attendue' : 'ce code de session existe déjà' });
      }
      if (req.method === 'GET' && /^\/api\/sessions\/[^/]+\/board$/.test(req.url)) return send(200, { session: { simulated: boardSimulated } });
      if (req.method === 'PUT' && /^\/api\/formations\/[^/]+$/.test(req.url)) {
        const id = decodeURIComponent(req.url.split('/').pop());
        const payload = JSON.parse(body);
        formations.push({ id, body: payload, authorization: req.headers.authorization });
        if (formationStatus === 401) return send(401, { error: 'clé formateur attendue' });
        if (formationStatus === 400) return send(400, { error: 'corps invalide', issues: ['catalog.0.steps.0.points: Too big'] });
        return send(formationStatus, { id, title: payload.title, labs: payload.catalog.length, steps: payload.catalog.reduce((n, l) => n + l.steps.length, 0) });
      }
      if (req.method === 'POST' && /^\/api\/sessions\/[^/]+\/join$/.test(req.url)) {
        if (join === '404') return send(404, { error: 'session inconnue' });
        const { firstName } = JSON.parse(body);
        joins.push(firstName);
        return send(200, { learnerId: '00000000-0000-4000-8000-000000000001', token: 'jeton-de-test', firstName });
      }
      if (req.method === 'POST' && req.url === '/api/events') {
        const events = JSON.parse(body);
        batches.push({ events, authorization: req.headers.authorization, via: req.headers.via ?? null });
        if (status !== 200) return send(status, { error: 'simulé' });
        const rejected = events.map((e) => ({ id: e.id, reason: reject(e) })).filter((r) => r.reason);
        const rejectedIds = new Set(rejected.map((r) => r.id));
        return send(200, { accepted: events.filter((e) => !rejectedIds.has(e.id)).map((e) => e.id), rejected });
      }
      if (req.method === 'POST' && req.url === '/api/pairings') {
        if (!pairing) return send(404, { error: 'route inconnue' });
        if (pairing.createStatus && pairing.createStatus !== 201) return send(pairing.createStatus, { error: 'simulé' });
        return send(201, { pairingId: 'p-1', userCode: 'KQ7M-4TXP', secret: 'secret-de-test', verifyPath: '/rejoindre', interval: 2, expiresIn: 600, ...pairing.created });
      }
      if (req.method === 'GET' && req.url === '/api/pairings/p-1') {
        pairingPolls.push(req.headers.authorization ?? null);
        const next = pairing.polls.length > 1 ? pairing.polls.shift() : pairing.polls[0];
        return send(next.status, next.body);
      }
      return send(404, { error: 'route inconnue' });
    });
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      resolve({
        url: `http://127.0.0.1:${server.address().port}`,
        batches,
        sessions,
        joins,
        formations,
        pairingPolls,
        requests: () => requests,
        close: () => new Promise((done) => server.close(done))
      });
    });
  });
}
