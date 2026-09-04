import { appRoutes } from './app.routes';

describe('appRoutes F02 routing', () => {
  it('defines a wildcard not-found route and intentional legacy redirects', () => {
    const wildcard = appRoutes.find((route) => route.path === '**');
    expect(wildcard).toBeTruthy();

    const billingRedirect = appRoutes.find((route) => route.path === 'subscription/billing');
    expect(billingRedirect?.redirectTo).toBe('app/subscription/billing');

    const orgRedirect = appRoutes.find((route) => route.path === 'platform/organizations');
    expect(orgRedirect?.redirectTo).toBe('app/platform/organizations');

    const loginRedirect = appRoutes.find((route) => route.path === 'login');
    expect(loginRedirect?.redirectTo).toBe('signin');
    expect(appRoutes.find((route) => route.path === 'signin')?.canActivate?.length).toBe(1);
  });

  it('guards authenticated and platform surfaces', () => {
    const app = appRoutes.find((route) => route.path === 'app');
    expect(app?.canActivate?.length).toBeGreaterThan(0);

    const platformOrgs = app?.children?.find((route) => route.path === 'platform/organizations');
    expect(platformOrgs?.canActivate?.length).toBeGreaterThan(0);

    const platformOrgDetail = app?.children?.find((route) => route.path === 'platform/organizations/:id');
    expect(platformOrgDetail?.canActivate?.length).toBeGreaterThan(0);

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
    const purchases = app?.children?.find((route) => route.path === 'purchases');
    expect(purchases).toBeTruthy();
    expect(purchases?.canActivate?.length).toBeGreaterThan(0);
    const sales = app?.children?.find((route) => route.path === 'sales');
    expect(sales).toBeTruthy();
    expect(sales?.canActivate?.length).toBeGreaterThan(0);

    const products = app?.children?.find((route) => route.path === 'products');
    expect(products?.canActivate?.length).toBeGreaterThan(0);
    const openingStock = app?.children?.find((route) => route.path === 'inventory/opening-stock');
    expect(openingStock?.canActivate?.length).toBeGreaterThan(0);
    const batches = app?.children?.find((route) => route.path === 'inventory/batches');
    expect(batches?.canActivate?.length).toBeGreaterThan(0);
    expect(app?.children?.find((route) => route.path === 'feature-unavailable')).toBeTruthy();
    expect(app?.children?.find((route) => route.path === 'access-denied')).toBeTruthy();

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
  }, 15000);

  it('resolves platform organizations lazy page components', async () => {
    const app = appRoutes.find((route) => route.path === 'app');
    const paths = ['platform/organizations', 'platform/organizations/:id'];
    for (const path of paths) {
      const route = app?.children?.find((child) => child.path === path);
      expect(route?.loadComponent).toBeTruthy();
      const component = await route?.loadComponent?.();
      expect(component).toBeTruthy();
    }
  }, 15000);

  it('keeps transaction view and edit routes explicit and component-distinct', async () => {
    const app = appRoutes.find((route) => route.path === 'app');
    const pairs = [
      ['sales/:id', 'sales/:id/edit'],
      ['purchases/:id', 'purchases/:id/edit'],
      ['employees/:id', 'employees/:id/edit'],
    ] as const;

    for (const [viewPath, editPath] of pairs) {
      const view = app?.children?.find((route) => route.path === viewPath);
      const edit = app?.children?.find((route) => route.path === editPath);
      expect(view?.loadComponent).toBeTruthy();
      expect(edit?.loadComponent).toBeTruthy();
      expect(view?.canActivate?.length).toBeGreaterThan(0);
      expect(edit?.canActivate?.length).toBeGreaterThan(0);
      expect(await view?.loadComponent?.()).not.toBe(await edit?.loadComponent?.());
    }
  }, 15000);

  it('covers the application-wide view/edit route inventory without inventing detail routes', () => {
    const app = appRoutes.find((route) => route.path === 'app');
    const routeInventory = [
      ['sales', 'sales/:id', 'sales/:id/edit', 'sales/new'],
      ['purchases', 'purchases/:id', 'purchases/:id/edit', 'purchases/new'],
      ['products', null, 'products/:id', 'products/new'],
      ['categories', null, 'categories/:id', 'categories/new'],
      ['customers', null, 'customers/:id', 'customers/new'],
      ['suppliers', null, 'suppliers/:id', 'suppliers/new'],
      ['returns', 'returns/:id', null, 'returns/without-invoice'],
      ['expenses', 'expenses/:id', null, 'expenses/new'],
      ['accounts', 'accounts/:id', null, 'accounts/new'],
      ['branches', null, 'branches/:id/edit', 'branches/new'],
      ['warehouses', null, 'warehouses/:id', 'warehouses/new'],
      ['employees', 'employees/:id', 'employees/:id/edit', 'employees/new'],
      ['stock adjustments', 'inventory/adjustments', null, null],
      ['warehouse transfers', 'inventory/transfers', null, null],
      ['product batches', 'inventory/batches', null, null],
      ['customer payments', 'customer-payments', null, 'customer-payments/new'],
      ['supplier payments', 'supplier-payments', null, 'supplier-payments/new'],
      ['billing records', 'platform/billing-review', null, null],
      ['imports', 'imports', null, null],
      ['super admin organizations', 'platform/organizations/:id', null, null],
    ] as const;

    for (const [, view, edit, create] of routeInventory) {
      for (const path of [view, edit, create]) {
        if (path) expect(app?.children?.some((route) => route.path === path)).toBe(true);
      }
    }
  });
});
