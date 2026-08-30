import { validateWebPublicConfig, type WebPublicConfig } from './public-config';

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
 */
export const environment: WebPublicConfig = validateWebPublicConfig({
  publicApiBaseUrl: playwrightOwnedApiBaseUrl() ?? 'http://localhost:3000',
});
