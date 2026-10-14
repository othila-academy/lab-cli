import { assert } from '../../src/index.mjs';
import { carnetText, errorPlace, readCarnet } from './carnet.mjs';

export const title = 'Lire un échec et corriger';
export const points = 10;
export const instructions = `lab start a créé ton carnet ; son chemin est affiché au-dessus de la fiche. Lance npx lab check prise-en-main reparer : il échoue.
Lis le message : il dit où regarder et quoi faire. Corrige le carnet dans ton éditeur, relance, jusqu'au vert.
Pour finir : npx lab submit prise-en-main reparer, à la question « Qu'est-ce que le message d'échec t'a dit de faire ? »`;

export const checks = [
  {
    id: 'lisible',
    label: 'le carnet se lit (JSON valide)',
    run: async () => {
      const text = carnetText();
      try {
        JSON.parse(text);
      } catch (error) {
        const at = errorPlace(text, error);
        const where = at ? ` (ligne ${at.line}, colonne ${at.column})` : '';
        throw new Error(`carnet.json ne se lit pas${where} : regarde juste avant cet endroit ; une virgule de trop avant } ou ] ?`);
      }
    }
  },
  {
    id: 'prenom',
    label: 'prenom est renseigné',
    run: async () => {
      const { prenom } = readCarnet("le carnet ne se lit pas encore : corrige d'abord l'erreur de lecture signalée au-dessus");
      assert(typeof prenom === 'string', 'prenom doit être un texte entre guillemets, par exemple "Ada"');
      assert(prenom.trim() !== '', 'prenom est vide : écris ton prénom entre les guillemets');
    }
  }
];
