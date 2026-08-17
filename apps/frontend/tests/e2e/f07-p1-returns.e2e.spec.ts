import { API, activationTokenFromUrl } from './e2e-origins';
import { expect, test, type Page } from '@playwright/test';

const OWNER_PASSWORD = 'owner-activation-passphrase';

test.describe('F07 P1 sales returns', () => {
  test('linked cash return and without-invoice approval workflow', async ({ page, request }) => {
    test.setTimeout(240_000);
    const stamp = Date.now();
    const organizationName = `F07 P1 E2E Org ${stamp}`;
    const ownerEmail = `f07p1-owner-${stamp}@example.com`;

    const bootstrap = await request.post(`${API}/api/v1/test/e2e/bootstrap`);
    expect(bootstrap.status()).toBe(200);
    const bootstrapBody = await bootstrap.json();
    const superAdmin = bootstrapBody.data.superAdmin as { email: string; password: string };

    await seedStarterPlan(request);
    await page.goto('/request-access');
    await page.getByTestId('org-name').fill(organizationName);
    await page.getByTestId('owner-email').fill(ownerEmail);
    await page.getByTestId('owner-display-name').fill('F07 P1 Owner');
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
    await page.getByTestId('branch-name').fill('F07 Branch');
    await page.getByTestId('branch-invoice-prefix').fill('F7E');
    await page.getByTestId('branch-save').click();
    await expect(page.getByTestId('branches-list')).toContainText('F07 Branch');

    await page.getByRole('link', { name: 'Warehouses' }).click();
    await page.getByTestId('warehouse-create-link').click();
    await page.getByTestId('warehouse-name').fill('F07 WH');
    await page.getByTestId('warehouse-save').click();
    await expect(page.getByTestId('warehouses-list')).toContainText('F07 WH');

    await page.getByRole('link', { name: 'Accounts' }).click();
    await page.getByTestId('account-create-link').click();
    await page.getByTestId('account-name').fill('F07 Cash');
    await page.getByTestId('account-type').selectOption('cash');
    await page.getByTestId('account-save').click();
    await expect(page.getByTestId('accounts-list')).toContainText('F07 Cash');
    await page
      .getByTestId('accounts-list')
      .locator('article')
      .filter({ hasText: 'F07 Cash' })
      .getByRole('link', { name: 'Edit' })
      .click();
    await page.getByTestId('account-opening-amount').fill('10000.00');
    await page.getByTestId('account-opening-save').click();
    await expect(page.getByTestId('account-derived-balance')).toContainText('10000.00');

    await page.getByRole('link', { name: 'Categories', exact: true }).click();
    await page.getByTestId('category-create-link').click();
    await page.getByTestId('category-name').fill('F07 Cat');
    await page.getByTestId('category-product-class').selectOption('general');
    await page.getByTestId('category-save').click();
    await expect(page.getByTestId('categories-list')).toContainText('F07 Cat');

    await page.getByRole('link', { name: 'Products' }).click();
    await page.getByTestId('product-create-link').click();
    await page.getByTestId('product-name').fill('F07 Product');
    await page.getByTestId('product-category').selectOption({ label: 'F07 Cat' });
    await page.getByTestId('product-tracking-mode').selectOption('none');
    await page.getByTestId('product-base-unit').fill('EA');
    await page.getByTestId('product-measurement-dimension').selectOption('mass');
    await page.getByTestId('product-save').click();
    await expect(page.getByTestId('products-list')).toContainText('F07 Product');

    await page
      .getByTestId('products-list')
      .locator('article')
      .filter({ hasText: 'F07 Product' })
      .getByRole('link', { name: 'Pricing' })
      .click();
    await page.getByTestId('price-retail').fill('100.00');
    await page.getByTestId('product-pricing-save').click();
    await expect(page.getByTestId('products-list')).toContainText('F07 Product');

    await page.goto('/app/inventory/opening-stock');
    await expect(page.getByTestId('opening-stock-form')).toBeVisible();
    await page.getByTestId('opening-warehouse').selectOption({ label: 'F07 WH' });
    await page.getByTestId('opening-product').selectOption({ label: 'F07 Product (none)' });
    await page.getByTestId('opening-quantity').fill('50');
    await page.getByTestId('opening-inventory-value').fill('2500.00');
    await page.getByTestId('opening-stock-save').click();
    await expect(page.getByTestId('opening-stock-success')).toBeVisible();

    await page.getByTestId('nav-sales').click();
    await page.getByTestId('sale-create-link').click();
    await expect(page.getByTestId('sale-draft-banner')).toBeVisible();
    await page.getByTestId('sale-branch').selectOption({ label: 'F07 Branch' });
    await page.getByTestId('sale-warehouse').selectOption({ label: 'F07 WH' });
    await page.getByTestId('sale-date').fill('2026-08-13');
    await page.getByTestId('sale-line-product').selectOption({ label: 'F07 Product' });
    await page.getByTestId('sale-line-quantity').fill('2');
    await expect(page.getByTestId('sale-line-unit-price')).toHaveValue('100.00', { timeout: 10_000 });
    await page.getByTestId('sale-save').click();
    await expect(page).toHaveURL(/\/app\/sales\/[^/]+$/);
    await expect(page.getByTestId('sale-post')).toBeVisible();

    for (let attempt = 0; attempt < 6; attempt += 1) {
      if ((await page.getByTestId('sale-payment-account').count()) >= 1) {
        break;
      }
      await page.getByTestId('sale-add-payment').click();
      await page.waitForTimeout(200);
    }
    await page.getByTestId('sale-payment-account').selectOption({ label: 'F07 Cash (cash)' });
    await page.getByTestId('sale-payment-amount').fill('200.00');
    await page.getByTestId('sale-post').click();
    await expect(page.getByTestId('sale-posted-banner')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('sale-invoice-number')).toContainText('F7E-');

    await expect(page.getByTestId('sales-return-section')).toBeVisible();
    await page.getByTestId('sales-return-reason').fill('E2E linked sales return');
    await page.getByTestId('sales-return-resolution').selectOption('account_refund');
    await page.getByTestId('sales-return-refund-account').selectOption({ label: 'F07 Cash (cash)' });
    await page.getByTestId('add-sales-return-line').click();
    await page.getByTestId('sales-return-qty').fill('1');
    await page.getByTestId('sales-return-condition').selectOption('sellable');
    await page.getByTestId('sales-return-submit').click();
    await expect(page.getByTestId('sale-success')).toContainText('Sales return posted');
    await expect(page.getByTestId('sale-invoice-number')).toContainText('F7E-');
    await expect(page.getByTestId('sale-posted-banner')).toBeVisible();

    await page.getByTestId('nav-returns').click();
    await expect(page.getByTestId('returns-list')).toBeVisible();
    await page.getByTestId('without-invoice-link').click();
    await expect(page.getByTestId('without-invoice-form')).toBeVisible();
    await page.getByTestId('without-invoice-warehouse').selectOption({ label: 'F07 WH' });
    await page.getByTestId('without-invoice-name').fill('Walk-in Rasheed');
    await page.getByTestId('without-invoice-phone').fill('03001112233');
    await page.getByTestId('without-invoice-product').selectOption({ label: 'F07 Product' });
    await page.getByTestId('without-invoice-qty').fill('1');
    await page.getByTestId('without-invoice-condition').selectOption('sellable');
    await page.getByTestId('without-invoice-reason').fill('E2E return without invoice');
    await page.getByTestId('without-invoice-value').fill('50.00');
    await page.getByTestId('without-invoice-resolution').selectOption('account_refund');
    await page.getByTestId('without-invoice-refund-account').selectOption({ label: 'F07 Cash (cash)' });
    await page.getByTestId('without-invoice-submit').click();
    await expect(page).toHaveURL(/\/app\/returns$/);
    await expect(page.getByTestId('returns-list')).toContainText('Return without invoice');
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
