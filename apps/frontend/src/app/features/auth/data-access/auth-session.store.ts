import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { Observable, catchError, finalize, map, of, shareReplay, tap, throwError } from 'rxjs';
import { AuthApi, AuthSessionSnapshot, SessionContextSelection } from './auth.api';
import {
  allowedBranchIds,
  allowedWarehouseIds,
  filterBranchOptions,
  filterWarehouseOptions,
  isBranchSelectable,
  isWarehouseSelectable,
} from './assignment-scope.util';

@Injectable({ providedIn: 'root' })
export class AuthSessionStore {
  private readonly authApi = inject(AuthApi);

  private readonly sessionSignal = signal<AuthSessionSnapshot | null>(null);
  private readonly authStateSignal = signal<
    'unknown' | 'restoring' | 'authenticated' | 'unauthenticated'
  >('unknown');
  private sessionRequest: Observable<AuthSessionSnapshot | null> | null = null;

  readonly session = this.sessionSignal.asReadonly();
  readonly authState = this.authStateSignal.asReadonly();
  readonly activeContext = computed(() => this.sessionSignal()?.activeContext ?? null);
  readonly availableContexts = computed(() => this.sessionSignal()?.availableContexts ?? []);
  readonly permissions = computed(() => this.activeContext()?.permissions ?? []);
  readonly selectableBranchIds = computed(() => allowedBranchIds(this.activeContext()));
  readonly selectableWarehouseIds = computed(() => allowedWarehouseIds(this.activeContext()));

  applySession(snapshot: AuthSessionSnapshot | null): void {
    this.sessionSignal.set(snapshot);
    this.authStateSignal.set(snapshot === null ? 'unauthenticated' : 'authenticated');
  }

  clear(): void {
    this.sessionSignal.set(null);
    this.authStateSignal.set('unauthenticated');
  }

  hasPermission(permission: string): boolean {
    return this.permissions().includes(permission);
  }

  can(permission: string): boolean {
    return this.hasPermission(permission);
  }

  canAny(permissions: readonly string[]): boolean {
    return permissions.some((permission) => this.hasPermission(permission));
  }

  canAll(permissions: readonly string[]): boolean {
    return permissions.every((permission) => this.hasPermission(permission));
  }

  canSelectBranch(branchId: string): boolean {
    return isBranchSelectable(this.activeContext(), branchId);
  }

  canSelectWarehouse(warehouseId: string): boolean {
    return isWarehouseSelectable(this.activeContext(), warehouseId);
  }

  filterBranches<T extends { id: string }>(options: readonly T[]): T[] {
    return filterBranchOptions(this.activeContext(), options);
  }

  filterWarehouses<T extends { id: string }>(options: readonly T[]): T[] {
    return filterWarehouseOptions(this.activeContext(), options);
  }

  loadSession(options: { force?: boolean } = {}): Observable<AuthSessionSnapshot | null> {
    if (this.sessionRequest !== null) {
      return this.sessionRequest;
    }
    if (options.force !== true) {
      if (this.authStateSignal() === 'authenticated') {
        return of(this.sessionSignal());
      }
      if (this.authStateSignal() === 'unauthenticated') {
        return of(null);
      }
    }

    this.authStateSignal.set('restoring');
    const request = this.authApi.getSession().pipe(
      tap((snapshot) => this.applySession(snapshot)),
      map((snapshot) => snapshot as AuthSessionSnapshot | null),
      catchError((error: unknown) => {
        this.sessionSignal.set(null);
        if (error instanceof HttpErrorResponse && error.status === 401) {
          this.authStateSignal.set('unauthenticated');
          return of(null);
        }
        this.authStateSignal.set('unknown');
        return throwError(() => error);
      }),
      finalize(() => {
        if (this.sessionRequest === request) {
          this.sessionRequest = null;
        }
      }),
      shareReplay({ bufferSize: 1, refCount: false }),
    );
    this.sessionRequest = request;
    return request;
  }

  switchContext(selection: SessionContextSelection): Observable<AuthSessionSnapshot> {
    return this.authApi.switchContext(selection).pipe(
      map((result) => result.session),
      tap((snapshot) => this.applySession(snapshot)),
    );
  }
}
