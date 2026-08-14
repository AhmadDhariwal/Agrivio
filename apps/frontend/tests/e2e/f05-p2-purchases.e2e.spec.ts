import { API, activationTokenFromUrl } from './e2e-origins';
import { expect, test, type Page } from '@playwright/test';

const OWNER_PASSWORD = 'owner-activation-passphrase';

test.describe('F05 P2 purchase posting vertical slice', () => {
  test('draft → batch_expiry + package + landed + mixed payment → post → verify → immutable', async ({
    page,
    request,
  }) => {
    const stamp = Date.now();
    const organizationName = `F05 P2 E2E Org ${stamp}`;
    const ownerEmail = `f05p2-owner-${stamp}@example.com`;

    const bootstrap = await request.post(`${API}/api/v1/test/e2e/bootstrap`);
    expect(bootstrap.status()).toBe(200);
    const bootstrapBody = await bootstrap.json();
    const superAdmin = bootstrapBody.data.superAdmin as { email: string; password: string };

    await seedStarterPlan(request);
    await page.goto('/request-access');
    await page.getByTestId('org-name').fill(organizationName);
    await page.getByTestId('owner-email').fill(ownerEmail);
    await page.getByTestId('owner-display-name').fill('F05 P2 Owner');
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
    await page.getByTestId('warehouse-name').fill('P2 Receive');
    await page.getByTestId('warehouse-save').click();
    await expect(page.getByTestId('warehouses-list')).toContainText('P2 Receive');

    await page.getByRole('link', { name: 'Suppliers' }).click();
    await page.getByTestId('supplier-create-link').click();
    await page.getByTestId('supplier-name').fill('P2 Supplier');
    await page.getByTestId('supplier-save').click();
    await expect(page.getByTestId('suppliers-list')).toContainText('P2 Supplier');

    await page.getByRole('link', { name: 'Accounts' }).click();
    await page.getByTestId('account-create-link').click();
    await page.getByTestId('account-name').fill('P2 Cash');
    await page.getByTestId('account-type').selectOption('cash');
    await page.getByTestId('account-save').click();
    await expect(page.getByTestId('accounts-list')).toContainText('P2 Cash');
    await page
      .getByTestId('accounts-list')
      .locator('article')
      .filter({ hasText: 'P2 Cash' })
      .getByRole('link', { name: 'Edit' })
      .click();
    await page.getByTestId('account-opening-amount').fill('5000.00');
    await page.getByTestId('account-opening-save').click();
    await expect(page.getByTestId('account-derived-balance')).toContainText('5000.00');

    await page.getByRole('link', { name: 'Accounts' }).click();
    await page.getByTestId('account-create-link').click();
    await page.getByTestId('account-name').fill('P2 Bank');
    await page.getByTestId('account-type').selectOption('bank');
    await page.getByTestId('account-bank-name').fill('HBL');
    await page.getByTestId('account-save').click();
    await expect(page.getByTestId('accounts-list')).toContainText('P2 Bank');
    await page
      .getByTestId('accounts-list')
      .locator('article')
      .filter({ hasText: 'P2 Bank' })
      .getByRole('link', { name: 'Edit' })
      .click();
    await page.getByTestId('account-opening-amount').fill('5000.00');
    await page.getByTestId('account-opening-save').click();
    await expect(page.getByTestId('account-derived-balance')).toContainText('5000.00');

    await page.getByRole('link', { name: 'Categories' }).click();
    await page.getByTestId('category-create-link').click();
    await page.getByTestId('category-name').fill('P2 Inputs');
    await page.getByTestId('category-product-class').selectOption('general');
    await page.getByTestId('category-save').click();
    await expect(page.getByTestId('categories-list')).toContainText('P2 Inputs');

    await page.getByRole('link', { name: 'Products' }).click();
    await page.getByTestId('product-create-link').click();
    await page.getByTestId('product-name').fill('P2 Urea');
    await page.getByTestId('product-category').selectOption({ label: 'P2 Inputs' });
    await page.getByTestId('product-tracking-mode').selectOption('batch_expiry');
    await page.getByTestId('product-base-unit').fill('KG');
    await page.getByTestId('product-measurement-dimension').selectOption('mass');
    await page.getByTestId('packaging-unit-name').fill('50 KG');
    await page.getByTestId('packaging-conversion').fill('50');
    await page.getByTestId('product-save').click();
    await expect(page.getByTestId('products-list')).toContainText('P2 Urea');

    await page.getByTestId('nav-purchases').click();
    await page.getByTestId('purchase-create-link').click();
    await expect(page.getByTestId('purchase-draft-banner')).toBeVisible();
    await page.getByTestId('purchase-warehouse').selectOption({ label: 'P2 Receive' });
    await page.getByTestId('purchase-supplier').selectOption({ label: 'P2 Supplier' });
    await page.getByTestId('purchase-date').fill('2026-08-11');
    await page.getByTestId('purchase-line-product').selectOption({ label: 'P2 Urea (batch_expiry)' });
    await expect(page.getByTestId('purchase-line-packaging').locator('option', { hasText: '50 KG' })).toHaveCount(1, {
      timeout: 10000,
    });
    await page.getByTestId('purchase-line-packaging').selectOption({ label: '50 KG (×50)' });
    await page.getByTestId('purchase-line-quantity').fill('2');
    await page.getByTestId('purchase-line-unit-cost').fill('100.00');
    await page.getByTestId('purchase-line-batch').fill('LOT-P2-1');
    await page.getByTestId('purchase-line-expiry').fill('2027-06-01');
    await page.getByTestId('purchase-freight').fill('20.00');
    await page.getByTestId('purchase-save').click();
    await expect(page).toHaveURL(/\/app\/purchases\/[^/]+$/);
    await expect(page.getByTestId('purchase-draft-banner')).toBeVisible();

    const paymentAccounts = page.getByTestId('purchase-payment-account');
    // Drafts start with no payment lines.
    await expect(paymentAccounts).toHaveCount(0);
    // Under full-suite load, the payments FormArray can update slowly or overshoot.
    // Click until we have at least 2 payment rows, then remove any extras so
    // we never leave a blank Payment 3 that blocks posting.
    for (let attempt = 0; attempt < 6; attempt += 1) {
      if ((await paymentAccounts.count()) >= 2) {
        break;
      }
      await page.getByTestId('purchase-add-payment').click();
      // Small settle time for Angular to render the new control.
      await page.waitForTimeout(200);
    }
    await expect(paymentAccounts).toHaveCount(2, { timeout: 30_000 });
    const extraCount = await paymentAccounts.count();
    if (extraCount > 2) {
      const removeButtons = page.getByRole('button', { name: 'Remove payment' });
      // Remove from the end down to index 2 so indices align with rows.
      for (let idx = extraCount - 1; idx >= 2; idx -= 1) {
        await removeButtons.nth(idx).click();
      }
      await expect(paymentAccounts).toHaveCount(2);
    }

    const paymentAccount0 = paymentAccounts.first();
    await expect(paymentAccount0).toBeVisible();
    const cashOption = paymentAccount0.locator('option', { hasText: 'P2 Cash' });
    await expect(cashOption).toHaveCount(1);
    const cashValue = await cashOption.getAttribute('value');
    expect(cashValue).toBeTruthy();
    await paymentAccount0.selectOption({ value: cashValue });
    // Retry fill because the payment inputs can re-render/detach after selectOption.
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const paymentAmount0 = page.getByTestId('purchase-payment-amount').first();
      await expect(paymentAmount0).toBeVisible();
      await expect(paymentAmount0).toBeEditable();
      try {
        await paymentAmount0.fill('120.00');
        break;
      } catch (error) {
        if (attempt === 2) throw error;
      }
    }
    const paymentAccount1 = paymentAccounts.nth(1);
    await expect(paymentAccount1).toBeVisible();
    const bankOption = paymentAccount1.locator('option', { hasText: 'P2 Bank' });
    await expect(bankOption).toHaveCount(1);
    const bankValue = await bankOption.getAttribute('value');
    expect(bankValue).toBeTruthy();
    await paymentAccount1.selectOption({ value: bankValue });
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const paymentAmount1 = page.getByTestId('purchase-payment-amount').nth(1);
      await expect(paymentAmount1).toBeVisible();
      await expect(paymentAmount1).toBeEditable();
      try {
        await paymentAmount1.fill('50.00');
        break;
      } catch (error) {
        if (attempt === 2) throw error;
      }
    }

    await page.getByTestId('purchase-post').click();
    // Posting is asynchronous and can take longer under full E2E load.
    await expect(page.getByTestId('purchase-posted-banner')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('purchase-posted-totals')).toContainText('220.00');
    await expect(page.getByTestId('purchase-posted-totals')).toContainText('170.00');
    await expect(page.getByTestId('purchase-posted-totals')).toContainText('50.00');
    await expect(page.getByTestId('purchase-save')).toHaveCount(0);
    await expect(page.getByTestId('purchase-discard')).toHaveCount(0);

    await page.getByTestId('nav-inventory').click();
    await page.getByTestId('stock-refresh').click();
    await expect(page.getByTestId('stock-list')).toContainText('100.0000');
    await expect(page.getByTestId('stock-list')).toContainText('220.00');

    await page.getByRole('link', { name: 'Batches' }).click();
    await expect(page.getByTestId('batches-list')).toContainText('LOT-P2-1');

    await page.getByTestId('nav-inventory').click();
    await page.getByRole('link', { name: 'Movements' }).click();
    await expect(page.getByTestId('movement-row').filter({ hasText: 'purchase' }).first()).toBeVisible();

    const supplierLedger = await page.request.get(`${API}/api/v1/suppliers`);
    expect(supplierLedger.status()).toBe(200);
    const suppliersBody = await supplierLedger.json();
    const supplier = suppliersBody.data.items.find((item: { name: string }) => item.name === 'P2 Supplier');
    expect(supplier.derivedBalances.payable.amount).toBe('50.00');

    await page.getByRole('link', { name: 'Accounts' }).click();
    await page
      .getByTestId('accounts-list')
      .locator('article')
      .filter({ hasText: 'P2 Cash' })
      .getByRole('link', { name: 'Edit' })
      .click();
    await expect(page.getByTestId('account-derived-balance')).toContainText('4880.00');
    await page.getByRole('link', { name: 'Accounts' }).click();
    await page
      .getByTestId('accounts-list')
      .locator('article')
      .filter({ hasText: 'P2 Bank' })
      .getByRole('link', { name: 'Edit' })
      .click();
    await expect(page.getByTestId('account-derived-balance')).toContainText('4950.00');

    await page.getByTestId('nav-purchases').click();
    await expect(page.getByTestId('purchases-list')).toContainText('Posted');
    await page.getByTestId('purchase-row').first().getByRole('link').click();
    await expect(page.getByTestId('purchase-posted-banner')).toBeVisible();
    await expect(page.getByTestId('purchase-warehouse')).toBeDisabled();
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
