// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '../../test/renderWithProviders';
import ThemeCard from './ThemeCard';

describe('ThemeCard', () => {
  it('renderiza y muestra su título', () => {
    renderWithProviders(<ThemeCard />);

    expect(screen.getByRole('heading', { name: /Apariencia/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Oscuro/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Claro/i })).toBeInTheDocument();
  });
});
