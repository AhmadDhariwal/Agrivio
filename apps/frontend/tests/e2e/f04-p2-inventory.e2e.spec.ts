import { API, activationTokenFromUrl } from './e2e-origins';
import { expect, test, type Page } from '@playwright/test';

const OWNER_PASSWORD = 'owner-activation-passphrase';

test.describe('F04 P2 inventory vertical slice', () => {
  test('opening stock → expiry → adjustment → reverse reconciles stock', async ({ page, request }) => {
    const stamp = Date.now();
    const organizationName = `F04 P2 E2E Org ${stamp}`;
    const ownerEmail = `f04p2-owner-${stamp}@example.com`;

    const bootstrap = await request.post(`${API}/api/v1/test/e2e/bootstrap`);
    expect(bootstrap.status()).toBe(200);
    const bootstrapBody = await bootstrap.json();
    const superAdmin = bootstrapBody.data.superAdmin as { email: string; password: string };

    await seedStarterPlan(request);
    await page.goto('/request-access');
    await page.getByTestId('org-name').fill(organizationName);
    await page.getByTestId('owner-email').fill(ownerEmail);
    await page.getByTestId('owner-display-name').fill('F04 P2 Owner');
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
    await page.getByTestId('warehouse-name').fill('P2 Warehouse');
    await page.getByTestId('warehouse-save').click();
    await expect(page.getByTestId('warehouses-list')).toContainText('P2 Warehouse');

    await page.getByRole('link', { name: 'Categories', exact: true }).click();
    await page.getByTestId('category-create-link').click();
    await page.getByTestId('category-name').fill('P2 Fertilizers');
    await page.getByTestId('category-product-class').selectOption('fertilizer');
    await page.getByTestId('category-save').click();
    await expect(page.getByTestId('categories-list')).toContainText('P2 Fertilizers');

    await page.getByTestId('category-create-link').click();
    await page.getByTestId('category-name').fill('P2 Equipment');
    await page.getByTestId('category-product-class').selectOption('general');
    await page.getByTestId('category-save').click();
    await expect(page.getByTestId('categories-list')).toContainText('P2 Equipment');

    await page.getByRole('link', { name: 'Products' }).click();
    await page.getByTestId('product-create-link').click();
    await page.getByTestId('product-name').fill('P2 Urea');
    await page.getByTestId('product-category').selectOption({ label: 'P2 Fertilizers' });
    await page.getByTestId('product-tracking-mode').selectOption('batch_expiry');
    await page.getByTestId('product-base-unit').fill('KG');
    await page.getByTestId('product-measurement-dimension').selectOption('mass');
    await page.getByTestId('product-save').click();
    await expect(page.getByTestId('products-list')).toContainText('P2 Urea');

    await page.getByTestId('product-create-link').click();
    await page.getByTestId('product-name').fill('P2 Bag');
    await page.getByTestId('product-category').selectOption({ label: 'P2 Equipment' });
    await page.getByTestId('product-tracking-mode').selectOption('none');
    await page.getByTestId('product-base-unit').fill('EA');
    await page.getByTestId('product-measurement-dimension').selectOption('mass');
    await page.getByTestId('product-save').click();
    await expect(page.getByTestId('products-list')).toContainText('P2 Bag');

    await page.getByTestId('nav-opening-stock').click();
    await page.getByTestId('opening-warehouse').selectOption({ label: 'P2 Warehouse' });
    await page.getByTestId('opening-product').selectOption({ label: 'P2 Urea (batch_expiry)' });
    await page.getByTestId('opening-quantity').fill('2');
    await page.getByTestId('opening-batch-number').fill('P2-LOT');
    await page.getByTestId('opening-expiry-date').fill('2027-12-31');
    await page.getByTestId('opening-inventory-value').fill('100.00');
    await page.getByTestId('opening-stock-save').click();
    await expect(page.getByTestId('opening-stock-success')).toBeVisible();

    await page.getByTestId('nav-opening-stock').click();
    await page.getByTestId('opening-warehouse').selectOption({ label: 'P2 Warehouse' });
    await page.getByTestId('opening-product').selectOption({ label: 'P2 Bag (none)' });
    await page.getByTestId('opening-quantity').fill('2');
    await page.getByTestId('opening-inventory-value').fill('20.00');
    await page.getByTestId('opening-stock-save').click();
    await expect(page.getByTestId('opening-stock-success')).toBeVisible();

    await page.getByTestId('nav-expiry').click();
    await expect(page.getByTestId('expiry-list')).toBeVisible();
    await expect(page.getByTestId('expiry-row').first()).toContainText('normal');

    await page.getByTestId('nav-adjustments').click();
    await page.getByTestId('adjustment-warehouse').selectOption({ label: 'P2 Warehouse' });
    await page.getByTestId('adjustment-product').selectOption({ label: 'P2 Bag' });
    await page.getByTestId('adjustment-type').selectOption('damage');
    await page.getByTestId('adjustment-quantity').fill('1');
    await page.getByTestId('adjustment-reason').fill('Damaged bag');
    await page.getByTestId('adjustment-submit').click();
    await expect(page.getByTestId('adjustment-success')).toBeVisible();

    await page.getByTestId('nav-inventory').click();
    await expect(page.getByTestId('stock-list')).toContainText('1.0000');

    await page.getByTestId('nav-adjustments').click();
    await page.getByTestId('adjustment-reverse').first().click();
    await expect(page.getByTestId('adjustment-success')).toBeVisible();

    await page.getByTestId('nav-inventory').click();
    await expect(page.getByTestId('stock-list')).toContainText('2.0000');
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
