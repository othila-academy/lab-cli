import { endpointUrl, formation } from '../config.mjs';
import { catalog, describeLab, listDrafts, listLabs } from '../labs.mjs';
import { publishFormation } from '../publish.mjs';
import { formatCatalog } from '../sheet.mjs';

// Un tableau pour un humain dans un terminal ; le JSON de create-session sinon (redirection, tests) ou avec --json.
// Avec --publish, le catalogue part au serveur othila-lab comme formation.
export async function run({ flags, io }) {
  if (flags.publish) return publish({ flags, io });
  if (flags.json || !io.isTTY) {
    io.out(JSON.stringify(await catalog(), null, 2));
    return 0;
  }
  const f = formation();
  const labs = [];
  for (const { id } of listLabs(f)) labs.push(await describeLab(id, f));
  // Un brouillon est en cours d'écriture : cassé, il est signalé, il ne fait pas tomber le tableau.
  const drafts = [];
  for (const id of listDrafts(f)) {
    try {
      drafts.push(await describeLab(id, f));
    } catch (error) {
      drafts.push({ id, broken: error.message });
    }
  }
  for (const line of formatCatalog(labs, drafts)) io.out(line);
  return 0;
}

async function publish({ flags, io }) {
  const key = process.env.FORMATEUR_KEY;
  if (!key) {
    io.err('--publish demande la clé formateur : FORMATEUR_KEY=… npx lab catalog --publish');
    return 3;
  }
  const f = formation(); // le manifeste garantit id et title ; son absence est rendue en code 3 par main
  const endpoint = flags.endpoint ? String(flags.endpoint) : endpointUrl();
  const { labs } = await catalog(f);
  let res;
  try {
    res = await publishFormation({ endpoint, key, formation: { id: f.id, title: f.title }, catalog: labs });
  } catch (error) {
    io.err(`serveur othila-lab injoignable sur ${endpoint} : ${error.message}`);
    return 2;
  }
  if (res.status === 401) {
    io.err('clé formateur refusée par le serveur othila-lab : vérifie FORMATEUR_KEY');
    return 1;
  }
  if (res.status !== 200 && res.status !== 201) {
    const issues = Array.isArray(res.json?.issues) && res.json.issues.length > 0 ? ` : ${res.json.issues.join(', ')}` : '';
    io.err(`publication refusée (HTTP ${res.status})${res.json?.error ? ` : ${res.json.error}` : ''}${issues}`);
    return 1;
  }
  const steps = labs.reduce((n, lab) => n + lab.steps.length, 0);
  io.out(`formation ${f.id} publiée : ${labs.length} lab(s), ${steps} étape(s)`);
  return 0;
}
