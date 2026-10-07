// Vacía los buckets de Storage con datos de operación, sin borrar los buckets.
//
// Acompaña a `limpiar-operacion.sql` / `limpiar-datos.sql`: Supabase no deja borrar
// archivos por SQL, y `supabase storage rm -r ss:///<bucket>` borra además el bucket
// (pasó el 29/09/2026). Este script borra archivo por archivo por la API de Storage.
//
// Vacía:   orden_media, comprobantes, estados_cuenta_bancarios, reportes,
//          vehiculos_fotos, firmas.
// Deja:    sede_logos (logos de las sedes) y avatares (fotos de los usuarios).
//
// Uso (la llave secreta solo en la terminal, nunca en un archivo del repositorio):
//   SUPABASE_URL=https://<proyecto>.supabase.co SUPABASE_SECRET_KEY=<llave> \
//     node scripts/admin/vaciar-storage.mjs            # solo cuenta lo que hay
//   ... node scripts/admin/vaciar-storage.mjs --borrar # borra
//
// La llave es la `secret` (o `service_role`) del panel → Project Settings → API Keys.
import { createClient } from '@supabase/supabase-js';

const BUCKETS = ['orden_media', 'comprobantes', 'estados_cuenta_bancarios', 'reportes', 'vehiculos_fotos', 'firmas'];

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const borrar = process.argv.includes('--borrar');

if (!url || !key) {
  console.error('Faltan SUPABASE_URL y SUPABASE_SECRET_KEY (la llave secreta del proyecto).');
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false } });

/** Todas las rutas de archivo de un bucket, entrando en cada carpeta. */
async function listarTodo(bucket, prefijo = '') {
  const rutas = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supabase.storage.from(bucket).list(prefijo, { limit: 1000, offset });
    if (error) throw new Error(`${bucket}/${prefijo}: ${error.message}`);
    for (const item of data) {
      const ruta = prefijo ? `${prefijo}/${item.name}` : item.name;
      // Una carpeta no tiene id; un archivo sí.
      if (item.id) rutas.push(ruta);
      else rutas.push(...(await listarTodo(bucket, ruta)));
    }
    if (data.length < 1000) break;
  }
  return rutas;
}

console.log(`Proyecto: ${url}`);
console.log(borrar ? 'Modo: BORRAR\n' : 'Modo: solo contar (agrega --borrar para borrar)\n');

let total = 0;
for (const bucket of BUCKETS) {
  let rutas;
  try {
    rutas = await listarTodo(bucket);
  } catch (err) {
    console.log(`${bucket}: no se pudo leer (${err.message})`);
    continue;
  }
  total += rutas.length;
  if (!borrar || rutas.length === 0) {
    console.log(`${bucket}: ${rutas.length} archivo(s)`);
    continue;
  }
  let borrados = 0;
  for (let i = 0; i < rutas.length; i += 100) {
    const lote = rutas.slice(i, i + 100);
    const { data, error } = await supabase.storage.from(bucket).remove(lote);
    if (error) {
      console.error(`${bucket}: falló un lote (${error.message}); se detiene.`);
      process.exit(1);
    }
    borrados += data.length;
  }
  console.log(`${bucket}: ${borrados} de ${rutas.length} archivo(s) borrados`);
}

console.log(`\nTotal: ${total} archivo(s)${borrar ? ' procesados' : ''}. Los buckets se conservan.`);
