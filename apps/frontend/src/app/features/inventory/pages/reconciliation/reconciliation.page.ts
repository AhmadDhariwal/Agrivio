import { DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { catchError, forkJoin, of } from 'rxjs';
import { InventoryApi } from '../../data-access/inventory.api';
import { CatalogApi } from '../../../catalog/data-access/catalog.api';
import {
  BranchesWarehousesApi,
  WarehouseRecord,
} from '../../../branches-warehouses/data-access/branches-warehouses.api';
import { AuthSessionStore } from '../../../auth/data-access/auth-session.store';
import { UiAlertComponent } from '../../../../shared/ui/ui-alert/ui-alert.component';
import { UiLoadingStateComponent } from '../../../../shared/ui/ui-loading-state/ui-loading-state.component';
import { UiModuleInfoComponent } from '../../../../shared/ui/ui-module-info/ui-module-info.component';
import { ProductRecord } from '../../../catalog/models/catalog.models';
import { ProductBatchRecord } from '../../models/inventory.models';

export interface ReconciliationFindingItem {
  code: string;
  warehouseId?: string;
  productId?: string;
  batchId?: string | null;
  movementQuantityBaseMinorUnits?: string;
  balanceQuantityBaseMinorUnits?: string;
  costQuantityBaseMinorUnits?: string;
  costInventoryValueMinorUnits?: string;
  expectedInventoryValueMinorUnits?: string;
  [key: string]: unknown;
}

export type FindingCategory = 'all' | 'quantity' | 'integrity' | 'valuation';

export interface FindingCodeMeta {
  label: string;
  description: string;
  category: 'quantity' | 'integrity' | 'valuation';
  severity: 'danger' | 'warning';
}

export const FINDING_CODE_METADATA: Record<string, FindingCodeMeta> = {
  MOVEMENT_BALANCE_QUANTITY_MISMATCH: {
    label: 'Movement & Balance Mismatch',
    description: 'Sum of posted inventory movements does not match recorded balance quantity.',
    category: 'quantity',
    severity: 'danger',
  },
  UNSELLABLE_MOVEMENT_BALANCE_QUANTITY_MISMATCH: {
    label: 'Unsellable Movement Mismatch',
    description: 'Sum of unsellable stock movements does not match recorded unsellable balance quantity.',
    category: 'quantity',
    severity: 'danger',
  },
  COST_STATE_QUANTITY_MISMATCH: {
    label: 'Cost State Quantity Mismatch',
    description: 'Total quantity across balances does not equal the recorded cost state base quantity.',
    category: 'quantity',
    severity: 'danger',
  },
  MOVEMENT_WITHOUT_BALANCE: {
    label: 'Movement Without Balance',
    description: 'Posted stock movements exist without a corresponding inventory balance row.',
    category: 'integrity',
    severity: 'warning',
  },
  UNSELLABLE_MOVEMENT_WITHOUT_BALANCE: {
    label: 'Unsellable Movement Without Balance',
    description: 'Unsellable movements exist without a corresponding balance record.',
    category: 'integrity',
    severity: 'warning',
  },
  BALANCE_WITHOUT_COST_STATE: {
    label: 'Balance Without Cost State',
    description: 'Inventory balance exists with non-zero stock but has no corresponding cost state.',
    category: 'integrity',
    severity: 'warning',
  },
  COST_STATE_VALUE_WITHOUT_QUANTITY: {
    label: 'Cost Value Without Quantity',
    description: 'Monetary inventory value is recorded in cost state while quantity is zero.',
    category: 'valuation',
    severity: 'danger',
  },
  COST_STATE_NEGATIVE_VALUE: {
    label: 'Negative Inventory Valuation',
    description: 'Cost state contains an invalid negative inventory valuation.',
    category: 'valuation',
    severity: 'danger',
  },
  COST_STATE_VALUATION_MISMATCH: {
    label: 'Valuation & WAC Mismatch',
    description: 'Total inventory value deviates from Weighted Average Cost multiplied by quantity.',
    category: 'valuation',
    severity: 'warning',
  },
};

@Component({
  selector: 'agrivio-reconciliation-page',
  standalone: true,
  imports: [
    DatePipe,
    RouterLink,
    UiAlertComponent,
    UiLoadingStateComponent,
    UiModuleInfoComponent,
  ],
  templateUrl: './reconciliation.page.html',
  styleUrl: './reconciliation.page.scss',
})
export class ReconciliationPage {
  private readonly inventoryApi = inject(InventoryApi);
  private readonly catalogApi = inject(CatalogApi);
  private readonly locationsApi = inject(BranchesWarehousesApi);
  private readonly sessionStore = inject(AuthSessionStore);

  // State Signals
  readonly loading = signal<boolean>(true);
  readonly errorMessage = signal<string | null>(null);
  readonly lastCheckedAt = signal<Date | null>(null);
  readonly isOk = signal<boolean>(true);
  readonly findings = signal<ReconciliationFindingItem[]>([]);
  readonly selectedFinding = signal<ReconciliationFindingItem | null>(null);

  // Filter Signals
  readonly activeCategory = signal<FindingCategory>('all');
  readonly search = signal<string>('');
  readonly warehouseFilter = signal<string>('');
  readonly findingCodeFilter = signal<string>('');

  // Pagination Signals
  readonly page = signal<number>(1);
  readonly pageSize = signal<number>(25);

  // Reference Maps (Deduplicated, O(1) Cached Lookup)
  readonly productMap = signal<Map<string, ProductRecord>>(new Map());
  readonly warehouseMap = signal<Map<string, WarehouseRecord>>(new Map());
  readonly batchMap = signal<Map<string, ProductBatchRecord>>(new Map());
  readonly warehouseList = signal<WarehouseRecord[]>([]);

  // Permissions & Organization Visibility Computeds
  readonly canView = computed(() => this.sessionStore.hasPermission('inventory.view'));
  readonly canViewStock = computed(() => this.sessionStore.hasPermission('inventory.view'));
  readonly canViewBatches = computed(() => this.sessionStore.hasPermission('inventory.view'));
  readonly canViewMovements = computed(() => this.sessionStore.hasPermission('inventory.view'));
  readonly canViewExpiry = computed(() => this.sessionStore.hasPermission('inventory.view'));

  // Module Info Content
  readonly infoTitle = 'About Inventory Reconciliation';
  readonly infoDescription =
    'Reconciliation compares recorded stock balances, posted movements, and cost state invariants to detect data divergence.';
  readonly infoItems = [
    'Reconciliation compares authoritative movement sums with inventory balance quantities.',
    'Cost state valuation is cross-checked against weighted average cost and physical lot balances.',
    'Findings are integrity alerts requiring operational review — inventory valuation remains backend-controlled.',
    'Integrity checks do not fabricate or alter inventory balances.',
  ];

  // Authoritative KPIs based on Backend Truth
  readonly kpiTotalFindings = computed(() => this.findings().length);

  readonly kpiQuantityIssues = computed(
    () =>
      this.findings().filter((f) => {
        const meta = FINDING_CODE_METADATA[f.code];
        return meta?.category === 'quantity';
      }).length,
  );

  readonly kpiIntegrityIssues = computed(
    () =>
      this.findings().filter((f) => {
        const meta = FINDING_CODE_METADATA[f.code];
        return meta?.category === 'integrity';
      }).length,
  );

  readonly kpiValuationIssues = computed(
    () =>
      this.findings().filter((f) => {
        const meta = FINDING_CODE_METADATA[f.code];
        return meta?.category === 'valuation';
      }).length,
  );

  // Available Finding Codes for Dropdown
  readonly availableFindingCodes = computed(() => {
    const codes = new Set<string>();
    for (const f of this.findings()) {
      if (f.code) codes.add(f.code);
    }
    return Array.from(codes);
  });

  // Filtered Findings
  readonly filteredFindings = computed(() => {
    const all = this.findings();
    const cat = this.activeCategory();
    const query = this.search().trim().toLowerCase();
    const whId = this.warehouseFilter();
    const code = this.findingCodeFilter();
    const prodMap = this.productMap();
    const whMap = this.warehouseMap();
    const bMap = this.batchMap();

    return all.filter((item) => {
      // Category filter
      if (cat !== 'all') {
        const meta = FINDING_CODE_METADATA[item.code];
        if (meta?.category !== cat) return false;
      }

      // Warehouse filter
      if (whId && item.warehouseId !== whId) {
        return false;
      }

      // Finding code filter
      if (code && item.code !== code) {
        return false;
      }

      // Search filter
      if (query) {
        const prod = item.productId ? prodMap.get(item.productId) : null;
        const prodName = prod?.name?.toLowerCase() ?? '';
        const sku = prod?.sku?.toLowerCase() ?? '';
        const prodId = (item.productId ?? '').toLowerCase();
        const wh = item.warehouseId ? whMap.get(item.warehouseId) : null;
        const whName = wh?.name?.toLowerCase() ?? '';
        const whCode = wh?.code?.toLowerCase() ?? '';
        const whId = (item.warehouseId ?? '').toLowerCase();
        const batch = item.batchId ? bMap.get(item.batchId) : null;
        const batchNum = (batch?.batchNumber || item.batchId || '').toLowerCase();
        const codeLabel = (FINDING_CODE_METADATA[item.code]?.label || item.code).toLowerCase();

        const match =
          prodName.includes(query) ||
          sku.includes(query) ||
          prodId.includes(query) ||
          whName.includes(query) ||
          whCode.includes(query) ||
          whId.includes(query) ||
          batchNum.includes(query) ||
          codeLabel.includes(query) ||
          item.code.toLowerCase().includes(query);

        if (!match) return false;
      }

      return true;
    });
  });

  // Active filters count
  readonly hasActiveFilters = computed(() => {
    return (
      this.activeCategory() !== 'all' ||
      this.search().trim().length > 0 ||
      this.warehouseFilter().length > 0 ||
      this.findingCodeFilter().length > 0
    );
  });

  readonly activeFiltersCount = computed(() => {
    let count = 0;
    if (this.activeCategory() !== 'all') count++;
    if (this.search().trim().length > 0) count++;
    if (this.warehouseFilter().length > 0) count++;
    if (this.findingCodeFilter().length > 0) count++;
    return count;
  });

  // Pagination Computeds
  readonly totalFiltered = computed(() => this.filteredFindings().length);

  readonly totalPages = computed(() => {
    const total = this.totalFiltered();
    const size = this.pageSize();
    return Math.max(1, Math.ceil(total / size));
  });

  readonly paginatedFindings = computed(() => {
    const list = this.filteredFindings();
    const p = this.page();
    const size = this.pageSize();
    const start = (p - 1) * size;
    return list.slice(start, start + size);
  });

  readonly paginationStart = computed(() => {
    const total = this.totalFiltered();
    if (total === 0) return 0;
    return (this.page() - 1) * this.pageSize() + 1;
  });

  readonly paginationEnd = computed(() => {
    const total = this.totalFiltered();
    return Math.min(this.page() * this.pageSize(), total);
  });

  constructor() {
    this.reload();
  }

  reload(): void {
    if (!this.canView()) {
      this.loading.set(false);
      return;
    }

    this.loading.set(true);
    this.errorMessage.set(null);

    const requests = {
      recon: this.inventoryApi.reconcileInventory(),
      products: this.catalogApi
        .searchProductOptions('', 500)
        .pipe(catchError(() => of([] as ProductRecord[]))),
      warehouses: this.locationsApi
        .listWarehouseOptions()
        .pipe(catchError(() => of([] as WarehouseRecord[]))),
      batches: this.inventoryApi
        .listBatches({ page: 1, pageSize: 200 })
        .pipe(
          catchError(() => of({ items: [] as ProductBatchRecord[], meta: { page: 1, pageSize: 200, total: 0 } })),
        ),
    };

    forkJoin(requests).subscribe({
      next: ({ recon, products, warehouses, batches }) => {
        this.lastCheckedAt.set(new Date());
        this.isOk.set(recon.ok === true && (!recon.findings || recon.findings.length === 0));
        this.findings.set((recon.findings as ReconciliationFindingItem[]) || []);

        // Populate O(1) Lookup Maps
        const prodMap = new Map<string, ProductRecord>();
        for (const p of products) {
          const id = p.id || (p as unknown as { _id?: string })._id;
          if (id) prodMap.set(id, p);
        }
        this.productMap.set(prodMap);

        const whMap = new Map<string, WarehouseRecord>();
        for (const w of warehouses) {
          const id = w.id || (w as unknown as { _id?: string })._id;
          if (id) whMap.set(id, w);
        }
        this.warehouseMap.set(whMap);
        this.warehouseList.set(warehouses);

        const bMap = new Map<string, ProductBatchRecord>();
        for (const b of batches.items) {
          const id = b.id || (b as unknown as { _id?: string })._id;
          if (id) bMap.set(id, b);
        }
        this.batchMap.set(bMap);

        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.errorMessage.set('Unable to load inventory reconciliation. Please try again.');
      },
    });
  }

  // Filter Actions
  setCategory(category: FindingCategory): void {
    this.activeCategory.set(category);
    this.page.set(1);
  }

  onSearch(event: Event): void {
    const val = (event.target as HTMLInputElement).value;
    this.search.set(val);
    this.page.set(1);
  }

  onSearchClear(): void {
    this.search.set('');
    this.page.set(1);
  }

  onWarehouseChange(event: Event): void {
    const val = (event.target as HTMLSelectElement).value;
    this.warehouseFilter.set(val);
    this.page.set(1);
  }

  onFindingCodeChange(event: Event): void {
    const val = (event.target as HTMLSelectElement).value;
    this.findingCodeFilter.set(val);
    this.page.set(1);
  }

  clearFilters(): void {
    this.activeCategory.set('all');
    this.search.set('');
    this.warehouseFilter.set('');
    this.findingCodeFilter.set('');
    this.page.set(1);
  }

  // Pagination Actions
  onPageChange(newPage: number): void {
    if (newPage >= 1 && newPage <= this.totalPages()) {
      this.page.set(newPage);
    }
  }

  onPageSizeChange(event: Event): void {
    const newSize = Number((event.target as HTMLSelectElement).value);
    this.pageSize.set(newSize);
    this.page.set(1);
  }

  // Inspector Drawer Actions
  openInspector(finding: ReconciliationFindingItem): void {
    this.selectedFinding.set(finding);
  }

  closeInspector(): void {
    this.selectedFinding.set(null);
  }

  // Helper Resolution Methods
  productName(productId?: string): string {
    if (!productId) return 'Unknown Product';
    return this.productMap().get(productId)?.name ?? `Product (${productId})`;
  }

  productSku(productId?: string): string {
    if (!productId) return '—';
    return this.productMap().get(productId)?.sku ?? '—';
  }

  productBaseUnit(productId?: string): string {
    if (!productId) return '';
    return this.productMap().get(productId)?.baseUnitCode ?? '';
  }

  warehouseName(warehouseId?: string): string {
    if (!warehouseId) return 'All Warehouses / Unassigned';
    return this.warehouseMap().get(warehouseId)?.name ?? `Warehouse (${warehouseId})`;
  }

  batchNumber(batchId?: string | null): string {
    if (!batchId) return 'Standard (No Batch)';
    return this.batchMap().get(batchId)?.batchNumber ?? batchId;
  }

  findingMeta(code: string): FindingCodeMeta {
    return (
      FINDING_CODE_METADATA[code] ?? {
        label: code,
        description: 'Uncategorized reconciliation finding code.',
        category: 'integrity',
        severity: 'warning',
      }
    );
  }

  // Quantity and Valuation Formatters (Factor 10,000 for quantity, Factor 100 for Money)
  formatQuantity(minorUnits?: string | null): string {
    if (minorUnits === null || minorUnits === undefined || minorUnits === '') {
      return '—';
    }
    try {
      const val = BigInt(minorUnits);
      const negative = val < 0n;
      const abs = negative ? -val : val;
      const whole = abs / 10000n;
      const frac = (abs % 10000n).toString().padStart(4, '0');
      return `${negative ? '-' : ''}${whole}.${frac}`;
    } catch {
      return String(minorUnits);
    }
  }

  formatMoney(minorUnits?: string | null): string {
    if (minorUnits === null || minorUnits === undefined || minorUnits === '') {
      return '—';
    }
    try {
      const val = BigInt(minorUnits);
      const negative = val < 0n;
      const abs = negative ? -val : val;
      const whole = abs / 100n;
      const frac = (abs % 100n).toString().padStart(2, '0');
      return `${negative ? '-' : ''}${whole}.${frac} PKR`;
    } catch {
      return `${minorUnits} PKR`;
    }
  }

  /**
   * Display helper only: Calculates difference between recorded balance and movements / cost state.
   * Not a business validator.
   */
  getFindingDifference(finding: ReconciliationFindingItem): string | null {
    try {
      if (
        finding.balanceQuantityBaseMinorUnits !== undefined &&
        finding.movementQuantityBaseMinorUnits !== undefined
      ) {
        const bal = BigInt(finding.balanceQuantityBaseMinorUnits);
        const mov = BigInt(finding.movementQuantityBaseMinorUnits);
        const diff = bal - mov;
        return this.formatQuantity(diff.toString());
      }
      if (
        finding.balanceQuantityBaseMinorUnits !== undefined &&
        finding.costQuantityBaseMinorUnits !== undefined
      ) {
        const bal = BigInt(finding.balanceQuantityBaseMinorUnits);
        const cost = BigInt(finding.costQuantityBaseMinorUnits);
        const diff = bal - cost;
        return this.formatQuantity(diff.toString());
      }
    } catch {
      return null;
    }
    return null;
  }
}
