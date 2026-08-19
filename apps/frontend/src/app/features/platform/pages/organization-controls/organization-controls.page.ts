import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { JsonPipe } from '@angular/common';
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

@Component({
  selector: 'agrivio-organization-controls-page',
  standalone: true,
  imports: [
    FormsModule,
    JsonPipe,
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
  readonly search = signal('');
  readonly reason = signal('');
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly successMessage = signal<string | null>(null);
  readonly confirmOpen = signal(false);

  readonly controls = computed(() => this.snapshot()?.policy.controls ?? []);
  readonly productControls = computed(() => {
    const query = this.search().trim().toLowerCase();
    return this.controls().filter(
      (control) =>
        control.moduleKey === 'inventory.products' &&
        control.key !== 'inventory' &&
        (!query ||
          control.label.toLowerCase().includes(query) ||
          control.key.toLowerCase().includes(query)),
    );
  });
  readonly moduleControls = computed(() => this.byType('FEATURE'));
  readonly viewControls = computed(() => this.byType('VIEW'));
  readonly fieldControls = computed(() => this.byType('FIELD'));
  readonly widgetControls = computed(() => this.byType('WIDGET'));
  readonly actionControls = computed(() => this.byType('ACTION'));

  readonly changes = computed<readonly CapabilityPolicyChange[]>(() => {
    const draft = this.draftValues();
    const changes: CapabilityPolicyChange[] = [];
    for (const control of this.controls()) {
      const next = draft[control.key];
      if (next === undefined) {
        continue;
      }
      const changedValue: Record<string, boolean> = {};
      for (const [mode, value] of Object.entries(next)) {
        if (value !== control.configuredValue[mode]) {
          changedValue[mode] = value;
        }
      }
      if (Object.keys(changedValue).length > 0) {
        changes.push({ key: control.key, value: changedValue });
      }
    }
    return changes;
  });

  readonly changeSummary = computed(() =>
    this.changes().map((change) => {
      const control = this.controls().find((item) => item.key === change.key);
      const parts = Object.entries(change.value ?? {}).map(
        ([mode, value]) => `${mode}: ${value ? this.onLabel(mode) : this.offLabel(mode)}`,
      );
      return `${control?.label ?? change.key} — ${parts.join(', ')}`;
    }),
  );

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
      control.key !== 'inventory.products' &&
      this.draftValues()['inventory.products']?.['enabled'] === false
    );
  }

  effectiveValue(control: PlatformCapabilityControl, mode: string): boolean {
    if (this.parentDisabled(control)) {
      return false;
    }
    if (control.type === 'FIELD' && mode === 'editable') {
      return this.value(control, 'visible') && this.value(control, mode);
    }
    return this.value(control, mode) && this.snapshot()?.policy.operationalAllowed !== false;
  }

  setValue(control: PlatformCapabilityControl, mode: string, value: boolean): void {
    if (!this.isConfigurable(control, mode) || this.parentDisabled(control)) {
      return;
    }
    this.draftValues.update((draft) => ({
      ...draft,
      [control.key]: { ...draft[control.key], [mode]: value },
    }));
    this.successMessage.set(null);
  }

  resetControl(control: PlatformCapabilityControl): void {
    this.draftValues.update((draft) => ({
      ...draft,
      [control.key]: { ...control.defaultPolicy },
    }));
  }

  resetProducts(): void {
    this.draftValues.update((draft) => {
      const next = { ...draft };
      for (const control of this.controls()) {
        if (control.moduleKey === 'inventory.products') {
          next[control.key] = { ...control.defaultPolicy };
        }
      }
      return next;
    });
  }

  askSave(): void {
    if (this.changes().length > 0) {
      this.confirmOpen.set(true);
    }
  }

  save(): void {
    const snapshot = this.snapshot();
    const changes = this.changes();
    this.confirmOpen.set(false);
    if (snapshot === null || changes.length === 0 || this.saving()) {
      return;
    }
    this.saving.set(true);
    this.errorMessage.set(null);
    this.api
      .updateOrganizationPolicy(
        this.organizationId,
        snapshot.policy.version,
        changes,
        this.reason(),
      )
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.successMessage.set('Organization capability policy saved.');
          this.reason.set('');
          this.reload();
        },
        error: (error: unknown) => {
          this.saving.set(false);
          this.errorMessage.set(this.mapError(error));
        },
      });
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

  private byType(type: CapabilityControlType): readonly PlatformCapabilityControl[] {
    return this.productControls().filter((control) => control.type === type);
  }

  private mapError(error: unknown): string {
    if (error instanceof HttpErrorResponse) {
      if (error.error?.error?.code === 'VERSION_CONFLICT') {
        return 'This policy changed elsewhere. Reload and review your changes.';
      }
      return error.error?.error?.message ?? 'Unable to save organization controls.';
    }
    return 'Unable to save organization controls.';
  }
}
