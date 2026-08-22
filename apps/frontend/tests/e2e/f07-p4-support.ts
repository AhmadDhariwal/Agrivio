import { API, activationTokenFromUrl } from './e2e-origins';
import { expect, type APIRequestContext, type Page } from '@playwright/test';

export { API };
export const OWNER_PASSWORD = 'owner-activation-passphrase';

export async function seedStarterPlan(
  request: APIRequestContext,
  extras?: {
    limits?: Record<string, number>;
    entitlements?: Record<string, unknown>;
  },
): Promise<void> {
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
      limits: extras?.limits ?? { customers: 50, suppliers: 50, products: 50, warehouses: 20, users: 20 },
      ...(extras?.entitlements ? { entitlements: extras.entitlements } : {}),
    },
  });
  expect([200, 201]).toContain(plan.status());
}

export async function signIn(page: Page, email: string, password: string): Promise<void> {
  await page.goto('/login');
  await page.getByTestId('login-email').fill(email);
  await page.getByTestId('login-password').fill(password);
  await page.getByTestId('login-submit').click();
  await expect(page).toHaveURL(/\/(context|app)/);
}

export async function enterPlatformWorkspace(page: Page): Promise<void> {
  if (page.url().includes('/context')) {
    await page.getByTestId('continue-workspace').click();
  }
  await expect(page.getByTestId('authenticated-shell')).toBeVisible();
}

export async function bootstrapApprovedOwner(
  page: Page,
  request: APIRequestContext,
  input: {
    organizationName: string;
    ownerEmail: string;
    displayName: string;
    entitlements?: Record<string, unknown>;
  },
): Promise<void> {
  let bootstrap;
  let lastError: unknown;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      bootstrap = await request.post(`${API}/api/v1/test/e2e/bootstrap`);
      if (bootstrap.status() === 200) {
        lastError = undefined;
        break;
      }
      lastError = new Error(`e2e bootstrap HTTP ${bootstrap.status()}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 400 * attempt));
  }
  if (bootstrap === undefined || bootstrap.status() !== 200) {
    throw lastError instanceof Error ? lastError : new Error('e2e bootstrap failed');
  }
  const bootstrapBody = await bootstrap.json();
  const superAdmin = bootstrapBody.data.superAdmin as { email: string; password: string };

  await seedStarterPlan(request, { entitlements: input.entitlements });
  await page.goto('/request-access');
  await page.getByTestId('org-name').fill(input.organizationName);
  await page.getByTestId('owner-email').fill(input.ownerEmail);
  await page.getByTestId('owner-display-name').fill(input.displayName);
  await page.getByTestId('request-submit').click();
  await expect(page.getByTestId('request-success')).toBeVisible();

  await signIn(page, superAdmin.email, superAdmin.password);
  await enterPlatformWorkspace(page);
  await page.getByRole('link', { name: 'Organizations' }).click();
  const orgRow = page.getByTestId('org-row').filter({ hasText: input.organizationName });
  await orgRow.getByTestId('approve-org').click();
  await page.getByRole('button', { name: 'Approve organization' }).click();
  const urlText = (await page.getByTestId('activation-url').textContent())?.trim() ?? '';
  const activationToken = activationTokenFromUrl(urlText);

  await page.getByTestId('sign-out').click();
  await page.goto(`/activate?token=${encodeURIComponent(activationToken)}`);
  await page.getByTestId('activation-password-input').fill(OWNER_PASSWORD);
  await page.getByTestId('activation-password-confirm-input').fill(OWNER_PASSWORD);
  await page.getByTestId('activate-submit').click();
  await expect(page).toHaveURL(/\/context/);
  await page.getByTestId('continue-workspace').click();
  await expect(page.getByTestId('authenticated-shell')).toBeVisible();
}

export async function createBranchAndWarehouse(
  page: Page,
  names: { branch: string; prefix: string; warehouse: string },
): Promise<void> {
  await page.getByRole('link', { name: 'Branches' }).click();
  await page.getByTestId('branch-create-link').click();
  await page.getByTestId('branch-name').fill(names.branch);
  await page.getByTestId('branch-invoice-prefix').fill(names.prefix);
  await page.getByTestId('branch-save').click();
  await expect(page.getByTestId('branches-list')).toContainText(names.branch);

  await page.getByRole('link', { name: 'Warehouses' }).click();
  await page.getByTestId('warehouse-create-link').click();
  await page.getByTestId('warehouse-name').fill(names.warehouse);
  await page.getByTestId('warehouse-save').click();
  await expect(page.getByTestId('warehouses-list')).toContainText(names.warehouse);
}

export async function createAccount(
  page: Page,
  input: { name: string; type: 'cash' | 'bank'; bankName?: string },
): Promise<void> {
  await page.getByRole('link', { name: 'Accounts' }).click();
  await page.getByTestId('account-create-link').click();
  await page.getByTestId('account-name').fill(input.name);
  await page.getByTestId('account-type').selectOption(input.type);
  if (input.type === 'bank' && input.bankName) {
    await page.getByTestId('account-bank-name').fill(input.bankName);
  }
  await page.getByTestId('account-save').click();
  await expect(page.getByTestId('accounts-list')).toContainText(input.name);
}

export async function createAccountWithOpening(
  page: Page,
  input: { name: string; type: 'cash' | 'bank'; opening: string; bankName?: string },
): Promise<void> {
  await createAccount(page, input);
  await page
    .getByTestId('accounts-list')
    .locator('article')
    .filter({ hasText: input.name })
    .getByTestId('account-open')
    .click();
  await page.getByTestId('account-opening-amount').fill(input.opening);
  await page.getByTestId('account-opening-save').click();
  await expect(page.getByTestId('account-derived-balance')).toContainText(input.opening);
}

export async function createSellableProductWithOpening(
  page: Page,
  input: {
    category: string;
    product: string;
    warehouse: string;
    quantity: string;
    inventoryValue: string;
    retailPrice: string;
  },
): Promise<void> {
  await page.getByRole('link', { name: 'Categories', exact: true }).click();
  await page.getByTestId('category-create-link').click();
  await page.getByTestId('category-name').fill(input.category);
  await page.getByTestId('category-product-class').selectOption('general');
  await page.getByTestId('category-save').click();
  await expect(page.getByTestId('categories-list')).toContainText(input.category);

  await page.getByRole('link', { name: 'Products' }).click();
  await page.getByTestId('product-create-link').click();
  await page.getByTestId('product-name').fill(input.product);
  await page.getByTestId('product-category').selectOption({ label: input.category });
  await page.getByTestId('product-tracking-mode').selectOption('none');
  await page.getByTestId('product-base-unit').fill('EA');
  await page.getByTestId('product-measurement-dimension').selectOption('mass');
  await page.getByTestId('product-save').click();
  await expect(page.getByTestId('products-list')).toContainText(input.product);
  await page
    .getByTestId('products-list')
    .locator('article')
    .filter({ hasText: input.product })
    .getByRole('link', { name: 'Pricing' })
    .click();
  await page.getByTestId('price-retail').fill(input.retailPrice);
  await page.getByTestId('product-pricing-save').click();
  await expect(page.getByTestId('products-list')).toContainText(input.product);

  await page.goto('/app/inventory/opening-stock');
  await expect(page.getByTestId('opening-stock-form')).toBeVisible();
  await page.getByTestId('opening-warehouse').selectOption({ label: input.warehouse });
  await page.getByTestId('opening-product').selectOption({ label: `${input.product} (none)` });
  await page.getByTestId('opening-quantity').fill(input.quantity);
  await page.getByTestId('opening-inventory-value').fill(input.inventoryValue);
  await page.getByTestId('opening-stock-save').click();
  await expect(page.getByTestId('opening-stock-success')).toBeVisible();
}
