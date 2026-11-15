import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: false,
    include: ['src/tests/**/*.vitest.test.ts', 'src/tests/**/*.vitest.test.tsx'],
    exclude: ['node_modules', 'dist', 'e2e', 'uor_foundry.raw_app'],
  },
});
