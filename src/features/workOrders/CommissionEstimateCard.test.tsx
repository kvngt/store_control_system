// @vitest-environment jsdom
//
// La comisión por especialidad (reunión con el taller, sept. 2026). El técnico ve su parte con
// la cuenta a la vista; administración ve el reparto y el aviso de una bolsa que nadie cobra.

import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '../../test/renderWithProviders';
import CommissionEstimateCard from './CommissionEstimateCard';
import type { CommissionEstimate } from '../../types/database';

// El ejemplo de la reunión: pintura $1,000, mecánica $200, al 35 %.
const REUNION: CommissionEstimate = {
  bolsas: [
    { especialidad: 'mecanica', base: 200, tecnicos: 1 },
    { especialidad: 'pintura', base: 1000, tecnicos: 1 },
  ],
  reparto: [
    { usuario_id: 'u-mario', especialidad: 'mecanica', esquema: 'comision', porcentaje: 35, tecnicos: 1, monto: 70 },
    { usuario_id: 'u-paula', especialidad: 'pintura', esquema: 'comision', porcentaje: 35, tecnicos: 1, monto: 350 },
  ],
  mi_total: 0,
};
const NAMES = { 'u-mario': 'Mario Mecánico', 'u-paula': 'Paula Pintora' };

describe('CommissionEstimateCard', () => {
  it('al mecánico le muestra su bolsa, su porcentaje y el total que da la base', () => {
    const estimate = { ...REUNION, reparto: [REUNION.reparto[0]], mi_total: 70 };
    renderWithProviders(<CommissionEstimateCard estimate={estimate} isAdmin={false} userId="u-mario" names={NAMES} />);

    expect(screen.getByText('Mecánica: mano de obra $200.00 × 35% ÷ 1 técnico(s)')).toBeInTheDocument();
    expect(screen.getByText('$70.00')).toBeInTheDocument();
    // La bolsa de pintura no es suya: no se le cuenta.
    expect(screen.queryByText(/Pintura:/)).not.toBeInTheDocument();
  });

  it('a quien está a salario le dice que no genera comisión', () => {
    const estimate: CommissionEstimate = {
      ...REUNION,
      reparto: [{ ...REUNION.reparto[0], esquema: 'salario', porcentaje: 0, monto: 0 }],
      mi_total: 0,
    };
    renderWithProviders(<CommissionEstimateCard estimate={estimate} isAdmin={false} userId="u-mario" names={NAMES} />);

    expect(screen.getByText('Estás a salario: esta orden no te genera comisión.')).toBeInTheDocument();
    expect(screen.queryByText('$0.00')).not.toBeInTheDocument();
  });

  it('a administración le muestra el reparto por bolsa', () => {
    renderWithProviders(<CommissionEstimateCard estimate={REUNION} isAdmin userId="u-admin" names={NAMES} />);

    expect(screen.getByText('Reparto de la comisión')).toBeInTheDocument();
    expect(screen.getByText('Paula Pintora')).toBeInTheDocument();
    expect(screen.getByText('$350.00')).toBeInTheDocument();
    expect(screen.getByText('$70.00')).toBeInTheDocument();
  });

  it('avisa de una bolsa sin nadie asignado', () => {
    const estimate: CommissionEstimate = {
      bolsas: [{ especialidad: 'pintura', base: 300, tecnicos: 0 }],
      reparto: [],
      mi_total: 0,
    };
    renderWithProviders(<CommissionEstimateCard estimate={estimate} isAdmin userId="u-admin" names={NAMES} />);

    expect(screen.getByRole('note')).toHaveTextContent('Nadie tiene asignada la pintura');
  });
});
