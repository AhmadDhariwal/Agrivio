import { TestBed } from '@angular/core/testing';
import {
  ActivatedRouteSnapshot,
  Router,
  RouterStateSnapshot,
  provideRouter,
} from '@angular/router';
import { firstValueFrom, of, Subject } from 'rxjs';
import {
  publicOnlyGuard,
  requirePermissionGuard,
  requirePlatformContextGuard,
  requireSessionGuard,
} from './session.guards';
import { AuthSessionSnapshot } from '../../features/auth/data-access/auth.api';
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
            authState: () => 'authenticated',
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
            authState: () => 'authenticated',
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
            authState: () => 'unknown',
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
            authState: () => 'unknown',
            activeContext: () => null,
            loadSession: () => of(null),
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
            authState: () => 'unknown',
            loadSession: () => of(null),
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

  it('waits for session restoration before deciding a public-only route', () => {
    const restored = new Subject<AuthSessionSnapshot | null>();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        {
          provide: AuthSessionStore,
          useValue: {
            session: () => null,
            authState: () => 'restoring',
            activeContext: () => ({ contextType: 'organization' }),
            loadSession: () => restored.asObservable(),
          },
        },
      ],
    });
    let decision: unknown;
    const result = TestBed.runInInjectionContext(() => publicOnlyGuard(emptyRoute, emptyState));
    (result as ReturnType<typeof of>).subscribe((value) => (decision = value));

    expect(decision).toBeUndefined();
    restored.next({} as AuthSessionSnapshot);
    expect(decision).toEqual(TestBed.inject(Router).parseUrl('/app'));
  });

  it('redirects a restored platform session to the canonical platform workspace', async () => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        {
          provide: AuthSessionStore,
          useValue: {
            session: () => null,
            authState: () => 'unknown',
            activeContext: () => ({ contextType: 'platform' }),
            loadSession: () => of({ activeContext: { contextType: 'platform' } }),
          },
        },
      ],
    });
    const router = TestBed.inject(Router);
    const result = TestBed.runInInjectionContext(() => publicOnlyGuard(emptyRoute, emptyState));
    expect(await firstValueFrom(result as ReturnType<typeof of>)).toEqual(
      router.parseUrl('/app/platform/organizations'),
    );
  });

  it('redirects an authenticated session without an active context to context selection', async () => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        {
          provide: AuthSessionStore,
          useValue: {
            session: () => null,
            authState: () => 'unknown',
            activeContext: () => null,
            loadSession: () => of({ activeContext: null }),
          },
        },
      ],
    });
    const result = TestBed.runInInjectionContext(() => publicOnlyGuard(emptyRoute, emptyState));
    expect(await firstValueFrom(result as ReturnType<typeof of>)).toEqual(
      TestBed.inject(Router).parseUrl('/context'),
    );
  });

  it('keeps tenant context out of platform routes', () => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        {
          provide: AuthSessionStore,
          useValue: {
            session: () => ({ activeContext: { contextType: 'organization' } }),
            authState: () => 'authenticated',
            activeContext: () => ({ contextType: 'organization' }),
            loadSession: vi.fn(),
          },
        },
      ],
    });
    expect(
      TestBed.runInInjectionContext(() =>
        requirePlatformContextGuard(emptyRoute, emptyState),
      ),
    ).toEqual(TestBed.inject(Router).createUrlTree(['/context']));
  });

  it('does not repeat the session request after unauthenticated state is known', () => {
    const loadSession = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        {
          provide: AuthSessionStore,
          useValue: {
            session: () => null,
            authState: () => 'unauthenticated',
            activeContext: () => null,
            loadSession,
          },
        },
      ],
    });
    const router = TestBed.inject(Router);
    const publicResult = TestBed.runInInjectionContext(() =>
      publicOnlyGuard(emptyRoute, emptyState),
    );
    const protectedResult = TestBed.runInInjectionContext(() =>
      requireSessionGuard(emptyRoute, emptyState),
    );

    expect(publicResult).toBe(true);
    expect(protectedResult).toEqual(router.parseUrl('/signin'));
    expect(loadSession).not.toHaveBeenCalled();
  });
});
