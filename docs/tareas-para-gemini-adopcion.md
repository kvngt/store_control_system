# Tareas para Gemini: fase 1, escáner de VIN y dibujo del vehículo

> **Aprobado por la persona responsable el 14/10/2026.**
>
> - **Arquitecto y verificación:** Claude Code. **Implementa:** Gemini 3.8 Flash High
>   (Antigravity), en una copia aislada y sin terminal.
> - **Cómo se corre:** en dos tandas. La **parte A** (fase 1 y escáner) va primero; la
>   **parte B** (dibujo de daños) parte del resultado de la A.
> - **El porqué** de cada tarea está en [plan-adopcion-2026-10.md](plan-adopcion-2026-10.md).
> - **Si algo no se puede hacer como está escrito, detente y anótalo en la bitácora.** No
>   improvises otro diseño.

## 0. Reglas (obligatorias)

1. Lee `AGENTS.md` (incluida la sección «Principios de UX y adopción en el taller") y
   `docs/ai-context.md`. Para la base, sigue `.claude/commands/nueva-migracion.md` al pie de la
   letra.
2. **No tienes terminal:** no corres `npm`, `git` ni `supabase`. Escribe el código y las pruebas
   para que pasen a la primera; Claude Code las corre después.
3. **Funciones SQL:** cada función que reescribas parte **entera** de la versión que indica la
   tarea, y cambia **solo** lo que la tarea pide. Claude compara tu versión con la anterior
   línea por línea: cualquier otro cambio se revierte.
   - Ninguna función nueva queda sin `REVOKE ALL ... FROM PUBLIC, anon, authenticated`.
   - No toques funciones que la tarea no nombra (por ejemplo, `hoy_taller`).
4. **No inventes nombres:** cada archivo, función, columna, clave de traducción o componente
   tiene que existir (búscalo) o crearlo tú en la tarea.
5. **Textos:** todo texto visible pasa por i18n, en español **e** inglés
   (`src/i18n/translations.ts`; en el portal, `src/portal/strings.ts`). Colores solo con tokens
   CSS: nunca un color literal.
6. **El portal (`src/portal/`)** solo importa módulos puros (`src/lib/phone.ts`,
   `src/lib/vehicleDiagram.ts`, `src/components/VehicleDiagram.tsx`): nunca servicios,
   contextos ni `i18n/translations.ts`.
7. **Lo que se manda al cliente va en su idioma:** `getTranslation(idioma, clave)`
   (`translations.ts:3174`), con `idioma = order.cliente?.idioma === 'es' ? 'es' : 'en'`.
8. **No sumes dinero en el navegador.**
9. **Dependencias:** no agregues ni cambies ninguna. `barcode-detector` 3.2.2 y `zxing-wasm`
   3.1.3 ya están en `package.json`.
10. **Bitácora:** al terminar cada parte, escribe una entrada en `docs/bitacora.md` que diga
    que **no corriste ninguna prueba**.

## Parte A: fase 1 y escáner de VIN

### A0. Migración `20261010000030_autorizar_en_recepcion.sql`

**Qué:** el alta puede dejar autorizado lo cotizado cuando el cliente lo acepta en el
mostrador.

1. Reescribe `create_work_order` partiendo **entera** de su versión en
   `20261010000027_orden_con_seguro.sql`. Conserva la firma, `SECURITY DEFINER`, el
   `search_path` y los `REVOKE`/`GRANT` de esa versión.
2. **Único cambio:** después de insertar trabajos, repuestos y asignaciones, si
   `COALESCE((p_order->>'autorizado_en_recepcion')::boolean, false)` y la orden tiene líneas en
   `borrador`:
   - junta en un arreglo los `id` de `orden_labor` y de `orden_repuestos` de esa orden con
     `estado = 'borrador'`;
   - llama
     `PERFORM public.registrar_autorizacion(<id de la orden>, <arreglo>, <arreglo>, 'admin_presencial', NULL, 'Autorizado al recibir el vehículo.');`.

   Con `NULL` en el nombre, la base usa el del cliente
   (`20260924000000_quotes_and_authorization.sql:699-703`).
3. Encabezado en español: el pedido, la regla («solo lo autorizado se cobra»: la casilla viene
   desmarcada y solo un admin crea órdenes) y que la firma sigue sin autorizar nada.
4. **pgTAP** en `supabase/tests/database/35_autorizar_en_recepcion.test.sql`, con el patrón de
   `32_orden_con_seguro.test.sql`. Comprueba:
   - con `true`, un trabajo de 750 y un depósito de 300: la línea queda `aprobado`; el
     presupuesto, con `respondido_via = 'admin_presencial'` y el nombre del cliente;
     `orden_montos.total_general = 750`, y el depósito sigue en 300;
   - con `false` o sin la llave: las líneas quedan en `borrador` y no hay presupuesto
     respondido;
   - con `true` y sin líneas: no da error ni crea presupuesto;
   - con repuestos además del trabajo: se autorizan los dos.

### A1. VIN opcional

1. **`src/features/workOrders/workOrderForm.schema.ts:104-110`:**
   - VIN vacío: sin error;
   - VIN escrito con un largo distinto de 17: `workOrders.validation.vinLength`;
   - quita `workOrders.validation.vehicleVin` y, si la clave queda sin uso, bórrala en los dos
     idiomas.
2. **`src/features/vehicles/VehicleFields.tsx`** y `src/pages/Vehicles.tsx` (`hasErrors`):
   - un VIN vacío es válido;
   - un VIN incompleto sigue dando error;
   - el botón de decodificar sigue apagado hasta los 17 caracteres.
3. **`vehicles.vinHelp`** (`translations.ts:156` y `:1745`):
   - ES: «Escribe o escanea los 17 caracteres y la marca, el modelo y el año se llenan solos.
     Si no lo tienes a mano, déjalo vacío y agrégalo después.»
   - EN: «Type or scan the 17 characters and the make, model and year fill themselves in. If
     you don't have it handy, leave it blank and add it later.»
4. **Al guardar no cambia nada:** `checkVin('').normalized` ya da `''`, y la columna lo acepta.
5. **Un VIN vacío se muestra como «—»:** en el detalle de la orden, en la tabla de Vehículos
   (`Vehicles.tsx:310`) y en el PDF (`src/lib/workOrderPdf.ts`).
6. **Pruebas** en `workOrderForm.schema.test.ts`:
   - un VIN vacío pasa;
   - uno de 16 caracteres da `vinLength`;
   - uno de 17 pasa.

### A2. Casilla «El cliente aceptó estos trabajos» (contrato de A0)

1. **Esquema:**
   - agrega `authorizedAtIntake: z.boolean()` a `baseShape`, con `false` en
     `emptyWorkOrderForm`;
   - súmalo a los campos del paso `'work'` de `INTAKE_STEPS`.
2. **Pantalla:** en `WorkOrderCreateModal.tsx`, paso 3, una casilla después de los repuestos y
   antes de la fecha estimada (cerca de `:668`).
   - Sigue el patrón de la casilla de seguro.
   - Sale solo si hay al menos un trabajo o un repuesto. Si se borran todos, vuelve a `false`.
   - **Viene desmarcada** (decisión del 14/10).
   - Textos:

     | Clave | ES | EN |
     |---|---|---|
     | `intake.authorizedAtIntake` | «El cliente aceptó estos trabajos y precios» | «The customer accepted this work and these prices» |
     | `intake.authorizedAtIntakeHint` | «Quedan autorizados en persona, a nombre del cliente. Si el precio lo da el dueño después, déjala sin marcar y envía el presupuesto.» | «They are authorized in person, in the customer's name. If the owner sets the price later, leave it unchecked and send the estimate.» |
3. **Lo que se manda:**
   - `src/pages/WorkOrders.tsx` (objeto de la orden, cerca de `:436`):
     `autorizado_en_recepcion: values.authorizedAtIntake`, y `false` si no hay líneas;
   - `src/services/workOrders.service.ts` (`createWorkOrder`): pásalo dentro de `p_order`
     **con esa llave exacta**, como `deposito_metodo`.
4. **Pruebas:**
   - en `workOrders.service.test.ts`, que la llave viaje con ese nombre (sigue la prueba que
     fija las llaves del depósito);
   - que la casilla no sale sin líneas y sí sale con una.

### A3. Mensajes al cliente en su idioma, y aviso de «listo» sin correo

1. **`src/services/reports.service.ts:17-33` (`buildMessage`):** los textos pasan a i18n y salen
   en el idioma del cliente.

   | Clave | ES | EN |
   |---|---|---|
   | `customerLink.reportGreeting` | «Hola {nombre},» | «Hi {nombre},» |
   | `customerLink.reportGreetingNoName` | «Hola,» | «Hi,» |
   | `customerLink.reportBody` | «Aquí puede ver el reporte de su orden {numero}{vehiculo}: el estado, las fotos y videos del trabajo y su cuenta.» | «Here is the report for your order {numero}{vehiculo}: its status, the photos and videos of the work, and your bill.» |

   - `{vehiculo}` vale « (2019 Honda CR-V)» o nada.
   - La forma del mensaje no cambia.
2. **`CustomerLinkCard.tsx:103-108`:** `customerLink.whatsappMessage` en el idioma del cliente,
   con `getTranslation`.
3. **`customerLink.noEmail`** (`translations.ts:966` y `:2537`) termina con:
   - ES: «Compártele el enlace por WhatsApp o SMS.»
   - EN: «Share the link via WhatsApp or text message.»
4. **Aviso de «listo»:** después de un `markReadyForPickup` con éxito
   (`useWorkOrderDetail.ts:404-416`), si el cliente **no tiene correo válido** (`isValidEmail`,
   `src/lib/email.ts`), abre `src/features/workOrders/ReadyNotifyModal.tsx`
   (`modal-overlay` + `modal`).
   - **Textos:**

     | Clave | ES | EN |
     |---|---|---|
     | `customerLink.readyTitle` | «Avísale al cliente que su vehículo está listo» | «Let the customer know the vehicle is ready» |
     | `customerLink.readyHint` | «No tiene correo: el aviso automático no le llega.» | «No email on file: the automatic notice won't reach them.» |
     | `customerLink.readyMessage` | «Hola {nombre}, su {vehiculo} ya está listo para recoger (orden {numero}). Aquí puede ver el detalle y el saldo: {url}» | «Hi {nombre}, your {vehiculo} is ready for pickup (order {numero}). See the details and balance here: {url}» |

     El mensaje es de solo lectura y va en el idioma del cliente.
   - **Botones:**
     - SMS (`smsUrl`), solo si `canOpenSms()`; es el principal en el teléfono;
     - WhatsApp (`whatsAppUrl`);
     - Copiar (`customerLink.copy` y `customerLink.copied`);
     - Cerrar (`common.close`).
   - **Enlace:** `customerPortalService.getActiveLink(order.id)`; si no hay, `createLink`. Se
     arma con `customerPortalService.portalUrl(token)`.
   - **Errores:** dentro del diálogo.
   - **Con correo válido no cambia nada.**
5. **Pruebas:**
   - `buildMessage` en ES y en EN;
   - el diálogo: sin SMS en una computadora (simula `canOpenSms`), y en inglés para un cliente
     en inglés;
   - el diálogo se abre solo si el cliente no tiene correo.

### A4. «Marcar lista para entregar» como acción rápida, y botones de 44 px

1. En `adminActions` (`WorkOrderDetail.tsx:857`), agrega `markReady`:
   - ícono `CheckCircle2`, etiqueta `workOrders.markReady`, `primary: true`;
   - sale cuando `order.estatus === 'finalizado' && !order.lista_para_entregar_en &&
     !order.retirada_sin_reparar`;
   - llama a `detail.markReadyForPickup()`;
   - en ese estado no puede haber otra acción con `primary: true`;
   - el botón del encabezado (`:989-1014`) se queda.
2. En el bloque para teléfono de `components.css` (cerca de `:2289`):
   `.quick-actions .btn { min-height: 44px; }`.

### A5. El color del vehículo en el idioma del cliente

1. **Archivo nuevo `src/lib/vehicleColor.ts`:** una función pura y sin imports,
   `translateVehicleColor(color: string, idioma: 'es' | 'en'): string`.
   - Diccionario en los dos sentidos:

     | ES | EN |
     |---|---|
     | blanco | White |
     | negro | Black |
     | gris | Gray (o «Grey») |
     | plata, plateado | Silver |
     | rojo | Red |
     | azul | Blue |
     | azul marino | Navy |
     | verde | Green |
     | amarillo | Yellow |
     | naranja, anaranjado | Orange |
     | café, marrón | Brown |
     | beige | Beige |
     | dorado | Gold |
     | morado, púrpura | Purple |
     | vino, guinda | Maroon |
     | champán | Champagne |
     | bronce | Bronze |
   - Compara sin espacios sobrantes, sin mayúsculas y sin acentos, contra el texto completo.
   - Devuelve la palabra con la primera letra en mayúscula; lo que no conoce, tal cual.
2. **Dónde se usa** (busca `.color`): `src/portal/ServicePage.tsx`,
   `src/portal/CustomerPortal.tsx` y `src/lib/workOrderPdf.ts`, cada uno con su idioma.
3. **Pruebas:**
   - `src/lib/vehicleColor.test.ts`;
   - en `ServicePage.test.tsx`, que «Gris» salga como «Gray» en inglés.

### A6. Escáner del código de barras del VIN

**Qué:** escanear con la cámara el código de barras del VIN (el que viene en el marco de la
puerta del conductor o debajo del parabrisas) y llenar el campo.

1. **`src/lib/vinScan.ts`** (con pruebas): `vinFromBarcode(raw: string): string | null`.
   - Pasa el texto a mayúsculas y quita todo lo que no sea letra o número.
   - Si queda de 18 caracteres y empieza con «I», quita esa «I» (marca de importación de
     algunas etiquetas).
   - Es válido solo si son 17 caracteres de `^[A-HJ-NPR-Z0-9]{17}$`. Si no, `null`.
2. **`src/lib/barcodeDetector.ts`:** `getVinDetector(): Promise<{ detect(src: ImageBitmapSource): Promise<{ rawValue: string }[]> }>`,
   guardado en caché.
   - Formatos: `code_39`, `code_128`, `data_matrix`, `qr_code` y `pdf417`.
   - Si existe `globalThis.BarcodeDetector` nativo y `getSupportedFormats()` incluye `code_39`,
     usa el nativo (Chrome en Android).
   - Si no (Safari en iPhone y Windows), cárgalo con `import()` dinámico, para que no entre al
     paquete principal:

     ```ts
     const { BarcodeDetector, prepareZXingModule } = await import('barcode-detector/ponyfill');
     const { default: wasmUrl } = await import('zxing-wasm/reader/zxing_reader.wasm?url');
     prepareZXingModule({
       overrides: { locateFile: (path: string, prefix: string) => (path.endsWith('.wasm') ? wasmUrl : prefix + path) },
     });
     return new BarcodeDetector({ formats: [...] });
     ```

     Así el `.wasm` sale del propio sitio y no de un CDN.
3. **`src/features/vehicles/VinScannerModal.tsx`:** `modal-overlay` + `modal`, con props
   `{ onDetected(vin: string): void; onClose(): void }`.
   - **Cámara:**
     - al abrir, `navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false })`;
     - un `<video playsInline muted autoPlay>` con un recuadro guía encima (CSS con tokens).
   - **Lectura:**
     - cada 250 ms, `detector.detect(video)`; cada `rawValue` pasa por `vinFromBarcode`;
     - con el primer VIN válido, apaga la cámara (detén todas las pistas) y llama a
       `onDetected(vin)`.
   - **Foto (respaldo, sobre todo en iPhone):** un botón «Tomar foto del código» con
     `<input type="file" accept="image/*" capture="environment">`, `createImageBitmap(file)`
     y el mismo `detect`.
   - **Errores** (se muestran dentro del diálogo y la opción de foto se queda):
     - si la cámara falla o no hay permiso: `vehicles.scanNoCamera`;
     - si la foto no trae un VIN: `vehicles.scanNotFound`.
   - **Al cerrar o desmontar:** apaga la cámara y limpia el temporizador.
4. **`src/features/vehicles/VehicleFields.tsx`:** botón «Escanear» (`vehicles.scanVin`, ícono
   `ScanBarcode` de `lucide-react`) junto al campo del VIN. Abre el diálogo; al detectar, pone el
   VIN en el campo y lanza la misma decodificación que el botón de decodificar. Sirve en el alta
   y en Vehículos, porque los dos usan `VehicleFields`.
5. **`public/.htaccess`:** agrega `AddType application/wasm .wasm`, junto al
   `AddType ... .webmanifest`.
6. **Textos:**

   | Clave | ES | EN |
   |---|---|---|
   | `vehicles.scanVin` | «Escanear» | «Scan» |
   | `vehicles.scanTitle` | «Escanear el VIN» | «Scan the VIN» |
   | `vehicles.scanHint` | «Apunta al código de barras del VIN: en el marco de la puerta del conductor o debajo del parabrisas.» | «Point at the VIN barcode: on the driver's door frame or under the windshield.» |
   | `vehicles.scanPhoto` | «Tomar foto del código» | «Take a photo of the barcode» |
   | `vehicles.scanNoCamera` | «No se pudo abrir la cámara. Toma una foto del código o escribe el VIN.» | «The camera couldn't open. Take a photo of the barcode or type the VIN.» |
   | `vehicles.scanNotFound` | «No encontré un VIN en esa imagen. Acércate al código e inténtalo otra vez.» | «No VIN found in that image. Get closer to the barcode and try again.» |
7. **Pruebas:**
   - `vinScan.test.ts`: con «I» delante, con guiones, con «O» (inválido) y de 16 caracteres;
   - `barcodeDetector.test.ts`: elige el nativo cuando existe y soporta `code_39` (simula el
     global);
   - `VinScannerModal.test.tsx`, simulando `getUserMedia` (que falle) y `getVinDetector`:
     - con la cámara fallando, aparece el mensaje y el botón de foto;
     - una foto con un código válido llama a `onDetected` con el VIN.

### A7. Manual (parte A)

`docs/manual-usuario.md` y `docs/manual-usuario.en.md`, con la misma estructura en los dos (lo
fija `helpDoc.test.ts`):

- **En «Crear una orden»:**
  - el VIN es opcional;
  - el botón «Escanear» (cámara o foto);
  - la casilla «El cliente aceptó estos trabajos y precios».
- **Subsección nueva «Recibir un carro rápido»** (`<!-- rol: admin -->`):
  1. Cliente: nombre y teléfono.
  2. Vehículo: escanea el VIN, o solo marca y modelo.
  3. Un trabajo con el precio acordado, y la casilla si el cliente aceptó.
  4. Depósito.
  5. Crear.
- **En «Lista para entregar»:** el aviso por SMS o WhatsApp sin correo, y la acción rápida.
- **Los mensajes al cliente salen en su idioma.**
- **Sin capturas:** las toma Claude.

`docs/mapa-de-secciones.md`: los archivos nuevos.

## Parte B: el dibujo del vehículo (daños marcados)

**Qué:** el «dibujito del carro» de la hoja de papel del taller.

- Cinco vistas: **lado izquierdo, lado derecho, frente, atrás y arriba**.
- La administradora toca donde está el daño y elige el tipo.
- Queda en la orden y sale en el PDF que firma el cliente y en su enlace.
- Después de la firma ya no se cambia: es la prueba de cómo llegó el carro.

### B0. Migración `20261010000031_marcas_de_danos.sql`

1. **Columna:** `ALTER TABLE public.ordenes_trabajo ADD COLUMN marcas_danos JSONB NOT NULL DEFAULT '[]'::jsonb;`
   con esta restricción, tal cual (Claude la probó en la base local):

   ```sql
   ALTER TABLE public.ordenes_trabajo ADD CONSTRAINT ordenes_trabajo_marcas_danos_validas CHECK (
     jsonb_typeof(marcas_danos) = 'array'
     AND jsonb_array_length(marcas_danos) <= 60
     AND NOT jsonb_path_exists(marcas_danos, '$[*] ? (@.type() != "object" || !exists(@.vista) || !exists(@.tipo) || !exists(@.x) || !exists(@.y) || !(@.vista == "superior" || @.vista == "frontal" || @.vista == "trasera" || @.vista == "izquierda" || @.vista == "derecha") || !(@.tipo == "golpe" || @.tipo == "rayon" || @.tipo == "pintura" || @.tipo == "roto" || @.tipo == "otro") || @.x.type() != "number" || @.y.type() != "number" || @.x < 0 || @.x > 1 || @.y < 0 || @.y > 1)')
   );
   ```

   Cada marca es `{ "vista": ..., "x": 0..1, "y": 0..1, "tipo": ... }`: `x` e `y` son la
   posición dentro de la vista, de 0 a 1.
2. **Candado después de la firma:** una función nueva `public.trg_marcas_danos_firmadas()`
   (`plpgsql`, `SET search_path = public`, `REVOKE ALL ... FROM PUBLIC, anon, authenticated` y
   sin `GRANT`) y el trigger `trg_marcas_danos_firmadas`
   `BEFORE UPDATE OF marcas_danos ON public.ordenes_trabajo`.
   - Si `OLD.firma_ruta IS NOT NULL AND NEW.marcas_danos IS DISTINCT FROM OLD.marcas_danos`:
     `RAISE EXCEPTION 'El cliente ya firmó la recepción: los daños marcados no se pueden cambiar.' USING ERRCODE = '42501';`.
   - El técnico no la puede cambiar en ningún caso: el guardia `trg_guard_order_technician`
     (lista blanca) ya lo impide, **no lo toques**.
3. **`create_work_order`:** reescríbela entera desde su versión en **`20261010000030`** (parte
   A). **Único cambio:** el `INSERT` en `ordenes_trabajo` guarda
   `marcas_danos = CASE WHEN jsonb_typeof(p_order->'marcas_danos') = 'array' THEN p_order->'marcas_danos' ELSE '[]'::jsonb END`.
4. **`datos_portal`:** reescríbela entera desde su versión en `20261010000029`. **Único
   cambio:** junto a `'notas_recepcion'` (cerca de `:466` de esa migración), agrega
   `'marcas_danos'`, armado marca por marca con
   `jsonb_build_object('vista', ..., 'x', ..., 'y', ..., 'tipo', ...)` sobre
   `jsonb_array_elements(v_orden.marcas_danos)`. Nunca `to_jsonb`: una llave de más no sale.
5. **`trg_historial`:** reescríbela entera desde su versión en `20261010000029` (función y
   `CREATE TRIGGER`). **Único cambio:** `marcas_danos` entra en las columnas de
   `ordenes_trabajo` que se registran y en su `UPDATE OF`.
6. **pgTAP** en `supabase/tests/database/36_marcas_de_danos.test.sql`. Comprueba:
   - el valor por defecto es `[]`;
   - acepta una marca válida;
   - rechaza: vista inválida, `x` mayor que 1, `x` como texto, sin `tipo`, tipo inválido, un
     elemento que no es objeto y más de 60 marcas;
   - `create_work_order` guarda las marcas;
   - un admin cambia las marcas antes de la firma; después de la firma, 42501;
   - el técnico asignado las lee pero no las cambia;
   - `datos_portal` trae las marcas sin llaves de más;
   - el historial registra el cambio.
7. **`scripts/qa/api-security.mjs`:** `SEC-172`, «Un técnico no cambia las marcas de daño de
   una orden»: `PATCH` de `marcas_danos` sobre `ORDEN`; espera `'denied-or-empty'`. Mira los
   casos `tech(...)` que ya hacen `PATCH` sobre la orden.

### B1. Geometría compartida: `src/lib/vehicleDiagram.ts`

Un módulo puro, sin React ni imports: lo usan la app, el portal y el PDF.

- **Tipos:**
  - `DamageView = 'izquierda' | 'derecha' | 'frontal' | 'trasera' | 'superior'`;
  - `DamageType = 'golpe' | 'rayon' | 'pintura' | 'roto' | 'otro'`;
  - `DamageMark = { vista; x; y; tipo }`.
- **`DAMAGE_TYPES`:** con su letra: golpe «G», rayón «R», pintura «P», roto «X» y otro «O».
- **`MAX_DAMAGE_MARKS = 60`.**
- **`DAMAGE_VIEWS`:** por vista, `{ id, width, height, shapes }`.
  - `width` y `height` son unidades del dibujo: laterales 200 × 80, frente y atrás 100 × 80,
    arriba 200 × 90.
  - Cada forma es `{ kind: 'poly'; points: [number, number][]; closed: boolean }` o
    `{ kind: 'circle'; cx; cy; r }`.
  - El dibujo es un auto genérico (sedán o SUV), claro y sencillo:
    - laterales: carrocería con capó, parabrisas, techo, cajuela y ventanas, y dos ruedas;
    - frente y atrás: carrocería, parabrisas o medallón, luces y dos ruedas;
    - arriba: contorno, parabrisas, medallón, techo y espejos.
  - Solo polígonos y círculos, para que el PDF dibuje lo mismo sin SVG.
- **`sanitizeDamageMarks(raw: unknown): DamageMark[]`:** se queda solo con las marcas válidas
  (las mismas reglas que la restricción de la base), hasta 60.
- **Pruebas** (`vehicleDiagram.test.ts`):
  - `sanitizeDamageMarks` con datos buenos y malos;
  - cada vista tiene formas dentro de su `width` × `height`.

### B2. El dibujo: `src/components/VehicleDiagram.tsx` (+ test)

**Componente puro:** solo importa `react` y `../lib/vehicleDiagram`, para que el portal también
lo use.

- **Props:**
  - `marks`;
  - `labels: { views: Record<DamageView, string>; types: Record<DamageType, string>; remove: string; empty: string }`;
  - `editable?`, `activeType?`, `onAdd?(mark)`, `onRemove?(index)`.
- **Vistas:** cada una en su propio `<svg viewBox>`, con su nombre arriba y `aria-label`.
- **Distribución:** una columna en el teléfono; en una pantalla ancha, cuadrícula (los laterales
  y la vista de arriba más anchos).
- **Edición:**
  - tocar la vista agrega una marca del tipo activo en ese punto (convierte el toque a 0–1 con
    `getBoundingClientRect`);
  - tocar una marca la quita;
  - el área para tocar una marca mide al menos 44 px en pantalla;
  - con 60 marcas ya no agrega.
- **Marcas:** un círculo con la letra del tipo.
- **Lista accesible debajo del dibujo:** «Lado izquierdo: golpe», cada una con un botón
  «Quitar» de 44 px si es editable. Sin marcas, `labels.empty`.
- **Estilos:** en `src/styles/components.css` (se cargan también en el portal), con tokens
  (`--color-danger` para las marcas, `currentColor` para el contorno) y sin colores literales.
- **Pruebas:**
  - agrega en el punto tocado, con el tipo activo;
  - quita al tocar una marca;
  - en modo de solo lectura no agrega;
  - la lista accesible.

### B3. El editor de la app: `src/features/workOrders/DamageDiagramEditor.tsx`

- **Tipos:** fichas del tipo de daño (`role="radiogroup"`, botones de 44 px), «Deshacer» (quita
  la última marca), el dibujo y la leyenda.
- **Textos** desde i18n:

  | Clave | ES | EN |
  |---|---|---|
  | `damage.title` | «Daños del vehículo» | «Vehicle damage» |
  | `damage.hint` | «Toca el dibujo donde está el daño. Toca una marca para quitarla.» | «Tap the drawing where the damage is. Tap a mark to remove it.» |
  | `damage.views.izquierda` / `derecha` / `frontal` / `trasera` / `superior` | «Lado izquierdo» / «Lado derecho» / «Frente» / «Atrás» / «Arriba» | «Left side» / «Right side» / «Front» / «Rear» / «Top» |
  | `damage.types.golpe` / `rayon` / `pintura` / `roto` / `otro` | «Golpe o abolladura» / «Rayón» / «Pintura» / «Roto o falta» / «Otro» | «Dent» / «Scratch» / «Paint» / «Broken or missing» / «Other» |
  | `damage.undo` | «Deshacer» | «Undo» |
  | `damage.remove` | «Quitar» | «Remove» |
  | `damage.empty` | «Sin daños marcados» | «No damage marked» |
  | `damage.locked` | «El cliente ya firmó: los daños no se pueden cambiar.» | «The customer already signed: the damage can't be changed.» |
  | `damage.save` | «Guardar daños» | «Save damage» |
  | `damage.saved` | «Daños guardados» | «Damage saved» |
  | `damage.saveError` | «No se pudieron guardar los daños» | «Couldn't save the damage» |

### B4. Dónde aparece

1. **Alta, paso 2** (`WorkOrderCreateModal.tsx`, después de las zonas de foto, cerca de
   `:336`): el editor.
   - Campo nuevo `damageMarks` en `workOrderForm.schema.ts`: un arreglo de objetos con
     `zod/mini`, `[]` por defecto y en el paso `'vehicle'` de `INTAKE_STEPS`.
   - En `src/pages/WorkOrders.tsx` y en `createWorkOrder`, viaja dentro de `p_order` **con la
     llave exacta `marcas_danos`**, con su prueba en `workOrders.service.test.ts`.
2. **Detalle de la orden:** dentro de la sección existente de Inspección 360°
   (`inspectionSection`, `WorkOrderDetail.tsx:398`). **No es una tarjeta nueva.**
   - **Admin sin firma:** editable, con «Guardar daños». El servicio nuevo
     `workOrdersService.updateDamageMarks(orderId, marks)` hace
     `update({ marcas_danos }).eq('id', orderId).select('id')` + `assertAffected`, e invalida
     el detalle.
   - **Con firma o técnico:** solo lectura. Con firma, además, `damage.locked`.
   - Agrega `marcas_danos: DamageMark[]` al tipo `WorkOrder` (`src/types/domain/`). Si viene
     mal formado, pásalo por `sanitizeDamageMarks` al leerlo.
3. **Historial** (`src/features/workOrders/historyFormat.ts`): el campo `marcas_danos` se
   muestra como cantidad («3 marcas → 4 marcas»), con una clave i18n nueva.
4. **PDF** (`src/lib/workOrderPdf.ts`): en la parte de la recepción, junto a las notas de
   inspección (cerca de `:494`):
   - las cinco vistas, dibujadas con `doc.lines`/`doc.circle` desde `DAMAGE_VIEWS`, con las
     marcas (círculo y letra) y una leyenda en el idioma del PDF (`STRINGS`);
   - sale siempre, aunque no haya marcas, como en la hoja de papel;
   - en la prueba de `workOrderPdf.test.ts`: se dibujan las vistas y la letra de cada marca.
5. **Portal del cliente:**
   - `src/portal/portal.types.ts`: `marcas_danos?: DamageMark[]` en la orden;
   - `src/portal/CustomerPortal.tsx`: en la recepción, junto a `notas_recepcion` (cerca de
     `:466`), `VehicleDiagram` en solo lectura, solo si hay marcas, con textos de
     `src/portal/strings.ts` (ES y EN);
   - una prueba en `CustomerPortal.test.tsx`.

### B5. Manual (parte B)

En los dos idiomas, con la misma estructura:

- **«Marcar los daños en el dibujo»** (`<!-- rol: admin -->`): en el alta y en la orden, los
  tipos, quitar una marca, y que después de la firma no se cambia. Va en el PDF que firma el
  cliente y en su enlace.
- **Una línea en la parte del técnico:** lo ve en la pestaña Orden, sin cambiarlo.
- **`docs/mapa-de-secciones.md`:** los archivos nuevos.

## Parte C: el técnico en el patio (de `/ux-taller`, 16/10/2026)

**Por qué:**

- **Hoy, empezar y terminar el trabajo depende de un `<select>` de estado** en el encabezado
  de la orden (`WorkOrderDetail.tsx:1087`) que nada pide usar:
  - 5 de las 7 órdenes reales siguen en Recepción;
  - marcar todas las tareas hechas no termina la orden, y la oficina no se entera.
- **Los botones de foto, video y voz miden 38 px en el teléfono.**

**Todo es interfaz:** el guardia de la base ya deja al técnico asignado poner `en_proceso` y
`finalizado`. **No toques la base.**

### C1. Un botón principal según el momento, arriba de «Mis tareas»

En `src/features/workOrders/TechnicianTaskList.tsx`, antes de la lista (`:41`). Se calcula con
**todas** las líneas de mano de obra de la orden (`items`), no solo con las del técnico:

| Estado de la orden | Condición | Qué se muestra | Acción |
|---|---|---|---|
| `recepcion` | Al menos una tarea mía `aprobado` | Botón `btn btn-primary` de ancho completo: «Empezar trabajo» / «Start work» (`tasks.startWork`) | `detail.changeStatus('en_proceso')` (`useWorkOrderDetail.ts:332`) |
| `en_proceso` | **Todas** las líneas `aprobado` de la orden tienen `completado_en` | Botón `btn btn-success` de ancho completo: «Terminé: avisar a la oficina» / «Done: let the office know» (`tasks.finishOrder`), con la ayuda «La oficina revisa el trabajo y avisa al cliente.» / «The office reviews the work and lets the customer know.» (`tasks.finishOrderHint`) | `detail.changeStatus('finalizado')` |
| `en_proceso` | Mis tareas `aprobado` están hechas, pero falta alguna de otro | Sin botón; ayuda «Tu parte está lista. Falta: {lista}» / «Your part is done. Still pending: {lista}» (`tasks.myPartDone`), con las descripciones pendientes | — |
| Cualquier otro | — | Nada | — |

- Los botones miden al menos 48 px de alto.
- Si `detail.busy`, quedan deshabilitados.
- El `<select>` del encabezado se queda para correcciones.

### C2. Botones de captura de 44 px

En el bloque para teléfono de `src/styles/components.css`:
`.media-capture-bar .btn { min-height: 44px; }`. El contenedor es `.media-capture-bar`
(`MediaCaptureBar.tsx:98`).

### C3. «Foto» directa en cada tarea

En las acciones de una tarea `aprobado` (`TechnicianTaskList.tsx:99-118`), agrega un tercer botón
«Foto» / «Photo» (`tasks.quickPhoto`, ícono `Camera`), con un
`<input type="file" accept="image/*" capture="environment" hidden>`.

- Al elegir la foto, se prepara igual que en `MediaCaptureBar`. Reutiliza su preparación: si es
  una función interna, sácala a un helper exportado; no la copies.
- Después abre el diálogo de avance de esa tarea **con la foto ya puesta**: prop nueva
  `initialDrafts` del componente del diálogo (`:199`).
- La fila de botones usa `flex-wrap` para que quepa en 390 px.

### C4. Pruebas y manual

1. **Pruebas:** archivo nuevo `src/features/workOrders/TechnicianTaskList.test.tsx`.
   - «Empezar trabajo» sale en Recepción con una tarea mía autorizada y llama a
     `changeStatus('en_proceso')`.
   - «Terminé» sale solo con todas las tareas autorizadas hechas y llama a
     `changeStatus('finalizado')`.
   - Con mi parte hecha y otra pendiente, sale el aviso y no el botón.
   - Los textos nuevos están en los dos idiomas.
2. **Manual** (ES y EN, misma estructura): en la parte del técnico, «Empezar trabajo», «Terminé»
   y la foto directa.

## Parte D: ajustes visuales (de `design:design-critique`, 16/10/2026)

Claude revisó capturas reales de las partes A a C y encontró cuatro problemas. **Todo es
interfaz:** no toques la base.

### D1. Un solo botón principal para el técnico

**Hoy** se ven dos botones amarillos a la vez: «Mis tareas» (acción rápida) y «Empezar trabajo»
(en la lista). La regla de `AGENTS.md` es un solo botón principal por estado.

1. **En `techActions` (`WorkOrderDetail.tsx:890`)**, la primera acción pasa a ser la que toca
   ahora, con `primary: true`, con las mismas condiciones de C1:
   - `startWork` (`tasks.startWork`, ícono `Play`) llama a `detail.changeStatus('en_proceso')`;
   - `finishOrder` (`tasks.finishOrder`, ícono `CheckCircle2`) llama a
     `detail.changeStatus('finalizado')`.

   Si sale una de las dos, «Mis tareas» queda con `primary: false`.
2. **La cuenta de las condiciones va en un solo lugar.** Saca a una función pura exportada
   (por ejemplo, `techNextStep(order, laborItems, userId)` en
   `src/features/workOrders/techNextStep.ts`, con su prueba) el cálculo de C1, que hoy vive en
   `TechnicianTaskList.tsx`. Devuelve `'start' | 'finish' | 'partDone' | null`; la usan las
   acciones rápidas y la lista.
3. **En `TechnicianTaskList.tsx`**, quita los botones «Empezar trabajo» y «Terminé». Queda solo
   el aviso «Tu parte está lista…» (`tasks.myPartDone`) y, en el estado `finish`, la ayuda
   `tasks.finishOrderHint`.
4. **Pruebas:** actualiza `TechnicianTaskList.test.tsx` y agrega el caso de las acciones
   rápidas del técnico.

### D2. El aviso de «listo» no dice que se avisó si no se avisó

**Hoy** el aviso de la esquina dice «Listo para entregar: se le avisó al cliente» aunque el
cliente no tenga correo.

1. **En `markReadyForPickup` (`useWorkOrderDetail.ts`)**, sin correo válido, el aviso usa la
   clave nueva `workOrders.markReadyDoneNoEmail`:
   - ES: «Lista para entregar. El cliente no tiene correo: avísale por mensaje.»
   - EN: «Ready for pickup. The customer has no email: send them a message.»

   Con correo, el aviso de siempre.
2. **En `ReadyNotifyModal.tsx`**, el botón que copia el enlace usa la clave nueva
   `customerLink.copyLink` (ES «Copiar enlace», EN «Copy link»), no `customerLink.copy`.
3. **Pruebas** de los dos casos.

### D3. El dibujo, compacto

**Hoy**, en el teléfono, las 5 vistas a todo lo ancho miden unos 1.700 px en el alta, y el
frente ocupa unos 500 px en el portal.

1. **En el alta** (`WorkOrderCreateModal.tsx`, paso 2), el editor va **plegado por defecto**:
   - un botón de ancho completo (44 px o más) «Marcar daños en el dibujo» / «Mark damage on
     the drawing» (`damage.open`) y, si hay marcas, «{n} marcas» (`damage.count`);
   - al tocarlo se abre el editor completo y queda abierto.
   - **No uses `CollapsibleSection`** (es del detalle); basta un `useState`.
2. **En `src/styles/components.css` (`.vehicle-diagram*`, cerca de `:6365`)**:
   - cada `svg` de vista tiene un alto máximo (laterales y arriba, unos 150 px; frente y
     atrás, unos 130 px) y se centra;
   - en pantallas de menos de 640 px, el frente y atrás van **lado a lado** (dos columnas) y
     los laterales y arriba a todo lo ancho;
   - solo tokens y unidades: nada de colores literales.
3. **Los títulos de las vistas** (`.vehicle-diagram-view-title`) van en el mismo estilo que
   `.form-label`, no en mayúsculas.
4. **El frente y la parte de atrás** (`DAMAGE_VIEWS` en `src/lib/vehicleDiagram.ts`) tienen
   que distinguirse a simple vista:
   - el frente con parrilla y faros;
   - atrás con el rectángulo de la placa y las calaveras horizontales.

   Solo polígonos y círculos, dentro de `width` × `height`.

### D4. Las marcas del PDF, más grandes

En `src/lib/workOrderPdf.ts`, el círculo de cada marca en el dibujo del PDF mide al menos 2,2 mm
de radio, y la letra, 7 pt. Ajusta la prueba si fija los tamaños.

### D5. Manual

Pon al día en ES y EN, con la misma estructura:
- el botón «Marcar daños en el dibujo» del alta;
- que «Empezar trabajo» y «Terminé» están en las acciones rápidas del técnico.

## Lo que hace Claude

- Correr todo y auditar cada parte: lint, `tsc`, Vitest, build, `test:db`, `qa:security` local
  y la comparación de las funciones SQL contra su versión anterior.
- Las capturas del manual y la bitácora.
- Pasar todo al repositorio. No se hace commit ni se publica sin que la persona responsable lo
  pida.

## Fuera de esta tanda

El interruptor de precio cerrado, el catálogo de trabajos, Twilio, la franja nueva de «siguiente
paso», una función de traducción nueva y el rol de recepción.
