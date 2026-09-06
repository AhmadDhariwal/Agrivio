import { expect, test } from '@playwright/test';
import { API } from './e2e-origins';
import { login } from './e2e-auth-helper';

test.describe('authoritative cookie-session routing', () => {
  test('restores across manual URLs, refreshes, tabs, and server logout', async ({
    page,
    request,
    context,
  }) => {
    const bootstrap = await request.post(`${API}/api/v1/test/e2e/bootstrap`);
    expect(bootstrap.status()).toBe(200);
    const body = await bootstrap.json();
    const superAdmin = body.data.superAdmin as { email: string; password: string };

    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Agrivio');

    await page.goto('/app/products');
    await expect(page).toHaveURL(/\/signin$/);

    await login(page, superAdmin.email, superAdmin.password);
    await expect(page).toHaveURL(/\/app\/platform\/organizations$/);
    await expect(page.getByTestId('authenticated-shell')).toBeVisible();

    let sessionRequests = 0;
    page.on('request', (outgoing) => {
      if (new URL(outgoing.url()).pathname === '/api/v1/auth/session') {
        sessionRequests += 1;
      }
    });

    await page.goto('/signin');
    await expect(page).toHaveURL(/\/app\/platform\/organizations$/);
    await expect(page.getByTestId('login-submit')).toHaveCount(0);
    expect(sessionRequests).toBe(1);

    await page.goto('/login');
    await expect(page).toHaveURL(/\/app\/platform\/organizations$/);
    await expect(page.getByTestId('login-submit')).toHaveCount(0);

    await page.goto('/');
    await expect(page).toHaveURL(/\/app\/platform\/organizations$/);
    await expect(page.getByTestId('login-submit')).toHaveCount(0);

    await page.reload();
    await expect(page).toHaveURL(/\/app\/platform\/organizations$/);
    await expect(page.getByTestId('authenticated-shell')).toBeVisible();

    const secondTab = await context.newPage();
    await secondTab.goto('/');
    await expect(secondTab).toHaveURL(/\/app\/platform\/organizations$/);
    await expect(secondTab.getByTestId('login-submit')).toHaveCount(0);

    await secondTab.goto('/signin');
    await expect(secondTab).toHaveURL(/\/app\/platform\/organizations$/);

    await page.getByTestId('sign-out').click();
    await expect(page).toHaveURL(/\/signin$/);
    await expect(secondTab).toHaveURL(/\/signin$/);

    await page.goto('/app/products');
    await expect(page).toHaveURL(/\/signin$/);
    await secondTab.reload();
    await expect(secondTab).toHaveURL(/\/signin$/);
  });
});
