import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // Needed so component tests (*.test.tsx) can render real JSX.
  plugins: [react()],
  test: {
    // Pure-logic tests under src/lib stay in the fast `node` environment.
    // Component tests opt into a DOM per file with a `@vitest-environment
    // jsdom` docblock, so we don't pay for jsdom on every run.
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['src/test/setup.ts'],
    // Spinning up one jsdom per test file is expensive, and letting the pool
    // use every core made the workers starve each other badly enough that
    // `findBy*` queries blew past the 5s default — the suite failed for
    // reasons that had nothing to do with the code, and differently on each
    // run. Capping the pool and raising the ceiling makes it deterministic;
    // the assertions themselves resolve in milliseconds.
    maxWorkers: '50%',
    testTimeout: 30000,
  },
});
