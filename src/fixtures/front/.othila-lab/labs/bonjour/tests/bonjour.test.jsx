import { render, screen } from '@testing-library/react';
import { expect, test } from 'vitest';
import Bonjour from '@client/src/Bonjour.jsx';

test('affiche', () => {
  render(<Bonjour nom="Ada" />);
  expect(screen.queryByText('Bonjour Ada'), 'Bonjour Ada n’apparaît pas').not.toBeNull();
});

test('au-revoir', () => {
  render(<Bonjour nom="Ada" />);
  expect(screen.queryByText('Au revoir'), 'Le composant ne dit pas au revoir').not.toBeNull();
});
