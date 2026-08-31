import type { Page } from '@playwright/test';

// Credentials come from .env.test.local (see .env.test.example) — never
// hardcoded, and tests that need them skip themselves when absent so the
// suite still runs (minus the credentialed tests) with zero setup.
export const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL;
export const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD;
export const MECHANIC_EMAIL = process.env.E2E_MECHANIC_EMAIL;
export const MECHANIC_PASSWORD = process.env.E2E_MECHANIC_PASSWORD;

export const hasAdminCredentials = Boolean(ADMIN_EMAIL && ADMIN_PASSWORD);
export const hasMechanicCredentials = Boolean(MECHANIC_EMAIL && MECHANIC_PASSWORD);

// Data created by a test run against the real Wells Fargo... er, real
// Supabase project (there's no separate staging project yet) should always
// carry this prefix, so it's unmistakable and easy to find/clean up by hand
// if a test fails mid-way before its own cleanup runs.
export const TEST_DATA_PREFIX = 'PWTEST';

export async function login(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.fill('#login-email', email);
  await page.fill('#login-password', password);
  await page.click('#login-submit');
  await page.waitForURL('/');
}
