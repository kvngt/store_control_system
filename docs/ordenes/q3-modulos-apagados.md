# Orden Q3 — Módulos apagados para este taller

Parte de la etapa 1 de [plan-arquitectura-2026-11.md](../plan-arquitectura-2026-11.md)
(decisión del 16/11/2026). La escribe el arquitecto; la programa Gemini Hydrogen y la verifica un
agente con terminal.

## Objetivo

El taller ve solo lo que usa. Quedan **apagados**: comisiones, inspección por puntos, reloj por
tarea, catálogo de trabajos, estados de cuenta del banco e indicadores del taller. Quedan
**encendidos** (no se tocan): órdenes y tablero, clientes, vehículos, presupuestos y
autorización, trabajo adicional, avances y fotos, cobros (anticipo, entrega, retirada),
Finanzas básica (movimientos del taller), enlace del cliente, próximo servicio y sticker, seguro,
empleados, configuración. El parqueo sigue con su propio interruptor en la base.

## Diseño (decidido)

- **Una sola lista, por despliegue, sin tocar la base.** `src/config/modulos.ts` exporta el tipo
  `Modulo = 'comisiones' | 'inspeccion' | 'reloj' | 'catalogo' | 'estados_de_cuenta' |
  'indicadores'`, la función pura `modulosApagados(valor: string | undefined): ReadonlySet<Modulo>`
  (lee una lista separada por comas, ignora espacios y nombres desconocidos) y
  `moduloActivo(m: Modulo): boolean`, que lee `import.meta.env.VITE_MODULOS_APAGADOS`.
- **Producción los apaga con un archivo del repositorio:** `.env.production` con
  `VITE_MODULOS_APAGADOS=comisiones,inspeccion,reloj,catalogo,estados_de_cuenta,indicadores`.
  Vite lo carga solo al compilar para producción (también la compilación local de QA), así que
  Hostinger no necesita ninguna variable nueva. No lleva nada secreto. Comprueba que `.gitignore`
  no lo ignore (ignora `*.local`).
- **Desarrollo, Vitest y e2e quedan con todo encendido** (la variable no existe ahí): ninguna
  prueba existente cambia.
- **Apagar es esconder, no prohibir.** No se toca RLS, RPC ni triggers: la base sigue calculando
  (por ejemplo, las comisiones sugeridas) y nada se borra. Volver a encender es quitar el nombre
  de la lista y publicar.

## Qué se esconde con cada módulo

Haz primero el inventario leyendo el código (menú lateral y barra de abajo, rutas en `App.tsx`,
`TAB_SECTIONS` y `detail/sections/`, acciones rápidas, Configuración, Empleados, Finanzas, el
Panel, avisos, la Ayuda) y entrégalo en el informe como tabla «módulo → dónde aparece → cómo se
esconde». Guía:

- **comisiones:** la entrada «Comisiones» del menú y la ruta `/payroll`; «Mis comisiones» del
  técnico y su ruta; la sección «Reparto de la comisión» del detalle; el esquema de pago en
  Empleados; los avisos y pendientes de comisiones en el Panel. **No se esconde** el técnico de
  cada tarea ni la asignación (eso es organizar el trabajo).
- **inspeccion:** la inspección por puntos en el detalle (la Inspección 360° de la recepción se
  queda), su acción rápida, las plantillas en Configuración, su sección en el enlace del cliente.
- **reloj:** iniciar y detener el reloj en las tareas, los tiempos y las horas facturadas.
- **catalogo:** «Del catálogo» en el alta y en el detalle, y la tarjeta del catálogo en
  Configuración.
- **estados_de_cuenta:** la vista «Estados de cuenta» de Finanzas y la importación.
- **indicadores:** la vista «Indicadores del taller» de Finanzas.

Reglas:

- Una ruta de un módulo apagado redirige al panel (como hoy una ruta sin permiso), no deja una
  pantalla en blanco.
- Si al esconder algo una pestaña o sección queda vacía, se esconde también (usa lo que ya hace
  `sectionsOf` en `WorkOrderDetail.tsx`); si quedan menos de dos vistas en Finanzas, no se pinta
  el selector de vistas.
- Un solo punto de decisión por lugar (`moduloActivo('…')`), sin repetir la lista de módulos.
- El portal (`src/portal/`) no importa nada de la app: si hay que esconder la inspección allí,
  usa su propia lectura de `import.meta.env` en un archivo del portal.
- La Ayuda (`docs/manual-usuario*.md`) no se toca en esta orden: dilo en el informe si alguna
  sección del manual habla de un módulo apagado.

## Pruebas

- `src/config/modulos.test.ts`: la función pura (lista vacía, con espacios, con un nombre
  desconocido).
- Por cada módulo, una prueba de componente o de página que, con el módulo apagado
  (`vi.stubEnv('VITE_MODULOS_APAGADOS', '…')` y `vi.unstubAllEnvs()` al terminar), compruebe que
  su entrada no se pinta, y con todo encendido, que sí.
- Las pruebas existentes no cambian.

## Aceptación (la comprueba el verificador)

1. `npm run lint`, `npx tsc -b`, `npm test`, `npm run build`, `npm run test:e2e:local`: en verde.
2. Compilación de producción local (carga `.env.production`) recorrida en el navegador como
   administración y como técnico, a 1366 y a 390 px: ningún rastro de los seis módulos en menús,
   detalle de la orden, Finanzas, Configuración ni Empleados; `/payroll` y `/mis-comisiones`
   vuelven al panel; el flujo básico (alta, avance, entrega y cobro) funciona.
3. Con la variable vacía, capturas idénticas a las de antes en el menú, el detalle y Finanzas.

## Entrega

`docs/ordenes/q3-informe.md`: el inventario, los archivos tocados, las pruebas nuevas y lo que
viste dudoso.
