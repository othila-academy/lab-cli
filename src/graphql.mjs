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

// Le début lisible d'une réponse en erreur : le message GraphQL s'il y en a un, sinon la première ligne du texte.
function excerptOf(text) {
  try {
    const message = JSON.parse(text)?.errors?.[0]?.message;
    if (typeof message === 'string') return message.slice(0, 200);
  } catch {
    // pas du JSON
  }
  const line = text.replace(/<[^>]*>/g, '\n').split('\n').map((l) => l.trim()).find(Boolean) ?? '';
  return line.slice(0, 200);
}

// Un serveur qui répond par une erreur ne se répare pas en attendant : une seconde de réponses en erreur suffit.
const ERROR_GRACE_MS = 1000;

// Le serveur de l'apprenant est en local : fetch convient, aucun proxy n'est en jeu.
export async function waitForServer(url, timeoutMs = 15000) {
  const started = Date.now();
  let failing = null;
  while (Date.now() - started < timeoutMs) {
    try {
      const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ query: '{ __typename }' }) });
      if (res.ok) return;
      failing ??= { since: Date.now() };
      failing.status = res.status;
      failing.excerpt = excerptOf(await res.text());
      if (Date.now() - failing.since >= ERROR_GRACE_MS) break;
    } catch {
      failing = null; // pas encore prêt
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
