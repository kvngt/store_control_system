// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '../../../../test/renderWithProviders';
import type { WorkOrder } from '../../../../types/database';
import type { WorkOrderDetailApi } from '../../useWorkOrderDetail';

vi.mock('../../../inspection/PointInspection', () => ({
  default: () => <div data-testid="point-inspection">Inspección por puntos</div>,
}));

vi.mock('../../DamageDiagramEditor', () => ({
  default: () => <div data-testid="damage-diagram">Diagrama 360</div>,
}));

vi.mock('../../../media/MediaGallery', () => ({
  default: () => <div data-testid="media-gallery">Galería</div>,
}));

vi.mock('../../../media/MediaCaptureBar', () => ({
  default: () => <div data-testid="media-capture">Captura</div>,
}));

const { default: InspectionSection } = await import('./InspectionSection');

const ORDER = {
  id: 'ord-1',
  numero_orden: 'ORD-001',
  sede_id: 'sede-centro',
  cliente_id: 'cli-1',
  vehiculo_id: 'veh-1',
  tipo_trabajo: 'mecanica',
  estatus: 'en_proceso',
  millas_ingreso: 10000,
  nivel_gasolina: '1/2',
  inspeccion_360_notas: null,
  fecha_ingreso: '2026-10-01T10:00:00Z',
  fecha_estimada_entrega: '2026-10-05',
  porcentaje_avance: 0,
  total_labor: 100,
  creado_por: 'user-admin',
  creado_en: '2026-10-01T10:00:00Z',
  con_seguro: false,
  marcas_danos: [],
  asignaciones: [],
  media: [],
} as unknown as WorkOrder;

const DETAIL = {
  isAdmin: true,
  canEdit: true,
  isDelivered: false,
  pendingUploads: [],
  technicians: [],
  userId: 'user-admin',
  busy: false,
  savingDamageMarks: false,
  updateDamageMarks: vi.fn(async () => undefined),
  toggleMediaVisibility: vi.fn(async () => undefined),
  deleteMedia: vi.fn(async () => undefined),
  addReceptionMedia: vi.fn(async () => undefined),
  refresh: vi.fn(async () => undefined),
  enqueueMedia: vi.fn(),
} as unknown as WorkOrderDetailApi;

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe('InspectionSection — módulo inspeccion', () => {
  it('pinta la inspección por puntos y la 360° cuando inspeccion está encendido', () => {
    renderWithProviders(
      <InspectionSection
        order={ORDER}
        detail={DETAIL}
        sectionProps={{ sectionId: 'sec-inspeccion', open: true, onToggle: vi.fn() }}
        onQuotePointPrefill={vi.fn()}
      />
    );

    expect(screen.getByTestId('point-inspection')).toBeInTheDocument();
    expect(screen.getByTestId('damage-diagram')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Inspección 360°' })).toBeInTheDocument();
  });

  it('esconde PointInspection pero conserva la Inspección 360° cuando inspeccion está apagado', () => {
    vi.stubEnv('VITE_MODULOS_APAGADOS', 'inspeccion');
    renderWithProviders(
      <InspectionSection
        order={ORDER}
        detail={DETAIL}
        sectionProps={{ sectionId: 'sec-inspeccion', open: true, onToggle: vi.fn() }}
        onQuotePointPrefill={vi.fn()}
      />
    );

    expect(screen.queryByTestId('point-inspection')).not.toBeInTheDocument();
    expect(screen.getByTestId('damage-diagram')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Inspección 360°' })).toBeInTheDocument();
  });
});
