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
});
