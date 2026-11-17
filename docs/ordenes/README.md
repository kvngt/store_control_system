# Órdenes de trabajo

Aquí viven las órdenes que escribe el arquitecto y los informes que devuelven los agentes. El
plan que las ordena es [plan-arquitectura-2026-11.md](../plan-arquitectura-2026-11.md); el estado
de cada una, la [bitácora](../bitacora.md).

| Archivo | Qué es |
|---|---|
| `q1-recorrido-de-calidad.md` | Orden del recorrido de calidad; sus informes: `q1-informe-administracion.md`, `q1-informe-tecnico-y-cliente.md` |
| `q2-prioridades.md` | Qué se arregla del recorrido, en qué orden y con qué diseño (tandas 0 a 4) |
| `q3-modulos-apagados.md` | Orden de los módulos apagados para este taller |

## Protocolo del jefe de obra

Un **jefe de obra** es un agente con terminal (Sonnet) que lleva una orden de principio a fin:
hace programar a Gemini Hydrogen, trae su entrega, la verifica, corrige lo que falle y devuelve
la evidencia al arquitecto. No cambia el diseño de la orden: si el diseño no se puede cumplir,
se detiene y lo dice.

**Reglas que no se rompen**

- Nunca contra el proyecto real: nada de `--remote=<proyecto>`, `supabase db push`,
  `functions deploy` ni push a `main`. Nunca commits. Nunca leer `.env.local` ni otros `*.local`
  (la carpeta `qa.local/` sí). A Hydrogen nunca se le pasan datos de clientes ni secretos.
- Un solo jefe de obra a la vez: comparten la copia de Hydrogen, la base local y los puertos.
- Si Docker o la base local (`http://127.0.0.1:44321`) no responden, se detiene y lo dice.

**Carpetas** (Git Bash)

```bash
R="/c/Users/Kevin Godinez/Documents/devr/store_control_system"   # árbol principal: aquí se verifica
W="/c/Users/Kevin Godinez/Documents/devr/restorify-hydrogen"     # copia de Hydrogen (rama hydrogen)
T="$TEMP/obra"; mkdir -p "$T"                                     # parches y salidas
```

**1. Igualar la copia de Hydrogen con el árbol principal** (lleva también lo que no tiene commit):

```bash
cd "$R" && git status --short > "$T/principal-antes.txt"
cd "$R" && git add -A && git diff --cached --binary HEAD > "$T/estado.patch" && git reset -q
cd "$W" && git fetch -q "$R" main && git reset -q --hard FETCH_HEAD \
  && git clean -fdq -e _auditoria -e _esquema-vigente.sql \
  && { [ -s "$T/estado.patch" ] && git apply "$T/estado.patch"; true; } \
  && git add -A -- . ":(exclude)_auditoria" ":(exclude)_esquema-vigente.sql"
```

**2. Escribir la orden para Hydrogen** en `$T/orden.md`. Empieza siempre así:

> Eres el programador del proyecto. CARPETA DE TRABAJO:
> `C:\Users\Kevin Godinez\Documents\devr\restorify-hydrogen`. Edita SOLO archivos dentro de esa
> carpeta. NUNCA abras ni edites nada en `…\store_control_system`. No puedes ejecutar comandos:
> un verificador correrá lint, tipos y pruebas. Lee `AGENTS.md` y `docs/ai-context.md`.

Después: qué hacer (la tanda, con sus decisiones de diseño copiadas tal cual), qué archivos puede
tocar, qué pruebas escribir (con los tres vicios de siempre: `// @vitest-environment jsdom` en la
primera línea donde se usa el DOM, mocks con el tipo correcto, búsquedas por un texto o rol que de
verdad se pinta) y qué informe dejar.

**3. Correr a Hydrogen** (tarda de 5 a 20 minutos; en segundo plano y esperar a que termine):

```bash
cd "$W" && agy --mode accept-edits --model gemini-4-hydrogen-high -p "$(cat "$T/orden.md")" > "$T/salida.txt" 2>&1
```

**Si Hydrogen se cuelga.** Una caída de red lo deja vivo pero sin avanzar, y no avisa (pasó el
16/11/2026: cuatro horas parado). Mientras corre, mira cada 10 minutos cuándo cambió por última vez
un archivo de su copia (`cd "$W" && git status --short`, y la hora de esos archivos). Si pasan 15
minutos sin cambios y no terminó, detén el proceso y relánzalo con una orden de continuación: que
NO empiece de cero, la lista de archivos que ya tocó, y que revise lo hecho y termine lo que falta.

**4. Traer la entrega al árbol principal** y comprobar que Hydrogen no tocó el árbol principal:

```bash
cd "$R" && git status --short > "$T/principal-despues.txt" && diff -q "$T/principal-antes.txt" "$T/principal-despues.txt"
cd "$W" && git add -N . 2>/dev/null; git diff --binary -- . ":(exclude)_auditoria" ":(exclude)_esquema-vigente.sql" > "$T/entrega.patch"
cd "$R" && git apply "$T/entrega.patch"
```

**5. Verificar en el árbol principal** (lo que aplique a la orden):

```bash
npm run lint && npx tsc -b && npm test && npm run build && npm run test:functions
U="postgresql://postgres:postgres@127.0.0.1:44322/postgres?sslmode=disable"
npx -y supabase@3 migration up --remote="$U" --yes            # si hay migración (base LOCAL)
npx -y supabase@3 test db --remote="$U" --yes <archivo.sql>   # pgTAP del archivo tocado
SUPABASE_DB_URL="$U" npm run db:types && SUPABASE_DB_URL="$U" npm run db:schema
E2E_SUPABASE_URL=http://127.0.0.1:44321 npm run test:e2e:local -- --reporter=line
E2E_SUPABASE_URL=http://127.0.0.1:44321 npm run qa:security:local
```

Pantallas: compilar contra la base local y recorrer con el arnés de `qa.local/` (ver
`q1-recorrido-de-calidad.md`), con capturas de antes y después en escritorio y a 390 px:

```bash
ANON=$(npx -y supabase@3 status -o env 2>/dev/null | sed -n 's/^ANON_KEY="\?\([^"]*\)"\?/\1/p')
VITE_SUPABASE_URL=http://127.0.0.1:44321 VITE_SUPABASE_ANON_KEY="$ANON" npx vite build --outDir qa.local/dist-local
```

**6. Corregir.** Lo chico (un import, una aserción, un selector) lo arregla el jefe de obra. Lo
que sea programar de nuevo vuelve a Hydrogen con el error real pegado (pasos 1 a 4 otra vez).
Como mucho dos vueltas; si no cierra, se detiene y lo dice.

**7. Entregar.** Un informe en `docs/ordenes/<orden>-informe.md` con: qué quedó hecho de cada
punto, los archivos tocados, los números de cada comando de verificación, las capturas, y lo que
no se pudo cumplir. El mensaje final al arquitecto, en 15 líneas como máximo.
