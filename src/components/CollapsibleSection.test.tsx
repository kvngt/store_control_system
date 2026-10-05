/**
 * @vitest-environment jsdom
 */
import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import CollapsibleSection from './CollapsibleSection';
import { setViewportMatches } from '../test/viewport';

afterEach(cleanup);

describe('CollapsibleSection', () => {
  // Pedido del taller (04/10/2026): también en escritorio, cerrada al entrar.
  it.each([
    ['en escritorio', false],
    ['en el teléfono', true],
  ])('%s arranca cerrada, con el resumen a la vista, y se abre con la flecha', (_where, phone) => {
    setViewportMatches(phone);
    render(<CollapsibleSection title="Mano de obra" summary={3}><p>contenido</p></CollapsibleSection>);
    const toggle = screen.getByRole('button', { name: /Mano de obra/ });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(toggle).toHaveTextContent('3');
    expect(screen.getByText('contenido')).not.toBeVisible();

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('contenido')).toBeVisible();
  });

  it('plegar no desmonta el contenido (no se pierde lo que se estaba escribiendo)', () => {
    render(<CollapsibleSection title="Avances" defaultOpen><input aria-label="nota" /></CollapsibleSection>);
    const input = screen.getByLabelText('nota') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'a medias' } });

    const toggle = screen.getByRole('button', { name: /Avances/ });
    fireEvent.click(toggle);
    fireEvent.click(toggle);
    expect((screen.getByLabelText('nota') as HTMLInputElement).value).toBe('a medias');
  });

  it('controlada desde afuera: abre y cierra con quien la maneja', () => {
    function Parent() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>Desplegar todo</button>
          <CollapsibleSection title="Firma" open={open} onToggle={() => setOpen((o) => !o)}>
            <p>la firma</p>
          </CollapsibleSection>
        </>
      );
    }
    render(<Parent />);
    expect(screen.getByText('la firma')).not.toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Desplegar todo' }));
    expect(screen.getByText('la firma')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: /Firma/ }));
    expect(screen.getByText('la firma')).not.toBeVisible();
  });
});
