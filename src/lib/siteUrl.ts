/**
 * Where a password-recovery link should send people back to.
 *
 * This used to be `window.location.origin`, which is right exactly once: when
 * the person requesting the reset is on the deployed site. It is wrong every
 * other time, and the shop hit the common case — the request went out from a
 * dev server, so Supabase emailed a link to `http://localhost:3000/...`. Days
 * later, on another machine, that link opened to "no se puede acceder a este
 * sitio web": nothing was listening on that port, and nothing ever would be.
 *
 * `VITE_PUBLIC_SITE_URL` pins the address the app is actually served from, so
 * a link generated anywhere lands somewhere real. It falls back to the current
 * origin when unset, which keeps local development working.
 *
 * Two further things have to line up on the Supabase side, and no amount of
 * client code substitutes for them — see `docs/password-reset.md`:
 *   - Authentication → URL Configuration → Site URL must be the production
 *     domain. It is the fallback Supabase uses when a `redirectTo` is not on
 *     the allow-list, and a Site URL of localhost is what produces a localhost
 *     link even from a correctly configured client.
 *   - Every origin the app is served from must be in Redirect URLs, or
 *     Supabase silently drops the `redirectTo` and falls back to Site URL.
 */
export function getPublicSiteUrl(): string {
  const configured = import.meta.env.VITE_PUBLIC_SITE_URL as string | undefined;
  if (configured && /^https?:\/\//i.test(configured)) {
    // A trailing slash makes the URL a different string to Supabase's exact
    // allow-list match, which is a silent failure rather than an error.
    return configured.replace(/\/+$/, '');
  }
  return window.location.origin;
}

/** Where the recovery email should land. */
export function getPasswordResetRedirect(): string {
  return `${getPublicSiteUrl()}/reset-password`;
}
