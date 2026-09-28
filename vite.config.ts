import { readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

import { sentryVitePlugin } from '@sentry/vite-plugin'

/**
 * The newest migration in `supabase/migrations`, stamped into the bundle.
 *
 * The running app compares this against what the database reports (see
 * `src/lib/schemaVersion.ts`) so a build deployed ahead of its migrations says
 * so, instead of failing one screen at a time with unrelated "not found"
 * errors — which is exactly how it went wrong once.
 *
 * Read here rather than with `import.meta.glob`: globbing the folder pulls the
 * .sql files into the module graph, and the bundler then tries to parse them as
 * JavaScript. Resolving it in the config keeps it a plain string with no
 * runtime cost.
 */
function newestMigrationVersion(): string {
  try {
    const dir = fileURLToPath(new URL('./supabase/migrations', import.meta.url))
    const versions = readdirSync(dir)
      .map((file) => /^(\d{14})_.*\.sql$/.exec(file)?.[1])
      .filter((v): v is string => !!v)
      .sort()
    return versions[versions.length - 1] ?? ''
  } catch {
    // No migrations folder (a consumer building only the front-end). The check
    // turns itself off rather than reporting a drift it cannot measure.
    return ''
  }
}

/**
 * Warns when a production bundle is built without `VITE_PUBLIC_SITE_URL`.
 *
 * Vite inlines the variable at build time, so a bundle built without it falls
 * back to `window.location.origin` forever — that is how the shop ended up
 * emailing password-recovery links to `http://localhost:3000`. Setting the
 * variable afterwards changes nothing until the site is rebuilt and reuploaded.
 *
 * A warning, not an error: `vite build` is also how a throwaway preview gets
 * made, and that does not deserve to fail.
 */
function warnMissingSiteUrl(value: string | undefined): Plugin {
  return {
    name: 'restorify:warn-missing-site-url',
    apply: 'build',
    buildStart() {
      if (value) return
      this.warn(
        'VITE_PUBLIC_SITE_URL no está definida: los enlaces de recuperación de ' +
          'contraseña de este bundle apuntarán al origen desde donde se pidan. ' +
          'Defínela antes de compilar para producción (docs/password-reset.md).',
      )
    },
  }
}

/**
 * Warns when a production bundle is built without `VITE_VAPID_PUBLIC_KEY`.
 *
 * Same trap as the site URL: Vite inlines it at build time, so a bundle built without it
 * ships push with no key, and every phone reads "Las notificaciones push no están
 * configuradas en este servidor" — even though the server side (the private key and the
 * `process-outbox` function) is complete. That is exactly what the published site did in
 * September 2026: the push code was in the bundle and the key was not.
 */
function warnMissingVapidKey(value: string | undefined): Plugin {
  return {
    name: 'restorify:warn-missing-vapid-key',
    apply: 'build',
    buildStart() {
      if (value) return
      this.warn(
        'VITE_VAPID_PUBLIC_KEY no está definida: en este bundle las notificaciones push ' +
          'dirán "no están configuradas en este servidor". Defínela antes de compilar para ' +
          'producción (docs/multimedia-y-notificaciones.md).',
      )
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  return {
  define: {
    __SCHEMA_VERSION__: JSON.stringify(newestMigrationVersion()),
  },
  plugins: [
    react(),
    warnMissingSiteUrl(env.VITE_PUBLIC_SITE_URL),
    warnMissingVapidKey(env.VITE_VAPID_PUBLIC_KEY),
    sentryVitePlugin({
      org: "restorify",
      project: "restorify-frontend",
    })
  ],
  }
})
