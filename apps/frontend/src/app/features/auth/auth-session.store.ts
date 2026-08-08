import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, map, tap } from 'rxjs';
import { AuthApi, AuthSessionSnapshot, SessionContextSelection } from './auth.api';

@Injectable({ providedIn: 'root' })
export class AuthSessionStore {
  private readonly authApi = inject(AuthApi);

  private readonly sessionSignal = signal<AuthSessionSnapshot | null>(null);

  readonly session = this.sessionSignal.asReadonly();
  readonly activeContext = computed(() => this.sessionSignal()?.activeContext ?? null);
  readonly availableContexts = computed(() => this.sessionSignal()?.availableContexts ?? []);
  readonly permissions = computed(() => this.activeContext()?.permissions ?? []);

  applySession(snapshot: AuthSessionSnapshot | null): void {
    this.sessionSignal.set(snapshot);
  }

  clear(): void {
    this.sessionSignal.set(null);
  }

  hasPermission(permission: string): boolean {
    return this.permissions().includes(permission);
  }

  loadSession(): Observable<AuthSessionSnapshot> {
    return this.authApi.getSession().pipe(tap((snapshot) => this.sessionSignal.set(snapshot)));
  }

  switchContext(selection: SessionContextSelection): Observable<AuthSessionSnapshot> {
    return this.authApi.switchContext(selection).pipe(
      map((result) => result.session),
      tap((snapshot) => this.sessionSignal.set(snapshot)),
    );
  }
}
