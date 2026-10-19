// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders, authValue, ADMIN_USER, SEDE_CENTRO } from '../../test/renderWithProviders';
import WorkshopMetricsTab from './WorkshopMetricsTab';
import { metricsService } from '../../services/supabaseService';
import type { WorkshopMetrics } from '../../types/database';

vi.mock('../../context/auth.context', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../context/auth.context')>();
  return {
    ...actual,
    useAuth: () => authValue(ADMIN_USER, SEDE_CENTRO),
  };
});

vi.mock('../../services/supabaseService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/supabaseService')>();
  return {
    ...actual,
    metricsService: {
      getWorkshopMetrics: vi.fn(),
    },
  };
});

describe('WorkshopMetricsTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('muestra las 8 fichas de KPI con datos reales y la tabla por técnico', async () => {
    const mockData: WorkshopMetrics = {
      carros_recibidos: 10,
      carros_entregados: 8,
      ventas_mano_obra: 3200,
      ventas_repuestos: 1800,
      costo_repuestos: 1000,
      descuentos: 100,
      ticket_promedio: 625,
      comisiones: 800,
      margen_mano_obra: 0.75, // 75.0%
      margen_repuestos: 0.444, // 44.4%
      horas_facturadas: 40,
      tarifa_efectiva: 80,
      horas_por_orden: 5,
      tarifa_hora_sede: 90,
      aprobacion_presupuestos: 0.825, // 82.5%
      dias_promedio_en_taller: 4.2,
      por_tecnico: [
        {
          usuario_id: 'tech-1',
          nombre: 'Carlos Mecánico',
          horas_facturadas: 25,
          horas_reloj: 20,
          eficiencia: 1.25,
          tareas_completadas: 6,
        },
      ],
    };

    vi.mocked(metricsService.getWorkshopMetrics).mockResolvedValueOnce(mockData);

    renderWithProviders(<WorkshopMetricsTab sedeId="sede-centro" />);

    // Verificar títulos de las 8 fichas
    expect(await screen.findByText('Carros entregados')).toBeInTheDocument();
    expect(screen.getByText('Ticket promedio (ARO)')).toBeInTheDocument();
    expect(screen.getByText('Tarifa efectiva / h')).toBeInTheDocument();
    expect(screen.getByText('Horas por orden')).toBeInTheDocument();
    expect(screen.getByText('Margen de mano de obra')).toBeInTheDocument();
    expect(screen.getByText('Margen de repuestos')).toBeInTheDocument();
    expect(screen.getByText('Aprobación de presupuestos')).toBeInTheDocument();
    expect(screen.getByText('Días en el taller')).toBeInTheDocument();

    // Valores formateados
    expect(screen.getByText('8')).toBeInTheDocument(); // carros_entregados
    expect(screen.getByText('$625.00')).toBeInTheDocument(); // ticket_promedio
    expect(screen.getByText('$80.00')).toBeInTheDocument(); // tarifa_efectiva
    expect(screen.getByText('Ref: $90.00/h')).toBeInTheDocument();
    expect(screen.getByText('5 h')).toBeInTheDocument(); // horas_por_orden
    expect(screen.getByText('75.0%')).toBeInTheDocument(); // margen_mano_obra
    expect(screen.getByText('44.4%')).toBeInTheDocument(); // margen_repuestos
    expect(screen.getByText('82.5%')).toBeInTheDocument(); // aprobacion_presupuestos
    expect(screen.getByText('4.2 días')).toBeInTheDocument(); // dias_promedio_en_taller

    // Tabla por técnico
    expect(screen.getByText('Eficiencia por técnico')).toBeInTheDocument();
    expect(screen.getByText('Carlos Mecánico')).toBeInTheDocument();
    expect(screen.getByText('25 h')).toBeInTheDocument();
    expect(screen.getByText('20 h')).toBeInTheDocument();
    expect(screen.getByText('125.0%')).toBeInTheDocument();
  });

  it('muestra «—» cuando los valores son NULL (división por cero o sin datos)', async () => {
    const mockNullData: WorkshopMetrics = {
      carros_recibidos: 0,
      carros_entregados: 0,
      ventas_mano_obra: 0,
      ventas_repuestos: 0,
      costo_repuestos: 0,
      descuentos: 0,
      ticket_promedio: null,
      comisiones: 0,
      margen_mano_obra: null,
      margen_repuestos: null,
      horas_facturadas: 0,
      tarifa_efectiva: null,
      horas_por_orden: null,
      tarifa_hora_sede: null,
      aprobacion_presupuestos: null,
      dias_promedio_en_taller: null,
      por_tecnico: [],
    };

    vi.mocked(metricsService.getWorkshopMetrics).mockResolvedValueOnce(mockNullData);

    renderWithProviders(<WorkshopMetricsTab sedeId="sede-centro" />);

    expect(await screen.findByText('Carros entregados')).toBeInTheDocument();

    // Debe haber múltiples «—» correspondientes a los indicadores en null
    const dashes = screen.getAllByText('—');
    expect(dashes.length).toBeGreaterThanOrEqual(6);

    // Mensaje de tabla vacía de técnicos
    expect(screen.getByText('No hay datos de técnicos para el período seleccionado.')).toBeInTheDocument();
  });
});
