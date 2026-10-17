# Plan de adopción: qué hacer con el diagnóstico de Gemini

> **Estado: aprobado el 14/10/2026, en implementación** (ver §7: la persona responsable sumó el
> escáner de VIN y el dibujo del vehículo).
>
> - Las tareas para Gemini están en [tareas-para-gemini-adopcion.md](tareas-para-gemini-adopcion.md).
> - Claude Code verificó cada punto contra el código del 14/10/2026 (`3b38be0` más los cambios
>   sin commit), con lecturas directas.
> - La verificación en paralelo con agentes se cortó: agotó el límite de uso de la sesión.

## 1. En una página

- **El fondo del diagnóstico es correcto.**
  - Registrar un carro cuesta más que llenar la hoja de papel.
  - El taller trabaja con un precio cerrado y con clientes que solo dejan su celular.
- **Varios hechos sobre el código son falsos.**
  - El botón de SMS existe desde el 04/10.
  - La traducción automática con Gemini ya funciona.
  - La orden de un admin tiene cinco pestañas, no tres.
  - El presupuesto no está en Cobro.

  Implementar las propuestas tal cual duplicaría cosas que ya existen.
- **Al documento le faltan dos causas importantes.**
  - **La semana de prueba fue inestable.** El 04 y el 05/10, producción no dejaba crear órdenes
    con trabajos ni agregar trabajo. Además, el flujo de la orden cambió varias veces esa
    semana: hubo 45 commits entre el 03 y el 07/10.
  - **El alta exige el VIN de 17 caracteres** para un vehículo nuevo, aunque la base no lo pide.
- **Lo que propongo:**
  1. **Fase 0, esta semana:**
     - medir con datos (una consulta SQL de solo lectura, de diez minutos);
     - escuchar al taller: una llamada y, mejor aún, verla registrar dos carros reales.
  2. **Fase 1:** quitar cinco fricciones pequeñas, con una sola migración.
  3. **Fase 2:** el «dibujito del carro», después de validar un prototipo con el taller.
  4. **No se hace por ahora:**
     - el interruptor de precio cerrado;
     - el escáner de VIN;
     - Twilio;
     - la franja nueva de «siguiente paso»;
     - la función de traducción nueva.

## 2. Lo que el documento dice del código y no es cierto

| Dice | Lo que hay | Evidencia |
| --- | --- | --- |
| La orden tiene tres pestañas: Orden, Avances y Cobro | El admin tiene cinco: Resumen, Trabajos, Fotos y avances, Cobro y cliente, e Historial. El técnico tiene tres: Tareas, Orden y Avances | `WorkOrderDetail.tsx:98-107` |
| El presupuesto (`QuoteCard`) y la autorización (`AuthorizationPanel`) están en Cobro | La autorización está arriba de Resumen y el presupuesto está en Trabajos | `WorkOrderDetail.tsx:893` y `:100` |
| No hay botón de SMS (J2, P2, V10) | Existe desde el 04/10 (`e73b5d9`), con el separador correcto para iPhone y para Android. Sale en la tarjeta del enlace y al compartir el reporte. En el teléfono es el botón principal; en la computadora se oculta | `lib/phone.ts:62-80`, `CustomerLinkCard.tsx:148-152`, `ShareReportModal.tsx:127` |
| Hay que crear una función de traducción con Gemini (A4) | Ya existe: `process-outbox` traduce con Gemini a través de una cola (`trg_encolar_traduccion`), y el portal y el PDF usan esas traducciones | `process-outbox/index.ts:400-404`, `portal/translate.ts:11` |
| `translate.ts` traduce los colores con un diccionario | Ninguna parte del código traduce colores | búsqueda en `src/portal` y `src/lib` |
| Todo depende del correo y un cliente sin correo se queda sin nada (C4) | El alta no pide correo. La tarjeta del enlace avisa que el cliente no tiene correo y ofrece WhatsApp y SMS. El hueco real es otro (sección 4) | `workOrderForm.schema.ts:95-96`, `translations.ts:966` |
| El sistema obliga a desglosar mano de obra y repuestos (C2, T3) | Una sola línea de mano de obra («Reparación y pintura de bumper y fender: $750») es válida. Los repuestos son opcionales, y el cliente ve esa línea y el total | `CustomerPortal.tsx:644-660`, sección `cuenta` de `datos_portal` |
| El avance se queda en 80 % al finalizar y la pintora no recibe comisión (E3) | Se corrigieron antes de esta semana: la migración `20261010000001` y la comisión por tarea (`20261010000006`, pgTAP 19) | `bitacora.md:13`, `:17` |

## 3. Lo que sí está respaldado

| Dice | Evidencia |
| --- | --- |
| Hay que escribir el VIN de 17 caracteres | Es peor: el alta **lo exige** para un vehículo nuevo (`workOrderForm.schema.ts:104-110`). La columna acepta un VIN vacío, y la placa ya es opcional justamente por esta razón (`:111-113`) |
| Los $750 quedan sin autorizar después del alta (E2) | Las líneas nacen en `borrador` (`orden_labor.estado`; `create_work_order` vigente en `20261010000027`). Ver el detalle después de la tabla. Separar la firma de la autorización lo pidió el taller el 06/10 (`presupuestos.md:60`): no se deshace |
| No existe el dibujo del carro (C3, V11) | Hoy el alta tiene seis zonas de foto y notas (`useIntakePhotos.ts:16-23`) |
| El técnico tiene más pasos de los que debería (T6) | Termina su orden con un `<select>` de estado en el encabezado (`WorkOrderDetail.tsx:1087`). En el teléfono, las acciones rápidas miden 38 px, menos de los 44 recomendados (`components.css:2298`) |
| «Los mecánicos le gritan a la recepcionista» (C6) | No se puede comprobar en el código: es una hipótesis. La consulta H4 del anexo A lo mide |

**Autorizar en el mostrador hoy:** son 4 o 5 toques después del alta, en otra pestaña
(`QuoteCard.tsx:246-249`):

1. Resumen → «Registrar en Trabajos».
2. «Registrar autorización».
3. Cambiar «Por teléfono» a «En persona».
4. Registrar.

## 4. Lo que el documento no vio

1. **La semana de prueba fue inestable.**
   - El 04 y el 05/10, en producción fallaba todo alta con tareas, «Agregar trabajo» y
     repuestos (`bitacora.md:1020`).
   - El 04/10 la app estuvo una hora en vivo contra una base atrasada.
   - Entre el 03 y el 07/10 hubo 45 commits. El 06/10 cambió el orden de los pasos del alta y
     la firma dejó de autorizar.
   - Un taller que prueba algo nuevo y lo ve fallar o cambiar a diario vuelve al papel.
2. **El VIN es obligatorio** (sección 3).
3. **Los mensajes al cliente salen en español, aunque el cliente hable inglés.**
   - El mensaje del reporte está escrito a mano en español (`reports.service.ts:22-26`), fuera de
     i18n.
   - El del enlace sale en el idioma de la pantalla de la administradora
     (`CustomerLinkCard.tsx:103-108`), no en el del cliente (`clientes.idioma`).
4. **«Lista para entregar» no avisa a un cliente sin correo.** El aviso automático es solo por
   correo; sin correo, la administradora solo ve un mensaje en pantalla
   (`useWorkOrderDetail.ts:404-416`).
5. **El dueño que cotiza después no tiene una cola.** Si la administradora recibe el carro sin
   precio, nada le avisa al dueño: no hay aviso de «orden nueva» ni un grupo «por cotizar» en
   Requiere atención (los grupos actuales están en `20261010000029`).
6. **No hay datos de uso.**
   - Sentry seguía sin DSN en Hostinger (F0, pendiente).
   - Nadie ha medido cuántas órdenes se crean por día.

   El anexo A lo mide sin tocar nada.

## 5. Veredicto por propuesta

| Propuesta de Gemini | Decisión | Por qué | Fase |
| --- | --- | --- | --- |
| Interruptor «Precio cerrado / solo el total» (A1, T3) | **No** | Una sola línea con el precio pactado ya da eso. El interruptor tocaría el portal, el PDF, los correos y la aprobación línea por línea | — |
| Catálogo de trabajos frecuentes (T3) | **Después** | Depende de qué trabajos repite el taller (pregunta de la llamada). Los cambios de aceite ya tienen atajos en el sticker | 2 |
| «Autorizado por el cliente en recepción» (J1, P3) | **Sí, adaptada** | Quita 4 o 5 toques y un cambio de pestaña. Se registra como autorización en persona, con el nombre del cliente, dentro de la misma RPC del alta (todo o nada). **Desmarcada por defecto** hasta que decidas | 1 |
| Franja «Siguiente paso recomendado» (A5, J3) | **No; se completa lo que hay** | Ya hay una acción rápida principal por estado, el panel de autorización y el de hallazgos. Solo falta «Marcar lista para entregar» como acción principal | 1 |
| Botón de SMS (A3, J2, P2) | **Ya existe** | Se amplía con el aviso de «listo» por SMS o WhatsApp y con mensajes en el idioma del cliente | 1 |
| Escanear el VIN con la cámara (A3, T1) | **No, por ahora** | Safari en iPhone no trae lector de códigos de barras: habría que agregar una librería, y leer una etiqueta curva en el patio es poco confiable. Se quita lo que de verdad frena (el VIN obligatorio) y se prueba el «Escanear texto» del teclado del iPhone | 1 (VIN opcional) |
| Función de traducción nueva con Gemini (A4, T5) | **No: ya existe** | Solo falta traducir el color del vehículo | 1 (color) |
| Traducir la nota del sticker en `/s/` (P1) | **Después** | La nota ya se escribe en el idioma del sticker, que por defecto es el del cliente. Traducirla cuando el cliente cambia de idioma necesita meterla en la cola de traducción (una migración) | 2 |
| SMS con Twilio (T4) | **No** | En EE. UU. hay que registrar la marca y la campaña (A2P 10DLC), pagar por mensaje y gestionar el consentimiento. El SMS desde el iPhone del taller no cuesta nada y cubre el mostrador | — |
| Diagrama de daños de cinco vistas (A2, T2, C3) | **Sí, con prototipo primero** | Es lo más parecido a su hoja y es la prueba de los daños previos que firma el cliente. Es la pieza más grande: base, alta, detalle, PDF y portal | 2 |
| «Modo Patio» de tres botones (T6, C6) | **Después de medir** | Ya hay «Mis tareas» y acciones rápidas. En la fase 1 solo se agrandan los botones a 44 px; el resto depende de la consulta H4 y de la llamada | 1 (tamaño) y 2 |
| Rol «recepción» que no ve comisiones | **Pregunta** | Sería una migración de permisos grande. Antes hay que saber si le importa al taller | — |
| Tres skills (KB1–KB3) | **Hecho** | Instaladas y adaptadas a las reglas reales (sección 8) | — |
| Bloque de UX en `AGENTS.md` (KC) | **Para aprobar** | Texto propuesto en la sección 8 | 1 |
| MCP de Playwright (KA) | **Decisión tuya** | Ver la sección 8 | — |
| Llamada con la administradora (R1) | **Sí, con cambios** | No ofrecer un «Modo Rápido» que no existe. Primero los datos y una sesión de observación (anexo B) | 0 |

## 6. Fases

### Fase 0: medir y escuchar (esta semana, sin código)

1. **Tú:** pega el anexo A en el editor SQL del proyecto real (es de solo lectura) y pásame el
   resultado. Son diez minutos.
2. **Tú:** revisa la configuración pendiente (F0):
   - que los correos salgan (Configuración → Correos al cliente);
   - `VITE_SENTRY_DSN` en Hostinger;
   - las notificaciones push.
3. **Tú, con la administradora:** la llamada del anexo B y, si se puede, verla registrar dos
   carros reales por pantalla compartida.
4. **Todos:** mientras dure la adopción, no se cambia el flujo de la orden, salvo la fase 1. Se
   publica fuera del horario del taller y se les avisa qué cambió.

### Fase 1: quitar fricción (una entrega, una migración)

| Tarea | Qué | Quién |
| --- | --- | --- |
| C1 | Migración `20261010000030`: `create_work_order` acepta `autorizado_en_recepcion` y registra la autorización en la misma transacción, con su prueba pgTAP | Claude |
| G1 | VIN opcional en el alta y en Vehículos (si se escribe, 17 caracteres) | Gemini |
| G2 | Casilla «El cliente aceptó estos trabajos» en el paso 3 del alta | Gemini, después de C1 |
| G3 | Mensajes al cliente en su idioma, y aviso de «listo» por SMS o WhatsApp cuando no tiene correo | Gemini |
| G4 | «Marcar lista para entregar» como acción rápida principal, y acciones rápidas de 44 px en el teléfono | Gemini |
| G5 | Color del vehículo en el idioma del cliente (portal, sticker y PDF) | Gemini |
| G6 | Manual en español e inglés: «Recibir un carro rápido» y lo que cambió | Gemini (texto) y Claude (capturas) |
| C2 | Bloque de UX en `AGENTS.md`, si lo apruebas | Claude |
| C3 | Auditoría de lo que haga Gemini, verificación completa y bitácora | Claude |

**Publicación**, en este orden y sin funciones que desplegar:

1. `npm run test:db`.
2. `supabase db push` (la `030`).
3. Push a `main`.
4. `npm run qa:security`.

### Fase 2: con los datos y la respuesta del taller

- **Diagrama de daños:**
  1. Un prototipo (una imagen tocable de las cinco vistas con marcas) para mostrárselo a la
     administradora.
  2. Con su visto bueno, la versión completa: se guarda en la orden y aparece en el alta, en el
     detalle, en el PDF que firma el cliente y en el portal.
- **«Por cotizar»**, si el dueño usa la app: un grupo en Requiere atención y un aviso de «orden
  recibida sin precio».
- **Técnico:** lo que diga la consulta H4 (por ejemplo, un botón «Terminé mi parte»).
- **Nota del sticker traducida** y **catálogo de trabajos**, si la llamada lo pide.

## 7. Decisiones (respondidas el 14/10/2026)

1. **Fase 1:** aprobada.
2. **Casilla de autorización en el alta:** «sí» a la recomendación, es decir, **desmarcada por
   defecto**. Si querías marcada, es un cambio de una línea.
3. **Bloque de UX en `AGENTS.md`:** sí. Aplicado.
4. **MCP de Playwright:** sí. Instalado solo para este proyecto:
   - versión fijada `@playwright/mcp@0.0.83`;
   - sin ventana (`--headless`) y con perfil aislado (`--isolated`);
   - solo con acceso a la app y al Supabase locales (`--allowed-origins`).

   Reemplazó el que estaba con `@latest`.
5. **SQL del anexo A:** sin respuesta; sigue pendiente.

**Además, la persona responsable pidió el 14/10:**

- **El escáner del código de barras del VIN** (en la sección 5 decía «No, por ahora»).
- **El dibujo del vehículo** ya en esta tanda, sin esperar el prototipo.
- **Que Gemini programe todo y Claude verifique.** Por eso la migración C1 pasa a Gemini (tarea
  A0), con la comparación de la función contra su versión anterior.

Las tareas están en [tareas-para-gemini-adopcion.md](tareas-para-gemini-adopcion.md):

- **parte A:** la fase 1 y el escáner;
- **parte B:** el dibujo.

## 8. Herramientas de Claude Code

**Skills instaladas** en `.claude/commands/` (sin commit). Ya aparecen como `/ux-taller`,
`/auditoria-adopcion` y `/nueva-migracion`. No son una copia del texto de Gemini:

- **Son de solo lectura:** entregan un informe y no editan.
- **Usan las reglas reales del proyecto:** i18n en español e inglés, tokens CSS, `QuickActions`
  con un solo botón principal, y los pedidos del taller anotados en la bitácora.
- **Suman el caso real que faltaba:** el dueño pone el precio después.
- **Avisan que `npm run dev` usa `.env.local`, que apunta al proyecto real:** ahí solo se mira,
  no se guarda nada.
- **`/nueva-migracion` incluye los errores que ya pasaron aquí:**
  - el borrador de la `029` volvía pública `hoy_taller`;
  - `ON CONFLICT` sin índice único;
  - `OLD.columna` en un trigger compartido entre tablas;
  - un caso de `qa:security` que pedía una columna inexistente.

**Bloque propuesto para `AGENTS.md`** (no está aplicado):

```markdown
## Principios de UX y adopción en el taller

- **Recibir un carro toma menos de 60 segundos** con un cliente que solo trae nombre y
  teléfono. Todo campo obligatorio nuevo del alta tiene que justificarse contra eso.
- **Antes de agregar una tarjeta, sección o botón, di qué elemento existente se oculta, se
  fusiona o se automatiza.** Una acción nueva vive dentro de una sección existente
  (`TAB_SECTIONS`) o como acción rápida, nunca como una tarjeta por tabla.
- **Cada estado de la orden tiene un solo botón principal** (`QuickActions`, `primary`).
- **El técnico resuelve lo suyo en 1 o 2 toques** en un teléfono de 390 px, con botones de
  44 px o más.
- **El cliente puede no tener correo:** ningún paso depende del correo. WhatsApp y SMS son los
  canales, y lo que se le manda va en su idioma (`clientes.idioma`).
- Antes de dar por buena una pantalla, `/ux-taller`; antes de un cambio de base,
  `/nueva-migracion`.
```

**MCP de Playwright: no lo instalé.**

- **Ya puedo ver la app.** Las capturas de la Ayuda las tomé con `@playwright/test`, que ya está
  instalado, en tamaño de teléfono y de escritorio.
- **Lo que agrega el MCP:** navegar la app de forma interactiva durante una conversación.
- **Lo que cuesta el comando de Gemini:**
  - usa `@latest`: cada arranque baja de npm la última versión, sin fijar;
  - suma un servidor que controla un navegador.
- **Si lo quieres:** lo instalo con la versión fijada, solo para este proyecto, sin ventana
  (`--headless`) y con perfil aislado (`--isolated`). Las banderas las confirmo contra la
  documentación del paquete al instalarlo.

## Resultados del anexo A (16/10/2026, producción)

Claude Code corrió las 12 consultas el 16/10/2026 con `npx supabase db query --linked`, una por
llamada y con `default_transaction_read_only` (`plan-de-pruebas.md` §1.4). No hay datos
anteriores al 09/10: la base se limpió antes de que empezara la prueba con datos reales.

| Pregunta | Resultado | Lectura |
|---|---|---|
| ¿Se dejó de usar? (H1a, H1b) | 7 órdenes en total: 3 el viernes 09/10, 2 el lunes 12/10 y 2 el martes 13/10. **Ninguna orden ni ningún cambio desde el miércoles 14/10** | Sí: el uso se cortó el 14/10. No coincide con la caída del 04–05/10, que fue antes de la prueba con datos reales |
| ¿Quién entra? (H1c) | De 5 técnicos, 2 no entraron desde el 02/10 y otro entró el 11/10 sin hacer nada. La pintora trabajó el 09 y el 10/10; un mecánico, hasta el 13/10 | Solo 2 técnicos usaron la app, y por pocos días |
| ¿Se atasca la recepción? (H2a, H2b) | **5 de las 7 órdenes siguen en Recepción**, todas con más de 3 días. **5 de 7 tienen trabajos sin autorizar** y 2 tienen un depósito mayor que lo autorizado | **El cuello de botella principal es la autorización.** La casilla de la tarea A2 va primero |
| ¿Cómo se autoriza? (H2c, H2d) | Solo 2 órdenes se autorizaron (una por teléfono, otra el cliente desde su enlace), en una mediana de 0,6 h. Ninguna «en persona» | La forma «en persona» no se usó nunca: estaba escondida en otra pestaña |
| ¿Clientes sin correo? (H3a) | 3 de 6 (50 %) | Menos que el 90 % del documento, pero la mitad. A3 importa |
| ¿Fallan los correos? (H3b) | No: todos los correos y las 16 traducciones salieron bien | F0 (Resend) no es el problema |
| ¿Quién registra el trabajo del patio? (H4) | Archivos: admin 19, pintora 14, mecánicos 2. Avances: pintora 9, mecánicos 3, admin 1 | La pintora usó la app; los mecánicos casi nada. La administración subió más archivos que todos los técnicos juntos |
| ¿Qué quedó a medias? (H5) | 1 orden finalizada hace más de 3 días sin marcar como lista | A4 («Marcar lista» como acción principal) ayuda |
| ¿Los clientes abren su enlace? (H6) | 3 de 5 enlaces abiertos, 25 veces en total; la última, el 14/10 | El enlace del cliente sí se usa |

**Cambios al plan por estos datos:**

1. **A2 (autorizar en la recepción) es lo primero.** 5 de 7 órdenes quedaron sin autorizar y
   en Recepción.
2. **Hipótesis nueva:** las órdenes no pasan de Recepción a En proceso. Hay que preguntarle a la
   administradora si el paso a «En proceso» lo da alguien (anexo B, pregunta nueva 10).
   Además, una propuesta para la siguiente tanda: que autorizar lo cotizado de una orden en
   Recepción la pase sola a En proceso.
3. **La inestabilidad del 04–05/10 pierde peso como causa**, porque la prueba con datos reales
   empezó después (09/10). El uso se cortó el 14/10, el mismo día en que se publicó el sticker.
   Puede ser casualidad: preguntarlo en la llamada.
4. **Los técnicos casi no usan la app.** El «Modo Patio» (fase 2) sube de prioridad.

## Anexo A: consultas de diagnóstico (solo lectura)

Pégalas en el editor SQL del proyecto real. La primera línea hace que cualquier escritura falle.

- **No devuelven datos personales:** solo conteos, fechas, roles e ids recortados a 8
  caracteres.
- **Se probaron sin errores** en la base local el 14/10/2026.
- **El historial de la orden existe desde el 04/10** (`20261010000004`): la actividad anterior a
  esa fecha no aparece en H1b ni en H4.

```sql
SET default_transaction_read_only = on;

-- H1a. Órdenes creadas por día y sede desde el inicio de la prueba (hora de Maryland).
SELECT (o.creado_en AT TIME ZONE 'America/New_York')::date AS dia, s.nombre AS sede, count(*) AS ordenes
FROM ordenes_trabajo o JOIN sedes s ON s.id = o.sede_id
WHERE o.creado_en >= '2026-09-27'
GROUP BY 1, 2 ORDER BY 1, 2;

-- H1b. Actividad por persona y día (cada cambio registrado en el historial de las órdenes).
SELECT (h.ocurrido_en AT TIME ZONE 'America/New_York')::date AS dia, p.rol,
       left(h.actor_id::text, 8) AS persona, count(*) AS cambios, count(DISTINCT h.orden_id) AS ordenes
FROM historial_orden h LEFT JOIN perfiles p ON p.id = h.actor_id
WHERE h.ocurrido_en >= '2026-09-27'
GROUP BY 1, 2, 3 ORDER BY 1, 2, 3;

-- H1c. Último ingreso de cada persona.
SELECT p.rol, left(p.id::text, 8) AS persona,
       (u.last_sign_in_at AT TIME ZONE 'America/New_York')::timestamp(0) AS ultimo_ingreso
FROM perfiles p JOIN auth.users u ON u.id = p.id
ORDER BY u.last_sign_in_at DESC NULLS LAST;

-- H2a. Órdenes abiertas por estado y cuántas llevan más de 3 días creadas.
SELECT o.estatus, count(*) AS ordenes,
       count(*) FILTER (WHERE o.creado_en < now() - interval '3 days') AS con_mas_de_3_dias
FROM ordenes_trabajo o
WHERE o.archivada_en IS NULL AND o.estatus <> 'entregado'
GROUP BY 1 ORDER BY 1;

-- H2b. Órdenes sin trabajos, con trabajos sin autorizar y con depósito mayor que lo autorizado.
WITH l AS (
  SELECT orden_id, estado FROM orden_labor
  UNION ALL
  SELECT orden_id, estado FROM orden_repuestos
)
SELECT count(*) AS ordenes,
       count(*) FILTER (WHERE NOT EXISTS (SELECT 1 FROM l WHERE l.orden_id = o.id)) AS sin_trabajos,
       count(*) FILTER (WHERE EXISTS (SELECT 1 FROM l WHERE l.orden_id = o.id AND l.estado IN ('borrador', 'pendiente'))) AS con_trabajos_sin_autorizar,
       count(*) FILTER (WHERE m.deposito_inicial > COALESCE(m.total_general, 0)) AS deposito_mayor_que_lo_autorizado
FROM ordenes_trabajo o LEFT JOIN orden_montos m ON m.orden_id = o.id
WHERE o.creado_en >= '2026-09-27';

-- H2c. Cuánto tarda una orden en autorizarse y en terminarse (mediana, en horas).
WITH pa AS (
  SELECT orden_id, min(respondido_en) AS primera
  FROM presupuestos WHERE respondido_en IS NOT NULL GROUP BY orden_id
)
SELECT count(*) AS ordenes,
       count(pa.primera) AS con_autorizacion,
       round((percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM pa.primera - o.creado_en) / 3600))::numeric, 1) AS horas_hasta_autorizar,
       count(o.fecha_finalizacion) AS finalizadas,
       round((percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM o.fecha_finalizacion - o.creado_en) / 3600))::numeric, 1) AS horas_hasta_finalizar
FROM ordenes_trabajo o LEFT JOIN pa ON pa.orden_id = o.id
WHERE o.creado_en >= '2026-09-27';

-- H2d. Cómo se autorizó lo cotizado (enlace del cliente, teléfono, en persona, WhatsApp, firma vieja).
SELECT respondido_via, count(*) AS presupuestos
FROM presupuestos WHERE creado_en >= '2026-09-27'
GROUP BY 1 ORDER BY 2 DESC;

-- H3a. Clientes sin correo (los nuevos desde el inicio de la prueba).
SELECT count(*) AS clientes,
       count(*) FILTER (WHERE NULLIF(btrim(email), '') IS NULL) AS sin_correo,
       round(100.0 * count(*) FILTER (WHERE NULLIF(btrim(email), '') IS NULL) / NULLIF(count(*), 0), 1) AS pct_sin_correo
FROM clientes WHERE creado_en >= '2026-09-27';

-- H3b. Correos y avisos en la cola, por estado (el error, sin direcciones de correo).
SELECT canal, plantilla, estado, count(*) AS envios,
       left(regexp_replace(max(ultimo_error), '[^\s@]+@[^\s@]+', '***', 'g'), 120) AS ejemplo_error
FROM cola_envios WHERE creado_en >= '2026-09-27'
GROUP BY 1, 2, 3 ORDER BY 1, 2, 3;

-- H4. ¿Quién registra el trabajo del patio? Avances, archivos, tareas hechas y cambios de estado, por rol.
SELECT 'avances' AS que, p.rol, count(*) AS cuantos
FROM orden_avances a LEFT JOIN perfiles p ON p.id = a.usuario_id
WHERE a.creado_en >= '2026-09-27' GROUP BY 1, 2
UNION ALL
SELECT 'archivos', p.rol, count(*)
FROM orden_media m LEFT JOIN perfiles p ON p.id = m.subido_por
WHERE m.creado_en >= '2026-09-27' GROUP BY 1, 2
UNION ALL
SELECT 'tareas_hechas', p.rol, count(*)
FROM orden_labor l LEFT JOIN perfiles p ON p.id = l.completado_por
WHERE l.completado_en >= '2026-09-27' GROUP BY 1, 2
UNION ALL
SELECT 'cambios_de_estatus', p.rol, count(*)
FROM historial_orden h LEFT JOIN perfiles p ON p.id = h.actor_id
WHERE h.ocurrido_en >= '2026-09-27' AND h.cambios ? 'estatus' GROUP BY 1, 2
ORDER BY 1, 2;

-- H5. Lo que se queda a medias.
SELECT
  (SELECT count(*) FROM orden_labor WHERE estado = 'aprobado' AND asignado_a IS NULL AND creado_en >= '2026-09-27') AS tareas_autorizadas_sin_tecnico,
  (SELECT count(*) FROM ordenes_trabajo WHERE estatus = 'finalizado' AND lista_para_entregar_en IS NULL AND archivada_en IS NULL) AS finalizadas_sin_revisar,
  (SELECT count(*) FROM ordenes_trabajo WHERE estatus = 'finalizado' AND fecha_finalizacion < now() - interval '3 days') AS finalizadas_sin_entregar_3_dias,
  (SELECT count(*) FROM ordenes_trabajo WHERE firma_ruta IS NULL AND estatus <> 'recepcion' AND creado_en >= '2026-09-27') AS en_trabajo_sin_firma;

-- H6. ¿Los clientes abren su enlace?
SELECT count(*) AS enlaces,
       count(*) FILTER (WHERE accesos > 0) AS abiertos,
       COALESCE(sum(accesos), 0) AS aperturas,
       (max(ultimo_acceso_en) AT TIME ZONE 'America/New_York')::timestamp(0) AS ultima_apertura
FROM orden_enlaces WHERE creado_en >= '2026-09-27';
```

| Consulta | Qué responde | Si sale… | Qué cambia en el plan |
| --- | --- | --- | --- |
| H1a, H1b, H1c | ¿Se dejó de usar el sistema y desde cuándo? | Una caída después del 04–05/10 | La causa principal fue la inestabilidad. Se refuerza la fase 0: congelar cambios y pedir disculpas en la llamada |
| H2a, H2b | ¿La recepción se atasca? | Muchas órdenes con trabajos sin autorizar o con depósito mayor que lo autorizado | G2 va primero |
| H2c, H2d | ¿Cómo y cuándo se autoriza? | Casi todo «en persona» | Confirma G2 marcada por defecto (decisión 2) |
| H3a, H3b | ¿Clientes sin correo? ¿Fallan los correos? | Más de la mitad sin correo | G3 va primero |
| H3b | | Errores de Resend | Es configuración (F0), no código |
| H4 | ¿Quién registra el trabajo del patio? | Casi todo lo hace el admin | Sube la prioridad del «Modo Patio» (fase 2) |
| H5 | ¿Qué queda a medias? | Tareas sin técnico o finalizadas sin revisar | G4 y la conversación sobre comisiones |
| H6 | ¿Los clientes abren su enlace? | Cero aperturas | Los mensajes no llegan o no se entienden: G3 |

## Anexo B: la llamada (o mejor, la observación)

**Objetivo:** entender, no vender. No ofrezcas un «Modo Rápido» que todavía no existe.

**Observación (lo más valioso):** 20 minutos de pantalla compartida mientras ella registra dos
carros reales.

- No la ayudes.
- Anota dónde duda, qué dato no tiene a la mano y cuándo vuelve al papel.

**Preguntas** (las tres de Gemini, ajustadas, más las que deciden este plan):

1. «La última vez que metiste una orden, ¿en qué parte sentiste que te quitaba tiempo o que te
   pedía un dato que no tenías a la mano?» *(Gemini)*
2. «Cuando llega un carro, ¿tienes el VIN a la mano?» *(G1)*
3. «Cuando no están Carlos o Jesús, ¿cómo les pasas las fotos y quién te da el precio? ¿Ellos
   abren Restorify en su teléfono?» *(fase 2, «por cotizar»)*
4. «¿Los mecánicos entraron desde su teléfono, o te tocó subir las cosas por ellos?»
   *(Gemini; H4)*
5. «¿Te tocó un error, o una pantalla que cambió de un día para otro?» *(inestabilidad)*
6. «Cuando le mandaste el enlace al cliente, ¿qué te dijo? ¿Lo entendieron los clientes que
   hablan inglés?» *(Gemini; G3)*
7. «Si el cliente está enfrente y acepta el precio, ¿quieres que el sistema lo dé por autorizado
   en ese momento?» *(decisión 2)*
8. «¿Hay trabajos que se repitan con el mismo precio?» *(catálogo)*
9. «¿Te molesta ver las comisiones de los técnicos, o te da igual?» *(rol de recepción)*
10. «Cuando el carro entra al taller, ¿alguien lo cambia a "En proceso" en el sistema? ¿Quién
    debería hacerlo?» *(5 de 7 órdenes siguen en Recepción)*
11. «Desde el miércoles 14 no se ha registrado ninguna orden. ¿Pasó algo ese día?» *(el uso se
    cortó el 14/10)*
