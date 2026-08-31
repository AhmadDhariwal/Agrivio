import { API, activationTokenFromUrl } from './e2e-origins';
import { login, enterPlatformWorkspace } from './e2e-auth-helper';
import { expect, test, type APIRequestContext } from '@playwright/test';

const OWNER_PASSWORD = 'owner-activation-passphrase';

test.describe('F03 P3 setup openings and plan limits', () => {
  test('owner completes guided setup including openings and sees plan limit feedback', async ({
    page,
    request,
  }) => {
    const stamp = Date.now();
    const organizationName = `F03 P3 E2E Org ${stamp}`;
    const ownerEmail = `f03p3-owner-${stamp}@example.com`;

    const bootstrap = await request.post(`${API}/api/v1/test/e2e/bootstrap`);
    expect(bootstrap.status()).toBe(200);
    const bootstrapBody = await bootstrap.json();
    const superAdmin = bootstrapBody.data.superAdmin as { email: string; password: string };

    // Seed before activation request so the org binds this plan (same pattern as backend F03 specs).
    await seedStarterPlan(request, {
      customers: 2,
      suppliers: 20,
      products: 50,
    });

    await page.goto('/request-access');
    await page.getByTestId('org-name').fill(organizationName);
    await page.getByTestId('owner-email').fill(ownerEmail);
    await page.getByTestId('owner-display-name').fill('F03 P3 Owner');
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

    await page.getByTestId('nav-setup').click();
    await expect(page.getByTestId('setup-steps')).toBeVisible();

    await page.getByRole('link', { name: 'Settings' }).click();
    await expect(page.getByTestId('organization-settings')).toBeVisible();
    await page.getByTestId('settings-trading-name').fill('P3 Trading');
    await page.getByTestId('settings-save').click();
    await expect(page.getByText('Organization settings saved.')).toBeVisible();

    await page.getByRole('link', { name: 'Branches' }).click();
    await page.getByTestId('branch-create-link').click();
    await page.getByTestId('branch-name').fill('Main Branch');
    await page.getByTestId('branch-invoice-prefix').fill('P3M');
    await page.getByTestId('branch-save').click();
    await expect(page.getByTestId('branches-list')).toContainText('Main Branch');

    await page.getByRole('link', { name: 'Warehouses' }).click();
    await page.getByTestId('warehouse-create-link').click();
    await page.getByTestId('warehouse-name').fill('Main Warehouse');
    await page.getByTestId('warehouse-save').click();
    await expect(page.getByTestId('warehouses-list')).toContainText('Main Warehouse');

    await page.getByRole('link', { name: 'Employees' }).click();
    await page.getByTestId('employee-create-link').click();
    await page.getByTestId('employee-email').fill(`cashier-p3-${stamp}@example.com`);
    await page.getByTestId('employee-display-name').fill('Cashier P3');
    await page.getByTestId('employee-role').selectOption('Cashier');
    await page.getByTestId('employee-save').click();
    await expect(page.getByText(/activation link/i)).toBeVisible();

    await page.getByRole('link', { name: 'Categories', exact: true }).click();
    await page.getByTestId('category-create-link').click();
    await page.getByTestId('category-name').fill('Fertilizers');
    await page.getByTestId('category-product-class').selectOption('fertilizer');
    await page.getByTestId('category-save').click();
    await expect(page.getByTestId('categories-list')).toContainText('Fertilizers');

    await page.getByRole('link', { name: 'Products' }).click();
    await page.getByTestId('product-create-link').click();
    await page.getByTestId('product-name').fill('Urea P3');
    await page.getByTestId('product-category').selectOption({ label: 'Fertilizers' });
    await page.getByTestId('product-tracking-mode').selectOption('batch_expiry');
    await page.getByTestId('product-base-unit').fill('KG');
    await page.getByTestId('product-measurement-dimension').selectOption('mass');
    await page.getByTestId('packaging-unit-name').fill('50 KG');
    await page.getByTestId('packaging-conversion').fill('50');
    await page.getByTestId('product-save').click();
    await expect(page.getByTestId('products-list')).toContainText('Urea P3');

    await page.getByTestId('products-list').getByRole('link', { name: 'Pricing' }).click();
    await page.getByTestId('price-retail').fill('3200.00');
    await page.getByTestId('product-pricing-save').click();
    await expect(page.getByTestId('products-list')).toBeVisible();

    await page.getByRole('link', { name: 'Customers' }).click();
    await page.getByTestId('customer-create-link').click();
    await page.getByTestId('customer-name').fill('Ali Farmer');
    await page.getByTestId('customer-type').selectOption('farmer');
    await page.getByTestId('customer-save').click();
    await expect(page.getByTestId('customers-list')).toContainText('Ali Farmer');

    await page.getByTestId('customers-list').getByRole('link', { name: 'Edit' }).click();
    await expect(page.getByTestId('customer-opening-section')).toBeVisible();
    await page.getByTestId('customer-opening-kind').selectOption('receivable');
    await page.getByTestId('customer-opening-amount').fill('1500.00');
    await page.getByTestId('customer-opening-save').click();
    await expect(page.getByTestId('customer-opening-posted')).toBeVisible();

    // Soft warning when remaining capacity hits the approach threshold (limit 2 → 2nd create).
    await page.getByRole('link', { name: 'Customers' }).click();
    await page.getByTestId('customer-create-link').click();
    await page.getByTestId('customer-name').fill('Second Farmer');
    await page.getByTestId('customer-type').selectOption('farmer');
    await page.getByTestId('customer-save').click();
    await expect(page.getByTestId('plan-soft-warning')).toContainText('Approaching plan limit');
    await page.getByRole('link', { name: 'Cancel' }).click();
    await expect(page.getByTestId('customers-list')).toContainText('Second Farmer');

    // Hard block still enforced by the backend on the next create.
    await page.getByTestId('customer-create-link').click();
    await page.getByTestId('customer-name').fill('Blocked Farmer');
    await page.getByTestId('customer-type').selectOption('farmer');
    await page.getByTestId('customer-save').click();
    await expect(page.locator('.ag-alert--danger')).toContainText(
      /Plan limit reached for customers/i,
    );
    await page.getByRole('link', { name: 'Cancel' }).click();

    await page.getByRole('link', { name: 'Suppliers' }).click();
    await page.getByTestId('supplier-create-link').click();
    await page.getByTestId('supplier-name').fill('Punjab Supply');
    await page.getByTestId('supplier-save').click();
    await expect(page.getByTestId('suppliers-list')).toContainText('Punjab Supply');
    await page.getByTestId('suppliers-list').getByRole('link', { name: 'Edit' }).click();
    await page.getByTestId('supplier-opening-kind').selectOption('payable');
    await page.getByTestId('supplier-opening-amount').fill('900.00');
    await page.getByTestId('supplier-opening-save').click();
    await expect(page.getByTestId('supplier-opening-posted')).toBeVisible();

    await page.getByRole('link', { name: 'Accounts' }).click();
    await page.getByTestId('account-create-link').click();
    await page.getByTestId('account-name').fill('Till Cash');
    await page.getByTestId('account-type').selectOption('cash');
    await page.getByTestId('account-save').click();
    await expect(page.getByTestId('accounts-list')).toContainText('Till Cash');
    await page.getByTestId('accounts-list').getByRole('link', { name: 'Edit' }).click();
    await page.getByTestId('account-opening-amount').fill('5000.00');
    await page.getByTestId('account-opening-save').click();
    await expect(page.getByTestId('account-opening-posted')).toBeVisible();

    await expect(page.getByTestId('nav-setup')).toBeVisible();
    await page.getByTestId('nav-setup').click();
    await expect(page.getByTestId('setup-steps')).toBeVisible();
    await expect(page.getByTestId('setup-step-opening_balances')).toContainText('complete');
    await expect(page.getByTestId('setup-ready')).toBeVisible();
    await expect(page.getByTestId('setup-notes')).toContainText('Inventory/Purchases/Sales');
  });
});

async function seedStarterPlan(
  request: APIRequestContext,
  limits: { customers: number; suppliers: number; products: number },
): Promise<void> {
  const csrfResponse = await request.post(`${API}/api/v1/auth/csrf`);
  expect(csrfResponse.status()).toBe(200);
  const csrfBody = await csrfResponse.json();
  const csrfToken = csrfBody.data.csrfToken as string;

  const planResponse = await request.post(`${API}/api/v1/platform/subscription-plans`, {
    headers: {
      'X-CSRF-Token': csrfToken,
      'X-Platform-Actor': 'super-admin',
    },
    data: {
      planCode: 'Starter',
      activate: true,
      monthlyPriceMinorUnits: 1000,
      limits,
    },
  });
  expect([200, 201]).toContain(planResponse.status());
}

