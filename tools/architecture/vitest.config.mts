import { defineConfig } from 'vitest/config';
import { agrivioVitestNodeDefaults } from '@agrivio/tooling-config/vitest/node';

export default defineConfig(() => ({
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/tools/architecture',
  test: {
    ...agrivioVitestNodeDefaults,
    name: 'architecture',
    include: ['../../apps/backend/tests/architecture/**/*.architecture.spec.ts'],
    exclude: ['**/node_modules/**', '**/fixtures/**'],
  },
}));
