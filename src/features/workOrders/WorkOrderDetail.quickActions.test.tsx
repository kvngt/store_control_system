/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import WorkOrderDetail from './WorkOrderDetail';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LanguageProvider } from '../../context/LanguageContext';
import { ToastProvider } from '../../context/ToastContext';
import { nextServiceService } from '../../services/nextService.service';
import type { OrderNextService } from '../../types/database';
import type { WorkOrderDetailApi } from './useWorkOrderDetail';
import { queryKeys } from '../../lib/queryClient';
import { setViewportMatches } from '../../test/viewport';

const mockAuthState = vi.hoisted(() => ({
  user: { id: 'admin-1', rol: 'admin', nombre: 'Admin User', nombre_completo: 'Admin User' },
}));

vi.mock('../../context/auth.context', () => ({
  useAuth: () => ({
    user: mockAuthState.user,
    currentSede: { id: 'sede-1', nombre: 'Sede Central' },
    allSedes: [],
  }),
}));

// jsdom no tiene canvas: la tarjeta de firma (orden sin firmar) no puede montar el lienzo real.
vi.mock('react-signature-canvas', () => ({
  default: () => <canvas data-testid="signature-pad" />,
}));

vi.mock('../../services/quotes.service', () => ({
  quotesService: {
    listQuotes: vi.fn().mockResolvedValue([]),
    sendQuote: vi.fn().mockResolvedValue({}),
    registerAuthorization: vi.fn().mockResolvedValue({}),
    cancelQuote: vi.fn().mockResolvedValue({}),
  },
}));

vi.mock('../../context/unsavedChanges.context', () => ({
  useUnsavedChanges: () => ({
    requestNavigation: (proceed: () => void) => proceed(),
    setGuard: vi.fn(),
    registerGuard: vi.fn(() => () => {}),
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
    mockAuthState.user = { id: 'admin-1', rol: 'admin', nombre: 'Admin User', nombre_completo: 'Admin User' };
    Element.prototype.scrollIntoView = vi.fn();
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
      orderSede: null,
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

  it('con un servicio programado, la acción rápida de sticker no abre el modal', async () => {
    const scheduledService: OrderNextService = {
      orden_id: 'wo-101',
      sede_id: 'sede-1',
      token: 'tok-next-svc',
      fecha: '2026-12-01',
      millas: 50000,
      nota: 'Aceite sintético',
      idioma: 'es',
      programado_por: 'admin-1',
      programado_en: '2026-10-10T10:00:00Z',
      sugerido_fecha: null,
      sugerido_millas: null,
      sugerido_nota: null,
      sugerido_por: null,
      sugerido_en: null,
    };
    vi.mocked(nextServiceService.getNextService).mockResolvedValue(scheduledService);

    const mockDetail = {
      order: {
        id: 'wo-101',
        numero_orden: 'ORD-101',
        estatus: 'en_progreso',
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
      canMarkReady: false,
      canRegisterAdvance: false,
      markReadyForPickup: vi.fn(),
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
      orderSede: null,
      userId: 'admin-1',
      requestedTab: null,
      open: vi.fn(),
      close: vi.fn(),
      changeStatus: vi.fn(),
      refresh: vi.fn(),
    } as unknown as WorkOrderDetailApi;

    const statusLabels: Record<string, string> = {
      recepcion: 'Recepción',
      en_progreso: 'En Progreso',
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

    const toolbar = screen.getByRole('toolbar', { name: /acciones rápidas|quick actions/i });
    const stickerBtn = Array.from(toolbar.querySelectorAll('button')).find((btn) =>
      btn.textContent?.includes('Sticker de servicio')
    );
    expect(stickerBtn).toBeDefined();

    await waitFor(() => {
      expect(nextServiceService.getNextService).toHaveBeenCalledWith('wo-101');
    });
    // Que la respuesta ya esté en la caché, no solo pedida: si no, el botón todavía no sabe que
    // hay un servicio.
    await waitFor(() => expect(queryClient.getQueryState(queryKeys.nextService('wo-101'))?.status).toBe('success'));

    fireEvent.click(stickerBtn!);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('A-04: en recepción con trabajo cotizado y sin firma, hay exactamente un .btn-primary entre QuickActions y AuthorizationPanel', () => {
    const mockDetail = {
      order: {
        id: 'wo-102',
        numero_orden: 'ORD-102',
        millas_ingreso: 45000,
        estatus: 'recepcion',
        tipo_trabajo: 'mecanica',
        firma_ruta: null,
        lista_para_entregar_en: null,
        retirada_sin_reparar: false,
        sede_id: 'sede-1',
        vehiculo_id: 'veh-1',
        porcentaje_avance: 0,
        labor_items: [
          {
            id: 'l-1',
            descripcion: 'Cambio de frenos',
            costo: 120,
            especialidad: 'mecanica',
            estado: 'borrador',
            asignado_a: null,
            completado_en: null,
          },
        ],
        repuestos: [],
        repuestos_resumen: [],
        asignaciones: [],
        avances: [],
        media: [],
        cliente: { nombre: 'Juan Perez', telefono: '5551234567', idioma: 'es' },
        vehiculo: { anio: 2020, marca: 'Toyota', modelo: 'Corolla', vin: '12345678901234567' },
      },
      isDelivered: false,
      isReadyForPickup: false,
      canDeliver: false,
      canSign: true,
      canEdit: true,
      canSendReport: false,
      canArchive: false,
      canWithdraw: false,
      canMarkReady: false,
      canRegisterAdvance: false,
      progressDraft: '0',
      setProgressDraft: vi.fn(),
      commitProgress: vi.fn(),
      statusEpoch: 0,
      markReadyForPickup: vi.fn(),
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
      orderSede: null,
      userId: 'admin-1',
      requestedTab: null,
      open: vi.fn(),
      close: vi.fn(),
      changeStatus: vi.fn(),
      refresh: vi.fn(),
    } as unknown as WorkOrderDetailApi;

    render(
      <QueryClientProvider client={queryClient}>
        <LanguageProvider>
          <ToastProvider>
            <WorkOrderDetail
              detail={mockDetail}
              statusLabels={{ recepcion: 'Recepción', en_proceso: 'En Proceso', finalizado: 'Finalizado', entregado: 'Entregado' }}
              onBack={vi.fn()}
            />
          </ToastProvider>
        </LanguageProvider>
      </QueryClientProvider>
    );

    const toolbar = screen.getByRole('toolbar', { name: /acciones rápidas|quick actions/i });
    const authPanel = document.querySelector('.authorization-panel');
    expect(authPanel).not.toBeNull();

    const primaryInToolbar = toolbar.querySelectorAll('.btn-primary');
    const primaryInAuth = authPanel!.querySelectorAll('.btn-primary');
    expect(primaryInToolbar.length + primaryInAuth.length).toBe(1);
    expect(toolbar.querySelectorAll('button')[0]).toHaveClass('btn-primary');
    expect(toolbar.querySelectorAll('button')[0].textContent).toContain('Tomar firma');
    expect(Array.from(toolbar.querySelectorAll('button')).some((b) => b.textContent?.includes('Registrar autorización'))).toBe(true);
  });

  it('A-05: "Agregar trabajo" abre Trabajos > Mano de obra, abre TaskEditor y enfoca descripción', async () => {
    const mockDetail = {
      order: {
        id: 'wo-103',
        numero_orden: 'ORD-103',
        millas_ingreso: 45000,
        estatus: 'recepcion',
        tipo_trabajo: 'mecanica',
        firma_ruta: null,
        lista_para_entregar_en: null,
        retirada_sin_reparar: false,
        sede_id: 'sede-1',
        vehiculo_id: 'veh-1',
        porcentaje_avance: 0,
        labor_items: [],
        repuestos: [],
        repuestos_resumen: [],
        asignaciones: [],
        avances: [],
        media: [],
        cliente: { nombre: 'Juan Perez', telefono: '5551234567', idioma: 'es' },
        vehiculo: { anio: 2020, marca: 'Toyota', modelo: 'Corolla' },
      },
      isDelivered: false,
      isReadyForPickup: false,
      canDeliver: false,
      canSign: true,
      canEdit: true,
      canEditLines: true,
      canSendReport: false,
      canArchive: false,
      canWithdraw: false,
      canMarkReady: false,
      canRegisterAdvance: false,
      progressDraft: '0',
      setProgressDraft: vi.fn(),
      commitProgress: vi.fn(),
      statusEpoch: 0,
      markReadyForPickup: vi.fn(),
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
      orderSede: null,
      userId: 'admin-1',
      requestedTab: null,
      open: vi.fn(),
      close: vi.fn(),
      changeStatus: vi.fn(),
      refresh: vi.fn(),
    } as unknown as WorkOrderDetailApi;

    render(
      <QueryClientProvider client={queryClient}>
        <LanguageProvider>
          <ToastProvider>
            <WorkOrderDetail
              detail={mockDetail}
              statusLabels={{ recepcion: 'Recepción' }}
              onBack={vi.fn()}
            />
          </ToastProvider>
        </LanguageProvider>
      </QueryClientProvider>
    );

    const toolbar = screen.getByRole('toolbar', { name: /acciones rápidas|quick actions/i });
    const addWorkBtn = Array.from(toolbar.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Agregar trabajo')
    );
    expect(addWorkBtn).toHaveClass('btn-primary');
    fireEvent.click(addWorkBtn!);

    const descriptionInput = await waitFor(() => document.getElementById('labor-new-description') as HTMLInputElement | null);
    expect(descriptionInput).not.toBeNull();
    expect(descriptionInput).toHaveFocus();
  });

  it('A-05: "Registrar autorización" abre Trabajos > Presupuesto y abre el diálogo de autorización', async () => {
    const mockDetail = {
      order: {
        id: 'wo-104',
        numero_orden: 'ORD-104',
        millas_ingreso: 45000,
        estatus: 'recepcion',
        tipo_trabajo: 'mecanica',
        firma_ruta: 'firmas/o104.png',
        lista_para_entregar_en: null,
        retirada_sin_reparar: false,
        sede_id: 'sede-1',
        vehiculo_id: 'veh-1',
        porcentaje_avance: 0,
        labor_items: [
          {
            id: 'l-1',
            descripcion: 'Servicio',
            costo: 100,
            especialidad: 'mecanica',
            estado: 'borrador',
            asignado_a: null,
            completado_en: null,
          },
        ],
        repuestos: [],
        repuestos_resumen: [],
        asignaciones: [],
        avances: [],
        media: [],
        cliente: { nombre: 'Juan Perez', telefono: '5551234567', idioma: 'es' },
        vehiculo: { anio: 2020, marca: 'Toyota', modelo: 'Corolla' },
      },
      isDelivered: false,
      isReadyForPickup: false,
      canDeliver: false,
      canSign: true,
      canEdit: true,
      canSendReport: false,
      canArchive: false,
      canWithdraw: false,
      canMarkReady: false,
      canRegisterAdvance: false,
      progressDraft: '0',
      setProgressDraft: vi.fn(),
      commitProgress: vi.fn(),
      statusEpoch: 0,
      markReadyForPickup: vi.fn(),
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
      orderSede: null,
      userId: 'admin-1',
      requestedTab: null,
      open: vi.fn(),
      close: vi.fn(),
      changeStatus: vi.fn(),
      refresh: vi.fn(),
    } as unknown as WorkOrderDetailApi;

    render(
      <QueryClientProvider client={queryClient}>
        <LanguageProvider>
          <ToastProvider>
            <WorkOrderDetail
              detail={mockDetail}
              statusLabels={{ recepcion: 'Recepción' }}
              onBack={vi.fn()}
            />
          </ToastProvider>
        </LanguageProvider>
      </QueryClientProvider>
    );

    const toolbar = screen.getByRole('toolbar', { name: /acciones rápidas|quick actions/i });
    const authBtn = Array.from(toolbar.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Registrar autorización')
    );
    expect(authBtn).toHaveClass('btn-primary');
    fireEvent.click(authBtn!);

    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });

  it('A-05: "Registrar autorización…" del panel también abre el diálogo de autorización', async () => {
    const mockDetail = {
      order: {
        id: 'wo-105',
        numero_orden: 'ORD-105',
        millas_ingreso: 45000,
        estatus: 'recepcion',
        tipo_trabajo: 'mecanica',
        firma_ruta: 'firmas/o105.png',
        lista_para_entregar_en: null,
        retirada_sin_reparar: false,
        sede_id: 'sede-1',
        vehiculo_id: 'veh-1',
        porcentaje_avance: 0,
        labor_items: [
          {
            id: 'l-1',
            descripcion: 'Servicio',
            costo: 100,
            especialidad: 'mecanica',
            estado: 'borrador',
            asignado_a: null,
            completado_en: null,
          },
        ],
        repuestos: [],
        repuestos_resumen: [],
        asignaciones: [],
        avances: [],
        media: [],
        cliente: { nombre: 'Juan Perez', telefono: '5551234567', idioma: 'es' },
        vehiculo: { anio: 2020, marca: 'Toyota', modelo: 'Corolla' },
      },
      isDelivered: false,
      isReadyForPickup: false,
      canDeliver: false,
      canSign: true,
      canEdit: true,
      canSendReport: false,
      canArchive: false,
      canWithdraw: false,
      canMarkReady: false,
      canRegisterAdvance: false,
      progressDraft: '0',
      setProgressDraft: vi.fn(),
      commitProgress: vi.fn(),
      statusEpoch: 0,
      markReadyForPickup: vi.fn(),
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
      orderSede: null,
      userId: 'admin-1',
      requestedTab: null,
      open: vi.fn(),
      close: vi.fn(),
      changeStatus: vi.fn(),
      refresh: vi.fn(),
    } as unknown as WorkOrderDetailApi;

    render(
      <QueryClientProvider client={queryClient}>
        <LanguageProvider>
          <ToastProvider>
            <WorkOrderDetail
              detail={mockDetail}
              statusLabels={{ recepcion: 'Recepción' }}
              onBack={vi.fn()}
            />
          </ToastProvider>
        </LanguageProvider>
      </QueryClientProvider>
    );

    const authPanel = document.querySelector('.authorization-panel')!;
    const panelBtn = Array.from(authPanel.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Registrar autorización')
    );
    expect(panelBtn).toBeDefined();
    fireEvent.click(panelBtn!);

    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });

  it('B-03 y B-04: para el técnico abre la sección Tareas al entrar y fija el orden de sus acciones', () => {
    mockAuthState.user = { id: 'tech-1', rol: 'mecanico', nombre: 'Luis', nombre_completo: 'Luis Ramos' };

    const mockDetail = {
      order: {
        id: 'wo-tech',
        numero_orden: 'ORD-201',
        millas_ingreso: 45000,
        estatus: 'recepcion',
        tipo_trabajo: 'mecanica',
        lista_para_entregar_en: null,
        retirada_sin_reparar: false,
        sede_id: 'sede-1',
        vehiculo_id: 'veh-1',
        porcentaje_avance: 0,
        labor_items: [
          {
            id: 'l-1',
            descripcion: 'Frenos',
            costo: 100,
            especialidad: 'mecanica',
            estado: 'aprobado',
            asignado_a: 'tech-1',
            completado_en: null,
          },
        ],
        repuestos: [],
        repuestos_resumen: [],
        asignaciones: [],
        avances: [],
        media: [],
        cliente: { nombre: 'Juan Perez', telefono: '5551234567', idioma: 'es' },
        vehiculo: { anio: 2020, marca: 'Toyota', modelo: 'Corolla' },
      },
      isDelivered: false,
      isReadyForPickup: false,
      canDeliver: false,
      canSign: false,
      canEdit: true,
      canSendReport: false,
      canArchive: false,
      canWithdraw: false,
      canMarkReady: false,
      canRegisterAdvance: false,
      canSuggestNextService: false,
      progressDraft: '0',
      setProgressDraft: vi.fn(),
      commitProgress: vi.fn(),
      statusEpoch: 0,
      markReadyForPickup: vi.fn(),
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
      isAdmin: false,
      orderSede: null,
      userId: 'tech-1',
      requestedTab: null,
      open: vi.fn(),
      close: vi.fn(),
      changeStatus: vi.fn(),
      refresh: vi.fn(),
    } as unknown as WorkOrderDetailApi;

    render(
      <QueryClientProvider client={queryClient}>
        <LanguageProvider>
          <ToastProvider>
            <WorkOrderDetail
              detail={mockDetail}
              statusLabels={{ recepcion: 'Recepción' }}
              onBack={vi.fn()}
            />
          </ToastProvider>
        </LanguageProvider>
      </QueryClientProvider>
    );

    const tasksToggle = document.querySelector('[data-section="tareas"] .collapsible-section-toggle');
    expect(tasksToggle).toHaveAttribute('aria-expanded', 'true');

    const toolbar = screen.getByRole('toolbar', { name: /acciones rápidas|quick actions/i });
    const labels = Array.from(toolbar.querySelectorAll('button')).map((b) => b.textContent?.trim());
    expect(labels[0]).toContain('Empezar trabajo');
    expect(labels[1]).toContain('Registrar avance');
    expect(labels[2]).toContain('Reportar trabajo adicional');
    expect(labels[3]).toContain('Mis tareas');
  });

  it('A-09: en teléfono mueve acciones rápidas al encabezado antes de PDF/estado y omite el vehículo repetido del subtítulo', () => {
    setViewportMatches(true);

    const mockDetail = {
      order: {
        id: 'wo-mob',
        numero_orden: 'ORD-301',
        millas_ingreso: 45000,
        estatus: 'recepcion',
        tipo_trabajo: 'mecanica',
        lista_para_entregar_en: null,
        retirada_sin_reparar: false,
        sede_id: 'sede-1',
        vehiculo_id: 'veh-1',
        porcentaje_avance: 25,
        labor_items: [],
        repuestos: [],
        repuestos_resumen: [],
        asignaciones: [],
        avances: [],
        media: [],
        cliente: { nombre: 'Juan Perez', telefono: '5551234567', idioma: 'es' },
        vehiculo: { anio: 2020, marca: 'Toyota', modelo: 'Corolla' },
      },
      isDelivered: false,
      isReadyForPickup: false,
      canDeliver: false,
      canSign: false,
      canEdit: true,
      canSendReport: true,
      canArchive: false,
      canWithdraw: true,
      canMarkReady: false,
      canRegisterAdvance: false,
      generatePdf: vi.fn(),
      shareReport: vi.fn(),
      startWithdrawal: vi.fn(),
      progressDraft: '25',
      setProgressDraft: vi.fn(),
      commitProgress: vi.fn(),
      statusEpoch: 0,
      markReadyForPickup: vi.fn(),
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
      orderSede: null,
      userId: 'admin-1',
      requestedTab: null,
      open: vi.fn(),
      close: vi.fn(),
      changeStatus: vi.fn(),
      refresh: vi.fn(),
    } as unknown as WorkOrderDetailApi;

    render(
      <QueryClientProvider client={queryClient}>
        <LanguageProvider>
          <ToastProvider>
            <WorkOrderDetail
              detail={mockDetail}
              statusLabels={{ recepcion: 'Recepción', en_proceso: 'En Proceso' }}
              onBack={vi.fn()}
            />
          </ToastProvider>
        </LanguageProvider>
      </QueryClientProvider>
    );

    const header = document.querySelector('.order-detail-header')!;
    const toolbars = screen.getAllByRole('toolbar', { name: /acciones rápidas|quick actions/i });
    expect(toolbars).toHaveLength(1);
    expect(header.contains(toolbars[0])).toBe(true);

    const subtitle = header.querySelector('.page-subtitle');
    expect(subtitle?.textContent).toBe('Juan Perez');

    const pdfBtn = screen.getByRole('button', { name: /PDF/i });
    const statusSelect = header.querySelector('.order-detail-controls select')!;
    expect(toolbars[0].compareDocumentPosition(pdfBtn) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(toolbars[0].compareDocumentPosition(statusSelect) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
