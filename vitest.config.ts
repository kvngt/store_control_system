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
  },
});
