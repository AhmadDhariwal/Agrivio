import { Route } from '@angular/router';

export const appRoutes: Route[] = [
  {
    path: 'request-access',
    loadComponent: () =>
      import('./features/onboarding/request-access.page').then((m) => m.RequestAccessPage),
  },
  {
    path: 'activate',
    loadComponent: () => import('./features/onboarding/activate.page').then((m) => m.ActivatePage),
  },
];
