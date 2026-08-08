import { expect, test } from '@playwright/test';

test.describe('F00 empty-app smoke', () => {
  test('frontend scaffold renders and backend health responds', async ({ page, request }) => {
    const backend = await request.get('http://127.0.0.1:3000/api/v1/health');
    expect(backend.status()).toBe(200);
    const body = await backend.json();
    expect(body?.data?.status).toBe('ok');

    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Welcome web');
  });
});
