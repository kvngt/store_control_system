# AI Context & Guidelines (Restorify)

This document contains the foundational architecture, conventions, and context for Restorify. Any AI agent joining this project should read this document to understand the codebase context before making modifications.

## 1. Golden Rules
1. **Nunca modifiques la lógica de RLS (Row Level Security) directamente desde el Frontend.** Toda regla de seguridad pertenece a Supabase (`supabase/migrations`).
2. **Estilado Puro:** El proyecto no utiliza TailwindCSS ni bibliotecas de componentes (MUI/Ant). Todo se estiliza usando CSS puro en `src/styles/components.css` y variables de tema (Dark/Light).
3. **Roles Estrictos:** El proyecto se basa en una arquitectura Multi-tenant por sede. Los usuarios están aislados por `sede_id`. Los roles son `admin`, `mecanico`, y `pintor`.

## 2. Architecture Overview
- **Frontend Framework:** React + Vite + TypeScript.
- **Backend/Database:** Supabase (PostgreSQL).
- **State Management:** React Context (`LanguageContext`, `ThemeContext`, `AuthContext`, `ToastContext`, `UnsavedChangesContext`).
- **Data Fetching:** Se centraliza en `src/services/supabaseService.ts`. Ningún componente debe realizar queries de Supabase directamente; deben pasar por los métodos del servicio.
- **Internationalization (i18n):** Se maneja mediante un objeto en memoria en `src/i18n/translations.ts`. Se usa el hook `useLanguage().t(key)`.

## 3. UI/UX Patterns
- **Modales:** Se prefiere el uso de modales controlados en React (con `modal-overlay` y `modal`) sobre diálogos del navegador (`prompt`, `alert`).
- **Feedback:** Todas las operaciones asíncronas deben proveer feedback usando `showToast('success' | 'error', title, message)`.
- **Carga (Loading states):** El estado de la UI debe bloquear o deshabilitar botones (`disabled={loading}`) mientras ocurre una mutación en base de datos.

## 4. End-to-End Testing (QA)
- Las pruebas se encuentran en `e2e/`. Usamos **Playwright**.
- Para que las pruebas corran de forma aislada, es necesario configurar las variables de entorno para pruebas en `.env.test.local` y usar credenciales de prueba con el rol adecuado.
- Nunca correr las pruebas mutativas (crear/borrar órdenes o sedes) apuntando a la base de datos de Producción sin un prefijo seguro en la data.

## 5. Deployment & Error Tracking
- El proyecto usa Sentry (`@sentry/react` y `@sentry/vite-plugin`) para el rastreo de errores en frontend.
- Se asume un despliegue sin servidor (Serverless) a través de Vercel, Netlify o GitHub Pages.
