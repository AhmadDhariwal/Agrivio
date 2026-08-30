import { expect, test } from '@playwright/test';
import { assertControlHasAccessibleName, assertVisibleFocus } from './f09-a11y-support';

test.describe('R1-F09-004 accessibility — login', () => {
  test('login is keyboard operable with labeled fields and exposed validation', async ({ page }) => {
    await page.goto('/login');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
    await assertControlHasAccessibleName(page, 'login-email');
    await assertControlHasAccessibleName(page, 'login-password');
    await expect(page.getByRole('button', { name: 'Show password' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeDisabled();

    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    const email = page.getByTestId('login-email');
    await email.focus();
    await assertVisibleFocus(page);
    await email.fill('not-an-email');
    await email.blur();
    await expect(page.getByText('Enter a valid email address.')).toBeVisible();
    await expect(email).toHaveAttribute('aria-invalid', 'true');
    await expect(email).toHaveAttribute('aria-describedby', 'login-email-error');

    await page.getByTestId('login-password').fill('short');
    await page.getByTestId('login-password').blur();
    await expect(page.getByText('Password is required (minimum 12 characters).')).toBeVisible();
    await expect(page.getByTestId('login-password')).toHaveAttribute('aria-invalid', 'true');

    await page.getByTestId('login-submit').click({ force: true });
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeDisabled();
  });
});
