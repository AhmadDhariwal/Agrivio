import { expect, test } from '@playwright/test';

test.describe('F00 empty-app smoke', () => {
  test('frontend scaffold renders and backend accepts connections', async ({ page, request }) => {
    const backend = await request.get('http://127.0.0.1:3000/');
    // Empty Express scaffold has no routes yet; connection success is the F00 API proof.
    expect(backend.status()).toBe(404);

    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Welcome web');
  });
});
