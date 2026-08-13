import { expect, test, type Page } from '@playwright/test';

const API = 'http://localhost:3000';
const OWNER_PASSWORD = 'owner-activation-passphrase';
const CASHIER_PASSWORD = 'cashier-activation-passphrase';

test.describe('F06 P4 printing and cashier POS', () => {
  test('cashier completes cash POS, prints layouts, and mixed payment works', async ({
    page,
    request,
  }) => {
    test.setTimeout(300_000);
    const stamp = Date.now();
    const organizationName = `F06 P4 E2E Org ${stamp}`;
    const ownerEmail = `f06p4-owner-${stamp}@example.com`;
    const cashierEmail = `f06p4-cashier-${stamp}@example.com`;

    const bootstrap = await request.post(`${API}/api/v1/test/e2e/bootstrap`);
    expect(bootstrap.status()).toBe(200);
    const bootstrapBody = await bootstrap.json();
    const superAdmin = bootstrapBody.data.superAdmin as { email: string; password: string };

    await seedStarterPlan(request);
    await page.goto('/request-access');
    await page.getByTestId('org-name').fill(organizationName);
    await page.getByTestId('owner-email').fill(ownerEmail);
    await page.getByTestId('owner-display-name').fill('F06 P4 Owner');
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

    await page.getByRole('link', { name: 'Branches' }).click();
    await page.getByTestId('branch-create-link').click();
    await page.getByTestId('branch-name').fill('P4 Branch');
    await page.getByTestId('branch-invoice-prefix').fill('P4E');
    await page.getByTestId('branch-save').click();
    await expect(page.getByTestId('branches-list')).toContainText('P4 Branch');

    await page.getByRole('link', { name: 'Warehouses' }).click();
    await page.getByTestId('warehouse-create-link').click();
    await page.getByTestId('warehouse-name').fill('P4 WH');
    await page.getByTestId('warehouse-save').click();
    await expect(page.getByTestId('warehouses-list')).toContainText('P4 WH');

    await page.getByRole('link', { name: 'Accounts' }).click();
    await page.getByTestId('account-create-link').click();
    await page.getByTestId('account-name').fill('P4 Cash');
    await page.getByTestId('account-type').selectOption('cash');
    await page.getByTestId('account-save').click();
    await expect(page.getByTestId('accounts-list')).toContainText('P4 Cash');
    await page
      .getByTestId('accounts-list')
      .locator('article')
      .filter({ hasText: 'P4 Cash' })
      .getByRole('link', { name: 'Edit' })
      .click();
    await page.getByTestId('account-opening-amount').fill('10000.00');
    await page.getByTestId('account-opening-save').click();
    await expect(page.getByTestId('account-derived-balance')).toContainText('10000.00');

    await page.getByRole('link', { name: 'Categories' }).click();
    await page.getByTestId('category-create-link').click();
    await page.getByTestId('category-name').fill('P4 Cat');
    await page.getByTestId('category-product-class').selectOption('general');
    await page.getByTestId('category-save').click();
    await expect(page.getByTestId('categories-list')).toContainText('P4 Cat');

    await page.getByRole('link', { name: 'Products' }).click();
    await page.getByTestId('product-create-link').click();
    await page.getByTestId('product-name').fill('P4 Product');
    await page.getByTestId('product-category').selectOption({ label: 'P4 Cat' });
    await page.getByTestId('product-tracking-mode').selectOption('none');
    await page.getByTestId('product-base-unit').fill('EA');
    await page.getByTestId('product-measurement-dimension').selectOption('mass');
    await page.getByTestId('product-save').click();
    await expect(page.getByTestId('products-list')).toContainText('P4 Product');
    await page
      .getByTestId('products-list')
      .locator('article')
      .filter({ hasText: 'P4 Product' })
      .getByRole('link', { name: 'Pricing' })
      .click();
    await page.getByTestId('price-retail').fill('100.00');
    await page.getByTestId('product-pricing-save').click();
    await expect(page.getByTestId('products-list')).toBeVisible();

    await page.goto('/app/inventory/opening-stock');
    await expect(page.getByTestId('opening-stock-form')).toBeVisible();
    await page.getByTestId('opening-warehouse').selectOption({ label: 'P4 WH' });
    await page.getByTestId('opening-product').selectOption({ label: 'P4 Product (none)' });
    await page.getByTestId('opening-quantity').fill('50');
    await page.getByTestId('opening-inventory-value').fill('2500.00');
    await page.getByTestId('opening-stock-save').click();
    await expect(page.getByTestId('opening-stock-success')).toBeVisible();

    await page.getByRole('link', { name: 'Customers' }).click();
    await page.getByTestId('customer-create-link').click();
    await page.getByTestId('customer-name').fill('P4 Farmer');
    await page.getByTestId('customer-phone').fill('03001112233');
    await page.getByTestId('customer-type').selectOption('farmer');
    await page.getByTestId('customer-credit-enabled').check();
    await page.getByTestId('customer-credit-limit').fill('100000.00');
    await page.getByTestId('customer-save').click();
    await expect(page.getByTestId('customers-list')).toContainText('P4 Farmer');

    await page.getByRole('link', { name: 'Employees' }).click();
    await page.getByTestId('employee-create-link').click();
    await page.getByTestId('employee-email').fill(cashierEmail);
    await page.getByTestId('employee-display-name').fill('P4 Cashier');
    await page.getByTestId('employee-role').selectOption('Cashier');
    await page.locator('label.check', { hasText: 'P4 Branch' }).locator('input').check();
    await page.locator('label.check', { hasText: 'P4 WH' }).locator('input').check();
    await page.getByTestId('employee-save').click();
    await expect(page.getByText(/activation link/i)).toBeVisible();
    const handoff = (await page.getByText(/activation link/i).textContent()) ?? '';
    const cashierUrl = handoff.match(/https?:\/\/\S+|\/activate\?token=\S+/)?.[0] ?? '';
    const cashierToken = new URL(cashierUrl, 'http://localhost:4200').searchParams.get('token') ?? '';
    expect(cashierToken).toBeTruthy();

    await page.getByTestId('sign-out').click();
    await page.goto(`/activate?token=${encodeURIComponent(cashierToken)}`);
    await page.getByTestId('activation-password-input').fill(CASHIER_PASSWORD);
    await page.getByTestId('activation-password-confirm-input').fill(CASHIER_PASSWORD);
    await page.getByTestId('activate-submit').click();
    await expect(page).toHaveURL(/\/context/);
    await page.getByTestId('continue-workspace').click();
    await expect(page.getByTestId('authenticated-shell')).toBeVisible();
    await expect(page.locator('.ag-shell__meta')).toContainText('Cashier');

    await page.getByTestId('nav-sales').click();
    await page.getByTestId('sale-create-link').click();
    await expect(page.getByTestId('sale-draft-banner')).toBeVisible();
    await page.getByTestId('sale-branch').selectOption({ label: 'P4 Branch' });
    await page.getByTestId('sale-warehouse').selectOption({ label: 'P4 WH' });
    await page.getByTestId('sale-date').fill('2026-08-13');
    await page.getByTestId('sale-line-product').selectOption({ label: 'P4 Product' });
    await page.getByTestId('sale-line-quantity').fill('1');
    await expect(page.getByTestId('sale-line-unit-price')).toHaveValue('100.00');
    await page.getByTestId('sale-save').click();
    await expect(page).toHaveURL(/\/app\/sales\/[^/]+$/);
    await expect(page.getByTestId('sale-post')).toBeVisible();
    await page.getByTestId('sale-fill-cash').click();
    await expect(page.getByTestId('sale-payment-account')).toHaveValue(/.+/);
    await page.getByTestId('sale-post').click();
    await expect(page.getByTestId('sale-invoice-number')).toContainText('P4E-', { timeout: 30_000 });
    await expect(page.getByTestId('sale-posted-banner')).toBeVisible();
    await expect(page.getByTestId('sale-success')).toContainText(/Invoice P4E-/);
    await expect(page.getByTestId('sale-post')).toHaveCount(0);
    await expect(page.getByTestId('sale-cancel-section')).toHaveCount(0);

    await page.getByTestId('sale-print-link').click();
    await expect(page.getByTestId('invoice-layout-80mm')).toBeVisible();
    await expect(page.getByTestId('invoice-number')).toContainText('P4E-');
    await expect(page.getByTestId('invoice-product-name')).toContainText('P4 Product');
    await expect(page.getByTestId('invoice-unit-price')).toContainText('100.00');
    await page.getByTestId('print-layout-58mm').click();
    await expect(page.getByTestId('invoice-layout-58mm')).toBeVisible();
    await page.getByTestId('print-layout-a4').click();
    await expect(page.getByTestId('invoice-layout-a4')).toBeVisible();
    await page.evaluate(() => {
      window.print = () => {
        document.body.setAttribute('data-print-called', 'true');
      };
    });
    await page.getByTestId('invoice-print-button').click();
    await expect(page.locator('body')).toHaveAttribute('data-print-called', 'true');

    await page.getByTestId('nav-sales').click();
    await page.getByTestId('sale-create-link').click();
    await page.getByTestId('sale-branch').selectOption({ label: 'P4 Branch' });
    await page.getByTestId('sale-warehouse').selectOption({ label: 'P4 WH' });
    await page.getByTestId('sale-customer').selectOption({ label: 'P4 Farmer (retail)' });
    await page.getByTestId('sale-date').fill('2026-08-13');
    await page.getByTestId('sale-line-product').selectOption({ label: 'P4 Product' });
    await page.getByTestId('sale-line-quantity').fill('2');
    await page.getByTestId('sale-save').click();
    await expect(page).toHaveURL(/\/app\/sales\/[^/]+$/);
    await expect(page.getByTestId('sale-post')).toBeVisible();
    await page.getByTestId('sale-add-payment').click();
    await page.getByTestId('sale-payment-account').selectOption({ label: 'P4 Cash (cash)' });
    await page.getByTestId('sale-payment-amount').fill('50.00');
    await page.getByTestId('sale-post').click();
    await expect(page.getByTestId('sale-invoice-number')).toContainText('P4E-', { timeout: 30_000 });
    await expect(page.getByTestId('sale-posted-details')).toContainText('50.00');

    await page.getByTestId('sign-out').click();
    await signIn(page, ownerEmail, OWNER_PASSWORD);
    if (page.url().includes('/context')) {
      await page.getByTestId('continue-workspace').click();
    }
    await expect(page.getByTestId('authenticated-shell')).toBeVisible();
    await page.getByRole('link', { name: 'Customers' }).click();
    await page.getByTestId('customer-create-link').click();
    await page.getByTestId('customer-name').fill('Limited Farmer');
    await page.getByTestId('customer-phone').fill('03004445566');
    await page.getByTestId('customer-type').selectOption('farmer');
    await page.getByTestId('customer-credit-enabled').check();
    await page.getByTestId('customer-credit-limit').fill('10.00');
    await page.getByTestId('customer-credit-behaviour').selectOption('manager_approval');
    await page.getByTestId('customer-save').click();
    await expect(page.getByTestId('customers-list')).toContainText('Limited Farmer');

    await page.getByTestId('nav-sales').click();
    await page.getByTestId('sale-create-link').click();
    await page.getByTestId('sale-branch').selectOption({ label: 'P4 Branch' });
    await page.getByTestId('sale-warehouse').selectOption({ label: 'P4 WH' });
    await page.getByTestId('sale-customer').selectOption({ label: 'Limited Farmer (retail)' });
    await page.getByTestId('sale-date').fill('2026-08-13');
    await page.getByTestId('sale-line-product').selectOption({ label: 'P4 Product' });
    await page.getByTestId('sale-line-quantity').fill('1');
    await page.getByTestId('sale-save').click();
    await expect(page).toHaveURL(/\/app\/sales\/[^/]+$/);
    await expect(page.getByTestId('sale-post')).toBeVisible();
    await page.getByTestId('sale-post').click();
    await expect(page.getByTestId('sale-error')).toContainText(/approval/i);
    await page.getByTestId('sale-credit-limit-reason').fill('Owner approved temporary exceed');
    await page.getByTestId('sale-post').click();
    await expect(page.getByTestId('sale-invoice-number')).toContainText('P4E-', { timeout: 30_000 });
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
