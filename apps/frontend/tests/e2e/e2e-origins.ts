/** Playwright-owned origins. Must match playwright.config.ts webServer ports. */
export const E2E_API_ORIGIN = process.env['AGRIVIO_E2E_API_ORIGIN'] ?? 'http://127.0.0.1:3100';
export const E2E_WEB_ORIGIN = process.env['AGRIVIO_E2E_WEB_ORIGIN'] ?? 'http://127.0.0.1:4300';
export const API = E2E_API_ORIGIN;

export function activationTokenFromUrl(urlText: string): string {
  return new URL(urlText, E2E_WEB_ORIGIN).searchParams.get('token') ?? '';
}
