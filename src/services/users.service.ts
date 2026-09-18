// Profiles, staff administration and password recovery.
import { supabase } from '../lib/supabase';
import type { UserProfile, UserRole } from '../types/database';

/** Motivo de un rechazo de una edge function: texto y, si lo hay, un código. */
interface FunctionFailure {
  message?: string;
  code?: string;
}

/**
 * Códigos derivados del status cuando el cuerpo no trae uno.
 *
 * Un 401 de la **pasarela** de Supabase (JWT ausente o vencido, antes de que corra
 * la función) responde `{code: 401, message: "..."}`, sin la clave `error` que
 * escriben nuestras funciones. Sin esto, ese caso perdía el motivo y la pantalla
 * mostraba "Edge Function returned a non-2xx status code".
 *
 * 404 es una función que no está desplegada, que es un fallo de despliegue y no
 * del taller.
 */
const CODE_BY_STATUS: Record<number, string> = {
  401: 'session_expired',
  403: 'forbidden',
  404: 'function_missing',
  429: 'service_unavailable',
  500: 'service_unavailable',
  502: 'service_unavailable',
  503: 'service_unavailable',
  504: 'service_unavailable',
};

/**
 * El token de quien llama, renovando una vez si hace falta.
 *
 * supabase-js resuelve el token por petición, y `getSession()` devuelve `null`
 * dentro del margen de 90 s previo al vencimiento cuando el refresco automático
 * falló y su enfriamiento de 60 s sigue corriendo. Como la clave pública es del
 * formato nuevo (`sb_publishable_…`), la librería tampoco usa la clave anónima
 * como respaldo: la petición salía **sin cabecera `Authorization`** y la función
 * respondía "No autorizado." a un administrador con la sesión abierta. Un
 * refresco explícito es la diferencia entre ese mensaje y hacer el trabajo.
 *
 * Mismo patrón que `accessToken` en `media.service.ts`.
 */
async function adminAccessToken(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  let token = data.session?.access_token;
  if (!token) {
    const { data: refreshed } = await supabase.auth.refreshSession();
    token = refreshed.session?.access_token;
  }
  if (!token) {
    throw Object.assign(new Error('La sesión expiró. Vuelve a iniciar sesión.'), {
      code: 'session_expired',
    });
  }
  return token;
}

/**
 * Llama una edge function de empleados y devuelve su motivo cuando la rechaza.
 *
 * Con un 4xx, `functions.invoke` no entrega el cuerpo: da un error cuyo mensaje es
 * "Edge Function returned a non-2xx status code", y eso era lo que veía el admin en
 * lugar de "No puedes quitar el rol de administrador al único administrador" o de
 * "ya existe una cuenta con ese correo". El cuerpo sigue en `error.context`.
 */
export async function invokeAdminFunction<T>(name: string, body: Record<string, unknown>): Promise<T> {
  // Resolver el token aquí, y mandarlo explícito, quita de en medio la resolución
  // automática del SDK: o va firmada, o ni siquiera sale.
  const token = await adminAccessToken();
  const { data, error } = await supabase.functions.invoke(name, {
    body,
    headers: { Authorization: `Bearer ${token}` },
  });
  const failure = error
    ? await readFunctionError(error)
    : toFailure((data as { error?: string; code?: string } | null) ?? undefined);
  if (failure?.message || failure?.code) throw employeeError(failure);
  if (error) throw error;
  return data as T;
}

function toFailure(payload?: { error?: string; code?: string }): FunctionFailure | undefined {
  if (!payload || typeof payload.error !== 'string') return undefined;
  return { message: payload.error, code: typeof payload.code === 'string' ? payload.code : undefined };
}

async function readFunctionError(error: unknown): Promise<FunctionFailure | undefined> {
  const response = (error as { context?: unknown }).context;
  if (!(response instanceof Response)) return undefined;
  const payload = await response.clone().json().catch(() => null);
  const message = [payload?.error, payload?.message, payload?.msg].find(
    (value): value is string => typeof value === 'string' && value.length > 0,
  );
  // La pasarela manda `code` numérico; el nuestro es una cadena.
  const code = typeof payload?.code === 'string' ? payload.code : CODE_BY_STATUS[response.status];
  return { message, code };
}

// Auth responde en inglés cuando el correo ya tiene cuenta; el resto de los motivos
// ya vienen escritos en español por las funciones.
function employeeError(failure: FunctionFailure) {
  const message = failure.message ?? '';
  if (/already (been )?registered|already exists|email_exists/i.test(message)) {
    return Object.assign(new Error(message), { code: 'email_exists' });
  }
  const error = new Error(message);
  // Sin código, `getErrorMessage` muestra el mensaje tal cual, que es lo que
  // queremos para los motivos concretos (un solo admin, órdenes asignadas).
  return failure.code ? Object.assign(error, { code: failure.code }) : error;
}

export const usersService = {
  uploadAvatar: async (userId: string, file: File) => {
    const path = `${userId}/avatar-${Date.now()}-${file.name}`;
    const { error } = await supabase.storage
      .from('avatares')
      .upload(path, file, { cacheControl: '3600', upsert: true });
    if (error) throw error;
    const { data } = supabase.storage.from('avatares').getPublicUrl(path);
    return data.publicUrl;
  },

  /** Updates the signed-in user's own profile row. */
  updateProfile: async (
    userId: string,
    input: Partial<Pick<UserProfile, 'nombre_completo' | 'email' | 'telefono' | 'avatar_url'>>
  ) => {
    const { data, error } = await supabase.from('perfiles').update(input).eq('id', userId).select().single();
    if (error) throw error;
    return data as UserProfile;
  },

  // perfiles.sede_id is NOT NULL, so a user always belongs to exactly one
  // workshop. An admin "leaving" a sede therefore means moving their membership
  // to another one — which is what removes them from the first sede's roster.
  moveUserToSede: async (userId: string, sedeId: string) => {
    const { data, error } = await supabase
      .from('perfiles')
      .update({ sede_id: sedeId })
      .eq('id', userId)
      .select()
      .single();
    if (error) throw error;
    return data as UserProfile;
  },

  // ===== Password recovery =====
  // Sends the "reset your password" email. `redirectTo` must be listed in the
  // project's allowed redirect URLs, otherwise Supabase drops the link.
  requestPasswordReset: async (email: string, redirectTo: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo });
    if (error) throw error;
  },

  /** Sets a new password for the session opened by the recovery link. */
  updatePassword: async (password: string) => {
    const { error } = await supabase.auth.updateUser({ password });
    if (error) throw error;
  },

  /** True when another profile already uses this email (case-insensitive). */
  isEmailTaken: async (email: string, excludeUserId: string) => {
    const { data, error } = await supabase
      .from('perfiles')
      .select('id')
      .ilike('email', email.trim())
      .neq('id', excludeUserId)
      .limit(1);
    if (error) throw error;
    return (data || []).length > 0;
  },

  // ===== Users / Profiles =====
  getUsers: async (sedeId?: string) => {
    let query = supabase.from('perfiles').select('*').order('nombre_completo');
    if (sedeId) query = query.eq('sede_id', sedeId);
    const { data, error } = await query;
    if (error) throw error;
    return data as UserProfile[];
  },

  createEmployee: async (input: {
    email: string;
    password: string;
    nombre_completo: string;
    rol: UserRole;
    sede_id: string;
    telefono?: string;
  }) => {
    const data = await invokeAdminFunction<{ profile: UserProfile }>('create-employee', input);
    return data.profile;
  },

  /**
   * Admin edit of somebody else's account.
   *
   * Goes through an edge function rather than a plain `perfiles` update
   * because the name, phone, role and sede live in `perfiles` but the email
   * and password live in `auth.users`, which only the service-role key can
   * touch. Sending just the fields that changed keeps a dialog that edits the
   * phone number from blanking out the role.
   */
  updateEmployee: async (input: {
    usuario_id: string;
    nombre_completo?: string;
    email?: string;
    telefono?: string;
    rol?: UserRole;
    sede_id?: string;
    /** Only when the admin is setting a new one; omit to leave it alone. */
    password?: string;
  }) => {
    const data = await invokeAdminFunction<{ profile: UserProfile }>('update-employee', input);
    return data.profile;
  },

  deleteEmployee: async (usuarioId: string) => {
    await invokeAdminFunction('delete-employee', { usuario_id: usuarioId });
  },

  getOperators: async (sedeId?: string) => {
    let query = supabase.from('perfiles').select('*').in('rol', ['mecanico', 'pintor']);
    if (sedeId) query = query.eq('sede_id', sedeId);
    const { data, error } = await query;
    if (error) throw error;
    return data as UserProfile[];
  },
};
