// @vitest-environment jsdom

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { useFormatters } from '../format';
import type { PortalReport } from '../portal.types';
import { portalStrings, type PortalLanguage } from '../strings';
import { QuoteOutcome } from './QuoteOutcome';

function OutcomeHarness({ report, language = 'es' }: { report: PortalReport; language?: PortalLanguage }) {
  const fmt = useFormatters(language);
  return <QuoteOutcome report={report} s={portalStrings[language]} fmt={fmt} />;
}

function baseReport(overrides: Partial<PortalReport> = {}): PortalReport {
  return {
    estado_enlace: 'ok',
    taller: {
      nombre: 'Taller Test',
      direccion: null,
      telefono: null,
      email: null,
      whatsapp: null,
      logo_url: null,
      color: null,
    },
    enlace: { expira_en: null },
    orden: {
      numero: 'ORD-1',
      estatus: 'en_proceso',
      tipo_trabajo: 'mecanica',
      porcentaje_avance: 50,
      fecha_ingreso: '2026-10-01T15:00:00Z',
      fecha_estimada_entrega: null,
      fecha_finalizacion: null,
      millas_ingreso: 10000,
      nivel_gasolina: '1/2',
      notas_recepcion: null,
      firma_url: null,
      firma_fecha: null,
    },
    cliente: { nombre: 'Ana', tiene_correo: false, acepta_correos: false },
    vehiculo: { marca: 'Toyota', modelo: 'Corolla', anio: 2020, color: 'Gris', placa: 'ABC123', vin_final: '123456' },
    multimedia: [],
    presupuestos_respondidos: [
      {
        numero: 1,
        respondido_en: '2026-10-02T16:30:00Z',
        via: 'cliente_portal',
        nombre: 'Ana',
        total_aprobado: 390,
        autorizados: 2,
        rechazados: 1,
      },
    ],
    cuenta: {
      mano_obra: [],
      repuestos: [],
      no_autorizados: [{ descripcion: 'Pulido de faros', monto: 85 }],
      total_mano_obra: 390,
      total_repuestos: 0,
      total: 390,
      deposito: 0,
      pagado: 0,
      saldo: 390,
    },
    urls_vencen_en: '2026-10-02T18:30:00Z',
    ...overrides,
  };
}

describe('QuoteOutcome', () => {
  it('muestra el resumen sin número, solo con el total, cuando el cliente aprobó por el portal', () => {
    render(<OutcomeHarness report={baseReport()} />);

    expect(screen.getByRole('heading', { name: 'Usted aprobó trabajos por $390.00' })).toBeInTheDocument();
    expect(screen.getByText(/No autorizados/)).toBeInTheDocument();
    expect(screen.getByText('Pulido de faros')).toBeInTheDocument();
    expect(screen.getByText('$85.00')).toBeInTheDocument();
  });

  it('el título no cuenta líneas: igual con 1 línea autorizada, en español y en inglés', () => {
    const singleReport = baseReport({
      presupuestos_respondidos: [
        {
          numero: 2,
          respondido_en: '2026-10-02T16:30:00Z',
          via: 'cliente_portal',
          nombre: 'Ana',
          total_aprobado: 200,
          autorizados: 1,
          rechazados: 0,
        },
      ],
      cuenta: { ...baseReport().cuenta, no_autorizados: [] },
    });

    const { rerender } = render(<OutcomeHarness report={singleReport} language="es" />);
    expect(screen.getByRole('heading', { name: 'Usted aprobó trabajos por $200.00' })).toBeInTheDocument();

    rerender(<OutcomeHarness report={singleReport} language="en" />);
    expect(screen.getByRole('heading', { name: 'You approved work for $200.00' })).toBeInTheDocument();
  });

  it('cuando no aprobó nada muestra el título de rechazo y la lista de no aprobados', () => {
    const declinedReport = baseReport({
      presupuestos_respondidos: [
        {
          numero: 1,
          respondido_en: '2026-10-02T16:30:00Z',
          via: 'cliente_portal',
          nombre: 'Ana',
          total_aprobado: 0,
          autorizados: 0,
          rechazados: 2,
        },
      ],
      cuenta: {
        ...baseReport().cuenta,
        no_autorizados: [
          { descripcion: 'Alineación', monto: 120 },
          { descripcion: 'Balanceo', monto: 60 },
        ],
      },
    });

    const { rerender } = render(<OutcomeHarness report={declinedReport} language="es" />);
    expect(screen.getByRole('heading', { name: 'Usted no aprobó ningún trabajo de este presupuesto' })).toBeInTheDocument();
    expect(screen.getByText('Alineación')).toBeInTheDocument();
    expect(screen.getByText('Balanceo')).toBeInTheDocument();

    rerender(<OutcomeHarness report={declinedReport} language="en" />);
    expect(screen.getByRole('heading', { name: 'You did not approve any work in this estimate' })).toBeInTheDocument();
  });

  it('cuando hay más de 5 no aprobados muestra solo 5 y "y N más"', () => {
    const manyDeclined = Array.from({ length: 7 }, (_, i) => ({
      descripcion: `Trabajo rechazado ${i + 1}`,
      monto: (i + 1) * 10,
    }));
    const manyReport = baseReport({
      cuenta: { ...baseReport().cuenta, no_autorizados: manyDeclined },
    });

    const { rerender } = render(<OutcomeHarness report={manyReport} language="es" />);
    expect(screen.getByText('Trabajo rechazado 1')).toBeInTheDocument();
    expect(screen.getByText('Trabajo rechazado 5')).toBeInTheDocument();
    expect(screen.queryByText('Trabajo rechazado 6')).not.toBeInTheDocument();
    expect(screen.getByText('y 2 más')).toBeInTheDocument();

    rerender(<OutcomeHarness report={manyReport} language="en" />);
    expect(screen.getByText('and 2 more')).toBeInTheDocument();
  });

  it('no sale cuando hay un presupuesto pendiente', () => {
    const pendingReport = baseReport({
      presupuesto: {
        id: 'p-1',
        numero: 2,
        enviado_en: '2026-10-03T12:00:00Z',
        total: 150,
        lineas: [{ id: 'l-1', tipo: 'mano_obra', descripcion: 'Diagnóstico', cantidad: 1, precio_unitario: 150, monto: 150 }],
      },
    });

    const { container } = render(<OutcomeHarness report={pendingReport} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('no sale si la respuesta la registró administración por teléfono', () => {
    const phoneReport = baseReport({
      presupuestos_respondidos: [
        {
          numero: 1,
          respondido_en: '2026-10-02T16:30:00Z',
          via: 'admin_telefono',
          nombre: 'Ana',
          total_aprobado: 390,
          autorizados: 2,
          rechazados: 0,
        },
      ],
    });

    const { container } = render(<OutcomeHarness report={phoneReport} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('no sale si la orden fue retirada sin reparar', () => {
    const withdrawnReport = baseReport({
      orden: { ...baseReport().orden, estatus: 'entregado', retirada_sin_reparar: true },
    });

    const { container } = render(<OutcomeHarness report={withdrawnReport} />);
    expect(container).toBeEmptyDOMElement();
  });
});
