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
  'inventory.categories': { enabled: true },
  'inventory.categories.views.desktopCards': { enabled: true },
  'inventory.categories.fields.name': { visible: true, editable: true },
  'inventory.categories.fields.productClass': { visible: true, editable: true },
  'inventory.categories.fields.status': { visible: true, editable: false },
  'inventory.categories.features.trackingRequirementDisplay': { enabled: true },
  'inventory.categories.widgets.totalCategories': { visible: true },
  'inventory.categories.actions.create': { allowed: true },
  'inventory.categories.actions.inspect': { allowed: true },
  'inventory.categories.actions.edit': { allowed: true },
  'inventory.categories.actions.deactivate': { allowed: true },
  'inventory.categories.actions.reactivate': { allowed: true },
  'inventory.categories.actions.delete': { allowed: true },
  'inventory.stock': { enabled: true },
  'inventory.stock.views.desktopCards': { enabled: true },
  'inventory.stock.widgets.stockRecords': { visible: true },
  'inventory.stock.widgets.activeWarehouses': { visible: true },
  'inventory.stock.widgets.catalogProducts': { visible: true },
  'inventory.stock.widgets.expiringExpired': { visible: true },
  'inventory.stock.features.search': { enabled: true },
  'inventory.stock.features.warehouseFilter': { enabled: true },
  'inventory.stock.features.productFilter': { enabled: true },
  'inventory.stock.fields.product': { visible: true },
  'inventory.stock.fields.warehouse': { visible: true },
  'inventory.stock.fields.batch': { visible: true },
  'inventory.stock.fields.quantityBase': { visible: true },
  'inventory.stock.fields.wac': { visible: true },
  'inventory.stock.fields.inventoryValue': { visible: true },
  'inventory.stock.fields.status': { visible: true },
  'inventory.stock.features.identitySection': { enabled: true },
  'inventory.stock.features.quantitySection': { enabled: true },
  'inventory.stock.features.valuationSection': { enabled: true },
  'inventory.stock.features.trackingSection': { enabled: true },
  'inventory.stock.actions.inspect': { allowed: true },
  'inventory.openingStock': { enabled: true },
  'inventory.openingStock.features.moduleInfo': { enabled: true },
  'inventory.openingStock.features.productSearch': { enabled: true },
  'inventory.openingStock.fields.packagingUnit': { visible: true },
  'inventory.openingStock.fields.manufacturingDate': { visible: true },
  'inventory.openingStock.fields.warehouse': { visible: true },
  'inventory.openingStock.fields.product': { visible: true },
  'inventory.openingStock.fields.quantity': { visible: true },
  'inventory.openingStock.fields.inventoryValue': { visible: true },
  'inventory.openingStock.fields.batchExpiry': { visible: true },
  'inventory.openingStock.actions.post': { allowed: true },
  'inventory.openingStock.actions.viewStock': { allowed: true },
  'inventory.batches': { enabled: true },
  'inventory.batches.views.desktopCards': { enabled: true },
  'inventory.batches.features.moduleInfo': { enabled: true },
  'inventory.batches.widgets.totalBatches': { visible: true },
  'inventory.batches.widgets.expiringSoon': { visible: true },
  'inventory.batches.widgets.expired': { visible: true },
  'inventory.batches.widgets.warehouseProductSummary': { visible: true },
  'inventory.batches.features.search': { enabled: true },
  'inventory.batches.features.productFilter': { enabled: true },
  'inventory.batches.features.warehouseFilter': { enabled: true },
  'inventory.batches.fields.batchNumber': { visible: true },
  'inventory.batches.fields.product': { visible: true },
  'inventory.batches.fields.locations': { visible: true },
  'inventory.batches.fields.manufactureDate': { visible: true },
  'inventory.batches.fields.expiryDate': { visible: true },
  'inventory.batches.fields.firstReceived': { visible: true },
  'inventory.batches.fields.availableQuantity': { visible: true },
  'inventory.batches.fields.status': { visible: true },
  'inventory.batches.features.stockByLocation': { enabled: true },
  'inventory.batches.features.technicalDetails': { enabled: true },
  'inventory.batches.actions.inspect': { allowed: true },
  'inventory.batches.actions.viewProduct': { allowed: true },
  'inventory.batches.actions.viewStock': { allowed: true },
  'inventory.batches.actions.viewMovements': { allowed: true },
  'inventory.expiry': { enabled: true },
  'inventory.expiry.views.desktopCards': { enabled: true },
  'inventory.expiry.features.moduleInfo': { enabled: true },
  'inventory.expiry.widgets.totalRecords': { visible: true },
  'inventory.expiry.widgets.expiringSoon': { visible: true },
  'inventory.expiry.widgets.expired': { visible: true },
  'inventory.expiry.widgets.trackedProductsWarehouses': { visible: true },
  'inventory.expiry.features.search': { enabled: true },
  'inventory.expiry.features.productFilter': { enabled: true },
  'inventory.expiry.features.warehouseFilter': { enabled: true },
  'inventory.expiry.features.classificationFilter': { enabled: true },
  'inventory.expiry.fields.batchNumber': { visible: true },
  'inventory.expiry.fields.product': { visible: true },
  'inventory.expiry.fields.expiryDate': { visible: true },
  'inventory.expiry.fields.classification': { visible: true },
  'inventory.expiry.fields.warehouse': { visible: true },
  'inventory.expiry.fields.quantity': { visible: true },
  'inventory.expiry.features.timelineSection': { enabled: true },
  'inventory.expiry.features.quantitySection': { enabled: true },
  'inventory.expiry.features.technicalDetails': { enabled: true },
  'inventory.expiry.actions.inspect': { allowed: true },
  'inventory.expiry.actions.viewBatch': { allowed: true },
  'inventory.expiry.actions.viewProduct': { allowed: true },
  'inventory.expiry.actions.viewStock': { allowed: true },
  'inventory.expiry.actions.viewMovements': { allowed: true },
  'inventory.adjustments': { enabled: true },
  'inventory.adjustments.features.moduleInfo': { enabled: true },
  'inventory.adjustments.features.productSearch': { enabled: true },
  'inventory.adjustments.features.productContext': { enabled: true },
  'inventory.adjustments.features.stockContext': { enabled: true },
  'inventory.adjustments.features.guidance': { enabled: true },
  'inventory.adjustments.features.recentAdjustments': { enabled: true },
  'inventory.adjustments.features.serverPostingDate': { enabled: true },
  'inventory.adjustments.fields.warehouse': { visible: true },
  'inventory.adjustments.fields.product': { visible: true },
  'inventory.adjustments.fields.adjustmentType': { visible: true },
  'inventory.adjustments.fields.quantity': { visible: true },
  'inventory.adjustments.fields.reason': { visible: true },
  'inventory.adjustments.fields.batch': { visible: true },
  'inventory.adjustments.fields.direction': { visible: true },
  'inventory.adjustments.fields.inventoryValue': { visible: true },
  'inventory.adjustments.actions.post': { allowed: true },
  'inventory.adjustments.actions.reverse': { allowed: true },
  'inventory.adjustments.actions.viewStock': { allowed: true },
  'inventory.adjustments.actions.viewMovements': { allowed: true },
  'inventory.transfers': { enabled: true },
  'inventory.transfers.features.moduleInfo': { enabled: true },
  'inventory.transfers.features.productSearch': { enabled: true },
  'inventory.transfers.features.productContext': { enabled: true },
  'inventory.transfers.features.stockContext': { enabled: true },
  'inventory.transfers.features.guidance': { enabled: true },
  'inventory.transfers.features.recentTransfers': { enabled: true },
  'inventory.transfers.features.serverTransferDate': { enabled: true },
  'inventory.transfers.fields.sourceWarehouse': { visible: true },
  'inventory.transfers.fields.destinationWarehouse': { visible: true },
  'inventory.transfers.fields.product': { visible: true },
  'inventory.transfers.fields.quantity': { visible: true },
  'inventory.transfers.fields.reason': { visible: true },
  'inventory.transfers.fields.batch': { visible: true },
  'inventory.transfers.actions.post': { allowed: true },
  'inventory.transfers.actions.reverse': { allowed: true },
  'inventory.transfers.actions.inspect': { allowed: true },
  'inventory.transfers.actions.viewStock': { allowed: true },
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
        type:
          key === 'inventory.adjustments' || key === 'inventory.transfers'
            ? 'MODULE'
            : key.includes('.actions.')
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
