// Removes an employee (perfiles row + auth user) from the Settings screen.
// Mirrors create-employee: runs with the service-role key because deleting an
// `auth.users` row requires Supabase's admin API, and only an authenticated
// admin (verified below against their own `perfiles.rol`) may call it.
import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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
      return jsonResponse({ error: 'Solo un administrador puede eliminar empleados.' }, 403);
    }

    const body = await req.json();
    const userId = String(body.usuario_id || '').trim();
    if (!userId) {
      return jsonResponse({ error: 'Falta el usuario a eliminar.' }, 400);
    }

    // An admin deleting themselves would lock the shop out of its own settings.
    if (userId === caller.id) {
      return jsonResponse({ error: 'No puedes eliminar tu propio usuario.' }, 400);
    }

    // Work orders reference perfiles via creado_por / asignaciones. Deleting
    // the profile would cascade or null those out, so refuse while the
    // employee still has assigned work — the admin must reassign it first.
    const { count: assignedCount } = await adminClient
      .from('orden_asignaciones')
      .select('id', { count: 'exact', head: true })
      .eq('usuario_id', userId);

    if ((assignedCount ?? 0) > 0) {
      return jsonResponse(
        { error: 'Este empleado todavía tiene órdenes asignadas. Reasígnalas antes de eliminarlo.' },
        409
      );
    }

    const { error: profileError } = await adminClient.from('perfiles').delete().eq('id', userId);
    if (profileError) {
      return jsonResponse({ error: profileError.message }, 400);
    }

    const { error: authError } = await adminClient.auth.admin.deleteUser(userId);
    if (authError) {
      // Profile is already gone; surface the partial failure so the admin knows
      // the login still exists and can be cleaned up from the dashboard.
      return jsonResponse(
        { error: `Perfil eliminado, pero el acceso no: ${authError.message}` },
        207
      );
    }

    return jsonResponse({ ok: true }, 200);
  } catch (err) {
    return jsonResponse({ error: (err as Error).message || 'Error inesperado.' }, 500);
  }
});
