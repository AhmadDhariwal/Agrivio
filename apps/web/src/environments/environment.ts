import { validateWebPublicConfig, type WebPublicConfig } from './public-config';

/**
 * Browser-safe environment values only. Secrets are forbidden here.
 */
export const environment: WebPublicConfig = validateWebPublicConfig({
  publicApiBaseUrl: 'http://localhost:3000',
});
