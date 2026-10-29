import { describe, expect, it } from 'vitest';
import { chooseEntry, isAuthCallback } from './entry';

// En el navegador da igual si hay una sesión del personal guardada: la raíz es la página.
const browser = { installed: false };
const installedApp = { installed: true };

describe('chooseEntry', () => {
  it('the root of the site, in a browser, is always the public page (also for staff with a session)', () => {
    expect(chooseEntry('/', browser)).toBe('landing');
    expect(chooseEntry('/index.html', browser)).toBe('landing');
    expect(chooseEntry('/', { ...browser, hash: '#servicios', search: '?fbclid=abc' })).toBe('landing');
  });

  it('the installed app keeps opening the app (sign-in or dashboard), and the dashboard has its own address', () => {
    expect(chooseEntry('/', installedApp)).toBe('app');
    expect(chooseEntry('/panel', browser)).toBe('app');
    expect(chooseEntry('/login', browser)).toBe('app');
  });

  it('/home always shows the public page, even inside the installed app', () => {
    expect(chooseEntry('/home', browser)).toBe('landing');
    expect(chooseEntry('/home/', installedApp)).toBe('landing');
  });

  it('a Supabase link that lands on the root with the session in the URL starts the app', () => {
    // Pasa si /reset-password no está en Redirect URLs: Supabase manda a la raíz.
    expect(chooseEntry('/', { ...browser, hash: '#access_token=abc&type=recovery' })).toBe('app');
    expect(chooseEntry('/', { ...browser, search: '?code=abc' })).toBe('app');
    expect(chooseEntry('/', { ...browser, hash: '#error=access_denied&error_code=otp_expired' })).toBe('app');
  });

  it('every other path is the app, and the customer links are the portal', () => {
    expect(chooseEntry('/login', browser)).toBe('app');
    expect(chooseEntry('/work-orders', browser)).toBe('app');
    expect(chooseEntry('/privacidad', browser)).toBe('app');
    expect(chooseEntry(`/r/${'a'.repeat(64)}`, browser)).toBe('portal');
    expect(chooseEntry(`/s/${'b'.repeat(64)}`, browser)).toBe('portal');
  });
});

describe('isAuthCallback', () => {
  it('does not mistake an anchor or a tracking parameter for a sign-in link', () => {
    expect(isAuthCallback('', '#visitenos')).toBe(false);
    expect(isAuthCallback('?utm_source=instagram', '')).toBe(false);
    expect(isAuthCallback('?encode=1', '')).toBe(false);
  });
});
