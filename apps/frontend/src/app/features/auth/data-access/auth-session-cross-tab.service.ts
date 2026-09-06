import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';
import { EMPTY, catchError } from 'rxjs';
import { APP_PATHS, authenticatedHomePath } from '../../../core/navigation/app-paths';
import { QueryCacheService } from '../../../shared/data-access/query-cache.service';
import { CapabilityService } from '../../capabilities/data-access/capability.service';
import { AuthApi } from './auth.api';
import { AuthSessionStore } from './auth-session.store';

export type AuthSessionEventType = 'SESSION_CHANGED' | 'LOGOUT' | 'CONTEXT_CHANGED';

@Injectable({ providedIn: 'root' })
export class AuthSessionCrossTabService {
  private readonly authApi = inject(AuthApi);
  private readonly sessionStore = inject(AuthSessionStore);
  private readonly queryCache = inject(QueryCacheService);
  private readonly capabilityService = inject(CapabilityService);
  private readonly router = inject(Router);
  private channel: BroadcastChannel | null = null;

  start(): void {
    if (
      this.channel !== null ||
      typeof window === 'undefined' ||
      typeof window.BroadcastChannel !== 'function'
    ) {
      return;
    }
    this.channel = new window.BroadcastChannel('agrivio-auth-session');
    this.channel.addEventListener('message', (event: MessageEvent<unknown>) => {
      const type = this.readEventType(event.data);
      if (type !== null) {
        this.handleRemoteEvent(type);
      }
    });
  }

  sessionChanged(): void {
    this.publish('SESSION_CHANGED');
  }

  contextChanged(): void {
    this.publish('CONTEXT_CHANGED');
  }

  loggedOut(): void {
    this.publish('LOGOUT');
  }

  authoritativeSessionLost(): void {
    this.clearLocalSecurityState();
    this.loggedOut();
  }

  private publish(type: AuthSessionEventType): void {
    this.start();
    this.channel?.postMessage({ type });
  }

  private handleRemoteEvent(type: AuthSessionEventType): void {
    if (type === 'LOGOUT') {
      this.clearLocalSecurityState();
      if (!this.router.url.startsWith(APP_PATHS.signIn)) {
        void this.router.navigateByUrl(APP_PATHS.signIn);
      }
      return;
    }

    this.sessionStore
      .loadSession({ force: true })
      .pipe(catchError(() => EMPTY))
      .subscribe((session) => {
        if (session === null) {
          this.clearLocalSecurityState();
          void this.router.navigateByUrl(APP_PATHS.signIn);
          return;
        }

        const isPublicEntry =
          this.router.url === '/' ||
          this.router.url.startsWith(APP_PATHS.signIn) ||
          this.router.url.startsWith('/login');
        if (isPublicEntry || type === 'CONTEXT_CHANGED') {
          void this.router.navigateByUrl(authenticatedHomePath(session.activeContext));
        }
      });
  }

  private clearLocalSecurityState(): void {
    this.authApi.clearSecurityState();
    this.queryCache.clearTenantCache();
    this.capabilityService.clear();
    this.sessionStore.clear();
  }

  private readEventType(value: unknown): AuthSessionEventType | null {
    if (value === null || typeof value !== 'object' || !('type' in value)) {
      return null;
    }
    const type = value.type;
    return type === 'SESSION_CHANGED' || type === 'LOGOUT' || type === 'CONTEXT_CHANGED'
      ? type
      : null;
  }
}
