# Comparativa con programas comerciales e interfaz (11/10/2026)

Tres preguntas: **¿cómo se compara Restorify con los programas comerciales de talleres?**,
**¿el orden en que la app muestra las cosas ayuda o confunde, en el teléfono y en la
computadora?** y **¿el proyecto está ordenado para crecer?**

Fuentes: la documentación y el código vigentes; 33 capturas de la app (escritorio 1440×900 y
teléfono 390×844, como administración y como mecánico) contra el Supabase **local** con cuatro
órdenes de prueba en estados distintos (los datos se borraron después y `test:db` volvió a pasar
811/811); y los sitios, precios y reseñas de los programas comerciales (fuentes al final).

**Veredicto corto.**

1. En **control y confianza** Restorify ya está a la altura de los grandes y por encima de
   TallerAlpha: permisos que impone la base, comisión por tarea, autorización por línea con
   evidencia (Maryland §14-1006), historial de cambios, enlace del cliente con fotos y videos,
   dos idiomas.
2. Le falta lo que los comerciales usan para **traer y cobrar clientes**: citas, mensajes de ida
   y vuelta, cobro integrado, catálogo de trabajos, impuesto, inventario y recordatorios.
3. La interfaz **no está rota, pero satura**: está ordenada por *tipo de dato* (vehículo, firma,
   mano de obra, repuestos, presupuesto…) y no por *lo que hay que hacer ahora*. Se nota sobre
   todo en el teléfono.
4. El código está en capas limpias, pero el módulo de órdenes concentra casi todo, y la
   documentación pasa de 16 000 líneas.

---

## 1. Dónde está el proyecto

Hechas: las seis fases del cliente, la auditoría, F0–F7 de la reunión del 03/10, los pedidos del
05/10 y del 06/10, teléfonos por sede, seguro y parqueo. 82 migraciones, 33 archivos pgTAP (811
aserciones), 165 funciones SQL, 6 edge functions. Según
[bitacora.md](../bitacora.md#estado) faltan por publicar `023`, `026`,
`027` y `028`. Decisiones abiertas del taller: pago a empleados, texto legal e impuesto.

## 2. Comparación con los programas comerciales

Comparados: **TallerAlpha** (latinoamericano, el enlace que mandó el usuario) y los más usados en
EE. UU.: **Tekmetric**, **Shopmonkey**, **Shop-Ware** y **AutoLeap**. Para carrocería, **CCC ONE**
y **ROME**.

| Función | Restorify | TallerAlpha ($50–99/mes) | Comerciales EE. UU. ($179–999/mes) |
|---|---|---|---|
| Recepción con fotos, video y voz; subidas que sobreviven sin señal | ✅ fuerte | ✅ fotos | ✅ |
| Autorización a distancia por línea, verbal o por enlace, con evidencia | ✅ | ✅ | ✅ (Tekmetric: en pantalla, verbal, SMS/correo o impresa) |
| Permisos por rol en la base, historial, multi-sede incluido | ✅✅ | básico | ✅ (multi-sede con costo por sede: $70–99/mes) |
| Comisión por tarea, aceptación y pago con egreso | ✅✅ | nómina / RR. HH. | reportes por técnico; la nómina va aparte (ADP, etc.) |
| Bilingüe y traducción para el cliente | ✅✅ | español | parcial (Shopmonkey: inglés, francés, español) |
| Trabajo adicional del técnico → pausa → autorización | ✅ | — | ✅ |
| **Trabajos agrupados** (mano de obra + sus repuestos, autorizados como uno) | ❌ líneas sueltas | — | ✅ es la base de todos ("jobs") |
| **Catálogo de trabajos frecuentes** con precio (canned jobs) | ❌ (candidato desde el 05/10) | — | ✅ |
| **Inspección digital por puntos** (verde/amarillo/rojo por sistema) | ❌ (6 zonas fijas + hallazgos) | parcial | ✅ (núcleo del flujo) |
| **Citas y recordatorios** | ❌ | ✅ (agenda, recordatorios, cita → orden) | ✅ |
| **Mensajes de ida y vuelta** (SMS / WhatsApp) | ❌ (correo y enlace de WhatsApp a mano) | ✅ WhatsApp | ✅ (a menudo solo en planes altos) |
| **Cobro integrado** (text-to-pay, terminal) | ❌ (el método se anota a mano) | punto de venta | ✅ |
| **Impuesto de ventas** (6 % a repuestos en Maryland) | ❌ (decidido no por ahora) | ✅ factura electrónica | ✅ |
| Inventario y pedido de repuestos integrado | ❌ (solo pedido / llegó por orden) | ✅ (código de barras, mínimos) | ✅ (PartsTech, NexPart) |
| Contabilidad | CSV | — | QuickBooks |
| Recordatorios de mantenimiento, reseñas, campañas | ❌ | seguimiento por WhatsApp | ✅ (fuerte en AutoLeap) |
| Reportes | panel + margen por orden | 30+ | ✅ (fuerte en Tekmetric) |
| Reloj / tiempo por técnico | ❌ | — | ✅ (Shopmonkey) |
| Carrocería: etapas de producción, aseguradoras | parqueo ✅; seguro solo como marca | módulo de carrocería y pintura | ROME / CCC: importan estimados de CCC, Mitchell, Audatex |
| App | PWA | iOS / Android | apps |

**Cómo leerlo.** No conviene perseguirlo todo. Lo que ahorra tiempo cada día o trae dinero, en
orden: (1) **trabajos agrupados y catálogo** — menos escritura en cada alta; (2) **impuesto y cobro
con enlace**; (3) **mensajes de ida y vuelta, recordatorios y citas**; (4) **inspección por
puntos**, que convierte hallazgos en ventas. El inventario va al final: un taller de carrocería
pide las piezas por orden.

Un dato a favor: en las reseñas de Tekmetric la queja más repetida es "demasiados clics" y una
interfaz recargada. Ser simple es una ventaja competitiva real; los cambios de la sección 3 van
en esa dirección.

## 3. ¿El orden de la interfaz confunde o satura?

Regla propuesta: **cada pantalla de la orden contesta primero "¿qué sigue?"** y después muestra
los datos. Hoy contesta "¿qué datos hay?".

### Detalle de la orden (lo más importante)

1. **"Resumen" no resume.** Abre con cuatro botones, el bloque "Autorización del cliente" y tres
   secciones cerradas (Vehículo, Firma, Técnico). Lo que administración necesita de un vistazo —
   teléfono del cliente, fecha prometida, total y saldo, técnicos, qué falta — está en otras
   pestañas o cerrado. *Propuesta:* una ficha fija (cliente con llamar / WhatsApp, placa, fecha
   prometida, técnicos, total y saldo) y un solo recuadro **"Siguiente paso"** con su botón:
   firmar, cotizar, enviar presupuesto, marcar listo, entregar y cobrar. Shopmonkey usa un panel
   así, con los datos fijos al lado de las pestañas.
2. **Tres avisos que se contradicen en una orden en pausa** (ORD-003 de la prueba). Arriba: *"Orden
   en pausa: esperando autorización del cliente"* (`workOrders.authorizationBanner`), cuando al
   cliente todavía no se le pidió nada: falta que la oficina cotice. Debajo, en verde, "El cliente
   respondió el presupuesto 1" (el presupuesto viejo). Y la acción real, "Cotizar al cliente", va
   en tercer lugar. *Propuesta:* un solo bloque con el paso que toca y el texto según la etapa
   ("la oficina tiene que cotizar" / "esperando la respuesta del cliente").
3. **Estado como selector libre y barra de avance en el encabezado.** Los comerciales usan
   botones por etapa ("Iniciar", "Marcar listo", "Entregar y cobrar"). El avance ya lo calcula la
   base con las tareas (`trg_labor_avance`): basta una barra delgada de solo lectura con "corregir".
   Para el técnico el selector casi siempre está deshabilitado y ocupa el primer tercio de la
   pantalla.
4. **En el teléfono: doce secciones plegables en una columna** (Vehículo, Firma, Técnico, Mano de
   obra, Repuestos, Presupuesto, Reparto, Inspección, Avance, Totales, Enlace, Historial), y el
   encabezado (PDF, idioma, Enviar reporte, Retirada sin reparar, estado, avance) llena la primera
   pantalla. *Propuesta:* pestañas deslizables también en el teléfono, lo secundario (PDF, idioma,
   retirada, archivar, borrar) en un menú "⋯", y una barra fija abajo con el siguiente paso.
5. **Mano de obra y repuestos van separados.** En el enlace, el cliente ve una lista plana de
   casillas (`QuoteSection` en `portal/CustomerPortal.tsx`) y puede autorizar "Cambio de frenos" y
   rechazar "Pastillas de freno". En los comerciales se autoriza el trabajo completo, con su
   total. Es un cambio de modelo (un "trabajo" que agrupa líneas), pero es la mejora de estructura
   más valiosa: ordena la pantalla de administración, el enlace, el PDF y el catálogo.
6. **Para el técnico, "Tareas" (lo suyo) entra cerrada**, y el botón rápido "Mis tareas" repite lo
   mismo justo encima. Debería abrir desplegada.
7. **Error:** el encabezado muestra `mecanica` / `combinado` sin traducir
   (`features/workOrders/WorkOrderDetail.tsx`, la insignia de `order.tipo_trabajo`); la lista sí
   usa `typeLabels`.

### Panel y listas

8. **El panel del administrador repite.** "Requiere atención" está bien y va arriba, pero debajo
   "Alertas" vuelve a mostrar las mismas órdenes y "Órdenes recientes" repite la lista. En el
   teléfono son unas cuatro pantallas: cada orden reciente es una tabla convertida en tarjeta, con
   ocho renglones "etiqueta: valor". *Propuesta:* Requiere atención + cuatro indicadores en 2×2 +
   "Hoy" (entregas del día); la gráfica de ingresos, a Finanzas.
9. **Lista de órdenes:** el número se parte en tres renglones; las fechas salen `2026-10-13` en un
   taller de EE. UU. con clientes en inglés; hay una **papelera roja en cada fila**, en escritorio
   y en teléfono, al lado de "ver" — borrar es raro y destructivo, va en el "⋯" de la orden.
   Faltan columnas que sí sirven: técnico, saldo, días en el taller. El aviso "Trabajo adicional
   por revisar" se repite en el panel, la lista y el tablero.

### Navegación y configuración

10. **El menú pone Clientes y Vehículos antes de Órdenes**, que es el centro del sistema.
    *Propuesta:* Panel → Órdenes → Clientes (con sus vehículos dentro, como Shopmonkey). En la
    barra inferior del administrador, cambiar "Vehículos" por un botón central **"+ Nueva orden"**,
    la acción más frecuente en el mostrador.
11. **Configuración es una sola página larga** que mezcla lo personal (perfil, idioma, tema, push)
    con lo del negocio (correos, el parqueo —enorme—, sedes con teléfonos, color, capacidad y
    porcentaje). El idioma aparece en tres lugares (inicio de sesión, encabezado y Configuración) y
    el porcentaje de comisión en dos (sede y empleado). *Propuesta:* subsecciones Mi cuenta /
    Taller y sedes / Cobros (parqueo, impuesto, métodos) / Comunicación (correos, plantillas).

### Enlace del cliente

El orden ya es bueno: estado → repuestos que se esperan → presupuesto por autorizar (resaltado) →
avances → observaciones → recepción → cuenta → contacto. Solo subiría los botones de contacto a
una barra fija y mostraría el saldo arriba cuando la orden esté lista.

## 4. Modularidad y orden del proyecto

**Bien:** capas claras (`pages`, `features`, `services`, `lib`, `types`), el dinero en la base y
una red de pruebas amplia.

**Lo que frena crecer:**

- **`features/workOrders` tiene 48 archivos sueltos**; `WorkOrderDetail.tsx` (1148 líneas) y
  `useWorkOrderDetail.ts` (1050) cargan casi toda la orden. *Propuesta:* submódulos con su
  `index.ts` como entrada pública: `alta`, `detalle`, `trabajos`, `presupuestos`, `hallazgos`,
  `entrega` (con retiro y anticipos), `enlace`.
- **763 estilos en línea en 56 archivos**, aunque la regla es CSS plano.
- **`i18n/translations.ts` tiene 3042 líneas**; se puede partir por espacio de nombres (las claves
  ya están agrupadas así).
- **En la base, cada función se reescribe entera en cada migración** (`create_work_order` va por
  su séptima versión) y `ordenes_trabajo` tiene 20 triggers. Vale la pena evaluar los esquemas
  declarativos de Supabase (`supabase/schemas` + `db diff`): cada función vive en un archivo y la
  migración se genera.
- **Módulos que se encienden por sede.** El parqueo ya funciona así (`habilitado`); llevar el
  patrón a seguro, comisiones y portal facilita un segundo taller
  ([marca-por-dominio.md](../marca-por-dominio.md)).
- **Documentación.** `ai-context.md` dice ser "corto a propósito" y tiene 5355 palabras; la
  bitácora de `plan-mejoras-2026-10.md` va en 1272 líneas; `historico/` mezcla documentos vivos
  (plan de pruebas, plan de mejoras) con historia. El orden de la documentación empezó el mismo
  11/10/2026: ver la [bitácora](../bitacora.md#bitácora-de-traspaso-entre-agentes).
- **Sin staging**, cada push a `main` sale en vivo: es lo que más limita crecer con seguridad.

## 5. Por dónde empezar

| Plazo | Qué |
|---|---|
| Días | Traducir el tipo de trabajo del encabezado. Papelera al "⋯". Fechas legibles y número de orden en un renglón. Un solo "Siguiente paso" en vez de tres avisos. Quitar del panel lo repetido. "Tareas" abierta para el técnico. Configuración por secciones |
| Semanas | Resumen como ficha con barra de acción fija en el teléfono. Catálogo de trabajos frecuentes. Impuesto y cobro con enlace, cuando decida el contador |
| Meses | Trabajos agrupados (autorización por trabajo). Mensajes de ida y vuelta, citas y recordatorios. Etapas de carrocería (desarme, carrocería, preparación, pintura, armado, detallado, control de calidad). Partir el módulo de órdenes |

## Fuentes

- [TallerAlpha (demo)](https://demo.talleralpha.com/demo/demoHome)
- [Shopmonkey: comparativa 2026](https://www.shopmonkey.io/blog/best-auto-repair-shop-management-software-2026-top-picks-compared)
- [Tekmetric: precios](https://www.tekmetric.com/pricing) · [canned jobs](https://support.tekmetric.com/hc/en-us/articles/360038144013-Create-Canned-Job-within-RO) · [Smart Jobs](https://tekmetric.com/feature/smart-jobs) · [reseñas en Capterra](https://capterra.com/p/190952/Tekmetric/reviews/?page=2)
- [Shop-Ware: TechApp](https://shop-ware.com/features/techapp/) · [flujo digital](https://shop-ware.com/features/digital-workflow/)
- [AutoLeap en Capterra](https://capterra.com/p/216500/Autoleap/reviews/)
- [Shopmonkey en Software Advice](https://www.softwareadvice.com/auto-repair/shopmonkey-profile/)
- [CCC ONE en GetApp](https://www.getapp.com/retail-consumer-services-software/a/ccc-one-total-repair-platform/) · [ROME en Capterra](https://www.capterra.com/p/83660/Rome-Management-Software/reviews/)
- [Etapas de carrocería (Car-O-Liner)](https://car-o-liner.com/en-us/auto-body-shop-repair-process/)
- [Programas de taller en Latinoamérica (Comparasoftware)](https://www.comparasoftware.com/balance-garage)
- [Fiscalía de Maryland: reparación de autos](https://www.marylandattorneygeneral.gov/CPD%20Documents/Tips-Publications/77.pdf)
