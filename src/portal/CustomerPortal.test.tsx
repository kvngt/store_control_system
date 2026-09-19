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
  answerQuote: vi.fn(),
}));

vi.mock('./portal.api', () => ({
  fetchPortal: mocks.fetchPortal,
  setEmailPreference: mocks.setEmailPreference,
  answerQuote: mocks.answerQuote,
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
      estatus: 'espera_autorizacion',
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
        id: 'm1', tipo: 'foto', origen: 'recepcion', avance_id: null, zona: 'front', mime: 'image/jpeg', duracion_seg: null,
        ancho: 1920, alto: 1080, creado_en: '2026-09-10T15:01:00Z',
        url: 'https://storage.example/foto.jpg', miniatura_url: 'https://storage.example/foto-thumb.jpg',
      },
      {
        id: 'm2', tipo: 'video', origen: 'avance', avance_id: null, zona: null, mime: 'video/mp4', duracion_seg: 75,
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
  // Lo que el técnico marcó como visible: su fecha y su texto, agrupando sus archivos.
  it('muestra los avances que el taller publicó, sin nombrar a nadie', async () => {
    mocks.fetchPortal.mockResolvedValue({
      ...report(),
      avances: [{ id: 'av-1', fecha: '2026-09-18T15:00:00Z', mensaje: 'Ya lijamos la puerta.' }],
    });
    render(<CustomerPortal token={TOKEN} />);

    expect(await screen.findByText('Ya lijamos la puerta.')).toBeInTheDocument();
  });

  // Un avance publicado que solo trae archivos: el hueco del texto no se queda en blanco.
  it('un avance sin texto dice que el taller compartió archivos', async () => {
    mocks.fetchPortal.mockResolvedValue({
      ...report(),
      avances: [{ id: 'av-2', fecha: '2026-09-18T15:00:00Z', mensaje: null }],
    });
    render(<CustomerPortal token={TOKEN} />);

    expect(await screen.findByText('El taller compartió archivos de este avance.')).toBeInTheDocument();
  });

  it('muestra el estado, el vehículo, lo publicado y la cuenta', async () => {
    mocks.fetchPortal.mockResolvedValue(report());
    render(<CustomerPortal token={TOKEN} />);

    expect(await screen.findByRole('heading', { name: /2019 Toyota Camry/ })).toBeInTheDocument();
    expect(mocks.fetchPortal).toHaveBeenCalledWith(TOKEN, expect.anything());
    expect(screen.getAllByText('Esperando su autorización').length).toBeGreaterThan(0);
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

  describe('presupuesto', () => {
    const LINE_A = '11111111-1111-4111-8111-111111111111';
    const LINE_B = '22222222-2222-4222-8222-222222222222';
    const withQuote = () =>
      report({
        presupuesto: {
          id: '33333333-3333-4333-8333-333333333333',
          numero: 2,
          enviado_en: '2026-09-12T15:00:00Z',
          total: 700,
          lineas: [
            { id: LINE_A, tipo: 'mano_obra', descripcion: 'Alineación', cantidad: 1, precio_unitario: 200, monto: 200 },
            { id: LINE_B, tipo: 'mano_obra', descripcion: 'Pintura de puerta', cantidad: 1, precio_unitario: 500, monto: 500 },
          ],
        },
      });

    it('nada viene marcado y autorizar exige marcar algo y escribir el nombre', async () => {
      mocks.fetchPortal.mockResolvedValue(withQuote());
      render(<CustomerPortal token={TOKEN} />);

      const section = (await screen.findByRole('heading', { name: /Presupuesto por autorizar/ })).closest('section')!;
      const authorize = within(section).getByRole('button', { name: /Autorizar lo marcado/ });
      expect(authorize).toBeDisabled();

      await userEvent.click(within(section).getByLabelText(/Alineación/));
      expect(authorize).toBeDisabled();
      await userEvent.type(within(section).getByLabelText('Su nombre'), 'Marta Ruiz');
      expect(authorize).toBeEnabled();
      expect(within(section).getByText('Total autorizado').parentElement).toHaveTextContent('$200.00');
    });

    it('manda lo marcado y todas las líneas que vio, y muestra la confirmación', async () => {
      mocks.fetchPortal.mockResolvedValueOnce(withQuote()).mockResolvedValue(report());
      mocks.answerQuote.mockResolvedValue({ ok: true, autorizados: 1, rechazados: 1, total_autorizado: 200 });
      vi.spyOn(window, 'confirm').mockReturnValue(true);
      render(<CustomerPortal token={TOKEN} />);

      const section = (await screen.findByRole('heading', { name: /Presupuesto por autorizar/ })).closest('section')!;
      await userEvent.click(within(section).getByLabelText(/Alineación/));
      await userEvent.type(within(section).getByLabelText('Su nombre'), 'Marta Ruiz');
      await userEvent.click(within(section).getByRole('button', { name: /Autorizar lo marcado/ }));

      expect(mocks.answerQuote).toHaveBeenCalledWith(TOKEN, {
        quoteId: '33333333-3333-4333-8333-333333333333',
        approvedIds: [LINE_A],
        shownIds: [LINE_A, LINE_B],
        name: 'Marta Ruiz',
        comment: '',
      });
      expect(await screen.findByText(/Guardamos su respuesta/)).toBeInTheDocument();
      expect(screen.queryByRole('heading', { name: /Presupuesto por autorizar/ })).not.toBeInTheDocument();
    });

    it('si el taller cambió el presupuesto, lo explica y lo vuelve a pedir', async () => {
      mocks.fetchPortal.mockResolvedValue(withQuote());
      mocks.answerQuote.mockResolvedValue({ ok: false, motivo: 'presupuesto_cambio' });
      vi.spyOn(window, 'confirm').mockReturnValue(true);
      render(<CustomerPortal token={TOKEN} />);

      const section = (await screen.findByRole('heading', { name: /Presupuesto por autorizar/ })).closest('section')!;
      await userEvent.type(within(section).getByLabelText('Su nombre'), 'Marta Ruiz');
      await userEvent.click(within(section).getByRole('button', { name: 'No autorizar nada' }));

      expect(mocks.answerQuote).toHaveBeenCalledWith(TOKEN, expect.objectContaining({ approvedIds: [] }));
      expect(await screen.findByText(/actualizó el presupuesto/)).toBeInTheDocument();
      expect(mocks.fetchPortal).toHaveBeenCalledTimes(2);
    });

    it('en la cuenta separa lo no autorizado', async () => {
      mocks.fetchPortal.mockResolvedValue(
        report({ cuenta: { ...report().cuenta, no_autorizados: [{ descripcion: 'Pintura de puerta', monto: 500 }] } })
      );
      render(<CustomerPortal token={TOKEN} />);
      expect(await screen.findByText(/No autorizados/)).toBeInTheDocument();
      expect(screen.getByText('Pintura de puerta')).toBeInTheDocument();
    });
  });

  it('cambia a inglés y lo recuerda', async () => {
    mocks.fetchPortal.mockResolvedValue(report());
    render(<CustomerPortal token={TOKEN} />);

    await userEvent.click(await screen.findByRole('button', { name: /English/ }));
    expect(screen.getByText('Balance due')).toBeInTheDocument();
    expect(localStorage.getItem('restorify_portal_lang')).toBe('en');
  });
});
