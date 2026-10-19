# Plan: Restorify al nivel de los programas de pago para talleres (17/10/2026)

> **Estado:** **decidido el 17/10/2026 por la persona responsable:** el plan es **solo para
> Restorify y sus sedes, no para vender** (D1 = a). La fase 4 queda fuera, y los mensajes por SMS
> (1.2) se posponen. Lo que sigue en pie va en el [orden de la sección 6](#6-decisiones-pendientes).
>
> **Avance (17/10/2026), hecho y verificado, sin publicar** ([bitácora](bitacora.md#bitácora-de-traspaso-entre-agentes)):
> - la fase 0 en el código (`033`);
> - 1.1, trabajos y catálogo (`034`);
> - 1.4, inspección por puntos (`035`);
> - de la fase 3: horas, reloj e indicadores (`036`).
>
> Siguen: 2.1 y 2.2 (citas y recordatorios) y 3.4 (tablero por etapas). Del staging, el DSN de Sentry y el monitor se encarga la persona responsable.
>
> - **Arquitecto y verificación:** Claude Code. **Implementa:** Gemini, igual que en la
>   [adopción](plan-adopcion-2026-10.md): Claude escribe las tareas, Gemini programa y Claude
>   prueba y corrige.
> - **Parte de** la [comparativa del 11/10](historico/comparativa-comercial-y-ux-2026-10.md).
>   Aquí se actualiza con lo hecho desde entonces y se agrega lo que falta para *vender* el
>   programa, no solo para usarlo.

**Fuentes:**
- precios y funciones de 2026 de Tekmetric, Shopmonkey, Shop-Ware y AutoLeap (al final);
- una auditoría del código con cuatro guías profesionales instaladas como *skills*:
  - `vercel-react-best-practices` y `web-design-guidelines` de Vercel;
  - `supabase-postgres-best-practices` de Supabase;
  - `supply-chain-risk-auditor` de Trail of Bits.

Gemini hizo la del frontend; Claude verificó cada hallazgo en el código y corrió la de la base
sobre el Supabase local.

---

## 1. Respuesta corta

1. **En confianza y control, Restorify ya juega en la liga de los de pago, y en varias cosas va
   por delante.** Ninguno de los grandes trae todo esto junto en su plan de entrada:
   - permisos impuestos por la base;
   - comisión por tarea con aceptación;
   - autorización por línea con evidencia;
   - historial de cambios;
   - enlace del cliente con fotos, video y dibujo de daños;
   - dos idiomas con traducción automática;
   - escáner de VIN;
   - sticker con QR;
   - cobro de parqueo.
2. **Le falta lo que los de pago usan para cobrar y traer clientes.** Lo cobran aparte, y caro:
   - mensajes de ida y vuelta por SMS;
   - cobro con enlace;
   - citas y recordatorios;
   - catálogo de trabajos;
   - inspección por puntos;
   - reportes de indicadores.
3. **Para venderlo a otros talleres falta una capa que hoy no existe.** Separar a un taller de
   otro, darse de alta solo, cobrar la suscripción, un entorno de pruebas antes de publicar y
   monitoreo. Hoy un administrador ve **todas** las sedes: dos talleres distintos en el mismo
   proyecto se verían entre sí.
4. **La base técnica está sana.** No hay hallazgos críticos, y los arreglos son de días, no de
   meses ([sección 3](#3-lo-que-encontró-la-auditoría)).

## 2. Comparación con el mercado (precios de 2026)

Los cuatro grandes cobran por taller, al mes:

| Programa | Precio por taller al mes | Lo que se cobra aparte |
|---|---|---|
| Tekmetric | $179–$439 | Mensajes de ida y vuelta solo en el plan alto ($409); marketing $345 al mes; multi-sede $70 al mes por sede |
| Shopmonkey | $215–$499 | Usuarios extra, $20 al mes cada uno; marketing $349 al mes; QuickBooks en el plan medio |
| Shop-Ware | $279–$999 | Precio por sede |
| AutoLeap | $179–$449 | Marketing ~$149 al mes; mensajes desde el plan medio |

| Función | Restorify hoy | Los de pago | Valor para el taller |
|---|---|---|---|
| Recepción con fotos, video, voz y daños dibujados; subidas sin señal | ✅ fuerte | ✅ | — |
| Autorización por línea a distancia, con evidencia | ✅ | ✅ | — |
| Permisos en la base, historial, multi-sede incluido | ✅✅ | ✅ (multi-sede con costo) | — |
| Comisión por tarea, aceptación y pago | ✅✅ | reportes por técnico; la nómina va aparte | — |
| Bilingüe con traducción automática | ✅✅ | parcial | — |
| Escáner de VIN, sticker de próximo servicio con QR | ✅ | ✅ (Shopmonkey: stickers de aceite) | — |
| **Mensajes de ida y vuelta (SMS)** | ❌ (enlaces de WhatsApp/SMS a mano) | ✅ (a menudo solo en planes altos) | **Muy alto** |
| **Cobro con enlace** (text-to-pay), terminal, financiamiento | ❌ (el método se anota a mano) | ✅ (Shopmonkey: Affirm y Sunbit) | **Muy alto** |
| **Trabajos agrupados y catálogo con precio** | ❌ líneas sueltas | ✅ la base de todos | **Alto**: menos escritura en cada alta |
| **Inspección digital por puntos** (verde/amarillo/rojo) | ❌ (6 zonas + hallazgos) | ✅ el núcleo del flujo | **Alto**: convierte hallazgos en ventas |
| **Citas, reserva en línea, recordatorios** | ❌ (el sticker ya guarda el próximo servicio) | ✅ | Alto |
| **Reportes de indicadores** (ARO, número de carros, tarifa efectiva, margen, eficiencia) | panel + margen por orden | ✅ (fuerte en Tekmetric) | Alto para el dueño |
| Reloj por tarea del técnico | ❌ | ✅ | Medio |
| Reseñas de Google, campañas, trabajo diferido | ❌ (los pendientes del vehículo, solo de lectura) | ✅ add-on caro | Medio |
| Impuesto de ventas | ❌ (decisión del contador) | ✅ | Obligatorio para vender a otros |
| QuickBooks | CSV | ✅ | Medio |
| Inventario y pedido de piezas (PartsTech) | ❌ (pedido → llegó, por orden) | ✅ | Bajo para carrocería |
| IA | traducción de textos al cliente (Gemini) | casi nada propio (notas y traducción en Fullbay) | **Oportunidad** |
| App | PWA | apps | Bajo |

**Cómo leerlo.** El dinero del mercado está en tres cosas que se cobran aparte: mensajería,
cobro y marketing. Restorify ya tiene la parte difícil (el flujo de la orden, bien hecho y con
pruebas). Lo que falta se apoya en servicios externos (Twilio, Stripe) y se arma encima.

## 3. Lo que encontró la auditoría

### 3.1 Base de datos (guía de Supabase, corrida sobre el Supabase local)

**Lo que está bien:**
- **Seguridad:**
  - las 31 tablas tienen RLS;
  - ninguna función `SECURITY DEFINER` sin `search_path`;
  - sin políticas permisivas duplicadas.
- **Datos:**
  - el dinero es `numeric`;
  - sin índices duplicados.
- **Tamaño:** 170 funciones, 79 triggers, 70 políticas y 5 tareas de `pg_cron`.

**Arreglos de una migración:**

| # | Regla | Qué | Arreglo |
|---|---|---|---|
| B1 | `schema-foreign-key-indexes` | 10 claves foráneas sin índice: `orden_avances.labor_id`, `orden_hallazgos.presupuesto_id`, `orden_proximo_servicio.sede_id` y siete columnas de «quién lo hizo» | Un índice por columna. Las tres primeras se usan en uniones y borrados en cascada |
| B2 | `security-rls-performance` | 7 políticas llaman `is_admin()` fila por fila, sin `(SELECT …)`: las 4 de parqueo, `orden_proximo_servicio` y las 2 de `traducciones` | Reescribirlas con `(SELECT is_admin())`, como ya hacen las de la orden |
| B3 | Complejidad | `ordenes_trabajo` tiene 26 triggers | Cada cambio a la orden pasa por todos. No es un error, pero es lo primero que hay que medir si la base se pone lenta |

### 3.2 Frontend (guías de Vercel; Gemini auditó y Claude verificó)

**Lo que está bien:**
- las rutas se cargan diferidas, y el PDF y el escáner también;
- los cálculos están en la base;
- la versión de teléfono se renderiza una sola vez;
- los errores se traducen.

**Verificados en el código:**

| # | Severidad | Qué | Arreglo |
|---|---|---|---|
| F1 | Alta | `WorkOrders.tsx:21-29` importa directamente el detalle de la orden (1312 líneas), el alta (864) y el tablero. La página de órdenes pesa 350 kB, y el técnico lo baja todo aunque solo mire su lista | `lazy()` en los tres |
| F2 | Alta | Al abrir una orden, la estimación de comisión y las comisiones pagadas esperan a que llegue la orden, aunque ya se sabe su id (`useWorkOrderDetail.ts:231-258`) | Arrancarlas con el id. Las que dependen de la sede, juntarlas en una RPC |
| F3 | Media | Arrancan unos 215 kB comprimidos de JS. Un trozo de 216 kB (`errors`) carga los textos de los dos idiomas | Cargar solo el idioma activo |
| F4 | Media | El detalle de un cliente se pide dos veces al abrirlo por enlace (`Customers.tsx:70-93`) | Dejar solo el `useQuery` |
| F5 | Media | Botones de solo ícono sin `aria-label`: borrar y abrir en Órdenes, Clientes y Finanzas; plegar el menú | `aria-label` traducido |
| F6 | Media | En el alta, los campos del cliente nuevo solo tienen *placeholder*: sin etiqueta y sin `autoComplete` (`WorkOrderCreateModal.tsx:215-242`) | `<label>` o `aria-label`, `autoComplete="name/email/tel"`. Ayuda al alta en menos de 60 s |
| F7 | Media | Montos sin `inputMode="decimal"` (`Finance.tsx:604`) y etiquetas sin `htmlFor` (Clientes y Finanzas) | Agregarlos |
| F8 | Baja | `aria-label="Abrir menú"` sin traducir (`Header.tsx:137`) | Clave de i18n |
| F9 | Deuda | **858 estilos en línea en 63 archivos** (la regla es CSS plano), `components.css` con 6614 líneas, `translations.ts` con 3304, `WorkOrderDetail.tsx` con 1312 | Migrarlo poco a poco al tocar cada pantalla; no como proyecto aparte |

**Se descartaron dos hallazgos de Gemini:**
- `confirm()` en el portal: las reglas del proyecto lo permiten para lo destructivo;
- «320 estilos en línea»: el conteo correcto es 858.

### 3.3 Dependencias

`npm audit` encuentra 2 avisos en lo que se publica:
- `dompurify` (alto), dentro de `jspdf`;
- `brace-expansion` (bajo), dentro del plugin de Sentry.

La app no usa la parte afectada, y los dos se arreglan con `npm audit fix`.

### 3.4 Operación (lo que más frena vender)

- **Sin staging:** un push a `main` sale en vivo antes de que termine el CI.
- **Sentry está instalado pero sin DSN en Hostinger:** los errores de los usuarios no llegan a
  nadie.
- **Sin monitoreo de disponibilidad.** Si el sitio o una función se cae, nadie se entera hasta
  que llama el taller.
- **Respaldos diarios del plan Pro, sin restauración a un punto en el tiempo** y sin un ensayo de
  restauración.
- **Los administradores entran sin segundo factor (MFA),** en un sistema que maneja dinero.

## 4. El plan, por fases

Tamaño: **S** = días, **M** = 1–2 semanas, **L** = 3–4 semanas y **XL** = más de un mes, con
Gemini programando y Claude verificando.

### Fase 0 — Cimientos (sin decisiones de negocio)

| # | Qué | Tamaño |
|---|---|---|
| 0.1 | **Staging:** un segundo proyecto de Supabase y una vista previa del sitio. Hostinger publica `produccion` (como estaba diseñado) y `main` pasa por el CI | S (+$10 al mes de cómputo) |
| 0.2 | Sentry con DSN en Hostinger; monitor de disponibilidad del sitio y de las funciones | S |
| 0.3 | MFA (TOTP de Supabase) obligatorio para administradores | S |
| 0.4 | Migración `033`: B1 y B2 | S |
| 0.5 | F1–F8 y `npm audit fix` | S–M |

### Fase 1 — Lo que cobra un programa de pago (el núcleo comercial)

| # | Qué | Por qué | Tamaño |
|---|---|---|---|
| 1.1 | **Trabajos agrupados y catálogo:** un «trabajo» junta la mano de obra con sus repuestos y se autoriza completo. Un catálogo de trabajos frecuentes con precio, con un toque en el alta | Es la base de todos los comerciales. Ordena el alta, el portal, el PDF y el presupuesto. Es el cambio de estructura más valioso | XL |
| 1.2 | **Pospuesto (17/10/2026).** **Mensajes de ida y vuelta por SMS** (Twilio): una bandeja por cliente y por orden, plantillas en su idioma, recepción de respuestas, «STOP» para darse de baja | En EE. UU. casi nadie usa WhatsApp. Es lo que más cobran los de pago | L. El registro A2P 10DLC tarda días: **empezarlo ya** |
| 1.3 | **Cobro con enlace** (Stripe): el cliente paga el saldo desde su enlace o desde un SMS. Un webhook asienta el pago con su método por una RPC (como `entregar_orden`). Más adelante, terminal y financiamiento | Cobrar antes de entregar, sin que el cliente espere en el mostrador | L |
| 1.4 | **Inspección por puntos:** plantillas de puntos, verde/amarillo/rojo, foto por punto. Lo «rojo» o «amarillo» pasa a un trabajo cotizable, y lo que el cliente no autoriza queda como trabajo diferido del vehículo | Convierte hallazgos en ventas, y en ventas futuras | L |
| 1.5 | **Impuesto de ventas** por sede (Maryland: 6 % a repuestos), cuando lo decida el contador | Obligatorio para vender a otros talleres | M |

### Fase 2 — Traer y retener clientes

| # | Qué | Tamaño |
|---|---|---|
| 2.1 | **Citas:** agenda por día y por técnico, una página pública de reserva por sede y un recordatorio por SMS un día antes. La cita se vuelve orden con un toque, con el alta ya llena | L |
| 2.2 | **Recordatorios automáticos:** el próximo servicio del sticker manda un SMS cuando llega la fecha. Además, petición de reseña en Google al entregar y campaña de trabajo diferido | M |
| 2.3 | **Cuentas de flota:** varias unidades, factura mensual y crédito | M |

### Fase 3 — Los números del dueño

| # | Qué | Tamaño |
|---|---|---|
| 3.1 | **Horas por trabajo y tarifa por hora;** matriz de margen de repuestos por rango de costo | M |
| 3.2 | **Reloj por tarea** (iniciar/pausar con un toque del técnico) | M |
| 3.3 | **Indicadores,** en una RPC como todo lo de dinero: ARO, número de carros, tarifa efectiva, margen de mano de obra y de repuestos, horas por orden, eficiencia y productividad por técnico, aprobación de presupuestos y días en el taller | L |
| 3.4 | **Tablero por etapas** configurable (carrocería: desarme, carrocería, preparación, pintura, armado, detallado y control de calidad) | M |
| 3.5 | QuickBooks Online y, después, inventario ligero e integración de piezas | L |

### Fase 4 — La plataforma para venderlo (fuera de alcance: decisión del 17/10/2026)

| # | Qué | Tamaño |
|---|---|---|
| 4.1 | **Separar talleres** (ver la decisión D2) | L–XL |
| 4.2 | **Alta sola:** registro, prueba de 14 días y un asistente (sede, logo y color, teléfonos, tarifas, impuesto, empleados). Importación CSV de clientes y vehículos desde otro sistema | L |
| 4.3 | **Suscripción con Stripe Billing:** planes por sede, usuarios y SMS incluidos; portal de facturación; aviso y bloqueo suave por impago | L |
| 4.4 | **Módulos por plan:** generalizar el patrón del parqueo (`habilitado` por sede) | M |
| 4.5 | **Dominio y marca por taller** ([marca-por-dominio.md](marca-por-dominio.md)) y una consola de soporte (ver talleres, uso y entrar como un taller dejando rastro) | M |
| 4.6 | **Papeles:** términos de servicio, acuerdo de datos y consentimiento de SMS | S, con un abogado |

### IA: el diferenciador (en todas las fases; Gemini ya está integrado)

Los grandes casi no traen IA propia en 2026; la venden socios. Restorify puede traerla incluida:

- la nota de voz del técnico pasa a texto limpio, en el idioma del cliente (las notas de voz ya
  existen);
- un resumen de la inspección para el cliente, en su idioma;
- sugerir trabajos y precio a partir de la queja del cliente, con el catálogo de la 1.1;
- un borrador de respuesta a los mensajes de la 1.2.

## 5. Cómo se ejecuta

Igual que la adopción:
- Claude escribe las tareas de cada bloque (`docs/tareas-para-gemini-saas.md`);
- Gemini las programa en una copia aislada;
- Claude corre lint, `tsc`, Vitest, build, `test:db` y capturas, corrige, y pasa todo al
  repositorio.

**Nada se publica sin que la persona responsable lo pida.**

Skills instaladas el 17/10/2026, a nivel de usuario: `~/.claude/skills` y `~/.agents/skills`
(Gemini). No quedan en el repositorio:

| Skill | Fuente | Para qué |
|---|---|---|
| `supabase`, `supabase-postgres-best-practices` | Supabase | Migraciones, RLS, índices, revisión de la base |
| `vercel-react-best-practices`, `vercel-composition-patterns`, `web-design-guidelines` | Vercel | Rendimiento, componentes, revisión de interfaz |
| `frontend-design`, `webapp-testing` | Anthropic | Pantallas nuevas (citas, inspección); probar la app con Playwright |
| `differential-review`, `sharp-edges`, `supply-chain-risk-auditor` | Trail of Bits | Revisión de seguridad de cada cambio, diseños propensos a errores, dependencias |

Las del proyecto siguen igual: `/ux-taller`, `/nueva-migracion` y `/auditoria-adopcion`.

## 6. Decisiones pendientes

| # | Decisión | Opciones | Recomendación |
|---|---|---|---|
| D1 | **¿Para quién es?** | (a) Restorify y sus sedes, al nivel de un programa de pago; (b) venderlo a otros talleres | **Decidido: (a)** (17/10/2026) |
| D2 | **No aplica** con D1 = (a). **Cómo separar talleres** | **Un proyecto por taller:** aislamiento total sin tocar las 70 políticas. ~$10 al mes de cómputo por taller y un script que lleve las migraciones a todos. **Una base para todos** (`organizaciones` sobre `sedes`): más barata a escala, pero reescribe RLS y 170 funciones | Un proyecto por taller para los primeros 10–20; mudarse a una base compartida si se crece más |
| D3 | **Cuentas externas.** El SMS se pospone; Stripe hace falta para la 1.3 | Twilio (SMS: registro A2P 10DLC de $46 + $15 por campaña + ~$10 al mes, más el costo por mensaje). Stripe (2.9 % + 30 ¢ en línea; 2.7 % + 5 ¢ con terminal) | Abrir las dos ya: el registro de SMS tarda |
| D4 | **Impuesto** | Lo decide el contador (sigue abierta desde el 05/10) | — |
| D5 | **Staging** | Segundo proyecto de Supabase + Hostinger publicando `produccion` | Sí, antes de la fase 1 |

**Orden decidido** (17/10/2026: solo Restorify y sin SMS):
1. La fase 0. Lo que es de código lo hacen Gemini y Claude; el staging, el DSN de Sentry y el
   monitor son configuración de cuentas que hace la persona responsable.
2. La 1.1, trabajos y catálogo.
3. La 1.4, inspección por puntos.
4. La fase 3 (horas, reloj, indicadores y tablero por etapas).
5. La 2.1 y la 2.2: citas y recordatorios por correo y por el enlace de WhatsApp de siempre.

Quedan esperando:
- la 1.3, cuando haya cuenta de Stripe;
- la 1.5, cuando decida el contador;
- la 1.2, el SMS, cuando se decida.

## Fuentes

- [Shopmonkey: comparativa 2026 con precios y funciones por plan](https://www.shopmonkey.io/blog/best-auto-repair-shop-management-software-2026-top-picks-compared)
  (lo publica uno de los competidores; los precios se cruzaron con las demás fuentes)
- [Eligant: comparativa de 12 programas 2026](https://www.eligantauto.com/en/resources/blog/best-auto-repair-shop-software-2026-comparison)
- [WickedFile: los 5 mejores 2026](https://www.wickedfile.com/blogs/5-best-auto-repair-software-tools/)
  · [IA en talleres 2026](https://www.wickedfile.com/blogs/how-can-auto-repair-shops-use-ai-in-2026/)
- [Autograff: programas de taller con IA](https://autograff.ai/blog/best-ai-auto-repair-shop-software)
- [Tekmetric: integraciones](https://tours.tekmetric.com/answers/integrations-tekmetric)
  · [los números que importan](https://www.tekmetric.com/post/the-numbers-that-drive-auto-repair-shop-performance)
- [AutoLeap: indicadores de un taller](https://autoleap.com/blog/top-kpi-track-auto-repair-shop/)
- [Supabase: precios 2026](https://www.jetadmin.io/blog/supabase-pricing-2026-guide-to-plans-limits-and-real-world-costs/)
- [Twilio: registro A2P 10DLC](https://www.twilio.com/docs/trust-hub/registrations/a2p-10dlc-campaign)
  · [costos](https://support.twilio.com/hc/en-us/articles/1260803965530)
- [Stripe: comisiones 2026](https://flexprice.io/blog/stripe-pricing-breakdown-2026)
- Skills: [supabase/agent-skills](https://github.com/supabase/agent-skills)
  · [vercel-labs/agent-skills](https://github.com/vercel-labs/agent-skills)
  · [anthropics/skills](https://github.com/anthropics/skills)
  · [trailofbits/skills](https://github.com/trailofbits/skills)
