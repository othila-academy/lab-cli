import { describeLab } from '../labs.mjs';
import { formatSheet } from '../sheet.mjs';

const USAGE = 'usage : lab show <lab> [étape]';

// La fiche d'un lab, à tout moment, sans toucher à git : contexte, objectifs, consignes, ce qui sera vérifié.
export async function run({ positionals: [labId, stepId], io }) {
  if (!labId) throw new Error(USAGE);
  for (const line of formatSheet(await describeLab(labId), { step: stepId })) io.out(line);
  return 0;
}
