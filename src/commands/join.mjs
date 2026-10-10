import { endpointUrl, ensureGitignore, localDir, saveSession } from '../config.mjs';
import { openBrowser } from '../browser.mjs';
import { getJson, postJson } from '../http.mjs';

const value = async (flag, io, prompt) => String(flag ?? (await io.question(prompt))).trim();
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// lab join : par le navigateur dans un terminal interactif, sur le modèle de gh auth login ;
// au terminal avec --terminal, avec une option de saisie, ou sans terminal interactif (scripts, simulateur).
export async function run({ flags, io, deps = {} }) {
  const endpoint = flags.endpoint ?? endpointUrl();
  const typed = flags.terminal || flags.session !== undefined || flags.email !== undefined || flags.name !== undefined;
  if (typed || !io.isTTY) return joinByTerminal({ flags, io, endpoint });
  return joinByBrowser({ io, endpoint, deps });
}

function welcome(io, endpoint, joined) {
  saveSession({ endpoint, session: joined.session, learnerId: joined.learnerId, token: joined.token, firstName: joined.firstName });
  if (ensureGitignore()) io.out('.othila-lab/.gitignore : local/ ajouté, ton jeton reste hors de git');
  io.out(`bienvenue ${joined.firstName}, session ${joined.session}. Jeton enregistré dans ${localDir()}.`);
  return 0;
}

async function joinByTerminal({ flags, io, endpoint }) {
  const session = (await value(flags.session, io, 'code de session :')).toUpperCase();
  const email = await value(flags.email, io, 'e-mail :');
  const firstName = await value(flags.name, io, 'prénom :');
  if (!session || !email || !firstName) {
    io.err('code de session, e-mail et prénom sont obligatoires');
    return 3;
  }

  let res;
  try {
    res = await postJson(`${endpoint}/api/sessions/${encodeURIComponent(session)}/join`, { email, firstName }, { timeoutMs: 5000 });
  } catch (error) {
    io.err(`impossible de joindre ${endpoint} : ${error.message}`);
    return 2;
  }
  if (res.status === 404) {
    io.err(`session ${session} inconnue : vérifie le code au tableau`);
    return 1;
  }
  if (res.status !== 200 || !res.json?.token) {
    io.err(`inscription refusée (HTTP ${res.status})${res.json?.error ? ` : ${res.json.error}` : ''}`);
    return 1;
  }
  return welcome(io, endpoint, { session, ...res.json });
}

async function joinByBrowser({ io, endpoint, deps }) {
  // Injectables pour les tests : navigateur, attente, horloge, client HTTP.
  const open = deps.open ?? openBrowser;
  const sleep = deps.sleep ?? delay;
  const now = deps.now ?? Date.now;
  const fetchJson = deps.getJson ?? getJson;

  let created;
  try {
    created = await postJson(`${endpoint}/api/pairings`, {}, { timeoutMs: 5000 });
  } catch (error) {
    io.err(`impossible de joindre ${endpoint} : ${error.message}`);
    return 2;
  }
  if (created.status === 404) {
    // Un serveur antérieur à la 0.6.0 : pas d'appairage, la salle ne doit pas rester bloquée.
    io.out('ce serveur ne propose pas la jonction par le navigateur : saisie au terminal');
    return joinByTerminal({ flags: {}, io, endpoint });
  }
  if (created.status !== 201 || !created.json?.pairingId) {
    io.err(`jonction refusée (HTTP ${created.status})${created.json?.error ? ` : ${created.json.error}` : ''}`);
    return 1;
  }

  const { pairingId, userCode, secret, verifyPath, interval, expiresIn } = created.json;
  const url = `${endpoint}${verifyPath}?code=${encodeURIComponent(userCode)}`;
  io.out(`Code de jonction : ${userCode}`);
  io.out(`Ouvre ${url}`);
  // xdg-open peut se lancer sans rien ouvrir (SSH sans affichage) : le rappel reste toujours affiché.
  io.out((await open(url)) ? 'Sans navigateur sur ce poste : npx lab join --terminal' : "navigateur impossible à ouvrir : ouvre l'adresse ci-dessus, ou npx lab join --terminal");
  io.out('En attente du formulaire… (Ctrl-C pour abandonner)');

  // L'échéance se compte en temps : des interrogations lentes ne la repoussent pas.
  const deadline = now() + expiresIn * 1000;
  while (now() < deadline) {
    await sleep(interval * 1000);
    let res;
    try {
      res = await fetchJson(`${endpoint}/api/pairings/${encodeURIComponent(pairingId)}`, { headers: { authorization: `Bearer ${secret}` }, timeoutMs: 5000 });
    } catch {
      continue; // réseau intermittent : on réessaie jusqu'à l'expiration
    }
    if (res.status === 200 && res.json?.status === 'pending') continue;
    if (res.status === 200 && res.json?.status === 'joined') return welcome(io, endpoint, res.json);
    if (res.status >= 500) continue; // serveur ou proxy en difficulté : même traitement qu'une coupure réseau
    if (res.status === 410) {
      // Le serveur dit pourquoi (expirée, déjà utilisée) ; à défaut, c'est le délai.
      io.err(res.json?.error ? `${res.json.error} : relance npx lab join` : 'délai dépassé, relance npx lab join');
      return 1;
    }
    if (res.status === 401) {
      io.err('jonction refusée : relance npx lab join');
      return 1;
    }
    io.err(res.json?.error ?? `jonction refusée (HTTP ${res.status})`);
    return 1;
  }
  io.err('délai dépassé, relance npx lab join');
  return 1;
}
