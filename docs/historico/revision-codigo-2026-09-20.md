# Revisión de código — 2026-09-20

Búsqueda de errores y puntos de mejora en el código, sin una función nueva de por medio.
Salieron **once cosas**: seis eran fallos de verdad, tres de ellos míos de la semana pasada.

Al final: **385 pruebas unitarias**, 212 aserciones pgTAP (8/8), **61 PASS · 0 FAIL** de
seguridad, 72 e2e. Una migración nueva (**46 aplicadas**).

---

## Los fallos

### 1. La búsqueda del archivo devolvía 400, y se veía como "no hay nada archivado"

El peor de la lista, y mío. `getArchivedWorkOrders` buscaba así:

```ts
.or(`numero_orden.ilike.%${s}%,clientes.nombre.ilike.%${s}%`)
```

Un `or` de PostgREST **no puede nombrar una tabla embebida**: responde
`400 PGRST100 "failed to parse logic tree"`. Y como la pantalla no miraba el error, lo que
se veía era la lista vacía con el texto "aquí pasan las órdenes a los 90 días". Buscar en el
archivo nunca funcionó.

El nombre del cliente se resuelve ahora en su propia consulta y se filtra por
`cliente_id.in.(…)`, que sí es columna de la orden. Dos trampas más por el camino: una coma
en el término ("Pérez, Juan") partía el árbol lógico y daba `42703`, y sin clientes que
casaran quedaba un `in.()` vacío, que también es 400.

**Por qué no lo vio ninguna prueba:** la que había sustituye el servicio entero por un mock,
así que nunca llegó a formar la consulta. La nueva (`src/services/workOrders.archive.test.ts`)
mira el **texto del filtro**: que cada término sea `columna.operador.valor` de
`ordenes_trabajo`, que una coma no lo parta, y que el corte de 90 días sea el mismo en las
dos listas — si se separan, una orden entregada justo en la frontera no sale en ninguna y
parece desaparecida.

### 2. Dos pantallas decían "no hay datos" cuando la consulta se caía

Es la regla 10 del propio proyecto, incumplida en dos sitios que escribí yo:

- **Archivadas**: cualquier error → "nada ha pasado al archivo todavía".
- **Historial del vehículo**: `detailQuery.error` no estaba en la lista de errores de la
  página, así que un fallo de red pintaba "Sin resultados" — la pantalla afirmando que el
  vehículo no existe.

Las dos muestran ahora el error como el resto de las listas, y el vacío solo aparece cuando
de verdad no hay nada.

### 3. El perfil del cliente leía sin paginar y se tragaba los errores

`getCustomerDetail` pedía vehículos y órdenes con un `select` suelto y, peor, **descartaba el
`error`** (`const { data: vehicles }` sin más): una consulta caída se convertía en `[]` y la
pantalla decía "este cliente no tiene órdenes". Las dos listas van ahora con `fetchAll`, que
pagina y **lanza**.

Estaba anotado como deuda vieja en el comentario de `getVehicleDetail` ("no vale copiarla").
Ya se pudo borrar la nota.

### 4. Deshacer una importación bancaria eran dos DELETE desde el navegador

Los movimientos primero, el lote después. Si el segundo no salía — se cae la red, se cierra la
pestaña — **el dinero ya estaba borrado y el lote seguía en la lista** anunciando las
transacciones que acababan de desaparecer. La regla 8b dice que eso va en una RPC.

Migración `20261003000000_deshacer_importacion_atomica`:
`deshacer_importacion_estado_cuenta(p_importacion_id)`, `SECURITY INVOKER` como su gemela de
importar, con `FOR UPDATE` sobre el lote y un 42501 si el `ROW_COUNT` sale en cero — porque un
DELETE que la RLS rechaza no da error, devuelve cero filas. Devuelve cuántos movimientos
borró. Seis aserciones pgTAP nuevas y dos casos de seguridad (SEC-66, SEC-67).

Hay un agujero que esto cierra de paso: `finanzas_movimientos.importacion_id` es
`ON DELETE SET NULL`. Borrar solo el lote deja sus movimientos con el vínculo en null — dinero
en los libros que ya no pertenece a ninguna importación y que nadie puede volver a deshacer. El
orden del servicio lo evitaba por casualidad; ahora lo garantiza la transacción.

### 5. El cliente rechaza y la campana decía que había respondido

Mío, de la semana pasada. En F1 hice que la base ramificara el título del aviso al
administrador entre *"El cliente respondió el presupuesto"* y *"El cliente no autorizó el
presupuesto"*. Pero el frontend **vuelve a redactar** el aviso con su plantilla de i18n, y la
plantilla era una sola frase fija. Resultado: el push decía la verdad y la campana de la app,
no. Justo la distinción que la migración existía para dar.

`renderNotification` elige ahora la variante `_rechazo` cuando `datos.autorizados` es 0, y un
aviso viejo sin ese dato se queda con la redacción de siempre.

### 6. El dinero se escribía de dos maneras, y una se comía los centavos

Lo dejé anotado en el QA del 19 como "cosmético". No lo era:

| Importe | `toFixed(2)` | `toLocaleString()` |
|---|---|---|
| 1200 | `$1200.00` | `$1,200` |
| **1650.50** | `$1650.50` | **`$1,650.5`** |
| 1650.256 | `$1650.26` | `$1,650.256` |

`toLocaleString()` sin opciones no fija los decimales: **cincuenta centavos se leen como
cinco**. Y como no lleva locale, el mismo importe sale "1.650,50 US$" en un teléfono en
español.

Ahora hay un solo `src/lib/money.ts` (`money`, `moneySigned`) con `Intl.NumberFormat` en
notación de Estados Unidos — que es la del estado de cuenta contra el que se cuadran los
libros, y la que `es-US`, el locale del portal en español, produce igual. Sustituye a **cuatro
copias** repartidas por el código. El portal y las plantillas de correo ya lo hacían bien y no
se tocaron.

---

## Endurecido, sin fallo conocido

### 7. Cuatro escrituras podían reportar éxito sin haber escrito

Un `UPDATE` que la RLS no deja pasar devuelve **cero filas y ningún error**, igual que un
DELETE. Cuatro sitios no lo comprobaban, y el grave es `uploadSignature`: sube la imagen a
Storage y después escribe `firma_ruta`. Si ese UPDATE se queda en cero, la función devolvía la
ruta y la fecha como si todo hubiera ido bien — la pantalla dice "firmada", la orden se queda
sin firma y, **porque la primera firma es la que autoriza lo cotizado, el total sigue en
cero**. El cliente firma en la tableta y no queda registrado.

Hoy no es alcanzable: las políticas de SELECT y de UPDATE de `ordenes_trabajo` tienen la misma
condición, y los guardias levantan 42501 en vez de filtrar. Pero es una línea por sitio y
convierte un futuro ajuste de permisos en "no tienes permiso" en vez de en una mentira.
`assertAffected` en el estado de la orden, el avance, la tarea de la asignación, la firma y la
publicación de un archivo. **No** en marcar un aviso como leído, donde cero filas significa
"ya estaba leído".

### 8. Las reglas de categorización fallaban en silencio

`ImportStatementModal` cargaba las reglas con `.catch(() => {})`. Sin ellas cada línea entra
con la categoría por omisión, y quien importa no tiene forma de notar que faltaron: el dinero
queda en el rubro equivocado y las gráficas de Finanzas salen mal. Ahora lo dice en el diálogo.

---

## Las pruebas también tenían fallos

### 9. Dos pruebas que no podían fallar

`ArchivedOrders` y el historial del vehículo comprueban que **un técnico no ve la columna de
total** con un `queryByText('$500')`. Al cambiar el formato ese texto dejó de existir, así que
la prueba pasaba buscando algo que nadie pinta — habría pasado igual con el total a la vista.
Ahora la prueba de al lado afirma que un admin **sí** ve `$500.00`, que es lo que le da sentido
a la negativa.

### 10. Nada comprobaba que los dos idiomas tuvieran las mismas claves

`Translations` es una firma de índice, así que TypeScript no compara los dos árboles, y
`getTranslation` devuelve **la clave** cuando no encuentra nada: un olvido se ve como
`workOrders.archivedSearch` escrito en la pantalla, no como texto en el otro idioma.

`src/i18n/translations.test.ts` comprueba ahora mismas claves, mismos marcadores `{dato}`,
ningún texto vacío, y que la lista de omisiones a propósito no tenga sobras. Al escribirla
apareció la única diferencia real: `presupuesto_respondido` existía en inglés y no en español.
Es deliberado — el título de la base ("Trabajos autorizados · ORD-…") dice más que cualquier
frase genérica — y ahora está escrito como tal en lugar de parecer un descuido.

### 11. `docs/supabase.md` se había quedado cinco funciones atrás

Decía 92 funciones y 21 RPC; son 97 y 23. Faltaban `marcar_labor_completada` y
`recordar_ordenes_vencidas` de la semana pasada. Recontado **desde el catálogo**
(`has_function_privilege('authenticated', …)`), no a mano, que es lo que se desactualizó.

---

## Lo que se revisó y está bien

Vale dejarlo escrito para no volver a mirarlo:

- **La frontera del portal se respeta**: ningún import de `src/portal/` arrastra
  `lib/supabase`, `services/`, contextos ni `i18n/translations.ts`.
- **La cola de subidas es por persona.** Cada trabajo lleva su `userId` y el corredor descarta
  los de otro, así que en una tableta compartida nadie reanuda las fotos del turno anterior
  (regla 8c).
- **Ningún componente llama `supabase.from`** directo.
- **Los totales de Finanzas salen de `resumen_panel`**, no de una suma en el navegador.
- **Los siete `.catch()` vacíos que quedan están justificados** uno por uno (limpiar un archivo
  huérfano, un PDF sin el enlace del portal, un cuerpo de error que no es JSON).
- **`findPossibleDuplicates` usa `toISOString().split('T')[0]`**, que la regla 8 prohíbe, pero
  ahí es seguro: parsea con `new Date('AAAA-MM-DD')`, que también es UTC, así que el día vuelve
  igual; y es una ventana de búsqueda con ±2 días de holgura.

---

## Pendiente, y es tuyo

**Hay que volver a subir el `dist/`.** Casi todo lo de arriba es frontend y el sitio publicado
no lo tiene: sigue con la búsqueda del archivo rota, con los centavos comidos y con el rechazo
del cliente leyéndose como una aprobación. La migración ya está aplicada en la base, y es
aditiva, así que el orden no importa.

Del panel sigue abierto lo mismo que en la revisión del 19: **plan Pro** (lo dejaste para antes
de producción), rotar la llave de Resend, SMTP propio para Auth, Sentry, los 8 caracteres en
Auth, protección de contraseñas filtradas y los 78 MB de `vehiculos_fotos`.

Lo que **no** se pudo probar de punta a punta: deshacer una importación con datos reales,
porque no hay ninguna importación en el proyecto. Lo cubren las seis aserciones pgTAP contra la
misma migración y los dos casos de seguridad contra el proyecto real.
