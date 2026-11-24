// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LanguageProvider } from '../../../context/LanguageContext';
import { ToastProvider } from '../../../context/ToastContext';
import { workOrdersService } from '../../../services/workOrders.service';
import type { WorkOrder } from '../../../types/database';
import { useOrderTransitions } from './useOrderTransitions';
import OrderDialogs from './OrderDialogs';
import type { WorkOrderDetailApi } from '../useWorkOrderDetail';

vi.mock('../../../services/workOrders.service', () => ({
  workOrdersService: {
    updateWorkOrderStatus: vi.fn().mockResolvedValue({}),
  },
}));

function makeOrder(laborItems: WorkOrder['labor_items'] = []): WorkOrder {
  return {
    id: 'wo-a14',
    numero_orden: 'ORD-A14',
    sede_id: 'sede-1',
    cliente_id: 'cli-1',
    vehiculo_id: 'veh-1',
    tipo_trabajo: 'mecanica',
    estatus: 'en_proceso',
    porcentaje_avance: 50,
    con_seguro: false,
    retirada_sin_reparar: false,
    labor_items: laborItems,
    repuestos: [],
  } as unknown as WorkOrder;
}

function Harness({
  order,
  onReviewTasks = vi.fn(),
}: {
  order: WorkOrder;
  onReviewTasks?: () => void;
}) {
  const transitions = useOrderTransitions({
    openOrderId: order.id,
    order,
    isAdmin: true,
    isAssignedToMe: false,
    orderSede: null,
    user: null,
    patchOrder: vi.fn(),
    canDeliver: true,
    canEditProgress: true,
    canArchive: false,
    isArchived: false,
    onBoardChanged: vi.fn(),
    refresh: vi.fn().mockResolvedValue(undefined),
    setBusy: vi.fn(),
    fail: vi.fn(),
    onStartDelivery: vi.fn(),
  });

  const detailStub = {
    ...transitions,
    order,
    readyNotifyOpen: false,
    closeReadyNotify: vi.fn(),
    startDelivery: vi.fn(),
    cancelDelivery: vi.fn(),
    finishDelivery: vi.fn().mockResolvedValue(undefined),
    delivering: false,
    withdrawing: false,
    startWithdrawal: vi.fn(),
    cancelWithdrawal: vi.fn(),
    finishWithdrawal: vi.fn().mockResolvedValue(undefined),
    advancing: false,
    startAdvance: vi.fn(),
    cancelAdvance: vi.fn(),
    finishAdvance: vi.fn().mockResolvedValue(undefined),
  } as unknown as WorkOrderDetailApi;

  return (
    <div>
      <span data-testid="epoch">{transitions.statusEpoch}</span>
      <button type="button" onClick={() => void transitions.changeStatus('finalizado')}>
        Pasar a finalizado
      </button>
      <button type="button" onClick={() => void transitions.changeStatus('en_proceso')}>
        Pasar a en proceso
      </button>
      <OrderDialogs
        order={order}
        detail={detailStub}
        isAdmin={true}
        orderSede={null}
        pdfLanguage="es"
        showInsuranceModal={false}
        onCloseInsuranceModal={vi.fn()}
        stickerModal={{ open: false }}
        onCloseStickerModal={vi.fn()}
        onReviewTasks={onReviewTasks}
      />
    </div>
  );
}

describe('useOrderTransitions + OrderDialogs (A-14)', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  });

  function renderHarness(order: WorkOrder, onReviewTasks?: () => void) {
    return render(
      <QueryClientProvider client={queryClient}>
        <LanguageProvider>
          <ToastProvider>
            <Harness order={order} onReviewTasks={onReviewTasks} />
          </ToastProvider>
        </LanguageProvider>
      </QueryClientProvider>
    );
  }

  it('con 1 tarea aprobada sin marcar pregunta con singular, y «Revisar tareas» repone el selector sin guardar', async () => {
    const onReviewTasks = vi.fn();
    const order = makeOrder([
      { id: 'l1', descripcion: 'Alineación', estado: 'aprobado', completado_en: null } as unknown as NonNullable<WorkOrder['labor_items']>[number],
    ]);
    const user = userEvent.setup();

    renderHarness(order, onReviewTasks);

    await user.click(screen.getByRole('button', { name: 'Pasar a finalizado' }));

    expect(await screen.findByText('Queda 1 tarea sin marcar')).toBeInTheDocument();
    expect(workOrdersService.updateWorkOrderStatus).not.toHaveBeenCalled();

    const epochBefore = screen.getByTestId('epoch').textContent;
    await user.click(screen.getByRole('button', { name: 'Revisar tareas' }));

    expect(onReviewTasks).toHaveBeenCalledTimes(1);
    expect(workOrdersService.updateWorkOrderStatus).not.toHaveBeenCalled();
    expect(screen.getByTestId('epoch').textContent).not.toBe(epochBefore);
    expect(screen.queryByText('Queda 1 tarea sin marcar')).not.toBeInTheDocument();
  });

  it('con 2 tareas aprobadas sin marcar usa plural y «Terminar de todos modos» guarda y avisa', async () => {
    const order = makeOrder([
      { id: 'l1', descripcion: 'Alineación', estado: 'aprobado', completado_en: null } as unknown as NonNullable<WorkOrder['labor_items']>[number],
      { id: 'l2', descripcion: 'Balanceo', estado: 'aprobado', completado_en: null } as unknown as NonNullable<WorkOrder['labor_items']>[number],
      { id: 'l3', descripcion: 'Borrador', estado: 'borrador', completado_en: null } as unknown as NonNullable<WorkOrder['labor_items']>[number],
    ]);
    const user = userEvent.setup();

    renderHarness(order);

    await user.click(screen.getByRole('button', { name: 'Pasar a finalizado' }));
    expect(await screen.findByText('Quedan 2 tareas sin marcar')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Terminar de todos modos' }));

    await waitFor(() => {
      expect(workOrdersService.updateWorkOrderStatus).toHaveBeenCalledWith('wo-a14', 'finalizado');
    });
    expect(await screen.findByText('Estado: Finalizado')).toBeInTheDocument();
  });

  it('al cambiar a un estado distinto sin pendientes guarda directo y muestra el toast con el estado nuevo', async () => {
    const order = {
      ...makeOrder([]),
      estatus: 'recepcion',
    } as WorkOrder;
    const user = userEvent.setup();

    renderHarness(order);

    await user.click(screen.getByRole('button', { name: 'Pasar a en proceso' }));

    await waitFor(() => {
      expect(workOrdersService.updateWorkOrderStatus).toHaveBeenCalledWith('wo-a14', 'en_proceso');
    });
    expect(await screen.findByText(/Estado: /)).toBeInTheDocument();
  });
});
