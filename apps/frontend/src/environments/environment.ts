import { validateWebPublicConfig, type WebPublicConfig } from './public-config';
import { buildTimeApiBaseUrl } from './environment.generated';

function playwrightOwnedApiBaseUrl(): string | undefined {
  if (typeof globalThis.location === 'undefined') {
    return undefined;
  }
  const { protocol, hostname, port } = globalThis.location;
  if (port === '4300') {
    return `${protocol}//${hostname}:3100`;
  }
  return undefined;
}

/**
 * Browser-safe environment values only. Secrets are forbidden here.
 * Playwright serves the app on port 4300 and the API on 3100.
 *
 * For staging/production builds, set AGRIVIO_PUBLIC_API_BASE_URL in the
 * CI/CD environment (e.g. Cloudflare Pages build settings) and run
 * `node scripts/generate-frontend-env.mjs` before the Angular build.
 * The script overwrites environment.generated.ts with the correct URL.
 * Local development uses the committed default (http://localhost:3000).
 */
export const environment: WebPublicConfig = validateWebPublicConfig({
  publicApiBaseUrl: playwrightOwnedApiBaseUrl() ?? buildTimeApiBaseUrl,
});
