import { appRoutes } from './app.routes';

describe('appRoutes F02 routing', () => {
  it('defines a wildcard not-found route and intentional legacy redirects', () => {
    const wildcard = appRoutes.find((route) => route.path === '**');
    expect(wildcard).toBeTruthy();

    const billingRedirect = appRoutes.find((route) => route.path === 'subscription/billing');
    expect(billingRedirect?.redirectTo).toBe('app/subscription/billing');

    const orgRedirect = appRoutes.find((route) => route.path === 'platform/organizations');
    expect(orgRedirect?.redirectTo).toBe('app/platform/organizations');
  });

  it('guards authenticated and platform surfaces', () => {
    const app = appRoutes.find((route) => route.path === 'app');
    expect(app?.canActivate?.length).toBeGreaterThan(0);

    const platformOrgs = app?.children?.find((route) => route.path === 'platform/organizations');
    expect(platformOrgs?.canActivate?.length).toBeGreaterThan(0);

    const context = appRoutes.find((route) => route.path === 'context');
    expect(context?.canActivate?.length).toBeGreaterThan(0);

    const print = app?.children?.find((route) => route.path === 'sales/:id/print');
    expect(print).toBeTruthy();

    const returns = app?.children?.find((route) => route.path === 'returns');
    expect(returns).toBeTruthy();
    expect(app?.children?.find((route) => route.path === 'dashboard')).toBeTruthy();
    expect(app?.children?.find((route) => route.path === 'alerts')).toBeTruthy();
    expect(app?.children?.find((route) => route.path === 'reports')).toBeTruthy();
    expect(app?.children?.find((route) => route.path === 'imports')).toBeTruthy();
    expect(app?.children?.find((route) => route.path === 'audit')).toBeTruthy();
    expect(app?.children?.find((route) => route.path === 'platform/operations')).toBeTruthy();
    const withoutInvoice = app?.children?.find((route) => route.path === 'returns/without-invoice');
    expect(withoutInvoice).toBeTruthy();
    const returnDetail = app?.children?.find((route) => route.path === 'returns/:id');
    expect(returnDetail).toBeTruthy();
    expect(app?.component).toBeTruthy();
  });

  it('resolves F08 lazy page components', async () => {
    const app = appRoutes.find((route) => route.path === 'app');
    const paths = ['dashboard', 'alerts', 'reports', 'imports', 'audit', 'platform/operations'];
    for (const path of paths) {
      const route = app?.children?.find((child) => child.path === path);
      expect(route?.loadComponent).toBeTruthy();
      const component = await route?.loadComponent?.();
      expect(component).toBeTruthy();
    }
  });
});
