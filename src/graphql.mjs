// Aides GraphQL pour les checks : une requête HTTP, des assertions, l'attente du serveur.
export async function gql(url, query, { variables, token } = {}) {
  const headers = { 'content-type': 'application/json' };
  if (token) headers.authorization = `Bearer ${token}`;
  const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify({ query, variables }) });
  // Apollo Server 3 répond 400 aux erreurs de validation : le corps JSON reste exploitable.
  if (!res.ok && res.status !== 400) throw new Error(`HTTP ${res.status} sur ${url}`);
  return res.json();
}

export function assert(condition, label) {
  if (!condition) throw new Error(label);
}

export function expectData(result, label) {
  if (result.errors?.length) throw new Error(`${label} : erreurs inattendues ${JSON.stringify(result.errors)}`);
  return result.data;
}

export function expectErrorCode(result, code, label) {
  const got = result.errors?.[0]?.extensions?.code;
  if (got !== code) throw new Error(`${label} : code ${code} attendu, reçu ${got ?? 'aucune erreur'} (${JSON.stringify(result.errors ?? result.data)})`);
}

// Le serveur de l'apprenant ne répond pas : où le lancer, ou comment désigner une autre adresse.
export const unreachableMessage = (url) =>
  `injoignable sur ${url} : lance \`npm run start:server-js\` dans un autre terminal, ou précise --url`;

export async function loginAs(gqlFn, email, password = 'password123') {
  const data = expectData(
    await gqlFn('mutation Login($email: String!, $password: String!) { login(email: $email, password: $password) { token user { id name role } } }', { variables: { email, password } }),
    `login ${email}`
  );
  return data.login.token;
}

// Le serveur répond, mais par une erreur : son statut, et le début de sa réponse pour l'apprenant.
export const serverErrorMessage = (url, status, excerpt) =>
  `le serveur répond HTTP ${status} sur ${url}${excerpt ? ` (« ${excerpt} »)` : ''} : regarde la console du serveur`;

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
const decode = (text) =>
  text.replace(/&(#\d+|#x[0-9a-f]+|\w+);/gi, (entity, code) => {
    if (code[0] !== '#') return ENTITIES[code.toLowerCase()] ?? entity;
    return String.fromCodePoint(code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : Number(code.slice(1)));
  });

// Le début lisible d'une réponse en erreur : le message GraphQL s'il y en a un, sinon la première ligne du texte,
// hors de l'en-tête d'une page HTML (la page d'erreur d'Express a pour titre « Error »).
function excerptOf(text) {
  try {
    const message = JSON.parse(text)?.errors?.[0]?.message;
    if (typeof message === 'string') return message.slice(0, 200);
  } catch {
    // pas du JSON
  }
  const body = text.replace(/<head[\s\S]*?<\/head>/i, '').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]*>/g, '\n');
  const line = decode(body).split('\n').map((l) => l.trim()).find(Boolean) ?? '';
  return line.slice(0, 200);
}

// Un serveur qui répond par une erreur ne se répare pas en attendant : une seconde de réponses en erreur suffit.
// 502, 503 et 504 disent « pas encore prêt » (démarrage, mandataire devant un serveur arrêté) : on attend tout le délai.
const ERROR_GRACE_MS = 1000;
const NOT_READY = new Set([502, 503, 504]);

// Le serveur de l'apprenant est en local : fetch convient, aucun proxy n'est en jeu. Chaque essai est borné
// par le délai restant : un serveur qui ne répond jamais, ou ne finit pas sa réponse, ne bloque pas au-delà.
export async function waitForServer(url, timeoutMs = 15000) {
  const started = Date.now();
  let failing = null;
  while (Date.now() - started < timeoutMs) {
    const signal = AbortSignal.timeout(Math.max(1, timeoutMs - (Date.now() - started)));
    let res;
    try {
      res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ query: '{ __typename }' }), signal });
    } catch {
      failing = null; // pas encore prêt
    }
    if (res?.ok) return;
    if (res) {
      failing ??= { since: Date.now() };
      failing.status = res.status;
      failing.excerpt = excerptOf(await res.text().catch(() => ''));
      if (!NOT_READY.has(res.status) && Date.now() - failing.since >= ERROR_GRACE_MS) break;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  if (failing) {
    throw Object.assign(new Error(serverErrorMessage(url, failing.status, failing.excerpt)), {
      status: failing.status,
      excerpt: failing.excerpt
    });
  }
  throw new Error(`serveur injoignable sur ${url} après ${timeoutMs / 1000} s`);
}
