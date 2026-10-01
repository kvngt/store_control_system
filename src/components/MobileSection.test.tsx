/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import MobileSection from './MobileSection';
import { setViewportMatches } from '../test/viewport';

afterEach(cleanup);

describe('MobileSection', () => {
  it('en escritorio deja la tarjeta tal cual, sin encabezado', () => {
    render(<MobileSection title="Labor"><p>contenido</p></MobileSection>);
    expect(screen.getByText('contenido')).toBeVisible();
    expect(screen.queryByRole('button', { name: /Labor/ })).toBeNull();
  });

  it('en el teléfono arranca plegada y se abre al tocar el encabezado', () => {
    setViewportMatches(true);
    render(<MobileSection title="Labor" summary={3}><p>contenido</p></MobileSection>);
    const toggle = screen.getByRole('button', { name: /Labor/ });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByText('contenido')).not.toBeVisible();

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('contenido')).toBeVisible();
  });

  it('plegar no desmonta el contenido (no se pierde lo que se estaba escribiendo)', () => {
    setViewportMatches(true);
    render(<MobileSection title="Avances" defaultOpen><input aria-label="nota" /></MobileSection>);
    const input = screen.getByLabelText('nota') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'a medias' } });

    const toggle = screen.getByRole('button', { name: /Avances/ });
    fireEvent.click(toggle);
    fireEvent.click(toggle);
    expect((screen.getByLabelText('nota') as HTMLInputElement).value).toBe('a medias');
  });
});
