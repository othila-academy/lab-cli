import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { legacyLocalFiles, sandboxDir } from '../config.mjs';
import { describeLab, loadLab } from '../labs.mjs';
import { formatSheet } from '../sheet.mjs';

const USAGE = 'usage : lab start <lab>';

// Démarrer un lab, c'est lire sa fiche et préparer son gabarit : l'apprenant reste sur sa branche, sur son code.
export async function run({ positionals: [labId], io }) {
  if (!labId) throw new Error(USAGE);
  const lab = await loadLab(labId);

  // L'ancien jeton ne doit pas finir dans un commit de l'apprenant.
  const legacy = legacyLocalFiles();
  if (legacy.length > 0) {
    io.err(`ancien état local : ${legacy.join(', ')}. Il n'est plus lu ni ignoré par git, ne le commite pas : mv .othila-lab/state.json .othila-lab/local/ pour garder ta progression, supprime les autres fichiers, puis npx lab join`);
    return 1;
  }

  if (lab.mine && !existsSync(lab.mine.path)) {
    mkdirSync(path.dirname(lab.mine.path), { recursive: true });
    copyFileSync(path.join(lab.dir, lab.mine.template), lab.mine.path);
    io.out(`${path.relative(process.cwd(), lab.mine.path)} créé depuis le gabarit : c'est là que tu écris ton check`);
    io.out('');
  }
  // Lab intégré : ses fichiers de travail dans le bac à sable, jamais commités ni écrasés.
  for (const name of lab.sandbox) {
    const target = path.join(sandboxDir(lab.id), name);
    if (existsSync(target)) continue;
    mkdirSync(path.dirname(target), { recursive: true });
    copyFileSync(path.join(lab.dir, name), target);
    io.out(`${path.relative(process.cwd(), target)} créé : c'est ton fichier pour ce lab, ouvre-le dans ton éditeur`);
    io.out('');
  }
  for (const line of formatSheet(await describeLab(lab.id))) io.out(line);
  return 0;
}
