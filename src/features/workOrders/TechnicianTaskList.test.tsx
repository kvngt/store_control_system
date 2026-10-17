/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../../test/renderWithProviders';
import TechnicianTaskList from './TechnicianTaskList';
import QuickActions from './QuickActions';
import { buildTechActions } from './techNextStep';
import type { LaborItem, WorkOrder } from '../../types/database';
import type { WorkOrderDetailApi } from './useWorkOrderDetail';

const mockDetail = (orderOverrides: Partial<WorkOrder> = {}, detailOverrides: Partial<WorkOrderDetailApi> = {}): WorkOrderDetailApi => ({
  order: {
    id: 'o1',
    numero_orden: 'ORD-001',
    estatus: 'recepcion',
    tipo_trabajo: 'mecanica',
    marcas_danos: [],
    labor_items: [],
    repuestos: [],
    asignaciones: [],
    avances: [],
    media: [],
    montos: { total_general: 0, total_repuestos: 0, deposito_inicial: 0 },
    ...orderOverrides,
  } as unknown as WorkOrder,
  busy: false,
  changeStatus: vi.fn(),
  toggleLaborComplete: vi.fn(),
  addProgressUpdate: vi.fn(),
  reportFinding: vi.fn(),
  canEdit: true,
  ...detailOverrides,
} as unknown as WorkOrderDetailApi);

const makeTask = (
  id: string,
  asignadoA: string,
  estado: 'aprobado' | 'borrador' | 'pendiente' | 'rechazado' = 'aprobado',
  completadoEn: string | null = null,
  descripcion = 'Frenos'
): LaborItem => ({
  id,
  orden_id: 'o1',
  descripcion,
  costo: 100,
  especialidad: 'mecanica',
  asignado_a: asignadoA,
  estado,
  completado_en: completadoEn,
  creado_en: '2026-10-01T10:00:00Z',
  actualizado_en: '2026-10-01T10:00:00Z',
} as unknown as LaborItem);

describe('TechnicianTaskList (D1: sin botones de estado en la lista)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('en Recepción no muestra botón de cambio de estado en la lista', () => {
    const detail = mockDetail({ estatus: 'recepcion' });
    const items = [makeTask('t1', 'tech-1', 'aprobado')];

    renderWithProviders(
      <TechnicianTaskList items={items} currentUserId="tech-1" detail={detail} />
    );

    expect(screen.queryByRole('button', { name: /Empezar trabajo|Start work/i })).not.toBeInTheDocument();
  });

  it('en estado "finish", muestra la ayuda de aviso a la oficina y ningún botón de terminar en la lista', () => {
    const detail = mockDetail({ estatus: 'en_proceso' });
    const items = [
      makeTask('t1', 'tech-1', 'aprobado', '2026-10-01T12:00:00Z', 'Frenos'),
      makeTask('t2', 'tech-2', 'aprobado', '2026-10-01T12:00:00Z', 'Pintura puerta'),
    ];

    renderWithProviders(
      <TechnicianTaskList items={items} currentUserId="tech-1" detail={detail} />
    );

    expect(screen.queryByRole('button', { name: /Terminé: avisar a la oficina|Done: let the office know/i })).not.toBeInTheDocument();
    expect(screen.getByText(/La oficina revisa el trabajo y avisa al cliente/i)).toBeInTheDocument();
  });

  it('con mi parte hecha y otra pendiente, sale el aviso y no el botón', () => {
    const detail = mockDetail({ estatus: 'en_proceso' });
    const items = [
      makeTask('t1', 'tech-1', 'aprobado', '2026-10-01T12:00:00Z', 'Frenos'),
      makeTask('t2', 'tech-2', 'aprobado', null, 'Cambio de amortiguador'),
    ];

    renderWithProviders(
      <TechnicianTaskList items={items} currentUserId="tech-1" detail={detail} />
    );

    expect(screen.queryByRole('button', { name: /Terminé: avisar a la oficina/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Empezar trabajo/i })).not.toBeInTheDocument();

    expect(screen.getByText(/Tu parte está lista\. Falta: Cambio de amortiguador/i)).toBeInTheDocument();
  });

  it('los textos informativos están en inglés cuando el idioma es inglés', () => {
    localStorage.setItem('restorify_lang', 'en');

    // Finish order hint in English
    const detail2 = mockDetail({ estatus: 'en_proceso' });
    const items2 = [makeTask('t1', 'tech-1', 'aprobado', '2026-10-01T12:00:00Z', 'Brakes')];
    const { unmount: unmount2 } = renderWithProviders(
      <TechnicianTaskList items={items2} currentUserId="tech-1" detail={detail2} />
    );
    expect(screen.getByText(/The office reviews the work and lets the customer know/i)).toBeInTheDocument();
    unmount2();

    // My part done notice in English
    const detail3 = mockDetail({ estatus: 'en_proceso' });
    const items3 = [
      makeTask('t1', 'tech-1', 'aprobado', '2026-10-01T12:00:00Z', 'Brakes'),
      makeTask('t2', 'tech-2', 'aprobado', null, 'Oil filter'),
    ];
    renderWithProviders(
      <TechnicianTaskList items={items3} currentUserId="tech-1" detail={detail3} />
    );
    expect(screen.getByText(/Your part is done\. Still pending: Oil filter/i)).toBeInTheDocument();
  });

  it('incluye el botón de foto rápida en cada tarea autorizada', () => {
    const detail = mockDetail({ estatus: 'en_proceso' });
    const items = [makeTask('t1', 'tech-1', 'aprobado', null, 'Frenos')];

    renderWithProviders(
      <TechnicianTaskList items={items} currentUserId="tech-1" detail={detail} />
    );

    const photoButtons = screen.getAllByRole('button', { name: /Foto/i });
    expect(photoButtons.length).toBeGreaterThanOrEqual(1);
  });
});

describe('Acciones rápidas del técnico (D1: un solo botón principal)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('en recepción con tarea autorizada: «Empezar trabajo» es el único botón principal y llama a changeStatus', async () => {
    const detail = mockDetail({ estatus: 'recepcion' });
    const items = [makeTask('t1', 'tech-1', 'aprobado')];
    const goTo = vi.fn();

    const actions = buildTechActions({
      order: detail.order!,
      laborList: items,
      userId: 'tech-1',
      canEdit: true,
      changeStatus: detail.changeStatus,
      goTo,
      onReportFinding: vi.fn(),
      onSuggestService: vi.fn(),
    });

    renderWithProviders(<QuickActions actions={actions} />);

    // El primer botón es "Empezar trabajo" y tiene clase btn-primary
    const startBtn = screen.getByRole('button', { name: /Empezar trabajo/i });
    expect(startBtn).toHaveClass('btn-primary');

    // "Mis tareas" queda en btn-secondary
    const tasksBtn = screen.getByRole('button', { name: /Mis tareas/i });
    expect(tasksBtn).toHaveClass('btn-secondary');

    await userEvent.click(startBtn);
    expect(detail.changeStatus).toHaveBeenCalledWith('en_proceso');
  });

  it('en proceso con todas las tareas hechas: «Terminé: avisar a la oficina» es el único botón principal', async () => {
    const detail = mockDetail({ estatus: 'en_proceso' });
    const items = [
      makeTask('t1', 'tech-1', 'aprobado', '2026-10-01T12:00:00Z', 'Frenos'),
      makeTask('t2', 'tech-2', 'aprobado', '2026-10-01T12:00:00Z', 'Pintura'),
    ];

    const actions = buildTechActions({
      order: detail.order!,
      laborList: items,
      userId: 'tech-1',
      canEdit: true,
      changeStatus: detail.changeStatus,
      goTo: vi.fn(),
      onReportFinding: vi.fn(),
      onSuggestService: vi.fn(),
    });

    renderWithProviders(<QuickActions actions={actions} />);

    const finishBtn = screen.getByRole('button', { name: /Terminé: avisar a la oficina/i });
    expect(finishBtn).toHaveClass('btn-primary');

    const tasksBtn = screen.getByRole('button', { name: /Mis tareas/i });
    expect(tasksBtn).toHaveClass('btn-secondary');

    await userEvent.click(finishBtn);
    expect(detail.changeStatus).toHaveBeenCalledWith('finalizado');
  });

  it('en inglés las acciones rápidas se traducen correctamente', () => {
    localStorage.setItem('restorify_lang', 'en');
    const detail = mockDetail({ estatus: 'recepcion' });
    const items = [makeTask('t1', 'tech-1', 'aprobado')];

    const actions = buildTechActions({
      order: detail.order!,
      laborList: items,
      userId: 'tech-1',
      canEdit: true,
      changeStatus: detail.changeStatus,
      goTo: vi.fn(),
      onReportFinding: vi.fn(),
      onSuggestService: vi.fn(),
    });

    renderWithProviders(<QuickActions actions={actions} />);

    expect(screen.getByRole('button', { name: /Start work/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /My jobs/i })).toBeInTheDocument();
  });
});
