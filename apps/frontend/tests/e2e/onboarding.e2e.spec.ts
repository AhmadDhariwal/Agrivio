import { API, activationTokenFromUrl } from './e2e-origins';
import { login, enterPlatformWorkspace } from './e2e-auth-helper';
import { expect, test } from '@playwright/test';

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

    await login(page, superAdmin.email, superAdmin.password);
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
      activationTokenFromUrl(urlText);
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

    await login(page, ownerEmail, OWNER_PASSWORD);
    await expect(page).toHaveURL(/\/context/);
    await page.getByTestId('continue-workspace').click();
    await expect(page.getByTestId('authenticated-shell')).toBeVisible();
    await expect(page.getByTestId('active-context')).toContainText('Organization');
  });
});

