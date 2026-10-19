// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import {
  renderWithProviders,
  authValue,
  ADMIN_USER,
  MECHANIC_USER,
  SEDE_CENTRO,
} from '../../test/renderWithProviders';
import { useWorkOrderDetail } from './useWorkOrderDetail';
import type { CommissionEstimate, WorkOrder } from '../../types/database';

const mocks = vi.hoisted(() => ({
  auth: { current: null as ReturnType<typeof authValue> | null },
  getWorkOrderDetail: vi.fn(),
  getEstimate: vi.fn(),
  getPaidCommissionKeys: vi.fn(),
  getOperators: vi.fn(),
}));

vi.mock('../../context/auth.context', () => ({
  useAuth: () => mocks.auth.current,
}));

vi.mock('../../services/supabaseService', () => ({
  commissionsService: {
    getEstimate: mocks.getEstimate,
  },
  workOrdersService: {
    getWorkOrderDetail: mocks.getWorkOrderDetail,
    getPaidCommissionKeys: mocks.getPaidCommissionKeys,
  },
  usersService: {
    getOperators: mocks.getOperators,
  },
}));

vi.mock('../../services/parking.service', () => ({
  parkingService: {
    getConfig: vi.fn().mockResolvedValue({ habilitado: false }),
    getOrderParking: vi.fn().mockResolvedValue({ monto: 0, dias_cobrados: 0, estado: 'inactivo' }),
  },
}));

const mockEstimate: CommissionEstimate = {
  bolsas: [],
  sin_asignar: [],
  reparto: [],
  mi_total: 45,
  tareas: [],
};

const baseOrder: WorkOrder = {
  id: 'ord-test-42',
  numero_orden: 'OT-2026-0042',
  sede_id: SEDE_CENTRO.id,
  cliente_id: 'cli-1',
  vehiculo_id: 'veh-1',
  tipo_trabajo: 'mecanica',
  estatus: 'en_proceso',
  millas_ingreso: 1000,
  nivel_gasolina: 'full',
  inspeccion_360_notas: '',
  fecha_ingreso: '2026-10-01T00:00:00Z',
  fecha_estimada_entrega: '2026-10-10',
  porcentaje_avance: 0,
  total_labor: 100,
  montos: { total_repuestos: 50, total_general: 150, deposito_inicial: 0 },
  creado_por: ADMIN_USER.id,
  creado_en: '2026-10-01T00:00:00Z',
  asignaciones: [],
  con_seguro: false,
};

function TestHarness() {
  const api = useWorkOrderDetail({ onBoardChanged: vi.fn() });
  return (
    <div>
      <button onClick={() => void api.open('ord-test-42')}>Open 42</button>
      <button onClick={() => void api.open('ord-tech-99')}>Open 99</button>
      <div data-testid="order-loaded">{api.order ? api.order.id : 'none'}</div>
      <div data-testid="estimate-loaded">
        {api.commissionEstimate ? String(api.commissionEstimate.mi_total) : 'none'}
      </div>
    </div>
  );
}

describe('useWorkOrderDetail parallel query execution (G2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getPaidCommissionKeys.mockResolvedValue([]);
    mocks.getOperators.mockResolvedValue([]);
  });

  it('admin: requests commission estimate with order id in parallel before order detail resolves', async () => {
    mocks.auth.current = authValue(ADMIN_USER);

    let resolveOrderDetail!: (value: WorkOrder) => void;
    const orderPromise = new Promise<WorkOrder>((res) => {
      resolveOrderDetail = res;
    });

    mocks.getWorkOrderDetail.mockReturnValue(orderPromise);
    mocks.getEstimate.mockResolvedValue(mockEstimate);

    renderWithProviders(<TestHarness />);

    fireEvent.click(screen.getByRole('button', { name: 'Open 42' }));

    // La estimación de comisión se pide con el id antes de que llegue la orden
    await waitFor(() => {
      expect(mocks.getEstimate).toHaveBeenCalledWith('ord-test-42');
    });
    expect(mocks.getWorkOrderDetail).toHaveBeenCalledWith('ord-test-42');

    // La orden sigue sin resolverse
    expect(screen.getByTestId('order-loaded').textContent).toBe('none');

    // Cuando la orden finalmente resuelve, los datos quedan disponibles
    resolveOrderDetail(baseOrder);

    await waitFor(() => {
      expect(screen.getByTestId('order-loaded').textContent).toBe('ord-test-42');
    });
    expect(screen.getByTestId('estimate-loaded').textContent).toBe('45');
  });

  it('technician: waits for order detail before requesting estimate because isAssignedToMe depends on order', async () => {
    mocks.auth.current = authValue(MECHANIC_USER);

    let resolveOrderDetail!: (value: WorkOrder) => void;
    const orderPromise = new Promise<WorkOrder>((res) => {
      resolveOrderDetail = res;
    });

    mocks.getWorkOrderDetail.mockReturnValue(orderPromise);
    mocks.getEstimate.mockResolvedValue(mockEstimate);

    renderWithProviders(<TestHarness />);

    fireEvent.click(screen.getByRole('button', { name: 'Open 99' }));

    // Se pide el detalle de la orden
    await waitFor(() => {
      expect(mocks.getWorkOrderDetail).toHaveBeenCalledWith('ord-tech-99');
    });

    // Para el técnico, la estimación NO se pide mientras la orden esté pendiente (no sabe aún si está asignado)
    expect(mocks.getEstimate).not.toHaveBeenCalled();

    // Cuando la orden llega asignada al técnico, la estimación se dispara
    const assignedOrder: WorkOrder = {
      ...baseOrder,
      id: 'ord-tech-99',
      asignaciones: [
        {
          id: 'asig-1',
          orden_id: 'ord-tech-99',
          usuario_id: MECHANIC_USER.id,
          tipo_tarea: 'mecanica',
          estatus_tarea: 'pendiente',
        },
      ],
    };
    resolveOrderDetail(assignedOrder);

    await waitFor(() => {
      expect(mocks.getEstimate).toHaveBeenCalledWith('ord-tech-99');
    });
    expect(screen.getByTestId('order-loaded').textContent).toBe('ord-tech-99');
  });
});
