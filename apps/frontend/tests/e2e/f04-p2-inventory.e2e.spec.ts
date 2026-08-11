import { expect, test, type Page } from '@playwright/test';

const API = 'http://localhost:3000';
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
      new URL(urlText, 'http://localhost:4200').searchParams.get('token') ?? '';

    await page.getByTestId('sign-out').click();
    await page.goto(`/activate?token=${encodeURIComponent(activationToken)}`);
    await page.getByTestId('activation-password-input').fill(OWNER_PASSWORD);
    await page.getByTestId('activation-password-confirm-input').fill(OWNER_PASSWORD);
    await page.getByTestId('activate-submit').click();
    await page.getByTestId('continue-workspace').click();

    await page.getByRole('link', { name: 'Warehouses' }).click();
    await page.getByTestId('warehouse-create-link').click();
    await page.getByTestId('warehouse-name').fill('P2 Warehouse');
    await page.getByTestId('warehouse-save').click();

    await page.getByRole('link', { name: 'Categories' }).click();
    await page.getByTestId('category-create-link').click();
    await page.getByTestId('category-name').fill('P2 Fertilizers');
    await page.getByTestId('category-product-class').selectOption('fertilizer');
    await page.getByTestId('category-save').click();

    await page.getByRole('link', { name: 'Products' }).click();
    await page.getByTestId('product-create-link').click();
    await page.getByTestId('product-name').fill('P2 Urea');
    await page.getByTestId('product-category').selectOption({ label: 'P2 Fertilizers' });
    await page.getByTestId('product-tracking-mode').selectOption('batch_expiry');
    await page.getByTestId('product-base-unit').fill('KG');
    await page.getByTestId('product-measurement-dimension').selectOption('mass');
    await page.getByTestId('product-save').click();

    await page.getByTestId('product-create-link').click();
    await page.getByTestId('product-name').fill('P2 Bag');
    await page.getByTestId('product-category').selectOption({ label: 'P2 Fertilizers' });
    await page.getByTestId('product-tracking-mode').selectOption('none');
    await page.getByTestId('product-base-unit').fill('EA');
    await page.getByTestId('product-measurement-dimension').selectOption('count');
    await page.getByTestId('product-save').click();

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
  const response = await request.post(`${API}/api/v1/test/e2e/seed-starter-plan`);
  expect(response.status()).toBeLessThan(500);
}

async function signIn(page: Page, email: string, password: string) {
  await page.goto('/sign-in');
  await page.getByTestId('sign-in-email').fill(email);
  await page.getByTestId('sign-in-password').fill(password);
  await page.getByTestId('sign-in-submit').click();
}

async function enterPlatformWorkspace(page: Page) {
  await page.getByTestId('platform-workspace-link').click();
}
