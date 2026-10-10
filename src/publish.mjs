import { putJson } from './http.mjs';

// Publie le catalogue du cours comme formation : la console du formateur y choisit le catalogue d'une session.
export function publishFormation({ endpoint, key, formation, catalog }) {
  return putJson(
    `${endpoint}/api/formations/${encodeURIComponent(formation.id)}`,
    { title: formation.title, catalog },
    { headers: { authorization: `Bearer ${key}` }, timeoutMs: 5000 }
  );
}
