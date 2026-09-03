# Guía de Despliegue (Producción)

Restorify es una SPA (Single Page Application) en React + Vite apoyada por Supabase (BaaS). Sigue estos pasos para desplegar la aplicación de manera confiable en producción.

## 1. Separación de Entornos (Staging vs Producción)

Para garantizar la integridad de los datos, el proyecto requiere dos proyectos separados en Supabase:
- **Restorify Staging**: Para QA, pruebas E2E (Playwright) y experimentación de desarrollo.
- **Restorify Producción**: Exclusivo para usuarios reales.

### Pasos en Supabase:
1. Crea un nuevo proyecto en Supabase para Producción.
2. Migra el esquema actual usando el CLI de Supabase:
   ```bash
   supabase login
   supabase link --project-ref [REFERENCIA_PROYECTO_PRODUCCION]
   supabase db push
   ```
3. Aplica los seeders mínimos (ej. creación del primer Admin) o configura los disparadores (Triggers) de autenticación iniciales si existen.

## 2. Variables de Entorno

Configura las siguientes variables de entorno en la plataforma de hosting (ej. Vercel, Netlify, Cloudflare Pages):

```env
VITE_SUPABASE_URL=https://[PROYECTO_PRODUCCION].supabase.co
VITE_SUPABASE_ANON_KEY=[TU_ANON_KEY_DE_PRODUCCION]
VITE_SENTRY_DSN=[TU_DSN_DE_SENTRY_PRODUCCION] (Opcional pero recomendado)
```

## 3. Integración Continua (CI/CD)

Es recomendable usar **GitHub Actions** para:
1. Correr el Linter (`npm run lint`) y Typecheck (`npx tsc --noEmit`) en cada Pull Request.
2. Ejecutar la suite de QA E2E (`npx playwright test`) contra el entorno de **Staging** antes de aprobar un Pull Request a `main`.

Un flujo básico de GitHub Actions (`.github/workflows/deploy.yml`) luce así:

```yaml
name: CI/CD Pipeline
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: 18
      - run: npm ci
      - run: npm run lint
      - run: npx tsc --noEmit
      - run: npx playwright install --with-deps
      - run: npx playwright test
        env:
          VITE_SUPABASE_URL: ${{ secrets.STAGING_SUPABASE_URL }}
          VITE_SUPABASE_ANON_KEY: ${{ secrets.STAGING_SUPABASE_ANON_KEY }}
```

## 4. Hosting Frontend

Para desplegar en **Vercel** o **Netlify**:
- Build Command: `npm run build`
- Output Directory: `dist`
- Install Command: `npm install`
- Enrutamiento: Al ser una aplicación React (cliente), recuerda configurar las reglas de reescritura para devolver `index.html` en todas las rutas para que funcione react-router. (Vercel lo hace automáticamente en proyectos de Vite).
