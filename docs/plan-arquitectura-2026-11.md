# Plan de arquitectura de Restorify (16/11/2026)

Lo escribe el arquitecto (Claude) para dos lectores: la persona responsable, que decide, y los
agentes que ejecutan (Gemini Hydrogen, agentes Sonnet), que reciben de aquí sus órdenes. Dice
cómo debe funcionar el programa, en qué orden se construye lo que falta y cómo se reparte el
trabajo. El estado del día a día sigue en la [bitácora](bitacora.md); las reglas que no se
rompen, en [ai-context.md](ai-context.md).

## 1. Dónde estamos

- **Por dentro, el programa está sano.** La base decide el dinero y los permisos (RLS, triggers,
  RPC), hay 99 migraciones con 1.193 pruebas de base, 1.275 pruebas de la app, 102 de las edge
  functions, 85 de punta a punta contra una base local y 209 casos de seguridad de la API. Los
  archivos grandes ya están partidos y los tipos de la app se comprueban contra la base.
- **Por fuera, casi nadie lo usa.** Medido el 16/11 en producción (solo lectura): desde que el
  taller empezó de cero el 06/11 hay 2 órdenes, las dos del mismo día y de una sola cuenta de
  administración; ningún técnico entra desde el 20/10; ningún teléfono tiene los avisos
  encendidos; Finanzas está vacía. En octubre el taller ya había vuelto a su hoja de papel.
- **Conclusión:** el riesgo del proyecto no es técnico, es de adopción. El programa hace mucho
  más de lo que el taller usa (comisiones, parqueo, inspección por puntos, reloj, indicadores,
  catálogo, sticker), y todo eso está a la vista desde el primer día.

## 2. Principios de arquitectura

1. **Primero se usa, después crece.** Ninguna función nueva se construye mientras el flujo básico
   (recibir un carro, avanzar, entregar y cobrar) no se use todas las semanas. La
   [sección 5](#5-hoja-de-ruta) pone una puerta medible antes de la etapa de producto.
2. **Lo que no se mide no se discute.** Hoy el uso se deduce del historial de las órdenes; no se
   sabe cuánto tarda un alta ni dónde se abandona. Eso se mide dentro de la app, sin datos
   personales.
3. **Un núcleo chico y módulos que se encienden.** El taller ve solo lo que usa. Lo demás existe,
   probado, pero apagado por sede. Apagar un módulo es comodidad de pantalla, no un permiso: los
   permisos siguen en la base.
4. **La base sigue siendo el backend.** No se agrega un servidor propio. Dinero y permisos, en
   RPC y triggers con su prueba pgTAP; el navegador solo pinta y pide.
5. **Nada llega al taller sin pasar por la puerta.** Local con Docker, después el CI, después
   producción, y solo cuando la persona responsable lo pide.

## 3. Cómo debe funcionar el programa

### 3.1 Las piezas (vigente, no cambia)

| Pieza | Qué hace | Dónde vive |
|---|---|---|
| App del personal | Órdenes, clientes, cobros, comisiones, configuración | `src/` (React), publicada por Hostinger desde `main` |
| Página del taller y portal del cliente | Lo público: la página, el enlace de cada orden, el QR del sticker | `src/landing/`, `src/portal/` (paquetes aparte, sin acceso a la base) |
| Base de datos | Datos, permisos por rol y sede, todo el dinero | Supabase (Postgres): `supabase/migrations/`, leída de corrido en `supabase/schema/actual.sql` |
| Edge functions | Lo que no puede hacer el navegador: correos, avisos push, traducción, cuentas de empleados, datos del portal | `supabase/functions/` (7 funciones) |
| Red de pruebas | Vitest, pgTAP, Deno, Playwright local, seguridad de la API | `npm test`, `test:db`, `test:functions`, `test:e2e:local`, `qa:security:local`, y el CI |

### 3.2 Decisiones de arquitectura

| # | Decisión | Estado | Por qué |
|---|---|---|---|
| D1 | Sin backend propio: el navegador habla con Supabase; lo sensible va por RPC `SECURITY DEFINER` | Vigente | Un solo lugar para permisos y dinero; ya tiene 1.193 pruebas |
| D2 | Toda regla de dinero o permiso es una migración con su prueba pgTAP | Vigente | Un cuerpo SQL roto se aplica sin error y falla en producción |
| D3 | Tipos de la app generados de la base, con contrato en el compilador; esquema vigente en un archivo | Vigente desde el 15–16/11 | La app y la base no pueden desalinearse en silencio |
| D4 | **Medición de uso dentro de la app** (eventos sin datos personales, leídos solo por administración) | **Aplazada** (decisión del 16/11) | Principio 2. Se retoma después de la etapa 1 |
| D5 | **Módulos por sede**: cada sede enciende lo que usa; la app esconde lo apagado | **Aplazada** como sistema configurable (decisión del 16/11). Lo que sí se hace ya: los módulos que el taller no usa quedan **apagados para este taller**, con una sola lista en el código (paquete Q3) | Principio 3. Primero una sede bien hecha |
| D6 | **Recibir un carro es un camino corto** aparte del alta completa: cliente, vehículo y listo; lo demás se agrega después | **Nueva** (se decide con lo que salga del recorrido de calidad, Q1) | La meta de 60 segundos de `AGENTS.md` hoy no se mide ni se garantiza |
| D7 | **El técnico entra sin contraseña**, con un código QR que le genera administración | **Aplazada** (decisión del 16/11) | Ningún técnico entra desde hace un mes; el correo y la contraseña en el teléfono son la sospecha principal |
| D11 | **La vara es el software comercial**: el flujo de un taller de una sede tiene que sentirse como un programa de pago antes de crecer en funciones o en sedes | **Nueva** (decisión del 16/11, etapa 1) | Pedido de la persona responsable: «que funcione bien para una sola sede primero; un software a la altura de los comerciales» |
| D8 | Publicar en dos tiempos: `main` pasa por el CI y la rama `produccion` es la que sale en vivo | Diseñada, sin activar | Hoy un push a `main` sale en vivo antes de que termine el CI |
| D9 | Staging (segundo proyecto de Supabase) | Aplazada | Con la base local, el CI y las e2e locales el riesgo que cubría bajó; se retoma antes de cobrar con tarjeta |
| D10 | Cobro con enlace (Stripe) y mensajes de texto (SMS) | **Pendientes a propósito** | Decisión de la persona responsable, 16/11/2026 |

### 3.3 Diseño de lo nuevo

**M1. Medición de uso.** Una tabla `uso_eventos` (sede, persona, rol, evento de una lista
cerrada, orden opcional, duración en milisegundos, tipo de dispositivo, fecha) que se escribe solo
por una RPC `registrar_uso` y la lee solo administración. Sin texto libre, sin nombres de
clientes, sin placas. Eventos: sesión iniciada, alta abierta, alta creada (con su duración), alta
abandonada (con el paso), avance registrado, tarea completada, orden entregada, enlace compartido.
Registrar un evento nunca frena la pantalla: si falla, se ignora. Se borran a los 180 días.

**M2. Panel de adopción.** Una RPC `resumen_adopcion(sede, desde)` que cuenta, en la base:
órdenes por semana, personas activas por rol, mediana del tiempo del alta, altas abandonadas por
paso, enlaces abiertos y teléfonos con avisos. Se ve dentro de Finanzas → Indicadores del taller
(una sección más, no una pantalla nueva).

**F1. Módulos por sede.** Una tabla `sede_modulos` (sede, módulo, encendido) con lista cerrada:
comisiones, inspección por puntos, reloj por tarea, catálogo de trabajos, próximo servicio,
estados de cuenta del banco, indicadores. El parqueo sigue con su propio interruptor. Las sedes
que ya existen quedan con todo encendido (nada cambia sin que alguien lo decida). En la app, un
solo lugar (`useModulos()`) decide qué menús, pestañas, secciones y acciones rápidas se pintan.
Configuración gana una tarjeta «Qué usa este taller» que reemplaza a las tarjetas de los módulos
apagados.

**F2. Recepción rápida.** En el alta, cuando ya hay cliente (nombre y teléfono) y vehículo, un
botón principal «Recibir ahora» crea la orden en recepción sin pasar por trabajos ni depósito. El
alta de cuatro pasos sigue igual para quien quiera cotizar en el momento. La meta se comprueba con
M1: mediana del alta rápida de 60 segundos o menos en un teléfono.

**F3. Acceso del técnico con QR** (necesita tu decisión). En Empleados, administración toca
«Dar acceso» y la pantalla muestra un QR que vale 10 minutos y un solo uso. El técnico lo lee con
su teléfono y queda con la sesión abierta; ahí mismo se le ofrece instalar la app y encender los
avisos. Por dentro: una edge function nueva, solo para administración, que pide a Supabase Auth
un enlace de acceso para ese empleado. Riesgo y control: quien tenga el QR en esos 10 minutos
entra como ese técnico, por eso solo lo genera un admin, vence rápido y queda registrado.

**F4. Primer día.** Mientras la sede tenga menos de 5 órdenes, el Panel del admin muestra una
lista corta en lugar de las gráficas vacías: datos del taller, dar acceso a los técnicos, recibir
el primer carro, encender los avisos en este teléfono. Desaparece sola.

## 4. Cómo se trabaja

| Rol | Quién | Qué hace | Qué no hace |
|---|---|---|---|
| Arquitecto | Claude (modelo mayor) | Entiende el proyecto, decide el diseño, escribe cada orden con su criterio de aceptación, revisa el resultado y la evidencia, mantiene este plan y la bitácora | No programa ni depura lo que otro puede hacer |
| Programador | Gemini Hydrogen | Escribe código y documentación a partir de la orden; lee y diagnostica código | No ejecuta comandos: su entrega siempre pasa por el verificador |
| Verificador | Agente Sonnet | Aplica la entrega, corre lint, tipos, pruebas y recorridos, arregla lo que falle dentro del alcance de la orden y devuelve la evidencia | No cambia el diseño, no publica, no toca producción |
| Responsable | Kevin | Decide prioridades y lo que es del taller, y pide cada publicación | — |

**Cada orden lleva:** el objetivo y el porqué; la carpeta y los archivos que se pueden tocar; las
decisiones ya tomadas; el criterio de aceptación; cómo se verifica; y qué entregar. Las órdenes
se guardan en `docs/ordenes/` para que cualquier agente pueda retomar.

**Terminado quiere decir:** lint y tipos limpios; `npm test`, `test:functions` y
`test:e2e:local` en verde; si hay SQL, `test:db`, `qa:security:local`, `db:types` y `db:schema`;
si hay pantalla, capturas en escritorio y a 390 px; manual de usuario en los dos idiomas si
cambió algo que el taller ve; entrada en la bitácora. Publicar es otro paso y se pide aparte.

## 5. Hoja de ruta

Tamaños: S = horas, M = uno o dos días, L = varios días, con Hydrogen programando y un agente
verificando.

### Etapa 0 — Cerrar y publicar (ya)

| # | Qué | Quién | Tamaño |
|---|---|---|---|
| C1 | Publicar lo del 16/11: `db push` de la `045`, commit y push a `main` | Arquitecto, cuando lo pidas | S |
| C2 | Ver correr el CI nuevo en GitHub (funciones, e2e, tipos y esquema al día) y ajustarlo | Verificador | S |
| C3 | Cuentas: `SENTRY_AUTH_TOKEN` en Hostinger, monitor de disponibilidad, rama `produccion` (D8) | Tú, con los pasos de `deployment.md` | S |

### Etapa 1 — Calidad comercial en una sola sede (decisión del 16/11/2026: es lo que sigue)

**Qué quiere decir «a la altura de un programa comercial».** No es tener más funciones: es que
lo que hay no tropiece. La vara, para el taller de una sede:

1. **El flujo completo corre sin ayuda:** recibir un carro, cotizar y autorizar, trabajar y
   registrar avances, terminar, entregar y cobrar, y que el cliente lo siga desde su enlace. En
   cada paso hay un solo botón principal, ningún callejón sin salida y ningún dato que haya que
   escribir dos veces.
2. **Igual de bien en el teléfono que en el escritorio:** 390 px, botones de 44 px, nada que se
   corte, se encime o pida hacer zoom.
3. **Nada se pierde y todo contesta:** cada acción da respuesta visible en menos de un segundo;
   lo escrito sobrevive a «atrás», a una recarga y a quedarse sin señal; cada error dice qué pasó
   y qué hacer, en el idioma de la persona.
4. **Todo se ve del mismo programa:** mismos componentes, espacios y estados (cargando, vacío,
   error) en todas las pantallas; sin palabras del sistema; español e inglés completos.
5. **Lo que sale hacia afuera se ve profesional:** el PDF de la orden, los correos, el enlace del
   cliente y el sticker, con la marca del taller y sin un texto a medias.
6. **Solo se ve lo que el taller usa:** lo demás, apagado.

| # | Qué | Quién | Tamaño | Aceptación |
|---|---|---|---|---|
| Q1 | **Recorrido de calidad:** recorrer el flujo completo en un navegador contra la base local, como administración (escritorio y teléfono), como técnico (teléfono) y como cliente (su enlace, teléfono), y anotar cada tropiezo contra la vara, con captura, gravedad y cómo repetirlo | Agentes Sonnet | M | Un informe por papel en `docs/ordenes/q1-*.md`, con cada hallazgo comprobable |
| Q2 | **Arreglos del recorrido**, por tandas: primero lo que rompe o confunde el flujo, después lo que se ve mal | Hydrogen programa, Sonnet verifica, el arquitecto prioriza y revisa | L | Cada hallazgo aceptado tiene su arreglo con captura de antes y después; nada del flujo queda en gravedad alta |
| Q3 | **Módulos apagados para este taller:** comisiones, inspección por puntos, reloj por tarea, catálogo de trabajos, estados de cuenta del banco e indicadores no aparecen en menús, detalle ni Configuración. Una sola lista en el código (`src/config/modulos.ts`), sin pantalla de administración; quedan encendidos órdenes, clientes, vehículos, cobros y Finanzas básica | Hydrogen y Sonnet | M | Con la lista de hoy no queda rastro de lo apagado; encendiendo todo, la app es idéntica a la de antes (capturas y las 85 e2e) |
| Q4 | **Lo que sale hacia afuera:** revisar y pulir el PDF de la orden, los correos, el enlace del cliente y el sticker, en español e inglés | Hydrogen y Sonnet | M | Un juego de muestras (PDF, cada correo, enlace, sticker) aprobado por la persona responsable |
| Q5 | **«Un día en el taller»:** una prueba e2e que recorre el flujo entero por la pantalla, y un juego de datos de ejemplo para enseñar el programa | Hydrogen y Sonnet | M | La prueba pasa en local y en el CI; los datos de ejemplo se cargan con un comando |

Orden: Q1 primero (dice qué hay que arreglar). Q3 puede ir en paralelo con Q1. Q2, Q4 y Q5
después, según lo que salga.

**Estado al 24/11/2026:**

- **Hechos y publicados:**
  - Q1: 35 hallazgos.
  - Q3: módulos apagados.
  - Q2 completo, en todas sus tandas (las prioridades están en [ordenes/q2-prioridades.md](ordenes/q2-prioridades.md)):
    - tanda 0: el técnico termina su orden (`046`);
    - tanda 1: datos sucios en la recepción (`047`);
    - tanda 2: un solo camino claro;
    - tanda 3: se toca y se lee bien;
    - tanda 4: lo que ve el cliente.
- **Q4 publicado** el 24/11: push a `main` y `process-outbox` v23.
- **Q5 hecho** el 25/11, sin publicar: la prueba e2e «un día en el taller», los datos de ejemplo
  (`npm run demo:cargar` / `demo:borrar`, solo en local), la Ayuda sin los módulos apagados y plurales
  de verdad ([informe](ordenes/q5-informe.md)).
- **Con Q5 publicado, la etapa 1 queda cerrada.** Lo siguiente se decide con el taller usándolo: la
  puerta de la etapa 3 y lo aplazado (M1/M2, F1 a F5).
- **Sobras menores:**
  - en `/work-orders`, el encabezado fijo tapa lo que se desplaza a la vista (`scroll-padding-top`);
  - el aviso «Trabajos autorizados» sale en español (necesita migración);
  - falta revisar Parqueo, Catálogo y Nómina a 390 px.

### Aplazado por decisión del 16/11/2026 — Saber qué pasa (medición de uso)

| # | Qué | Depende de | Tamaño | Aceptación |
|---|---|---|---|---|
| M1 | Medición de uso (tabla, RPC, llamadas en la app) | C1 | M | pgTAP: un técnico no lee eventos; un evento inválido se rechaza. Los eventos aparecen al recorrer la app en local |
| M2 | Panel de adopción en Indicadores | M1 | M | La RPC cuadra con los eventos de prueba; se ve a 390 px |
| M3 | Hablar con el taller con datos en la mano (anexo B de `plan-adopcion-2026-10.md`) | M2 en producción una semana | — | Tuyo. Sale la lista real de fricciones |

### Aplazado por decisión del 16/11/2026 — Quitar fricción (módulos por sede, acceso con QR)

Se retoma después de la etapa 1. La recepción rápida (F2) puede adelantarse si el recorrido de
calidad muestra que el alta es el tropiezo principal.

| # | Qué | Depende de | Tamaño | Aceptación |
|---|---|---|---|---|
| F1 | Módulos por sede | C1 | L | Con un módulo apagado no queda rastro suyo en menús, detalle ni Configuración; con todo encendido la app es idéntica a hoy (capturas) |
| F2 | Recepción rápida | M1 | M | e2e: cliente nuevo con nombre y teléfono y un vehículo, orden creada sin pasar por trabajos ni depósito |
| F3 | Acceso del técnico con QR | Tu decisión | M | e2e local: el admin genera el QR y otro navegador entra como el técnico; un enlace usado o vencido no entra; un técnico no puede generar accesos (`qa:security`) |
| F4 | Primer día | F1 | S | Aparece con menos de 5 órdenes y desaparece después |
| F5 | Probar en un Android real: «atrás», instalar la app, avisos push | — | S | Tuyo o del taller; lo que falle vuelve como orden |

### Etapa 3 — Producto (solo después de la puerta)

**Puerta:** dos semanas seguidas con 8 órdenes o más por semana creadas en la app y al menos 2
técnicos con actividad. Antes de eso, esta etapa no empieza.

1. Tablero por etapas configurable.
2. Citas (agenda, y la cita se vuelve orden).
3. Recordatorios del próximo servicio y pedir la reseña, por correo y por el enlace de WhatsApp.

### Etapa 4 — Orden y escala (cuando toque)

- Lo que espera al taller: pago a empleados ([pagos-a-empleados.md](pagos-a-empleados.md)),
  impuesto (contador), textos legales ([plan-legal-y-privacidad.md](plan-legal-y-privacidad.md)).
- Lo técnico sin urgencia: MFA para administradores, staging en la nube (D9), textos y estilos
  por dominio, peso del arranque de la app.
- **Pendiente a propósito:** cobro con enlace (Stripe) y SMS (D10).

## 6. Decisiones de la persona responsable (16/11/2026)

1. **Publicar lo del 16/11:** sí. Hecho el mismo día (`db push` de la `045` y push a `main`).
2. **Acceso del técnico con QR (F3):** todavía no.
3. **Módulos:** los que el taller no usa quedan apagados (comisiones, inspección por puntos,
   reloj, catálogo, estados de cuenta e indicadores). Se hace con una lista simple para este
   taller (Q3), no con el sistema configurable por sede.
4. **Medición de uso (M1, M2) y módulos por sede (F1):** no se arrancan.
5. **El foco:** que el programa funcione bien para una sola sede, a la altura de un programa
   comercial (etapa 1, decisión D11).
6. **Cobro con enlace (Stripe) y SMS:** pendientes a propósito.

## 7. Riesgos

| Riesgo | Qué lo vigila |
|---|---|
| Se sigue construyendo sin que el taller use lo básico | La puerta de la etapa 3 y el panel de adopción |
| Un módulo apagado deja una pantalla rota o un dato sin camino | Capturas de F1 con cada módulo apagado y pruebas e2e de los flujos básicos |
| El acceso por QR abre una puerta | Solo admin, 10 minutos, un uso, registrado, y caso en `qa:security` |
| El CI nuevo falla por diferencias entre Windows y Linux (tipos y esquema generados) | C2: verlo correr una vez y ajustar |
| La medición de uso guarda algo personal | Lista cerrada de eventos, sin texto libre, prueba pgTAP y revisión del arquitecto |
