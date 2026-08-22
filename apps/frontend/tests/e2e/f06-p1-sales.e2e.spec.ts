import { API, activationTokenFromUrl } from './e2e-origins';
import { expect, test, type Page } from '@playwright/test';

const OWNER_PASSWORD = 'owner-activation-passphrase';

test.describe('F06 P1 sales draft vertical slice', () => {
  test('draft workflow stays unposted with no invoice or stock effects', async ({ page, request }) => {
    test.setTimeout(180_000);
    const stamp = Date.now();
    const organizationName = `F06 P1 E2E Org ${stamp}`;
    const ownerEmail = `f06p1-owner-${stamp}@example.com`;

    const bootstrap = await request.post(`${API}/api/v1/test/e2e/bootstrap`);
    expect(bootstrap.status()).toBe(200);
    const bootstrapBody = await bootstrap.json();
    const superAdmin = bootstrapBody.data.superAdmin as { email: string; password: string };

    await seedStarterPlan(request);
    await page.goto('/request-access');
    await page.getByTestId('org-name').fill(organizationName);
    await page.getByTestId('owner-email').fill(ownerEmail);
    await page.getByTestId('owner-display-name').fill('F06 P1 Owner');
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

    await page.getByRole('link', { name: 'Branches' }).click();
    await page.getByTestId('branch-create-link').click();
    await page.getByTestId('branch-name').fill('Main Branch');
    await page.getByTestId('branch-invoice-prefix').fill('LHR');
    await page.getByTestId('branch-save').click();
    await expect(page.getByTestId('branches-list')).toContainText('Main Branch');

    await page.getByRole('link', { name: 'Warehouses' }).click();
    await page.getByTestId('warehouse-create-link').click();
    await page.getByTestId('warehouse-name').fill('Sales WH');
    await page.getByTestId('warehouse-save').click();
    await expect(page.getByTestId('warehouses-list')).toContainText('Sales WH');

    await page.getByRole('link', { name: 'Customers' }).click();
    await page.getByTestId('customer-create-link').click();
    await page.getByTestId('customer-name').fill('Retail Customer');
    await page.getByTestId('customer-type').selectOption('individual');
    await page.getByTestId('customer-save').click();
    await expect(page.getByTestId('customers-list')).toContainText('Retail Customer');

    await page.getByRole('link', { name: 'Categories', exact: true }).click();
    await page.getByTestId('category-create-link').click();
    await page.getByTestId('category-name').fill('Retail Cat');
    await page.getByTestId('category-product-class').selectOption('general');
    await page.getByTestId('category-save').click();
    await expect(page.getByTestId('categories-list')).toContainText('Retail Cat');

    await page.getByRole('link', { name: 'Products' }).click();
    await expect(page.getByTestId('product-create-link')).toBeVisible();
    await page.getByTestId('product-create-link').click();
    await page.getByTestId('product-name').fill('Retail Widget');
    await page.getByTestId('product-category').selectOption({ label: 'Retail Cat' });
    await page.getByTestId('product-tracking-mode').selectOption('none');
    await page.getByTestId('product-base-unit').fill('EA');
    await page.getByTestId('product-measurement-dimension').selectOption('mass');
    await page.getByTestId('product-save').click();
    await expect(page.getByTestId('products-list')).toContainText('Retail Widget');

    await page.getByTestId('nav-sales').click();
    await page.getByTestId('sale-create-link').click();
    await expect(page.getByTestId('sale-draft-banner')).toBeVisible();

    await page.getByTestId('sale-branch').selectOption({ label: 'Main Branch' });
    await page.getByTestId('sale-warehouse').selectOption({ label: 'Sales WH' });
    await page.getByTestId('sale-customer').selectOption({ label: 'Retail Customer (retail)' });
    await page.getByTestId('sale-date').fill('2026-08-12');
    await page.getByTestId('sale-line-product').selectOption({ label: 'Retail Widget' });
    await page.getByTestId('sale-line-quantity').fill('3');
    await page.getByTestId('sale-line-unit-price').fill('100.00');
    await page.getByTestId('sale-save').click();
    await expect(page).toHaveURL(/\/app\/sales\/[^/]+$/);
    await expect(page.getByTestId('sale-draft-banner')).toBeVisible();
    await expect(page.getByTestId('sale-post')).toBeVisible();
    await expect(page.getByTestId('sale-posted-details')).toHaveCount(0);

    await page.reload();
    await expect(page.getByTestId('sale-draft-banner')).toBeVisible();
    await page.getByTestId('sale-line-quantity').fill('5');
    await page.getByTestId('sale-save').click();
    await expect(page.getByTestId('sale-success')).toBeVisible();

    await page.getByTestId('nav-inventory').click();
    await expect(page.getByTestId('stock-empty')).toBeVisible();

    await page.getByTestId('nav-sales').click();
    await page.getByTestId('sale-row').first().getByRole('link').click();
    await page.getByTestId('sale-discard').click();
    await expect(page).toHaveURL(/\/app\/sales$/);
    await expect(page.getByTestId('sales-empty')).toBeVisible();
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
