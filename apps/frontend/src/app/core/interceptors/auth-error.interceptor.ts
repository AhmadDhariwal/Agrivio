import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { AuthSessionStore } from '../../features/auth/data-access/auth-session.store';

/**
 * Global HTTP interceptor that intercepts 401 Unauthorized responses.
 * When the session token expires, it clears the local session store
 * and automatically redirects the user to the sign-in page (/login).
 */
export const authErrorInterceptor: HttpInterceptorFn = (req, next) => {
  const sessionStore = inject(AuthSessionStore);
  const router = inject(Router);

  return next(req).pipe(
    catchError((error: unknown) => {
      if (error instanceof HttpErrorResponse && error.status === 401) {
        const isAuthAttempt =
          req.url.includes('/api/v1/auth/login') ||
          req.url.includes('/api/v1/auth/csrf');

        if (!isAuthAttempt) {
          sessionStore.clear();
          if (!router.url.startsWith('/login')) {
            void router.navigate(['/login']);
          }
        }
      }
      return throwError(() => error);
    }),
  );
};
