// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '../../test/renderWithProviders';
import TechnicianTaskList from './TechnicianTaskList';
import type { LaborItem, WorkOrder } from '../../types/database';
import type { WorkOrderDetailApi } from './useWorkOrderDetail';

const DETAIL = {
  order: {
    id: 'o1',
    numero_orden: 'ORD-001',
    estatus: 'en_proceso',
    tipo_trabajo: 'mecanica',
    marcas_danos: [],
    labor_items: [],
    repuestos: [],
    asignaciones: [],
    avances: [],
    media: [],
  } as unknown as WorkOrder,
  busy: false,
  canEdit: true,
  isAdmin: false,
  laborTimes: [],
  startClock: vi.fn(async () => undefined),
  stopClock: vi.fn(async () => undefined),
  toggleLaborComplete: vi.fn(async () => undefined),
  addProgressUpdate: vi.fn(async () => true),
  reportFinding: vi.fn(async () => true),
} as unknown as WorkOrderDetailApi;

const TASKS: LaborItem[] = [
  {
    id: 't1',
    orden_id: 'o1',
    descripcion: 'Cambio de frenos',
    costo: 150,
    especialidad: 'mecanica',
    asignado_a: 'tech-1',
    estado: 'aprobado',
    completado_en: null,
  },
];

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe('TechnicianTaskList — módulo reloj', () => {
  it('muestra el botón Iniciar del reloj cuando reloj está encendido', () => {
    renderWithProviders(
      <TechnicianTaskList items={TASKS} currentUserId="tech-1" detail={DETAIL} />
    );

    expect(screen.getByRole('button', { name: 'Iniciar' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Realizado' })).toBeInTheDocument();
  });

  it('oculta el botón Iniciar del reloj pero conserva Realizado cuando reloj está apagado', () => {
    vi.stubEnv('VITE_MODULOS_APAGADOS', 'reloj');
    renderWithProviders(
      <TechnicianTaskList items={TASKS} currentUserId="tech-1" detail={DETAIL} />
    );

    expect(screen.queryByRole('button', { name: 'Iniciar' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Realizado' })).toBeInTheDocument();
  });
});
