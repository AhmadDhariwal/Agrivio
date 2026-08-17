import { API, activationTokenFromUrl } from './e2e-origins';
import { expect, test, type Page } from '@playwright/test';

const OWNER_PASSWORD = 'owner-activation-passphrase';

test.describe('F04 P1 inventory opening stock vertical slice', () => {
  test('owner posts batch opening stock and sees stock/movements/valuation', async ({
    page,
    request,
  }) => {
    const stamp = Date.now();
    const organizationName = `F04 P1 E2E Org ${stamp}`;
    const ownerEmail = `f04p1-owner-${stamp}@example.com`;

    const bootstrap = await request.post(`${API}/api/v1/test/e2e/bootstrap`);
    expect(bootstrap.status()).toBe(200);
    const bootstrapBody = await bootstrap.json();
    const superAdmin = bootstrapBody.data.superAdmin as { email: string; password: string };

    await seedStarterPlan(request);

    await page.goto('/request-access');
    await page.getByTestId('org-name').fill(organizationName);
    await page.getByTestId('owner-email').fill(ownerEmail);
    await page.getByTestId('owner-display-name').fill('F04 P1 Owner');
    await page.getByTestId('request-submit').click();
    await expect(page.getByTestId('request-success')).toContainText('Request submitted');

    await signIn(page, superAdmin.email, superAdmin.password);
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

    await page.getByRole('link', { name: 'Warehouses' }).click();
    await page.getByTestId('warehouse-create-link').click();
    await page.getByTestId('warehouse-name').fill('E2E Warehouse');
    await page.getByTestId('warehouse-save').click();
    await expect(page.getByTestId('warehouses-list')).toContainText('E2E Warehouse');

    await page.getByRole('link', { name: 'Categories', exact: true }).click();
    await page.getByTestId('category-create-link').click();
    await page.getByTestId('category-name').fill('Fertilizers');
    await page.getByTestId('category-product-class').selectOption('fertilizer');
    await page.getByTestId('category-save').click();
    await expect(page.getByTestId('categories-list')).toContainText('Fertilizers');

    await page.getByRole('link', { name: 'Products' }).click();
    await page.getByTestId('product-create-link').click();
    await page.getByTestId('product-name').fill('Urea E2E');
    await page.getByTestId('product-category').selectOption({ label: 'Fertilizers' });
    await page.getByTestId('product-tracking-mode').selectOption('batch_expiry');
    await page.getByTestId('product-base-unit').fill('KG');
    await page.getByTestId('product-measurement-dimension').selectOption('mass');
    await page.getByTestId('packaging-unit-name').fill('50 KG');
    await page.getByTestId('packaging-conversion').fill('50');
    await page.getByTestId('product-save').click();
    await expect(page.getByTestId('products-list')).toContainText('Urea E2E');

    await page.getByTestId('nav-opening-stock').click();
    await expect(page.getByTestId('opening-stock-form')).toBeVisible();
    await page.getByTestId('opening-warehouse').selectOption({ label: 'E2E Warehouse' });
    await page.getByTestId('opening-product').selectOption({ label: 'Urea E2E (batch_expiry)' });
    await page.getByTestId('opening-quantity').fill('2');
    await page.getByTestId('opening-packaging').selectOption({ label: '50 KG (×50)' });
    await page.getByTestId('opening-batch-number').fill('E2E-LOT-1');
    await page.getByTestId('opening-expiry-date').fill('2027-12-31');
    await page.getByTestId('opening-inventory-value').fill('5000.00');
    await page.getByTestId('opening-stock-save').click();
    await expect(page.getByTestId('opening-stock-success')).toBeVisible();
    await expect(page.getByTestId('opening-stock-success')).toContainText('100.0000');

    await page.getByTestId('nav-inventory').click();
    await expect(page.getByTestId('stock-list')).toBeVisible();
    const stockRow = page.getByTestId('stock-row').first();
    await expect(stockRow).toContainText('100.0000');
    await expect(stockRow).toContainText('50.00');

    await page.getByTestId('stock-refresh').click();
    await expect(page.getByTestId('stock-row').first()).toContainText('100.0000');
    await expect(page.getByTestId('stock-row').first()).toContainText('50.00');

    await page.locator('#ag-main').getByRole('link', { name: 'Movements' }).click();
    await expect(page.getByTestId('movements-list')).toBeVisible();
    await expect(page.getByTestId('movement-row').first()).toContainText('opening_stock');
    await expect(page.getByTestId('movement-row').first()).toContainText('100.0000');
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
