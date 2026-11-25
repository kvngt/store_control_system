# Q5 — Un día en el taller (orden del arquitecto, 24/11/2026)

Lo escribe el arquitecto para el jefe de obra. El protocolo es [README.md](README.md). El plan es el
[plan de arquitectura](../plan-arquitectura-2026-11.md), etapa 1, Q5. Es el último paquete de la
etapa: deja amarrado todo lo que arreglaron Q2 a Q4, para que no vuelva a romperse sin que nadie
se entere.

## Objetivo

1. **Una prueba de punta a punta que recorre el flujo entero por la pantalla**, como lo vive el
   taller, y que corre en local y en el CI.
2. **Datos de ejemplo que se cargan con un comando**, para enseñar el programa (a un técnico nuevo,
   al dueño, en una demostración) sin tocar datos reales.
3. **Las sobras de la etapa 1** que quedaron anotadas.

## Fase A — la prueba «un día en el taller»

Va en el archivo `e2e/un-dia-en-el-taller.spec.ts`. Usa las piezas de `e2e/fixtures.ts`
(`openIntakeDialog`, `isLocalStack`) y `e2e/localData.ts`, y lleva `test.skip(!isLocalStack, …)`
porque entrega y cobra. Es **una sola historia en orden**, con `test.describe.serial`. Cada paso es un
`test.step` con el nombre que vería el taller.

1. **Recepción (administración, escritorio).**
   - Cliente nuevo con solo nombre y teléfono, y su idioma: inglés.
   - Vehículo nuevo, con una placa única por corrida.
   - Una tarea de mano de obra con su técnico (mecanico-a) y un repuesto.
   - Sin depósito.
   - Se comprueba que la orden queda en recepción y que se creó el enlace del cliente.
2. **Autorización del cliente por su enlace (navegador del cliente, 390 px).**
   - Se abre el enlace de la orden.
   - Se aprueba la tarea y se rechaza el repuesto con el diálogo propio del portal.
   - Se comprueba el resumen de lo aprobado y que la orden pasó sola a «en proceso».
3. **El técnico trabaja (mecanico-a, 390 px).**
   - Ve la orden en «Mis tareas».
   - Al entrar, «Tareas» está abierta.
   - Marca la tarea hecha, que se queda en su lugar.
   - Registra un avance visible para el cliente, con una foto real de `makePhotos` o un archivo de
     prueba.
   - Termina la orden.
3b. **Los permisos del técnico.** En la misma sesión, el técnico no ve precios ni el botón de
    entregar.
4. **Administración cierra (escritorio).**
   - Ve la orden en «Requiere atención» o en su lista.
   - El botón principal es «Marcar listo para entregar»; lo toca.
   - Después, «Entregar y cobrar» con método «zelle».
   - Se comprueba que el saldo queda en $0.00 y que la orden está «Entregada».
5. **Lo que queda.**
   - En Finanzas aparece el ingreso de la orden con su método.
   - El enlace del cliente dice «Entregado», muestra el avance publicado y no muestra el nombre del
     técnico.
   - El PDF se descarga sin error.

**Reglas de la prueba:**
- todo por la pantalla, con selectores de rol o de texto visible (no clases internas);
- una consulta a la base local solo para comprobar el dinero (que el total autorizado y el cobrado
  coinciden), por el mismo camino que usan las otras e2e locales;
- sin `waitForTimeout` fijos;
- datos únicos por corrida, para poder repetirla;
- tiene que pasar 3 veces seguidas con `--repeat-each=3` y en la suite completa en paralelo.

## Fase B — datos de ejemplo

**El comando.** `npm run demo:cargar`, con un script `scripts/demo/cargar.mjs`:
- **Se niega a correr si la URL no es de esta máquina** (127.0.0.1 o localhost), con la misma
  comprobación que `scripts/e2e-local.mjs` (`scripts/lib/local-stack.mjs`). Nunca contra
  producción.
- **Crea un taller de ejemplo creíble y bilingüe**, con nombres inventados:
  - unos 12 clientes (la mitad en inglés, uno sin correo);
  - sus vehículos;
  - unas 10 órdenes repartidas por todos los estados: recepción sin firma, esperando autorización,
    en proceso con avances, en espera por un trabajo adicional, terminada, lista para entregar,
    entregada y cobrada, y una retirada sin reparar.
- **Pasa por las mismas RPC que la app** (`create_work_order`, `enviar_presupuesto`,
  `registrar_autorizacion`, `marcar_lista_para_entregar`, `entregar_orden`, `retirar_sin_reparar`…),
  iniciando sesión como las cuentas QA. **Nunca inserta dinero a mano:** los totales y los
  movimientos los asienta la base.
- **Es reconocible y se puede volver a cargar:**
  - todo lo que crea lleva una marca, por ejemplo clientes cuyo nombre termina en «· demo» o una nota
    fija;
  - `npm run demo:borrar` quita solo lo marcado, respetando las reglas (lo entregado se archiva, no
    se borra). Si borrar algo no se puede por diseño, se dice en la salida.
- **Respeta los módulos apagados:** no crea comisiones a mano ni usa el catálogo, el reloj ni la
  inspección por puntos.

**Documentación.** En `docs/pruebas.md` va cómo se usa, y en la bitácora queda la línea para quien
retome.

## Fase C — sobras de la etapa 1

1. **La Ayuda no habla de lo que está apagado.**
   - En `docs/manual-usuario.md` y `.en.md`, cada bloque que describe un módulo apagable se marca con
     comentarios HTML: `<!-- modulo: comisiones -->` … `<!-- /modulo -->`. Los módulos son los mismos
     de `src/config/modulos.ts`.
   - `src/features/help/helpDoc.ts` quita los bloques de los módulos apagados antes de pintar.
   - Pruebas:
     - con todo encendido, la Ayuda es la de hoy;
     - con la lista de producción, no aparece «comisión», «reloj», «catálogo» ni «inspección por
       puntos» en las secciones que se quitaron;
     - `helpDoc.test.ts` sigue exigiendo la misma estructura en los dos idiomas, y una marca abierta sin
       cerrar hace fallar la prueba.
   - La lista de qué secciones tocan está en [q3-informe.md](q3-informe.md) §3.
2. **Los 22 textos con «(s)» de `src/i18n/translations.ts`** pasan a singular y plural de verdad,
   como el resto de la app.
3. **Repetir las e2e con `--repeat-each=3`** sobre COB-03, WORK-01 y WORK-02 (quedó sin verificar el
   17/11). Si alguna falla, se arregla de raíz.

## Límites

- Sin migraciones ni edge functions. Si algo de verdad las necesita, se detiene y se anota.
- La prueba y los datos de ejemplo corren solo contra la base local. Nada contra el proyecto real.
- No se suma dinero en el navegador ni en el script.

## Aceptación

1. La prueba «un día en el taller» pasa:
   - en local, 3 de 3 con `--repeat-each=3`;
   - en la suite completa en paralelo;
   - y queda dentro del trabajo `e2e` del CI (`.github/workflows/ci.yml`). Si hace falta, se ajusta
     su tiempo.
2. `npm run demo:cargar` sobre la base local deja el taller de ejemplo:
   - se ve completo en el Panel, en Órdenes (lista y tablero) y en Finanzas;
   - el enlace del cliente funciona en una orden de cada idioma;
   - `demo:borrar` lo quita.
   - Captura del Panel y del tablero a 1366 y 390 px.
3. La Ayuda con la lista de producción no menciona los módulos apagados. Con todo encendido no
   cambia.
4. Verificación completa:
   - lint, `tsc -b`, Vitest, build y `test:functions`;
   - e2e local completa;
   - el `--repeat-each=3` de la fase C.
