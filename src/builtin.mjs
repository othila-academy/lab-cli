// Les labs fournis par lab-cli : présents dans tout dépôt de cours, en séance 0, hors de la chaîne (pas de tag de solution).
import { fileURLToPath } from 'node:url';

export const BUILTIN_DIR = fileURLToPath(new URL('../labs/', import.meta.url));
export const BUILTIN_IDS = ['prise-en-main'];
export const BUILTIN_SEANCE = 'Séance 0 · Prise en main';
export const isBuiltin = (id) => BUILTIN_IDS.includes(id);
export const reservedMessage = (id) => `${id} est un lab fourni par lab-cli : renomme le lab du cours (.othila-lab/labs/${id}/ et formation.json)`;
