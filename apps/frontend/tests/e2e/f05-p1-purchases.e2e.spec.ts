import { API, activationTokenFromUrl } from './e2e-origins';
import { expect, test, type Page } from '@playwright/test';

const OWNER_PASSWORD = 'owner-activation-passphrase';

test.describe('F05 P1 purchase draft vertical slice', () => {
  test('create → edit → verify draft/no effects → discard', async ({ page, request }) => {
    const stamp = Date.now();
    const organizationName = `F05 P1 E2E Org ${stamp}`;
    const ownerEmail = `f05p1-owner-${stamp}@example.com`;

    const bootstrap = await request.post(`${API}/api/v1/test/e2e/bootstrap`);
    expect(bootstrap.status()).toBe(200);
    const bootstrapBody = await bootstrap.json();
    const superAdmin = bootstrapBody.data.superAdmin as { email: string; password: string };

    await seedStarterPlan(request);
    await page.goto('/request-access');
    await page.getByTestId('org-name').fill(organizationName);
    await page.getByTestId('owner-email').fill(ownerEmail);
    await page.getByTestId('owner-display-name').fill('F05 P1 Owner');
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
    await page.getByTestId('warehouse-name').fill('P1 Receive');
    await page.getByTestId('warehouse-save').click();
    await expect(page.getByTestId('warehouses-list')).toContainText('P1 Receive');

    await page.getByRole('link', { name: 'Suppliers' }).click();
    await page.getByTestId('supplier-create-link').click();
    await page.getByTestId('supplier-name').fill('P1 Supplier');
    await page.getByTestId('supplier-save').click();
    await expect(page.getByTestId('suppliers-list')).toContainText('P1 Supplier');

    await page.getByRole('link', { name: 'Categories', exact: true }).click();
    await page.getByTestId('category-create-link').click();
    await page.getByTestId('category-name').fill('P1 Inputs');
    await page.getByTestId('category-product-class').selectOption('general');
    await page.getByTestId('category-save').click();
    await expect(page.getByTestId('categories-list')).toContainText('P1 Inputs');

    await page.getByRole('link', { name: 'Products' }).click();
    await page.getByTestId('product-create-link').click();
    await page.getByTestId('product-name').fill('P1 Seed');
    await page.getByTestId('product-category').selectOption({ label: 'P1 Inputs' });
    await page.getByTestId('product-tracking-mode').selectOption('none');
    await page.getByTestId('product-base-unit').fill('EA');
    await page.getByTestId('product-measurement-dimension').selectOption('mass');
    await page.getByTestId('product-save').click();
    await expect(page.getByTestId('products-list')).toContainText('P1 Seed');

    await page.getByTestId('nav-purchases').click();
    await page.getByTestId('purchase-create-link').click();
    await expect(page.getByTestId('purchase-draft-banner')).toBeVisible();
    await page.getByTestId('purchase-warehouse').selectOption({ label: 'P1 Receive' });
    await page.getByTestId('purchase-supplier').selectOption({ label: 'P1 Supplier' });
    await page.getByTestId('purchase-date').fill('2026-08-11');
    await page.getByTestId('purchase-line-product').selectOption({ label: 'P1 Seed (none)' });
    await page.getByTestId('purchase-line-quantity').fill('5');
    await page.getByTestId('purchase-line-unit-cost').fill('20.00');
    await page.getByTestId('purchase-save').click();
    await expect(page).toHaveURL(/\/app\/purchases\/[^/]+$/);
    await expect(page.getByTestId('purchase-draft-banner')).toBeVisible();

    await page.goto('/app/purchases');
    await expect(page).toHaveURL(/\/app\/purchases$/);
    // Under full E2E load, the list refresh can lag briefly and render the empty state.
    // Wait for the empty state to disappear before asserting on the drafts list.
    await expect(page.getByTestId('purchases-empty')).toHaveCount(0);
    await expect(page.getByTestId('purchases-list')).toBeVisible();
    await expect(page.getByTestId('purchases-list')).toContainText('Draft');
    await page.getByTestId('purchase-row').first().getByRole('link').click();
    await expect(page.getByTestId('purchase-draft-banner')).toBeVisible();
    await page.getByTestId('purchase-notes').fill('Edited draft notes');
    await page.getByTestId('purchase-save').click();
    await expect(page.getByTestId('purchase-success')).toBeVisible();
    await expect(page.getByTestId('purchase-draft-banner')).toBeVisible();

    await page.getByTestId('nav-inventory').click();
    await expect(page.getByTestId('stock-empty')).toBeVisible();
    await expect(page.getByTestId('stock-empty')).toContainText('No stock balances yet');
    await page.locator('#ag-main').getByRole('link', { name: 'Movements' }).click();
    await expect(page.getByTestId('movements-empty')).toBeVisible();

    await page.getByTestId('nav-purchases').click();
    await expect(page).toHaveURL(/\/app\/purchases$/);
    await page.getByTestId('purchase-row').first().getByRole('link').click();
    await page.getByTestId('purchase-discard').click();
    await expect(page.getByTestId('purchases-empty')).toBeVisible();
  });
});

async function seedStarterPlan(request: import('@playwright/test').APIRequestContext) {
  const csrf = await request.post(`${API}/api/v1/auth/csrf`);
  const csrfBody = await csrf.json();
  const token = csrfBody.data.csrfToken as string;
  const plan = await request.post(`${API}/api/v1/platform/subscription-plans`, {
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
  expect([200, 201]).toContain(plan.status());
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
