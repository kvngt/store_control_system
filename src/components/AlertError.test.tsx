/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { AlertError } from './AlertError';

const scrollIntoView = vi.fn();

beforeEach(() => {
  scrollIntoView.mockReset();
  // jsdom no implementa scrollIntoView.
  Element.prototype.scrollIntoView = scrollIntoView;
});

afterEach(cleanup);

describe('AlertError', () => {
  it('no pinta nada sin mensaje', () => {
    const { container } = render(<AlertError message="" />);
    expect(container).toBeEmptyDOMElement();
    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it('anuncia el error y lo trae a la vista', () => {
    render(<AlertError message="Falta el nombre." />);

    expect(screen.getByRole('alert')).toHaveTextContent('Falta el nombre.');
    // Lo que faltaba en el teléfono: el mensaje salía arriba del cuerpo
    // desplazable, fuera de la vista de quien estaba abajo junto a Guardar.
    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'nearest' });
  });

  it('vuelve a avisar cuando el motivo cambia', () => {
    const { rerender } = render(<AlertError message="Falta el nombre." />);
    expect(scrollIntoView).toHaveBeenCalledTimes(1);

    rerender(<AlertError message="El correo no es válido." />);

    expect(scrollIntoView).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('alert')).toHaveTextContent('El correo no es válido.');
  });
});
