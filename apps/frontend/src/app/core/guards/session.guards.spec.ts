import { TestBed } from '@angular/core/testing';
import {
  ActivatedRouteSnapshot,
  Router,
  RouterStateSnapshot,
  provideRouter,
} from '@angular/router';
import { firstValueFrom, of, throwError } from 'rxjs';
import { publicOnlyGuard, requirePermissionGuard, requireSessionGuard } from './session.guards';
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

describe('session route guards', () => {
  it('redirects an authenticated user away from /signin to the active workspace', async () => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        {
          provide: AuthSessionStore,
          useValue: {
            session: () => null,
            activeContext: () => ({ contextType: 'organization', organizationId: 'org-1' }),
            loadSession: () => of({}),
          },
        },
      ],
    });
    const router = TestBed.inject(Router);
    const result = TestBed.runInInjectionContext(() => publicOnlyGuard(emptyRoute, emptyState));
    expect(await firstValueFrom(result as ReturnType<typeof of>)).toEqual(router.parseUrl('/app'));
  });

  it('allows /signin only after an anonymous session probe completes', async () => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        {
          provide: AuthSessionStore,
          useValue: {
            session: () => null,
            activeContext: () => null,
            loadSession: () => throwError(() => new Error('unauthorized')),
          },
        },
      ],
    });
    const result = TestBed.runInInjectionContext(() => publicOnlyGuard(emptyRoute, emptyState));
    expect(await firstValueFrom(result as ReturnType<typeof of>)).toBe(true);
  });

  it('redirects logged-out protected navigation to /signin before rendering the app shell', async () => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        {
          provide: AuthSessionStore,
          useValue: {
            session: () => null,
            loadSession: () => throwError(() => new Error('expired')),
          },
        },
      ],
    });
    const router = TestBed.inject(Router);
    const result = TestBed.runInInjectionContext(() => requireSessionGuard(emptyRoute, emptyState));
    expect(await firstValueFrom(result as ReturnType<typeof of>)).toEqual(
      router.parseUrl('/signin'),
    );
  });
});
