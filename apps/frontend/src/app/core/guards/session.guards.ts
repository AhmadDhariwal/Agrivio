import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { catchError, map, of } from 'rxjs';
import { AuthSessionStore } from '../../features/auth/auth-session.store';

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
