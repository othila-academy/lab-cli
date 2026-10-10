// Un lab est un dossier de .othila-lab/labs/ : index.mjs (titre, étapes) et un module par étape.
// Le manifeste de la formation donne l'ordre et la séance ; un lab qu'il ne cite pas est un brouillon.
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { formation } from './config.mjs';
import { DEFAULT_STEP_POINTS } from './points.mjs';

const SLUG = /^[a-z0-9][a-z0-9-]{0,63}$/;
const load = (file) => import(pathToFileURL(file).href);
const text = (value) => (typeof value === 'string' && value.trim() ? value.trim() : null);

// Les labs de la formation, dans l'ordre du manifeste, chacun avec le titre de sa séance.
export const listLabs = (f = formation()) => f.seances.flatMap((s) => s.labs.map((id) => ({ id, seance: s.title })));

// Les brouillons : un dossier de lab valide que le manifeste ne cite pas. Jamais publiés.
export function listDrafts(f = formation()) {
  if (!existsSync(f.labsDir)) return [];
  const listed = new Set(listLabs(f).map((l) => l.id));
  return readdirSync(f.labsDir)
    .filter((name) => SLUG.test(name) && !listed.has(name) && existsSync(path.join(f.labsDir, name, 'index.mjs')))
    .sort();
}

// Le check que l'apprenant écrit : template est relatif au dossier du lab, target à la racine du dépôt.
function mineOf(mine, index, root) {
  if (mine === undefined || mine === null) return null;
  if (!text(mine.template)) throw new Error(`${index} : mine.template doit nommer le gabarit, dans le dossier du lab`);
  if (!text(mine.target)) throw new Error(`${index} : mine.target doit donner un chemin relatif à la racine du dépôt`);
  const target = path.resolve(root, mine.target);
  const inside = path.relative(root, target);
  if (path.isAbsolute(mine.target) || inside === '' || inside.startsWith('..') || path.isAbsolute(inside)) {
    throw new Error(`${index} : mine.target doit rester dans le dépôt du cours (chemin relatif à sa racine) : ${mine.target}`);
  }
  if (!/\.(mjs|js)$/.test(mine.target)) throw new Error(`${index} : mine.target doit nommer un module .mjs ou .js : ${mine.target}`);
  return { template: mine.template, target: mine.target, path: target };
}

export async function loadLab(id, f = formation()) {
  const labPath = path.join(f.labsDir, id);
  const index = path.join(labPath, 'index.mjs');
  if (!SLUG.test(id) || !existsSync(index)) {
    const known = [...listLabs(f).map((l) => l.id), ...listDrafts(f)];
    throw new Error(`lab inconnu : ${id} (disponibles : ${known.join(', ') || 'aucun'})`);
  }
  const mod = await load(index);
  if (!mod.title || !Array.isArray(mod.steps) || mod.steps.length === 0) throw new Error(`${index} doit exporter title et steps`);
  if (mod.section !== undefined) throw new Error(`${index} : section a migré dans .othila-lab/formation.json (seances)`);
  // Champs facultatifs de la fiche du lab, affichés par lab start et lab show.
  const objectives = mod.objectives ?? [];
  if (!Array.isArray(objectives) || objectives.some((o) => typeof o !== 'string')) throw new Error(`${index} : objectives doit être une liste de phrases`);
  return {
    id,
    title: mod.title,
    steps: mod.steps,
    dir: labPath,
    mine: mineOf(mod.mine, index, f.root),
    seance: listLabs(f).find((l) => l.id === id)?.seance ?? null,
    duration: text(mod.duration),
    summary: text(mod.summary),
    objectives
  };
}

export async function loadStep(lab, stepId) {
  if (!lab.steps.includes(stepId)) throw new Error(`étape inconnue : ${stepId} (étapes de ${lab.id} : ${lab.steps.join(', ')})`);
  const file = path.join(lab.dir, `${stepId}.mjs`);
  const mod = await load(file);
  const checks = Array.isArray(mod.checks) ? mod.checks : [];
  if (checks.length === 0 || checks.some((c) => !c.id || !c.label || typeof c.run !== 'function')) {
    throw new Error(`${file} : checks doit être une liste non vide de { id, label, run }`);
  }
  const hints = Array.isArray(mod.hints) ? mod.hints : [];
  if (hints.length > 3) throw new Error(`${file} : trois indices au plus (le contrat limite hint.revealed.level à 3)`);
  const instructions = typeof mod.instructions === 'string' && mod.instructions.trim() ? mod.instructions.trim() : null;
  const points = mod.points ?? DEFAULT_STEP_POINTS;
  if (!Number.isInteger(points) || points < 1 || points > 1000) throw new Error(`${file} : points : entier de 1 à 1000 attendu (valeur de l'étape)`);
  return { id: stepId, title: mod.title ?? stepId, instructions, checks, hints, prediction: mod.prediction ?? null, points, file };
}

// Empreinte du module d'étape, envoyée dans check.completed (contrat 4.3, stepDigest).
export const stepDigest = (file) => createHash('sha256').update(readFileSync(file)).digest('hex');

// La fiche d'un lab : ses champs et, pour chaque étape, sa consigne et les libellés de ses checks.
export async function describeLab(id, f = formation()) {
  const lab = await loadLab(id, f);
  const steps = [];
  for (const stepId of lab.steps) {
    const step = await loadStep(lab, stepId);
    steps.push({ id: step.id, title: step.title, instructions: step.instructions, checks: step.checks.map((c) => ({ id: c.id, label: c.label })), points: step.points });
  }
  return { ...lab, steps };
}

// Le catalogue publié comme formation ou passé à create-session : les labs du manifeste, dans l'ordre.
export async function catalog(f = formation()) {
  const labs = [];
  for (const { id } of listLabs(f)) {
    const lab = await loadLab(id, f);
    const steps = [];
    for (const stepId of lab.steps) {
      const step = await loadStep(lab, stepId);
      steps.push({ id: step.id, title: step.title, checks: step.checks.map((c) => ({ id: c.id, label: c.label })), hasPrediction: Boolean(step.prediction), points: step.points });
    }
    labs.push({ id: lab.id, title: lab.title, seance: lab.seance, steps });
  }
  return { labs };
}
