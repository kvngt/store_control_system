# Lo que salió de la prueba en el teléfono — 2026-09-28

Kevin probó la app y dejó cinco observaciones. Dos eran correctas tal como estaban
(eliminar un empleado con órdenes asignadas se bloquea con un mensaje claro, y dar de alta
empleados funciona). Las otras cinco se analizaron y se resolvieron así.

Dos migraciones nuevas, **49 aplicadas**. 426 pruebas unitarias, 223 aserciones pgTAP (9/9),
66 PASS · 0 FAIL de seguridad, 76 e2e.

---

## 1. "Las notificaciones push no están configuradas en este servidor"

**No era el servidor, y no hacía falta código.** El servidor está completo: tiene las tres
llaves VAPID y la función que envía. El problema estaba en el sitio publicado.

`VITE_VAPID_PUBLIC_KEY` se incrusta en el `dist/` **al compilar**. Se revisaron los 39
archivos del sitio publicado: el código de push está, la llave no. El `dist/` que está en
Hostinger se compiló antes de definir esa variable. La llave de `.env.local` y la del servidor
coinciden — se comparó su SHA-256, sin imprimir ninguna de las dos — y un build de hoy sí la
trae.

**Se arregla subiendo el `dist/` nuevo.** Para que no vuelva a pasar, `vite build` ahora avisa
si compila sin la llave, igual que ya avisaba sin `VITE_PUBLIC_SITE_URL` (probado en los dos
sentidos: calla con la llave, avisa sin ella).

## 2. Archivar una orden entregada

Hasta hoy el archivo era **solo automático**: una orden salía del tablero 90 días después de
entregada. Por eso "Entregado" se llenaba y no había forma de sacarla antes.

Ahora un admin la archiva a mano (migración `20261005000000`):

- **En el teléfono**, en el Kanban: **Mover a → Archivar**, justo donde Kevin la buscó.
- **En la computadora**, un botón **Archivar** en la tarjeta (ahí no hay selector: se
  arrastra, y archivar no es una columna).
- **En el detalle de la orden**, que además tiene **Devolver al tablero** para las archivadas.

Es una columna (`archivada_en`) y no un estado nuevo, a propósito: una orden archivada **sigue
entregada** para el cobro, las comisiones, el portal y el panel. Un valor más en
`order_status` habría obligado a revisar cada `estatus = 'entregado'` del sistema.

Dos reglas en la base, para que ninguna orden desaparezca de las dos listas a la vez:

- **Solo lo entregado se archiva** (un CHECK). Una en proceso archivada quedaría fuera del
  tablero *y* fuera del archivo.
- **Sacar una orden de "Entregado" la desarchiva** (un trigger). Se corrige en vez de
  rechazar: quien la reabre está corrigiendo una entrega, no pensando en el archivo.

No hizo falta ningún permiso nuevo: un técnico ya no puede tocar una orden entregada, y la
columna nueva no está en su lista de permitidas.

**Verificado contra la base real**, con ORD-2026-002: antes estaba en el tablero y no en el
archivo; archivada, al revés; archivar una no entregada se rechazó (23514); desarchivada,
volvió al tablero. Quedó como estaba.

Una cosa comprobada antes de construir encima: la lista del archivo ahora lleva dos `or` (el
del archivo y el de la búsqueda). Se probó contra la API que PostgREST los combina con AND —
un `or` ya había roto la búsqueda del archivo una vez por suponer cómo lo lee.

## 3. La campana: borrar, y por qué se acumulaba

**Lo pedido:** "Marcar todo leído" ya existía, pero solo aparece mientras hay no leídos, y no
había forma de **borrar**. Ahora hay una **X** por aviso y **Borrar todas** (con
confirmación, y también borra los viejos que no alcanzan a verse). No hizo falta migración:
la RLS ya dejaba a cada quien borrar los suyos. Si borrar falla, el aviso vuelve y la campana
lo dice — uno que desaparece y reaparece al recargar parecería un botón roto.

**Lo que se encontró al mirarla:** la causa principal de la acumulación no era la falta del
botón. El recordatorio diario de orden vencida creaba **un aviso nuevo cada día** por cada
orden atrasada: "5 días de retraso", "4 días", "3 días"… de la misma ORD-2026-003. Había **20
avisos de ese tipo para solo 4 pares persona-orden**; 16 eran copias viejas.

Migración `20261005000001`: el recordatorio **reemplaza** su aviso del día anterior en vez de
apilar otro. Queda uno por orden y persona, con los días de retraso al día y sin leer — el
empujón diario sigue, incluido el push. Los 16 duplicados se limpiaron: quedan 4.

## 4. Que el reporte lleve el logo, los datos y los colores de cada taller

Se revisó pieza por pieza:

| | Logo | Nombre y datos | Color |
|---|---|---|---|
| Portal del cliente | ✅ | ✅ | ✅ |
| Correos | ✅ | ✅ | ✅ |
| **PDF** | ✅ | ✅ | ❌ → **arreglado** |

El PDF tenía el color fijo: `BRAND = [212, 160, 23]`, el dorado de la app. El reporte de
cualquier taller salía dorado aunque el logo de arriba fuera de otro.

Ahora usa `color_tema` de la sede **de la orden** (no la elegida arriba, igual que el logo).
Con un matiz que importa: en una raya cualquier color se ve, en **texto** no. El color de la
sede principal es `#e8c64a`, un amarillo que sobre blanco no se lee. Así que las rayas llevan
el color tal cual y el texto uno **oscurecido lo justo** para llegar al contraste 4.5:1 de
WCAG, sin dejar de ser el mismo tono (`src/lib/brandColor.ts`). Una sede sin color sale con el
dorado de siempre.

Las dos sedes reales tienen logo y los dos cargan (HTTP 200). "PRUEBA Sede Norte" no tiene
color y sale con el de la app.

**De paso, un texto viejo que llegaba al cliente:** el PDF imprimía el estado
`espera_autorizacion` como **"Espera de Repuestos"**, el nombre de antes de F1. El cliente leía
en su PDF una espera que no existe. Ahora dice "Esperando su autorización", como su portal.

El PDF no tenía ninguna prueba. Ahora tiene tres, con un jsPDF de mentira que anota cada
llamada: el nombre del taller sale en su color legible, las rayas en el color tal cual, y el
estado dice lo mismo que el portal.

## 5. El teléfono con su país

El teléfono era un campo de texto suelto, así que el número no decía de dónde era. Ahora
(`src/components/PhoneInput.tsx`):

- A la izquierda, el país: **Estados Unidos (+1)** elegido de entrada, **México (+52)** justo
  después, y el resto — Centroamérica, el Caribe y Sudamérica, más España — en orden
  alfabético. Puerto Rico y República Dominicana marcan con +1 como EE. UU.; se reconocen por
  el código de área al volver a abrir el número.
- Se guarda en **formato internacional** (`+525512345678`) en la misma columna, sin
  migración. Es el que usan la llamada y WhatsApp.
- Se muestra con formato en la lista, el perfil, el buscador, el selector de dueño, la
  ventana de enviar reporte y el PDF: `+1 (512) 555-0100`, `+52 55 1234 5678`.
- Si a un número de EE. UU. le falta un dígito, avisa al salir del campo. Avisa, no bloquea:
  un número viejo no debe impedir guardar el resto de la ficha.
- Está en los tres lugares donde se da de alta un cliente: la pantalla de Clientes, el alta
  rápida de dueño en Vehículos y el cliente nuevo dentro de la orden.

**Los números que ya estaban no se reescriben.** Se leen como de EE. UU. — que es lo que ya
asumía WhatsApp — y siguen tal cual en la base hasta que alguien edite el teléfono.

**Un fallo que había en WhatsApp:** `toWhatsAppNumber` decidía solo por la cantidad de dígitos,
también cuando el número ya traía "+". Un número internacional de diez dígitos — Cuba es +53
más ocho — recibía el 1 de EE. UU. encima y WhatsApp abría otro número. Con el selector eso
habría pasado cada vez; ahora un número con "+" se respeta tal cual.

La búsqueda de clientes por teléfono también compara solo dígitos: "512-555" encuentra
`+15125550100`.

---

## Lo que queda

**Subir el `dist/`.** Hoy más que nunca: el sitio publicado no tiene la llave de push, ni
archivar, ni la campana nueva, ni el teléfono con país, ni el color del PDF. Las dos
migraciones ya están en la base y son aditivas, así que el orden no importa — pero hasta que
lo subas, la app muestra el aviso de versión desactualizada ("app-behind").

**Una decisión tuya, sin hacer:** el PDF usa etiquetas internas para los otros estados
("Recepción", "Finalizado") mientras el portal le habla al cliente ("Recibido", "Listo para
recoger"). Solo se corrigió la que nombraba un estado que ya no existe. Si quieres que el PDF
hable igual que el portal en todos, es un cambio de una tabla.
