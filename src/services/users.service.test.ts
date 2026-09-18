import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getErrorMessage } from '../lib/errors';

// `functions.invoke` ante un 4xx: `data` nulo y un error cuyo `context` es la respuesta.
const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  getSession: vi.fn(),
  refreshSession: vi.fn(),
}));

vi.mock('../lib/supabase', () => ({
  supabase: {
    functions: { invoke: mocks.invoke },
    auth: { getSession: mocks.getSession, refreshSession: mocks.refreshSession },
  },
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

const session = (access_token: string | null) => ({
  data: { session: access_token ? { access_token } : null },
});

const NEW_EMPLOYEE = {
  email: 'luis@taller.test',
  password: 'Temporal-2026',
  nombre_completo: 'Luis',
  rol: 'mecanico' as const,
  sede_id: 'sede-1',
};

describe('usersService: funciones de empleados', () => {
  beforeEach(() => {
    mocks.invoke.mockReset();
    mocks.getSession.mockReset().mockResolvedValue(session('jwt-vigente'));
    mocks.refreshSession.mockReset().mockResolvedValue(session(null));
  });

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
    expect(mocks.invoke).toHaveBeenCalledWith('create-employee', {
      body: NEW_EMPLOYEE,
      headers: { Authorization: 'Bearer jwt-vigente' },
    });
  });

  // El fallo reportado: un admin con la sesión abierta recibía "No autorizado.".
  // La petición salía sin cabecera porque `getSession()` devuelve null dentro del
  // margen de vencimiento, y la clave pública nueva ya no sirve de respaldo.
  describe('la sesión, antes de invocar', () => {
    it('renueva una vez cuando la sesión en memoria ya no sirve', async () => {
      mocks.getSession.mockResolvedValue(session(null));
      mocks.refreshSession.mockResolvedValue(session('jwt-renovado'));
      mocks.invoke.mockResolvedValue({ data: { ok: true }, error: null });

      await usersService.deleteEmployee('u1');

      expect(mocks.refreshSession).toHaveBeenCalledOnce();
      expect(mocks.invoke).toHaveBeenCalledWith('delete-employee', {
        body: { usuario_id: 'u1' },
        headers: { Authorization: 'Bearer jwt-renovado' },
      });
    });

    it('sin sesión ni renovación no llama a la función y lo dice claro', async () => {
      mocks.getSession.mockResolvedValue(session(null));

      const error = await usersService.deleteEmployee('u1').catch((e) => e);

      expect(mocks.invoke).not.toHaveBeenCalled();
      expect(getErrorMessage(error, 'es')).toMatch(/Tu sesión expiró/);
      expect(getErrorMessage(error, 'en')).toMatch(/Your session expired/);
    });
  });

  describe('cuerpos de error que antes se perdían', () => {
    it('un 401 de la pasarela trae `message`, no `error`', async () => {
      // Supabase responde {"code":401,"message":"Invalid JWT"} cuando rechaza el
      // token antes de que corra la función: sin la clave `error`, el motivo se
      // perdía y la pantalla decía "non-2xx status code".
      mocks.invoke.mockResolvedValue(rejectedWith(401, { code: 401, message: 'Invalid JWT' }));

      const error = await usersService.deleteEmployee('u1').catch((e) => e);

      expect(getErrorMessage(error, 'es')).toMatch(/Tu sesión expiró/);
    });

    it('un fallo pasajero del servicio se ofrece como reintentable', async () => {
      mocks.invoke.mockResolvedValue(
        rejectedWith(503, { error: 'No se pudo verificar tu sesión en este momento. Intenta de nuevo.', code: 'service_unavailable' })
      );

      const error = await usersService.createEmployee(NEW_EMPLOYEE).catch((e) => e);

      expect(getErrorMessage(error, 'es')).toMatch(/intenta de nuevo/i);
      expect(getErrorMessage(error, 'en')).toMatch(/try again/i);
    });

    it('una función sin desplegar responde 404 y se nombra como tal', async () => {
      mocks.invoke.mockResolvedValue(rejectedWith(404, { message: 'Not Found' }));

      const error = await usersService.updateEmployee({ usuario_id: 'u1' }).catch((e) => e);

      expect(getErrorMessage(error, 'es')).toMatch(/no está disponible en el servidor/);
    });
  });
});
