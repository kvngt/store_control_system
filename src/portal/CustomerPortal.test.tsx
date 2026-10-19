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
  setLanguagePreference: vi.fn(async () => undefined),
}));

vi.mock('./portal.api', () => ({
  fetchPortal: mocks.fetchPortal,
  setEmailPreference: mocks.setEmailPreference,
  answerQuote: mocks.answerQuote,
  setLanguagePreference: mocks.setLanguagePreference,
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
  // 06/10/2026: lo escrito a mano solo salía traducido en el PDF; el enlace lo mostraba en
  // español aunque el cliente lo pidiera en inglés.
  it('en inglés muestra lo escrito por el taller traducido, y guarda el idioma del cliente', async () => {
    mocks.fetchPortal.mockResolvedValue({
      ...report(),
      avances: [{ id: 'av-1', fecha: '2026-09-18T15:00:00Z', mensaje: 'Ya lijamos la puerta.' }],
      traducciones: {
        'Ya lijamos la puerta.': 'We already sanded the door.',
        'Cambio de frenos': 'Brake replacement',
        'Rayón en la puerta trasera.': 'Scratch on the rear door.',
      },
    });
    const user = userEvent.setup();
    render(<CustomerPortal token={TOKEN} />);

    expect(await screen.findByText('Ya lijamos la puerta.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /English/ }));

    expect(await screen.findByText('We already sanded the door.')).toBeInTheDocument();
    expect(screen.getAllByText('Brake replacement').length).toBeGreaterThan(0);
    expect(screen.getByText('Scratch on the rear door.')).toBeInTheDocument();
    // Lo que no tiene traducción se queda como se escribió.
    expect(screen.getAllByText('Pastillas').length).toBeGreaterThan(0);
    expect(mocks.setLanguagePreference).toHaveBeenCalledWith(TOKEN, 'en');
  });

  // Los correos salen en inglés por defecto: quien nunca eligió en este navegador abre el
  // enlace en el idioma de sus correos.
  it('sin una elección guardada, abre en el idioma del cliente', async () => {
    mocks.fetchPortal.mockResolvedValue({
      ...report(),
      cliente: { nombre: 'Marta Ruiz', tiene_correo: true, acepta_correos: true, idioma: 'en' },
    });
    render(<CustomerPortal token={TOKEN} />);

    expect(await screen.findByRole('button', { name: /Español/ })).toBeInTheDocument();
  });

  // Lo que el técnico marcó como visible: su fecha y su texto, agrupando sus archivos.
  it('muestra los avances que el taller publicó, sin nombrar a nadie', async () => {
    mocks.fetchPortal.mockResolvedValue({
      ...report(),
      avances: [{ id: 'av-1', fecha: '2026-09-18T15:00:00Z', mensaje: 'Ya lijamos la puerta.' }],
    });
    render(<CustomerPortal token={TOKEN} />);

    expect(await screen.findByText('Ya lijamos la puerta.')).toBeInTheDocument();
  });

  // F6: lo que el taller vio y el cliente no tiene que autorizar. Sin observaciones, la sección
  // no aparece.
  it('muestra las observaciones del taller solo cuando hay', async () => {
    mocks.fetchPortal.mockResolvedValue({
      ...report(),
      observaciones: [{ id: 'h-1', fecha: '2026-10-04T15:00:00Z', texto: 'Las llantas traseras están a la mitad.' }],
    });
    const { unmount } = render(<CustomerPortal token={TOKEN} />);

    expect(await screen.findByRole('heading', { name: 'Observaciones del taller' })).toBeInTheDocument();
    expect(screen.getByText('Las llantas traseras están a la mitad.')).toBeInTheDocument();
    unmount();

    mocks.fetchPortal.mockResolvedValue({ ...report(), observaciones: [] });
    render(<CustomerPortal token={TOKEN} />);
    await screen.findByRole('heading', { name: /2019 Toyota Camry/ });
    expect(screen.queryByRole('heading', { name: 'Observaciones del taller' })).toBeNull();
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
    // En el resumen de la tarjeta cerrada y en su última línea.
    expect(await screen.findAllByText('Pagado en su totalidad')).toHaveLength(2);
    expect(screen.queryByText('Saldo pendiente')).not.toBeInTheDocument();
  });

  it('con un enlace vencido explica qué pasó y deja llamar al taller', async () => {
    mocks.fetchPortal.mockResolvedValue({ estado_enlace: 'vencido', taller: report().taller });
    render(<CustomerPortal token={TOKEN} />);

    expect(await screen.findByRole('heading', { name: 'Este enlace venció' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Llamar/ })).toHaveAttribute('href', 'tel:5125550100');
  });

  describe('teléfonos de la sede (09/10/2026)', () => {
    const telefonos = [
      { label: 'Spanish', numero: '202-607-6126', tipo: 'celular' as const, whatsapp: true },
      { label: 'English', numero: '240-355-1266', tipo: 'celular' as const, whatsapp: true },
      { label: 'Office', numero: '301-909-9937', tipo: 'oficina' as const, whatsapp: false },
    ];

    it('muestra cada teléfono con su descripción o tipo, 3 llamadas y 2 WhatsApps', async () => {
      mocks.fetchPortal.mockResolvedValue(report({ taller: { ...report().taller, telefonos } }));
      render(<CustomerPortal token={TOKEN} />);

      expect(await screen.findByText('Spanish', { selector: '.portal-contact-phone-label' })).toBeInTheDocument();
      expect(screen.getByText('English', { selector: '.portal-contact-phone-label' })).toBeInTheDocument();
      expect(screen.getByText('Office', { selector: '.portal-contact-phone-label' })).toBeInTheDocument();

      const calls = screen.getAllByRole('link', { name: /^Llamar:/ });
      expect(calls.map((a) => a.getAttribute('href'))).toEqual(['tel:2026076126', 'tel:2403551266', 'tel:3019099937']);

      const waLinks = screen.getAllByRole('link', { name: /^WhatsApp:/ });
      expect(waLinks).toHaveLength(2);
      expect(waLinks[0].getAttribute('href')).toMatch(/^https:\/\/wa\.me\/12026076126\?text=/);
      expect(waLinks[1].getAttribute('href')).toMatch(/^https:\/\/wa\.me\/12403551266\?text=/);
      expect(waLinks[0].getAttribute('href')).toContain(encodeURIComponent(report().orden.numero));
      expect(waLinks[1].getAttribute('href')).toContain(encodeURIComponent(report().orden.numero));

      // Ningún enlace al WhatsApp suelto del fixture
      const allLinks = screen.getAllByRole('link');
      expect(allLinks.some((a) => a.getAttribute('href')?.includes('15125550199'))).toBe(false);
    });

    it('un teléfono sin descripción muestra "Celular" (su tipo traducido)', async () => {
      mocks.fetchPortal.mockResolvedValue(
        report({
          taller: {
            ...report().taller,
            telefonos: [{ label: '', numero: '202-607-6126', tipo: 'celular' as const, whatsapp: true }],
          },
        })
      );
      render(<CustomerPortal token={TOKEN} />);

      expect(await screen.findByText('Celular')).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Llamar: Celular, 202-607-6126' })).toBeInTheDocument();
    });

    it('también con un enlace vencido muestra los mismos botones', async () => {
      mocks.fetchPortal.mockResolvedValue({ estado_enlace: 'vencido', taller: { ...report().taller, telefonos } });
      render(<CustomerPortal token={TOKEN} />);

      expect(await screen.findByRole('heading', { name: 'Este enlace venció' })).toBeInTheDocument();
      expect(screen.getAllByRole('link', { name: /^Llamar:/ })).toHaveLength(3);
      const waLinks = screen.getAllByRole('link', { name: /^WhatsApp:/ });
      expect(waLinks).toHaveLength(2);
      expect(waLinks[0].getAttribute('href')).toMatch(/^https:\/\/wa\.me\/12026076126\?text=/);
      expect(waLinks[1].getAttribute('href')).toMatch(/^https:\/\/wa\.me\/12403551266\?text=/);
    });

    it('si lo que llega no es una lista, se queda el teléfono de siempre', async () => {
      const taller = { ...report().taller, telefonos: {} as unknown as typeof telefonos };
      mocks.fetchPortal.mockResolvedValue(report({ taller }));
      render(<CustomerPortal token={TOKEN} />);

      expect(await screen.findByRole('link', { name: /Llamar/ })).toHaveAttribute('href', 'tel:5125550100');
    });
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

    const section = (await screen.findByRole('heading', { name: /Avisos por correo/ })).closest<HTMLElement>('details, section')!;
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

      const section = (await screen.findByRole('heading', { name: /Presupuesto por autorizar/ })).closest<HTMLElement>('details, section')!;
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

      const section = (await screen.findByRole('heading', { name: /Presupuesto por autorizar/ })).closest<HTMLElement>('details, section')!;
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

    it('agrupa por trabajo y marcar un trabajo manda todos sus ids', async () => {
      const JOB_ID = 'job-uuid-1111';
      const LINE_1 = 'line-uuid-1111';
      const LINE_2 = 'line-uuid-2222';
      const LINE_LOOSE = 'line-uuid-3333';

      mocks.fetchPortal
        .mockResolvedValueOnce(
          report({
            presupuesto: {
              id: '33333333-3333-4333-8333-333333333333',
              numero: 3,
              enviado_en: '2026-09-12T15:00:00Z',
              total: 350,
              trabajos: [{ id: JOB_ID, titulo: 'Frenos completos', total: 250 }],
              lineas: [
                {
                  id: LINE_1,
                  tipo: 'mano_obra',
                  descripcion: 'Cambio de pastillas',
                  cantidad: 1,
                  precio_unitario: 100,
                  monto: 100,
                  trabajo_id: JOB_ID,
                  trabajo: 'Frenos completos',
                },
                {
                  id: LINE_2,
                  tipo: 'repuesto',
                  descripcion: 'Juego de pastillas',
                  cantidad: 1,
                  precio_unitario: 150,
                  monto: 150,
                  trabajo_id: JOB_ID,
                  trabajo: 'Frenos completos',
                },
                {
                  id: LINE_LOOSE,
                  tipo: 'mano_obra',
                  descripcion: 'Lavado de carrocería',
                  cantidad: 1,
                  precio_unitario: 100,
                  monto: 100,
                  trabajo_id: null,
                  trabajo: null,
                },
              ],
            },
          })
        )
        .mockResolvedValue(report());

      mocks.answerQuote.mockResolvedValue({ ok: true, autorizados: 2, rechazados: 1, total_autorizado: 250 });
      vi.spyOn(window, 'confirm').mockReturnValue(true);
      render(<CustomerPortal token={TOKEN} />);

      const section = (await screen.findByRole('heading', { name: /Presupuesto por autorizar/ })).closest<HTMLElement>('details, section')!;

      // Debe mostrar el título del trabajo agrupado y su total
      expect(within(section).getByText('Frenos completos')).toBeInTheDocument();
      expect(within(section).getByText('$250.00')).toBeInTheDocument();
      // Y el desglose de lo que incluye
      expect(within(section).getByText(/Incluye/)).toBeInTheDocument();
      expect(within(section).getByText('Cambio de pastillas')).toBeInTheDocument();
      expect(within(section).getByText('Juego de pastillas')).toBeInTheDocument();

      // Al marcar el trabajo "Frenos completos"
      await userEvent.click(within(section).getByLabelText(/Frenos completos/));
      expect(within(section).getByText('Total autorizado').parentElement).toHaveTextContent('$250.00');

      await userEvent.type(within(section).getByLabelText('Su nombre'), 'Marta Ruiz');
      await userEvent.click(within(section).getByRole('button', { name: /Autorizar lo marcado/ }));

      // Verifica que approvedIds contiene TODOS los IDs de las líneas del trabajo, y no la línea suelta
      expect(mocks.answerQuote).toHaveBeenCalledWith(TOKEN, {
        quoteId: '33333333-3333-4333-8333-333333333333',
        approvedIds: expect.arrayContaining([LINE_1, LINE_2]),
        shownIds: [LINE_1, LINE_2, LINE_LOOSE],
        name: 'Marta Ruiz',
        comment: '',
      });
      const submittedApproved = mocks.answerQuote.mock.calls[0][1].approvedIds;
      expect(submittedApproved).toHaveLength(2);
      expect(submittedApproved).not.toContain(LINE_LOOSE);
    });

    it('si el taller cambió el presupuesto, lo explica y lo vuelve a pedir', async () => {
      mocks.fetchPortal.mockResolvedValue(withQuote());
      mocks.answerQuote.mockResolvedValue({ ok: false, motivo: 'presupuesto_cambio' });
      vi.spyOn(window, 'confirm').mockReturnValue(true);
      render(<CustomerPortal token={TOKEN} />);

      const section = (await screen.findByRole('heading', { name: /Presupuesto por autorizar/ })).closest<HTMLElement>('details, section')!;
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

// La cuenta como la entiende el cliente (decisiones del taller, 05/10/2026).
describe('CustomerPortal — la cuenta', () => {
  it('no repite el depósito dentro de "pagado": lo cobrado después va aparte', async () => {
    mocks.fetchPortal.mockResolvedValue(
      report({ cuenta: { ...report().cuenta, pagado: 250, otros_pagos: 150, saldo: 150 } })
    );
    render(<CustomerPortal token={TOKEN} />);

    const account = (await screen.findByRole('heading', { name: 'Su cuenta' })).closest('details, section') as HTMLElement;
    expect(within(account).getByText('Depósito y anticipos')).toBeInTheDocument();
    expect(within(account).getByText('Otros pagos')).toBeInTheDocument();
    expect(within(account).getByText('$150.00', { selector: '.portal-line:not(.is-balance) span' })).toBeInTheDocument();
    // "Pagado" (que incluía el depósito) ya no aparece cuando la base manda lo de después.
    expect(within(account).queryByText('Pagado')).toBeNull();
  });

  it('dice "saldo a su favor" cuando el taller le debe al cliente', async () => {
    mocks.fetchPortal.mockResolvedValue(
      report({ cuenta: { ...report().cuenta, total: 50, deposito: 200, pagado: 200, otros_pagos: 0, saldo: -150 } })
    );
    render(<CustomerPortal token={TOKEN} />);

    const account = (await screen.findByRole('heading', { name: 'Su cuenta' })).closest('details, section') as HTMLElement;
    expect(within(account).getByText('Saldo a su favor')).toBeInTheDocument();
    expect(within(account).queryByText('Pagado en su totalidad')).toBeNull();
  });

  it('muestra el subtotal y el descuento cuando hay', async () => {
    mocks.fetchPortal.mockResolvedValue(
      report({ cuenta: { ...report().cuenta, subtotal: 400, descuento: 40, total: 360, otros_pagos: 0, saldo: 260 } })
    );
    render(<CustomerPortal token={TOKEN} />);

    const account = (await screen.findByRole('heading', { name: 'Su cuenta' })).closest('details, section') as HTMLElement;
    expect(within(account).getByText('Subtotal')).toBeInTheDocument();
    expect(within(account).getByText('Descuento')).toBeInTheDocument();
    expect(within(account).getByText('$360.00')).toBeInTheDocument();
  });

  it('dice por qué la orden no avanza: las piezas que se esperan', async () => {
    mocks.fetchPortal.mockResolvedValue({
      ...report({ orden: { ...report().orden, estatus: 'en_proceso' } }),
      esperando_repuestos: [{ descripcion: 'Amortiguador trasero', desde: '2026-10-04T15:00:00Z' }],
    });
    render(<CustomerPortal token={TOKEN} />);

    expect(await screen.findByRole('heading', { name: 'Esperando repuestos' })).toBeInTheDocument();
    expect(screen.getByText('Amortiguador trasero')).toBeInTheDocument();
  });

  it('una orden retirada sin reparar no se ve como "Entregado" ni muestra avance', async () => {
    mocks.fetchPortal.mockResolvedValue(
      report({ orden: { ...report().orden, estatus: 'entregado', retirada_sin_reparar: true, porcentaje_avance: 100 } })
    );
    render(<CustomerPortal token={TOKEN} />);

    expect(await screen.findByText('Retirado sin reparar')).toBeInTheDocument();
    expect(screen.queryByText('Avance')).toBeNull();
  });

  it('en una retirada, lo que no se cobra se lee como "no realizado"', async () => {
    mocks.fetchPortal.mockResolvedValue(
      report({
        orden: { ...report().orden, estatus: 'entregado', retirada_sin_reparar: true },
        cuenta: { ...report().cuenta, no_autorizados: [{ descripcion: 'Reparar motor', monto: 1000 }] },
      })
    );
    render(<CustomerPortal token={TOKEN} />);
    expect(await screen.findByText('No realizados (no se cobran)')).toBeInTheDocument();
  });

  // Pedido del taller (05/10/2026): finalizar lo hace el técnico; el cliente se entera cuando
  // administración confirma que está lista.
  it('finalizada pero sin confirmar, el cliente ve "En revisión final", no "Listo para recoger"', async () => {
    mocks.fetchPortal.mockResolvedValue(
      report({ orden: { ...report().orden, estatus: 'finalizado', lista_para_entregar: false } })
    );
    render(<CustomerPortal token={TOKEN} />);

    expect(await screen.findByText('En revisión final')).toBeInTheDocument();
    expect(screen.getByText(/lo estamos revisando/)).toBeInTheDocument();
    expect(screen.queryByText('Listo para recoger')).not.toBeInTheDocument();
  });

  it('confirmada por administración, el cliente ve "Listo para recoger"', async () => {
    mocks.fetchPortal.mockResolvedValue(
      report({ orden: { ...report().orden, estatus: 'finalizado', lista_para_entregar: true } })
    );
    render(<CustomerPortal token={TOKEN} />);

    expect((await screen.findAllByText('Listo para recoger')).length).toBeGreaterThan(0);
    expect(screen.queryByText('En revisión final')).not.toBeInTheDocument();
  });

  it('muestra el aviso de parqueo por_empezar y la línea de parqueo en la cuenta', async () => {
    mocks.fetchPortal.mockResolvedValue(
      report({
        orden: { ...report().orden, estatus: 'finalizado', lista_para_entregar: true },
        cuenta: {
          ...report().cuenta,
          parqueo: {
            estado: 'por_empezar',
            inicio: '2026-10-15',
            dias: 0,
            monto: 0,
            tarifa_inicial: 35,
            detalle: [],
            tope_aplicado: false,
          },
        },
      })
    );
    render(<CustomerPortal token={TOKEN} />);

    expect(await screen.findByText(/Su vehículo está listo/)).toBeInTheDocument();
    expect(screen.getByText(/desde el 15 de octubre de 2026 se cobra parqueo de \$35\.00 por día/)).toBeInTheDocument();
  });

  it('muestra la línea de parqueo acumulado en el desglose de la cuenta', async () => {
    mocks.fetchPortal.mockResolvedValue(
      report({
        orden: { ...report().orden, estatus: 'finalizado', lista_para_entregar: true },
        cuenta: {
          ...report().cuenta,
          total: 470,
          parqueo: {
            estado: 'acumulando',
            inicio: '2026-10-01',
            dias: 2,
            monto: 70,
            tarifa_inicial: 35,
            detalle: [{ desde_dia: 1, hasta_dia: 2, dias: 2, tarifa: 35, subtotal: 70 }],
            tope_aplicado: false,
          },
        },
      })
    );
    render(<CustomerPortal token={TOKEN} />);

    expect(await screen.findByText('Parqueo')).toBeInTheDocument();
    expect(screen.getByText('$70.00')).toBeInTheDocument();
    expect(screen.getByText(/2 días × \$35\.00/)).toBeInTheDocument();
  });

  // Con tope, "10 días × $40" junto a un monto de $300 no cuadraba: se dice que hay tope.
  it('con tope aplicado no muestra una multiplicación que no da el monto', async () => {
    mocks.fetchPortal.mockResolvedValue(
      report({
        orden: { ...report().orden, estatus: 'finalizado', lista_para_entregar: true },
        cuenta: {
          ...report().cuenta,
          total: 700,
          parqueo: {
            estado: 'acumulando',
            inicio: '2026-10-01',
            dias: 10,
            monto: 300,
            tarifa_inicial: 40,
            detalle: [{ desde_dia: 1, hasta_dia: 10, dias: 10, tarifa: 40, subtotal: 400 }],
            tope_aplicado: true,
          },
        },
      })
    );
    render(<CustomerPortal token={TOKEN} />);

    expect(await screen.findByText(/10 días · con tope/)).toBeInTheDocument();
    expect(screen.getByText('Parqueo').closest('.portal-line')).toHaveTextContent('$300.00');
    expect(screen.queryByText(/10 días × \$40\.00/)).not.toBeInTheDocument();
  });

  it('muestra la tarjeta de próximo servicio cuando está programado', async () => {
    mocks.fetchPortal.mockResolvedValue(
      report({
        proximo_servicio: {
          fecha: '2026-11-15',
          millas: 50000,
          nota: 'Cambio de aceite y filtro sintético',
        },
      })
    );
    render(<CustomerPortal token={TOKEN} />);

    expect(await screen.findByText('Próximo servicio recomendado')).toBeInTheDocument();
    expect(screen.getByText('15 de noviembre de 2026')).toBeInTheDocument();
    expect(screen.getByText('50,000 mi')).toBeInTheDocument();
    expect(screen.getByText('Cambio de aceite y filtro sintético')).toBeInTheDocument();
  });

  it('en inglés traduce la nota del próximo servicio (QA 18/10/2026)', async () => {
    mocks.fetchPortal.mockResolvedValue(
      report({
        proximo_servicio: { fecha: '2026-11-15', millas: 50000, nota: 'Cambio de aceite y filtro sintético' },
        traducciones: { 'Cambio de aceite y filtro sintético': 'Synthetic oil and filter change' },
      })
    );
    const user = userEvent.setup();
    render(<CustomerPortal token={TOKEN} />);

    expect(await screen.findByText('Cambio de aceite y filtro sintético')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /English/ }));
    expect(await screen.findByText('Synthetic oil and filter change')).toBeInTheDocument();
  });

  it('no muestra la tarjeta de próximo servicio cuando no hay o viene null', async () => {
    mocks.fetchPortal.mockResolvedValue(
      report({
        proximo_servicio: null,
      })
    );
    render(<CustomerPortal token={TOKEN} />);

    await screen.findByRole('heading', { name: /2019 Toyota Camry/ });
    expect(screen.queryByText('Próximo servicio recomendado')).not.toBeInTheDocument();
  });

  it('muestra el dibujo del vehículo con los daños en la recepción si hay marcas', async () => {
    mocks.fetchPortal.mockResolvedValue(
      report({
        orden: {
          ...report().orden,
          marcas_danos: [
            { vista: 'frontal', x: 0.5, y: 0.5, tipo: 'golpe' },
            { vista: 'derecha', x: 0.3, y: 0.4, tipo: 'rayon' },
          ],
        },
      })
    );
    render(<CustomerPortal token={TOKEN} />);

    expect(await screen.findByText('Daños registrados en la recepción')).toBeInTheDocument();
    expect(screen.getByText(/Frente: Golpe o abolladura/)).toBeInTheDocument();
    expect(screen.getByText(/Lado derecho: Rayón/)).toBeInTheDocument();
  });

  it('la cuenta y la recepción nacen cerradas y se abren al tocar su título', async () => {
    mocks.fetchPortal.mockResolvedValue(report());
    const user = userEvent.setup();
    render(<CustomerPortal token={TOKEN} />);

    const receptionHeading = await screen.findByRole('heading', { name: /Recepción del vehículo/ });
    const receptionDetails = receptionHeading.closest('details') as HTMLDetailsElement;
    expect(receptionDetails.open).toBe(false);

    const accountHeading = screen.getByRole('heading', { name: /Su cuenta/ });
    const accountDetails = accountHeading.closest('details') as HTMLDetailsElement;
    expect(accountDetails.open).toBe(false);

    await user.click(receptionHeading);
    expect(receptionDetails.open).toBe(true);

    await user.click(accountHeading);
    expect(accountDetails.open).toBe(true);
  });

  it('un presupuesto enviado nace abierto', async () => {
    mocks.fetchPortal.mockResolvedValue(
      report({
        presupuesto: {
          id: '33333333-3333-4333-8333-333333333333',
          numero: 2,
          enviado_en: '2026-09-12T15:00:00Z',
          total: 200,
          lineas: [
            { id: '11111111-1111-4111-8111-111111111111', tipo: 'mano_obra', descripcion: 'Alineación', cantidad: 1, precio_unitario: 200, monto: 200 },
          ],
        },
      })
    );
    render(<CustomerPortal token={TOKEN} />);

    const quoteHeading = await screen.findByRole('heading', { name: /Presupuesto por autorizar/ });
    const quoteDetails = quoteHeading.closest('details') as HTMLDetailsElement;
    expect(quoteDetails.open).toBe(true);
  });
});


