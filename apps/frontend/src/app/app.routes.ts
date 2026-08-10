import { Route } from '@angular/router';
import {
  requirePlatformContextGuard,
  requireSessionGuard,
} from './core/guards/session.guards';

export const appRoutes: Route[] = [
  {
    path: '',
    loadComponent: () =>
      import('./features/public/landing.page').then((m) => m.LandingPage),
  },
  {
    path: 'login',
    loadComponent: () => import('./features/auth/login.page').then((m) => m.LoginPage),
  },
  {
    path: 'context',
    canActivate: [requireSessionGuard],
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
  {
    path: 'app',
    canActivate: [requireSessionGuard],
    loadComponent: () =>
      import('./features/shell/app-shell.page').then((m) => m.AppShellPage),
    children: [
      {
        path: '',
        loadComponent: () =>
          import('./features/shell/workspace-home.page').then((m) => m.WorkspaceHomePage),
      },
      {
        path: 'subscription/billing',
        loadComponent: () =>
          import('./features/subscriptions/billing-evidence.page').then(
            (m) => m.BillingEvidencePage,
          ),
      },
      {
        path: 'platform/organizations',
        canActivate: [requirePlatformContextGuard],
        loadComponent: () =>
          import('./features/platform/organizations-admin.page').then(
            (m) => m.PlatformOrganizationsPage,
          ),
      },
      {
        path: 'platform/plans',
        canActivate: [requirePlatformContextGuard],
        loadComponent: () =>
          import('./features/platform/plans-admin.page').then((m) => m.PlatformPlansPage),
      },
      {
        path: 'platform/billing-review',
        canActivate: [requirePlatformContextGuard],
        loadComponent: () =>
          import('./features/platform/billing-review.page').then(
            (m) => m.PlatformBillingReviewPage,
          ),
      },
    ],
  },
  {
    path: 'subscription/billing',
    redirectTo: 'app/subscription/billing',
    pathMatch: 'full',
  },
  {
    path: 'platform/organizations',
    redirectTo: 'app/platform/organizations',
    pathMatch: 'full',
  },
  {
    path: 'platform/plans',
    redirectTo: 'app/platform/plans',
    pathMatch: 'full',
  },
  {
    path: 'platform/billing-review',
    redirectTo: 'app/platform/billing-review',
    pathMatch: 'full',
  },
  {
    path: '**',
    loadComponent: () =>
      import('./features/public/not-found.page').then((m) => m.NotFoundPage),
  },
];
