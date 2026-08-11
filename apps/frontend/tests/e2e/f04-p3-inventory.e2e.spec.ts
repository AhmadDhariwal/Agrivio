import { expect, test, type Page } from '@playwright/test';

const API = 'http://localhost:3000';
const OWNER_PASSWORD = 'owner-activation-passphrase';

test.describe('F04 P3 inventory transfer vertical slice', () => {
  test('transfer → verify warehouses → reverse → reconcile healthy', async ({ page, request }) => {
    const stamp = Date.now();
    const organizationName = `F04 P3 E2E Org ${stamp}`;
    const ownerEmail = `f04p3-owner-${stamp}@example.com`;

    const bootstrap = await request.post(`${API}/api/v1/test/e2e/bootstrap`);
    expect(bootstrap.status()).toBe(200);
    const bootstrapBody = await bootstrap.json();
    const superAdmin = bootstrapBody.data.superAdmin as { email: string; password: string };

    await seedStarterPlan(request);
    await page.goto('/request-access');
    await page.getByTestId('org-name').fill(organizationName);
    await page.getByTestId('owner-email').fill(ownerEmail);
    await page.getByTestId('owner-display-name').fill('F04 P3 Owner');
    await page.getByTestId('request-submit').click();
    await expect(page.getByTestId('request-success')).toBeVisible();

    await signIn(page, superAdmin.email, superAdmin.password);
    await enterPlatformWorkspace(page);
    await page.getByRole('link', { name: 'Organizations' }).click();
    const orgRow = page.getByTestId('org-row').filter({ hasText: organizationName });
    await orgRow.getByTestId('approve-org').click();
    await page.getByRole('button', { name: 'Approve organization' }).click();
    const activationUrl = page.getByTestId('activation-url');
    const urlText = (await activationUrl.textContent())?.trim() ?? '';
    const activationToken =
      new URL(urlText, 'http://localhost:4200').searchParams.get('token') ?? '';

    await page.getByTestId('sign-out').click();
    await page.goto(`/activate?token=${encodeURIComponent(activationToken)}`);
    await page.getByTestId('activation-password-input').fill(OWNER_PASSWORD);
    await page.getByTestId('activation-password-confirm-input').fill(OWNER_PASSWORD);
    await page.getByTestId('activate-submit').click();
    await expect(page).toHaveURL(/\/context/);
    await page.getByTestId('continue-workspace').click();
    await expect(page.getByTestId('authenticated-shell')).toBeVisible();

    await page.getByRole('link', { name: 'Warehouses' }).click();
    await page.getByTestId('warehouse-create-link').click();
    await page.getByTestId('warehouse-name').fill('P3 Source');
    await page.getByTestId('warehouse-save').click();
    await expect(page.getByTestId('warehouses-list')).toContainText('P3 Source');
    await page.getByTestId('warehouse-create-link').click();
    await page.getByTestId('warehouse-name').fill('P3 Dest');
    await page.getByTestId('warehouse-save').click();
    await expect(page.getByTestId('warehouses-list')).toContainText('P3 Dest');

    await page.getByRole('link', { name: 'Categories' }).click();
    await page.getByTestId('category-create-link').click();
    await page.getByTestId('category-name').fill('P3 Equipment');
    await page.getByTestId('category-product-class').selectOption('general');
    await page.getByTestId('category-save').click();
    await expect(page.getByTestId('categories-list')).toContainText('P3 Equipment');

    await page.getByRole('link', { name: 'Products' }).click();
    await page.getByTestId('product-create-link').click();
    await page.getByTestId('product-name').fill('P3 Bag');
    await page.getByTestId('product-category').selectOption({ label: 'P3 Equipment' });
    await page.getByTestId('product-tracking-mode').selectOption('none');
    await page.getByTestId('product-base-unit').fill('EA');
    await page.getByTestId('product-measurement-dimension').selectOption('mass');
    await page.getByTestId('product-save').click();
    await expect(page.getByTestId('products-list')).toContainText('P3 Bag');

    await page.getByTestId('nav-opening-stock').click();
    await page.getByTestId('opening-warehouse').selectOption({ label: 'P3 Source' });
    await page.getByTestId('opening-product').selectOption({ label: 'P3 Bag (none)' });
    await page.getByTestId('opening-quantity').fill('4');
    await page.getByTestId('opening-inventory-value').fill('40.00');
    await page.getByTestId('opening-stock-save').click();
    await expect(page.getByTestId('opening-stock-success')).toBeVisible();

    await page.getByTestId('nav-transfers').click();
    await page.getByTestId('transfer-source').selectOption({ label: 'P3 Source' });
    await page.getByTestId('transfer-destination').selectOption({ label: 'P3 Dest' });
    await page.getByTestId('transfer-product').selectOption({ label: 'P3 Bag' });
    await page.getByTestId('transfer-quantity').fill('1');
    await page.getByTestId('transfer-reason').fill('E2E transfer');
    await page.getByTestId('transfer-submit').click();
    await expect(page.getByTestId('transfer-success')).toBeVisible();

    await page.getByTestId('nav-inventory').click();
    await page.getByTestId('stock-refresh').click();
    await expect(page.getByTestId('stock-list')).toContainText('3.0000');
    await expect(page.getByTestId('stock-list')).toContainText('1.0000');

    await page.getByRole('link', { name: 'Movements' }).click();
    await expect(page.getByTestId('movements-list')).toBeVisible();
    await expect(page.getByTestId('movement-row').filter({ hasText: 'warehouse_transfer' }).first()).toBeVisible();

    await page.getByTestId('nav-transfers').click();
    await page.getByTestId('transfer-reverse').first().click();
    await expect(page.getByTestId('transfer-success')).toBeVisible();

    await page.getByTestId('nav-inventory').click();
    await page.getByTestId('stock-refresh').click();
    await expect(page.getByTestId('stock-list')).toContainText('4.0000');

    await page.getByTestId('nav-reconciliation').click();
    await expect(page.getByTestId('reconciliation-view')).toBeVisible();
    await expect(page.getByTestId('reconciliation-ok')).toContainText(/healthy|ok|true/i);
  });
});

async function seedStarterPlan(request: import('@playwright/test').APIRequestContext) {
  const csrf = await request.post(`${API}/api/v1/auth/csrf`);
  const csrfBody = await csrf.json();
  const token = csrfBody.data.csrfToken as string;
  await request.post(`${API}/api/v1/platform/subscription-plans`, {
    headers: {
      'X-CSRF-Token': token,
      'X-Platform-Actor': 'super-admin',
    },
    data: {
      planCode: 'Starter',
      activate: true,
      monthlyPriceMinorUnits: 1000,
      limits: { customers: 50, suppliers: 50, products: 50, warehouses: 20, users: 20 },
    },
  });
}

async function signIn(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.getByTestId('login-email').fill(email);
  await page.getByTestId('login-password').fill(password);
  await page.getByTestId('login-submit').click();
  await expect(page).toHaveURL(/\/(context|app)/);
}

async function enterPlatformWorkspace(page: Page) {
  if (page.url().includes('/context')) {
    await page.getByTestId('continue-workspace').click();
  }
  await expect(page.getByTestId('authenticated-shell')).toBeVisible();
}
