import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getErrorMessage } from '../lib/errors';

// `functions.invoke` ante un 4xx: `data` nulo y un error cuyo `context` es la respuesta.
const mocks = vi.hoisted(() => ({ invoke: vi.fn() }));

vi.mock('../lib/supabase', () => ({
  supabase: { functions: { invoke: mocks.invoke } },
}));

const { usersService } = await import('./users.service');

function rejectedWith(status: number, body: unknown) {
  return {
    data: null,
    error: Object.assign(new Error('Edge Function returned a non-2xx status code'), {
      context: new Response(JSON.stringify(body), { status }),
    }),
  };
}

const NEW_EMPLOYEE = {
  email: 'luis@taller.test',
  password: 'Temporal-2026',
  nombre_completo: 'Luis',
  rol: 'mecanico' as const,
  sede_id: 'sede-1',
};

describe('usersService: funciones de empleados', () => {
  beforeEach(() => mocks.invoke.mockReset());

  it('muestra el motivo que da la función, no "non-2xx status code"', async () => {
    mocks.invoke.mockResolvedValue(
      rejectedWith(400, { error: 'No puedes quitar el rol de administrador al único administrador del sistema.' })
    );

    const error = await usersService.updateEmployee({ usuario_id: 'u1', rol: 'mecanico' }).catch((e) => e);

    expect(getErrorMessage(error, 'es')).toBe(
      'No puedes quitar el rol de administrador al único administrador del sistema.'
    );
  });

  it('un correo que ya tiene cuenta se explica en español', async () => {
    mocks.invoke.mockResolvedValue(rejectedWith(400, { error: 'A user with this email address has already been registered' }));

    const error = await usersService.createEmployee(NEW_EMPLOYEE).catch((e) => e);

    expect(getErrorMessage(error, 'es')).toMatch(/Ya existe una cuenta con ese correo/);
  });

  it('sin cuerpo legible conserva el error original', async () => {
    const original = Object.assign(new Error('Failed to send a request to the Edge Function'), { context: undefined });
    mocks.invoke.mockResolvedValue({ data: null, error: original });

    await expect(usersService.deleteEmployee('u1')).rejects.toBe(original);
  });

  it('devuelve el perfil cuando la función responde bien', async () => {
    mocks.invoke.mockResolvedValue({ data: { profile: { id: 'u2' } }, error: null });

    await expect(usersService.createEmployee(NEW_EMPLOYEE)).resolves.toEqual({ id: 'u2' });
    expect(mocks.invoke).toHaveBeenCalledWith('create-employee', { body: NEW_EMPLOYEE });
  });
});
