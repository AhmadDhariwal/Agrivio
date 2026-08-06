import { Route } from '@angular/router';

export const appRoutes: Route[] = [
  {
    path: 'request-access',
    loadComponent: () =>
      import('./features/public/org-request/org-request.component').then(
        (m) => m.OrgRequestComponent,
      ),
  },
  {
    path: 'activate',
    loadComponent: () =>
      import('./features/authentication/activate-account/activate-account.component').then(
        (m) => m.ActivateAccountComponent,
      ),
  },
  {
    path: '',
    redirectTo: 'request-access',
    pathMatch: 'full',
  },
];
