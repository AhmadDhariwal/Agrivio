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
