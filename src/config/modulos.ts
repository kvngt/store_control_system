/**
 * Módulos opcionales que el taller puede ocultar por despliegue mediante
 * `VITE_MODULOS_APAGADOS` (lista separada por comas).
 *
 * Apagar un módulo solo esconde su interfaz y redirige sus rutas: la base,
 * las políticas RLS y los cálculos automáticos siguen intactos para poder
 * reactivarlo más adelante sin migraciones ni pérdida de datos.
 */
export type Modulo =
  | 'comisiones'
  | 'inspeccion'
  | 'reloj'
  | 'catalogo'
  | 'estados_de_cuenta'
  | 'indicadores';

const MODULOS_VALIDOS: ReadonlySet<string> = new Set<Modulo>([
  'comisiones',
  'inspeccion',
  'reloj',
  'catalogo',
  'estados_de_cuenta',
  'indicadores',
]);

/**
 * Parsea `VITE_MODULOS_APAGADOS`: separa por comas, ignora espacios y descarta
 * entradas vacías o nombres desconocidos.
 */
export function modulosApagados(valor: string | undefined): ReadonlySet<Modulo> {
  if (!valor) return new Set();
  const resultado = new Set<Modulo>();
  for (const parte of valor.split(',')) {
    const nombre = parte.trim();
    if (nombre && MODULOS_VALIDOS.has(nombre)) {
      resultado.add(nombre as Modulo);
    }
  }
  return resultado;
}

/**
 * Indica si un módulo está visible en este despliegue.
 *
 * Lee `import.meta.env.VITE_MODULOS_APAGADOS` en cada llamada para que las
 * pruebas puedan alternarlo con `vi.stubEnv`.
 */
export function moduloActivo(m: Modulo): boolean {
  const raw = import.meta.env.VITE_MODULOS_APAGADOS;
  return !modulosApagados(typeof raw === 'string' ? raw : undefined).has(m);
}
