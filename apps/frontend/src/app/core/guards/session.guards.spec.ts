import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, Router, RouterStateSnapshot, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { requirePermissionGuard } from './session.guards';
import { AuthSessionStore } from '../../features/auth/data-access/auth-session.store';

const emptyRoute = {} as ActivatedRouteSnapshot;
const emptyState = {} as RouterStateSnapshot;

describe('requirePermissionGuard', () => {
  it('allows a route when the session includes the required permission', () => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        {
          provide: AuthSessionStore,
          useValue: {
            session: () => ({ user: { id: 'u1' } }),
            hasPermission: (code: string) => code === 'purchases.view',
            loadSession: () => of({}),
          },
        },
      ],
    });

    const result = TestBed.runInInjectionContext(() =>
      requirePermissionGuard('purchases.view')(emptyRoute, emptyState),
    );
    expect(result).toBe(true);
  });

  it('redirects to access denied before the page loads when permission is missing', () => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        {
          provide: AuthSessionStore,
          useValue: {
            session: () => ({ user: { id: 'u1' } }),
            hasPermission: () => false,
            loadSession: () => of({}),
          },
        },
      ],
    });

    const router = TestBed.inject(Router);
    const result = TestBed.runInInjectionContext(() =>
      requirePermissionGuard('purchases.view')(emptyRoute, emptyState),
    );
    expect(result).toEqual(router.createUrlTree(['/app/access-denied']));
  });
});
