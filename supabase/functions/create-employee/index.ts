// Creates a new employee (auth user + perfiles row) from the Settings screen.
// Runs with the service-role key because creating an `auth.users` row requires
// Supabase's admin API, which is never safe to call from the browser. Only an
// authenticated admin (checked below via their own `perfiles.rol`) may call this.
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

    // Scoped to the caller's own JWT — used only to identify who is calling.
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
      return jsonResponse({ error: 'Solo un administrador puede crear empleados.' }, 403);
    }

    const body = await req.json();
    const email = String(body.email || '').trim();
    const password = String(body.password || '');
    const nombre_completo = String(body.nombre_completo || '').trim();
    const rol = String(body.rol || '');
    const sede_id = String(body.sede_id || '');
    const telefono = body.telefono ? String(body.telefono).trim() : null;

    if (!email || !password || !nombre_completo || !sede_id) {
      return jsonResponse({ error: 'Faltan campos obligatorios.' }, 400);
    }
    if (password.length < 6) {
      return jsonResponse({ error: 'La contraseña debe tener al menos 6 caracteres.' }, 400);
    }
    if (!VALID_ROLES.includes(rol)) {
      return jsonResponse({ error: 'Rol inválido.' }, 400);
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
