import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { of, throwError } from 'rxjs';
import { appRoutes } from '../../app.routes';
import { AuthApi, AuthSessionSnapshot } from '../../features/auth/data-access/auth.api';
import { AuthSessionStore } from '../../features/auth/data-access/auth-session.store';

@Component({ template: '<p data-testid="protected-content">Protected workspace</p>' })
class ProtectedPage {}

describe('public homepage session discovery', () => {
  const failures = [
    ['401', new HttpErrorResponse({ status: 401 })],
    ['429', new HttpErrorResponse({ status: 429, error: 'Too Many Requests' })],
    ['502', new HttpErrorResponse({ status: 502, error: 'Bad Gateway' })],
    ['network failure', new HttpErrorResponse({ status: 0 })],
  ] as const;

  function setup(response: ReturnType<AuthApi['getSession']>) {
    const getSession = vi.fn(() => response);
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideRouter([
          appRoutes.find((route) => route.path === '')!,
          appRoutes.find((route) => route.path === 'signin')!,
          {
            path: 'app',
            canActivate: appRoutes.find((route) => route.path === 'app')!.canActivate!,
            component: ProtectedPage,
          },
          { path: 'app/platform/organizations', component: ProtectedPage },
          { path: 'context', component: ProtectedPage },
        ]),
        { provide: AuthApi, useValue: { getSession } },
      ],
    });
    return { getSession, store: TestBed.inject(AuthSessionStore) };
  }

  it.each(failures)('renders the homepage after session %s', async (_label, error) => {
    const { getSession, store } = setup(throwError(() => error));
    const harness = await RouterTestingHarness.create('/');

    expect(TestBed.inject(Router).url).toBe('/');
    expect(harness.routeNativeElement?.querySelector('h1')?.textContent).toBe('Agrivio');
    expect(harness.routeNativeElement?.querySelector('a[href="/signin"]')).toBeTruthy();
    expect(getSession).toHaveBeenCalledOnce();
    expect(store.authState()).toBe(error.status === 401 ? 'unauthenticated' : 'unknown');
  });

  it.each(failures)('does not render protected content after session %s', async (_label, error) => {
    setup(throwError(() => error));
    const harness = await RouterTestingHarness.create('/app');

    expect(
      harness.routeNativeElement?.querySelector('[data-testid="protected-content"]'),
    ).toBeFalsy();
    if (error.status === 401) {
      expect(TestBed.inject(Router).url).toBe('/signin');
      expect(harness.routeNativeElement?.querySelector('#login-email')).toBeTruthy();
    } else {
      expect(harness.routeNativeElement).toBeNull();
    }
  });

  it.each([
    ['organization', '/app'],
    ['platform', '/app/platform/organizations'],
    [null, '/context'],
  ] as const)('preserves the restored %s session redirect', async (contextType, destination) => {
    const session: AuthSessionSnapshot = {
      user: { id: 'u1', email: 'owner@example.com', displayName: 'Owner', status: 'active' },
      activeContext: contextType === null ? null : { contextType, role: 'Owner', permissions: [] },
      availableContexts: [],
      branchAssignments: [],
      warehouseAssignments: [],
      subscriptionAccessState: null,
    };
    const { getSession, store } = setup(of(session));
    await RouterTestingHarness.create('/');

    expect(TestBed.inject(Router).url).toBe(destination);
    expect(store.session()).toBe(session);
    expect(getSession).toHaveBeenCalledOnce();
  });
});
