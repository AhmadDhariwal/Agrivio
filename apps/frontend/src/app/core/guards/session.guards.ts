import { inject } from '@angular/core';
import { CanActivateFn, Router, UrlTree } from '@angular/router';
import { catchError, map, of } from 'rxjs';
import { AuthSessionStore } from '../../features/auth/data-access/auth-session.store';
import { CapabilityService } from '../../features/capabilities/data-access/capability.service';

/**
 * Non-authoritative session presence check for UX routing only.
 * Backend authorization remains authoritative.
 */
export const requireSessionGuard: CanActivateFn = () => {
  const sessionStore = inject(AuthSessionStore);
  const router = inject(Router);

  if (sessionStore.session() !== null) {
    return true;
  }

  return sessionStore.loadSession().pipe(
    map(() => true),
    catchError(() => of(router.createUrlTree(['/login']))),
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

  if (sessionStore.session() === null) {
    return sessionStore.loadSession().pipe(
      map((session) => {
        if (session.activeContext?.contextType === 'platform') {
          return true;
        }
        return router.createUrlTree(['/context']);
      }),
      catchError(() => of(router.createUrlTree(['/login']))),
    );
  }

  return router.createUrlTree(['/context']);
};

export function requirePermissionGuard(permission: string): CanActivateFn {
  return () => {
    const sessionStore = inject(AuthSessionStore);
    const router = inject(Router);
    const decide = (): true | UrlTree =>
      sessionStore.hasPermission(permission)
        ? true
        : router.createUrlTree(['/app/access-denied']);

    if (sessionStore.session() !== null) {
      return decide();
    }

    return sessionStore.loadSession().pipe(
      map(() => decide()),
      catchError(() => of(router.createUrlTree(['/login']))),
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
