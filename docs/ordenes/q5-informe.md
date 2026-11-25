# Q5 — Un día en el taller: informe del jefe de obra (24 y 25/11/2026)

Orden: [q5-un-dia-en-el-taller.md](q5-un-dia-en-el-taller.md). Protocolo: [README.md](README.md). Hydrogen programó las tres
fases (informes suyos: [A](q5-hydrogen-A.md), [B](q5-hydrogen-B.md), [C](q5-hydrogen-C.md)); el jefe de obra las trajo al árbol
principal, las verificó y corrigió lo chico. Sin migraciones, sin edge functions, sin commits, nada contra el proyecto real
(todo contra `http://127.0.0.1:44321`; los builds se compilaron con la URL y la clave locales y se comprobó que apuntan a 127.0.0.1).

## 1. Qué quedó hecho

### Fase A — la prueba «un día en el taller»
- `e2e/un-dia-en-el-taller.spec.ts` (Hydrogen, ~490 líneas): una sola historia serial con `test.step` por paso. Recepción (cliente nuevo
  solo con nombre y teléfono, en inglés; vehículo nuevo; tarea con técnico y repuesto; sin depósito; queda en recepción y con enlace);
  autorización por el enlace a 390 px (aprueba la tarea, rechaza el repuesto con el diálogo del portal; pasa sola a «en proceso»);
  el técnico a 390 px (Mis tareas, «Tareas» abierta, marca hecha y se queda, avance visible con foto, termina; botones de 44 px);
  permisos del técnico (sin precios ni «Entregar»); administración («Marcar listo para entregar», «Entregar y cobrar» con zelle,
  saldo $0.00, «Entregada», total autorizado = cobrado en centavos enteros); y lo que queda (Finanzas con zelle, enlace en inglés
  «Picked up», avance publicado sin el nombre del técnico, PDF descargado `.pdf` > 0 bytes).
- Retoques del jefe de obra (todos de la prueba, ninguno cambió la app): selectores estrictos (`exact`/`.first()` donde el portal
  repite una etiqueta en dos secciones), la tolerancia de subpíxeles en los 44 px (el motor midió 43,9999), la miniatura de la foto
  (dos botones se llaman «Foto»), y el helper nuevo `chooseNewCustomerInIntake` en `e2e/fixtures.ts`.
- Ya corre en el trabajo `e2e` del CI (`npm run test:e2e:local` recoge todos los `*.spec.ts`); se le puso `timeout-minutes: 45` a
  ese trabajo (`.github/workflows/ci.yml`).

### Fase B — datos de ejemplo
- `npm run demo:cargar` y `npm run demo:borrar` (`scripts/demo/cargar.mjs`, `borrar.mjs`, `lib.mjs`; una función nueva en
  `scripts/lib/local-stack.mjs`; sección «Datos de ejemplo» en `docs/pruebas.md` §4).
- Se niega a correr si la URL no es de esta máquina (misma comprobación que `e2e-local`). Crea tres cuentas
  `demo-admin|mecanico|pintor@demo.restorify.test` (contraseña nueva por corrida, impresa y no guardada) y carga por esas sesiones,
  con las RPC de la app y sin insertar dinero: 12 clientes (6 en inglés, 6 en español, uno sin correo), 12 vehículos y 10 órdenes:
  recepción sin firma; esperando autorización (presupuesto enviado); 2 en proceso (una con avances, otra de un cliente sin correo);
  en espera por trabajo adicional; terminada; lista para entregar; 2 entregadas y cobradas (tarjeta y zelle); 1 retirada sin
  reparar. No usa comisiones, catálogo, reloj, inspección ni estados de cuenta.
- Todo lleva la marca « · demo». `demo:cargar` dos veces seguidas no duplica (dice que ya hay datos y sale con 0).
  `demo:borrar` (con la sesión del admin de demostración, por la API) borró 7 órdenes abiertas y 9 clientes y 9 vehículos; **archivó**
  las 3 entregadas (una entrega con dinero no se borra por diseño) y dejó sus 3 clientes y vehículos; es idempotente. Al volver a
  cargar, reutiliza esos 3 clientes y vehículos archivados.
- Corregido por el jefe de obra: las órdenes de los clientes en inglés tenían las líneas de trabajo en español, y el enlace en
  inglés las mostraba así (la traducción automática no corre en local). Ahora esas cuatro órdenes llevan sus líneas, repuestos y
  avance en inglés; comprobado en el DOM del enlace (cabecera en inglés, ningún texto en español en la orden en inglés).

### Fase C — sobras de la etapa 1
- **C1, Ayuda sin lo apagado.** `helpDoc.ts`: `prepareManual(markdown, role, apagados?)` quita los bloques `<!-- modulo: X -->` …
  `<!-- /modulo -->` de los módulos apagados (por defecto, los de `VITE_MODULOS_APAGADOS`); una marca abierta sin cerrar, un cierre
  sin abrir, un módulo desconocido o el mismo módulo anidado **lanzan un error** con la línea. 80 marcas en cada manual, misma secuencia en
  los dos idiomas (la prueba lo exige). Comprobado en el navegador con la compilación de producción (lista de seis módulos apagados), con
  admin y técnico en español e inglés: 18 secciones del admin y 14 del técnico; **cero menciones** de comisión, reloj, catálogo,
  inspección por puntos ni estados de cuenta, salvo dos del nombre literal de la categoría de Finanzas «Comisiones de banco y
  tarjeta» (es de la app y sigue encendida; la prueba lo declara como excepción). Con todo encendido la Ayuda es idéntica a la de hoy
  (prueba que compara contra el manual con las marcas quitadas a mano).
- **C2, plurales.** `src/lib/plural.ts` (`pluralKey`) y las claves `*One` / `*Many`; ya no queda «(s)» ni «(es)» en
  `translations.ts` (una aserción nueva en `translations.test.ts` lo vigila). Lista de claves antes → después en
  [q5-hydrogen-C.md](q5-hydrogen-C.md) §4; ~20 componentes y sus pruebas actualizados.
- **C3, `--repeat-each=3`.** Hecho; ver §2. Se encontraron y arreglaron tres fragilidades de las pruebas (§3).

## 2. Números de cada comando (árbol principal, 25/11/2026)

| Comando | Resultado |
|---|---|
| `npm run lint` | 0 avisos, 0 errores |
| `npx tsc -b` | limpio |
| `npm test` (Vitest) | 200 archivos, **1.400 de 1.400** (antes: 197 y 1.366) |
| `npm run build` (contra la base local) | limpio; el bundle apunta a 127.0.0.1:44321 y no contiene ningún proyecto `*.supabase.co` |
| `npm run test:functions` | 102 de 102 |
| e2e local completa (`npm run test:e2e:local`) | **87 de 87** (4,9 min; antes 86: se suma la nueva). Dos corridas completas seguidas con 87/87 |
| `un-dia-en-el-taller` con `--repeat-each=3` | **3 de 3** (2,2 min, 3 workers) |
| `qa-cobros` + `qa-workorders` con `--repeat-each=3` (COB-03, WORK-01, WORK-02 y sus hermanas) | **42 de 42**, 0 saltadas |
| `demo:cargar` → `demo:cargar` → `demo:borrar` → `demo:borrar` → `demo:cargar` | carga 12/12/10; la 2.ª dice que ya hay; borra 7 y archiva 3; la 2.ª dice que no hay; la 3.ª carga reutilizando 3 |

No se corrieron `test:db` ni `qa:security:local`: no hubo SQL ni permisos.

## 3. Lo que se arregló de raíz en las pruebas (la orden pedía arreglar de raíz lo que fallara con `--repeat-each=3`)

1. **WORK-04 se saltaba solo.** Contaba las órdenes de la lista al instante, antes de que llegaran por la red, y con la suite en
   paralelo daba «sin órdenes» y se saltaba. Ahora espera la primera orden (15 s) antes de dar por vacío el entorno.
2. **WORK-01/COB-03/`openIntakeDialog`.** Con muchas órdenes y avisos la página cambia de alto mientras carga; el botón «Nueva orden»
   quedaba bajo el encabezado fijo y el clic caía en la campana (60 s colgado). `openIntakeDialog` vuelve arriba antes de cada intento y
   solo toca mientras el diálogo no esté abierto. Y COB-03 (y la prueba nueva) perdían el diálogo entero después de abrirlo (se vio la
   lista de órdenes sin diálogo en el instante del fallo); el helper `chooseNewCustomerInIntake` lo vuelve a abrir si se perdió.
   **No se pudo demostrar la causa del diálogo perdido** (se sospecha una recarga del servidor de desarrollo de Vite la primera vez
   que baja un módulo diferido; no apareció en los registros); queda cubierto por el helper y, si reaparece en el CI, hay que
   mirar el registro de Vite.
3. **Medida de 44 px.** Un botón de 44 px midió 43,9999 y falló la comprobación: tolerancia de 0,1 px.

## 4. Capturas (`qa.local/q5/`, taller de ejemplo cargado, compilación local)

`panel-1366.png`, `panel-390.png`, `tablero-1366.png`, `tablero-390.png`, `lista-1366.png`, `lista-390.png`, `finanzas-1366.png`,
`finanzas-390.png`, `portal-es-1366.png`, `portal-es-390.png`, `portal-en-1366.png`, `portal-en-390.png`. Sin errores de consola en
escritorio ni en 390 px. Se revisaron a ojo el Panel a 1366, el tablero a 390 y el enlace en inglés a 390 (las demás por el DOM). El
enlace del cliente se abrió en una orden de cada idioma (ORD-2026-300 en español, ORD-2026-299 en inglés). Scripts: `qa.local/q5-capturas.mjs`,
`q5-portal-dom.mjs`, `q5-ayuda.mjs`.

## 5. Lo que no se cumplió o queda abierto

- **El Panel de ejemplo se ve revuelto** porque la base local trae ~300 clientes y ~180 órdenes activas de pruebas anteriores
  (`PWTEST`, `PRUEBA`): las 10 de ejemplo se pierden entre ellas. Para una demostración limpia: `npx supabase db reset` y después
  `npm run demo:cargar` (ya está dicho en `docs/pruebas.md`).
- **Las capturas son de la compilación anterior a la fase C** (solo cambió la Ayuda y los plurales); la Ayuda se verificó aparte con
  la compilación final.
- **Observación de interfaz, no corregida (fuera de la orden):** en `/work-orders`, con muchos avisos de «Trabajo adicional por
  revisar», el contenido salta de lugar mientras carga y el encabezado fijo tapa lo que se desplaza a la vista. Un
  `scroll-padding-top` igual a la altura del encabezado sería la solución de la app (también ayuda al teclado, WCAG 2.4.11).
- **Hydrogen:** la primera corrida de la fase C murió sin dejar salida (la sesión del jefe de obra se interrumpió); se relanzó con
  una orden de continuación («no empieces de cero», con lo ya hecho) y cerró bien. Las fases A y B salieron en una pasada, con
  1 a 3 correcciones chicas cada una.
- **La máquina:** una corrida de 56 pruebas tardó 1 h por falta de memoria (1,3 GB libres de 15,7); sus tres
  fallos eran por esa lentitud y no se repitieron con la máquina libre.
- **Datos de ejemplo:** la base local quedó con las 3 órdenes entregadas archivadas y sus 3 clientes y vehículos « · demo» (por diseño
  no se borran); las cuentas `demo-*@demo.restorify.test` también quedan.

## 6. Archivos tocados

- Fase A: `e2e/un-dia-en-el-taller.spec.ts` (nuevo), `e2e/fixtures.ts` (`openIntakeDialog` y `chooseNewCustomerInIntake`),
  `e2e/qa-cobros.spec.ts`, `e2e/qa-workorders.spec.ts`, `.github/workflows/ci.yml`.
- Fase B: `scripts/demo/{cargar,borrar,lib}.mjs` (nuevos), `scripts/lib/local-stack.mjs`, `package.json`, `docs/pruebas.md`.
- Fase C: `src/features/help/helpDoc.ts` y `.test.ts`, `src/config/modulos.ts`, `docs/manual-usuario.md`, `docs/manual-usuario.en.md`,
  `src/lib/plural.ts` y `.test.ts`, `src/i18n/translations.ts` y `.test.ts`, y los componentes y pruebas que usaban claves con «(s)».
- Informes: `docs/ordenes/q5-hydrogen-{A,B,C}.md` y este.
