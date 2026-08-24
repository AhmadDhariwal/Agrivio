import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { Observable } from 'rxjs';
import { CapabilitiesApi } from '../../../capabilities/data-access/capabilities.api';
import {
  CapabilityControlType,
  CapabilityPolicyChange,
  PlatformCapabilityControl,
  PlatformOrganizationCapabilitySnapshot,
} from '../../../capabilities/models/capability.models';
import { UiAlertComponent } from '../../../../shared/ui/ui-alert/ui-alert.component';
import { UiConfirmDialogComponent } from '../../../../shared/ui/ui-confirm-dialog/ui-confirm-dialog.component';
import { UiLoadingStateComponent } from '../../../../shared/ui/ui-loading-state/ui-loading-state.component';
import { UiPageHeaderComponent } from '../../../../shared/ui/ui-page-header/ui-page-header.component';

type DraftValues = Readonly<Record<string, Readonly<Record<string, boolean>>>>;
type ConfigurableModule =
  | 'inventory.products'
  | 'inventory.categories'
  | 'inventory.stock'
  | 'inventory.openingStock'
  | 'inventory.batches'
  | 'inventory.expiry'
  | 'inventory.adjustments'
  | 'inventory.transfers'
  | 'inventory.reconciliation'
  | 'inventory.movements';
type PendingConfirmation =
  | { readonly kind: 'save' }
  | { readonly kind: 'reset-control'; readonly control: PlatformCapabilityControl }
  | { readonly kind: 'reset-module'; readonly moduleKey: ConfigurableModule }
  | { readonly kind: 'reset-organization' };

@Component({
  selector: 'agrivio-organization-controls-page',
  standalone: true,
  imports: [
    FormsModule,
    RouterLink,
    UiAlertComponent,
    UiConfirmDialogComponent,
    UiLoadingStateComponent,
    UiPageHeaderComponent,
  ],
  templateUrl: './organization-controls.page.html',
  styleUrl: './organization-controls.page.scss',
})
export class OrganizationControlsPage {
  private readonly api = inject(CapabilitiesApi);
  private readonly route = inject(ActivatedRoute);
  readonly organizationId = String(this.route.snapshot.paramMap.get('id') ?? '');

  readonly snapshot = signal<PlatformOrganizationCapabilitySnapshot | null>(null);
  readonly draftValues = signal<DraftValues>({});
  readonly selectedModule = signal<ConfigurableModule>('inventory.products');
  readonly search = signal('');
  readonly reason = signal('');
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly successMessage = signal<string | null>(null);
  readonly pendingConfirmation = signal<PendingConfirmation | null>(null);

  readonly controls = computed(() => this.snapshot()?.policy.controls ?? []);
  readonly selectedControls = computed(() => {
    const query = this.search().trim().toLowerCase();
    return this.controls().filter(
      (control) =>
        control.moduleKey === this.selectedModule() &&
        control.key !== 'inventory' &&
        (!query ||
          control.label.toLowerCase().includes(query) ||
          control.key.toLowerCase().includes(query)),
    );
  });
  readonly moduleControls = computed(() =>
    this.selectedControls().filter(
      (control) =>
        (control.type === 'FEATURE' || control.type === 'MODULE') &&
        control.key === control.moduleKey,
    ),
  );
  readonly viewControls = computed(() => this.byType('VIEW'));
  readonly fieldControls = computed(() =>
    this.byType('FIELD').filter((control) => !this.isRequiredWorkflowControl(control)),
  );
  readonly requiredWorkflowControls = computed(() =>
    this.byType('FIELD').filter((control) => this.isRequiredWorkflowControl(control)),
  );
  readonly featureControls = computed(() =>
    this.byType('FEATURE', false).filter((control) => !this.isBatchGroupedFeature(control)),
  );
  readonly moduleInfoControls = computed(() => {
    if (this.selectedModule() === 'inventory.movements') {
      return this.movementsFeatures('moduleInfo');
    }
    if (this.selectedModule() === 'inventory.reconciliation') {
      return this.reconciliationFeatures('moduleInfo');
    }
    if (this.selectedModule() === 'inventory.transfers') {
      return this.transfersFeatures('moduleInfo');
    }
    if (this.selectedModule() === 'inventory.adjustments') {
      return this.adjustmentsFeatures('moduleInfo');
    }
    return this.batchFeatures('moduleInfo');
  });
  readonly presentationFeatureControls = computed(() => {
    if (this.selectedModule() === 'inventory.movements') {
      return this.movementsFeatures(
        'search',
        'filters',
        'kpiCards',
        'referenceResolution',
        'inspector',
        'technicalDetails',
        'mobileCards',
      );
    }
    return [];
  });
  readonly formExperienceControls = computed(() => {
    if (this.selectedModule() === 'inventory.transfers') {
      return this.transfersFeatures(
        'productSearch',
        'productContext',
        'stockContext',
        'guidance',
        'serverTransferDate',
      );
    }
    if (this.selectedModule() === 'inventory.adjustments') {
      return this.adjustmentsFeatures(
        'productSearch',
        'productContext',
        'stockContext',
        'guidance',
        'serverPostingDate',
      );
    }
    return [];
  });
  readonly historyControls = computed(() => {
    if (this.selectedModule() === 'inventory.transfers') {
      return this.transfersFeatures('recentTransfers');
    }
    if (this.selectedModule() === 'inventory.adjustments') {
      return this.adjustmentsFeatures('recentAdjustments');
    }
    return [];
  });
  readonly filterControls = computed(() => {
    if (this.selectedModule() === 'inventory.reconciliation') {
      return this.reconciliationFeatures('search', 'warehouseFilter', 'findingFilter');
    }
    if (this.selectedModule() === 'inventory.expiry') {
      return this.batchFeatures('search', 'productFilter', 'warehouseFilter', 'classificationFilter');
    }
    if (this.selectedModule() === 'inventory.batches') {
      return this.batchFeatures('search', 'productFilter', 'warehouseFilter');
    }
    return [];
  });
  readonly kpiControls = computed(() => {
    if (this.selectedModule() === 'inventory.reconciliation') {
      return this.reconciliationFeatures('kpiCards');
    }
    return [];
  });
  readonly inspectorControls = computed(() => {
    if (this.selectedModule() === 'inventory.reconciliation') {
      return this.reconciliationFeatures('inspector', 'technicalDetails');
    }
    if (this.selectedModule() === 'inventory.expiry') {
      return this.batchFeatures('timelineSection', 'quantitySection', 'technicalDetails');
    }
    if (this.selectedModule() === 'inventory.batches') {
      return this.batchFeatures('stockByLocation', 'technicalDetails');
    }
    return [];
  });
  readonly widgetControls = computed(() => this.byType('WIDGET'));
  readonly actionControls = computed(() => this.byType('ACTION'));

  readonly changes = computed<readonly CapabilityPolicyChange[]>(() => {
    const draft = this.draftValues();
    const changes: CapabilityPolicyChange[] = [];
    for (const control of this.controls()) {
      const next = draft[control.key];
      if (next === undefined) continue;
      const changedValue: Record<string, boolean> = {};
      for (const [mode, value] of Object.entries(next)) {
        if (value !== control.configuredValue[mode]) changedValue[mode] = value;
      }
      if (Object.keys(changedValue).length > 0) {
        changes.push({ key: control.key, value: changedValue });
      }
    }
    return changes;
  });

  readonly changeSummary = computed(() =>
    this.changes().flatMap((change) => {
      const control = this.controls().find((item) => item.key === change.key);
      return Object.entries(change.value ?? {}).map(([mode, value]) => ({
        key: `${change.key}.${mode}`,
        label: control?.label ?? change.key,
        before: this.stateLabel(mode, control?.configuredValue[mode] === true),
        after: this.stateLabel(mode, value),
        risk: control?.risk ?? 'NORMAL',
      }));
    }),
  );
  readonly selectedOverrideCount = computed(
    () =>
      this.controls().filter(
        (control) => control.moduleKey === this.selectedModule() && control.override !== null,
      ).length,
  );
  readonly organizationOverrideCount = computed(
    () => this.controls().filter((control) => control.override !== null).length,
  );
  readonly confirmOpen = computed(() => this.pendingConfirmation() !== null);
  readonly disablingOpeningStock = computed(() => {
    const changes = this.changes();
    return (
      changes.length === 1 &&
      changes[0]?.key === 'inventory.openingStock' &&
      changes[0].value?.['enabled'] === false
    );
  });
  readonly disablingBatches = computed(() => {
    const changes = this.changes();
    return (
      changes.length === 1 &&
      changes[0]?.key === 'inventory.batches' &&
      changes[0].value?.['enabled'] === false
    );
  });
  readonly disablingExpiry = computed(() => {
    const changes = this.changes();
    return (
      changes.length === 1 &&
      changes[0]?.key === 'inventory.expiry' &&
      changes[0].value?.['enabled'] === false
    );
  });
  readonly disablingAdjustments = computed(() => {
    const changes = this.changes();
    return (
      changes.length === 1 &&
      changes[0]?.key === 'inventory.adjustments' &&
      changes[0].value?.['enabled'] === false
    );
  });
  readonly disablingTransfers = computed(() => {
    const changes = this.changes();
    return (
      changes.length === 1 &&
      changes[0]?.key === 'inventory.transfers' &&
      changes[0].value?.['enabled'] === false
    );
  });
  readonly disablingReconciliation = computed(() => {
    const changes = this.changes();
    return (
      changes.length === 1 &&
      changes[0]?.key === 'inventory.reconciliation' &&
      changes[0].value?.['enabled'] === false
    );
  });
  readonly disablingMovements = computed(() => {
    const changes = this.changes();
    return (
      changes.length === 1 &&
      changes[0]?.key === 'inventory.movements' &&
      changes[0].value?.['enabled'] === false
    );
  });
  readonly confirmationTitle = computed(() => {
    const pending = this.pendingConfirmation();
    const organization = this.snapshot()?.organization.name ?? 'this organization';
    if (pending?.kind === 'reset-control') return `Reset “${pending.control.label}”?`;
    if (pending?.kind === 'reset-module') {
      return `Reset ${this.moduleLabel(pending.moduleKey)} controls for ${organization}?`;
    }
    if (pending?.kind === 'reset-organization') return `Reset all controls for ${organization}?`;
    if (this.disablingOpeningStock()) return `Disable Opening Stock for ${organization}?`;
    if (this.disablingBatches()) return `Disable Product Batches for ${organization}?`;
    if (this.disablingExpiry()) return `Disable Expiry Inquiry for ${organization}?`;
    if (this.disablingAdjustments()) return `Disable Stock Adjustments for ${organization}?`;
    if (this.disablingTransfers()) return `Disable Warehouse Transfers for ${organization}?`;
    if (this.disablingReconciliation()) {
      return `Disable Inventory Reconciliation for ${organization}?`;
    }
    if (this.disablingMovements()) {
      return `Disable Stock Movements for ${organization}?`;
    }
    const single = this.changeSummary().length === 1 ? this.changeSummary()[0] : null;
    if (single?.risk === 'CRITICAL' && single.after === 'Disabled') {
      return `Disable ${single.label} for ${organization}?`;
    }
    return `Apply ${this.changeSummary().length} changes to ${organization}?`;
  });
  readonly confirmationMessage = computed(() => {
    const pending = this.pendingConfirmation();
    const organization = this.snapshot()?.organization.name ?? 'this organization';
    if (pending?.kind === 'reset-control') {
      return `The organization-specific override will be removed and Agrivio's default behavior will apply. This affects ${organization} only.`;
    }
    if (pending?.kind === 'reset-module') {
      return `${this.selectedOverrideCount()} organization-specific override(s) in ${this.moduleLabel(pending.moduleKey)} will be removed. Existing organization data is unchanged.`;
    }
    if (pending?.kind === 'reset-organization') {
      return `${this.organizationOverrideCount()} organization-specific override(s) will be removed. Agrivio defaults, subscription, RBAC, and platform rules will apply. Organization data is unchanged.`;
    }
    if (this.disablingOpeningStock()) {
      return `Users in this organization will no longer be able to access or post Opening Stock. Existing stock and historical transactions will not be changed.`;
    }
    if (this.disablingBatches()) {
      return `Users in ${organization} will no longer be able to access Product Batches or its organization Batch inquiry APIs. Existing batches, stock balances, and transaction history will not be deleted or changed. This affects ${organization} only.`;
    }
    if (this.disablingExpiry()) {
      return `Users in ${organization} will no longer be able to access the Expiry Inquiry. Existing batches, expiry information, and stock are not modified. This affects ${organization} only.`;
    }
    if (this.disablingAdjustments()) {
      return `Users in this organization will no longer be able to access or use Stock Adjustments. Existing adjustments, stock movements and inventory balances are not deleted or modified.`;
    }
    if (this.disablingTransfers()) {
      return `Users in this organization will no longer be able to access or use Warehouse Transfers. Existing transfers, stock movements, batches and inventory balances are not deleted or modified.`;
    }
    if (this.disablingReconciliation()) {
      return `Users in this organization will no longer be able to access reconciliation checks. Existing inventory records, movements, balances and cost data are not modified.`;
    }
    if (this.disablingMovements()) {
      return `Users in this organization will no longer be able to access Stock Movements. Existing movement history and inventory records are not modified.`;
    }
    const critical = this.changeSummary()
      .filter((change) => change.risk === 'CRITICAL')
      .map((change) => `${change.label}: ${change.before} → ${change.after}`);
    return critical.length > 0
      ? `Critical impact: ${critical.join('; ')}. Changes affect all users in ${organization} only. Existing records are not deleted.`
      : `Changes affect all users in ${organization} only. Permissions, subscription limits, and lifecycle protections remain enforced.`;
  });
  readonly confirmationLabel = computed(() => {
    const pending = this.pendingConfirmation();
    if (pending?.kind === 'reset-control') return 'Reset control';
    if (pending?.kind === 'reset-module') return `Reset ${this.moduleLabel(pending.moduleKey)}`;
    if (pending?.kind === 'reset-organization') return 'Reset all controls';
    if (this.disablingOpeningStock()) return 'Disable Opening Stock';
    if (this.disablingBatches()) return 'Disable Product Batches';
    if (this.disablingExpiry()) return 'Disable Expiry Inquiry';
    if (this.disablingAdjustments()) return 'Disable Stock Adjustments';
    if (this.disablingTransfers()) return 'Disable Warehouse Transfers';
    if (this.disablingReconciliation()) return 'Disable Inventory Reconciliation';
    if (this.disablingMovements()) return 'Disable Stock Movements';
    return 'Apply changes';
  });

  constructor() {
    this.reload();
  }

  reload(): void {
    this.loading.set(true);
    this.errorMessage.set(null);
    this.api.getOrganizationPolicy(this.organizationId).subscribe({
      next: (snapshot) => {
        this.snapshot.set(snapshot);
        this.draftValues.set(
          Object.fromEntries(
            snapshot.policy.controls.map((control) => [
              control.key,
              { ...control.configuredValue },
            ]),
          ),
        );
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.loading.set(false);
        this.errorMessage.set(this.mapError(error));
      },
    });
  }

  selectModule(moduleKey: ConfigurableModule): void {
    this.selectedModule.set(moduleKey);
    this.search.set('');
  }

  modes(control: PlatformCapabilityControl): readonly string[] {
    return Object.keys(control.defaultPolicy);
  }

  value(control: PlatformCapabilityControl, mode: string): boolean {
    return this.draftValues()[control.key]?.[mode] === true;
  }

  isConfigurable(control: PlatformCapabilityControl, mode: string): boolean {
    return control.configurable[mode] === true;
  }

  parentDisabled(control: PlatformCapabilityControl): boolean {
    return (
      control.key !== control.moduleKey &&
      this.draftValues()[control.moduleKey]?.['enabled'] === false
    );
  }

  effectiveValue(control: PlatformCapabilityControl, mode: string): boolean {
    if (
      this.parentDisabled(control) ||
      this.dependencyBlockReason(control) !== null ||
      this.snapshot()?.policy.operationalAllowed === false
    ) {
      return false;
    }
    if (control.type === 'FIELD' && mode === 'editable') {
      return this.value(control, 'visible') && this.value(control, mode);
    }
    return this.value(control, mode);
  }

  effectiveReason(control: PlatformCapabilityControl, mode: string): string | null {
    if (this.snapshot()?.policy.operationalAllowed === false) {
      return 'Unavailable on the current subscription state.';
    }
    if (this.parentDisabled(control)) {
      return `${this.moduleLabel(control.moduleKey as ConfigurableModule)} is disabled.`;
    }
    const dependencyReason = this.dependencyBlockReason(control);
    if (dependencyReason !== null) return dependencyReason;
    if (control.type === 'FIELD' && mode === 'editable' && !this.value(control, 'visible')) {
      return 'Hidden fields are read-only.';
    }
    return null;
  }

  setValue(control: PlatformCapabilityControl, mode: string, value: boolean): void {
    if (!this.isConfigurable(control, mode)) return;
    this.draftValues.update((draft) => ({
      ...draft,
      [control.key]: { ...(draft[control.key] ?? {}), [mode]: value },
    }));
    this.successMessage.set(null);
  }

  modeReadonly(control: PlatformCapabilityControl, mode: string): boolean {
    if (this.parentDisabled(control) || this.saving()) return true;
    if (this.dependencyBlockReason(control) !== null) return true;
    return !this.isConfigurable(control, mode) || control.platformEnforced === true;
  }

  modeLockedReason(control: PlatformCapabilityControl, _mode?: string): string | null {
    void _mode;
    if (this.parentDisabled(control)) {
      return `${this.moduleLabel(control.moduleKey as ConfigurableModule)} is disabled for this organization.`;
    }
    const dependencyReason = this.dependencyBlockReason(control);
    if (dependencyReason !== null) return dependencyReason;
    if (control.platformEnforced === true) {
      return 'Platform rule: this required workflow field cannot be hidden or disabled.';
    }
    return null;
  }

  isModeEnabled(control: PlatformCapabilityControl, mode: string): boolean {
    return this.value(control, mode);
  }

  onLabel(mode: string): string {
    return mode === 'editable'
      ? 'Editable'
      : mode === 'allowed'
        ? 'Allowed'
        : mode === 'visible'
          ? 'Visible'
          : 'Enabled';
  }

  offLabel(mode: string): string {
    return mode === 'editable'
      ? 'Read-only'
      : mode === 'allowed'
        ? 'Blocked'
        : mode === 'visible'
          ? 'Hidden'
          : 'Disabled';
  }

  stateLabel(mode: string, value: boolean): string {
    return value ? this.onLabel(mode) : this.offLabel(mode);
  }

  overrideLabel(control: PlatformCapabilityControl, mode: string): string {
    const staged = this.changes().find((change) => change.key === control.key)?.value?.[mode];
    if (staged !== undefined) return `Staged · ${this.stateLabel(mode, staged)}`;
    if (control.override?.[mode] === undefined) return '— Uses default';
    return this.stateLabel(mode, control.override[mode] === true);
  }

  askSave(): void {
    if (this.changes().length > 0) this.pendingConfirmation.set({ kind: 'save' });
  }

  askResetControl(control: PlatformCapabilityControl): void {
    if (control.override !== null) this.pendingConfirmation.set({ kind: 'reset-control', control });
  }

  askResetModule(): void {
    if (this.selectedOverrideCount() > 0) {
      this.pendingConfirmation.set({ kind: 'reset-module', moduleKey: this.selectedModule() });
    }
  }

  askResetOrganization(): void {
    if (this.organizationOverrideCount() > 0) {
      this.pendingConfirmation.set({ kind: 'reset-organization' });
    }
  }

  confirm(): void {
    const pending = this.pendingConfirmation();
    this.pendingConfirmation.set(null);
    if (pending === null || this.saving()) return;
    if (pending.kind === 'save') {
      this.save();
      return;
    }
    const snapshot = this.snapshot();
    if (snapshot === null) return;
    if (pending.kind === 'reset-control') {
      this.runOperation(
        this.api.resetOrganizationControl(
          this.organizationId,
          pending.control.key,
          snapshot.policy.version,
          this.reason(),
        ),
        `${pending.control.label} now uses Agrivio defaults.`,
      );
    } else if (pending.kind === 'reset-module') {
      this.runOperation(
        this.api.resetOrganizationModule(
          this.organizationId,
          pending.moduleKey,
          snapshot.policy.version,
          this.reason(),
        ),
        `${this.moduleLabel(pending.moduleKey)} controls reset to defaults.`,
      );
    } else {
      this.runOperation(
        this.api.resetOrganization(this.organizationId, snapshot.policy.version, this.reason()),
        'Organization controls reset to defaults.',
      );
    }
  }

  moduleLabel(moduleKey: ConfigurableModule): string {
    if (moduleKey === 'inventory.products') return 'Products';
    if (moduleKey === 'inventory.categories') return 'Categories';
    if (moduleKey === 'inventory.stock') return 'Inventory / Stock on Hand';
    if (moduleKey === 'inventory.openingStock') return 'Opening Stock';
    if (moduleKey === 'inventory.expiry') return 'Expiry Inquiry';
    if (moduleKey === 'inventory.adjustments') return 'Stock Adjustments';
    if (moduleKey === 'inventory.transfers') return 'Warehouse Transfers';
    if (moduleKey === 'inventory.reconciliation') return 'Inventory Reconciliation';
    if (moduleKey === 'inventory.movements') return 'Stock Movements';
    return 'Product Batches';
  }

  isRequiredWorkflowControl(control: PlatformCapabilityControl): boolean {
    return (
      (control.moduleKey === 'inventory.openingStock' ||
        control.moduleKey === 'inventory.batches' ||
        control.moduleKey === 'inventory.expiry' ||
        control.moduleKey === 'inventory.adjustments' ||
        control.moduleKey === 'inventory.transfers' ||
        control.moduleKey === 'inventory.reconciliation' ||
        control.moduleKey === 'inventory.movements') &&
      control.type === 'FIELD' &&
      control.platformEnforced === true
    );
  }

  private movementsFeatures(...ids: readonly string[]): readonly PlatformCapabilityControl[] {
    const keys = new Set(ids.map((id) => `inventory.movements.features.${id}`));
    return this.byType('FEATURE', false).filter((control) => keys.has(control.key));
  }

  private reconciliationFeatures(...ids: readonly string[]): readonly PlatformCapabilityControl[] {
    const keys = new Set(ids.map((id) => `inventory.reconciliation.features.${id}`));
    return this.byType('FEATURE', false).filter((control) => keys.has(control.key));
  }

  private transfersFeatures(...ids: readonly string[]): readonly PlatformCapabilityControl[] {
    const keys = new Set(ids.map((id) => `inventory.transfers.features.${id}`));
    return this.byType('FEATURE', false).filter((control) => keys.has(control.key));
  }

  private adjustmentsFeatures(...ids: readonly string[]): readonly PlatformCapabilityControl[] {
    const keys = new Set(ids.map((id) => `inventory.adjustments.features.${id}`));
    return this.byType('FEATURE', false).filter((control) => keys.has(control.key));
  }

  private batchFeatures(...ids: readonly string[]): readonly PlatformCapabilityControl[] {
    const module = this.selectedModule();
    const prefix =
      module === 'inventory.expiry' ? 'inventory.expiry.features.' : 'inventory.batches.features.';
    const keys = new Set(ids.map((id) => `${prefix}${id}`));
    return this.byType('FEATURE', false).filter((control) => keys.has(control.key));
  }

  private isBatchGroupedFeature(control: PlatformCapabilityControl): boolean {
    return (
      (control.moduleKey === 'inventory.batches' &&
        (control.key === 'inventory.batches.features.moduleInfo' ||
          control.key === 'inventory.batches.features.search' ||
          control.key === 'inventory.batches.features.productFilter' ||
          control.key === 'inventory.batches.features.warehouseFilter' ||
          control.key === 'inventory.batches.features.stockByLocation' ||
          control.key === 'inventory.batches.features.technicalDetails')) ||
      (control.moduleKey === 'inventory.expiry' &&
        (control.key === 'inventory.expiry.features.moduleInfo' ||
          control.key === 'inventory.expiry.features.search' ||
          control.key === 'inventory.expiry.features.productFilter' ||
          control.key === 'inventory.expiry.features.warehouseFilter' ||
          control.key === 'inventory.expiry.features.classificationFilter' ||
          control.key === 'inventory.expiry.features.timelineSection' ||
          control.key === 'inventory.expiry.features.quantitySection' ||
          control.key === 'inventory.expiry.features.technicalDetails')) ||
      (control.moduleKey === 'inventory.adjustments' &&
        (control.key === 'inventory.adjustments.features.moduleInfo' ||
          control.key === 'inventory.adjustments.features.productSearch' ||
          control.key === 'inventory.adjustments.features.productContext' ||
          control.key === 'inventory.adjustments.features.stockContext' ||
          control.key === 'inventory.adjustments.features.guidance' ||
          control.key === 'inventory.adjustments.features.recentAdjustments' ||
          control.key === 'inventory.adjustments.features.serverPostingDate')) ||
      (control.moduleKey === 'inventory.transfers' &&
        (control.key === 'inventory.transfers.features.moduleInfo' ||
          control.key === 'inventory.transfers.features.productSearch' ||
          control.key === 'inventory.transfers.features.productContext' ||
          control.key === 'inventory.transfers.features.stockContext' ||
          control.key === 'inventory.transfers.features.guidance' ||
          control.key === 'inventory.transfers.features.recentTransfers' ||
          control.key === 'inventory.transfers.features.serverTransferDate')) ||
      (control.moduleKey === 'inventory.reconciliation' &&
        (control.key === 'inventory.reconciliation.features.moduleInfo' ||
          control.key === 'inventory.reconciliation.features.search' ||
          control.key === 'inventory.reconciliation.features.warehouseFilter' ||
          control.key === 'inventory.reconciliation.features.findingFilter' ||
          control.key === 'inventory.reconciliation.features.kpiCards' ||
          control.key === 'inventory.reconciliation.features.inspector' ||
          control.key === 'inventory.reconciliation.features.technicalDetails')) ||
      (control.moduleKey === 'inventory.movements' &&
        (control.key === 'inventory.movements.features.moduleInfo' ||
          control.key === 'inventory.movements.features.search' ||
          control.key === 'inventory.movements.features.filters' ||
          control.key === 'inventory.movements.features.kpiCards' ||
          control.key === 'inventory.movements.features.referenceResolution' ||
          control.key === 'inventory.movements.features.inspector' ||
          control.key === 'inventory.movements.features.technicalDetails' ||
          control.key === 'inventory.movements.features.mobileCards'))
    );
  }

  private dependencyBlockReason(control: PlatformCapabilityControl): string | null {
    for (const dependencyKey of control.dependencies ?? []) {
      const dependency = this.controls().find((item) => item.key === dependencyKey);
      if (dependency === undefined) continue;
      const disabled = Object.keys(dependency.defaultPolicy).some(
        (mode) => this.draftValues()[dependency.key]?.[mode] !== true,
      );
      if (!disabled) continue;
      if (dependency.key === 'inventory.products') {
        return 'Products is disabled for this organization.';
      }
      if (dependency.key === 'inventory.stock') {
        return 'Stock on Hand is disabled for this organization.';
      }
      if (dependency.key === 'inventory.batches') {
        return 'Product Batches is disabled for this organization.';
      }
      return `${dependency.label} is disabled for this organization.`;
    }
    return null;
  }

  private save(): void {
    const snapshot = this.snapshot();
    const changes = this.changes();
    if (snapshot === null || changes.length === 0) return;
    this.runOperation(
      this.api.updateOrganizationPolicy(
        this.organizationId,
        snapshot.policy.version,
        changes,
        this.reason(),
      ),
      'Organization capability policy saved.',
    );
  }

  private runOperation(request: Observable<unknown>, success: string): void {
    this.saving.set(true);
    this.errorMessage.set(null);
    request.subscribe({
      next: () => {
        this.saving.set(false);
        this.successMessage.set(success);
        this.reason.set('');
        this.reload();
      },
      error: (error: unknown) => {
        this.saving.set(false);
        this.errorMessage.set(this.mapError(error));
      },
    });
  }

  private byType(
    type: CapabilityControlType,
    moduleRoot?: boolean,
  ): readonly PlatformCapabilityControl[] {
    return this.selectedControls().filter(
      (control) =>
        control.type === type &&
        (moduleRoot === undefined || (control.key === control.moduleKey) === moduleRoot),
    );
  }

  private mapError(error: unknown): string {
    if (error instanceof HttpErrorResponse) {
      if (error.error?.error?.code === 'VERSION_CONFLICT') {
        return 'This policy changed elsewhere. Reload and review your changes.';
      }
      return error.error?.error?.message ?? 'Unable to update organization controls.';
    }
    return 'Unable to update organization controls.';
  }
}
