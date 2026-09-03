import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, finalize, map, shareReplay, tap } from 'rxjs';
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
  private sessionRequest: Observable<AuthSessionSnapshot> | null = null;

  readonly session = this.sessionSignal.asReadonly();
  readonly activeContext = computed(() => this.sessionSignal()?.activeContext ?? null);
  readonly availableContexts = computed(() => this.sessionSignal()?.availableContexts ?? []);
  readonly permissions = computed(() => this.activeContext()?.permissions ?? []);
  readonly selectableBranchIds = computed(() => allowedBranchIds(this.activeContext()));
  readonly selectableWarehouseIds = computed(() => allowedWarehouseIds(this.activeContext()));

  applySession(snapshot: AuthSessionSnapshot | null): void {
    this.sessionSignal.set(snapshot);
  }

  clear(): void {
    this.sessionSignal.set(null);
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

  loadSession(): Observable<AuthSessionSnapshot> {
    if (this.sessionRequest !== null) {
      return this.sessionRequest;
    }
    const request = this.authApi.getSession().pipe(
      tap((snapshot) => this.sessionSignal.set(snapshot)),
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
      tap((snapshot) => this.sessionSignal.set(snapshot)),
    );
  }
}
