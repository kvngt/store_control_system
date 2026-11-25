# Q4 — Lo que sale hacia afuera (orden del arquitecto, 24/11/2026)

Lo escribe el arquitecto para el jefe de obra. El protocolo es [README.md](README.md). El plan es el
[plan de arquitectura](../plan-arquitectura-2026-11.md), etapa 1, punto 5 de la vara:
**lo que sale hacia afuera se ve profesional**.

## Objetivo

Lo que recibe o ve el cliente del taller tiene que verse como un programa de pago, en español y en
inglés:

- la marca del taller;
- ningún texto a medias, en el otro idioma o con palabras del sistema;
- ningún hueco, número mal formateado ni línea cortada.

Hoy cada pieza funciona; nadie la ha revisado entera como la vería el cliente.

## Las piezas

| Pieza | Dónde vive | Cómo se genera una muestra |
|---|---|---|
| PDF de la orden | `src/lib/workOrderPdf.ts` (con `pdfSafe`, `lib/pdfText.ts`) | Desde el detalle de una orden en el navegador local («Descargar PDF», idioma es y en), o con una prueba que llame a la función y guarde el archivo |
| Correos al cliente | `supabase/functions/_shared/email/templates.ts` (`renderEmail`) y `_shared/resend.ts` | Un script local que llame a `renderEmail` con cada plantilla y cada idioma y guarde el HTML. Se abre en el navegador a 600 px y a 390 px |
| Enlace del cliente (portal) | `src/portal/` | El enlace de una orden de prueba en el preview local, a 390 px y a 1366 px |
| Página del QR (`/s/<código>`) | `src/portal/` (vista de servicio) | Un sticker programado en una orden de prueba |
| Sticker térmico (62 × 50 mm) | `src/lib/serviceStickerPdf.ts` | Desde «Próximo servicio» en una orden de prueba, o con la prueba `serviceStickerPdf.real.test.ts` |

## Cómo se hace

### Fase A — muestras «antes» y lista de tropiezos

La hace el jefe de obra, sin Hydrogen.

1. Prepara en la base local dos órdenes de prueba con **datos inventados**: una con cliente en inglés y
   otra en español. Cada una lleva:
   - mano de obra y repuestos;
   - algo autorizado y algo rechazado;
   - un descuento;
   - fotos visibles para el cliente;
   - marcas de daños;
   - próximo servicio con sticker.

   Además, un cliente sin correo. Nombres largos, un vehículo con nombre largo y montos de cuatro
   cifras, para ver los recortes.
2. Genera todas las muestras de la tabla, en los dos idiomas, y las guarda en
   `qa.local/q4/antes/` (PDF, HTML y capturas).
3. Revisa cada muestra contra la vara y escribe la lista de tropiezos en `docs/ordenes/q4-informe.md`,
   con este formato: pieza, idioma, qué se ve mal, captura, gravedad y propuesta. Busca sobre todo:
   - texto en el otro idioma o palabras del sistema (claves i18n, `null`, `undefined`, `NaN`, nombres
     de columnas, estados en crudo como `en_proceso`);
   - dinero sin el formato de `money` (centavos, signo, separadores);
   - fechas en formato del servidor o en UTC en lugar de la hora del taller;
   - texto que se corta o se encima, sobre todo en el PDF y el sticker;
   - caracteres que Helvetica no dibuja en el PDF;
   - el nombre de un técnico en algo del cliente (**prohibido**);
   - en `/s/`: el nombre del cliente, la placa o el VIN (**prohibido**). El sticker impreso sí lleva la
     placa, por diseño: está a la vista en el carro (decisión del arquitecto, 24/11/2026, al revisar la
     fase A);
   - correos que dependan de imágenes externas, enlaces rotos y la línea de baja;
   - colores de marca con mal contraste;
   - plurales con «(s)».

### Fase B — arreglos con Hydrogen

El jefe de obra le pasa a Hydrogen la lista aceptada, con los límites de abajo, y sigue el protocolo
de siempre (pasos 1 a 7).

### Fase C — muestras «después»

Las mismas muestras, en `qa.local/q4/despues/`. Para cada pieza, el informe lleva una tabla con la
muestra de antes y la de después.

## Límites de diseño

- **Lo que el cliente ve sale de lo que ya decide la base.** No se suma dinero en el navegador ni en
  las plantillas: se usan los totales que ya llegan.
- **Si un arreglo pide cambiar `datos_portal`, `datos_correo`, `datos_servicio` o una migración, no
  se hace en esta orden:** se anota en el informe como «necesita base».
- **Los correos cambian en `supabase/functions/`.** Salen al cliente solo con un `functions deploy`
  de `process-outbox`, que es otro paso de publicación y lo pide la persona responsable. El informe
  dice qué funciones hay que desplegar.
- **El portal sigue siendo un paquete aparte**: no importa nada de la app
  (`src/portal/boundary.test.ts`).
- **PDF:**
  - todo texto pasa por `pdfSafe`;
  - el dibujo de daños mantiene sus tamaños de vista;
  - la página del dibujo sale solo con marcas (tanda 4);
  - los textos van en `es` y `en` dentro de `workOrderPdf.ts`.
- **Sticker:** sigue en 62 × 50 mm, y sus recortes con «…» se mantienen (regla del 19/10/2026).
- **Nada de diseño de plantilla ni imágenes generadas.** Se usan la marca y los colores del taller
  que ya existen (`lib/brandColor.ts`, `branding`).
- **Datos de prueba inventados.** A Hydrogen nunca le llegan datos de clientes reales.
- **Si se cambia algo que describe la Ayuda,** se ponen al día `docs/manual-usuario.md` y su `.en.md`.

## Aceptación

1. **Ningún tropiezo de gravedad alta o media queda abierto** en ninguna pieza ni idioma. Los bajos que
   queden van listados en el informe.
2. **El juego de muestras de «después» queda listo para que lo apruebe la persona responsable:**
   - el PDF en es y en;
   - cada correo en es y en, a 600 y 390 px;
   - el portal a 390 y 1366 px;
   - `/s/` a 390 px;
   - el sticker.

   El informe enlaza cada muestra.
3. **Verificación:**
   - lint, `tsc -b`, Vitest completo, build, `test:functions` y e2e local completa;
   - las pruebas de `workOrderPdf`, `serviceStickerPdf` y `emailTemplates` cubren cada arreglo que se
     pueda fijar con una prueba.
4. **El informe dice qué hace falta para publicar:** push a `main`, y `functions deploy` de qué
   funciones si se tocaron los correos.
