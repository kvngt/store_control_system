# Orden Q1 — Recorrido de calidad contra la vara comercial

Parte de la etapa 1 de [plan-arquitectura-2026-11.md](../plan-arquitectura-2026-11.md). La
escribe el arquitecto; la ejecutan agentes con navegador (uno por papel). **Es solo
observación: no se cambia código de la app.**

## Objetivo

Recorrer el flujo completo de un taller de una sede como lo haría una persona, y anotar cada
tropiezo contra la vara de calidad, con evidencia, para que el arquitecto decida qué se arregla.

## La vara

1. **El flujo corre sin ayuda:** un solo botón principal por paso, ningún callejón sin salida,
   ningún dato que se escriba dos veces.
2. **Teléfono y escritorio:** a 390 px nada se corta, se encima ni pide zoom; lo que se toca
   mide 44 px o más.
3. **Nada se pierde y todo contesta:** respuesta visible en menos de un segundo; lo escrito
   sobrevive a «atrás» y a recargar; los errores dicen qué pasó y qué hacer.
4. **Todo se ve del mismo programa:** mismos componentes, espacios y estados (cargando, vacío,
   error); sin palabras del sistema; español e inglés completos.
5. **Lo que sale hacia afuera se ve profesional:** PDF, enlace del cliente, textos al cliente.
6. **Solo se ve lo que el taller usa.** Estos módulos se van a apagar (orden Q3): comisiones,
   inspección por puntos, reloj por tarea, catálogo de trabajos, estados de cuenta del banco e
   indicadores. **No los recorras ni reportes sus defectos**; sí reporta si estorban en el flujo
   básico (por ejemplo, un botón suyo en medio de la recepción).

## Entorno (solo local; nunca producción)

- App compilada servida en `http://localhost:4173` (si no responde:
  `npx vite preview --outDir qa.local/dist-local --port 4173 --strictPort` en segundo plano; **no
  la recompiles**, ya está compilada contra la base local).
- Supabase local en `http://127.0.0.1:44321`. Si no responde, Docker Desktop está apagado: dilo
  y detente.
- Arnés de Playwright en `qa.local/` (carpeta ignorada por git): `browser.mjs` (`openBrowser({
  mobile })`, `login(page, 'A' | 'M')`, `makePhotos`, `drawSignature`), `dom.mjs` (`describe(page)`
  lista los campos y botones del diálogo abierto) y `lib.mjs` (llamadas a la API con sesión).
  Cuentas: `'A'` administración, `'M'` mecánico. Ejemplos que funcionan: `qa.local/r13.mjs` (alta
  completa en cuatro pasos, detalle, técnico, portal), `r15.mjs`, `r16.mjs`. Ejecuta los scripts
  desde la raíz del repositorio (`node qa.local/tu-script.mjs`).
- Capturas en `qa.local/shots/q1-<papel>-<nn>-<tema>.png`. Mira tus propias capturas (herramienta
  Read) antes de afirmar algo sobre cómo se ve una pantalla.
- Prohibido: tocar `src/`, `supabase/`, `e2e/`; leer `.env.local` o cualquier `*.local`; hacer
  commits; cualquier comando contra el proyecto real (`--remote`, `db push`, `functions deploy`).

## Papeles

**Papel A — Administración** (escritorio 1366 px y teléfono 390 px). Con datos nuevos (prefijo
`PRUEBA Q1`): recibir un carro con cliente y vehículo nuevos (los cuatro pasos, con un trabajo, un
repuesto y un depósito); cotizar y registrar la autorización; asignar al mecánico; ver la lista y
el tablero; agregar un trabajo después; registrar un anticipo; marcar terminada y lista para
entregar; entregar y cobrar; revisar Finanzas (el cobro aparece); Clientes y Vehículos (buscar,
editar); Configuración (datos del taller); descargar el PDF de la orden y mirarlo; compartir el
enlace del cliente. Probar también: «atrás» y recargar a medio alta, un campo obligatorio vacío,
un teléfono inválido, una placa repetida.

**Papel B — Técnico y cliente** (teléfono 390 px). Como mecánico `'M'`, sobre una orden que le
asignes por la API o que deje el papel A: entrar, encontrar su trabajo («Mis tareas»), registrar
un avance con foto y otro con texto, reportar un trabajo adicional, marcar la tarea hecha,
terminar la orden; qué ve cuando no hay nada autorizado; avisos (campana). Como cliente, en el
enlace de la orden (`/r/<token>`, el token sale de `orden_enlaces` con la sesión de admin, ver
`r13.mjs`): estado, avances y fotos, presupuesto (aprobar una parte), cuenta, cambio de idioma
inglés/español, enlace vencido o inventado.

## Entrega

Un archivo por papel: `docs/ordenes/q1-informe-administracion.md` y
`docs/ordenes/q1-informe-tecnico-y-cliente.md`. Cada uno:

1. **Resumen** (5 líneas): qué tan cerca está de la vara y los tres tropiezos más graves.
2. **Hallazgos**, del más grave al menos grave, máximo 25, cada uno con: identificador (`A-01`,
   `B-01`…), gravedad (**Alta**: rompe o frena el flujo, pierde datos o muestra algo falso;
   **Media**: confunde o hace perder tiempo; **Baja**: se ve mal o desentona), criterio de la vara
   (1 a 6), dónde (pantalla y ancho), pasos para repetirlo, qué pasó, qué debería pasar, captura,
   y el archivo de `src/` donde probablemente está (búscalo con Grep; si no lo encuentras, dilo).
3. **Lo que está bien** (5 a 10 líneas): lo que ya cumple la vara, para no tocarlo.
4. **Lo que no pudiste probar** y por qué.

Reglas del informe: solo lo que viste (con captura o salida de consola); nada de suposiciones;
un defecto por hallazgo; español claro. No incluyas nombres reales, correos ni teléfonos reales.
