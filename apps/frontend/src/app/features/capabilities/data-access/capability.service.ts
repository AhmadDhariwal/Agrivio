import { Injectable, Injector, computed, inject, signal } from '@angular/core';
import { Observable, finalize, of, shareReplay, tap } from 'rxjs';
import { AuthSessionStore } from '../../auth/data-access/auth-session.store';
import { CapabilitiesApi } from './capabilities.api';
import { EffectiveCapabilitiesSnapshot } from '../models/capability.models';

const CURRENT_BEHAVIOR_DEFAULTS: Readonly<Record<string, Readonly<Record<string, boolean>>>> = {
  'inventory.products': { enabled: true },
  'inventory.products.views.table': { enabled: true },
  'inventory.products.views.desktopCards': { enabled: true },
  'inventory.products.fields.productName': { visible: true, editable: true },
  'inventory.products.fields.sku': { visible: true, editable: true },
  'inventory.products.fields.category': { visible: true, editable: true },
  'inventory.products.fields.trackingMode': { visible: true, editable: true },
  'inventory.products.fields.baseUnit': { visible: true, editable: true },
  'inventory.products.fields.measurementDimension': { visible: true, editable: true },
  'inventory.products.fields.sellingPrice': { visible: true, editable: true },
  'inventory.products.fields.status': { visible: true, editable: false },
  'inventory.products.widgets.totalProducts': { visible: true },
  'inventory.products.widgets.activeProducts': { visible: true },
  'inventory.products.widgets.lowStock': { visible: true },
  'inventory.products.widgets.trackedItems': { visible: true },
  'inventory.products.actions.create': { allowed: true },
  'inventory.products.actions.inspect': { allowed: true },
  'inventory.products.actions.edit': { allowed: true },
  'inventory.products.actions.managePricing': { allowed: true },
  'inventory.products.actions.deactivate': { allowed: true },
  'inventory.products.actions.reactivate': { allowed: true },
  'inventory.products.actions.delete': { allowed: true },
};

@Injectable({ providedIn: 'root' })
export class CapabilityService {
  private readonly injector = inject(Injector);
  private readonly sessionStore = inject(AuthSessionStore);
  private readonly snapshotSignal = signal<EffectiveCapabilitiesSnapshot | null>(null);
  private readonly loadAttemptedSignal = signal(false);
  private activeRequest: Observable<EffectiveCapabilitiesSnapshot> | null = null;

  readonly snapshot = this.snapshotSignal.asReadonly();
  readonly version = computed(() => this.snapshotSignal()?.version ?? 0);
  readonly loadFailed = computed(
    () => this.loadAttemptedSignal() && this.snapshotSignal() === null,
  );

  clear(): void {
    this.snapshotSignal.set(null);
    this.loadAttemptedSignal.set(false);
    this.activeRequest = null;
  }

  ensureLoaded(): Observable<EffectiveCapabilitiesSnapshot | null> {
    const organizationId = this.sessionStore.activeContext()?.organizationId;
    const current = this.snapshotSignal();
    if (current !== null && current.organizationId === organizationId) {
      return of(current);
    }
    if (!organizationId) {
      this.clear();
      return of(null);
    }
    return this.refresh();
  }

  refresh(): Observable<EffectiveCapabilitiesSnapshot> {
    if (this.activeRequest !== null) {
      return this.activeRequest;
    }
    this.loadAttemptedSignal.set(true);
    let api: CapabilitiesApi;
    try {
      api = this.injector.get(CapabilitiesApi);
    } catch {
      const snapshot = this.currentBehaviorSnapshot();
      this.snapshotSignal.set(snapshot);
      return of(snapshot);
    }
    const request = api.getCurrent().pipe(
      tap({
        next: (snapshot) => this.snapshotSignal.set(snapshot),
        error: () => this.snapshotSignal.set(null),
      }),
      finalize(() => {
        this.activeRequest = null;
      }),
      shareReplay({ bufferSize: 1, refCount: false }),
    );
    this.activeRequest = request;
    return request;
  }

  canUseModule(key: string): boolean {
    return this.value(key, 'enabled');
  }

  canUseView(key: string): boolean {
    return this.value(key, 'enabled');
  }

  canShowWidget(key: string): boolean {
    return this.value(key, 'visible');
  }

  canViewField(key: string): boolean {
    return this.value(key, 'visible');
  }

  canEditField(key: string): boolean {
    return this.value(key, 'editable');
  }

  canPerformAction(key: string): boolean {
    return this.value(key, 'allowed');
  }

  private value(key: string, mode: string): boolean {
    const snapshot = this.snapshotSignal();
    if (snapshot !== null) {
      return snapshot.controls.find((control) => control.key === key)?.value[mode] === true;
    }
    if (this.loadAttemptedSignal()) {
      return false;
    }
    return CURRENT_BEHAVIOR_DEFAULTS[key]?.[mode] === true;
  }

  private currentBehaviorSnapshot(): EffectiveCapabilitiesSnapshot {
    return {
      organizationId: this.sessionStore.activeContext()?.organizationId ?? 'test-organization',
      version: 0,
      controls: Object.entries(CURRENT_BEHAVIOR_DEFAULTS).map(([key, value]) => ({
        key,
        type: key.includes('.actions.')
          ? 'ACTION'
          : key.includes('.widgets.')
            ? 'WIDGET'
            : key.includes('.fields.')
              ? 'FIELD'
              : key.includes('.views.')
                ? 'VIEW'
                : 'FEATURE',
        value,
        reasons: [],
      })),
    };
  }
}
