// @vitest-environment jsdom
//
// The Kanban board moved cards only through HTML5 drag events, which touch
// devices never fire. On a phone — where the shop floor actually uses this —
// the board could be read but not operated, with no hint that anything was
// missing. These tests pin the touch route, and the permission rule that
// governs both routes.
//
// jsdom cannot simulate a real drag, so the desktop gesture is not covered
// here; what is covered is that the same status change is reachable without it.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  renderWithProviders,
  authValue,
  ADMIN_USER,
  MECHANIC_USER,
  SEDE_CENTRO,
} from '../test/renderWithProviders';
import type { WorkOrder } from '../types/database';

const mocks = vi.hoisted(() => ({
  auth: { current: null as ReturnType<typeof import('../test/renderWithProviders').authValue> | null },
  getWorkOrders: vi.fn(),
  updateWorkOrderStatus: vi.fn(),
}));

vi.mock('../context/auth.context', () => ({ useAuth: () => mocks.auth.current }));

// The page imports the narrow `workOrdersService`; `supabaseService` stays
// mocked too so the module's shape still matches what other callers expect.
vi.mock('../services/supabaseService', () => {
  const workOrders = {
    getWorkOrders: mocks.getWorkOrders,
    updateWorkOrderStatus: mocks.updateWorkOrderStatus,
  };
  return { workOrdersService: workOrders, supabaseService: workOrders };
});

const { default: KanbanBoard } = await import('./KanbanBoard');

function order(overrides: Partial<WorkOrder> & { id: string }): WorkOrder {
  return {
    numero_orden: 'ORD-2026-001',
    sede_id: SEDE_CENTRO.id,
    cliente_id: 'cli-1',
    vehiculo_id: 'veh-1',
    tipo_trabajo: 'mecanica',
    estatus: 'recepcion',
    millas_ingreso: 45000,
    nivel_gasolina: '1/2',
    deposito_inicial: 0,
    inspeccion_360_notas: '',
    fecha_ingreso: '2026-09-01T00:00:00Z',
    fecha_estimada_entrega: '2026-09-10',
    porcentaje_avance: 0,
    total_labor: 0,
    total_repuestos: 0,
    total_general: 0,
    creado_por: ADMIN_USER.id,
    creado_en: '2026-09-01T00:00:00Z',
    cliente: { nombre: 'Marta Ruiz' },
    vehiculo: { anio: 2019, marca: 'Toyota', modelo: 'Camry', color: 'Blanco' },
    asignaciones: [],
    ...overrides,
  } as unknown as WorkOrder;
}

const MINE = order({
  id: 'ord-mine',
  numero_orden: 'ORD-2026-001',
  asignaciones: [{ id: 'a1', orden_id: 'ord-mine', usuario_id: MECHANIC_USER.id, tipo_tarea: 'mecanica', estatus_tarea: 'pendiente' }],
});

const SOMEONE_ELSES = order({
  id: 'ord-theirs',
  numero_orden: 'ORD-2026-002',
  asignaciones: [{ id: 'a2', orden_id: 'ord-theirs', usuario_id: 'otro-usuario', tipo_tarea: 'pintura', estatus_tarea: 'pendiente' }],
});

/** The move control belonging to one order card. */
function moveSelectFor(numeroOrden: string) {
  const card = screen.getByText(numeroOrden).closest('.kanban-card') as HTMLElement;
  return within(card).queryByRole('combobox');
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  mocks.updateWorkOrderStatus.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Kanban board without dragging', () => {
  it('lets a technician move an order they are assigned to', async () => {
    mocks.auth.current = authValue(MECHANIC_USER);
    mocks.getWorkOrders.mockResolvedValue([MINE]);

    const user = userEvent.setup();
    renderWithProviders(<KanbanBoard />);

    await screen.findByText('ORD-2026-001');
    const select = moveSelectFor('ORD-2026-001')!;
    expect(select).toBeTruthy();

    await user.selectOptions(select, 'en_proceso');

    await waitFor(() => expect(mocks.updateWorkOrderStatus).toHaveBeenCalledWith('ord-mine', 'en_proceso'));
  });

  it('offers no move control on a colleague’s order', async () => {
    mocks.auth.current = authValue(MECHANIC_USER);
    mocks.getWorkOrders.mockResolvedValue([MINE, SOMEONE_ELSES]);

    renderWithProviders(<KanbanBoard />);

    await screen.findByText('ORD-2026-002');
    expect(moveSelectFor('ORD-2026-002')).toBeNull();
    // The rule is per-card, not per-board: their own order still moves.
    expect(moveSelectFor('ORD-2026-001')).toBeTruthy();
  });

  it('lets an admin move any order', async () => {
    mocks.auth.current = authValue(ADMIN_USER);
    mocks.getWorkOrders.mockResolvedValue([SOMEONE_ELSES]);

    renderWithProviders(<KanbanBoard />);

    await screen.findByText('ORD-2026-002');
    expect(moveSelectFor('ORD-2026-002')).toBeTruthy();
  });

  it('asks for confirmation before marking an order delivered', async () => {
    // Delivering books the customer payment and the parts cost, so it must not
    // happen from a stray tap on a phone.
    mocks.auth.current = authValue(ADMIN_USER);
    mocks.getWorkOrders.mockResolvedValue([MINE]);
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);

    const user = userEvent.setup();
    renderWithProviders(<KanbanBoard />);

    await screen.findByText('ORD-2026-001');
    await user.selectOptions(moveSelectFor('ORD-2026-001')!, 'entregado');

    expect(confirmSpy).toHaveBeenCalled();
    expect(mocks.updateWorkOrderStatus).not.toHaveBeenCalled();
  });

  it('puts the card back when the server rejects the move', async () => {
    mocks.auth.current = authValue(ADMIN_USER);
    mocks.getWorkOrders.mockResolvedValue([MINE]);
    mocks.updateWorkOrderStatus.mockRejectedValue(
      Object.assign(new Error('denied'), { code: '42501' })
    );

    const user = userEvent.setup();
    renderWithProviders(<KanbanBoard />);

    await screen.findByText('ORD-2026-001');
    await user.selectOptions(moveSelectFor('ORD-2026-001')!, 'en_proceso');

    // The optimistic update is rolled back and the reason is shown.
    expect(await screen.findByText(/no tienes permiso/i)).toBeVisible();
    await waitFor(() => expect(moveSelectFor('ORD-2026-001')).toHaveValue('recepcion'));
  });
});
