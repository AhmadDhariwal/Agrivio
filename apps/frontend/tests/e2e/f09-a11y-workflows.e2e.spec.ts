import { expect, test } from '@playwright/test';
import { bootstrapApprovedOwner, createBranchAndWarehouse } from './f07-p4-support';
import {
  assertControlHasAccessibleName,
  assertPageHasHeading,
  assertVisibleFocus,
} from './f09-a11y-support';

test.describe('R1-F09-004 accessibility — critical workflows', () => {
  test('POS, purchase, masters, inventory, returns, accounts, reports, imports', async ({
    page,
    request,
  }) => {
    test.setTimeout(240_000);
    const stamp = Date.now();
    await bootstrapApprovedOwner(page, request, {
      organizationName: `F09 A11Y WF ${stamp}`,
      ownerEmail: `f09-a11y-wf-${stamp}@example.com`,
      displayName: 'F09 A11Y WF Owner',
      entitlements: { reportsExports: true, imports: true, auditHistory: '90d' },
    });
    await createBranchAndWarehouse(page, {
      branch: 'A11Y Branch',
      prefix: 'A11',
      warehouse: 'A11Y WH',
    });

    await page.goto('/app/sales/new');
    await expect(page.getByTestId('sale-form')).toBeVisible();
    await assertPageHasHeading(page, /sale draft/i);
    await assertControlHasAccessibleName(page, 'sale-branch');
    await assertControlHasAccessibleName(page, 'sale-warehouse');
    await assertControlHasAccessibleName(page, 'sale-customer');
    await assertControlHasAccessibleName(page, 'sale-line-product');
    await assertControlHasAccessibleName(page, 'sale-product-search');
    await page.getByTestId('sale-branch').focus();
    await assertVisibleFocus(page);
    await expect(page.getByRole('button', { name: 'Add line' })).toBeVisible();

    await page.goto('/app/purchases/new');
    await expect(page.getByTestId('purchase-form')).toBeVisible();
    await assertPageHasHeading(page, /purchase draft/i);
    await expect(page.getByRole('button', { name: /save|post/i }).first()).toBeVisible();

    await page.goto('/app/customers/new');
    await expect(page.getByTestId('customer-form')).toBeVisible();
    await assertPageHasHeading(page, 'Create customer');
    await assertControlHasAccessibleName(page, 'customer-name');
    await assertControlHasAccessibleName(page, 'customer-type');
    await page.getByTestId('customer-save').click();
    await expect(page.getByTestId('customer-form')).toBeVisible();

    await page.goto('/app/suppliers/new');
    await expect(page.getByTestId('supplier-form')).toBeVisible();
    await assertPageHasHeading(page, /supplier/i);
    await assertControlHasAccessibleName(page, 'supplier-name');

    await page.goto('/app/inventory/stock');
    await assertPageHasHeading(page, 'Stock on hand');
    await expect(page.getByRole('button', { name: 'Refresh' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Post opening stock' })).toBeVisible();

    await page.goto('/app/returns');
    await expect(page.locator('#ag-main').getByRole('link', { name: /return without invoice/i })).toBeVisible();

    await page.goto('/app/expenses/new');
    await expect(page.getByTestId('expense-form')).toBeVisible();
    await assertPageHasHeading(page, 'Record expense');
    await assertControlHasAccessibleName(page, 'expense-category');
    await assertControlHasAccessibleName(page, 'expense-account');

    await page.goto('/app/accounts/new');
    await expect(page.getByTestId('account-form')).toBeVisible();
    await assertControlHasAccessibleName(page, 'account-name');
    await assertControlHasAccessibleName(page, 'account-type');

    await page.goto('/app/reports');
    await expect(page.getByTestId('reports-page')).toBeVisible();
    await assertPageHasHeading(page, 'Reports');
    await assertControlHasAccessibleName(page, 'report-select');

    await page.goto('/app/imports');
    await expect(page.getByTestId('imports-page')).toBeVisible();
    await assertPageHasHeading(page, 'Imports');
    await assertControlHasAccessibleName(page, 'import-type');
    await assertControlHasAccessibleName(page, 'import-file');
    await expect(page.getByTestId('import-preview-submit')).toBeDisabled();
  });
});
