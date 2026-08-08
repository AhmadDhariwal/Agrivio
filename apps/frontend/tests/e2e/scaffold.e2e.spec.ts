import { expect, test } from '@playwright/test';

test.describe('F00 empty-app smoke', () => {
  test('frontend landing renders and backend health responds', async ({ page, request }) => {
    const backend = await request.get('http://localhost:3000/api/v1/health');
    expect(backend.status()).toBe(200);
    const body = await backend.json();
    expect(body?.data?.status).toBe('ok');

    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Agrivio');
  });
});
