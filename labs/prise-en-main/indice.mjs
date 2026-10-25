import { assert } from '../../src/index.mjs';
import { readCarnet } from './carnet.mjs';

export const title = "Demander de l'aide";
export const points = 10;
export const explain = 'Quand vaut-il mieux demander un indice que chercher seul ?';
export const instructions = `Le carnet doit donner ta date d'arrivée en formation, dans arrivee, au format attendu. Le message d'échec n'en dit pas plus, exprès.
Bloqué ? npx lab hint prise-en-main indice révèle un indice ; son coût en points est annoncé avant. Puis npx lab progress montre tes points.
Pour finir : npx lab submit prise-en-main indice, à la question « Quand vaut-il mieux demander un indice que chercher seul ? »`;

export const hints = [
  'Quel format de date ne confond jamais le jour et le mois ?',
  "La norme internationale : l'année, le mois, puis le jour.",
  '"2026-10-14" : année, mois et jour, séparés par des tirets.'
];

// Une date AAAA-MM-JJ qui existe au calendrier (le 30 février ne passe pas).
const isoDate = (value) => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
};

export const checks = [
  {
    id: 'date',
    label: "arrivee donne la date d'arrivée au format attendu",
    run: async () => {
      const { arrivee } = readCarnet();
      assert(arrivee !== undefined && arrivee !== '', 'arrivee manque : la date de ton arrivée en formation');
      assert(isoDate(arrivee), 'arrivee est au mauvais format');
    }
  }
];
