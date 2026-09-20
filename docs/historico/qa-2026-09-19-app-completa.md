# QA de la aplicación completa — 2026-09-19

- Entorno: **https://reinventa.shop** (el sitio publicado) · Supabase `lendsiqkxhvbxxkaadrt`
- Base: 43 migraciones aplicadas · Ejecutó: agente de IA, navegador real + comprobación en base
- Alcance: el flujo completo del taller de punta a punta, con las cuatro funciones nuevas

Método: cada paso se hizo **en la interfaz publicada** con un navegador real (escritorio
1280×800 y teléfono 390×844), con capturas revisadas a ojo, y **cada resultado se verificó
además contra la base de datos**. Una pantalla que "se ve bien" no cuenta como aprobada.

---

## Resultado

**Todo el flujo funciona.** Se encontraron 6 defectos, **5 corregidos** en esta sesión y 1
anotado. Ninguno de los corregidos afectaba al dinero ni a los permisos.

| Suite automatizada | Resultado |
|---|---|
| Unitarias | 352/352 |
| Seguridad de la API | 59 PASS · 0 FAIL |
| Migraciones | 43, base al día |

---

## El flujo, paso a paso

Orden **ORD-2026-007**, creada y llevada hasta la entrega:

| Paso | Qué se comprobó | Resultado |
|---|---|---|
| Crear orden | 2 técnicos, millas, fecha, mano de obra y repuesto desde el diálogo | Creada en recepción, avance 0, sin firma, líneas en `borrador` |
| Depósito | +$200 "Depósito inicial" al crear | Asentado. Coincide con `reglas-de-negocio.md:102` (el plan de pruebas lo redacta junto a la firma, pero la regla dice al crear) |
| Antes de firmar | Las líneas dicen "Sin autorizar" y el total es $0 | Correcto (ORD-12) |
| Firmar | La firma aprueba lo cotizado, sin recargar | Líneas a `aprobado`, total $1,200, enlace del cliente creado |
| Correo de recepción | Sale al firmar, sin los 2 minutos viejos | Programado a **29 s** (piso por no haber fotos) y después **enviado** |
| Técnico pide autorización | Diálogo que exige el motivo | Vacío → error dentro del diálogo; con motivo → estado y motivo guardados |
| Aviso al admin | Con el texto del mecánico | `autorizacion_solicitada` con el motivo en el cuerpo |
| Banner | El admin lee el motivo antes de cotizar | Visible con el texto |
| Cotizar y enviar | Línea nueva en `borrador` → `pendiente` | El total **no** se movió hasta autorizar |
| Cliente autoriza | Desde su enlace, sin cuenta | Líneas a `aprobado`, total $1,650 |
| **Vuelta automática** | La orden sale sola de "espera de autorización" | `en_proceso`, motivo limpiado |
| Avisos al autorizar | Admin **y** los dos técnicos | Los tres recibieron el suyo |
| Cliente rechaza | En otra orden, presupuesto aparte | **Solo el admin**. Verificado por marca de tiempo |
| Tachar trabajo | El mecánico marca una línea aprobada | Contador 0/2 → 1/2, con quién y cuándo en la base |
| Publicar avance | El ojo abre el diálogo con el texto | El cliente lo ve con fecha y texto, **sin el nombre del técnico** |
| Entregar | Dinero y comisiones | +$1,450 "Pago final", −$200 "Costo de repuestos", 2 × $326.25 |

La comisión cuadra exacta: $1,450 × 45 % ÷ 2 = $326.25 (el porcentaje de la sede es 45 %).

**Lo que el cliente NO ve**, comprobado en el portal: ningún nombre de técnico, ni el motivo
interno que escribió el mecánico, ni notas internas.

---

## Defectos encontrados

### Corregidos en esta sesión

1. **El aviso del formulario de avances mentía.** Seguía diciendo "lo que subas aquí es
   interno hasta que administración lo publique", que dejó de ser cierto cuando el técnico
   pasó a poder publicar. Reescrito, y la prueba que lo fijaba también.
2. **El selector ofrecía "Recepción" a un técnico.** La base lo rechaza con 42501, así que
   elegirlo solo servía para llevarse un error. Ahora se filtra igual que "Entregado", en el
   detalle y en el Kanban.
3. **"0 resultados" en la pestaña Archivadas.** El conteo venía de la lista activa y habría
   dicho 0 aunque hubiera cincuenta archivadas. Se oculta en ese modo.
4. **El tipo de trabajo salía crudo.** La lista y el detalle mostraban `mecanica` en
   minúscula y sin tilde, mientras el Kanban sí traducía. Ahora pasa por i18n, como manda la
   regla del proyecto.
5. **El vacío de avances del portal hablaba solo de fotos y videos.** Ahora también puede
   haber texto.

### Anotado, sin corregir

6. **El dinero se formatea de dos maneras.** `$1200.00` en las tarjetas de la orden y
   `$1,650` en la lista. Es cosmético y está repartido por varias pantallas, así que conviene
   unificarlo aparte y no en medio de una tanda de QA.

### Nota de accesibilidad

Los botones "Agregar" de mano de obra y repuestos viven **dentro de un `<label>`**, así que
su nombre accesible arrastra el texto de la etiqueta y `getByRole('button', {name:'Agregar'})`
no los encuentra. Funcionan con ratón y teclado; es un detalle de lectura por voz.

---

## Dos falsos positivos, y lo que enseñan

Vale dejarlos escritos porque el próximo que pruebe se va a tropezar igual:

1. **"El botón Agregar de mano de obra no hace nada."** Era mentira: el selector por rol
   resolvía a la zona de fotos ("Agregar foto"), no al botón de la tarjeta. El botón funciona.
   Los botones de esas dos tarjetas hay que buscarlos por su `<label>`, no por su nombre.
2. **"El cliente no puede autorizar."** También mentira: hay un `confirm()` antes de enviar, y
   un navegador automatizado **descarta los diálogos por omisión**, así que la función salía
   sin llamar a la red. Con el diálogo aceptado funciona.

Y una tercera, distinta: **los avisos son por persona y la RLS los esconde.** Consultando como
admin parecía que los técnicos no habían recibido nada; con la sesión de cada uno estaban ahí.
Para comprobar un aviso hay que preguntar con la sesión de quien lo recibe.

---

## Lo que no se pudo probar

Son los casos **H** del plan, que necesitan una persona o un aparato:

- Grabar video y nota de voz (cámara y micrófono reales).
- Notificaciones push en un teléfono.
- Safari en un iPhone de verdad: la matriz se corrió en Chromium, con el viewport de teléfono.
- Que el correo **se vea bien** en una bandeja real. Sí se comprobó que sale y que queda en
  `enviado`.

---

## Pendiente

**Hay que volver a subir el `dist/`**: las cinco correcciones de arriba son de frontend y el
sitio publicado todavía no las tiene. La base no cambió durante el QA.

Quedan en el proyecto los datos de prueba (`PRUEBA`, `ORD-2026-003` a `007`). Se dejaron a
propósito para poder mirar las funciones nuevas con datos reales; bórralos cuando ya no
sirvan.
