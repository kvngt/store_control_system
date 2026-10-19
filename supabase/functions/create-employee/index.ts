// Creates a new employee (auth user + perfiles row) from the Settings screen.
// Runs with the service-role key because creating an `auth.users` row requires
// Supabase's admin API, which is never safe to call from the browser. Only an
// authenticated admin (checked below via their own `perfiles.rol`) may call this.
import {
  corsHeaders,
  EMAIL_RE,
  jsonResponse,
  MAX_NOMBRE,
  MAX_TELEFONO,
  readJsonBody,
  resolveAdminCaller,
  UUID_RE,
  VALID_ROLES,
} from '../_shared/caller.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const auth = await resolveAdminCaller(req, 'crear empleados');
    // Un motivo ya formado: sesión vencida, fallo pasajero del servicio, o no es admin.
    if (auth instanceof Response) return auth;
    const { adminClient } = auth;

    const body = await readJsonBody(req);
    if (body instanceof Response) return body;
    // Auth guarda los correos en minúsculas; el perfil igual, o el correo del perfil y el del acceso difieren.
    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');
    const nombre_completo = String(body.nombre_completo || '').trim();
    const rol = String(body.rol || '');
    const sede_id = String(body.sede_id || '');
    const telefono = body.telefono ? String(body.telefono).trim() : null;

    if (!email || !password || !nombre_completo || !sede_id) {
      return jsonResponse({ error: 'Faltan campos obligatorios.' }, 400);
    }
    // El mismo mínimo que la app (src/lib/password.ts) y que Auth en el panel.
    if (password.length < 8) {
      return jsonResponse({ error: 'La contraseña debe tener al menos 8 caracteres.' }, 400);
    }
    if (!VALID_ROLES.includes(rol)) {
      return jsonResponse({ error: 'Rol inválido.' }, 400);
    }
    // Todo se comprueba antes de crear el acceso en Auth: lo que falle después deja un usuario a medias.
    if (!EMAIL_RE.test(email)) {
      return jsonResponse({ error: 'El correo no tiene un formato válido.' }, 400);
    }
    if (!UUID_RE.test(sede_id)) {
      return jsonResponse({ error: 'La sede no es válida.' }, 400);
    }
    if (nombre_completo.length > MAX_NOMBRE || (telefono && telefono.length > MAX_TELEFONO)) {
      return jsonResponse({ error: 'El nombre o el teléfono son demasiado largos.' }, 400);
    }
    const { data: sede } = await adminClient.from('sedes').select('id').eq('id', sede_id).maybeSingle();
    if (!sede) {
      return jsonResponse({ error: 'Esa sede ya no existe.' }, 400);
    }

    const { data: created, error: createError } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (createError || !created.user) {
      return jsonResponse({ error: createError?.message || 'No se pudo crear el usuario.' }, 400);
    }

    const { data: profile, error: profileError } = await adminClient
      .from('perfiles')
      .insert({ id: created.user.id, nombre_completo, rol, sede_id, telefono, email })
      .select()
      .single();

    if (profileError) {
      // Don't leave an orphaned auth user with no matching profile.
      await adminClient.auth.admin.deleteUser(created.user.id);
      return jsonResponse({ error: profileError.message }, 400);
    }

    return jsonResponse({ profile }, 200);
  } catch (err) {
    return jsonResponse({ error: (err as Error).message || 'Error inesperado.' }, 500);
  }
});
