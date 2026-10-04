// @vitest-environment jsdom
//
// La comisión de una orden. Por especialidad (reunión con el taller, sept. 2026) y, desde
// 20261010000006, por tarea: cada línea con técnico le paga a ese técnico. El técnico ve su parte
// con la cuenta a la vista; administración ve el reparto, el detalle por tarea y los avisos de
// una bolsa que nadie cobra y de tareas sin técnico. Todas las cifras vienen de la base.

import { describe, it, expect } from 'vitest';
import { screen, within } from '@testing-library/react';
import { renderWithProviders } from '../../test/renderWithProviders';
import CommissionEstimateCard from './CommissionEstimateCard';
import type { CommissionEstimate } from '../../types/database';

// El ejemplo de la reunión: pintura $1,000, mecánica $200, al 35 %. Todo heredado (líneas de
// antes de la comisión por tarea).
const REUNION: CommissionEstimate = {
  bolsas: [
    { especialidad: 'mecanica', base: 200, tecnicos: 1 },
    { especialidad: 'pintura', base: 1000, tecnicos: 1 },
  ],
  reparto: [
    { usuario_id: 'u-mario', especialidad: 'mecanica', esquema: 'comision', porcentaje: 35, tecnicos: 1, monto: 70, heredado: true, tareas: 0 },
    { usuario_id: 'u-paula', especialidad: 'pintura', esquema: 'comision', porcentaje: 35, tecnicos: 1, monto: 350, heredado: true, tareas: 0 },
  ],
  mi_total: 0,
  tareas: [],
  sin_asignar: [],
};
const NAMES = { 'u-mario': 'Mario Mecánico', 'u-paula': 'Paula Pintora' };

// Una orden nueva, por tarea: la pintora tiene dos tareas, el mecánico una, y una tarea quedó sin
// técnico. Los montos son los que devolvería `comisiones_estimadas`.
const POR_TAREA: CommissionEstimate = {
  bolsas: [],
  reparto: [
    { usuario_id: 'u-mario', especialidad: 'mecanica', esquema: 'comision', porcentaje: 30, tecnicos: 1, monto: 36, heredado: false, tareas: 1 },
    { usuario_id: 'u-paula', especialidad: 'pintura', esquema: 'comision', porcentaje: 40, tecnicos: 1, monto: 560, heredado: false, tareas: 2 },
  ],
  mi_total: 0,
  tareas: [
    { labor_id: 'l1', descripcion: 'Pintura general', especialidad: 'pintura', usuario_id: 'u-paula', esquema: 'comision', base: 1000, porcentaje: 40, monto: 400 },
    { labor_id: 'l2', descripcion: 'Pulido extra', especialidad: 'pintura', usuario_id: 'u-paula', esquema: 'comision', base: 400, porcentaje: 40, monto: 160 },
    { labor_id: 'l3', descripcion: 'Cambio de aceite', especialidad: 'mecanica', usuario_id: 'u-mario', esquema: 'comision', base: 120, porcentaje: 30, monto: 36 },
  ],
  sin_asignar: [
    { labor_id: 'l4', descripcion: 'Alineación', especialidad: 'mecanica', costo: 80, estado: 'aprobado' },
  ],
};

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
    expect(screen.queryByText('Por tarea')).not.toBeInTheDocument();
  });

  it('avisa de una bolsa sin nadie asignado', () => {
    const estimate: CommissionEstimate = {
      bolsas: [{ especialidad: 'pintura', base: 300, tecnicos: 0 }],
      reparto: [],
      mi_total: 0,
      tareas: [],
      sin_asignar: [],
    };
    renderWithProviders(<CommissionEstimateCard estimate={estimate} isAdmin userId="u-admin" names={NAMES} />);

    expect(screen.getByRole('note')).toHaveTextContent('Nadie tiene asignada la pintura');
  });

  describe('comisión por tarea', () => {
    it('a administración le muestra cada tarea con su técnico, su cuenta y su monto', () => {
      renderWithProviders(<CommissionEstimateCard estimate={POR_TAREA} isAdmin userId="u-admin" names={NAMES} />);

      const tareas = screen.getByText('Por tarea').closest('.commission-split') as HTMLElement;
      const pintura = within(tareas).getByText('Pintura general').closest('li') as HTMLElement;
      expect(pintura).toHaveTextContent('Paula Pintora');
      expect(within(pintura).getByText('$1,000.00 × 40%')).toBeInTheDocument();
      expect(within(pintura).getByText('$400.00')).toBeInTheDocument();
      expect(within(tareas).getByText('Cambio de aceite').closest('li')).toHaveTextContent('$36.00');

      // Y el total de cada quien, como lo suma la base: dos tareas de la pintora.
      const pinturaSplit = screen.getByText('Pintura', { selector: 'strong' }).closest('.commission-split') as HTMLElement;
      const paula = within(pinturaSplit).getByText('Paula Pintora').closest('li') as HTMLElement;
      expect(paula).toHaveTextContent('2 tarea(s)');
      expect(within(paula).getByText('$560.00')).toBeInTheDocument();
    });

    it('avisa de las tareas sin técnico: nadie cobrará su comisión', () => {
      renderWithProviders(<CommissionEstimateCard estimate={POR_TAREA} isAdmin userId="u-admin" names={NAMES} />);

      const note = screen.getByRole('note');
      expect(note).toHaveTextContent('Tareas sin técnico: nadie cobrará su comisión');
      expect(within(note).getByText('Alineación')).toBeInTheDocument();
    });

    it('solo con tareas sin técnico también se muestra, para avisarlo', () => {
      const estimate: CommissionEstimate = { ...POR_TAREA, reparto: [], tareas: [] };
      renderWithProviders(<CommissionEstimateCard estimate={estimate} isAdmin userId="u-admin" names={NAMES} />);

      expect(screen.getByRole('note')).toHaveTextContent('Alineación');
    });

    it('a la pintora le muestra el detalle de sus tareas y el total que da la base', () => {
      const estimate: CommissionEstimate = {
        ...POR_TAREA,
        reparto: [POR_TAREA.reparto[1]],
        tareas: POR_TAREA.tareas.slice(0, 2),
        mi_total: 560,
      };
      renderWithProviders(<CommissionEstimateCard estimate={estimate} isAdmin={false} userId="u-paula" names={NAMES} />);

      const card = screen.getByText('Tu comisión estimada').closest('.card') as HTMLElement;
      expect(within(card).getByText('Tarea «Pintura general»: $1,000.00 × 40%')).toBeInTheDocument();
      expect(within(card).getByText('Tarea «Pulido extra»: $400.00 × 40%')).toBeInTheDocument();
      expect(within(card).getByText('$560.00')).toBeInTheDocument();
      // Sin bolsa heredada no hay una línea de reparto en cero.
      expect(within(card).queryByText(/÷/)).not.toBeInTheDocument();
      // Las tareas ajenas y las que no tienen técnico no son asunto suyo.
      expect(within(card).queryByText(/Cambio de aceite|Alineación/)).not.toBeInTheDocument();
    });

    it('con tareas y parte del reparto heredado, el técnico ve las dos cuentas', () => {
      const estimate: CommissionEstimate = {
        bolsas: [{ especialidad: 'mecanica', base: 200, tecnicos: 2 }],
        reparto: [
          { usuario_id: 'u-mario', especialidad: 'mecanica', esquema: 'comision', porcentaje: 30, tecnicos: 2, monto: 66, heredado: true, tareas: 1 },
        ],
        mi_total: 66,
        tareas: [
          { labor_id: 'l3', descripcion: 'Cambio de aceite', especialidad: 'mecanica', usuario_id: 'u-mario', esquema: 'comision', base: 120, porcentaje: 30, monto: 36 },
        ],
        sin_asignar: [],
      };
      renderWithProviders(<CommissionEstimateCard estimate={estimate} isAdmin={false} userId="u-mario" names={NAMES} />);

      expect(screen.getByText('Mecánica: mano de obra $200.00 × 30% ÷ 2 técnico(s)')).toBeInTheDocument();
      expect(screen.getByText('Tarea «Cambio de aceite»: $120.00 × 30%')).toBeInTheDocument();
      expect(screen.getByText('$66.00')).toBeInTheDocument();
    });
  });
});
