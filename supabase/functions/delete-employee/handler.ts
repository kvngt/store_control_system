// Removes an employee (perfiles row + auth user) from the Settings screen.
// Mirrors create-employee: runs with the service-role key because deleting an
// `auth.users` row requires Supabase's admin API, and only an authenticated
// admin (verified below against their own `perfiles.rol`) may call it.
import {
  type AdminCallerDeps,
  corsHeaders,
  defaultAdminCallerDeps,
  jsonResponse,
  readJsonBody,
  resolveAdminCaller,
  unavailableResponse,
  UUID_RE,
} from '../_shared/caller.ts';

export type Deps = AdminCallerDeps;

export function defaultDeps(): Deps {
  return defaultAdminCallerDeps();
}

export async function handler(req: Request, deps: Deps = defaultDeps()): Promise<Response> {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const auth = await resolveAdminCaller(req, 'eliminar empleados', deps);
    // Un motivo ya formado: sesión vencida, fallo pasajero del servicio, o no es admin.
    if (auth instanceof Response) return auth;
    const { userId: callerId, adminClient } = auth;

    const body = await readJsonBody(req);
    if (body instanceof Response) return body;
    const userId = String(body.usuario_id || '').trim();
    if (!userId) {
      return jsonResponse({ error: 'Falta el usuario a eliminar.' }, 400);
    }
    if (!UUID_RE.test(userId)) {
      return jsonResponse({ error: 'El usuario no es válido.' }, 400);
    }

    // An admin deleting themselves would lock the shop out of its own settings.
    if (userId === callerId) {
      return jsonResponse({ error: 'No puedes eliminar tu propio usuario.' }, 400);
    }

    // Que exista: un id de otra persona ya borrada (o mal copiado) respondía "ok" sin hacer nada.
    const { data: perfil, error: perfilError } = await adminClient
      .from('perfiles')
      .select('id')
      .eq('id', userId)
      .maybeSingle();
    if (perfilError) throw perfilError;
    if (!perfil) {
      return jsonResponse({ error: 'Ese empleado ya no existe.' }, 404);
    }

    // Work orders reference perfiles via creado_por / asignaciones. Deleting
    // the profile would cascade or null those out, so refuse while the
    // employee still has assigned work — the admin must reassign it first.
    const { count: assignedCount, error: assignedError } = await adminClient
      .from('orden_asignaciones')
      .select('id', { count: 'exact', head: true })
      .eq('usuario_id', userId);

    if (assignedError) return unavailableResponse();
    if ((assignedCount ?? 0) > 0) {
      return jsonResponse(
        { error: 'Este empleado todavía tiene órdenes asignadas. Reasígnalas antes de eliminarlo.' },
        409
      );
    }

    // Los pagos de comisiones apuntan a la persona con RESTRICT: son el historial de
    // lo que se le pagó (y su egreso en Finanzas). Sin esta revisión el borrado
    // fallaba con el error crudo de la llave foránea.
    const { count: paymentsCount, error: paymentsError } = await adminClient
      .from('comision_pagos')
      .select('id', { count: 'exact', head: true })
      .eq('usuario_id', userId);

    if (paymentsError) return unavailableResponse();
    if ((paymentsCount ?? 0) > 0) {
      return jsonResponse(
        { error: 'Este empleado tiene pagos de comisiones registrados. Eliminarlo borraría ese historial, así que no se puede eliminar.' },
        409
      );
    }

    // Los trabajos adicionales (hallazgos) que reportó o resolvió, y las comisiones que tiene, son
    // historia de la orden: borrar a la persona los rompería (la llave foránea no lo deja, y las
    // comisiones se irían en cascada). Antes salía el error crudo de Postgres (QA 19/10/2026).
    // Sus tareas (orden_labor.asignado_a, ON DELETE SET NULL) quedarían sin técnico y nadie cobraría
    // su comisión; su reloj (orden_labor_tiempos, ON DELETE CASCADE) se borraría de los indicadores.
    const [reportados, resueltos, comisiones, tareas, tiempos] = await Promise.all([
      adminClient.from('orden_hallazgos').select('id', { count: 'exact', head: true }).eq('reportado_por', userId),
      adminClient.from('orden_hallazgos').select('id', { count: 'exact', head: true }).eq('resuelto_por', userId),
      adminClient.from('comisiones').select('id', { count: 'exact', head: true }).eq('usuario_id', userId),
      adminClient.from('orden_labor').select('id', { count: 'exact', head: true }).eq('asignado_a', userId),
      adminClient.from('orden_labor_tiempos').select('id', { count: 'exact', head: true }).eq('usuario_id', userId),
    ]);
    if (reportados.error || resueltos.error || comisiones.error || tareas.error || tiempos.error) {
      return unavailableResponse();
    }
    if ((tareas.count ?? 0) > 0) {
      return jsonResponse(
        { error: 'Esta persona tiene tareas asignadas en órdenes. Pásaselas a otro técnico antes de eliminarla.' },
        409
      );
    }
    if ((tiempos.count ?? 0) > 0) {
      return jsonResponse(
        { error: 'Esta persona tiene horas registradas con el reloj. Eliminarla borraría ese historial, así que no se puede eliminar.' },
        409
      );
    }
    if ((reportados.count ?? 0) > 0 || (resueltos.count ?? 0) > 0) {
      return jsonResponse(
        { error: 'Esta persona reportó o resolvió trabajos adicionales de órdenes. Eliminarla borraría ese historial, así que no se puede eliminar.' },
        409
      );
    }
    if ((comisiones.count ?? 0) > 0) {
      return jsonResponse(
        { error: 'Esta persona tiene comisiones registradas. Eliminarla las borraría, así que no se puede eliminar.' },
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
}

