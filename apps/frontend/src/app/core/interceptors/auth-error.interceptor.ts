import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { mapAuthorizationError } from '../access/authorization-error';
import { APP_PATHS } from '../navigation/app-paths';
import { AuthSessionCrossTabService } from '../../features/auth/data-access/auth-session-cross-tab.service';

/**
 * Global HTTP interceptor that intercepts 401 Unauthorized responses.
 * When the session token expires, it clears the local session store
 * and automatically redirects the user to the sign-in page.
 * Authorization failures keep the current page and expose a user-safe message.
 */
export const authErrorInterceptor: HttpInterceptorFn = (req, next) => {
  const router = inject(Router);
  const crossTab = inject(AuthSessionCrossTabService);

  return next(req).pipe(
    catchError((error: unknown) => {
      if (error instanceof HttpErrorResponse && error.status === 401) {
        const isAuthAttempt =
          req.url.includes('/api/v1/auth/login') ||
          req.url.includes('/api/v1/auth/csrf') ||
          (req.method === 'GET' && req.url.includes('/api/v1/auth/session'));

        if (!isAuthAttempt) {
          crossTab.authoritativeSessionLost();
          if (!router.url.startsWith(APP_PATHS.signIn)) {
            void router.navigateByUrl(APP_PATHS.signIn);
          }
        }
      }

      if (error instanceof HttpErrorResponse && (error.status === 403 || error.status === 401)) {
        const original = error.error?.error;
        const code = typeof original?.code === 'string' ? original.code : undefined;
        const mapped = mapAuthorizationError(error);
        return throwError(
          () =>
            new HttpErrorResponse({
              error: {
                error: {
                  ...(typeof original === 'object' && original !== null ? original : {}),
                  ...(code === undefined ? {} : { code }),
                  message: mapped,
                },
              },
              headers: error.headers,
              status: error.status,
              statusText: error.statusText,
              ...(error.url ? { url: error.url } : {}),
            }),
        );
      }

      return throwError(() => error);
    }),
  );
};
