# Plan: privacidad, texto de la firma y protección legal

> Pedido del 04/10/2026. Minuta: *"Políticas de privacidad y texto de firma. Se acordó revisar
> la incorporación de políticas de privacidad, manejo de datos y el texto legal específico para
> la autorización mediante firma."* **El taller está en Maryland** (confirmado por el usuario el
> 04/10/2026).
>
> **Esto no es asesoría legal.** Es el plan de qué documentos hacen falta, qué deben cubrir y
> cómo los pone la plataforma en práctica. **Los textos finales los revisa y aprueba un abogado
> con licencia en Maryland** antes de mostrarlos a un cliente (fase L2). Nada de este plan se
> publica sin esa revisión.

## Estado

| Fase | Qué | Estado |
|---|---|---|
| L0 | Decisiones del taller (preguntas de la §3) | Pendiente (taller) |
| L1 | Borradores de los documentos | Pendiente |
| L2 | Revisión del abogado | Pendiente (taller y abogado) |
| L3 | Documentos versionados en la base y páginas públicas | Pendiente |
| L4 | Texto, casillas y constancia en la firma de recepción | Pendiente |
| L5 | Presupuesto y factura como los pide Maryland; firma de entrega; piezas reemplazadas | Pendiente |
| L6 | Términos al autorizar un presupuesto (portal y por teléfono) | Pendiente |
| L7 | Consentimientos del cliente y sus derechos (exportar, anonimizar, retención) | Pendiente |
| L8 | Personal y seguridad (grabaciones, política interna, MFA, incidentes, proveedores) | Pendiente |

---

## 1. Qué buscamos

1. Que el cliente sepa **por qué firma**: la firma de recepción hoy solo dice "El cliente firma
   con el dedo sobre el recuadro para dar su conformidad" (`workOrders.signatureHint`). No dice
   qué acepta, y eso es lo primero que discutiría un abogado del cliente.
2. **Cumplir la ley de talleres de Maryland** (Commercial Law §§14-1001 a 14-1007), que pide
   avisos con texto fijo en el presupuesto y en la factura, la firma de la factura, una copia para
   el cliente y ofrecerle las piezas reemplazadas. Hoy la app no lo cubre del todo (§4.2).
3. Que el uso de **fotos, videos, grabaciones y datos** esté dicho por escrito, aceptado y se
   cumpla. En Maryland grabar una conversación sin el permiso de todos es un delito grave.
4. Que el taller pueda **demostrar** después qué texto aceptó el cliente, cuándo y cómo.
5. No prometer lo que no se cumple: ante la FTC (y la ley del consumidor de Maryland), una
   política que no se sigue es una práctica engañosa.

**Lo que este plan no hace:** quitarle al cliente derechos que la ley no deja quitar. Desde el
**1 de octubre de 2026**, en Maryland un contrato de consumo **no puede renunciar, limitar ni
negar los remedios** que dan las leyes federales o estatales (HB 103 de 2026, cap. 308): una
cláusula así no vale y el tribunal aplica el resto del contrato. Por eso el texto no dice "no
somos responsables de nada": usa la frase que **exige** la ley de talleres (el taller *puede* no
responder por daños en ciertos casos, y el cliente puede preguntar hasta dónde llega su
responsabilidad y su seguro). Lo que de verdad protege es el acuerdo claro, la evidencia (fotos
360, firma con su texto, presupuesto autorizado, historial) y un seguro de garaje
(*garagekeepers*).

## 2. Supuestos

- El taller opera en **Maryland**. Si se abre una sede en otro estado (Virginia, DC,
  Pensilvania…), la §4 se revisa para ese estado.
- Clientes: personas y pequeños negocios; casi todos de Maryland.
- Pequeña empresa, muy lejos de los umbrales de la ley de privacidad de Maryland (§4.1).
- No se venden ni se ceden datos, y no hay publicidad dirigida ni rastreo.

## 3. Lo que tiene que decidir el taller (L0)

Sin estas respuestas no se pueden escribir los textos.

| # | Pregunta | Por qué importa |
|---|---|---|
| 1 | Razón social exacta, dirección, teléfono y un correo para temas de privacidad | Van en todos los documentos |
| 2 | ¿Qué cubre su seguro mientras el auto está en el taller? ¿Tienen seguro de garaje? | La ley obliga a invitar al cliente a preguntar por la responsabilidad y el seguro del taller: hay que saber qué contestar |
| 3 | ¿Cobran por hacer el presupuesto o el diagnóstico? ¿Cuánto? | En Maryland se puede cobrar un cargo razonable **solo si se avisa antes** de hacerlo |
| 4 | ¿Usan piezas usadas, reconstruidas o reacondicionadas? | La factura tiene que decirlo pieza por pieza |
| 5 | ¿Cobran almacenaje si el auto no se recoge? ¿Cuánto y desde cuándo? | Cláusula de almacenaje; el gravamen del taller tiene reglas propias (§4.1) |
| 6 | ¿Hacen pruebas de manejo? | Cláusula de autorización para manejar el auto |
| 7 | Depósito: ¿se devuelve si el cliente no autoriza el trabajo? | Cláusula de pagos |
| 8 | ¿Garantía de la mano de obra? ¿Cuánto tiempo? | Cláusula de garantía |
| 9 | ¿Cuánto tiempo guardar fotos, videos, firmas y órdenes? (sugerencia: 4 años desde la entrega) | En Maryland el plazo general para reclamar un contrato es de **3 años** (Cts. & Jud. Proc. §5-101); 4 años deja margen. Confirmarlo con el abogado |
| 10 | ¿Los videos del auto se graban con sonido? | Con sonido se puede grabar una conversación con el cliente: en Maryland hace falta el permiso de todos. Opciones: video sin sonido por defecto, o un aviso y consentimiento en la firma |
| 11 | ¿Quién firma si deja el auto otra persona (familiar, empleado de una empresa)? | Campo "nombre de quien firma" y su relación con el dueño |
| 12 | ¿Usarán fotos de los autos en redes o publicidad? | Si sí, un consentimiento **aparte y opcional**, sin placas ni datos personales |
| 13 | ¿Mandarán mensajes automáticos o de promoción por SMS o WhatsApp? (hoy no: el personal abre WhatsApp a mano) | Si sí, aplican la TCPA y la ley de Maryland de llamadas y mensajes (*Stop the Spam Calls Act*): consentimiento escrito previo |
| 14 | ¿Le toman foto al cheque completo cuando el cliente paga con cheque? | La foto muestra nombre y número de cuenta: para Maryland eso es "información personal" protegida (§4.1) |
| 15 | Abogado que revisará (L2) | Sin revisión no se publica |

## 4. Marco legal (resumen para orientar al abogado)

### 4.1 Leyes que aplican

| Tema | Qué dice | Qué implica para nosotros |
|---|---|---|
| **Talleres** — Md. Commercial Law §§14-1001 a 14-1007 | **Presupuesto escrito**, si el cliente lo pide, antes de un trabajo de más de $50: fecha estimada, precio de mano de obra y piezas, cargo adicional si lo hay, y el **aviso de responsabilidad** (abajo). Cobrar el presupuesto solo si se avisó antes. **No cobrar más del 10 %** sobre el presupuesto sin consentimiento. **Nada que el cliente no haya autorizado**; lo adicional, con permiso escrito u oral. **Factura** con todo el trabajo (también el de garantía) y todas las piezas, diciendo cuáles son usadas, reconstruidas o reacondicionadas, el aviso de responsabilidad y el aviso de NHTSA (texto fijo, §4.2). El cliente **firma la factura**, recibe copia y el taller guarda otra. **Ofrecer las piezas reemplazadas** (salvo las que vuelven al fabricante por garantía). Una infracción se reclama por la ley del consumidor y ante la Fiscalía | Es lo que más cambia la app: ver §4.2 y fase L5 |
| **Contratos de consumo** — HB 103 de 2026 (cap. 308, vigente desde el 01/10/2026) | Un contrato de consumo no puede renunciar ni limitar los remedios que da la ley; tampoco acortar el plazo para demandar | Nada de renuncias generales ni plazos cortos para reclamar |
| **Protección al consumidor** — Md. Commercial Law Título 13 | Prohíbe prácticas engañosas o abusivas; la Fiscalía y los afectados pueden demandar | Decir solo lo que se cumple |
| **Firma electrónica** — ESIGN (federal, 15 U.S.C. §7001) y la UETA de Maryland | La firma electrónica vale como la de papel. Cuando una ley exige dar algo **por escrito** a un consumidor (aquí, la copia de la factura firmada), el formato electrónico solo vale con su **consentimiento previo** tras un aviso claro: derecho a pedirlo en papel, cómo retirar el consentimiento, cómo pedir copias y si cuestan | Cláusula de consentimiento electrónico; ofrecer **siempre** la copia en papel; guardar el texto exacto y su versión |
| **Grabaciones** — Md. Cts. & Jud. Proc. §10-402 | Maryland exige el **consentimiento de todos** para grabar una conversación privada; sin él es delito grave (hasta 5 años) y el grabado puede demandar | Notas de voz: solo dictado del personal, nunca conversaciones. Videos: sin sonido por defecto o con aviso y consentimiento (pregunta 10) |
| **Seguridad de datos** — Md. PIPA, Commercial Law §14-3501 y siguientes | Aplica a **cualquier** negocio con datos personales de residentes de Maryland: medidas de seguridad razonables, destruir de forma segura, y ante una filtración avisar **primero a la Fiscalía** y a los afectados **en 45 días como máximo**. "Información personal" es el nombre junto con, por ejemplo, un número de cuenta financiera, licencia de conducir o seguro social | La foto de un cheque (nombre y número de cuenta) o de una licencia olvidada en el auto entra aquí. Plan de incidentes (L8) y cuidado con esas fotos |
| **Privacidad** — Maryland Online Data Privacy Act (MODPA) | Vigente desde el 01/10/2025. Aplica a quien procesa datos de **35.000** o más consumidores de Maryland al año (o 10.000 si más del 20 % de sus ingresos viene de vender datos) | El taller está muy por debajo: **no aplica**. Igual conviene una política completa (la FTC y la ley del consumidor sí aplican) |
| **Privacidad** — FTC Act §5 | Engañar sobre cómo se usan los datos es una práctica engañosa, aunque la política no sea un contrato | Escribir solo lo que se cumple, y cumplirlo |
| **Gravamen del taller** — Md. Commercial Law §16-202 y siguientes | Quien repara tiene un gravamen sobre el auto por la reparación, las piezas y el almacenaje. Si la cuenta sigue impaga **30 días**, puede venderlo en subasta pública con avisos (al dueño y a los acreedores al menos 10 días antes, publicación en un periódico dos semanas seguidas, aviso a la MVA). Hay un **tope para el almacenaje** que cubre el gravamen en ciertos casos ($5 por día, máximo $300) | Mencionar el gravamen en la autorización; el abogado confirma cómo aplica el tope si el almacenaje se pacta por escrito. La venta y sus avisos los maneja el taller fuera de la app |
| **Correos** — CAN-SPAM | Los correos de servicio (estado, presupuesto, reporte) son transaccionales: casi exentos. Si un correo **promociona**, ya no lo es | Los correos actuales no llevan publicidad; si algún día la llevan, baja obligatoria (ya existe `acepta_correos`) |
| **Mensajes y llamadas** — TCPA y Maryland *Stop the Spam Calls Act* (2024) | Mensajes de promoción con sistemas automáticos: consentimiento escrito previo, de 8 a. m. a 8 p. m., máximo tres por día sobre lo mismo | Hoy no aplica (WhatsApp manual y de servicio); pregunta 13 |

### 4.2 Lo que la ley de talleres pide y la app no tiene todavía

| Pide la ley | Hoy en la app | Qué hacer (fase L5) |
|---|---|---|
| Aviso de responsabilidad en el presupuesto y en la factura (texto abajo) | No está | Agregarlo al presupuesto del portal, al PDF y al texto de la firma |
| Aviso de NHTSA en la factura (texto fijo, abajo) | No está | Agregarlo al PDF/factura de entrega |
| Decir qué piezas son usadas, reconstruidas o reacondicionadas | Los repuestos no tienen ese dato | Campo `condicion` en `orden_repuestos` (nueva por defecto) y en el PDF |
| La factura incluye el trabajo de garantía | Una línea de $0 se puede cargar, pero no se marca como garantía | Marca "garantía" en la línea (opcional) |
| El cliente firma la factura; copia para él y para el taller | Solo hay firma de **recepción**; la entrega no pide firma | **Firma de entrega** en el diálogo de entrega; la factura firmada queda en el portal y en el PDF |
| Presupuesto con fecha estimada de terminación | El portal la muestra en su encabezado (`fecha_estimada_entrega`), fuera de la sección del presupuesto | Repetirla dentro del presupuesto, que es lo que el cliente autoriza, y en su PDF |
| No cobrar más del 10 % sobre el presupuesto sin consentimiento | Ya cumple de fondo: solo se cobra lo autorizado línea por línea | Mostrar en la entrega el total frente a lo presupuestado al firmar |
| Lo adicional, con permiso escrito u oral | Ya cumple: presupuesto en el portal o "Registrar autorización" (con medio y nombre) | Guion de lo que se le dice por teléfono (L6) |
| Cobrar el presupuesto solo si se avisó antes | No hay | Si el taller lo cobra (pregunta 3), va en el texto de la firma |
| Ofrecer las piezas reemplazadas | No hay | Casilla en la recepción ("quiero mis piezas") y recordatorio en la entrega |

**Textos fijos de la ley** (Md. Commercial Law §14-1002 y §14-1003; la traducción al español la
revisa el abogado):

> **Aviso de responsabilidad** (presupuesto y factura): *"While your motor vehicle is on the
> premises of [taller], [taller] may not be responsible for damage to your motor vehicle under
> certain circumstances. Please ask a representative of [taller] about the extent of its
> responsibility, including the extent of its insurance coverage."*
>
> **Aviso de NHTSA** (factura, texto literal de la ley): *"Manufacturer Special Policy Adjustment
> Programs — Federal law requires manufacturers to furnish the National Highway Traffic Safety
> Administration (N.H.T.S.A.) with bulletins describing any defects in their vehicles. You may
> obtain copies of these bulletins from either the manufacturer or N.H.T.S.A. In addition,
> certain consumer publications or organizations publish this information, which may be
> available for a fee or for free."*

## 5. Qué datos maneja la plataforma hoy

Es la base de la política de privacidad: la política no puede decir menos que esto.

| Dato | De quién | Para qué | Quién lo ve | Dónde |
|---|---|---|---|---|
| Nombre, teléfono, correo, dirección, notas | Cliente | Atender la orden, avisar, cobrar | Administración; el técnico, solo de sus órdenes | Supabase (base) |
| VIN, placa, marca, modelo, color, millas, gasolina | Vehículo del cliente | Identificar el auto y su estado al llegar | Igual | Supabase. El VIN se consulta en **NHTSA vPIC** (gobierno de EE. UU.) para decodificarlo |
| Fotos y videos de la inspección 360 y de los avances | Vehículo; **pueden salir la placa, el interior, objetos y documentos personales y personas de paso**. **Los videos graban sonido** | Probar el estado del auto al recibirlo; mostrar el trabajo al cliente | Taller; el cliente ve solo lo publicado | Supabase Storage (bucket privado, enlaces firmados) |
| Notas de voz | **Personal** del taller | Notas internas de la recepción | Taller (internas por defecto) | Supabase Storage |
| Firma de recepción y su fecha | Cliente (o quien deja el auto) | Aceptar las condiciones y autorizar lo cotizado | Taller y el cliente | Supabase Storage |
| Comprobantes de pago (foto del cheque o de la transferencia) y número de cheque | Cliente | Probar el pago | Solo administración | Supabase Storage (bucket `comprobantes`, solo admin) |
| Respuesta al presupuesto: fecha, IP, navegador, nombre | Cliente | Prueba de la autorización | Administración | Supabase (`presupuestos`) |
| Visitas al portal y correos enviados (estado, motivo de error) | Cliente | Saber si recibió los avisos | Administración | Supabase; los correos salen por **Resend** |
| Historial de cambios (quién cambió qué) | Personal | Trazabilidad | Administración | Supabase (`historial_orden`) |
| Datos de pago del personal (porcentaje, comisiones) | Personal | Pagos | Administración; cada quien lo suyo | Supabase |
| Errores de la app (con la pantalla grabada **con el texto tapado** y sin imágenes) | Quien usa la app | Arreglar fallas | Desarrollo | **Sentry** (si se activa) |
| Dirección IP al cargar la app y el portal | Quien visita | Cargar la página y sus fuentes | Proveedores de hospedaje y fuentes | **Hostinger** y **Google Fonts** |

**Dato a declarar:** la base y los archivos están alojados en **Canadá** (Supabase, región
`ca-central-1`, ver [supabase.md](supabase.md)). La política tiene que decir que los datos se
guardan fuera de EE. UU.

**Lo que no hacemos y la política puede afirmar** (verificarlo antes de publicarlo): no vendemos
datos, no hay publicidad dirigida ni rastreo de terceros, no se reconoce a nadie por la cara ni
por la voz, y el cliente no ve los nombres de los técnicos ni las notas internas.

## 6. Documentos a redactar (L1) y revisar (L2)

Todos en **español e inglés**, con el mismo contenido y en lenguaje simple. Que el abogado diga
qué versión prevalece si difieren.

### 6.1 Autorización de reparación y términos — el texto de la firma de recepción

Es la respuesta directa a "por qué le pedimos la firma". Va **arriba del recuadro de firma**, en
el idioma del cliente, y se guarda con la firma. Esqueleto (borrador para el abogado; los
números y plazos salen de la §3):

> **Al firmar, usted:**
> 1. **Autoriza** la inspección y el diagnóstico del vehículo, y los trabajos y repuestos de
>    este presupuesto, con su fecha estimada de terminación. Cualquier trabajo adicional se le
>    cotizará y solo se hará si lo autoriza por escrito o de palabra. No le cobraremos más del
>    10 % sobre lo presupuestado sin su consentimiento. *[Si se cobra el presupuesto: "El
>    presupuesto o diagnóstico cuesta $X."]*
> 2. **Confirma el estado en que entrega el vehículo**: millas, nivel de gasolina y las fotos y
>    videos de la inspección de recepción, que registran los daños previos.
> 3. **Autoriza al personal a manejar el vehículo** para pruebas, diagnóstico y entrega. *(si
>    aplica)*
> 4. **Acepta las condiciones de pago**: el depósito, el pago del saldo al recoger el vehículo y
>    el almacenaje de [$X por día] si no lo recoge dentro de [N] días después de avisarle que
>    está listo. Reconoce que el taller tiene un **gravamen** sobre el vehículo por la reparación,
>    las piezas y el almacenaje, según la ley de Maryland.
> 5. **Responsabilidad del taller** (texto de la ley): mientras el vehículo esté en el taller,
>    el taller puede no ser responsable por daños en ciertas circunstancias; pregunte a un
>    representante hasta dónde llega su responsabilidad y su seguro. Le pedimos no dejar objetos
>    de valor ni documentos en el vehículo.
> 6. **Piezas reemplazadas**: le ofreceremos las piezas que se cambien, salvo las que deban
>    volver al fabricante por garantía. ☐ Quiero que me entreguen las piezas reemplazadas.
> 7. **Fotos, videos y grabaciones**: acepta que tomemos fotos y videos del vehículo para
>    documentar su estado y el trabajo. *[Si los videos llevan sonido: "Los videos pueden grabar
>    lo que se hable cerca del vehículo; si no lo desea, avísenos y grabaremos sin sonido".]* Se
>    usan para atender su orden y resolver dudas o reclamos, y no se publican sin su permiso.
> 8. **Firma y documentos electrónicos**: acepta firmar y recibir documentos de forma
>    electrónica. Puede pedir una copia en papel sin costo en cualquier momento y retirar este
>    consentimiento escribiendo a [correo]. Recibirá una copia de lo que firmó en su enlace del
>    taller [y por correo].
> 9. **Reconoce haber recibido el Aviso de Privacidad**: [enlace].
>
> Casillas opcionales (no se requieren para el servicio):
> ☐ Autorizo usar fotos de mi vehículo **sin placas ni datos personales** en publicidad del
> taller. *(solo si la respuesta 12 es sí)*
> ☐ Acepto recibir mensajes por WhatsApp/SMS sobre mi orden. *(solo si se automatizan)*

Junto a la firma se pide el **nombre de quien firma** y, si no es el dueño, su relación ("lo
deja a nombre de…"). Al **volver a firmar** (`canResign`), el texto dice qué cambió y por qué se
firma de nuevo.

### 6.2 Factura de entrega (Maryland §14-1003)

El documento que el cliente firma al recoger el auto: todo el trabajo hecho (también el de
garantía) y todas las piezas, con su condición (nueva, usada, reconstruida, reacondicionada), el
total frente a lo presupuestado, el depósito y el pago, si se entregaron las piezas reemplazadas,
el **aviso de responsabilidad** y el **aviso de NHTSA** (§4.2). Firma del cliente, copia para él
(portal y PDF; en papel si la pide) y copia para el taller.

### 6.3 Aviso de Privacidad (público)

Una página pública (sin sesión) en `restorifyauto.net/privacidad` y su versión en inglés, con
enlace en el portal, en los correos y en el texto de la firma. Contenido:

- Quién es el responsable (taller, contacto) y a qué se aplica (taller, portal, correos).
- Qué datos se recogen y cómo (la tabla de la §5, en lenguaje simple), incluidos el sonido de
  los videos y las fotos de comprobantes.
- Para qué se usan (atender la orden, comunicar, cobrar, documentar el estado del vehículo,
  defender al taller ante un reclamo, cumplir la ley).
- Fotos y videos: qué muestran, quién los ve, que no se publican sin permiso, cuánto se guardan.
- Con quién se comparten: proveedores que procesan por cuenta del taller (hospedaje, base de
  datos en **Canadá**, correo, monitoreo de errores, decodificación del VIN), autoridades si la
  ley lo exige. **No se venden.**
- Cuánto se guardan (pregunta 9) y cómo se borran.
- Seguridad: medidas razonables (acceso por rol, archivos privados, cifrado del proveedor,
  respaldos), **sin prometer seguridad absoluta**.
- Derechos del cliente: pedir acceso, corrección, borrado (con las excepciones legales: lo que
  hay que guardar por impuestos o para un reclamo), baja de correos; cómo pedirlo y en qué plazo
  se responde. Cómo quejarse ante la Fiscalía de Maryland.
- Menores: el servicio no está dirigido a menores de 13 años.
- Cambios a la política: se publica la versión nueva con fecha.

### 6.4 Términos del portal y de la autorización del presupuesto

- Términos de uso del enlace del cliente (`/r/<token>`): es personal, no compartirlo; qué ve y qué
  no; que autorizar en el portal es una firma electrónica.
- El presupuesto del portal agrega la **fecha estimada**, el **aviso de responsabilidad** y, junto
  a **Autorizar**: "Al autorizar, acepta realizar y pagar los trabajos marcados, en las
  condiciones de la Autorización de reparación [enlace]".
- Guion para **"Registrar autorización"** (permiso oral por teléfono o en persona, que la ley
  acepta): qué trabajo, cuánto cuesta, cuánto sube el total, y que el cliente dice que sí; se
  registra quién lo dio, cuándo y por qué medio. **No grabar la llamada** sin avisar y pedir
  permiso (Maryland exige el consentimiento de todos).

### 6.5 Documentos internos (no los ve el cliente)

- **Política del personal**: uso de la app y de los teléfonos; **no grabar conversaciones** (las
  notas de voz son dictado propio; con el cliente presente, video sin sonido o con su permiso);
  no fotografiar personas, licencias ni documentos (si un documento aparece, borrar la foto);
  confidencialidad de los datos de clientes; contraseñas y cierre de sesión. Cada empleado la
  acepta al entrar.
- **Plan de respuesta a incidentes**: quién decide, cómo se contiene (cambiar llaves, cerrar
  sesiones), a quién se avisa y en qué orden y plazo (en Maryland, **primero la Fiscalía**,
  después los afectados, en 45 días como máximo), plantilla del aviso.
- **Retención y borrado**: plazos por tipo de dato y quién los ejecuta; los comprobantes de pago
  con un plazo más corto si el contador lo permite.
- **Proveedores**: aceptar o descargar el acuerdo de tratamiento de datos (DPA) de Supabase,
  Resend, Sentry y Hostinger, y guardarlos.

## 7. Cambios en la plataforma

Reglas de siempre: migraciones nuevas, funciones con `REVOKE`, pgTAP para lo que toque permisos
o evidencia, expandir antes de contraer, `db push` antes del push a `main`.

### L3 — Documentos versionados y páginas públicas

- Tabla `documentos_legales`: `tipo` (`privacidad`, `autorizacion_reparacion`, `factura_avisos`,
  `terminos_portal`, `politica_personal`), `idioma`, `version`, `titulo`, `contenido` (Markdown),
  `hash` (SHA-256 del contenido), `publicado_en`, `publicado_por`. **Inmutable**: una versión
  publicada no se edita ni se borra (sin políticas de UPDATE/DELETE; una versión nueva la
  reemplaza). Escribe solo un admin, por la RPC `publicar_documento_legal`.
- Lectura pública de la versión vigente por la edge function `portal` (el portal no usa
  Supabase JS), para las páginas `/privacidad` y `/terminos` (español e inglés) del paquete del
  portal. Pie del portal y de los correos (`_shared/email/templates.ts`) con el enlace.
- Pantalla en Configuración para publicar una versión nueva (pegar el texto aprobado, vista
  previa, publicar). Cada publicación queda en el historial.
- Pruebas: pgTAP (solo admin publica; nadie edita una versión publicada; anon no lee la tabla).

### L4 — La firma de recepción con su texto (lo central de la minuta)

- `SignatureCard.tsx`: arriba del lienzo, el texto vigente de **Autorización de reparación** en
  el idioma que elija el cliente (selector ES/EN en la tarjeta), con desplazamiento; casilla
  obligatoria "Leí y acepto"; las casillas de la §6.1 (piezas reemplazadas y las opcionales);
  campo **nombre de quien firma** (precargado con el cliente) y su relación si no es el dueño.
  "Guardar firma" se apaga hasta marcar la obligatoria.
- Hoy la firma es un UPDATE desde el navegador (`uploadSignature` en
  `workOrders.service.ts`). Pasa a una RPC `firmar_recepcion(orden, ruta_firma, documento_id,
  nombre_firmante, relacion, consentimientos)` que, **en una transacción**, guarda la firma en la
  orden y una fila en una tabla nueva `firmas` (orden, tipo `recepcion`, documento y versión, hash
  del texto mostrado, nombre, relación, consentimientos, quién la capturó, fecha, navegador). La
  primera firma sigue autorizando lo cotizado (`trg_quote_on_signature`).
- Despliegue en dos pasos: la migración que agrega la RPC y la tabla no rompe la app publicada;
  cuando la app nueva esté en vivo, otra migración exige la fila en `firmas` para cambiar
  `firma_ruta`.
- **Constancia para el cliente:** el portal muestra "Autorización firmada" (texto, firma, fecha,
  versión) y el PDF agrega esa página (`lib/workOrderPdf.ts`, `datos_portal`, siempre campo por
  campo). Si el cliente tiene correo, se le manda el enlace al firmar.
- Pruebas: pgTAP (solo admin firma; la fila de `firmas` guarda la versión y el hash; una
  segunda firma no aprueba nada); Vitest (sin la casilla no se guarda; se manda la versión que se
  mostró; el idioma cambia el texto); manual en una tableta real.

### L5 — Presupuesto y factura de Maryland; firma de entrega; piezas reemplazadas

- `orden_repuestos.condicion` (`nueva` por defecto, `usada`, `reconstruida`, `reacondicionada`)
  y `orden_labor`/`orden_repuestos.garantia` (opcional). Selector en las tablas y en el alta.
  Entran en el historial.
- Presupuesto del portal y PDF: fecha estimada, condición de cada pieza y el aviso de
  responsabilidad (versionado en `documentos_legales`).
- **Firma de entrega** en `DeliveryModal`: la factura (§6.2) en pantalla, el cliente firma, y
  `entregar_orden` guarda la firma con su texto en `firmas` (tipo `entrega`) en la misma
  transacción que el cobro. Si el cliente no está (entrega a un tercero), se registra quién
  recibió. Copia en el portal, en el PDF y en papel si la pide.
- Piezas reemplazadas: la elección de la recepción se ve en Trabajos y el diálogo de entrega
  pregunta "¿Se entregaron las piezas?"; queda en la factura.
- Total frente a lo presupuestado en el diálogo de entrega (aviso si lo autorizado después lo
  subió más del 10 %: es legal porque se autorizó, pero conviene que el cliente lo vea).
- Pruebas: pgTAP (la entrega guarda la firma y su versión; la condición de la pieza entra al
  historial); Vitest (la factura lleva los dos avisos, la condición y el trabajo de garantía).

### L6 — Términos al autorizar un presupuesto

- Portal: el texto de la §6.4 junto a **Autorizar**, con enlace; la respuesta guarda el
  documento y su versión (hoy ya guarda fecha, IP y navegador).
- "Registrar autorización": el guion de la §6.4 en el diálogo, y la versión de los términos en
  el registro.

### L7 — Consentimientos y derechos del cliente

- Tabla `consentimientos_cliente` (cliente, tipo, otorgado, cuándo, cómo, versión del texto):
  publicidad con fotos, mensajes automáticos, video con sonido. La ficha del cliente los muestra
  y se pueden retirar; si algún día hay una función de publicar fotos, **la base** la bloquea sin
  consentimiento.
- **Exportar los datos de un cliente** (JSON y PDF: sus datos, sus órdenes, sus archivos) y
  **anonimizarlo** (RPC de admin: borra nombre, teléfono, correo, dirección y archivos; conserva
  montos y movimientos para la contabilidad, con el nombre reemplazado). Antes de anonimizar,
  revisar si hay un reclamo abierto.
- Retención automática (`pg_cron`) según la pregunta 9: borra fotos, videos, notas de voz y
  comprobantes de órdenes entregadas hace más del plazo, salvo las marcadas "conservar". Queda en
  el historial.

### L8 — Personal, grabaciones y seguridad

- **Video sin sonido por defecto** (si el taller elige esa opción en la pregunta 10): hoy
  `useMediaRecorder` pide micrófono también para el video; se agrega un interruptor "con sonido"
  apagado al empezar, y el grabador avisa "No grabes conversaciones sin permiso".
- Aviso en la barra de captura (`MediaCaptureBar`): "Fotografía solo el vehículo: no personas ni
  documentos".
- Aceptación de la política del personal al iniciar sesión (tabla `aceptaciones_politica`;
  versión nueva = aceptar de nuevo).
- Verificación en dos pasos (MFA de Supabase Auth) para las cuentas de administración.
- Plan de incidentes en `docs/` (orden de avisos de Maryland) y los DPA de los proveedores
  archivados.
- Revisar Sentry antes de activarlo: grabación con texto tapado e imágenes bloqueadas (ya está
  así en `lib/monitoring.ts`) y sin datos personales en los eventos.

### Ajuste de configuración que no espera al plan

Maryland está en la hora del **Este** (`America/New_York`). Los correos usan `SHOP_TIMEZONE`, que
no está puesto, y su valor por defecto es `America/Chicago` ([supabase.md](supabase.md)): las
horas de los correos salen una hora atrasadas. Se arregla con
`npx supabase secrets set SHOP_TIMEZONE=America/New_York` (lo corre la persona responsable). La
app del navegador ya usa la zona del teléfono o la computadora.

## 8. Orden de trabajo

1. **L0**: el taller contesta la §3 (una reunión de 30 a 45 minutos alcanza).
2. **L1**: redactar los borradores (§6) con esas respuestas, en español e inglés.
3. **L2**: el abogado los revisa. Mientras tanto se construyen L3, L4 y L5 con textos de prueba
   marcados **BORRADOR**, sin publicarlos.
4. **L3 y L4** juntos: es lo que pidió la minuta (privacidad y texto de la firma). **L5** enseguida:
   es lo que la ley de Maryland ya exige hoy (avisos de la factura, firma de la factura, piezas).
5. **L6**, después **L7** y **L8**. El video sin sonido de L8 puede adelantarse: es chico y baja
   un riesgo real.

Tamaño aproximado: L3 M · L4 L · L5 L · L6 S · L7 M · L8 M. Lo que más tarda suele ser la
revisión legal, no el código.

## 9. Riesgos y límites

- **Ningún texto evita una demanda.** Reduce el riesgo y deja la evidencia para defenderse.
- En Maryland, desde el 01/10/2026, las renuncias y limitaciones de remedios en contratos de
  consumo no valen: no confiar en cláusulas de exención.
- Un texto largo que nadie lee pierde fuerza: corto, en el idioma del cliente, con títulos, y el
  cliente marca que lo leyó.
- Los textos tienen que coincidir con lo que hace la app. Si cambia un proveedor o se agrega una
  función que usa datos (por ejemplo, IA para leer fotos), se actualiza la política **antes**.
- La versión que firmó cada cliente se guarda para siempre: nunca editar una versión publicada.
- Las órdenes de hoy (sin estos textos) siguen siendo evidencia del estado del auto; el abogado
  dirá si hace falta algo más para ellas, sobre todo los **videos con sonido** ya grabados.

## Fuentes

- Ley de talleres de Maryland, texto oficial: [§14-1002](https://mgaleg.maryland.gov/2026RS/Statute_Web/gcl/14-1002.pdf), [§14-1003](https://mgaleg.maryland.gov/2026RS/Statute_Web/gcl/14-1003.pdf), [§14-1004](https://mgaleg.maryland.gov/2026RS/Statute_Web/gcl/14-1004.pdf), [§14-1006](https://mgaleg.maryland.gov/2026RS/Statute_Web/gcl/14-1006.pdf), [§14-1007](https://mgaleg.maryland.gov/2026RS/Statute_Web/gcl/14-1007.pdf)
- Contratos de consumo, HB 103 de 2026 (cap. 308): [Asamblea General de Maryland](https://mgaleg.maryland.gov/mgawebsite/Legislation/Details/hb0103?ys=2026RS)
- Grabaciones: [Cts. & Jud. Proc. §10-402](https://mgaleg.maryland.gov/2024RS/Statute_Web/gcj/10-402.pdf)
- Seguridad de datos y filtraciones (PIPA): [§14-3504](https://mgaleg.maryland.gov/2026RS/Statute_Web/gcl/14-3504.pdf), [Fiscalía de Maryland, guía para empresas](https://www.marylandattorneygeneral.gov/Pages/IdentityTheft/businessGL.aspx)
- MODPA: [Baker Donelson](https://www.bakerdonelson.com/consumer-data-privacy-law-guide-maryland), [Perkins Coie](https://legacy.perkinscoie.com/insights/blog/are-you-ready-october-1-marylands-data-privacy-law-sets-new-standards-compliance)
- Gravamen del taller: [citybiz, Maryland garageman's liens](https://www.citybiz.co/article/561360/maryland-garagemans-liens-what-they-cover-and-how-they-are-effectuated/)
- Plazo para reclamar un contrato: [Cts. & Jud. Proc. §5-101 (resumen)](https://www.propertyinsurancecoveragelaw.com/blog/maryland-insurance-contract-statute-of-limitations)
- Mensajes y llamadas: [Kelley Drye, Maryland Stop the Spam Calls Act](https://kelleydrye.com/viewpoints/blogs/ad-law-access/marylands-new-telemarketing-law-now-in-effect)
- ESIGN, consentimiento del consumidor: [Consumer Compliance Outlook (Fed)](https://www.consumercomplianceoutlook.org/articles/2009/fourth-issue-2009/moving-from-paper-to-electronics-consumer-compliance-under-the-e-sign-act)
- FTC y políticas de privacidad: [FTC, Privacy and Security Enforcement](https://www.ftc.gov/news-events/media-resources/protecting-consumer-privacy/privacy-security-enforcement)
- CAN-SPAM, mensajes transaccionales: [Hunton (FTC vs. Experian)](https://www.hunton.com/privacy-and-cybersecurity-law-blog/ftc-announces-proposed-order-against-experian-for-can-spam-violations)
- Cláusulas usuales en autorizaciones de talleres: [Crystal Clear Collision](https://crystalclearcollision.com/authorization)
