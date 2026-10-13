import { componentTest } from '@othila-academy/lab';

export const checks = [
  componentTest({ id: 'affiche', label: 'Bonjour affiche le nom', file: 'tests/bonjour.test.jsx' }),
  componentTest({ id: 'au-revoir', label: 'Bonjour dit au revoir', file: 'tests/bonjour.test.jsx' }),
  componentTest({ id: 'absent', label: 'Absent existe', file: 'tests/absent.test.jsx' })
];
