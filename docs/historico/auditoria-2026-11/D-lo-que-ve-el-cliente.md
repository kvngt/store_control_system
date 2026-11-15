### [ALTO] Un enlace revocado manualmente vuelve a crearse y enviarse al cliente en el siguiente correo
- Dónde: `_esquema-vigente.sql` (`datos_correo:3805`, `encolar_correo_cliente:4594`, `asegurar_enlace_orden:2970-2991`, `revocar_enlace_cliente:7935`)
- Evidencia:
```sql
3805:   v_enlace := public.asegurar_enlace_orden(v_orden.id);
4594:   PERFORM public.asegurar_enlace_orden(p_orden_id);
7935:   UPDATE orden_enlaces SET revocado_en = NOW() WHERE orden_id = p_orden_id AND revocado_en IS NULL;
```
- Escenario: Un administrador pulsa «Desactivar» sobre el enlace de una orden (`revocar_enlace_cliente`) porque el cliente lo compartió por error o se envió a la persona equivocada. Si ya había un correo en `cola_envios` o si después cambia el estado de la orden (`en_proceso`, `finalizado`, `entregado`) o se responde un presupuesto, `encolar_correo_cliente` y `datos_correo` llaman a `asegurar_enlace_orden`, que al no ver ningún registro con `revocado_en IS NULL` genera un token nuevo activo y lo envía por correo sin intervención del administrador.
- Arreglo propuesto: Marcar si la revocación fue manual (o bloquear la creación automática cuando exista un enlace revocado manualmente y no uno posterior) para que los envíos automáticos se omitan hasta que administración pulse «Crear enlace».
- Confianza: alta

### [ALTO] La orden retirada sin reparar envía el correo de entrega normal ("Gracias por confiar en nosotros")
- Dónde: `_esquema-vigente.sql` (`datos_correo:3848-3853`, `retirar_sin_reparar:7840-7841`, `trg_portal_on_order_change:10208-10219`) y `templates.ts:217-224`
- Evidencia:
```sql
3848:     'orden', jsonb_build_object(
3849:       'numero', v_orden.numero_orden,
3850:       'estatus', public._estatus_cliente(v_orden.estatus, v_orden.lista_para_entregar_en),
3851:       'fecha_ingreso', v_orden.fecha_ingreso,
3852:       'fecha_estimada_entrega', v_orden.fecha_estimada_entrega
3853:     ),
```
```ts
222:             `Entregamos su ${vehicle}. El reporte del trabajo, con sus fotos, queda disponible en el enlace durante 90 días.`,
```
- Escenario: El cliente decide retirar su vehículo sin reparar y el administrador cierra la orden con `retirar_sin_reparar`, que llama a `entregar_orden` dejando `estatus = 'entregado'` y `retirada_sin_reparar = true`. El trigger `trg_portal_on_order_change` encola el correo `'estatus'`, pero `datos_correo` no expone `retirada_sin_reparar`, de modo que el cliente recibe la plantilla estándar de `entregado` («Gracias por su visita / Entregamos su…» o «Thank you for trusting us / We delivered your…») en lugar de un aviso de devolución sin reparación.
- Arreglo propuesto: Exponer `retirada_sin_reparar` en `datos_correo` y agregar en `templates.ts` (ES y EN) una variante de texto acorde a una entrega sin reparación, alineada con el portal y el PDF.
- Confianza: alta

### [MEDIO] Con el enlace vencido (>90 días) el cliente no puede darse de baja de los correos
- Dónde: `_esquema-vigente.sql:3951-3953` (`datos_portal:3951-3953`, `preferencia_correos_portal:6578-6589`) y `CustomerPortal.tsx:174-176`
- Evidencia:
```sql
3951:   IF v_enlace.expira_en IS NOT NULL AND v_enlace.expira_en <= NOW() THEN
3952:     RETURN jsonb_build_object('estado_enlace', 'vencido', 'taller', v_taller);
3953:   END IF;
```
```tsx
174:       {state.kind === 'loaded' && state.data.estado_enlace !== 'ok' && (
175:         <Unavailable state={state.data.estado_enlace} shop={state.data.taller} s={s} />
176:       )}
```
- Escenario: Un cliente abre pasados los 90 días el enlace «No quiero recibir estos correos» (`?correos=baja#correos`) de un correo antiguo. Aunque `preferencia_correos_portal` admite explícitamente enlaces vencidos (`expira_en` no se filtra), `datos_portal` devuelve solo `estado_enlace: 'vencido'` sin datos de correo y `CustomerPortal` solo muestra `<Unavailable>`, sin renderizar `<EmailPreference>`. Además, por `POST` directo un token vencido sigue pudiendo reactivar correos o cambiar `clientes.idioma` (`preferencia_idioma_portal:6618`).
- Arreglo propuesto: Cuando `estado_enlace === 'vencido'`, incluir en `datos_portal` solo `cliente: { tiene_correo, acepta_correos }` y mostrar `<EmailPreference>` en esa vista; en la base, restringir `preferencia_idioma_portal` y `p_acepta = true` a enlaces vigentes.
- Confianza: alta

### [MEDIO] «Su cuenta» oculta depósito, devoluciones, trabajos no autorizados y saldo a favor cuando el total es $0
- Dónde: `src/portal/CustomerPortal.tsx:690-706`
- Evidencia:
```tsx
691:         Number(cuenta.saldo) < -0.009
692:           ? `${s.credit}: ${fmt.money(-Number(cuenta.saldo))}`
704:       {!hasLines && Number(cuenta.total) === 0 ? (
705:         <p className="portal-muted">{s.noCharges}</p>
706:       ) : (
```
- Escenario: Un cliente deja un depósito de $200 en recepción antes de aprobar trabajos, o retira el vehículo sin reparar con cargo $0 y líneas rechazadas. La tarjeta cerrada muestra «Saldo a su favor: $200.00» (y en retirada el estado dice «Abajo está lo que se cobró o se le devolvió»), pero al expandir «Su cuenta» se cumple `!hasLines && total === 0` y se sustituyen el depósito, devolución, líneas no autorizadas y saldo a favor por «El taller todavía no registró cargos en esta orden».
- Arreglo propuesto: Renderizar el bloque completo de `AccountSection` siempre que existan líneas en `no_autorizados`, `deposito > 0` o `Math.abs(otros_pagos ?? pagado) > 0.009`, dejando `s.noCharges` solo cuando todo está vacío y en cero.
- Confianza: alta

### [MEDIO] El correo de «vehículo listo» omite el aviso de parqueo cuando el cobro ya está en curso (`acumulando`)
- Dónde: `supabase/functions/_shared/email/templates.ts:212-214` (y `333-335` en EN) frente a `_esquema-vigente.sql:3809-3815`
- Evidencia:
```sql
3809:     IF (SELECT avisar_cliente FROM parqueo_config WHERE sede_id = v_orden.sede_id) IS TRUE
3810:        AND v_parq_json->>'estado' IN ('por_empezar', 'acumulando') THEN
```
```ts
212:             ...(ctx.parqueo && ctx.parqueo.estado === 'por_empezar' && ctx.parqueo.inicio
213:               ? [`A partir del ${formatDate(ctx.parqueo.inicio, tz, 'es')} se cobrará parqueo de ${money(ctx.parqueo.tarifa_inicial)} por día.`]
214:               : []),
```
- Escenario: Si la sede tiene `avisar_cliente = true` y la orden tiene `dias_gracia = 0` con `cobra_dia_evento = true`, inicio de parqueo desde el ingreso (seguro) o `inicio_manual` ya alcanzado, al marcar «Listo para entregar» `_parqueo_calcular` devuelve `estado = 'acumulando'`. Aunque `datos_correo` adjunta `parqueo` para ambos estados, `copyEs` y `copyEn` solo imprimen el párrafo cuando `estado === 'por_empezar'`, enviando el correo sin aviso de tarifa diaria.
- Arreglo propuesto: Añadir el caso `ctx.parqueo.estado === 'acumulando'` en `copyEs` y `copyEn` indicando que el parqueo de `tarifa_inicial` por día corre desde `inicio`.
- Confianza: alta

### [MEDIO] La baja de correos dice aplicar «sobre esta orden», pero desactiva todos los avisos futuros del cliente
- Dónde: `src/portal/strings.ts:101,316` y `_esquema-vigente.sql:6586-6589`
- Evidencia:
```ts
101:   emailsOff: 'No le enviamos correos sobre esta orden.',
316:   emailsOff: 'We do not send you emails about this order.',
```
```sql
6586:   UPDATE clientes
6587:   SET acepta_correos = p_acepta,
6588:       correos_baja_en = CASE WHEN p_acepta THEN NULL ELSE NOW() END
6589:   WHERE id = v_cliente;
```
- Escenario: Un cliente que trae varios vehículos o regresa en otra visita apaga los correos en el portal de una orden vieja creyendo que solo silencia esa orden. `preferencia_correos_portal` guarda `clientes.acepta_correos = false` a nivel global del cliente, de modo que en órdenes posteriores no recibirá ningún correo (ni presupuestos ni avisos de entrega) hasta volver a activarlo.
- Arreglo propuesto: Corregir los textos `emailsOn`, `emailsOff` y `emailsStopConfirm` en español e inglés para indicar que la preferencia aplica a todos los correos del taller y no solo a la orden actual.
- Confianza: alta

### [MEDIO] La nota del sticker QR en español no se traduce al inglés cuando el cliente cambia de idioma en `/s/<código>`
- Dónde: `_esquema-vigente.sql:4318,4342-4349` y `src/portal/ServicePage.tsx:171-175`
- Evidencia:
```sql
4318:   v_idioma_destino := COALESCE(v_ps.idioma, v_idioma, 'en');
4346:         AND t.idioma_destino = v_idioma_destino
```
```ts
171: function servicioNota(data: ServicePortalData, language: PortalLanguage): string | null {
172:   const nota = data.servicio.nota;
173:   if (!nota || language !== 'en') return nota;
174:   return data.traducciones?.[nota.trim()] ?? nota;
175: }
```
- Escenario: Se emite un sticker con `idioma = 'es'` (o para un cliente con `clientes.idioma = 'es'`) y una nota en español cuya traducción al inglés ya fue guardada en `traducciones` con `idioma_destino = 'en'` por `sendTraduccion`. Cuando alguien escanea el QR y cambia `/s/<código>` a English, `datos_servicio` consultó `t.idioma_destino = 'es'` y devolvió `traducciones = {}`, por lo que `servicioNota` muestra la nota en español.
- Arreglo propuesto: Consultar siempre `t.idioma_destino = 'en'` en `datos_servicio` (igual que `_diccionario_traducciones`) para que `ServicePage` tenga la traducción disponible al cambiar a inglés.
- Confianza: alta

### [BAJO] «No autorizar nada» exige escribir el nombre mientras la ayuda y el bloqueo inducen a error
- Dónde: `src/portal/CustomerPortal.tsx:1067,1208-1209` y `src/portal/strings.ts:119,334`
- Evidencia:
```tsx
1067:   const nameOk = name.trim().length >= 2;
1208:         <button type="button" className="btn btn-secondary" disabled={sending || !nameOk} onClick={() => void submit([])}>
1209:           {s.rejectAll}
```
```ts
119:   yourNameHint: 'Queda registrado como constancia de su autorización.',
334:   yourNameHint: 'Recorded as proof of your authorization.',
```
- Escenario: Un cliente que no desea aprobar ninguna línea de un presupuesto deja «Su nombre» vacío (ya que el texto dice que es «constancia de su autorización») y toca «No autorizar nada», encontrando el botón deshabilitado sin ningún mensaje que explique por qué no responde.
- Arreglo propuesto: No deshabilitar los botones por `!nameOk` y validar el nombre al pulsar mostrando un aviso junto al campo, además de cambiar `yourNameHint` a «constancia de su respuesta».
- Confianza: alta

### [BAJO] «Abrir reporte» en `ShareReportModal` omite `?vista=taller`
- Dónde: `src/features/workOrders/ShareReportModal.tsx:148` (frente a `CustomerLinkCard.tsx:148`) y `CustomerPortal.tsx:147`
- Evidencia:
```tsx
148:               <a className="btn btn-secondary" style={{ flex: 1 }} href={link} target="_blank" rel="noopener noreferrer">
```
```tsx
147:     if (token && !isStaffPreview()) void setLanguagePreference(token, next).catch(() => undefined);
```
- Escenario: El administrador abre «Enviar reporte» y pulsa «Abrir reporte» para previsualizar el portal. Al no llevar `?vista=taller`, si cambia el selector de idioma en esa pestaña para revisar los textos traducidos, `toggleLanguage` ejecuta `setLanguagePreference` y sobrescribe `clientes.idioma` sin aviso.
- Arreglo propuesto: Añadir `?vista=taller` al `href` del enlace en `ShareReportModal.tsx`, igual que hace `CustomerLinkCard.tsx`.
- Confianza: alta

### [BAJO] El PDF formatea fechas según la zona horaria del dispositivo y millas sin separador de miles
- Dónde: `src/lib/workOrderPdf.ts:437,439,763`
- Evidencia:
```ts
437:   label(S.milesIn, String(order.millas_ingreso ?? ''), MARGIN + half, half - 5);
439:   label(S.dateIn, order.fecha_ingreso ? new Date(order.fecha_ingreso).toLocaleDateString(S.locale) : '', MARGIN, half - 5);
763:         doc.text(`${S.signed}: ${new Date(order.firma_fecha).toLocaleDateString(S.locale)}`, MARGIN + 70, y, {
```
- Escenario: Si un administrador genera el PDF desde un equipo fuera de la zona horaria de Maryland (o con configuración regional distinta), una recepción o firma de última hora del día puede mostrarse con la fecha del día siguiente o anterior respecto al portal y al correo, y el millaje sale como `108000` en lugar de `108,000`.
- Arreglo propuesto: Pasar `timeZone: sede?.zona_horaria || 'America/New_York'` al formatear `fecha_ingreso` y `firma_fecha`, y formatear `millas_ingreso` con `Intl.NumberFormat(S.locale)`.
- Confianza: alta

---

## Lo que revisé y está bien
- **Fugas y permisos en portal y sticker**: `datos_portal` y `datos_servicio` construyen el JSON campo por campo sin exponer nombres de técnicos, costos internos, comisiones, avances internos (`visible_cliente = false`), hallazgos internos ni placa/VIN/nombre en `/s/<código>`; `portal/index.ts` firma las rutas de Storage por 2 h y elimina `ruta`, `ruta_miniatura` y `firma_ruta` de la respuesta.
- **Autorización de presupuestos**: `responder_presupuesto_portal` y `_resolver_presupuesto` exigen token activo de 64 hexadecimales, bloquean la fila con `FOR UPDATE`, rechazan presupuestos ya respondidos o cancelados, validan que el conjunto de líneas vistas y aprobadas coincida con las pendientes del presupuesto (`presupuesto_cambio` / `lineas_invalidas`) y expanden trabajos completos de catálogo.
- **Seguridad e idempotencia de correos**: `templates.ts` escapa todo texto dinámico con `escapeHtml` y valida URLs `https://` y colores hex; `process-outbox/index.ts` relee datos vivos con `datos_correo`, respeta `acepta_correos`, `es_correo_valido` y `ultimo_estatus_enviado`, espera traducciones pendientes hasta 2 intentos y usa `Idempotency-Key: job.id` en Resend.
- **Página pública y coherencia**: Los teléfonos, horarios, dirección, correo y enlaces de `index.html`, `Visit.tsx`, `Landing.tsx` y `business.test.ts` coinciden entre sí, y `PrivacyPolicy.tsx` refleja los proveedores reales observados en el código (Supabase Canadá, Hostinger, Google Fonts, Resend, Gemini, NHTSA, Sentry).
