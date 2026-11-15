// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '../../test/renderWithProviders';
import LanguageCard from './LanguageCard';

describe('LanguageCard', () => {
  it('renderiza y muestra su título', () => {
    renderWithProviders(<LanguageCard />);

    expect(screen.getByRole('heading', { name: /Idioma/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Español/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /English/i })).toBeInTheDocument();
  });
});
