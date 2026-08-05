import { defineConfig } from 'vitest/config';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';
import { nxCopyAssetsPlugin } from '@nx/vite/plugins/nx-copy-assets.plugin';
import { agrivioVitestNodeDefaults } from '@agrivio/tooling-config/vitest/node';

export default defineConfig(() => ({
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/packages/test-support-integration',
  plugins: [nxViteTsPaths(), nxCopyAssetsPlugin(['*.md'])],
  test: {
    ...agrivioVitestNodeDefaults,
    name: 'test-support-integration',
    include: ['src/**/*.integration.spec.ts', 'src/integration/**/*.integration.spec.ts'],
    testTimeout: 60_000,
    hookTimeout: 60_000,
    coverage: {
      ...agrivioVitestNodeDefaults.coverage,
      reportsDirectory: '../../coverage/packages/test-support-integration',
    },
  },
}));
