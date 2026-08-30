import { expect, test, type Page } from '@playwright/test';
import { bootstrapApprovedOwner, enterPlatformWorkspace, signIn } from './f07-p4-support';
import { API } from './e2e-origins';

const VIEWPORTS = [
  { name: '1440x900', width: 1440, height: 900 },
  { name: '1366x768', width: 1366, height: 768 },
  { name: '768x1024', width: 768, height: 1024 },
  { name: '390x844', width: 390, height: 844 },
  { name: '360x800', width: 360, height: 800 },
  { name: '320x800', width: 320, height: 800 },
] as const;

const OWNER_ROUTES = [
  { path: '/app', module: 'Workspace' },
  { path: '/app/dashboard', module: 'Dashboard' },
  { path: '/app/organization/settings', module: 'Organization settings' },
  { path: '/app/organization/setup', module: 'Organization setup' },
  { path: '/app/branches', module: 'Branches' },
  { path: '/app/branches/new', module: 'Branch form' },
  { path: '/app/warehouses', module: 'Warehouses' },
  { path: '/app/employees', module: 'Employees' },
  { path: '/app/products', module: 'Products' },
  { path: '/app/categories', module: 'Categories' },
  { path: '/app/customers', module: 'Customers' },
  { path: '/app/suppliers', module: 'Suppliers' },
  { path: '/app/inventory/stock', module: 'Stock' },
  { path: '/app/inventory/opening-stock', module: 'Opening stock' },
  { path: '/app/inventory/batches', module: 'Batches' },
  { path: '/app/inventory/expiry', module: 'Expiry' },
  { path: '/app/inventory/adjustments', module: 'Adjustments' },
  { path: '/app/inventory/transfers', module: 'Transfers' },
  { path: '/app/inventory/movements', module: 'Movements' },
  { path: '/app/purchases', module: 'Purchases' },
  { path: '/app/purchases/new', module: 'Purchase form' },
  { path: '/app/supplier-payments', module: 'Supplier payments' },
  { path: '/app/sales', module: 'Sales' },
  { path: '/app/sales/new', module: 'POS / New sale' },
  { path: '/app/customer-payments', module: 'Customer payments' },
  { path: '/app/returns', module: 'Returns' },
  { path: '/app/returns/without-invoice', module: 'Return without invoice' },
  { path: '/app/expenses', module: 'Expenses' },
  { path: '/app/expense-categories', module: 'Expense categories' },
  { path: '/app/accounts', module: 'Accounts' },
  { path: '/app/reports', module: 'Reports' },
  { path: '/app/alerts', module: 'Alerts' },
  { path: '/app/imports', module: 'Imports' },
  { path: '/app/audit', module: 'Audit' },
  { path: '/app/subscription/billing', module: 'Tenant billing' },
];

const PLATFORM_ROUTES = [
  { path: '/app/platform/organizations', module: 'Platform organizations' },
  { path: '/app/platform/plans', module: 'Platform plans' },
  { path: '/app/platform/billing-review', module: 'Billing review' },
  { path: '/app/platform/operations', module: 'Platform operations' },
];

async function measureOverflow(page: Page): Promise<{
  contentOverflow: number;
  documentOverflow: number;
  offender: string | null;
}> {
  return page.evaluate(() => {
    const content = document.querySelector('.ag-shell__content') as HTMLElement | null;
    const contentOverflow = content ? content.scrollWidth - content.clientWidth : 0;
    const documentOverflow = document.documentElement.scrollWidth - window.innerWidth;
    let offender: string | null = null;
    if (content && contentOverflow > 2) {
      const limit = content.getBoundingClientRect().right;
      const nodes = content.querySelectorAll<HTMLElement>('*');
      for (const node of nodes) {
        const parent = node.parentElement;
        if (parent) {
          const overflowX = getComputedStyle(parent).overflowX;
          if (overflowX === 'auto' || overflowX === 'scroll') {
            continue;
          }
        }
        if (node.getBoundingClientRect().right > limit + 2) {
          offender = `${node.tagName.toLowerCase()}.${node.className.toString().slice(0, 80)}`;
          break;
        }
      }
    }
    return { contentOverflow, documentOverflow, offender };
  });
}

async function assertNoBodyOverflow(page: Page, label: string): Promise<void> {
  const { contentOverflow, documentOverflow, offender } = await measureOverflow(page);
  expect(documentOverflow, `${label} document overflow`).toBeLessThanOrEqual(2);
  expect(contentOverflow, `${label} content overflow (${offender ?? 'unknown'})`).toBeLessThanOrEqual(2);
}

async function openMobileNavIfNeeded(page: Page): Promise<void> {
  const toggle = page.locator('.ag-shell__menu-toggle');
  if (await toggle.isVisible()) {
    await toggle.click();
    await expect(page.locator('.ag-shell__sidebar.is-open')).toBeVisible();
    await page.locator('.ag-shell__drawer-close').click();
    await expect(page.locator('.ag-shell__sidebar.is-open')).toHaveCount(0);
  }
}

test.describe('R1 responsive acceptance', () => {
  test.setTimeout(240_000);

  test('owner remaining-priority pages do not overflow at required viewports', async ({
    page,
    request,
  }) => {
    const stamp = Date.now();
    const organizationName = `R1 Responsive Org ${stamp}`;
    const ownerEmail = `r1-resp-${stamp}@example.com`;
    await bootstrapApprovedOwner(page, request, {
      organizationName,
      ownerEmail,
      displayName: 'Responsive Owner',
      entitlements: { reportsExports: true, imports: true, auditHistory: '90d' },
    });

    const sampleViewports = [
      VIEWPORTS[0],
      VIEWPORTS[2],
      VIEWPORTS[3],
      VIEWPORTS[5],
    ];

    for (const viewport of sampleViewports) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      for (const route of [
        '/app/organization/settings',
        '/app/organization/setup',
        '/app/branches',
        '/app/imports',
        '/app/audit',
        '/app/products',
        '/app/dashboard',
        '/app/reports',
        '/app/sales/new',
      ]) {
        await page.goto(route);
        await expect(page.getByTestId('authenticated-shell')).toBeVisible();
        await page.waitForTimeout(150);
        await assertNoBodyOverflow(page, `${route} @ ${viewport.name}`);
      }
      await openMobileNavIfNeeded(page);
    }
  });

  test('owner catalog of Release 1 pages stays inside 390px', async ({ page, request }) => {
    const stamp = Date.now() + 1;
    await bootstrapApprovedOwner(page, request, {
      organizationName: `R1 Responsive Sweep ${stamp}`,
      ownerEmail: `r1-resp-sweep-${stamp}@example.com`,
      displayName: 'Responsive Sweep Owner',
      entitlements: { reportsExports: true, imports: true, auditHistory: '90d' },
    });

    await page.setViewportSize({ width: 390, height: 844 });
    for (const route of OWNER_ROUTES) {
      await page.goto(route.path);
      await page.waitForTimeout(120);
      const { contentOverflow, documentOverflow, offender } = await measureOverflow(page);
      expect(
        documentOverflow,
        `${route.module} document overflow at 390x844`,
      ).toBeLessThanOrEqual(2);
      expect(
        contentOverflow,
        `${route.module} content overflow at 390x844 (${offender ?? 'unknown'})`,
      ).toBeLessThanOrEqual(2);
    }
  });

  test('platform shell pages do not overflow at tablet and mobile', async ({ page, request }) => {
    const bootstrap = await request.post(`${API}/api/v1/test/e2e/bootstrap`);
    expect(bootstrap.status()).toBe(200);
    const bootstrapBody = await bootstrap.json();
    const superAdmin = bootstrapBody.data.superAdmin as { email: string; password: string };

    await signIn(page, superAdmin.email, superAdmin.password);
    await enterPlatformWorkspace(page);

    for (const viewport of [
      { name: '768x1024', width: 768, height: 1024 },
      { name: '390x844', width: 390, height: 844 },
    ]) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      for (const route of PLATFORM_ROUTES) {
        await page.goto(route.path);
        await page.waitForTimeout(150);
        await assertNoBodyOverflow(page, `${route.module} @ ${viewport.name}`);
      }
    }
  });
});
