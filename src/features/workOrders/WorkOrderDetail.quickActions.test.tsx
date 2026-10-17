/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import WorkOrderDetail from './WorkOrderDetail';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LanguageProvider } from '../../context/LanguageContext';
import { ToastProvider } from '../../context/ToastContext';
import type { WorkOrderDetailApi } from './useWorkOrderDetail';

vi.mock('../../context/auth.context', () => ({
  useAuth: () => ({
    user: { id: 'admin-1', rol: 'admin', nombre: 'Admin User' },
    currentSede: { id: 'sede-1', nombre: 'Sede Central' },
    allSedes: [],
  }),
}));

vi.mock('../../context/unsavedChanges.context', () => ({
  useUnsavedChanges: () => ({
    confirmNavigation: (fn: () => void) => fn(),
    markDirty: vi.fn(),
    markPristine: vi.fn(),
    isDirty: false,
  }),
}));

vi.mock('../../services/parking.service', () => ({
  parkingService: {
    getConfig: vi.fn().mockResolvedValue(null),
    getOrderParking: vi.fn().mockResolvedValue(null),
  },
}));

vi.mock('../../services/nextService.service', () => ({
  nextServiceService: {
    getNextService: vi.fn().mockResolvedValue(null),
  },
}));

vi.mock('../../services/media.service', () => ({
  SIGNED_URL_TTL_SECONDS: 3600,
  mediaService: {
    listByOrder: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock('../media/mediaUploads.context', () => ({
  useMediaUploads: () => ({
    items: [],
  }),
}));

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
});

describe('WorkOrderDetail - QuickActions markReady', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    queryClient.clear();
  });

  it('renders "Listo para entrega" as primary quick action for finalized order pending review', () => {
    const mockMarkReady = vi.fn().mockResolvedValue(undefined);

    const mockDetail = {
      order: {
        id: 'wo-101',
        numero_orden: 'ORD-101',
        estatus: 'finalizado',
        lista_para_entregar_en: null,
        retirada_sin_reparar: false,
        sede_id: 'sede-1',
        vehiculo_id: 'veh-1',
        labor: [],
        parts: [],
        repuestos_resumen: [],
        cliente: { nombre: 'Juan Perez', telefono: '5551234567', idioma: 'es' },
        millas_ingreso: 45000,
        vehiculo: { anio: 2020, marca: 'Toyota', modelo: 'Corolla', vin: '12345678901234567' },
      },
      isDelivered: false,
      isReadyForPickup: false,
      canDeliver: false,
      canSign: false,
      canEdit: true,
      canSendReport: false,
      canArchive: false,
      canWithdraw: false,
      canMarkReady: true,
      canRegisterAdvance: false,
      markReadyForPickup: mockMarkReady,
      busy: false,
      generatingPdf: false,
      preparingShare: false,
      readyNotifyOpen: false,
      closeReadyNotify: vi.fn(),
      technicians: [],
      orderOperators: [],
      lockedLaborIds: new Set(),
      paidPools: new Set(),
      pendingUploads: [],
      isAdmin: true,
      userId: 'admin-1',
      requestedTab: null,
      open: vi.fn(),
      close: vi.fn(),
      changeStatus: vi.fn(),
      refresh: vi.fn(),
    } as unknown as WorkOrderDetailApi;

    const statusLabels: Record<string, string> = {
      recepcion: 'Recepción',
      diagnostico: 'Diagnóstico',
      en_progreso: 'En Progreso',
      espera_repuestos: 'Espera Repuestos',
      espera_autorizacion: 'Espera Autorización',
      finalizado: 'Finalizado',
      entregado: 'Entregado',
    };

    render(
      <QueryClientProvider client={queryClient}>
        <LanguageProvider>
          <ToastProvider>
            <WorkOrderDetail
              detail={mockDetail}
              statusLabels={statusLabels}
              onBack={vi.fn()}
            />
          </ToastProvider>
        </LanguageProvider>
      </QueryClientProvider>
    );

    // Find the quick-actions toolbar
    const toolbar = screen.getByRole('toolbar', { name: /acciones rápidas|quick actions/i });
    expect(toolbar).toBeDefined();

    // Inside quick-actions toolbar, there should be "Marcar listo para entregar"
    const quickActionBtns = toolbar.querySelectorAll('button');
    const markReadyBtn = Array.from(quickActionBtns).find((btn) =>
      btn.textContent?.includes('Marcar listo para entregar')
    );

    expect(markReadyBtn).toBeDefined();
    // It should have btn-primary class because primary: true
    expect(markReadyBtn?.className).toContain('btn-primary');

    // Clicking it triggers detail.markReadyForPickup()
    fireEvent.click(markReadyBtn!);
    expect(mockMarkReady).toHaveBeenCalledTimes(1);
  });
});
