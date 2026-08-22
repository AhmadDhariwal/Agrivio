import { expect, test } from '@playwright/test';
import { bootstrapApprovedOwner, createBranchAndWarehouse } from './f07-p4-support';
import { assertContrastPass, collectContrastChecks } from './f09-a11y-contrast-scan';
import { assertVisibleFocus } from './f09-a11y-support';

test.describe('R1-F09-004 accessibility — WCAG 2.2 AA contrast (NFR-A11Y-006)', () => {
  test('rendered contrast on login and critical authenticated workflows', async ({ page, request }) => {
    test.setTimeout(300_000);
    const summary = {
      checks: 0,
      skippedInactive: 0,
      unreliable: 0,
      textNormal: 0,
      textLarge: 0,
      nonText: 0,
    };

    async function measure(name: string): Promise<void> {
      const result = await collectContrastChecks(page, name);
      summary.checks += result.checks.length;
      summary.skippedInactive += result.skippedInactive;
      summary.unreliable += result.checks.filter((item) => item.unreliableBackground).length;
      summary.textNormal += result.checks.filter((item) => item.kind === 'text-normal').length;
      summary.textLarge += result.checks.filter((item) => item.kind === 'text-large').length;
      summary.nonText += result.checks.filter((item) => item.kind === 'non-text').length;
      assertContrastPass(result, name);
    }

    await page.goto('/login');
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
    await measure('login');

    const email = page.getByTestId('login-email');
    await email.fill('not-an-email');
    await email.blur();
    await expect(page.getByText('Enter a valid email address.')).toBeVisible();
    await measure('login-validation-error');

    await email.focus();
    await assertVisibleFocus(page);
    await measure('login-email-focus');

    const stamp = Date.now();
    await bootstrapApprovedOwner(page, request, {
      organizationName: `F09 A11Y Contrast ${stamp}`,
      ownerEmail: `f09-a11y-contrast-${stamp}@example.com`,
      displayName: 'F09 Contrast Owner',
      entitlements: { reportsExports: true, imports: true, auditHistory: '90d' },
    });
    await createBranchAndWarehouse(page, {
      branch: 'Contrast Branch',
      prefix: 'CTR',
      warehouse: 'Contrast WH',
    });

    await expect(page.getByTestId('authenticated-shell')).toBeVisible();
    await page.getByRole('link', { name: 'Dashboard' }).hover();
    await measure('shell-nav-hover');

    const routes: Array<{ path: string; ready: () => ReturnType<typeof expect> }> = [
      { path: '/app/dashboard', ready: () => expect(page.getByTestId('dashboard-page')).toBeVisible() },
      { path: '/app/sales', ready: () => expect(page.getByRole('heading', { name: /sales/i }).first()).toBeVisible() },
      { path: '/app/sales/new', ready: () => expect(page.getByTestId('sale-form')).toBeVisible() },
      {
        path: '/app/purchases/new',
        ready: () => expect(page.getByTestId('purchase-form')).toBeVisible(),
      },
      {
        path: '/app/customers/new',
        ready: () => expect(page.getByTestId('customer-form')).toBeVisible(),
      },
      {
        path: '/app/suppliers/new',
        ready: () => expect(page.getByTestId('supplier-form')).toBeVisible(),
      },
      {
        path: '/app/inventory/stock',
        ready: () => expect(page.getByRole('heading', { name: 'Stock on hand' })).toBeVisible(),
      },
      { path: '/app/returns', ready: () => expect(page.getByRole('heading', { name: 'Returns' })).toBeVisible() },
      { path: '/app/expenses/new', ready: () => expect(page.getByTestId('expense-form')).toBeVisible() },
      { path: '/app/accounts/new', ready: () => expect(page.getByTestId('account-form')).toBeVisible() },
      { path: '/app/reports', ready: () => expect(page.getByTestId('reports-page')).toBeVisible() },
      { path: '/app/imports', ready: () => expect(page.getByTestId('imports-page')).toBeVisible() },
    ];

    for (const route of routes) {
      await page.goto(route.path);
      await route.ready();
      await measure(route.path);
    }

    await page.getByTestId('import-type').focus();
    await assertVisibleFocus(page);
    await measure('/app/imports-focus');

    expect(summary.checks, 'contrast suite must evaluate rendered pairs').toBeGreaterThan(80);
    expect(summary.textNormal).toBeGreaterThan(0);
    expect(summary.textLarge).toBeGreaterThan(0);
    expect(summary.nonText).toBeGreaterThan(0);
    console.log(`F09 contrast checks: ${JSON.stringify(summary)}`);
  });
});
