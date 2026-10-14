// Présentation d'un lab dans le terminal : sa fiche (lab start, lab show) et le catalogue en tableau.

const width = (s) => [...s].length;
const padEnd = (s, n) => s + ' '.repeat(Math.max(0, n - width(s)));
const padStart = (s, n) => ' '.repeat(Math.max(0, n - width(s))) + s;
const cut = (s, n) => (width(s) > n ? `${[...s].slice(0, n - 1).join('')}…` : s);
const linesOf = (text) => String(text).split('\n').map((l) => l.trimEnd());

// La fiche : en-tête, contexte, objectifs, puis chaque étape avec sa consigne et ce qui sera vérifié.
// Avec { step }, une seule étape, à sa position dans le lab.
export function formatSheet(lab, { step } = {}) {
  let shown = lab.steps.map((s, i) => ({ s, n: i + 1 }));
  if (step) {
    shown = shown.filter(({ s }) => s.id === step);
    if (shown.length === 0) throw new Error(`étape inconnue : ${step} (étapes de ${lab.id} : ${lab.steps.map((s) => s.id).join(', ')})`);
  }
  const out = [[lab.title, lab.seance ?? 'hors formation', lab.duration].filter(Boolean).join(' · ')];
  if (!step) {
    if (lab.summary) out.push('', ...linesOf(lab.summary));
    if (lab.objectives?.length) out.push('', 'Objectifs', ...lab.objectives.map((o) => `  • ${o}`));
  }
  for (const { s, n } of shown) {
    out.push('', `Étape ${n}/${lab.steps.length} · ${s.id} · ${s.title}${s.points ? ` (${s.points} points)` : ''}`);
    if (s.instructions) out.push(...linesOf(s.instructions).map((l) => `  ${l}`));
    out.push('  Ce qui sera vérifié :', ...s.checks.map((c) => `    □ ${c.label}`));
  }
  out.push('', `Ensuite : npx lab check ${lab.id} ${shown[0].s.id}`);
  return out;
}

const HEAD = ['Lab', 'Titre', 'Étapes', 'Checks', 'Points', 'Durée'];
const RIGHT = [false, false, true, true, true, false];
export const DRAFTS_TITLE = 'Hors formation · brouillons, jamais publiés';

// Le catalogue en tableau, groupé par séance dans l'ordre du manifeste, puis les brouillons.
// Colonnes alignées sur tout le tableau ; un tiret pour un champ que le lab ne renseigne pas.
export function formatCatalog(labs, drafts = []) {
  const rows = [...labs, ...drafts].map((l) => (l.broken ? [l.id, '', '', '', '', ''] : [
    l.id,
    cut(l.title, 40),
    String(l.steps.length),
    String(l.steps.reduce((n, s) => n + s.checks.length, 0)),
    String(l.steps.reduce((n, s) => n + (s.points ?? 100), 0)),
    l.duration ?? '—'
  ]));
  const widths = HEAD.map((h, i) => Math.max(width(h), ...rows.map((r) => width(r[i]))));
  const line = (cells) => `  ${cells.map((c, i) => (RIGHT[i] ? padStart(c, widths[i]) : padEnd(c, widths[i]))).join('  ')}`.trimEnd();
  const out = [`Labs du cours · ${labs.length}`, '', line(HEAD)];
  let current;
  labs.forEach((lab, i) => {
    if (lab.seance !== current) {
      current = lab.seance;
      out.push('', current);
    }
    out.push(line(rows[i]));
  });
  if (drafts.length > 0) out.push('', DRAFTS_TITLE, ...drafts.map((d, i) => (d.broken ? `  ${padEnd(d.id, widths[0])}  illisible : ${d.broken}` : line(rows[labs.length + i]))));
  out.push('', "Détail d'un lab : npx lab show <lab>");
  return out;
}
