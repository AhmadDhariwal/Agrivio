import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { of } from 'rxjs';
import { QueryCacheService } from '../../../shared/data-access/query-cache.service';
import { CapabilityService } from '../../capabilities/data-access/capability.service';
import { AuthApi, AuthSessionSnapshot } from './auth.api';
import { AuthSessionCrossTabService } from './auth-session-cross-tab.service';
import { AuthSessionStore } from './auth-session.store';

class FakeBroadcastChannel {
  static latest: FakeBroadcastChannel | null = null;
  readonly postMessage = vi.fn();
  private listener: ((event: MessageEvent<unknown>) => void) | null = null;

  constructor(readonly name: string) {
    FakeBroadcastChannel.latest = this;
  }

  addEventListener(_type: string, listener: (event: MessageEvent<unknown>) => void): void {
    this.listener = listener;
  }

  emit(data: unknown): void {
    this.listener?.({ data } as MessageEvent<unknown>);
  }
}

describe('AuthSessionCrossTabService', () => {
  const organizationSession = {
    activeContext: { contextType: 'organization' },
  } as AuthSessionSnapshot;

  afterEach(() => {
    vi.unstubAllGlobals();
    FakeBroadcastChannel.latest = null;
  });

  it('broadcasts only a secret-free event type after login', () => {
    const { service } = setup();
    service.sessionChanged();

    expect(FakeBroadcastChannel.latest?.name).toBe('agrivio-auth-session');
    expect(FakeBroadcastChannel.latest?.postMessage).toHaveBeenCalledWith({
      type: 'SESSION_CHANGED',
    });
  });

  it('clears local auth state and redirects when another tab logs out', () => {
    const { service, authApi, sessionStore, queryCache, capabilities, router } =
      setup('/app/products');
    service.start();
    FakeBroadcastChannel.latest?.emit({ type: 'LOGOUT' });

    expect(authApi.clearSecurityState).toHaveBeenCalledOnce();
    expect(sessionStore.clear).toHaveBeenCalledOnce();
    expect(queryCache.clearTenantCache).toHaveBeenCalledOnce();
    expect(capabilities.clear).toHaveBeenCalledOnce();
    expect(router.navigateByUrl).toHaveBeenCalledWith('/signin');
  });

  it('authoritatively restores the shared cookie session in a public second tab', () => {
    const { service, sessionStore, router } = setup();
    service.start();
    FakeBroadcastChannel.latest?.emit({ type: 'SESSION_CHANGED' });

    expect(sessionStore.loadSession).toHaveBeenCalledWith({ force: true });
    expect(router.navigateByUrl).toHaveBeenCalledWith('/app');
  });

  function setup(initialUrl = '/signin') {
    vi.stubGlobal('BroadcastChannel', FakeBroadcastChannel);
    const authApi = { clearSecurityState: vi.fn() };
    const sessionStore = {
      clear: vi.fn(),
      loadSession: vi.fn(() => of(organizationSession)),
    };
    const queryCache = { clearTenantCache: vi.fn() };
    const capabilities = { clear: vi.fn() };
    const router = { url: initialUrl, navigateByUrl: vi.fn(() => Promise.resolve(true)) };
    TestBed.configureTestingModule({
      providers: [
        AuthSessionCrossTabService,
        { provide: AuthApi, useValue: authApi },
        { provide: AuthSessionStore, useValue: sessionStore },
        { provide: QueryCacheService, useValue: queryCache },
        { provide: CapabilityService, useValue: capabilities },
        { provide: Router, useValue: router },
      ],
    });
    return {
      service: TestBed.inject(AuthSessionCrossTabService),
      authApi,
      sessionStore,
      queryCache,
      capabilities,
      router,
    };
  }
});
