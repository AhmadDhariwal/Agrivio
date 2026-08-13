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
    const withoutInvoice = app?.children?.find((route) => route.path === 'returns/without-invoice');
    expect(withoutInvoice).toBeTruthy();
  });
});
