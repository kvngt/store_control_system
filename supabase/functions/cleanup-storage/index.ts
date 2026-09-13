// Borra del bucket `orden_media` los archivos que ya no pertenecen a nada.
//
// La base puede decir cuáles son (`archivos_huerfanos`) pero no puede borrar
// objetos de Storage. Aparecen cuando se borra una sede entera — sus órdenes se
// van en cascada y con ellas las filas que decían qué archivos eran — o cuando
// una subida a medias nunca llegó a guardar su fila.
//
// La llama pg_cron una vez al día (restorify-maintenance). Sin esto, esos videos
// ocuparían la cuota del plan para siempre sin que nadie pudiera verlos.
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { isAuthorizedInternalCall, json } from '../_shared/internal.ts';

const BUCKET = 'orden_media';
/** Tope por invocación; lo que quede se borra al día siguiente. */
const MAX_ROUNDS = 10;

const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false },
});

Deno.serve(async (req) => {
  if (!isAuthorizedInternalCall(req)) return json({ error: 'No autorizado.' }, 401);

  let removed = 0;
  for (let round = 0; round < MAX_ROUNDS; round++) {
    const { data, error } = await supabase.rpc('archivos_huerfanos', { p_limit: 500 });
    if (error) return json({ error: error.message, removed }, 500);

    const names = ((data ?? []) as { nombre: string }[]).map((row) => row.nombre);
    if (names.length === 0) break;

    // La API de Storage acepta lotes; 100 por petición es un tamaño cómodo.
    for (let i = 0; i < names.length; i += 100) {
      const batch = names.slice(i, i + 100);
      const { error: removeError } = await supabase.storage.from(BUCKET).remove(batch);
      if (removeError) return json({ error: removeError.message, removed }, 500);
      removed += batch.length;
    }
  }

  return json({ removed });
});
