# Refactorización de septiembre 2026 — análisis propio y cambios aplicados

Este documento acompaña a [`ARCHITECTURE_AUDIT.md`](./ARCHITECTURE_AUDIT.md). La
auditoría describe correctamente la *forma* del problema (componentes y servicios
monolíticos, estado remoto a mano); lo que sigue es el análisis que hice sobre el
código antes de tocarlo, los defectos concretos que encontré —varios de ellos no
mencionados en la auditoría— y lo que quedó implementado.

Punto de partida: 101 pruebas en verde, 13.038 líneas en `src/`.
Estado final: **123 pruebas en verde**, `tsc -b` limpio, `npm run build` funcionando.

---

## 1. Defectos encontrados por análisis propio

Estos no están en la auditoría original y son, en mi opinión, más urgentes que
la reorganización de carpetas.

### 1.1 `npm run build` estaba roto en `main`

`build` es `tsc -b && vite build`. El proyecto `e2e` (`tsconfig.node.json`) tenía
seis errores de compilación —variables sin usar y un parámetro `page` con tipo
implícito— así que `tsc -b` fallaba y `vite build` **nunca llegaba a ejecutarse**.
Cualquier despliegue desde un árbol limpio fallaba.

Corregido en `e2e/qa-customers-vehicles.spec.ts` y `e2e/qa-settings.spec.ts`.

### 1.2 `strict` estaba apagado en TypeScript

`tsconfig.app.json` no tenía `strict`, es decir sin `strictNullChecks` ni
`noImplicitAny`. Al comprobarlo, el código **ya compilaba limpio con `--strict`**:
la disciplina estaba ahí, pero nada la sostenía. Encender la bandera costó cero
errores hoy y evita que el próximo `any` entre sin que nadie lo note.

### 1.3 Cambiar de idioma volvía a consultar toda la base de datos

Siete pantallas tenían este patrón (Clientes, Vehículos, Órdenes, Kanban,
Finanzas, Nómina y el Dashboard; Configuración también recarga sedes y personal):

```ts
const loadData = useCallback(() => { … .catch(err => setError(getErrorMessage(err, language))) },
  [sedeId, language]);   // ← `language` acá
useEffect(() => { loadData(); }, [loadData]);
```

`language` estaba en las dependencias sólo porque el error se traducía en el
momento de la captura. Consecuencia: pulsar ES/EN en el encabezado relanzaba
cada consulta de la pantalla —en Finanzas, cuatro consultas completas— por datos
que no habían cambiado.

### 1.4 Condiciones de carrera al cambiar de sede

Ninguna de esas pantallas (salvo el Dashboard) cancelaba ni invalidaba la
petición en vuelo. Cambiar de sede dos veces seguidas ponía dos consultas a
competir, y ganaba la que la red respondiera de último: el tablero podía quedar
mostrando las órdenes del **otro** taller mientras el encabezado decía otra cosa.

### 1.5 Fugas de memoria con `blob:` URLs

- `WorkOrders.tsx` creaba una URL de objeto por cada foto de inspección y **no
  revocaba ninguna**. Cerrar el diálogo, reemplazar una foto o descartar un
  borrador dejaba la imagen a resolución completa retenida durante toda la vida
  de la pestaña. En una tablet de taller que captura seis fotos por orden, todo
  el día, eso se acumula.
- Peor: las miniaturas del registro de avance hacían
  `<img src={URL.createObjectURL(file)} />` **dentro del render**, generando una
  URL nueva en cada pulsación de tecla del campo de notas.

### 1.6 `createWorkOrder` no era atómico

PostgREST no da transacción entre los cuatro `INSERT` (orden, labor, repuestos,
asignaciones). Si fallaba cualquiera de los hijos, quedaba una orden a medias:
había consumido un número del contador, aparecía en el tablero sin mano de obra,
sin repuestos y sin nadie asignado, y el usuario —que vio un error— no sabía que
existía.

### 1.7 `deleteSede` se salía del patrón `assertDeleted`

El servicio tiene un guardián deliberado (`assertDeleted`) para el hecho de que
un `DELETE` rechazado por RLS en PostgREST **reporta éxito habiendo borrado
cero filas**. Estaba aplicado a clientes, vehículos y órdenes, pero no a sedes,
cuya política `sedes_write` es sólo para administradores.

### 1.8 Detalles menores

- `handleSave` de Clientes mostraba `(err as Error).message` —texto crudo de
  Postgres— en vez de pasar por `getErrorMessage`, que ya tiene el mensaje
  bilingüe amable para violaciones de unicidad.
- El alta rápida de vehículo desde una orden guardaba `placa: ''`. La columna es
  nullable precisamente para que "sin placa" se lea como `NULL` en todas partes
  (ver migración `20260909000000_parts_expense_and_optional_plate.sql`); la
  pantalla de Vehículos es cuidadosa con esto y la de Órdenes no lo era. Tampoco
  normalizaba la placa a mayúsculas.
- Los cinco *contexts* construían el objeto `value` como literal en cada render,
  así que **todo consumidor se re-renderizaba** ante cualquier render del
  proveedor. `AuthContext` envuelve la aplicación entera.
- `ToastContext` no limpiaba sus `setTimeout` al desmontar.
- El *suite* de pruebas fallaba de forma intermitente por contención: 17 entornos
  jsdom en paralelo se ahogaban entre sí y las consultas `findBy*` excedían el
  tiempo por defecto de 5 s. Fallaba por razones ajenas al código, y distinto en
  cada corrida.

---

## 2. Cambios implementados

### 2.1 Capa de datos dividida por dominio

`supabaseService.ts` (867 líneas) pasó a ser una fachada de composición sobre
diez módulos:

```
src/services/
  support.ts             assertDeleted, isSameMonth
  sedes.service.ts       users.service.ts      customers.service.ts
  vehicles.service.ts    workOrders.service.ts finance.service.ts
  payroll.service.ts     dashboard.service.ts  search.service.ts
  storage.service.ts
  supabaseService.ts     ← compone y reexporta
```

La fachada mantiene el objeto plano `supabaseService` que ya importaban todas
las pantallas, así que la división **no costó nada al resto del código** y cada
pantalla puede migrar a su servicio estrecho a su ritmo. Las que toqué en esta
tanda ya importan el estrecho (`workOrdersService`, `financeService`, …), que es
lo que hace que el grafo de módulos diga quién habla con qué.

### 2.2 Tipos divididos por dominio

`types/database.ts` (291 líneas) es ahora un barril sobre `types/domain/`:
`enums`, `auth`, `customer`, `vehicle`, `workOrder`, `finance`, `payroll`,
`dashboard`. Mismo criterio: los ~60 puntos de importación siguen apuntando a
`types/database`.

### 2.3 `useAsyncData` — estado remoto con cancelación

`src/hooks/useAsyncData.ts` reemplaza el cuarteto
`useState`+`useEffect`+`loading`+`error` de cada pantalla. Dos propiedades
resuelven §1.3 y §1.4:

- Cada petición lleva un identificador monótono y **sólo la más reciente puede
  escribir estado**; las superadas se descartan al llegar, incluido el desmontaje.
- El error se guarda **crudo** y se traduce en el render, de modo que `language`
  desaparece de las dependencias del cargador.

Adoptado en Dashboard, Clientes, Vehículos, Órdenes, Kanban, Finanzas y Nómina.
Cubierto por cinco pruebas, incluida la de respuesta fuera de orden.

Decisión sobre **TanStack Query**: la auditoría lo propone y a mediano plazo es
la respuesta correcta (caché compartida entre pantallas, revalidación, reintentos).
No lo incorporé en esta tanda porque el defecto real —carreras y refetch por
idioma— se arregla sin dependencia nueva, y migrar siete pantallas a una librería
de golpe es mucho más riesgo del que justificaba esta pasada. `useAsyncData` deja
las pantallas con la misma forma (`data`/`loading`/`error`/`reload`) que tendría
la migración, así que el cambio posterior es mecánico. Lo que sí falta y sólo
React Query resuelve bien: caché compartida entre pantallas (hoy Finanzas y el
Dashboard piden `getDashboardStats` por separado).

### 2.4 `WorkOrders.tsx` desmontado

2.094 → **1.532 líneas**, con dos piezas extraídas a `src/features/workOrders/`:

- `useWorkOrderForm.ts` (325 líneas) — los ~20 `useState` del formulario de alta,
  el cálculo de "sucio" para el guardián de navegación, y **la propiedad de las
  URLs de objeto**: cada una se revoca cuando su foto desaparece, al reiniciar y
  al desmontar (§1.5).
- `WorkOrderCreateModal.tsx` (504 líneas) — el diálogo, ahora puramente de
  presentación: recibe el formulario y emite `onSubmit`/`onClose`.

Además, la miniatura del registro de avance pasó a un componente
`DraftPhotoThumb` que es dueño de su URL, en vez de acuñar una por render.

Cobertura nueva: 12 pruebas para el hook (fugas, odómetro, "sucio", reintento
seguro tras alta de cliente) y 5 de humo para la pantalla, que antes **no tenía
ninguna** — exactamente la razón por la que era difícil de tocar.

### 2.5 Correcciones puntuales

| Defecto | Corrección |
| --- | --- |
| §1.1 build roto | seis errores de tipo en `e2e/` |
| §1.2 `strict` apagado | `"strict": true` en `tsconfig.app.json` |
| §1.6 orden a medias | compensación: se borra la orden antes de relanzar el error del hijo |
| §1.7 `deleteSede` | `.select('id')` + `assertDeleted` |
| §1.8 error crudo | `getErrorMessage` en `Customers.handleSave` |
| §1.8 `placa: ''` | `plate || null`, con normalización a mayúsculas |
| §1.8 contexts | `useMemo` sobre el `value` de los cinco proveedores |
| §1.8 toasts | temporizadores registrados y limpiados al desmontar |
| §1.8 pruebas frágiles | `maxWorkers: '50%'`, `testTimeout: 30000` |

### 2.6 División del paquete por ruta

`App.tsx` carga con `React.lazy` todo excepto Login, Dashboard y el armazón.
El *chunk* de entrada bajó de **689 kB a 528 kB** (153 kB gzip):

```
528 kB  index            (react, router, supabase, sentry, dashboard, armazón)
 77 kB  WorkOrders        31 kB  Vehicles       20 kB  Settings
 17 kB  Finance           13 kB  Customers       9 kB  Payroll     6 kB  KanbanBoard
```

Un pintor que sólo abre Órdenes y Kanban ya no descarga Finanzas, Nómina ni
Configuración.

---

## 3. Segunda tanda — pendientes resueltos

Estado tras esta ronda: **127 pruebas en verde**, `tsc -b` limpio, `npm run build`
funcionando y **`oxlint` sin un solo aviso** (antes seis).

### 3.1 Vista de detalle de la orden desmontada

`WorkOrders.tsx`: **1.532 → 487 líneas**. Lo que salió, a `src/features/workOrders/`:

| Archivo | Líneas | Responsabilidad |
| --- | --- | --- |
| `useWorkOrderDetail.ts` | 356 | Leer la orden y todas sus mutaciones |
| `WorkOrderDetail.tsx` | 366 | Composición del detalle (cabecera, vehículo, totales, técnicos) |
| `PartsTable.tsx` | 225 | Repuestos, con sus propios borradores de fila |
| `ProgressLog.tsx` | 152 | Registro de avance + miniatura dueña de su `blob:` URL |
| `LaborTable.tsx` | 148 | Mano de obra |
| `SignatureCard.tsx` | 124 | Firma del cliente y dimensionado del canvas |

El hook concentra una regla que antes estaba repetida en nueve manejadores:
**toda mutación vuelve a leer la orden del servidor** en lugar de parchear la
copia local, porque `total_labor` / `total_repuestos` / `total_general` los
recalcula un *trigger* y el cliente no puede conocer los nuevos totales.
Las tablas se quedaron con sus propios borradores de fila, lo que sacó ocho
`useState` más de la página.

Cobertura nueva: cuatro pruebas de detalle (carga de labor/repuestos, la
relectura tras añadir mano de obra, el aviso de solo lectura para un técnico no
asignado, y la confirmación antes de marcar "entregado").

### 3.2 `createWorkOrder` como transacción real

Migración `20260911000000_create_work_order_rpc.sql`: una función
`create_work_order(jsonb, jsonb, jsonb, jsonb)` que inserta la orden y sus tres
tablas hijas en una sola sentencia. Es `SECURITY INVOKER` a propósito —debe
ejecutarse como quien llama para que las políticas RLS se apliquen igual que
hoy; una versión `SECURITY DEFINER` sería una forma silenciosa de que un
técnico escribiera en otra sede.

El servicio la llama y **cae al camino anterior** (los cuatro `INSERT` con
compensación) sólo si Postgres/PostgREST responden que la función no existe
(`PGRST202` / `42883`), que es como el resto del código ya tolera entornos sin
la migración aplicada. Cualquier otro error —una restricción violada, un rechazo
de RLS— llega al usuario sin tocar.

### 3.3 Contextos separados de sus proveedores

Los cinco contextos se partieron en `*.context.ts` (objeto, tipos y hook) y el
`.tsx` con sólo el proveedor. Esto elimina los cinco avisos
`only-export-components`: *fast refresh* sólo preserva estado en módulos que
exportan componentes y nada más, así que editar un contexto forzaba una recarga
completa de la página. 24 archivos y 8 mocks de prueba reapuntados.

### 3.4 `Settings.tsx` migrado a `useAsyncData`

Última pantalla que quedaba con el refetch por idioma descrito en §1.3. Los
borradores de capacidad y de marca se siembran ahora con un `useEffect` sobre
los datos cargados, que reproduce el comportamiento anterior (cada guardado
recarga y la nueva base pasa a ser el valor guardado).

### 3.5 `login-bg.jpg` → WebP

**840 kB → 104 kB** (−88 %), mismas dimensiones (1376×768), calidad 78. En móvil
la imagen se muestra desenfocada al 30 % de brillo y en escritorio bajo una capa
de superposición, así que la calidad no es perceptible. La conversión se hizo
una sola vez con `sharp` en un directorio temporal; **no se añadió ninguna
dependencia al proyecto**.

### 3.6 Paquete resultante

```
529 kB  index            (react, router, supabase, sentry, dashboard, armazón)
104 kB  login-bg.webp    (era 840 kB)
 78 kB  WorkOrders        31 kB  Vehicles       20 kB  Settings
 17 kB  Finance           13 kB  Customers       9 kB  Payroll     6 kB  KanbanBoard
```

---

## 4. Tercera tanda — las dos librerías

Estado final: **140 pruebas en verde**, `tsc -b` limpio, `oxlint` sin avisos y
`npm run build` funcionando.

### 4.1 TanStack Query

`useAsyncData` cumplió su papel de puente y **se eliminó**: React Query hace lo
mismo (cancelación de respuestas superadas, error crudo) y además lo que el
hook casero no podía dar, que es caché compartida entre pantallas.

- [`src/lib/queryClient.ts`](../src/lib/queryClient.ts) concentra las claves en
  un solo sitio, para que una invalidación y la consulta que pretende invalidar
  no puedan separarse. Toda clave de datos de taller lleva la sede: la
  aplicación es multi-inquilino y dos talleres no pueden responderse preguntas
  entre sí.
- `staleTime: 30 s`, `refetchOnWindowFocus: false` y `retry: 1`. Los tres
  valores están razonados en el archivo; el resumen es que estos datos cambian
  cuando alguien del taller los cambia, no solos, y que un reintento no arregla
  ninguno de los fallos que esta aplicación sufre de verdad (RLS, restricción
  violada, fila inexistente) — sólo retrasa el mensaje.
- Las ocho pantallas migradas usan **una consulta por recurso**, no una
  combinada. Eso es lo que hace que la lista de clientes que abre Vehículos sea
  la misma entrada de caché que ya llenó Clientes, y que el tablero de Órdenes,
  Kanban, el Dashboard y Finanzas compartan una sola lectura de órdenes.

**Un fallo que encontré en mi propio diseño al ir a probarlo:** Finanzas pedía
`getDashboardStats(sedeId)` y el Dashboard `getDashboardStats(sedeId, capacity)`.
Claves distintas, dos peticiones — justo el ahorro que justificaba la migración,
y no ocurría. Finanzas sólo lee `ingresos_por_mes`, así que ahora pasa la misma
capacidad. Está fijado por prueba en
[`queryClient.test.tsx`](../src/lib/queryClient.test.tsx), porque el ahorro no es
una propiedad de la librería: sólo existe si las dos pantallas coinciden en la
clave, argumento por argumento.

Un detalle que costó encontrar y merece quedar escrito: escribir
`query.data ?? []` asigna un array nuevo en **cada render**, así que todo
`useMemo` río abajo ve una dependencia cambiada y se recalcula siempre. Las
listas filtradas de Vehículos y Finanzas se recalculaban con cada tecla. De ahí
[`emptyList()`](../src/lib/emptyList.ts): una única lista vacía congelada.

### 4.2 React Hook Form + Zod

La validación era un tramo de `if` al inicio del manejador de envío que
construía **un** mensaje concatenando etiquetas de campo. Un formulario con tres
problemas reportaba uno, en una frase armada con etiquetas, y nunca señalaba qué
casilla. Ahora:

| Archivo | Responsabilidad |
| --- | --- |
| [`workOrderForm.schema.ts`](../src/features/workOrders/workOrderForm.schema.ts) | Las reglas, incluidas las dos ramas o/o (cliente y vehículo existentes vs. creados en línea) |
| [`useIntakePhotos.ts`](../src/features/workOrders/useIntakePhotos.ts) | Las fotos y la propiedad de sus `blob:` URL |
| [`useWorkOrderForm.ts`](../src/features/workOrders/useWorkOrderForm.ts) | Compone RHF + esquema + fotos |

Dos decisiones que conviene no deshacer:

1. **Los mensajes son claves de traducción, no frases.** El esquema se ejecuta
   al enviar; la frase se produce al pintarla. Es la misma regla que sigue la
   capa de datos, y es lo que evita que cambiar de idioma signifique revalidar
   el formulario. Hay una prueba que lo fija.
2. **Las fotos quedan fuera de RHF.** Son `File` con una `blob:` URL cada una, y
   lo que hay que gestionar no es su valor sino su **vida**. También implica que
   el `isDirty` de RHF no las ve, así que el hook las suma aparte — un borrador
   que sólo son seis fotos es justo el que conviene proteger de un clic perdido.

**Coste en bundle, medido.** RHF + Zod clásico llevaron el chunk de Órdenes de
78 kB a 192 kB. Reescribiendo el esquema sobre `zod/mini` (mismas reglas, API
`.check()`, resolver `standardSchemaResolver`) baja a **130 kB**. Órdenes es la
pantalla más usada del taller y se abre en tablets sobre wifi de taller, así que
los 62 kB recuperados valían la reescritura. El sobrecoste neto sigue siendo
~52 kB sobre el punto de partida; es el precio de la validación por campo.

### 4.3 Paquete final

```
563 kB  index            (react, router, supabase, sentry, react-query, dashboard)
443 kB  ImportStatementModal  (perezoso: pdfjs)
406 kB  workOrderPdf          (perezoso: jspdf + html2canvas)
130 kB  WorkOrders            (perezoso: incluye RHF + zod/mini)
104 kB  login-bg.webp         (era 840 kB)
 31 kB  Vehicles     20 kB  Settings     17 kB  Finance
 13 kB  Customers     9 kB  Payroll       6 kB  KanbanBoard
```

---

## 5. Lo que sigue pendiente

Nada de la hoja de ruta original. Lo que queda es trabajo nuevo que este
refactor deja a la vista:

1. **Aplicar y probar la migración `create_work_order` contra la base real.**
   No he podido ejecutarla; el servicio cae al camino anterior si la función no
   existe, así que la aplicación funciona en ambos casos, pero la transacción
   sólo empieza a protegerte cuando la migración está aplicada.
2. **Las pruebas e2e de Playwright no se han ejecutado** en esta sesión (exigen
   credenciales y un entorno con datos). Conviene pasarlas antes de desplegar.
3. `index` son 563 kB: `@sentry/react` y `@supabase/supabase-js` son la mayor
   parte. Sentry admite un build más pequeño si se recortan integraciones.
