import { Route } from '@angular/router';

export const appRoutes: Route[] = [
  {
    path: 'login',
    loadComponent: () => import('./features/auth/login.page').then((m) => m.LoginPage),
  },
  {
    path: 'context',
    loadComponent: () =>
      import('./features/auth/context-switcher.page').then((m) => m.ContextSwitcherPage),
  },
  {
    path: 'password-reset',
    loadComponent: () =>
      import('./features/auth/password-reset-request.page').then((m) => m.PasswordResetRequestPage),
  },
  {
    path: 'password-reset/confirm',
    loadComponent: () =>
      import('./features/auth/password-reset-confirm.page').then((m) => m.PasswordResetConfirmPage),
  },
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
