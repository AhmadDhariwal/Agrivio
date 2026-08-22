import { expect, test } from '@playwright/test';
import { bootstrapApprovedOwner } from './f07-p4-support';
import { assertPageHasHeading, assertVisibleFocus } from './f09-a11y-support';

test.describe('R1-F09-004 accessibility — shell', () => {
  test('skip link, navigation, and focus work after login', async ({ page, request }) => {
    const stamp = Date.now();
    const ownerEmail = `f09-a11y-shell-${stamp}@example.com`;
    await bootstrapApprovedOwner(page, request, {
      organizationName: `F09 A11Y Shell ${stamp}`,
      ownerEmail,
      displayName: 'F09 A11Y Owner',
      entitlements: { reportsExports: true, imports: true, auditHistory: '90d' },
    });

    await expect(page.getByTestId('authenticated-shell')).toBeVisible();
    await expect(page.locator('#ag-main')).toBeAttached();
    await expect(page.getByRole('navigation', { name: 'Primary' })).toBeVisible();

    await page.reload();
    await expect(page.getByTestId('authenticated-shell')).toBeVisible();
    await page.locator('body').press('Tab');
    const skip = page.getByRole('link', { name: 'Skip to main content' });
    await expect(skip).toBeFocused();
    await assertVisibleFocus(page);
    await skip.press('Enter');
    await expect(page.locator('#ag-main')).toBeFocused({ timeout: 5_000 });

    await page.getByRole('link', { name: 'Dashboard' }).focus();
    await assertVisibleFocus(page);
    await page.getByRole('link', { name: 'Dashboard' }).press('Enter');
    await expect(page).toHaveURL(/\/app\/dashboard$/);
    await assertPageHasHeading(page, 'Dashboard');
  });
});
