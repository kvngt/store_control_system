---
description: Protocolo obligatorio para diseñar o escribir una migración de Supabase en Restorify (versión vigente, REVOKE, SECURITY DEFINER, RLS, dinero, pgTAP, qa:security, historial, Realtime).
argument-hint: <qué cambio de base de datos>
---

Vamos a diseñar o escribir un cambio de base de datos para: **$ARGUMENTS**

Sigue este protocolo **antes** de escribir SQL. Las reglas completas están en `AGENTS.md` y
`docs/ai-context.md`; aquí va lo que más se ha roto.

1. **Parte de la versión vigente.** Para cada función, trigger, política o tabla que toques,
   ejecuta `npm run db:donde -- <nombre>` y copia **entera** la versión de la migración más
   nueva. Partir de una versión vieja deshace en silencio lo que cambiaron las posteriores.
2. **Una migración nueva.**
   - Se nombra después de la última que haya en `supabase/migrations/`, no con la fecha de
     hoy.
   - Nunca edites una migración aplicada ni cambies el esquema desde el panel.
   - Lleva un encabezado en español: qué se pidió, quién lo pidió y por qué.
   - Si elimina o renombra columnas, va en dos pasos (expandir y contraer;
     `docs/mantenimiento.md` §4).
3. **Funciones.**
   - Toda función nueva en `public` lleva
     `REVOKE ALL ON FUNCTION ... FROM PUBLIC, anon, authenticated;` y solo el
     `GRANT EXECUTE` que necesita.
   - Las que solo llaman triggers no llevan `GRANT`.
   - Las `SECURITY DEFINER` llevan `SET search_path = public` y verifican por dentro el rol
     (`is_admin()`), la asignación (`mis_ordenes_asignadas()`) y la sede.
   - No vuelvas pública una función interna. `hoy_taller(sede)` es interna; el borrador de la
     `029` le devolvía el `GRANT` y se corrigió en la auditoría.
   - Las fechas del taller salen de `hoy_taller(sede)`, nunca de `CURRENT_DATE`.
4. **Tablas.**
   - Toda tabla nueva lleva RLS.
   - Una tabla hija de la orden lleva la misma política que sus hermanas: el técnico la ve
     con `(SELECT mis_ordenes_asignadas())::uuid[]`.
   - Si otro usuario la debe ver al momento, va en la publicación de Realtime y en
     `ORDER_TABLES` (con su prueba en `workOrders.service.test.ts`).
5. **Dinero.**
   - Lo calcula la base, con triggers idempotentes con signo.
   - Una operación que se puede disparar dos veces bloquea sus filas (`FOR UPDATE`).
   - Si sumas líneas, filtra `estado = 'aprobado'`.
   - Si sumas `finanzas_movimientos`, filtra `importacion_id IS NULL`.
6. **Lo que llega al cliente.**
   - `datos_portal`, `datos_servicio` y `datos_correo` se arman campo por campo con
     `jsonb_build_object`, **nunca** con `to_jsonb(fila)`.
   - Al cliente no le llega el nombre de un técnico, ni un costo interno, ni una nota interna.
7. **Triggers auxiliares** (traducción, historial, avisos).
   - Nunca bloquean la escritura de la orden: su trabajo va en un bloque que, si falla, solo
     avisa con `WARNING`.
   - En PL/pgSQL, `OLD.columna` se resuelve aunque otra condición la descarte: separa las
     ramas por tabla.
   - Todo `ON CONFLICT` necesita un índice único que coincida.
8. **El técnico y el historial.**
   - Si una acción del técnico cambia otra columna de `ordenes_trabajo`, agrégala a la lista
     permitida de `trg_order_technician_guard`.
   - Si una columna nueva la decide alguien (no es un total recalculado), súmala a
     `trg_historial` y a su `UPDATE OF`.
9. **Pruebas.**
   - pgTAP en `supabase/tests/database/NN_nombre.test.sql` (el número que sigue), con un
     `plan(n)` exacto.
   - Cubre permisos (admin, técnico asignado, técnico ajeno, sin sesión), dinero y casos
     borde, y corre `npm run test:db`.
   - Un caso por función o tabla nueva en `scripts/qa/api-security.mjs` (el `SEC-` que
     sigue). Pide columnas que existan: una columna inexistente da 400 y la prueba falla.
10. **Documentación.**
    - `docs/mapa-de-secciones.md`.
    - `docs/supabase.md` si cambia algo del proyecto real.
    - La regla nueva en `docs/ai-context.md` si es de las que no se pueden romper.
11. **No publiques.** Ni `supabase db push` ni `functions deploy` sin que la persona
    responsable lo pida. Deja escrito el orden de publicación: la base antes que la app (la
    app sale con un push a `main`).
