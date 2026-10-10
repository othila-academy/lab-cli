import { assert, expectData } from '@othila-academy/lab';

export const title = 'Une étape';
export const instructions = `Lance le check de l'étape.
Observe celui qui échoue.`;
export const prediction = { promptId: 'demo-count', question: 'Combien ?', choices: ['1', '2'], expected: '2' };
export const checks = [
  {
    id: 'typename',
    label: '__typename répond',
    passesOnStart: true,
    run: async ({ gql }) => {
      const data = expectData(await gql('{ __typename }'), '__typename');
      assert(data.__typename === 'Query', 'pas de __typename');
    }
  },
  {
    id: 'always-fails',
    label: 'un check qui échoue',
    run: async () => {
      throw new Error('échec attendu');
    }
  }
];
export const hints = ['indice un', 'indice deux', 'indice trois'];
