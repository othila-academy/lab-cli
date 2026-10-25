import { assert } from '../../src/index.mjs';
import { readCarnet } from './carnet.mjs';

export const title = 'Prédire avant de vérifier';
export const points = 10;
export const explain = "Ta prédiction était-elle juste, et qu'est-ce qui l'a tranchée ?";
export const instructions = `Le carnet doit lister tes objectifs pour la formation, dans objectifs.
Lance npx lab check prise-en-main predire : avant de le jouer, lab te pose une question et ses choix ; réponds par l'un
d'eux, au jugé. Le check dit ensuite si ta prédiction était juste.
Puis complète la liste jusqu'au vert, et termine : npx lab submit prise-en-main predire, à la question « Ta prédiction était-elle juste, et qu'est-ce qui l'a tranchée ? »`;

export const prediction = {
  promptId: 'prise-en-main-liste-vide',
  question: "Une liste d'objectifs vide, [], passe-t-elle le check ?",
  choices: ['oui', 'non'],
  expected: 'non'
};

const objectifs = () => readCarnet().objectifs;

export const checks = [
  {
    id: 'liste',
    label: 'objectifs est une liste',
    run: async () => assert(Array.isArray(objectifs()), 'objectifs doit être une liste : ["…"]')
  },
  {
    id: 'un-objectif',
    label: 'objectifs contient au moins un objectif',
    run: async () => {
      const list = objectifs();
      assert(Array.isArray(list), 'objectifs doit être une liste : ["…"]');
      assert(list.some((o) => typeof o === 'string' && o.trim() !== ''), 'la liste objectifs est vide : ajoute au moins un objectif, entre guillemets');
    }
  }
];
