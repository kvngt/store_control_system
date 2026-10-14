// @vitest-environment jsdom
//
// Página pública del sticker (/s/<token>): la abre el cliente o quien escanea el QR.
// Muestra el próximo servicio sin exponer datos personales (nombre del cliente, placa ni VIN).

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { ServiceResponse } from './portal.types';

const mocks = vi.hoisted(() => ({
  fetchService: vi.fn(),
}));

vi.mock('./portal.api', () => ({
  fetchService: mocks.fetchService,
}));

const { default: ServicePage } = await import('./ServicePage');

const TOKEN = 's'.repeat(64);

// La fecha local (como la calcula la página), no la de UTC: después de las 8 p. m. ya es mañana.
const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function sampleService(overrides: Partial<ServiceResponse> = {}): ServiceResponse {
  return {
    estado: 'ok',
    taller: {
      nombre: 'Taller San José',
      logo_url: 'https://example.com/logo.png',
      color: '#0d9488',
      telefonos: [
        { label: 'Atención', numero: '+13015550199', tipo: 'celular', whatsapp: true },
        { label: 'Oficina', numero: '+13015550100', tipo: 'oficina', whatsapp: false },
      ],
    },
    vehiculo: {
      marca: 'Toyota',
      modelo: 'Corolla',
      anio: 2021,
      color: 'Plata',
    },
    servicio: {
      fecha: '2026-11-20',
      millas: 45000,
      nota: 'Cambio de aceite 5W-30 y filtro de aire',
    },
    idioma: 'es',
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

describe('ServicePage', () => {
  it('con datos: renderiza taller, vehículo, fecha, millas, nota y botón de WhatsApp prellenado', async () => {
    mocks.fetchService.mockResolvedValue(sampleService());

    render(<ServicePage token={TOKEN} />);

    expect(await screen.findByText('Taller San José')).toBeInTheDocument();
    expect(screen.getByText(/2021 Toyota Corolla/)).toBeInTheDocument();
    expect(screen.getByText(/\(Plata\)/)).toBeInTheDocument();
    expect(screen.getByText('45,000 mi')).toBeInTheDocument();
    expect(screen.getByText('Cambio de aceite 5W-30 y filtro de aire')).toBeInTheDocument();

    // Botón de WhatsApp
    const waLink = screen.getByRole('link', { name: /Agendar por WhatsApp/i });
    expect(waLink).toBeInTheDocument();
    const href = waLink.getAttribute('href') ?? '';
    expect(href).toContain('https://wa.me/13015550199');
    expect(href).toContain(encodeURIComponent('2021 Toyota Corolla'));
  });

  it('semáforo: al_dia cuando faltan más de 14 días', async () => {
    // Calculamos una fecha futura a 30 días
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 30);
    const dateStr = ymd(futureDate);

    mocks.fetchService.mockResolvedValue(
      sampleService({
        servicio: { fecha: dateStr, millas: null, nota: 'Revisión periódica' },
      })
    );

    render(<ServicePage token={TOKEN} />);

    const badge = await screen.findByRole('status');
    expect(badge).toHaveClass('is-al_dia');
    expect(badge).toHaveTextContent(/Al día/);
  });

  it('semáforo: pronto cuando faltan 14 días o menos', async () => {
    const prontoDate = new Date();
    prontoDate.setDate(prontoDate.getDate() + 5);
    const dateStr = ymd(prontoDate);

    mocks.fetchService.mockResolvedValue(
      sampleService({
        servicio: { fecha: dateStr, millas: null, nota: 'Frenos' },
      })
    );

    render(<ServicePage token={TOKEN} />);

    const badge = await screen.findByRole('status');
    expect(badge).toHaveClass('is-pronto');
    expect(badge).toHaveTextContent(/Próximo a vencer|Due soon/);
  });

  it('semáforo: vencido cuando la fecha ya pasó', async () => {
    const pastDate = new Date();
    pastDate.setDate(pastDate.getDate() - 10);
    const dateStr = ymd(pastDate);

    mocks.fetchService.mockResolvedValue(
      sampleService({
        servicio: { fecha: dateStr, millas: null, nota: 'Mantenimiento' },
      })
    );

    render(<ServicePage token={TOKEN} />);

    const badge = await screen.findByRole('status');
    expect(badge).toHaveClass('is-vencido');
    expect(badge).toHaveTextContent(/Vencido/);
  });

  it('semáforo: solo_millas cuando no hay fecha pero sí millas', async () => {
    mocks.fetchService.mockResolvedValue(
      sampleService({
        servicio: { fecha: null, millas: 60000, nota: 'Cambio de faja' },
      })
    );

    render(<ServicePage token={TOKEN} />);

    const badge = await screen.findByRole('status');
    expect(badge).toHaveClass('is-solo_millas');
    expect(badge).toHaveTextContent('60,000');
  });

  it('privacidad: confirma que en el DOM NUNCA aparecen nombre del cliente, placa ni VIN', async () => {
    mocks.fetchService.mockResolvedValue(sampleService());

    const { container } = render(<ServicePage token={TOKEN} />);
    await screen.findByText('Taller San José');

    const html = container.innerHTML;

    // Regresión de privacidad: estos datos jamás deben ser filtrados ni expuestos
    expect(html).not.toMatch(/Marta/i);
    expect(html).not.toMatch(/Ruiz/i);
    expect(html).not.toMatch(/ABC-?123/i);
    expect(html).not.toMatch(/VIN/i);
    expect(html).not.toMatch(/cliente/i);
    expect(html).not.toMatch(/placa/i);
  });

  it('con estado no_existe: muestra mensaje amigable', async () => {
    mocks.fetchService.mockResolvedValue({ estado: 'no_existe' });

    render(<ServicePage token={TOKEN} />);

    // Sin datos no hay idioma del cliente: la página sale en el del navegador.
    expect(
      await screen.findByRole('heading', { name: /Servicio no encontrado|Service not found/ })
    ).toBeInTheDocument();
    expect(screen.getByText(/ya no está disponible|no longer available/i)).toBeInTheDocument();
  });
});
