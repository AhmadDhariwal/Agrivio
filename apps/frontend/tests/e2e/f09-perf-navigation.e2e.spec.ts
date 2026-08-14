import { expect, test } from '@playwright/test';
import { bootstrapApprovedOwner } from './f07-p4-support';

const ROUTE_P95_MS = 2000;

function percentile(sorted: number[], p: number): number {
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[index];
}

test.describe('R1-F09-004 browser route navigation', () => {
  test('p95 to usable primary content is within the accepted planning threshold', async ({
    page,
    request,
  }) => {
    test.setTimeout(240_000);
    const stamp = Date.now();
    await bootstrapApprovedOwner(page, request, {
      organizationName: `F09 Perf Nav ${stamp}`,
      ownerEmail: `f09-perf-nav-${stamp}@example.com`,
      displayName: 'F09 Perf Nav Owner',
      entitlements: { reportsExports: true, imports: true, auditHistory: '90d' },
    });

    const routes = [
      { path: '/app/dashboard', testId: 'dashboard-page' },
      { path: '/app/sales/new', testId: 'sale-form' },
      { path: '/app/inventory/stock', heading: 'Stock on hand' },
      { path: '/app/reports', testId: 'reports-page' },
    ];

    const samples: number[] = [];
    for (let i = 0; i < 8; i += 1) {
      const route = routes[i % routes.length];
      const started = Date.now();
      await page.goto(route.path, { waitUntil: 'commit' });
      if (route.testId) {
        await expect(page.getByTestId(route.testId)).toBeVisible();
      } else {
        await expect(page.getByRole('heading', { name: route.heading })).toBeVisible();
      }
      const elapsed = Date.now() - started;
      if (i >= 1) {
        samples.push(elapsed);
      }
    }

    const sorted = [...samples].sort((a, b) => a - b);
    const p95 = percentile(sorted, 95);
    expect(p95, `route navigation p95 ${p95} ms (n=${samples.length})`).toBeLessThanOrEqual(
      ROUTE_P95_MS,
    );
  });
});
