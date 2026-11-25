# Q4 — Lo que sale hacia afuera: informe del jefe de obra (24/11/2026)

Orden: [q4-lo-que-sale-hacia-afuera.md](q4-lo-que-sale-hacia-afuera.md). Informe de Hydrogen (lo que cambió y dónde):
[q4-hydrogen-informe.md](q4-hydrogen-informe.md). Todo se hizo contra la base local; nada de producción, sin
commits ni migraciones. **Nada de esto necesitó cambiar la base**: no hay puntos «necesita base».

Las muestras viven en `qa.local/` (ignorada por git, solo en este equipo). Las rutas de abajo son relativas a este archivo.

## 1. Cómo se probó

- **Datos (inventados) en la base local:** `qa.local/q4-setup.mjs` crea tres órdenes con cliente, vehículo y placa de prueba:
  - **ORD-2026-261, cliente en inglés con correo:** nombre de 47 letras, vehículo «2021 Mercedes-Benz Sprinter 3500XD Cargo Van
    High Roof Extended», mano de obra de $4,800.50 y $1,250.00, repuestos de $2,251.50 (2 × $1,125.75), una línea de $950.00
    rechazada, descuento de $250.50, depósito de $500, cinco marcas de daños, tres fotos de recepción, un avance publicado con
    tres fotos, la firma, y próximo servicio con sticker (nota de 105 caracteres);
  - **ORD-2026-262, cliente en español con correo:** nombre de 52 letras, vehículo largo, una línea rechazada, descuento, dos marcas, fotos,
    avance y sticker;
  - **ORD-2026-263, cliente sin correo (inglés):** una orden sencilla.
- **Correos:** `qa.local/q4-correos.mjs` llama a `renderEmail` con los datos reales de `datos_correo` (los mismos que arma `process-outbox`),
  13 variantes por idioma (recepción, tres estados con y sin parqueo, retirada sin reparar, presupuesto, tres confirmaciones, avance, reporte,
  reporte sin correo del taller), tres colores de taller y el correo al personal; cada una a 600 y 390 px. Total: 26 correos de cliente más 3
  de color y 1 al personal, ×2 anchos.
- **Enlace del cliente y `/s/`:** preview compilado con `VITE_SUPABASE_URL=http://127.0.0.1:44321` y la clave local (se comprobó que el
  build trae `127.0.0.1:44321` y ninguna dirección `*.supabase.co`), con las secciones desplegadas, a 390 y 1366 px, en es y en, y el
  enlace inválido y el código inválido del QR.
- **PDF:** desde el botón «Descargar PDF» de la app local, en es y en, de las tres órdenes (6 PDF).
- **Sticker:** `buildServiceStickerPdf` con cuatro casos (nombre largo, nota larga, 1,2 millones de millas, sin fecha ni nota), en es y en.

## 2. Lista de tropiezos

Gravedad: alta = se ve roto o confunde dinero; media = se nota y un cliente lo vería; baja = pulido.

### Arreglados en esta orden

| # | Pieza | Idioma | Qué se veía mal | Antes | Después | Gravedad |
|---|---|---|---|---|---|---|
| T-01 | PDF de la orden | es y en | Con un vehículo de nombre largo (dos líneas), la segunda línea se imprime encima de la etiqueta «VIN»; lo mismo pasaría con un cliente de nombre largo | [en](../../qa.local/q4/antes/pdf/orden-en-en-p1.png) · [es](../../qa.local/q4/antes/pdf/orden-es-es-p1.png) | [en](../../qa.local/q4/despues/pdf/orden-en-en-p1.png) · [es](../../qa.local/q4/despues/pdf/orden-es-es-p1.png) | **Alta** |
| T-02 | PDF de la orden | es y en | En «Conformidad del cliente», un nombre largo se encima con «Firmado: fecha» | [p3](../../qa.local/q4/antes/pdf/orden-en-en-p3.png) | [p3](../../qa.local/q4/despues/pdf/orden-en-en-p3.png) | Media |
| T-03 | PDF de la orden | es | Fechas `d/m/aaaa` («Entrega estimada 4/12/2026», que un lector de EE. UU. lee 12 de abril); «Generado» con la hora del aparato y no la del taller (en la prueba, 5:39 p. m. cuando en el taller eran las 6:39) | [es](../../qa.local/q4/antes/pdf/orden-es-es-p1.png) | [es](../../qa.local/q4/despues/pdf/orden-es-es-p1.png) («24 nov 2026», «4 dic 2026») | Media |
| T-04 | Correos (presupuesto y confirmación) | es y en | El texto de vista previa que muestra la bandeja decía «5 trabajo(s) por $4,590.90 esperan…» / «job(s)» | [html](../../qa.local/q4/antes/correos/presupuesto-es.html) | [html](../../qa.local/q4/despues/correos/presupuesto-es.html) («5 trabajos por…», «1 trabajo por… espera») | Media |
| T-05 | Correos (todos) | es y en | La línea «No quiero recibir estos correos» en gris `#9A9AA6` sobre blanco (contraste 2,8:1, por debajo del 4,5:1); el teléfono del pie se partía en medio del número («(301)» / «555-0100») | [390 px](../../qa.local/q4/antes/correos/estatus-finalizado-en-390.png) | [390 px](../../qa.local/q4/despues/correos/estatus-finalizado-en-390.png) | Media |
| T-06 | Correos (asunto) | es y en | Con un vehículo largo el asunto pasaba de 90 letras y el número de orden quedaba fuera de la vista de la bandeja | [txt](../../qa.local/q4/antes/correos/presupuesto-es.txt) | [txt](../../qa.local/q4/despues/correos/presupuesto-es.txt) (vehículo recortado a 40 letras con «…» solo en el asunto) | Baja |
| T-07 | Correos (botón) | es y en | Con un color de taller muy claro el botón y la raya desaparecen contra el fondo | [claro](../../qa.local/q4/antes/correos/color-claro-en-390.png) | [claro](../../qa.local/q4/despues/correos/color-claro-en-390.png) (el botón lleva borde fino; los demás colores no cambian) | Baja |
| T-08 | Página del QR `/s/` | es y en | Un código que ya no existe (sticker borrado) no tenía forma de llamar al taller, a diferencia del enlace inválido `/r/`; y la página no declaraba su idioma (`<html lang>`) | [390 px](../../qa.local/q4/antes/portal/servicio-invalido-es-390.png) | [390 px](../../qa.local/q4/despues/portal/servicio-invalido-es-390.png) (con los teléfonos y WhatsApp públicos del taller) | Media |

### Abiertos (todos de gravedad baja o informativos)

| # | Pieza | Qué se ve | Qué haría falta |
|---|---|---|---|
| B-01 | PDF | Con el dibujo de daños y las fotos, la página 1 queda con un hueco abajo y la firma cae sola en la página 3 | Dejar que el dibujo parta la página, o reducirlo. Es una decisión de diseño de la tanda 4, no un error |
| B-02 | Enlace del cliente | Una orden sin fotos de recepción muestra la sección «Vehículo recibido · 0 fotos» | Esconder la sección cuando solo tiene datos que ya están arriba (decisión del arquitecto) |
| B-03 | Enlace del cliente | A 390 px, «Cantidad 2 × $1,125.75» de un repuesto con nombre largo se parte en dos líneas | Pulido de CSS |
| B-04 | Correos | El recorte del asunto corta a media palabra («Carg…») | Cortar en la última palabra completa |
| B-05 | Correos | «Total autorizado» de la confirmación es el del presupuesto ($8,884.74); el enlace muestra además el descuento posterior ($8,634.24). No es error: son dos cosas distintas, pero un cliente podría preguntar | Confirmar con el taller si se prefiere avisar el descuento |
| B-06 | Sticker | Si el teléfono de la sede se guarda con código de país (`+1…`), el nombre del taller se recorta antes con «…». Con el teléfono como lo guarda hoy la sede (`(301) 555-0100`) no pasa | Ninguna |
| B-07 | PDF y enlace en inglés | Lo que el taller escribió en español sale en español mientras su traducción no llega (la hace Gemini al encolarse; en la base local no hay clave y las traducciones de prueba se insertaron a mano). El diccionario y los `tr()` funcionan: con traducción, todo sale en inglés | Ninguna; revisar en producción con una orden real |

### Revisado y limpio

- Ninguna muestra trae `null`, `undefined`, `NaN`, claves i18n ni estados en crudo (`en_proceso`…): búsqueda en todos los textos y PDF.
- Ningún nombre de técnico ni de administración en el PDF, los correos, el enlace ni `/s/`.
- `/s/` no muestra el nombre del cliente, la placa ni el VIN.
- Dinero con el formato de `money` en todas las piezas (centavos, miles, signo del descuento `-$250.50`); los totales salen de la base (la cuenta del enlace coincide con el PDF: $8,634.24 y saldo $8,134.24).
- Sin desbordes horizontales en ningún correo (600 y 390 px), ni en el enlace ni en `/s/` (390 y 1366 px). Sin imágenes rotas.
- Los correos no dependen de imágenes: solo el logo (con `alt` del taller y el nombre en texto debajo), y el enlace de baja y el del botón llevan el enlace personal.
- Un cliente sin correo: el enlace no muestra «Avisos por correo» y el correo se omite, como es de diseño.
- **A decidir por el arquitecto:** el sticker **impreso** lleva la placa (y el vehículo) por diseño, como dice el manual (§ «Qué lleva el sticker»); lo
  que nunca la lleva es la página `/s/`, y así está (verificado). La orden dice «en el sticker y en `/s/`: …la placa (prohibido)». No lo cambié:
  quitar la placa del papel es una decisión de producto. Si se quiere, es una línea en `serviceStickerPdf.ts` y su prueba.

## 3. Verificación

| Comando | Resultado |
|---|---|
| `npm run lint` | limpio |
| `npx tsc -b` | limpio |
| `npm test` (Vitest) | 200 archivos, 1.394 pruebas, todas verdes (incluye 1 prueba temporal de muestras; ver nota); sin ella, 199 archivos y 1.393. Antes de la entrega eran 1.385 (+8 de Hydrogen) |
| `npm run build` (con las variables locales) | limpio |
| `npm run test:functions` (Deno) | 102 pruebas, 0 fallas |
| `npm run test:e2e:local` | 86 de 86 (3,3 min) |

Nota: la prueba temporal (`src/lib/q4muestras.tmp.test.ts`, solo para guardar los PDF del sticker) se borró al terminar.
Pruebas nuevas que fijan los arreglos: `workOrderPdf.test.ts` (T-01, T-02, T-03), `emailTemplates.test.ts` (T-04 a T-07),
`ServicePage.test.tsx` (T-08). No hubo que corregir nada de lo que entregó Hydrogen: lint, tipos y pruebas pasaron a la primera.
Lo único que se ajustó en el árbol principal fueron las herramientas de `qa.local/` (el visor de PDF necesitaba las fuentes estándar de
pdf.js y `pdfinfo.mjs` se ejecutaba al importarlo).

## 4. Las muestras «después» para aprobar

Carpeta: `../../qa.local/q4/despues/`. Cada una enlazada con su «antes» en `../../qa.local/q4/antes/`.

| Pieza | Muestras |
|---|---|
| PDF de la orden (es y en) | [en, ORD-261](../../qa.local/q4/despues/pdf/orden-en-en.pdf) · [es, ORD-261](../../qa.local/q4/despues/pdf/orden-en-es.pdf) · [en, ORD-262](../../qa.local/q4/despues/pdf/orden-es-en.pdf) · [es, ORD-262](../../qa.local/q4/despues/pdf/orden-es-es.pdf) · [en, ORD-263](../../qa.local/q4/despues/pdf/orden-sin-en.pdf) · [es, ORD-263](../../qa.local/q4/despues/pdf/orden-sin-es.pdf) (antes: [carpeta](../../qa.local/q4/antes/pdf/)) |
| Correos, es y en, 600 y 390 px | [carpeta](../../qa.local/q4/despues/correos/) (`<plantilla>-<idioma>-600.png` y `-390.png`, más el `.html` y el `.txt`; `resumen.json` con los asuntos); antes: [carpeta](../../qa.local/q4/antes/correos/) |
| Enlace del cliente, 390 y 1366 px, es y en | [carpeta](../../qa.local/q4/despues/portal/) (`portal-<orden>-<idioma>-<ancho>.png`; `portal-sin-…` es el cliente sin correo) |
| Página del QR, 390 px (y 1366) | [en](../../qa.local/q4/despues/portal/servicio-en-en-390.png) · [es](../../qa.local/q4/despues/portal/servicio-es-es-390.png) · [código inválido](../../qa.local/q4/despues/portal/servicio-invalido-es-390.png) · [enlace inválido](../../qa.local/q4/despues/portal/invalido-es-390.png) |
| Sticker 62 × 50 mm | [nombre y vehículo largos](../../qa.local/q4/despues/sticker/sticker-en-largo-en-p1.png) · [corto, es](../../qa.local/q4/despues/sticker/sticker-es-corto-es-p1.png) · [nota larga, es](../../qa.local/q4/despues/sticker/sticker-es-120-es-p1.png) · [sin fecha ni nota](../../qa.local/q4/despues/sticker/sticker-en-sin-nota-en-p1.png) (el sticker no cambió; es el mismo que el de antes) |

## 5. Qué hace falta para publicar

1. **Push a `main`** (Hostinger publica `main`): lleva el PDF y el enlace/`/s/` (T-01, T-02, T-03, T-08). No hay migraciones ni `db push`.
2. **`supabase functions deploy process-outbox`**: es la única función que usa `_shared/email/templates.ts`. Sin el deploy, los correos
   salen con el texto de antes (T-04 a T-07). No hay que desplegar `portal` ni ninguna otra.
3. La Ayuda (`manual-usuario.md` y `.en.md`) no describe nada de lo cambiado: no se tocó.

Los dos pasos los pide la persona responsable; no se hizo ninguno. En la base local quedan las órdenes de prueba ORD-2026-261, 262 y 263
(más una orden y un cliente de una primera corrida que falló, con los mismos nombres de prueba): se pueden dejar.
