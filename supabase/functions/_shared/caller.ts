// Quién llama a una función de administración, y por qué se le dice que no.
//
// Las tres funciones de empleados repetían este bloque, y las tres cometían el
// mismo error: descartaban el `error` de `getUser()` y el de la consulta a
// `perfiles`, quedándose solo con el dato. Un fallo pasajero del servicio de
// identidad (429, 5xx, un tiempo de espera agotado) dejaba `caller` en null y la
// función respondía **401 "No autorizado."** a un administrador con la sesión
// perfectamente abierta — que fue justo lo reportado: falla, y unos minutos
// después la misma acción funciona.
//
// Un fallo de servicio no es una respuesta sobre permisos. Aquí se separan: 503
// cuando el sistema no pudo comprobar, 403 cuando sí comprobó y la respuesta es
// que no.
import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2';

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/** Cuerpo de error uniforme: texto para el taller y un código para traducir. */
export function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

export function errorResponse(error: string, code: string, status: number) {
  return jsonResponse({ error, code }, status);
}

export interface AdminCaller {
  /** El administrador que llama. */
  userId: string;
  /** Cliente con la llave de servicio: se salta RLS, úsalo solo tras esta comprobación. */
  adminClient: SupabaseClient;
}

/**
 * Comprueba que quien llama es un administrador.
 *
 * Devuelve el llamante, o una `Response` ya formada que la función debe devolver
 * tal cual.
 */
export async function resolveAdminCaller(
  req: Request,
  accion: string,
): Promise<AdminCaller | Response> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return errorResponse('Tu sesión expiró. Vuelve a iniciar sesión.', 'session_expired', 401);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  // Con el JWT de quien llama: sirve solo para saber quién es.
  const callerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: userData, error: userError } = await callerClient.auth.getUser();
  if (userError) {
    // 401 y 403 son la respuesta de Auth sobre este token; cualquier otra cosa
    // (429, 5xx, red) es que no se pudo preguntar.
    const status = (userError as { status?: number }).status;
    if (status === 401 || status === 403) {
      return errorResponse('Tu sesión expiró. Vuelve a iniciar sesión.', 'session_expired', 401);
    }
    return errorResponse(
      'No se pudo verificar tu sesión en este momento. Intenta de nuevo.',
      'service_unavailable',
      503,
    );
  }
  const caller = userData?.user;
  if (!caller) {
    return errorResponse('Tu sesión expiró. Vuelve a iniciar sesión.', 'session_expired', 401);
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey);
  const { data: callerProfile, error: profileError } = await adminClient
    .from('perfiles')
    .select('rol')
    .eq('id', caller.id)
    .maybeSingle();

  if (profileError) {
    return errorResponse(
      'No se pudo comprobar tu permiso en este momento. Intenta de nuevo.',
      'service_unavailable',
      503,
    );
  }
  if (callerProfile?.rol !== 'admin') {
    return errorResponse(`Solo un administrador puede ${accion}.`, 'admin_only', 403);
  }

  return { userId: caller.id, adminClient };
}

/**
 * Los roles que acepta `perfiles.rol`, iguales al enum `user_role` de la base.
 *
 * Vive aquí para que crear y editar un empleado no puedan discrepar: si algún día
 * se agrega un rol, este es el único sitio que hay que tocar del lado de las
 * funciones.
 */
export const VALID_ROLES = ['admin', 'mecanico', 'pintor'];
