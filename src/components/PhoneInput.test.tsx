// @vitest-environment jsdom
//
// El teléfono del cliente con su país. Lo que importa: que guarde en formato internacional,
// que Estados Unidos venga por omisión, y que un número viejo no se reescriba solo.

import { describe, it, expect, vi } from 'vitest';
import { useState } from 'react';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../test/renderWithProviders';
import PhoneInput from './PhoneInput';

/** Envuelve el campo en estado real, como lo usa un formulario. */
function Campo({ inicial = '', onChange = vi.fn() }: { inicial?: string; onChange?: (v: string) => void }) {
  const [value, setValue] = useState(inicial);
  return (
    <>
      <PhoneInput
        id="tel"
        value={value}
        onChange={(v) => {
          setValue(v);
          onChange(v);
        }}
      />
      <output data-testid="guardado">{value}</output>
      <button type="button" onClick={() => setValue('')}>vaciar</button>
      <button type="button" onClick={() => setValue('+525512345678')}>otro cliente</button>
    </>
  );
}

const pais = () => screen.getByRole('combobox', { name: 'País del teléfono' }) as HTMLSelectElement;
const numero = () => document.getElementById('tel') as HTMLInputElement;

describe('PhoneInput', () => {
  it('viene con Estados Unidos, y México justo después', () => {
    renderWithProviders(<Campo />);
    expect(pais().value).toBe('US');
    const opciones = Array.from(pais().options).map((o) => o.value);
    expect(opciones.slice(0, 2)).toEqual(['US', 'MX']);
  });

  it('guarda el número en formato internacional', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Campo />);

    await user.type(numero(), '(512) 555-0100');

    expect(screen.getByTestId('guardado')).toHaveTextContent('+15125550100');
    // Lo que se ve es lo que la persona escribió, con sus paréntesis.
    expect(numero().value).toBe('(512) 555-0100');
  });

  it('cambiar el país cambia el prefijo del número guardado', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Campo />);

    await user.type(numero(), '5512345678');
    await user.selectOptions(pais(), 'MX');

    expect(screen.getByTestId('guardado')).toHaveTextContent('+525512345678');
  });

  it('abre un número guardado con su país', () => {
    renderWithProviders(<Campo inicial="+50251234567" />);
    expect(pais().value).toBe('GT');
    expect(numero().value).toBe('51234567');
  });

  // Un número de antes del selector no se toca hasta que alguien lo edite.
  it('un número viejo sin + se muestra pero no se reescribe solo', () => {
    const onChange = vi.fn();
    renderWithProviders(<Campo inicial="3015550123" onChange={onChange} />);

    expect(pais().value).toBe('US');
    expect(numero().value).toBe('3015550123');
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByTestId('guardado')).toHaveTextContent('3015550123');
  });

  it('se pone al día cuando el formulario cambia el valor desde afuera', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Campo inicial="+15125550100" />);

    await user.click(screen.getByRole('button', { name: 'otro cliente' }));
    expect(pais().value).toBe('MX');
    expect(numero().value).toBe('5512345678');

    await user.click(screen.getByRole('button', { name: 'vaciar' }));
    expect(pais().value).toBe('US');
    expect(numero().value).toBe('');
  });

  it('sin número no guarda un "+1" suelto', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Campo />);

    await user.type(numero(), '5');
    await user.clear(numero());

    expect(screen.getByTestId('guardado')).toHaveTextContent(/^$/);
  });

  // Aviso y no bloqueo, y solo al salir del campo: mientras se escribe todos están incompletos.
  it('avisa al salir del campo si a un número de EE. UU. le faltan dígitos', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Campo />);

    await user.type(numero(), '512555010');
    expect(screen.queryByText(/tiene 10 dígitos/)).not.toBeInTheDocument();

    await user.tab();
    expect(screen.getByText(/tiene 10 dígitos/)).toBeInTheDocument();
  });
});
