import { afterEach } from 'vitest';

// This setup file runs for every test, but only the component tests
// (`@vitest-environment jsdom`) have a DOM. Guarding on `document` keeps the
// node-environment unit tests under src/lib free of jsdom-only imports.
if (typeof document !== 'undefined') {
  await import('@testing-library/jest-dom/vitest');
  const { cleanup } = await import('@testing-library/react');
  afterEach(cleanup);
}
