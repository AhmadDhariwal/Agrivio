import { API, activationTokenFromUrl } from './e2e-origins';
import { expect, test, type Page } from '@playwright/test';

const OWNER_PASSWORD = 'owner-activation-passphrase';

test.describe('F03 P2 master data vertical slice', () => {
  test('owner can create catalog, pricing, parties, and accounts', async ({ page, request }) => {
    const stamp = Date.now();
    const organizationName = `F03 P2 E2E Org ${stamp}`;
    const ownerEmail = `f03p2-owner-${stamp}@example.com`;

    const bootstrap = await request.post(`${API}/api/v1/test/e2e/bootstrap`);
    expect(bootstrap.status()).toBe(200);
    const bootstrapBody = await bootstrap.json();
    const superAdmin = bootstrapBody.data.superAdmin as { email: string; password: string };

    await page.goto('/request-access');
    await page.getByTestId('org-name').fill(organizationName);
    await page.getByTestId('owner-email').fill(ownerEmail);
    await page.getByTestId('owner-display-name').fill('F03 P2 Owner');
    await page.getByTestId('request-submit').click();
    await expect(page.getByTestId('request-success')).toContainText('Request submitted');

    await signIn(page, superAdmin.email, superAdmin.password);
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

    await page.getByRole('link', { name: 'Categories' }).click();
    await page.getByTestId('category-create-link').click();
    await page.getByTestId('category-name').fill('Fertilizers');
    await page.getByTestId('category-product-class').selectOption('fertilizer');
    await page.getByTestId('category-save').click();
    await expect(page.getByTestId('categories-list')).toContainText('Fertilizers');

    await page.getByRole('link', { name: 'Products' }).click();
    await page.getByTestId('product-create-link').click();
    await page.getByTestId('product-name').fill('Urea 46');
    await page.getByTestId('product-category').selectOption({ label: 'Fertilizers' });
    await page.getByTestId('product-tracking-mode').selectOption('batch_expiry');
    await page.getByTestId('product-base-unit').fill('KG');
    await page.getByTestId('product-measurement-dimension').selectOption('mass');
    await page.getByTestId('packaging-unit-name').fill('50 KG');
    await page.getByTestId('packaging-conversion').fill('50');
    await page.getByTestId('product-save').click();
    await expect(page.getByTestId('products-list')).toContainText('Urea 46');

    await page.getByTestId('products-list').getByRole('link', { name: 'Pricing' }).click();
    await expect(page.getByTestId('product-pricing')).toBeVisible();
    await page.getByTestId('price-retail').fill('3200.00');
    await page.getByTestId('price-wholesale').fill('3000.00');
    await page.getByTestId('product-pricing-save').click();
    await expect(page.getByTestId('products-list')).toBeVisible();

    await page.getByRole('link', { name: 'Customers' }).click();
    await page.getByTestId('customer-create-link').click();
    await page.getByTestId('customer-name').fill('Ali Farmer');
    await page.getByTestId('customer-phone').fill('03001112222');
    await page.getByTestId('customer-type').selectOption('farmer');
    await page.getByTestId('customer-price-tier').selectOption('wholesale');
    await page.getByTestId('customer-credit-enabled').check();
    await page.getByTestId('customer-credit-limit').fill('10000.00');
    await page.getByTestId('customer-credit-behaviour').selectOption('warning');
    await page.getByTestId('customer-save').click();
    await expect(page.getByTestId('customers-list')).toContainText('Ali Farmer');

    await page.getByRole('link', { name: 'Suppliers' }).click();
    await page.getByTestId('supplier-create-link').click();
    await page.getByTestId('supplier-name').fill('Punjab Agro Supply');
    await page.getByTestId('supplier-phone').fill('03003334444');
    await page.getByTestId('supplier-save').click();
    await expect(page.getByTestId('suppliers-list')).toContainText('Punjab Agro Supply');

    await page.getByRole('link', { name: 'Accounts' }).click();
    await page.getByTestId('account-create-link').click();
    await page.getByTestId('account-name').fill('Till Cash');
    await page.getByTestId('account-type').selectOption('cash');
    await page.getByTestId('account-save').click();
    await expect(page.getByTestId('accounts-list')).toContainText('Till Cash');

    await page.reload();
    await page.getByRole('link', { name: 'Categories' }).click();
    await expect(page.getByTestId('categories-list')).toContainText('Fertilizers');
    await page.getByRole('link', { name: 'Products' }).click();
    await expect(page.getByTestId('products-list')).toContainText('Urea 46');
    await page.getByRole('link', { name: 'Customers' }).click();
    await expect(page.getByTestId('customers-list')).toContainText('Ali Farmer');
    await page.getByRole('link', { name: 'Suppliers' }).click();
    await expect(page.getByTestId('suppliers-list')).toContainText('Punjab Agro Supply');
    await page.getByRole('link', { name: 'Accounts' }).click();
    await expect(page.getByTestId('accounts-list')).toContainText('Till Cash');
  });
});

async function signIn(page: Page, email: string, password: string): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/context/);
}

async function enterPlatformWorkspace(page: Page): Promise<void> {
  const active = page.getByTestId('context-active');
  if (await active.isVisible()) {
    const label = (await active.textContent()) ?? '';
    if (label.includes('Platform')) {
      await page.getByTestId('continue-workspace').click();
      await expect(page.getByTestId('authenticated-shell')).toBeVisible();
      return;
    }
  }

  const select = page.getByTestId('context-select');
  await expect(select).toBeVisible();
  await select.selectOption({ label: /Platform/i });
  await page.getByTestId('continue-workspace').click();
  await expect(page.getByTestId('authenticated-shell')).toBeVisible();
}
