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

export async function loginAs(gqlFn, email, password = 'password123') {
  const data = expectData(
    await gqlFn('mutation Login($email: String!, $password: String!) { login(email: $email, password: $password) { token user { id name role } } }', { variables: { email, password } }),
    `login ${email}`
  );
  return data.login.token;
}

// Le serveur de l'apprenant est en local : fetch convient, aucun proxy n'est en jeu.
export async function waitForServer(url, timeoutMs = 15000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ query: '{ __typename }' }) });
      if (res.ok) return;
    } catch {
      // pas encore prêt
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`serveur injoignable sur ${url} après ${timeoutMs / 1000} s`);
}
