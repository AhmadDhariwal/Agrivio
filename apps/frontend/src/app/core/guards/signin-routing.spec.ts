import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { Subject, TimeoutError } from 'rxjs';
import { appRoutes } from '../../app.routes';
import { AuthApi, AuthSessionSnapshot } from '../../features/auth/data-access/auth.api';
import { AuthSessionStore } from '../../features/auth/data-access/auth-session.store';
import { signInGuard } from './session.guards';

describe('production sign-in routing regression', () => {
  const session: AuthSessionSnapshot = {
    user: { id: 'u1', email: 'owner@example.com', displayName: 'Owner', status: 'active' },
    activeContext: null,
    availableContexts: [],
    branchAssignments: [],
    warehouseAssignments: [],
    subscriptionAccessState: null,
  };

  function setup() {
    const discovery = new Subject<AuthSessionSnapshot>();
    const getSession = vi.fn(() => discovery.asObservable());
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideRouter(appRoutes),
        { provide: AuthApi, useValue: { getSession } },
      ],
    });
    return { discovery, getSession, store: TestBed.inject(AuthSessionStore) };
  }

  it('uses the non-blocking guard on the real sign-in route', async () => {
    const { getSession } = setup();
    expect(appRoutes.find((route) => route.path === 'signin')?.canActivate).toEqual([signInGuard]);
    const harness = await RouterTestingHarness.create('/signin');
    expect(harness.routeNativeElement?.querySelector('#login-email')).toBeTruthy();
    expect(getSession).not.toHaveBeenCalled();
  });

  it.each([
    ['401', new HttpErrorResponse({ status: 401 })],
    ['429', new HttpErrorResponse({ status: 429 })],
    ['500', new HttpErrorResponse({ status: 500 })],
    ['502', new HttpErrorResponse({ status: 502 })],
    ['network failure', new HttpErrorResponse({ status: 0 })],
    ['timeout', new TimeoutError()],
  ])(
    'renders while discovery is pending and keeps the form visible after %s',
    async (_label, error) => {
      const { discovery, store } = setup();
      const onError = vi.fn();
      store.loadSession().subscribe({ error: onError });
      expect(store.authState()).toBe('restoring');

      const harness = await RouterTestingHarness.create('/signin');
      expect(harness.routeNativeElement?.querySelector('#login-email')).toBeTruthy();
      discovery.error(error);
      harness.detectChanges();

      expect(TestBed.inject(Router).url).toBe('/signin');
      expect(harness.routeNativeElement?.querySelector('#login-email')).toBeTruthy();
      expect(harness.routeNativeElement?.querySelector('#login-password')).toBeTruthy();
      expect(store.authState()).toBe(
        error instanceof HttpErrorResponse && error.status === 401 ? 'unauthenticated' : 'unknown',
      );
      expect(onError).toHaveBeenCalledTimes(
        error instanceof HttpErrorResponse && error.status === 401 ? 0 : 1,
      );
    },
  );

  it('redirects a session established by a successful discovery to its normal destination', async () => {
    const { discovery, store } = setup();
    store.loadSession().subscribe();
    discovery.next(session);
    discovery.complete();

    await RouterTestingHarness.create('/signin');
    expect(TestBed.inject(Router).url).toBe('/context');
  });
});
