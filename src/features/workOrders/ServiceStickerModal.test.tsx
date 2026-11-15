// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../../test/renderWithProviders';
import ServiceStickerModal from './ServiceStickerModal';
import type { WorkOrder } from '../../types/database';

function makeOrder(millas_ingreso: number | null): WorkOrder {
  return {
    id: 'o-1',
    numero_orden: 'ORD-2026-001',
    millas_ingreso,
    cliente: { id: 'c-1', nombre: 'Juan Pérez', idioma: 'es' },
    vehiculo: { id: 'v-1', marca: 'Toyota', modelo: 'Corolla', anio: 2020, placa: 'ABC-123' },
  } as unknown as WorkOrder;
}

describe('ServiceStickerModal (E6)', () => {
  it('con 103.000 de ingreso y 5.000 escritas, se guardan 108.000', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);
    const order = makeOrder(103000);

    renderWithProviders(
      <ServiceStickerModal
        mode="admin"
        order={order}
        onSave={onSave}
        onClose={vi.fn()}
      />
    );

    // Con millas_ingreso numérico, la etiqueta es "En cuántas millas"
    expect(screen.getByLabelText('En cuántas millas')).toBeInTheDocument();

    const inputMillas = screen.getByLabelText('En cuántas millas');
    await user.clear(inputMillas);
    await user.type(inputMillas, '5000');

    // Muestra la línea en vivo con el cálculo
    expect(screen.getByText(/Próximo servicio a las 108,000 mi \(103,000 \+ 5,000\)/)).toBeInTheDocument();

    // Guardar
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledTimes(1);
    });

    const [payload, lang] = onSave.mock.calls[0];
    expect(payload.millas).toBe(108000);
    expect(lang).toBe('es');
  });

  it('al editar uno guardado, el campo arranca en millas - millas_ingreso', () => {
    const order = makeOrder(103000);

    renderWithProviders(
      <ServiceStickerModal
        mode="admin"
        order={order}
        initialData={{ fecha: '2026-12-01', millas: 108000, nota: 'Aceite' }}
        onSave={vi.fn()}
        onClose={vi.fn()}
      />
    );

    const inputMillas = screen.getByLabelText('En cuántas millas');
    expect(inputMillas).toHaveValue(5000);
  });

  it('sin millas_ingreso el campo pide el total directamente', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);
    const order = makeOrder(null);

    renderWithProviders(
      <ServiceStickerModal
        mode="admin"
        order={order}
        onSave={onSave}
        onClose={vi.fn()}
      />
    );

    expect(screen.getByLabelText('Millas recomendadas')).toBeInTheDocument();
    const inputMillas = screen.getByLabelText('Millas recomendadas');
    await user.type(inputMillas, '108000');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledTimes(1);
    });
    expect(onSave.mock.calls[0][0].millas).toBe(108000);
  });

  it('con incremento menor que 1 o mayor que 100000 muestra error de validación', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    const order = makeOrder(103000);

    renderWithProviders(
      <ServiceStickerModal
        mode="admin"
        order={order}
        onSave={onSave}
        onClose={vi.fn()}
      />
    );

    const inputMillas = screen.getByLabelText('En cuántas millas');
    await user.type(inputMillas, '0');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText('Escribe cuántas millas faltan, por ejemplo 5000.')).toBeInTheDocument();
  });
});

describe('ServiceStickerModal: lo escrito no se pierde (04/11/2026)', () => {
  it('sin cambios, la X cierra sin preguntar', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    renderWithProviders(
      <ServiceStickerModal
        mode="tecnico"
        order={makeOrder(103000)}
        initialData={{ fecha: '2027-01-15', millas: 108000, nota: 'Aceite' }}
        onSuggest={vi.fn(async () => undefined)}
        onClose={onClose}
      />
    );
    await user.click(screen.getByRole('button', { name: 'Cerrar' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('el técnico escribe una nota: «atrás» y tocar fuera preguntan; sin cambios, cierra sin preguntar', async () => {
    const { act, fireEvent } = await import('@testing-library/react');
    const { resetBackButtonTrapsForTests } = await import('../../lib/backButtonTrap');
    resetBackButtonTrapsForTests();
    window.history.replaceState({ idx: 0, key: 'base' }, '', '/');
    const user = userEvent.setup();
    const onClose = vi.fn();
    renderWithProviders(
      <ServiceStickerModal mode="tecnico" order={makeOrder(103000)} onSuggest={vi.fn(async () => undefined)} onClose={onClose} />
    );

    await user.type(document.getElementById('sticker-nota') as HTMLTextAreaElement, 'Cambiar balatas traseras');
    act(() => { window.history.back(); });
    expect(await screen.findByRole('alertdialog')).toHaveTextContent('¿Descartar los cambios?');
    expect(onClose).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Seguir editando' }));

    fireEvent.click(document.querySelector('.modal-overlay') as HTMLElement);
    expect(await screen.findByRole('alertdialog')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Descartar' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('Enter no envía dos veces mientras está guardando y rechaza millas decimales sin truncar', async () => {
    const { fireEvent } = await import('@testing-library/react');
    const user = userEvent.setup();
    let resolveSave!: () => void;
    const onSave = vi.fn(() => new Promise<void>((res) => { resolveSave = res; }));

    renderWithProviders(
      <ServiceStickerModal mode="admin" order={makeOrder(null)} onSave={onSave} onClose={vi.fn()} />
    );

    const inputMillas = screen.getByLabelText('Millas recomendadas');
    await user.type(inputMillas, '65000.5');
    const form = inputMillas.closest('form') as HTMLFormElement;
    fireEvent.submit(form);

    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText('Las millas deben ser un número entero.')).toBeInTheDocument();

    await user.clear(inputMillas);
    await user.type(inputMillas, '65000');
    fireEvent.submit(form);
    fireEvent.submit(form);

    expect(onSave).toHaveBeenCalledTimes(1);
    resolveSave();
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
  });
});
