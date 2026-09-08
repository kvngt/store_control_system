import { readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
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

// https://vite.dev/config/
export default defineConfig({
  define: {
    __SCHEMA_VERSION__: JSON.stringify(newestMigrationVersion()),
  },
  plugins: [
    react(),
    sentryVitePlugin({
      org: "restorify",
      project: "restorify-frontend",
    })
  ],
})
