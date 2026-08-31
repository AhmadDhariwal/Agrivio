import { API, activationTokenFromUrl } from './e2e-origins';
import { login, enterPlatformWorkspace } from './e2e-auth-helper';
import { expect, test } from '@playwright/test';

const OWNER_PASSWORD = 'owner-activation-passphrase';

test.describe('F03 P1 organization setup slice', () => {
  test('owner can manage settings, branches, warehouses, and employees', async ({ page, request }) => {
    const stamp = Date.now();
    const organizationName = `F03 E2E Org ${stamp}`;
    const ownerEmail = `f03-owner-${stamp}@example.com`;

    const bootstrap = await request.post(`${API}/api/v1/test/e2e/bootstrap`);
    expect(bootstrap.status()).toBe(200);
    const bootstrapBody = await bootstrap.json();
    const superAdmin = bootstrapBody.data.superAdmin as { email: string; password: string };

    await page.goto('/request-access');
    await page.getByTestId('org-name').fill(organizationName);
    await page.getByTestId('owner-email').fill(ownerEmail);
    await page.getByTestId('owner-display-name').fill('F03 Owner');
    await page.getByTestId('request-submit').click();
    await expect(page.getByTestId('request-success')).toContainText('Request submitted');

    await login(page, superAdmin.email, superAdmin.password);
    await enterPlatformWorkspace(page);
    await page.getByRole('link', { name: 'Organizations' }).click();
    const orgRow = page.getByTestId('org-row').filter({ hasText: organizationName });
    await orgRow.getByTestId('approve-org').click();
    await page.getByRole('button', { name: 'Approve organization' }).click();
    const activationUrl = page.getByTestId('activation-url');
    await expect(activationUrl).toBeVisible();
    const urlText = (await activationUrl.textContent())?.trim() ?? '';
    const activationToken =
      activationTokenFromUrl(urlText);

    await page.getByTestId('sign-out').click();
    await page.goto(`/activate?token=${encodeURIComponent(activationToken)}`);
    await page.getByTestId('activation-password-input').fill(OWNER_PASSWORD);
    await page.getByTestId('activation-password-confirm-input').fill(OWNER_PASSWORD);
    await page.getByTestId('activate-submit').click();
    await expect(page).toHaveURL(/\/context/);
    await page.getByTestId('continue-workspace').click();
    await expect(page.getByTestId('authenticated-shell')).toBeVisible();

    await page.getByRole('link', { name: 'Settings' }).click();
    await expect(page.getByTestId('organization-settings')).toBeVisible();
    await page.getByTestId('settings-trading-name').fill('F03 Trading');
    await page.getByTestId('settings-save').click();
    await expect(page.getByText('Organization settings saved.')).toBeVisible();

    await page.getByRole('link', { name: 'Branches' }).click();
    await page.getByTestId('branch-create-link').click();
    await page.getByTestId('branch-name').fill('Main Branch');
    await page.getByTestId('branch-invoice-prefix').fill('MAIN');
    await page.getByTestId('branch-save').click();
    await expect(page.getByTestId('branches-list')).toContainText('Main Branch');

    await page.getByRole('link', { name: 'Warehouses' }).click();
    await page.getByTestId('warehouse-create-link').click();
    await page.getByTestId('warehouse-name').fill('Central Warehouse');
    await page.getByTestId('warehouse-save').click();
    await expect(page.getByTestId('warehouses-list')).toContainText('Central Warehouse');

    await page.getByRole('link', { name: 'Employees' }).click();
    await page.getByTestId('employee-create-link').click();
    await page.getByTestId('employee-email').fill(`cashier-${stamp}@example.com`);
    await page.getByTestId('employee-display-name').fill('Cashier One');
    await page.getByTestId('employee-role').selectOption('Cashier');
    await page.getByTestId('employee-save').click();
    await expect(page.getByText(/activation link/i)).toBeVisible();
  });
});

