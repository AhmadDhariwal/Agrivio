import { expect, type Page } from '@playwright/test';

/**
 * Canonical E2E login helper.
 *
 * Uses stable data-testid selectors (`login-email`, `login-password`, `login-submit`)
 * instead of brittle label-based selectors. All E2E test suites should import
 * this helper instead of defining local signIn functions.
 *
 * After successful login, the page is expected to navigate to /context or /app.
 */
export async function login(page: Page, email: string, password: string): Promise<void> {
  await page.goto('/login');
  await page.getByTestId('login-email').fill(email);
  await page.getByTestId('login-password').fill(password);
  await page.getByTestId('login-submit').click();
  await expect(page).toHaveURL(/\/(context|app)/);
}

/**
 * Enter the Platform workspace after sign-in.
 *
 * Handles both the single-context flow (where `continue-workspace` is directly
 * visible) and the multi-context selector flow.
 */
export async function enterPlatformWorkspace(page: Page): Promise<void> {
  if (/\/app\/platform\//.test(new URL(page.url()).pathname)) {
    await expect(page.getByTestId('authenticated-shell')).toBeVisible();
    return;
  }

  const contextActive = page.getByTestId('context-active');
  if (await contextActive.isVisible()) {
    const label = (await contextActive.textContent()) ?? '';
    if (label.includes('Platform')) {
      await page.getByTestId('continue-workspace').click();
      await expect(page.getByTestId('authenticated-shell')).toBeVisible();
      return;
    }
  }

  const select = page.getByTestId('context-select');
  if (await select.isVisible()) {
    await select.selectOption({ label: /Platform/i });
    const switchBtn = page.getByTestId('switch-context');
    if (await switchBtn.isVisible()) {
      await switchBtn.click();
    } else {
      await page.getByTestId('continue-workspace').click();
    }
  } else {
    await page.getByTestId('continue-workspace').click();
  }

  await expect(page.getByTestId('authenticated-shell')).toBeVisible();
}

import { API } from './e2e-origins';
import type { APIRequestContext } from '@playwright/test';

/**
 * Seed an active Starter subscription plan with fully compliant R1 catalog metadata.
 */
export async function seedStarterPlan(
  request: APIRequestContext,
  extras?: {
    limits?: Partial<{
      products: number;
      activeUsers: number;
      branches: number;
      warehouses: number;
      customers: number;
      suppliers: number;
      users?: number;
    }>;
    entitlements?: Record<string, unknown>;
  },
): Promise<void> {
  const csrf = await request.post(`${API}/api/v1/auth/csrf`);
  const csrfBody = await csrf.json();
  const token = csrfBody.data.csrfToken as string;
  const limitsInput = extras?.limits ?? {};
  const plan = await request.post(`${API}/api/v1/platform/subscription-plans`, {
    headers: {
      'X-CSRF-Token': token,
      'X-Platform-Actor': 'super-admin',
    },
    data: {
      planCode: 'Starter',
      displayName: 'Starter',
      shortDescription: 'Essential POS and inventory for a single-location agricultural retailer.',
      targetCustomer: 'Single-shop agricultural retailer',
      catalogRevision: 'R1-CATALOG-1',
      currency: 'PKR',
      monthlyPriceMinorUnits: 500000,
      annualPriceMinorUnits: 5000000,
      annualDiscountPercent: 16.67,
      trialEligible: true,
      activate: true,
      limits: {
        products: limitsInput.products ?? 200,
        activeUsers: limitsInput.activeUsers ?? limitsInput.users ?? 20,
        branches: limitsInput.branches ?? 10,
        warehouses: limitsInput.warehouses ?? 20,
        customers: limitsInput.customers ?? 100,
        suppliers: limitsInput.suppliers ?? 50,
      },
      entitlements: {
        imports: false,
        reportsExports: false,
        auditHistory: '30d',
        backupPolicyRef: 'weekly',
        dedicatedCloudEligible: false,
        supportLevelRef: 'standard',
        ...(extras?.entitlements ?? {}),
      },
    },
  });
  expect([200, 201]).toContain(plan.status());
}
