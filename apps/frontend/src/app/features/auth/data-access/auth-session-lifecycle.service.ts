import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, tap } from 'rxjs';
import { APP_PATHS } from '../../../core/navigation/app-paths';
import { QueryCacheService } from '../../../shared/data-access/query-cache.service';
import { CapabilityService } from '../../capabilities/data-access/capability.service';
import { AuthApi } from './auth.api';
import { AuthSessionStore } from './auth-session.store';

@Injectable({ providedIn: 'root' })
export class AuthSessionLifecycleService {
  private readonly authApi = inject(AuthApi);
  private readonly sessionStore = inject(AuthSessionStore);
  private readonly queryCache = inject(QueryCacheService);
  private readonly capabilityService = inject(CapabilityService);
  private readonly router = inject(Router);

  signOut(): Observable<unknown> {
    return this.authApi.logout().pipe(
      tap(() => {
        this.authApi.clearSecurityState();
        this.queryCache.clearTenantCache();
        this.capabilityService.clear();
        this.sessionStore.clear();
        void this.router.navigateByUrl(APP_PATHS.signIn);
      }),
    );
  }
}
