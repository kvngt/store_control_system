# Q2, tanda 4: lo que ve el cliente. Informe del jefe de obra (17/11/2026)

Orden: la sección «Tanda 4» de [q2-prioridades.md](q2-prioridades.md) (B-13, B-14, B-15, B-17 y A-17; el punto de las fotos con
`http://kong:8000` no se hizo, como se pidió). Programó Gemini Hydrogen en su copia (una sola vuelta, 7 minutos, sin colgarse);
este informe es de la verificación en el árbol principal. Su propio informe: [q2-tanda4-hydrogen.md](q2-tanda4-hydrogen.md).
**Sin commits, sin tocar el proyecto real.** El árbol principal no cambió mientras programó Hydrogen (`principal-antes` = `principal-despues`).
No se tocó `datos_portal`, la edge function `portal` ni ninguna migración: no hizo falta ningún dato nuevo.

## 1. Qué quedó hecho

| Punto | Estado | Cómo se comprobó |
|---|---|---|
| B-13 caja del navegador | Cumple | `ConfirmDialog.tsx` propio del portal (`role="dialog"`, `aria-modal`, foco en «Volver», atrapa el foco, Escape y fondo = Volver, `createPortal`). Botones «Aprobar» y «Volver» (en rechazo, «Rechazar todo» y «Volver»), singular y plural (`confirmApproveOne/Many`). `confirm()` ya no se llama en el presupuesto. Recorrido: 0 cajas nativas; botones de 44 px; sin scroll horizontal a 390 px |
| B-14 resumen tras aprobar | Cumple | `QuoteOutcome.tsx`, solo con datos de `datos_portal` (`presupuestos_respondidos[0]` con `via = cliente_portal` y `cuenta.no_autorizados`). «Usted aprobó 2 trabajos por $145.00» + fecha + «No autorizados…» con la lista; «Usted aprobó 1 trabajo por $80.00»; en rechazo total, «Usted no aprobó ningún trabajo de este presupuesto» / «You did not approve any work in this estimate» |
| B-15 enlace no válido | Cumple | Un enlace desconocido llega sin taller: se usan las tres líneas públicas de `landing/business.ts` (`publicContact.ts`; solo datos, sin nombres de persona) con «Llamar» y «WhatsApp» de 44 px. Vencido y desactivado siguen con los teléfonos del taller que ya traen |
| B-17 foto rota | Cumple | `PortalPhoto`: `alt` («Foto 1», «Foto 2»…) y, si falla, el recuadro «No se pudo cargar la foto» / «Could not load the photo» del mismo tamaño que la celda; en la cuadrícula, el visor y la firma. El logo del taller, si falla, se esconde |
| A-17 PDF | Cumple | El bloque de daños va dentro de `if (marks.length > 0)`. Sin marcas el texto «Daños del Vehículo» desaparece del PDF; con marcas se imprime igual |

Ninguna decisión de diseño se cambió ni quedó sin cumplir. Decisiones de Hydrogen fuera del texto de la orden: ícono `X` (no `Check`) cuando no se aprobó
nada; la línea de oficina sin etiqueta propia (cae al «Oficina» traducido); el fondo del diálogo con `color-mix` de un token (sin literales).

## 2. Lo que corregí yo

Nada del código de Hydrogen. Todo pasó a la primera (lint, tipos, 1329 pruebas, build). Un tropiezo mío: re-indenté por error el bloque del PDF y lo deshice
(el archivo queda como lo dejó Hydrogen; la indentación ya era la correcta).

Dos cosas del entorno que conviene saber:
- Al copiar el árbol a Hydrogen el parche llevó el archivo sin seguimiento `.env.production` (no lo leí). Lo saqué de su copia antes de correrlo. Está sin
  ignorar en el árbol principal; **`vite build` lo lee**, y es la causa probable del incidente de la tanda 1 (un build sin variables apuntó al Auth real). Siempre
  se compiló con `VITE_SUPABASE_URL` y la clave local en el entorno, que ganan sobre el archivo; el bundle se comprobó (`127.0.0.1:44321`, ninguna dirección `*.supabase.co`).
- Una corrida completa de `npm run build` (sin variables locales, solo para comprobar que compila) escribe a `dist/`, que está ignorado; no se sirvió.

## 3. Números de cada comando (árbol principal, base local 44321/44322)

| Comando | Resultado |
|---|---|
| `npm run lint` (oxlint) | 0 avisos, 0 errores |
| `npx tsc -b` | sin errores |
| `npm test` (Vitest) | 190 archivos, **1329 pruebas, todas pasan** (antes 186 / 1311: +4 archivos, +18 pruebas) |
| `npm run build` | compila (`built in 4,97 s`) |
| `npm run test:functions` | 102 pasan, 0 fallan |
| `test:e2e:local` | **85 pasan, 1 salta, 0 fallan** en la segunda corrida completa. La primera: 83 pasan, 2 fallan (COB-03 y WORK-02), y una repetición parcial falló WORK-01: tres pruebas distintas que abren el diálogo «Nueva orden» bajo carga (el mismo clic perdido de la tanda 1, ver su informe §2.5). Con `--workers=1 --repeat-each=3` sobre los dos archivos: 41 pasan, 0 fallan. Ninguna toca el portal ni el PDF. Sigue pendiente arreglar esa carrera de raíz |
| pgTAP, `qa:security:local`, migraciones | No aplican (sin cambios de base) |

## 4. Recorrido en el navegador (`qa.local/t4-portal.mjs`, `t4-pdf.mjs`, `t4-rechazo-en.mjs`; app compilada contra la base local)

Antes: `qa.local/dist-t4-antes` (puerto 4180); después: `qa.local/dist-t4` (4181). Órdenes de prueba `PRUEBA T4 …` en la base local (`t4-setup.mjs`).

| Comprobación | 1366 px | 390 px |
|---|---|---|
| Antes, B-13: sale `confirm: ¿Autoriza 2 trabajo(s) por $450.00?…` | sí | sí |
| Diálogo propio, sin caja nativa; botones «Aprobar» y «Volver» de 44 px o más | pasa | pasa |
| Foco inicial en «Volver»; «Volver» y Escape cierran sin responder | pasa | pasa |
| Aprobar: resumen «Usted aprobó N trabajo(s) por $X» y lo no aprobado | pasa | pasa |
| Rechazar todo en inglés: diálogo y resumen «You did not approve any work…» | — | pasa |
| Enlace inválido: 3 botones de llamar de 44 px, sin nombres de persona | pasa | pasa |
| Tres fotos forzadas a fallar (arnés: respuesta del portal con URLs rotas): tres recuadros, el visor también avisa | pasa | pasa |
| Sin scroll horizontal en todo lo anterior | pasa | pasa |

**30 de 30 comprobaciones del recorrido pasan.** PDF (ES): orden sin marcas, 1 página y el texto «Daños del Vehículo» **ausente** (antes: presente);
orden con marcas, el dibujo y su leyenda presentes. Nota: las órdenes de prueba son cortas, así que el dibujo de antes cabía en la página 1; la página 2 vacía
de Q1 aparece cuando hay más contenido. Lo fija la prueba unitaria (sin marcas no se llama a `addPage`, `lines` ni `circle`).

Capturas en `qa.local/shots/` (`-d` escritorio, `-m` teléfono): `t4-antes-01-presupuesto`, `t4-antes-03-aprobado`, `t4-antes-04-invalido`,
`t4-antes-05-foto-rota`, `t4-antes-pdf-sinmarcas-p1`; `t4-despues-01-presupuesto`, `-02-dialogo`, `-03-aprobado`, `-04-invalido`, `-05-foto-rota`,
`-06-visor-roto`, `-07-rechazo-en-dialogo-m`, `-08-rechazo-en-resumen-m`, `t4-despues-pdf-sinmarcas-p1`, `t4-despues-pdf-marcas-p1`. (El visor de PDF del arnés no dibuja
bien las letras: se juzgó por el texto extraído y por el dibujo.)

## 5. Archivos tocados

Hydrogen (18): `src/portal/components/{ConfirmDialog,QuoteOutcome}.tsx` (nuevos), `QuoteSection`, `Report`, `Unavailable`, `PortalMedia`, `ShopHeader`, `src/portal/publicContact.ts`
(nuevo), `strings.ts`, `portal.css`, `src/lib/workOrderPdf.ts`; pruebas: `ConfirmDialog.test`, `QuoteOutcome.test`, `PortalMedia.test`, `strings.test` (nuevas),
`CustomerPortal.test`, `workOrderPdf.test`; su informe. Yo: este informe y el arnés en `qa.local/` (ignorado por git).

## 6. Dudas y pendientes

- **B-15 usa `landing/business.ts` desde el portal** (un paquete hermano, no la app; es solo datos y ya lo vigila `business.test.ts`). Muestra las tres líneas del taller
  (English, Español y oficina), con WhatsApp en las dos primeras. Hay que confirmar con el taller que esos son los números que quiere para quien no tiene un enlace válido.
- **«N trabajos» cuenta líneas**, no filas: un trabajo agrupado con tres líneas suma 3 en el diálogo, en el botón «Autorizar lo marcado (N)» y en el resumen (el botón
  antes contaba filas). Es consistente entre los tres, pero un cliente que marcó una sola fila ve «3 trabajos». La alternativa es otra palabra («conceptos»).
- Register: el portal trata de «usted», así que el resumen dice «Usted aprobó…», no «Aprobaste…».
- El resumen aparece mientras no haya otro presupuesto pendiente y la última respuesta haya sido del cliente por el enlace, también tras la entrega; si estorba
  ahí, se esconde con `orden.estatus === 'entregado'`.
- `EmailPreference.tsx` sigue usando la caja nativa del navegador para la baja de correos (fuera de esta tanda; es el siguiente `confirm` que vería el cliente).
- La foto rota solo se verificó forzándola; no se comprobó con fotos reales del enlace (pendiente en producción, como dice Q2).
- Falta documentación: una nota en `ai-context.md` (el portal ya no usa `confirm` para el presupuesto; el PDF no trae el dibujo sin marcas) y la bitácora; no era de esta orden.
