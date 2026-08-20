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
type ConfigurableModule = 'inventory.products' | 'inventory.categories' | 'inventory.stock';
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
  readonly moduleControls = computed(() => this.byType('FEATURE', true));
  readonly viewControls = computed(() => this.byType('VIEW'));
  readonly fieldControls = computed(() => this.byType('FIELD'));
  readonly featureControls = computed(() => this.byType('FEATURE', false));
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
  readonly confirmationTitle = computed(() => {
    const pending = this.pendingConfirmation();
    const organization = this.snapshot()?.organization.name ?? 'this organization';
    if (pending?.kind === 'reset-control') return `Reset “${pending.control.label}”?`;
    if (pending?.kind === 'reset-module') {
      return `Reset ${this.moduleLabel(pending.moduleKey)} controls for ${organization}?`;
    }
    if (pending?.kind === 'reset-organization') return `Reset all controls for ${organization}?`;
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
      error: () => {
        this.loading.set(false);
        this.errorMessage.set('Unable to load organization controls.');
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
    if (this.parentDisabled(control) || this.snapshot()?.policy.operationalAllowed === false) {
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
    if (control.type === 'FIELD' && mode === 'editable' && !this.value(control, 'visible')) {
      return 'Hidden fields are read-only.';
    }
    return null;
  }

  setValue(control: PlatformCapabilityControl, mode: string, value: boolean): void {
    if (!this.isConfigurable(control, mode)) return;
    this.draftValues.update((draft) => ({
      ...draft,
      [control.key]: { ...draft[control.key], [mode]: value },
    }));
    this.successMessage.set(null);
  }

  overrideLabel(control: PlatformCapabilityControl, mode: string): string {
    const staged = this.changes().find((change) => change.key === control.key)?.value?.[mode];
    if (staged !== undefined) return `Staged · ${this.stateLabel(mode, staged)}`;
    if (control.override?.[mode] === undefined) return '— Uses default';
    return this.stateLabel(mode, control.override[mode] === true);
  }

  stateLabel(mode: string, value: boolean): string {
    return value ? this.onLabel(mode) : this.offLabel(mode);
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

  moduleLabel(moduleKey: ConfigurableModule): string {
    if (moduleKey === 'inventory.products') return 'Products';
    if (moduleKey === 'inventory.categories') return 'Categories';
    return 'Inventory / Stock on Hand';
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
