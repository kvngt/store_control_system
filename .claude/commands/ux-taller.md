---
description: Audita una pantalla o flujo de Restorify con las reglas de UX del taller (recepción en mostrador, dueño que cotiza, técnico en el patio) y propone cómo simplificarlo. Solo lectura.
argument-hint: <pantalla, flujo o archivo; por ejemplo "alta de la orden" o src/features/workOrders/WorkOrderDetail.tsx>
---

Audita la pantalla o el flujo: **$ARGUMENTS**

Piensa como diseñador de producto de software para talleres (Tekmetric, Shopmonkey), pero con
los pies en este código. **Es solo lectura:** no edites archivos. Entrega el informe y espera
a que la persona apruebe los cambios.

## Antes de opinar

1. Lee el código real del flujo: los componentes, su esquema zod y la RPC que escribe.
   Lee también la sección del manual que lo explica (`docs/manual-usuario.md`).
2. Busca en `docs/bitacora.md` y en `docs/historico/` si el taller pidió ese diseño. No
   deshagas un pedido suyo sin decirlo. Ejemplo: la firma no autoriza lo cotizado porque así
   lo pidió el taller el 06/10/2026.
3. Identifica **quién** lo usa y **dónde**:
   - administración en el mostrador, con el cliente enfrente (computadora o iPhone);
   - el dueño, que pone los precios después, a partir de las fotos;
   - el técnico en el patio, con las manos sucias (teléfono de 390 px);
   - el cliente, en su teléfono.
4. Si puedes, míralo: capturas a 390 × 844 y a 1366 × 820 con Playwright
   (`@playwright/test` ya está instalado).
   - `npm run dev` usa `.env.local`, que apunta al proyecto **real**: ahí solo mira, no
     guardes nada.
   - Para recorrer un flujo que escribe, usa un Supabase local; si no lo hay, quédate en la
     lectura del código.

## Las cinco reglas del taller

1. **Mostrador en menos de 60 segundos.** Cuenta toques, campos escritos y campos
   obligatorios (zod más `NOT NULL`/`CHECK` de la base) para el caso real:
   - un cliente que solo da nombre y teléfono;
   - un trabajo con precio cerrado (por ejemplo, $750);
   - un depósito.

   Si son más de 4 pasos, propón cómo bajar a la mitad.
2. **Manos con grasa.** En 390 px, la acción principal del técnico se resuelve en 1 o 2
   toques, con blancos táctiles de 44 px o más e inputs de 16 px.
3. **Una pantalla no es el esquema de la base.** Nada de una tarjeta por tabla:
   - si algo secundario cabe en una sección existente (`TAB_SECTIONS`), va ahí;
   - si solo hace falta a veces, se muestra solo cuando hace falta.
4. **Palabras del taller.** Los textos (`src/i18n/translations.ts`, en español e inglés)
   usan el lenguaje de un taller en EE. UU. y Latinoamérica. Nunca jerga de programador ni
   nombres de columnas.
5. **Presupuesto de complejidad.** Antes de agregar un botón, una sección o un paso, di qué
   elemento existente se oculta, se fusiona o se automatiza.

## Qué entregar

1. **Conteo de hoy frente a lo propuesto:** toques, campos y cambios de pestaña o de paso,
   para cada tarea de cada actor.
2. **Problemas** en 390 px y en escritorio, cada uno con `archivo:línea`.
3. **Plan de simplificación**, ordenado por impacto y esfuerzo:
   - que respete `AGENTS.md` y `docs/ai-context.md`: el dinero lo calcula la base, los
     permisos viven en RLS, todo texto pasa por i18n, colores con tokens CSS, `QuickActions`
     con un solo `primary`;
   - con las pruebas que habría que tocar.
