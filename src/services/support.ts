// Cross-cutting helpers shared by the domain services.

// A DELETE the RLS policy refuses is not an error in PostgREST: the row simply
// isn't visible to the statement, so it reports success having removed nothing.
// Without this the UI would say "deleted" and then redraw the row still there.
// `.select('id')` makes the affected rows observable, so a no-op can be turned
// into the same 42501 the error mapper already renders as "no tienes permiso".
export function assertDeleted(rows: { id: string }[] | null, entity: string) {
  if ((rows || []).length === 0) {
    throw Object.assign(
      new Error(`No se pudo eliminar ${entity}: permiso denegado o el registro ya no existe.`),
      { code: '42501' }
    );
  }
}
