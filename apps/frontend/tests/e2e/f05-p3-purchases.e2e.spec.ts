import { API, activationTokenFromUrl } from './e2e-origins';
import { login, enterPlatformWorkspace } from './e2e-auth-helper';
import { expect, test, type Page } from '@playwright/test';

const OWNER_PASSWORD = 'owner-activation-passphrase';

test.describe('F05 P3 supplier payments, returns, cancellation, reconciliation E2E', () => {
  test('full vertical slice: post purchase → standalone payment → return → cancel → reconciliation', async ({
    page,
    request,
  }) => {
    const stamp = Date.now();
    const organizationName = `F05 P3 E2E Org ${stamp}`;
    const ownerEmail = `f05p3-owner-${stamp}@example.com`;

    const bootstrap = await request.post(`${API}/api/v1/test/e2e/bootstrap`);
    expect(bootstrap.status()).toBe(200);
    const bootstrapBody = await bootstrap.json();
    const superAdmin = bootstrapBody.data.superAdmin as { email: string; password: string };

    await seedStarterPlan(request);
    await page.goto('/request-access');
    await page.getByTestId('org-name').fill(organizationName);
    await page.getByTestId('owner-email').fill(ownerEmail);
    await page.getByTestId('owner-display-name').fill('F05 P3 Owner');
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

    // ---- Setup: warehouse, supplier, accounts, product ----
    await page.getByRole('link', { name: 'Warehouses' }).click();
    await page.getByTestId('warehouse-create-link').click();
    await page.getByTestId('warehouse-name').fill('P3 Receive');
    await page.getByTestId('warehouse-save').click();
    await expect(page.getByTestId('warehouses-list')).toContainText('P3 Receive');

    await page.getByRole('link', { name: 'Suppliers' }).click();
    await page.getByTestId('supplier-create-link').click();
    await page.getByTestId('supplier-name').fill('P3 Supplier');
    await page.getByTestId('supplier-save').click();
    await expect(page.getByTestId('suppliers-list')).toContainText('P3 Supplier');

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
    await page.getByTestId('category-name').fill('P3 Inputs');
    await page.getByTestId('category-product-class').selectOption('general');
    await page.getByTestId('category-save').click();
    await expect(page.getByTestId('categories-list')).toContainText('P3 Inputs');

    await page.getByRole('link', { name: 'Products' }).click();
    await page.getByTestId('product-create-link').click();
    await page.getByTestId('product-name').fill('P3 Urea');
    await page.getByTestId('product-category').selectOption({ label: 'P3 Inputs' });
    await page.getByTestId('product-tracking-mode').selectOption('none');
    await page.getByTestId('product-base-unit').fill('KG');
    await page.getByTestId('product-measurement-dimension').selectOption('mass');
    await page.getByTestId('product-save').click();
    await expect(page.getByTestId('products-list')).toContainText('P3 Urea');

    // ---- Purchase 1 (for return) ----
    await page.getByTestId('nav-purchases').click();
    await page.getByTestId('purchase-create-link').click();
    await expect(page.getByTestId('purchase-draft-banner')).toBeVisible();
    await page.getByTestId('purchase-warehouse').selectOption({ label: 'P3 Receive' });
    await page.getByTestId('purchase-supplier').selectOption({ label: 'P3 Supplier' });
    await page.getByTestId('purchase-date').fill('2026-08-11');
    await page.getByTestId('purchase-line-product').selectOption({ label: 'P3 Urea (none)' });
    await page.getByTestId('purchase-line-quantity').fill('10');
    await page.getByTestId('purchase-line-unit-cost').fill('50.00');
    await page.getByTestId('purchase-save').click();
    await expect(page).toHaveURL(/\/app\/purchases\/[^/]+$/);

    await page.getByTestId('purchase-post').click();
    await expect(page.getByTestId('purchase-posted-banner')).toBeVisible();
    await expect(page.getByTestId('purchase-posted-totals')).toContainText('500.00');

    const purchase1Url = page.url();
    const purchase1Id = purchase1Url.split('/').pop() ?? '';

    // ---- Verify inventory after purchase 1 ----
    await page.getByTestId('nav-inventory').click();
    await page.getByTestId('stock-refresh').click();
    await expect(page.getByTestId('stock-list')).toContainText('10.0000');

    // ---- Verify payable via API ----
    const suppliersResp = await page.request.get(`${API}/api/v1/suppliers`);
    expect(suppliersResp.status()).toBe(200);
    const suppliersBody = await suppliersResp.json();
    const p3Supplier = suppliersBody.data.items.find(
      (item: { name: string }) => item.name === 'P3 Supplier',
    );
    expect(p3Supplier).toBeDefined();
    expect(p3Supplier.derivedBalances.payable.amount).toBe('500.00');
    const supplierId = p3Supplier.id;

    // ---- Standalone general supplier payment (partial: 200) ----
    await page.getByTestId('nav-supplier-payments').click();
    await page.getByTestId('supplier-payment-create-link').click();
    await page.getByTestId('supplier-payment-supplier').selectOption({ label: 'P3 Supplier' });
    await page.getByTestId('supplier-payment-account').selectOption({ label: 'P3 Cash (cash)' });
    await page.getByTestId('supplier-payment-amount').fill('200.00');
    await page.getByTestId('supplier-payment-date').fill('2026-08-12');
    await page.getByTestId('alloc-mode-general').check();
    await page.getByTestId('supplier-payment-save').click();
    await expect(page.getByTestId('supplier-payment-success')).toBeVisible();

    // ---- Verify allocation via API ----
    const unpaidResp = await page.request.get(`${API}/api/v1/suppliers/${supplierId}/unpaid-purchases`);
    expect(unpaidResp.status()).toBe(200);
    const unpaidBody = await unpaidResp.json();
    const unpaidEntry = unpaidBody.data.items.find(
      (i: { id: string }) => i.id === purchase1Id,
    );
    expect(unpaidEntry).toBeDefined();
    expect(unpaidEntry.outstanding.amount).toBe('300.00');

    // Cash account balance should be reduced
    await page.getByRole('link', { name: 'Accounts' }).click();
    await page
      .getByTestId('accounts-list')
      .locator('article')
      .filter({ hasText: 'P3 Cash' })
      .getByRole('link', { name: 'Edit' })
      .click();
    await expect(page.getByTestId('account-derived-balance')).toContainText('9800.00');

    // ---- Purchase return on purchase 1 (3 KG) ----
    await page.goto(`/app/purchases/${purchase1Id}`);
    await expect(page.getByTestId('purchase-posted-banner')).toBeVisible();
    await page.getByTestId('add-return-line').click();
    await page.getByTestId('return-line-qty').fill('3');
    await page.getByTestId('return-reason-input').fill('Damaged goods');
    await page.getByTestId('submit-return-btn').click();
    await expect(page.getByTestId('purchase-success')).toContainText(/Return/i);

    // ---- Verify inventory reduced after return ----
    await page.getByTestId('nav-inventory').click();
    await page.getByTestId('stock-refresh').click();
    await expect(page.getByTestId('stock-list')).toContainText('7.0000');

    const movementsResp = await page.request.get(`${API}/api/v1/inventory/movements`);
    expect(movementsResp.status()).toBe(200);
    const movementsBody = await movementsResp.json();
    expect(
      movementsBody.data.items.some((m: { sourceType: string }) => m.sourceType === 'purchase_return'),
    ).toBe(true);

    // ---- Purchase 2 (separate purchase for cancel) ----
    await page.getByTestId('nav-purchases').click();
    await page.getByTestId('purchase-create-link').click();
    await expect(page.getByTestId('purchase-draft-banner')).toBeVisible();
    await page.getByTestId('purchase-warehouse').selectOption({ label: 'P3 Receive' });
    await page.getByTestId('purchase-supplier').selectOption({ label: 'P3 Supplier' });
    await page.getByTestId('purchase-date').fill('2026-08-12');
    await page.getByTestId('purchase-line-product').selectOption({ label: 'P3 Urea (none)' });
    await page.getByTestId('purchase-line-quantity').fill('5');
    await page.getByTestId('purchase-line-unit-cost').fill('100.00');
    await page.getByTestId('purchase-save').click();
    await expect(page).toHaveURL(/\/app\/purchases\/[^/]+$/);

    await page.getByTestId('purchase-post').click();
    await expect(page.getByTestId('purchase-posted-banner')).toBeVisible();
    await expect(page.getByTestId('purchase-posted-totals')).toContainText('500.00');

    // ---- Cancel purchase 2 with reason ----
    await page.getByTestId('cancel-reason-input').fill('Supplier could not deliver');
    await page.getByTestId('purchase-cancel-btn').click();
    await expect(page.getByTestId('purchase-cancelled-banner')).toBeVisible();

    // ---- Verify supplier ledger / reconciliation is healthy ----
    const reconciliationResp = await page.request.get(
      `${API}/api/v1/suppliers/${supplierId}/reconciliation`,
    );
    expect(reconciliationResp.status()).toBe(200);
    const reconciliationBody = await reconciliationResp.json();
    expect(reconciliationBody.data.ok).toBe(true);
    expect(reconciliationBody.data.findings).toEqual([]);

    // ---- Verify reconciliation also via UI page ----
    await page.getByTestId('nav-supplier-payments').click();
    await page.getByTestId('supplier-ledger-link').click();
    await page.getByTestId('ledger-supplier-select').selectOption({ label: 'P3 Supplier' });
    await expect(page.getByTestId('supplier-ledger-reconciliation-status')).toContainText('Healthy');
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

