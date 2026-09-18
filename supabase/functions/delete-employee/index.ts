// Removes an employee (perfiles row + auth user) from the Settings screen.
// Mirrors create-employee: runs with the service-role key because deleting an
// `auth.users` row requires Supabase's admin API, and only an authenticated
// admin (verified below against their own `perfiles.rol`) may call it.
import { corsHeaders, jsonResponse, resolveAdminCaller } from '../_shared/caller.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const auth = await resolveAdminCaller(req, 'eliminar empleados');
    // Un motivo ya formado: sesión vencida, fallo pasajero del servicio, o no es admin.
    if (auth instanceof Response) return auth;
    const { userId: callerId, adminClient } = auth;

    const body = await req.json();
    const userId = String(body.usuario_id || '').trim();
    if (!userId) {
      return jsonResponse({ error: 'Falta el usuario a eliminar.' }, 400);
    }

    // An admin deleting themselves would lock the shop out of its own settings.
    if (userId === callerId) {
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

    // Los pagos de comisiones apuntan a la persona con RESTRICT: son el historial de
    // lo que se le pagó (y su egreso en Finanzas). Sin esta revisión el borrado
    // fallaba con el error crudo de la llave foránea.
    const { count: paymentsCount } = await adminClient
      .from('comision_pagos')
      .select('id', { count: 'exact', head: true })
      .eq('usuario_id', userId);

    if ((paymentsCount ?? 0) > 0) {
      return jsonResponse(
        { error: 'Este empleado tiene pagos de comisiones registrados. Eliminarlo borraría ese historial, así que no se puede eliminar.' },
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
