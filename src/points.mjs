// La règle des points (points/regle.md). Le serveur othila-lab l'implémente aussi :
// points/exemples.json, rejoué des deux côtés, tient les deux calculs ensemble.
export const DEFAULT_STEP_POINTS = 100;
export const HINT_MALUS_PERCENT = [0, 10, 25, 50];

// Les points d'une étape acquise avec ce niveau d'indice : arithmétique entière, arrondi inférieur.
export function pointsFor(value, hintLevel) {
  const level = Math.min(Math.max(Math.trunc(hintLevel), 0), HINT_MALUS_PERCENT.length - 1);
  return Math.floor((value * (100 - HINT_MALUS_PERCENT[level])) / 100);
}

// Ce qui compte pour les points d'une étape, sur cette machine : { green, hintLevel, points? }.
// Les commandes check, hint et submit passent par ces trois fonctions ; stepPoints n'est que leur pli,
// et points/exemples.json le rejoue : les exemples partagés tiennent donc le vrai calcul.
export const applyCheck = (rec, green) => ({ ...rec, green });
export const applyHint = (rec, level) => ({ ...rec, hintLevel: Math.max(rec.hintLevel ?? 0, level) });
// Acquise à la première soumission faite pendant que l'étape est verte ; figée ensuite.
export function applySubmit(rec, value) {
  if (rec.points !== undefined || !rec.green) return rec;
  return { ...rec, points: pointsFor(value, rec.hintLevel ?? 0) };
}

// events : { type: 'check', green } | { type: 'hint', level } | { type: 'answer' }.
export function stepPoints(value, events) {
  let rec = { green: false, hintLevel: 0 };
  for (const e of events) {
    if (e.type === 'check') rec = applyCheck(rec, e.green);
    else if (e.type === 'hint') rec = applyHint(rec, e.level);
    else rec = applySubmit(rec, value);
  }
  return rec.points ?? 0;
}
