// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { PortalReport } from './portal.types';

const mocks = vi.hoisted(() => ({
  fetchPortal: vi.fn(),
  setEmailPreference: vi.fn(),
  answerQuote: vi.fn(),
  setLanguagePreference: vi.fn(async () => undefined),
}));

vi.mock('./portal.api', () => ({
  fetchPortal: mocks.fetchPortal,
  setEmailPreference: mocks.setEmailPreference,
  answerQuote: mocks.answerQuote,
  setLanguagePreference: mocks.setLanguagePreference,
}));

const { default: CustomerPortal } = await import('./CustomerPortal');

const TOKEN = 'a'.repeat(64);

function baseReport(overrides: Partial<PortalReport> = {}): PortalReport {
  return {
    estado_enlace: 'ok',
    taller: {
      nombre: 'Taller San José',
      direccion: 'Av. Central 123',
      telefono: '555-0100',
      email: null,
      whatsapp: '555-0101',
      logo_url: null,
      color: '#1E40AF',
    },
    enlace: { expira_en: null },
    orden: {
      numero: 'ORD-2026-050',
      estatus: 'en_proceso',
      tipo_trabajo: 'mecanica',
      porcentaje_avance: 50,
      fecha_ingreso: '2026-10-10T08:00:00Z',
      fecha_estimada_entrega: '2026-10-15',
      fecha_finalizacion: null,
      millas_ingreso: 50000,
      nivel_gasolina: '1/2',
      notas_recepcion: null,
      firma_url: null,
      firma_fecha: null,
    },
    cliente: { nombre: 'Juan Pérez', tiene_correo: false, acepta_correos: false, idioma: 'es' },
    vehiculo: { marca: 'Honda', modelo: 'Civic', anio: 2020, color: 'Blanco', placa: 'XYZ789', vin_final: '123456' },
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
    urls_vencen_en: '2026-10-10T12:00:00Z',
    ...overrides,
  };
}

describe('CustomerPortal - Inspection Section', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.setItem('restorify_portal_lang', 'es');
  });

  it('renders inspection section with summary chips and points when report has inspection', async () => {
    const reportWithInspection = baseReport({
      multimedia: [
        {
          id: 'media-pt-1',
          tipo: 'foto',
          origen: 'inspeccion',
          avance_id: null,
          inspeccion_punto_id: 'pt-1',
          zona: null,
          mime: 'image/jpeg',
          duracion_seg: null,
          ancho: 800,
          alto: 600,
          creado_en: '2026-10-10T09:00:00Z',
          url: 'https://storage.example/freno-urgente.jpg',
          miniatura_url: 'https://storage.example/freno-urgente-thumb.jpg',
        },
      ],
      inspeccion: {
        nombre: 'Inspección multipunto de seguridad',
        completada_en: '2026-10-10T09:30:00Z',
        resumen: {
          urgente: 1,
          atencion: 1,
          bien: 2,
        },
        puntos: [
          {
            id: 'pt-1',
            seccion: 'Frenos',
            nombre: 'Pastillas delanteras',
            estado: 'urgente',
            nota: 'Espesor menor a 2mm, cambio inmediato necesario.',
          },
          {
            id: 'pt-2',
            seccion: 'Llantas',
            nombre: 'Presión de llantas',
            estado: 'atencion',
            nota: 'Baja presión en rueda trasera derecha.',
          },
          {
            id: 'pt-3',
            seccion: 'Fluidos',
            nombre: 'Aceite de motor',
            estado: 'bien',
            nota: null,
          },
          {
            id: 'pt-4',
            seccion: 'Luces',
            nombre: 'Faros delanteros',
            estado: 'bien',
            nota: null,
          },
        ],
      },
    });

    mocks.fetchPortal.mockResolvedValueOnce(reportWithInspection);

    render(<CustomerPortal token={TOKEN} />);

    // Title of the inspection section
    expect(await screen.findByText('Inspección multipunto de seguridad')).toBeInTheDocument();

    // Summary chips
    expect(screen.getByTestId('chip-urgente')).toHaveTextContent('1 urgente');
    expect(screen.getByTestId('chip-atencion')).toHaveTextContent('1 atención');
    expect(screen.getByTestId('chip-bien')).toHaveTextContent('2 en buen estado');

    // Urgent and attention point names and notes
    expect(screen.getByText('Pastillas delanteras')).toBeInTheDocument();
    expect(screen.getByText('Espesor menor a 2mm, cambio inmediato necesario.')).toBeInTheDocument();
    expect(screen.getByText('Presión de llantas')).toBeInTheDocument();
    expect(screen.getByText('Baja presión en rueda trasera derecha.')).toBeInTheDocument();

    // Section names
    expect(screen.getAllByText('Frenos').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Llantas').length).toBeGreaterThan(0);

    // Collapsible good points list title
    expect(screen.getByText(/Puntos en buen estado \(2\)/i)).toBeInTheDocument();
    expect(screen.getByText('Aceite de motor')).toBeInTheDocument();
    expect(screen.getByText('Faros delanteros')).toBeInTheDocument();
  });

  it('does not render inspection section when report has no inspection', async () => {
    const reportWithoutInspection = baseReport({ inspeccion: null });
    mocks.fetchPortal.mockResolvedValueOnce(reportWithoutInspection);

    render(<CustomerPortal token={TOKEN} />);

    await screen.findAllByText(/ORD-2026-050/);
    expect(screen.queryByTestId('inspection-section')).not.toBeInTheDocument();
  });
});
