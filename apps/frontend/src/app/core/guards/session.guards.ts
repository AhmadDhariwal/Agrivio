import { inject } from '@angular/core';
import { CanActivateFn, Router, UrlTree } from '@angular/router';
import { catchError, map, of } from 'rxjs';
import { AuthSessionStore } from '../../features/auth/data-access/auth-session.store';
import { CapabilityService } from '../../features/capabilities/data-access/capability.service';
import { APP_PATHS, authenticatedHomePath } from '../navigation/app-paths';

function authenticatedDestination(sessionStore: AuthSessionStore, router: Router): UrlTree {
  return router.parseUrl(authenticatedHomePath(sessionStore.activeContext()));
}

/**
 * Prevents authenticated sessions from rendering public authentication entry pages.
 * The decision waits for the authoritative cookie-backed session probe to finish.
 */
export const publicOnlyGuard: CanActivateFn = () => {
  const sessionStore = inject(AuthSessionStore);
  const router = inject(Router);

  if (sessionStore.authState() === 'authenticated') {
    return authenticatedDestination(sessionStore, router);
  }
  if (sessionStore.authState() === 'unauthenticated') {
    return true;
  }

  return sessionStore.loadSession().pipe(
    map((session) =>
      session === null ? true : authenticatedDestination(sessionStore, router),
    ),
    catchError(() => of(false)),
  );
};

/**
 * Non-authoritative session presence check for UX routing only.
 * Backend authorization remains authoritative.
 */
export const requireSessionGuard: CanActivateFn = () => {
  const sessionStore = inject(AuthSessionStore);
  const router = inject(Router);

  if (sessionStore.authState() === 'authenticated') {
    return true;
  }
  if (sessionStore.authState() === 'unauthenticated') {
    return router.parseUrl(APP_PATHS.signIn);
  }

  return sessionStore.loadSession().pipe(
    map((session) => (session === null ? router.parseUrl(APP_PATHS.signIn) : true)),
    catchError(() => of(false)),
  );
};

/**
 * Soft platform-context hint for platform admin pages.
 * Does not replace backend permission checks.
 */
export const requirePlatformContextGuard: CanActivateFn = () => {
  const sessionStore = inject(AuthSessionStore);
  const router = inject(Router);
  const active = sessionStore.activeContext();

  if (active?.contextType === 'platform') {
    return true;
  }

  if (sessionStore.authState() !== 'authenticated') {
    return sessionStore.loadSession().pipe(
      map((session) => {
        if (session?.activeContext?.contextType === 'platform') {
          return true;
        }
        if (session === null) {
          return router.parseUrl(APP_PATHS.signIn);
        }
        return router.createUrlTree(['/context']);
      }),
      catchError(() => of(false)),
    );
  }

  return router.createUrlTree(['/context']);
};

export function requirePermissionGuard(permission: string): CanActivateFn {
  return () => {
    const sessionStore = inject(AuthSessionStore);
    const router = inject(Router);
    const decide = (): true | UrlTree =>
      sessionStore.hasPermission(permission) ? true : router.createUrlTree(['/app/access-denied']);

    if (sessionStore.authState() === 'authenticated') {
      return decide();
    }
    if (sessionStore.authState() === 'unauthenticated') {
      return router.parseUrl(APP_PATHS.signIn);
    }

    return sessionStore.loadSession().pipe(
      map((session) => (session === null ? router.parseUrl(APP_PATHS.signIn) : decide())),
      catchError(() => of(false)),
    );
  };
}

export function requireCapabilityGuard(
  key: string,
  mode: 'module' | 'view' | 'action' = 'module',
): CanActivateFn {
  return () => {
    const capabilities = inject(CapabilityService);
    const router = inject(Router);
    return capabilities.ensureLoaded().pipe(
      map(() => {
        const allowed =
          mode === 'action'
            ? capabilities.canPerformAction(key)
            : mode === 'view'
              ? capabilities.canUseView(key)
              : capabilities.canUseModule(key);
        return allowed ? true : router.createUrlTree(['/app/feature-unavailable']);
      }),
      catchError(() => of(router.createUrlTree(['/app/feature-unavailable']))),
    );
  };
}
