import { API, activationTokenFromUrl } from './e2e-origins';
import { login, enterPlatformWorkspace } from './e2e-auth-helper';
import { expect, test, type Page } from '@playwright/test';

const OWNER_PASSWORD = 'owner-activation-passphrase';

test.describe('F06 P3 approvals and sale cancellation', () => {
  test('post walk-in cash → cancel with reason → original invoice preserved', async ({
    page,
    request,
  }) => {
    test.setTimeout(240_000);
    const stamp = Date.now();
    const organizationName = `F06 P3 E2E Org ${stamp}`;
    const ownerEmail = `f06p3-owner-${stamp}@example.com`;

    const bootstrap = await request.post(`${API}/api/v1/test/e2e/bootstrap`);
    expect(bootstrap.status()).toBe(200);
    const bootstrapBody = await bootstrap.json();
    const superAdmin = bootstrapBody.data.superAdmin as { email: string; password: string };

    await seedStarterPlan(request);
    await page.goto('/request-access');
    await page.getByTestId('org-name').fill(organizationName);
    await page.getByTestId('owner-email').fill(ownerEmail);
    await page.getByTestId('owner-display-name').fill('F06 P3 Owner');
    await page.getByTestId('request-submit').click();
    await expect(page.getByTestId('request-success')).toBeVisible();

    await login(page, superAdmin.email, superAdmin.password);
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
    await page.getByTestId('branch-name').fill('P3 Branch');
    await page.getByTestId('branch-invoice-prefix').fill('P3E');
    await page.getByTestId('branch-save').click();
    await expect(page.getByTestId('branches-list')).toContainText('P3 Branch');

    await page.getByRole('link', { name: 'Warehouses' }).click();
    await page.getByTestId('warehouse-create-link').click();
    await page.getByTestId('warehouse-name').fill('P3 WH');
    await page.getByTestId('warehouse-save').click();
    await expect(page.getByTestId('warehouses-list')).toContainText('P3 WH');

    await page.getByRole('link', { name: 'Accounts' }).click();
    await page.getByTestId('account-create-link').click();
    await page.getByTestId('account-name').fill('P3 Cash');
    await page.getByTestId('account-type').selectOption('cash');
    await page.getByTestId('account-save').click();
    await expect(page.getByTestId('accounts-list')).toContainText('P3 Cash');
    await page
      .getByTestId('accounts-list')
      .locator('article')
      .filter({ hasText: 'P3 Cash' })
      .getByRole('link', { name: 'Edit' })
      .click();
    await page.getByTestId('account-opening-amount').fill('10000.00');
    await page.getByTestId('account-opening-save').click();
    await expect(page.getByTestId('account-derived-balance')).toContainText('10000.00');

    await page.getByRole('link', { name: 'Categories', exact: true }).click();
    await page.getByTestId('category-create-link').click();
    await page.getByTestId('category-name').fill('P3 Cat');
    await page.getByTestId('category-product-class').selectOption('general');
    await page.getByTestId('category-save').click();
    await expect(page.getByTestId('categories-list')).toContainText('P3 Cat');

    await page.getByRole('link', { name: 'Products' }).click();
    await page.getByTestId('product-create-link').click();
    await page.getByTestId('product-name').fill('P3 Product');
    await page.getByTestId('product-category').selectOption({ label: 'P3 Cat' });
    await page.getByTestId('product-tracking-mode').selectOption('none');
    await page.getByTestId('product-base-unit').fill('EA');
    await page.getByTestId('product-measurement-dimension').selectOption('mass');
    await page.getByTestId('product-save').click();
    await expect(page.getByTestId('products-list')).toContainText('P3 Product');

    await page
      .getByTestId('products-list')
      .locator('article')
      .filter({ hasText: 'P3 Product' })
      .getByRole('link', { name: 'Pricing' })
      .click();
    await page.getByTestId('price-retail').fill('100.00');
    await page.getByTestId('product-pricing-save').click();
    await expect(page.getByTestId('products-list')).toBeVisible();

    await page.goto('/app/inventory/opening-stock');
    await expect(page.getByTestId('opening-stock-form')).toBeVisible();
    await page.getByTestId('opening-warehouse').selectOption({ label: 'P3 WH' });
    await page.getByTestId('opening-product').selectOption({ label: 'P3 Product (none)' });
    await page.getByTestId('opening-quantity').fill('50');
    await page.getByTestId('opening-inventory-value').fill('2500.00');
    await page.getByTestId('opening-stock-save').click();
    await expect(page.getByTestId('opening-stock-success')).toBeVisible();

    await page.getByTestId('nav-sales').click();
    await page.getByTestId('sale-create-link').click();
    await expect(page.getByTestId('sale-draft-banner')).toBeVisible();
    await page.getByTestId('sale-branch').selectOption({ label: 'P3 Branch' });
    await page.getByTestId('sale-warehouse').selectOption({ label: 'P3 WH' });
    await page.getByTestId('sale-date').fill('2026-08-13');
    await page.getByTestId('sale-line-product').selectOption({ label: 'P3 Product' });
    await page.getByTestId('sale-line-quantity').fill('2');
    await expect(page.getByTestId('sale-line-unit-price')).toHaveValue('100.00', { timeout: 10_000 });
    await page.getByTestId('sale-save').click();
    await expect(page).toHaveURL(/\/app\/sales\/[^/]+$/);
    await expect(page.getByTestId('sale-post')).toBeVisible();
    await expect(page.getByTestId('sale-approvals')).toBeVisible();

    for (let attempt = 0; attempt < 6; attempt += 1) {
      if ((await page.getByTestId('sale-payment-account').count()) >= 1) {
        break;
      }
      await page.getByTestId('sale-add-payment').click();
      await page.waitForTimeout(200);
    }
    await page.getByTestId('sale-payment-account').selectOption({ label: 'P3 Cash (cash)' });
    await page.getByTestId('sale-payment-amount').fill('200.00');
    await page.getByTestId('sale-post').click();
    await expect(page.getByTestId('sale-posted-banner')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('sale-posted-details')).toContainText('P3E-');

    await expect(page.getByTestId('sale-cancel-section')).toBeVisible();
    await page.getByTestId('cancel-reason-input').fill('E2E cancellation proof');
    await page.getByTestId('sale-cancel-btn').click();
    await expect(page.getByTestId('sale-cancelled-banner')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('sale-cancelled-banner')).toContainText('E2E cancellation proof');
    await expect(page.getByTestId('sale-posted-details')).toContainText('P3E-');
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

