// @vitest-environment jsdom
//
// El reporte del cliente: lo abre alguien que no es del taller. Tiene que decirle
// en qué va su vehículo, mostrarle solo lo que el taller publicó, y no dejarlo sin
// salida cuando el enlace ya no sirve.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { PortalReport } from './portal.types';

const mocks = vi.hoisted(() => ({
  fetchPortal: vi.fn(),
  setEmailPreference: vi.fn(),
}));

vi.mock('./portal.api', () => ({
  fetchPortal: mocks.fetchPortal,
  setEmailPreference: mocks.setEmailPreference,
}));

const { default: CustomerPortal } = await import('./CustomerPortal');

const TOKEN = 'f'.repeat(64);

function report(overrides: Partial<PortalReport> = {}): PortalReport {
  return {
    estado_enlace: 'ok',
    taller: {
      nombre: 'Reinventa Norte',
      direccion: 'Oak 12',
      telefono: '512-555-0100',
      email: null,
      whatsapp: '512-555-0199',
      logo_url: null,
      color: '#1E40AF',
    },
    enlace: { expira_en: null },
    orden: {
      numero: 'ORD-2026-014',
      estatus: 'espera_repuestos',
      tipo_trabajo: 'mecanica',
      porcentaje_avance: 40,
      fecha_ingreso: '2026-09-10T15:00:00Z',
      fecha_estimada_entrega: '2026-10-01',
      fecha_finalizacion: null,
      millas_ingreso: 45210,
      nivel_gasolina: '1/2',
      notas_recepcion: 'Rayón en la puerta trasera.',
      firma_url: 'https://storage.example/firma.png?token=x',
      firma_fecha: '2026-09-10T15:10:00Z',
    },
    cliente: { nombre: 'Marta Ruiz', tiene_correo: true, acepta_correos: true },
    vehiculo: { marca: 'Toyota', modelo: 'Camry', anio: 2019, color: 'Gris', placa: 'ABC123', vin_final: '004352' },
    multimedia: [
      {
        id: 'm1', tipo: 'foto', origen: 'recepcion', zona: 'front', mime: 'image/jpeg', duracion_seg: null,
        ancho: 1920, alto: 1080, creado_en: '2026-09-10T15:01:00Z',
        url: 'https://storage.example/foto.jpg', miniatura_url: 'https://storage.example/foto-thumb.jpg',
      },
      {
        id: 'm2', tipo: 'video', origen: 'avance', zona: null, mime: 'video/mp4', duracion_seg: 75,
        ancho: 1280, alto: 720, creado_en: '2026-09-11T18:00:00Z',
        url: 'https://storage.example/video.mp4', miniatura_url: 'https://storage.example/video-thumb.jpg',
      },
    ],
    cuenta: {
      mano_obra: [{ descripcion: 'Cambio de frenos', monto: 300 }],
      repuestos: [{ descripcion: 'Pastillas', cantidad: 2, precio_unitario: 50, subtotal: 100 }],
      total_mano_obra: 300,
      total_repuestos: 100,
      total: 400,
      deposito: 100,
      pagado: 100,
      saldo: 300,
    },
    urls_vencen_en: new Date(Date.now() + 2 * 3600_000).toISOString(),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  window.history.replaceState(null, '', `/r/${TOKEN}`);
  Object.defineProperty(navigator, 'language', { value: 'es-US', configurable: true });
});

describe('CustomerPortal', () => {
  it('muestra el estado, el vehículo, lo publicado y la cuenta', async () => {
    mocks.fetchPortal.mockResolvedValue(report());
    render(<CustomerPortal token={TOKEN} />);

    expect(await screen.findByRole('heading', { name: /2019 Toyota Camry/ })).toBeInTheDocument();
    expect(mocks.fetchPortal).toHaveBeenCalledWith(TOKEN, expect.anything());
    expect(screen.getAllByText('Esperando repuestos').length).toBeGreaterThan(0);
    expect(screen.getByText(/VIN termina en 004352/)).toBeInTheDocument();
    expect(screen.getByText('Rayón en la puerta trasera.')).toBeInTheDocument();
    expect(screen.getByAltText('Firma del cliente')).toHaveAttribute('src', expect.stringContaining('firma.png'));
    // Un video del avance en la sección de avances, con su duración.
    expect(screen.getByRole('button', { name: 'Video' })).toHaveTextContent('1:15');
    // La cuenta: total, depósito, pagado y saldo en dólares.
    expect(screen.getByText('Cambio de frenos')).toBeInTheDocument();
    expect(screen.getByText('Saldo pendiente').parentElement).toHaveTextContent('$300.00');
  });

  it('abre el video al tocarlo, en el visor', async () => {
    mocks.fetchPortal.mockResolvedValue(report());
    render(<CustomerPortal token={TOKEN} />);

    await userEvent.click(await screen.findByRole('button', { name: 'Video' }));
    const dialog = screen.getByRole('dialog');
    expect(dialog.querySelector('video')).toHaveAttribute('src', 'https://storage.example/video.mp4');
  });

  it('ofrece WhatsApp solo con el número del taller y llamar con su teléfono', async () => {
    mocks.fetchPortal.mockResolvedValue(report());
    render(<CustomerPortal token={TOKEN} />);

    const whatsapp = await screen.findByRole('link', { name: /WhatsApp/ });
    expect(whatsapp.getAttribute('href')).toMatch(/^https:\/\/wa\.me\/15125550199\?text=/);
    expect(screen.getByRole('link', { name: /Llamar/ })).toHaveAttribute('href', 'tel:5125550100');
  });

  it('dice "pagado en su totalidad" cuando no queda saldo', async () => {
    mocks.fetchPortal.mockResolvedValue(
      report({ cuenta: { ...report().cuenta, pagado: 400, saldo: 0 }, orden: { ...report().orden, estatus: 'entregado' } })
    );
    render(<CustomerPortal token={TOKEN} />);
    expect(await screen.findByText('Pagado en su totalidad')).toBeInTheDocument();
    expect(screen.queryByText('Saldo pendiente')).not.toBeInTheDocument();
  });

  it('con un enlace vencido explica qué pasó y deja llamar al taller', async () => {
    mocks.fetchPortal.mockResolvedValue({ estado_enlace: 'vencido', taller: report().taller });
    render(<CustomerPortal token={TOKEN} />);

    expect(await screen.findByRole('heading', { name: 'Este enlace venció' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Llamar/ })).toHaveAttribute('href', 'tel:5125550100');
  });

  it('con una ruta sin token válido no pide nada al servidor', () => {
    render(<CustomerPortal token={null} />);
    expect(screen.getByRole('heading', { name: 'Enlace no válido' })).toBeInTheDocument();
    expect(mocks.fetchPortal).not.toHaveBeenCalled();
  });

  it('si la red falla deja reintentar', async () => {
    mocks.fetchPortal.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(report());
    render(<CustomerPortal token={TOKEN} />);

    await userEvent.click(await screen.findByRole('button', { name: 'Intentar de nuevo' }));
    expect(await screen.findByRole('heading', { name: /2019 Toyota Camry/ })).toBeInTheDocument();
  });

  it('la baja de correos se confirma con un botón, nunca al abrir el enlace', async () => {
    window.history.replaceState(null, '', `/r/${TOKEN}?correos=baja`);
    mocks.fetchPortal.mockResolvedValue(report());
    mocks.setEmailPreference.mockResolvedValue(false);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<CustomerPortal token={TOKEN} />);

    const section = (await screen.findByRole('heading', { name: /Avisos por correo/ })).closest('section')!;
    // Abrir el enlace de baja no da de baja: un filtro de correo lo abre solo.
    expect(mocks.setEmailPreference).not.toHaveBeenCalled();
    await userEvent.click(within(section).getByRole('button', { name: 'Dejar de recibir correos' }));

    await waitFor(() => expect(mocks.setEmailPreference).toHaveBeenCalledWith(TOKEN, false));
    expect(await within(section).findByRole('button', { name: 'Volver a recibir correos' })).toBeInTheDocument();
  });

  it('cambia a inglés y lo recuerda', async () => {
    mocks.fetchPortal.mockResolvedValue(report());
    render(<CustomerPortal token={TOKEN} />);

    await userEvent.click(await screen.findByRole('button', { name: /English/ }));
    expect(screen.getByText('Balance due')).toBeInTheDocument();
    expect(localStorage.getItem('restorify_portal_lang')).toBe('en');
  });
});
