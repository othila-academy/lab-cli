// Config Vitest des checks de composants, passée par lab check avec --config. Elle reprend la config Vite du client
// (plugins, JSX) puis ne joue que les tests du lab, sous jsdom, avec l'alias @client et la préparation du cours.
// Paramètres : LAB_CLIENT_DIR, LAB_DIR, LAB_TEST_FILES (JSON, relatifs à LAB_DIR), LAB_SETUP (vide : aucune).
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const clientDir = process.env.LAB_CLIENT_DIR;
const labDir = process.env.LAB_DIR;
const files = JSON.parse(process.env.LAB_TEST_FILES);
const setup = process.env.LAB_SETUP || null;

// Vite tel que le Vitest du cours le voit : celui qui lira cette config.
const fromClient = createRequire(path.join(clientDir, 'package.json'));
const fromVitest = createRequire(fromClient.resolve('vitest/package.json'));
const vite = await import(pathToFileURL(fromVitest.resolve('vite')).href);

const loaded = await vite.loadConfigFromFile({ command: 'serve', mode: 'test' }, undefined, clientDir);
const merged = vite.mergeConfig(loaded?.config ?? {}, {
  root: clientDir,
  resolve: { alias: { '@client': clientDir } },
  server: { fs: { allow: [clientDir, labDir, ...(setup ? [path.dirname(setup)] : [])] } },
  test: { environment: 'jsdom', dir: labDir }
});
// mergeConfig concatène les listes : rien des tests ni de la préparation du client ne doit s'inviter.
merged.test.include = files;
merged.test.setupFiles = setup ? [setup] : [];
merged.test.exclude = ['**/node_modules/**'];
// Les réglages de test de l'étudiant qui changeraient ce qui tourne, ou planteraient avant les tests :
// projets, couverture, préparation globale, mode navigateur, vérification des types.
delete merged.test.projects;
delete merged.test.workspace;
merged.test.globalSetup = [];
merged.test.coverage = { enabled: false };
merged.test.browser = { enabled: false };
merged.test.typecheck = { enabled: false };

export default merged;
