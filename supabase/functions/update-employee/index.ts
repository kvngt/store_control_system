// Updates an existing employee from the Settings screen.
//
// Mirrors create-employee: it runs on the service-role key because name, phone,
// role and sede live in `perfiles` but the email and the password live in
// `auth.users`, and only Supabase's admin API can touch those. Doing it from
// the browser would mean either giving the admin a way to sign in as the
// employee, or leaving the two records permanently out of step — which is what
// happened before this existed: an admin could not change anybody's details at
// all, so a mistyped email meant deleting the person and creating them again.
//
// Only an authenticated admin (checked below against their own `perfiles.rol`)
// may call it.
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
    const auth = await resolveAdminCaller(req, 'editar empleados');
    // Un motivo ya formado: sesión vencida, fallo pasajero del servicio, o no es admin.
    if (auth instanceof Response) return auth;
    const { adminClient } = auth;

    const body = await readJsonBody(req);
    if (body instanceof Response) return body;
    const userId = String(body.usuario_id || '').trim();
    if (!userId) {
      return jsonResponse({ error: 'Falta el usuario a editar.' }, 400);
    }
    if (!UUID_RE.test(userId)) {
      return jsonResponse({ error: 'El usuario no es válido.' }, 400);
    }

    const { data: target } = await adminClient
      .from('perfiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (!target) {
      return jsonResponse({ error: 'Ese usuario ya no existe.' }, 404);
    }

    // Only send fields the caller actually included, so a dialog that edits the
    // phone number doesn't blank out the role.
    const profilePatch: Record<string, unknown> = {};

    if (body.nombre_completo !== undefined) {
      const nombre = String(body.nombre_completo).trim();
      if (!nombre) return jsonResponse({ error: 'El nombre es obligatorio.' }, 400);
      if (nombre.length > MAX_NOMBRE) return jsonResponse({ error: 'El nombre es demasiado largo.' }, 400);
      profilePatch.nombre_completo = nombre;
    }

    if (body.telefono !== undefined) {
      const telefono = String(body.telefono).trim();
      if (telefono.length > MAX_TELEFONO) return jsonResponse({ error: 'El teléfono es demasiado largo.' }, 400);
      profilePatch.telefono = telefono || null;
    }

    if (body.sede_id !== undefined) {
      const sedeId = String(body.sede_id).trim();
      if (!sedeId) return jsonResponse({ error: 'Selecciona una sede.' }, 400);
      if (!UUID_RE.test(sedeId)) return jsonResponse({ error: 'La sede no es válida.' }, 400);
      // Se comprueba antes de tocar el acceso: si la sede no existe, el perfil no se podría guardar y
      // el correo o la contraseña ya estarían cambiados en Auth.
      const { data: sede } = await adminClient.from('sedes').select('id').eq('id', sedeId).maybeSingle();
      if (!sede) return jsonResponse({ error: 'Esa sede ya no existe.' }, 400);
      profilePatch.sede_id = sedeId;
    }

    if (body.rol !== undefined) {
      const rol = String(body.rol);
      if (!VALID_ROLES.includes(rol)) {
        return jsonResponse({ error: 'Rol inválido.' }, 400);
      }
      // Demoting the last admin would lock the shop out of Configuración,
      // Finanzas and Nómina with no way back in short of the SQL editor.
      if (target.rol === 'admin' && rol !== 'admin') {
        const { count } = await adminClient
          .from('perfiles')
          .select('id', { count: 'exact', head: true })
          .eq('rol', 'admin');
        if ((count ?? 0) <= 1) {
          return jsonResponse(
            { error: 'No puedes quitar el rol de administrador al único administrador del sistema.' },
            409
          );
        }
      }
      profilePatch.rol = rol;
    }

    let newEmail = body.email !== undefined ? String(body.email).trim() : null;
    const newPassword = body.password ? String(body.password) : null;

    if (newEmail !== null) {
      if (!EMAIL_RE.test(newEmail)) {
        return jsonResponse({ error: 'El correo no tiene un formato válido.' }, 400);
      }
      // Auth guarda los correos en minúsculas; el perfil debe decir lo mismo.
      newEmail = newEmail.toLowerCase();
      profilePatch.email = newEmail;
    }

    // El mismo mínimo que la app (src/lib/password.ts) y que Auth en el panel.
    if (newPassword !== null && newPassword.length < 8) {
      return jsonResponse({ error: 'La contraseña debe tener al menos 8 caracteres.' }, 400);
    }

    // auth.users first: it owns the credentials, and if it rejects the change
    // (email already taken by another login, weak password) the profile must
    // not have been rewritten to describe a login that doesn't exist.
    let authEmailChanged = false;
    let authPasswordChanged = false;
    if (newEmail !== null || newPassword !== null) {
      const authPatch: Record<string, unknown> = {};
      if (newEmail !== null && newEmail.toLowerCase() !== (target.email || '').toLowerCase()) {
        authPatch.email = newEmail;
        // Set by an admin who has verified the person, not by the person
        // clicking a link — without this the account is locked out until they
        // confirm an email they may never receive.
        authPatch.email_confirm = true;
      }
      if (newPassword !== null) authPatch.password = newPassword;

      if (Object.keys(authPatch).length > 0) {
        const { error: authError } = await adminClient.auth.admin.updateUserById(userId, authPatch);
        if (authError) {
          return jsonResponse({ error: authError.message }, 400);
        }
        authEmailChanged = authPatch.email !== undefined;
        authPasswordChanged = authPatch.password !== undefined;
      }
    }

    if (Object.keys(profilePatch).length === 0) {
      // Solo cambió la contraseña (o el correo ya era ese): el acceso ya se actualizó, no es un error.
      if (authPasswordChanged || authEmailChanged) return jsonResponse({ profile: target }, 200);
      return jsonResponse({ error: 'No hay cambios que guardar.' }, 400);
    }

    const { data: profile, error: profileError } = await adminClient
      .from('perfiles')
      .update(profilePatch)
      .eq('id', userId)
      .select()
      .single();

    if (profileError) {
      // El perfil no se pudo guardar: el correo del acceso vuelve a ser el de antes, para que Auth y
      // el perfil no queden describiendo dos correos distintos.
      if (authEmailChanged && target.email) {
        await adminClient.auth.admin.updateUserById(userId, { email: target.email, email_confirm: true });
      }
      return jsonResponse({ error: profileError.message }, 400);
    }

    return jsonResponse({ profile }, 200);
  } catch (err) {
    return jsonResponse({ error: (err as Error).message || 'Error inesperado.' }, 500);
  }
});
