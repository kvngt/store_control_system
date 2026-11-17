// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Report } from './Report';
import { portalStrings } from '../strings';
import type { PortalReport } from '../portal.types';

const REPORT_WITH_INSPECTION: PortalReport = {
  estado_enlace: 'ok',
  taller: {
    nombre: 'Taller Centro',
    direccion: 'Oak 12',
    telefono: '555-0100',
    email: null,
    whatsapp: null,
    logo_url: null,
    color: '#1E40AF',
  },
  enlace: { expira_en: null },
  orden: {
    numero: 'ORD-2026-014',
    estatus: 'en_proceso',
    tipo_trabajo: 'mecanica',
    porcentaje_avance: 50,
    fecha_ingreso: '2026-10-01T15:00:00Z',
    fecha_estimada_entrega: '2026-10-05',
    fecha_finalizacion: null,
    millas_ingreso: 45000,
    nivel_gasolina: '1/2',
    notas_recepcion: null,
    firma_url: null,
    firma_fecha: null,
  },
  cliente: { nombre: 'Marta Ruiz', tiene_correo: false, acepta_correos: false },
  vehiculo: { marca: 'Toyota', modelo: 'Camry', anio: 2019, color: 'Gris', placa: 'ABC123', vin_final: '004352' },
  multimedia: [],
  cuenta: {
    mano_obra: [],
    repuestos: [],
    total_mano_obra: 0,
    total_repuestos: 0,
    total: 0,
    deposito: 0,
    pagado: 0,
    saldo: 0,
  },
  inspeccion: {
    nombre: 'Inspección multipunto',
    completada_en: '2026-10-01T16:00:00Z',
    resumen: { urgente: 1, atencion: 0, bien: 1 },
    puntos: [
      { id: 'p1', seccion: 'Frenos', nombre: 'Pastillas delanteras', estado: 'urgente', nota: 'Desgastadas' },
      { id: 'p2', seccion: 'Motor', nombre: 'Aceite', estado: 'bien', nota: null },
    ],
  },
  urls_vencen_en: new Date(Date.now() + 2 * 3600_000).toISOString(),
};

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('Report (portal) — módulo inspeccion', () => {
  it('muestra la sección de inspección cuando inspeccion está encendido', () => {
    render(
      <Report
        report={REPORT_WITH_INSPECTION}
        token={'a'.repeat(64)}
        s={portalStrings.es}
        language="es"
        onReload={vi.fn(async () => undefined)}
      />
    );

    expect(screen.getByTestId('inspection-section')).toBeInTheDocument();
    expect(screen.getByText('Inspección multipunto')).toBeInTheDocument();
  });

  it('oculta la sección de inspección cuando inspeccion está apagado', () => {
    vi.stubEnv('VITE_MODULOS_APAGADOS', 'inspeccion');
    render(
      <Report
        report={REPORT_WITH_INSPECTION}
        token={'a'.repeat(64)}
        s={portalStrings.es}
        language="es"
        onReload={vi.fn(async () => undefined)}
      />
    );

    expect(screen.queryByTestId('inspection-section')).not.toBeInTheDocument();
    expect(screen.queryByText('Inspección multipunto')).not.toBeInTheDocument();
  });
});
