// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '../../test/renderWithProviders';
import EmployeesLinkCard from './EmployeesLinkCard';

describe('EmployeesLinkCard', () => {
  it('renderiza y muestra su título', () => {
    renderWithProviders(<EmployeesLinkCard />);

    expect(screen.getByRole('heading', { name: 'Empleados' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ir a Empleados' })).toBeInTheDocument();
  });
});
