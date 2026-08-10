import { expect, test, type Page } from '@playwright/test';

const API = 'http://localhost:3000';
const OWNER_PASSWORD = 'owner-activation-passphrase';

test.describe('F02 onboarding vertical slice', () => {
  test('landing → request → approve → activate → reuse blocked → sign-in → context → shell', async ({
    page,
    request,
  }) => {
    const stamp = Date.now();
    const organizationName = `E2E Org ${stamp}`;
    const ownerEmail = `owner-${stamp}@example.com`;

    const bootstrap = await request.post(`${API}/api/v1/test/e2e/bootstrap`);
    expect(bootstrap.status()).toBe(200);
    const bootstrapBody = await bootstrap.json();
    const superAdmin = bootstrapBody.data.superAdmin as { email: string; password: string };

    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Agrivio');
    await page.getByRole('link', { name: 'Request organization access' }).click();

    await page.getByTestId('org-name').fill(organizationName);
    await page.getByTestId('owner-email').fill(ownerEmail);
    await page.getByTestId('owner-display-name').fill('E2E Owner');
    await page.getByTestId('request-submit').click();
    await expect(page.getByTestId('request-success')).toContainText('Request submitted');

    await signIn(page, superAdmin.email, superAdmin.password);
    await enterPlatformWorkspace(page);
    await page.getByRole('link', { name: 'Organizations' }).click();
    await expect(page.getByTestId('platform-organizations')).toBeVisible();

    const orgRow = page.getByTestId('org-row').filter({ hasText: organizationName });
    await expect(orgRow).toBeVisible();
    await orgRow.getByTestId('approve-org').click();
    await page.getByRole('button', { name: 'Approve organization' }).click();
    const activationUrl = page.getByTestId('activation-url');
    await expect(activationUrl).toBeVisible();
    await expect(page.getByTestId('activation-owner-email')).toContainText(ownerEmail);
    const urlText = (await activationUrl.textContent())?.trim() ?? '';
    expect(urlText).toContain('/activate?token=');
    const activationToken =
      new URL(urlText, 'http://localhost:4200').searchParams.get('token') ?? '';
    expect(activationToken.length).toBeGreaterThan(10);

    await page.getByTestId('sign-out').click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Agrivio');

    await page.goto(`/activate?token=${encodeURIComponent(activationToken)}`);
    await page.getByTestId('activation-password-input').fill(OWNER_PASSWORD);
    await page.getByTestId('activation-password-confirm-input').fill(OWNER_PASSWORD);
    await page.getByTestId('activate-submit').click();
    await expect(page).toHaveURL(/\/context/);

    await page.getByTestId('continue-workspace').click();
    await expect(page.getByTestId('authenticated-shell')).toBeVisible();
    await expect(page.getByTestId('signed-in-user')).toContainText(ownerEmail);

    await page.getByTestId('sign-out').click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Agrivio');

    // Consumed token must not activate again.
    await page.goto(`/activate?token=${encodeURIComponent(activationToken)}`);
    await page.getByTestId('activation-password-input').fill(OWNER_PASSWORD);
    await page.getByTestId('activation-password-confirm-input').fill(OWNER_PASSWORD);
    await page.getByTestId('activate-submit').click();
    await expect(page.locator('.ag-alert--danger')).toContainText(/invalid|expired|already used/i);
    await expect(page).toHaveURL(/\/activate/);

    await signIn(page, ownerEmail, OWNER_PASSWORD);
    await expect(page).toHaveURL(/\/context/);
    await page.getByTestId('continue-workspace').click();
    await expect(page.getByTestId('authenticated-shell')).toBeVisible();
    await expect(page.getByTestId('active-context')).toContainText('Organization');
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
  const options = await select.locator('option').allTextContents();
  const platformOption = options.find((label) => label.includes('Platform'));
  expect(platformOption).toBeTruthy();
  if (platformOption === undefined) {
    throw new Error('Platform context option was not available');
  }
  await select.selectOption({ label: platformOption });
  await page.getByTestId('switch-context').click();
  await expect(page.getByTestId('authenticated-shell')).toBeVisible();
}
