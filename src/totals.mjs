import { catalogLabs, describeLab } from './labs.mjs';

// Les points de cette machine, lab par lab et pour toute la formation, sur leur maximum.
export async function totals(f, state) {
  const labs = new Map();
  let points = 0;
  let max = 0;
  for (const { id } of catalogLabs(f)) {
    const lab = await describeLab(id, f);
    const entry = { points: 0, max: 0 };
    for (const s of lab.steps) {
      entry.max += s.points;
      entry.points += state.steps[`${id}/${s.id}`]?.points ?? 0;
    }
    labs.set(id, entry);
    points += entry.points;
    max += entry.max;
  }
  return { labs, points, max };
}
