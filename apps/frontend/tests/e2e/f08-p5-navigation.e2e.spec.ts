import { expect, test } from '@playwright/test';
import { bootstrapF08Owner, clickShellNav } from './f08-p5-support';

test.describe('F08 P5 navigation', () => {
  test('sidebar clicks open Dashboard, Alerts, Reports, Imports, and Audit', async ({
    page,
    request,
  }) => {
    const stamp = Date.now();
    await bootstrapF08Owner(page, request, stamp);

    await clickShellNav(page, 'nav-dashboard', /\/app\/dashboard$/, 'Dashboard');
    await clickShellNav(page, 'nav-alerts', /\/app\/alerts$/, 'Notification center');
    await expect(page.getByTestId('alerts-page')).toBeVisible();
    await clickShellNav(page, 'nav-reports', /\/app\/reports$/, 'Reports');
    await expect(page.getByTestId('reports-page')).toBeVisible();
    await clickShellNav(page, 'nav-imports', /\/app\/imports$/, 'Imports');
    await expect(page.getByTestId('imports-page')).toBeVisible();
    await clickShellNav(page, 'nav-audit', /\/app\/audit$/, 'Audit history');
    await expect(page.getByTestId('audit-page')).toBeVisible();

    await page.goto('/app/alerts');
    await expect(page).toHaveURL(/\/app\/alerts$/);
    await expect(page.getByTestId('alerts-page')).toBeVisible();
    await page.reload();
    await expect(page.getByTestId('alerts-page')).toBeVisible();

    await page.goto('/app/reports');
    await expect(page.getByTestId('reports-page')).toBeVisible();
    await page.goto('/app/audit');
    await expect(page.getByTestId('audit-page')).toBeVisible();
    await page.goBack();
    await expect(page.getByTestId('reports-page')).toBeVisible();
    await page.goForward();
    await expect(page.getByTestId('audit-page')).toBeVisible();
  });

  test('customizes navigation leaf visibility, persists across reloads, and re-enables via customizer', async ({
    page,
    request,
  }) => {
    const stamp = Date.now();
    await bootstrapF08Owner(page, request, stamp);

    // Initial state: Audit and Reports are visible
    await expect(page.getByTestId('nav-audit')).toBeVisible();
    await expect(page.getByTestId('nav-reports')).toBeVisible();

    // Open navigation customizer dialog
    await page.getByRole('button', { name: 'Customize' }).click();
    await expect(page.getByRole('heading', { name: 'Customize Navigation' })).toBeVisible();

    // Uncheck Audit navigation leaf
    await page.locator('#chk-operations\\.audit').uncheck();

    // Save preferences
    await page.getByRole('button', { name: 'Save preferences' }).click();
    await expect(page.getByRole('heading', { name: 'Customize Navigation' })).not.toBeVisible();

    // Verify Audit is immediately hidden, while Reports remains visible
    await expect(page.getByTestId('nav-audit')).not.toBeVisible();
    await expect(page.getByTestId('nav-reports')).toBeVisible();

    // Reload page to test backend persistence
    await page.reload();
    await expect(page.getByTestId('authenticated-shell')).toBeVisible();

    // Verify Audit is still hidden after full reload
    await expect(page.getByTestId('nav-audit')).not.toBeVisible();
    await expect(page.getByTestId('nav-reports')).toBeVisible();

    // Re-open customizer to verify hidden items are searchable & can be re-enabled
    await page.getByRole('button', { name: 'Customize' }).click();
    await expect(page.getByRole('heading', { name: 'Customize Navigation' })).toBeVisible();

    // Search for 'audit' in customizer
    await page.getByRole('searchbox', { name: 'Filter modules' }).fill('audit');
    await expect(page.locator('#chk-operations\\.audit')).toBeVisible();
    await expect(page.locator('#chk-operations\\.audit')).not.toBeChecked();

    // Check Audit to re-enable it
    await page.locator('#chk-operations\\.audit').check();
    await page.getByRole('button', { name: 'Save preferences' }).click();
    await expect(page.getByRole('heading', { name: 'Customize Navigation' })).not.toBeVisible();

    // Verify Audit is visible again
    await expect(page.getByTestId('nav-audit')).toBeVisible();
  });
});
