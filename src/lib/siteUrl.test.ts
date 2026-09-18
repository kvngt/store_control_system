/**
 * @vitest-environment jsdom
 *
 * Needs a DOM because the fallback path reads `window.location.origin` — which
 * is the branch that emailed the shop a `localhost:3000` recovery link.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getPasswordResetRedirect, getPublicSiteUrl } from './siteUrl';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('getPublicSiteUrl', () => {
  it('uses the configured site URL over the current origin', () => {
    vi.stubEnv('VITE_PUBLIC_SITE_URL', 'https://reinventa.shop');
    expect(getPublicSiteUrl()).toBe('https://reinventa.shop');
  });

  it('drops a trailing slash', () => {
    // Supabase matches Redirect URLs exactly, so a stray slash is a silent
    // rejection that falls back to the panel's Site URL.
    vi.stubEnv('VITE_PUBLIC_SITE_URL', 'https://reinventa.shop/');
    expect(getPublicSiteUrl()).toBe('https://reinventa.shop');
  });

  it('ignores a value without a scheme', () => {
    vi.stubEnv('VITE_PUBLIC_SITE_URL', 'reinventa.shop');
    expect(getPublicSiteUrl()).toBe(window.location.origin);
  });

  it('falls back to the current origin when unset', () => {
    vi.stubEnv('VITE_PUBLIC_SITE_URL', '');
    expect(getPublicSiteUrl()).toBe(window.location.origin);
  });
});

describe('getPasswordResetRedirect', () => {
  it('points at /reset-password on the configured site', () => {
    vi.stubEnv('VITE_PUBLIC_SITE_URL', 'https://reinventa.shop');
    expect(getPasswordResetRedirect()).toBe('https://reinventa.shop/reset-password');
  });
});
