import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { of } from 'rxjs';
import { QueryCacheService } from '../../../shared/data-access/query-cache.service';
import { CapabilityService } from '../../capabilities/data-access/capability.service';
import { AuthApi } from './auth.api';
import { AuthSessionLifecycleService } from './auth-session-lifecycle.service';
import { AuthSessionStore } from './auth-session.store';

describe('AuthSessionLifecycleService', () => {
  it('invalidates the server session, clears scoped client state, and redirects to /signin', () => {
    const authApi = { logout: vi.fn(() => of({})), clearSecurityState: vi.fn() };
    const sessionStore = { clear: vi.fn() };
    const queryCache = { clearTenantCache: vi.fn() };
    const capabilities = { clear: vi.fn() };
    const router = { navigateByUrl: vi.fn(() => Promise.resolve(true)) };
    TestBed.configureTestingModule({
      providers: [
        AuthSessionLifecycleService,
        { provide: AuthApi, useValue: authApi },
        { provide: AuthSessionStore, useValue: sessionStore },
        { provide: QueryCacheService, useValue: queryCache },
        { provide: CapabilityService, useValue: capabilities },
        { provide: Router, useValue: router },
      ],
    });

    TestBed.inject(AuthSessionLifecycleService).signOut().subscribe();

    expect(authApi.logout).toHaveBeenCalledOnce();
    expect(authApi.clearSecurityState).toHaveBeenCalledOnce();
    expect(queryCache.clearTenantCache).toHaveBeenCalledOnce();
    expect(capabilities.clear).toHaveBeenCalledOnce();
    expect(sessionStore.clear).toHaveBeenCalledOnce();
    expect(router.navigateByUrl).toHaveBeenCalledWith('/signin');
  });
});
