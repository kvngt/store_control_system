import { defineConfig, devices } from '@playwright/test';

try {
  process.loadEnvFile('.env.test.local');
} catch {
  // Optional — tests that need real credentials just skip themselves
  // when the vars aren't set (see e2e/fixtures.ts).
}

const baseURL = process.env.E2E_BASE_URL || 'http://localhost:5173';

/**
 * Whether `baseURL` is a dev server on this machine.
 *
 * There is no staging project: the e2e suite always talks to the real Supabase
 * project, and specs like `customer-crud.spec.ts` create and delete real rows.
 * Pointing the browser at the published site on top of that means a routine
 * `npm run test:e2e` drives production, which is not something anyone should
 * do by accident — and `reuseExistingServer` makes it silent, because the
 * published site answers and no dev server is ever started.
 */
const isLocal = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/i.test(baseURL);

if (!isLocal && !process.env.E2E_ALLOW_REMOTE) {
  throw new Error(
    `E2E_BASE_URL apunta a ${baseURL}, que no es un servidor local. La suite escribe ` +
      'en el proyecto real: ejecútala contra http://localhost:5173, o define ' +
      'E2E_ALLOW_REMOTE=1 si de verdad quieres manejar el sitio publicado.',
  );
}

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // Every spec logs in with a password, and the whole suite shares a handful of
  // accounts. Six workers racing on one account hits Supabase's auth rate limit,
  // and a throttled login looks exactly like a broken screen.
  workers: process.env.CI ? undefined : 3,
  reporter: 'html',
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  // Only start a dev server when we are the ones serving the app.
  ...(isLocal
    ? {
        webServer: {
          command: 'npm run dev',
          url: baseURL,
          reuseExistingServer: !process.env.CI,
          timeout: 30_000,
        },
      }
    : {}),
});
