import { afterEach } from 'vitest';

// This setup file runs for every test, but only the component tests
// (`@vitest-environment jsdom`) have a DOM. Guarding on `document` keeps the
// node-environment unit tests under src/lib free of jsdom-only imports.
if (typeof document !== 'undefined') {
  await import('@testing-library/jest-dom/vitest');
  const { cleanup } = await import('@testing-library/react');
  afterEach(cleanup);

  // jsdom ships no ResizeObserver. Components that measure themselves — the
  // signature pad has to, because signature_pad draws in canvas pixels and a
  // CSS-stretched canvas offsets every stroke — otherwise throw on mount and
  // take the whole tree down with them. A no-op stub is enough: layout has no
  // meaning in jsdom, so there is nothing for it to report.
  if (!('ResizeObserver' in globalThis)) {
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
  }
}
