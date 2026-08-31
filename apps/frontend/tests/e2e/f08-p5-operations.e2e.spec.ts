import { expect, test } from '@playwright/test';
import { API } from './f07-p4-support';
import { login, enterPlatformWorkspace } from './e2e-auth-helper';

test.describe('F08 P5 platform operations', () => {
  test('authorized platform operator opens Backup status without restore execute', async ({
    page,
    request,
  }) => {
    const bootstrap = await request.post(`${API}/api/v1/test/e2e/bootstrap`);
    expect(bootstrap.status()).toBe(200);
    const superAdmin = (await bootstrap.json()).data.superAdmin as {
      email: string;
      password: string;
    };

    await login(page, superAdmin.email, superAdmin.password);
    await enterPlatformWorkspace(page);
    await expect(page.getByTestId('nav-alerts')).toHaveCount(0);
    await page.getByTestId('nav-operations').click();
    await expect(page).toHaveURL(/\/app\/platform\/operations$/);
    await expect(page.getByTestId('operations-page')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Backup and restore status' })).toBeVisible();
    await expect(page.getByTestId('restore-coordinate')).toHaveCount(0);
    await expect(page.getByText(/operations.restore.execute/)).toBeVisible();
  });
});
