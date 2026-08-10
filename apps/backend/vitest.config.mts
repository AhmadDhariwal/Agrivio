import { defineConfig } from 'vitest/config';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';
import { nxCopyAssetsPlugin } from '@nx/vite/plugins/nx-copy-assets.plugin';
import { agrivioVitestNodeDefaults } from '@agrivio/tooling-config/vitest/node';

export default defineConfig(() => ({
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/apps/backend',
  plugins: [nxViteTsPaths(), nxCopyAssetsPlugin(['*.md'])],
  test: {
    ...agrivioVitestNodeDefaults,
    name: 'backend',
    // Auth/onboarding suites hash passwords with argon2; default 5s flakes under load.
    testTimeout: 20000,
    include: ['{src,tests}/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    coverage: {
      ...agrivioVitestNodeDefaults.coverage,
      reportsDirectory: '../../coverage/apps/backend',
    },
  },
}));
