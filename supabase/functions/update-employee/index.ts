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
import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const VALID_ROLES = ['admin', 'mecanico', 'pintor'];

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return jsonResponse({ error: 'No autorizado.' }, 401);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user: caller },
    } = await callerClient.auth.getUser();
    if (!caller) {
      return jsonResponse({ error: 'No autorizado.' }, 401);
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const { data: callerProfile } = await adminClient
      .from('perfiles')
      .select('rol')
      .eq('id', caller.id)
      .single();

    if (callerProfile?.rol !== 'admin') {
      return jsonResponse({ error: 'Solo un administrador puede editar empleados.' }, 403);
    }

    const body = await req.json();
    const userId = String(body.usuario_id || '').trim();
    if (!userId) {
      return jsonResponse({ error: 'Falta el usuario a editar.' }, 400);
    }

    const { data: target } = await adminClient
      .from('perfiles')
      .select('id, rol, email')
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
      profilePatch.nombre_completo = nombre;
    }

    if (body.telefono !== undefined) {
      profilePatch.telefono = String(body.telefono).trim() || null;
    }

    if (body.sede_id !== undefined) {
      const sedeId = String(body.sede_id).trim();
      if (!sedeId) return jsonResponse({ error: 'Selecciona una sede.' }, 400);
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

    const newEmail = body.email !== undefined ? String(body.email).trim() : null;
    const newPassword = body.password ? String(body.password) : null;

    if (newEmail !== null) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(newEmail)) {
        return jsonResponse({ error: 'El correo no tiene un formato válido.' }, 400);
      }
      profilePatch.email = newEmail;
    }

    if (newPassword !== null && newPassword.length < 6) {
      return jsonResponse({ error: 'La contraseña debe tener al menos 6 caracteres.' }, 400);
    }

    // auth.users first: it owns the credentials, and if it rejects the change
    // (email already taken by another login, weak password) the profile must
    // not have been rewritten to describe a login that doesn't exist.
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
      }
    }

    if (Object.keys(profilePatch).length === 0) {
      return jsonResponse({ error: 'No hay cambios que guardar.' }, 400);
    }

    const { data: profile, error: profileError } = await adminClient
      .from('perfiles')
      .update(profilePatch)
      .eq('id', userId)
      .select()
      .single();

    if (profileError) {
      return jsonResponse({ error: profileError.message }, 400);
    }

    return jsonResponse({ profile }, 200);
  } catch (err) {
    return jsonResponse({ error: (err as Error).message || 'Error inesperado.' }, 500);
  }
});
