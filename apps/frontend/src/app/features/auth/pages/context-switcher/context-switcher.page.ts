import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { startWith } from 'rxjs';
import { AuthSessionStore } from '../../data-access/auth-session.store';
import { AuthSessionContext, SessionContextSelection } from '../../data-access/auth.api';
import { AuthLayoutComponent } from '../../../../shared/ui/auth-layout/auth-layout.component';
import { UiAlertComponent } from '../../../../shared/ui/ui-alert/ui-alert.component';
import { UiLoadingStateComponent } from '../../../../shared/ui/ui-loading-state/ui-loading-state.component';

@Component({
  selector: 'agrivio-context-switcher-page',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    RouterLink,
    AuthLayoutComponent,
    UiAlertComponent,
    UiLoadingStateComponent,
  ],
  templateUrl: './context-switcher.page.html',
  styleUrl: './context-switcher.page.scss',
})
export class ContextSwitcherPage {
  private readonly formBuilder = inject(FormBuilder);
  private readonly sessionStore = inject(AuthSessionStore);
  private readonly router = inject(Router);

  readonly loading = signal(false);
  readonly submitting = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly successMessage = signal<string | null>(null);

  readonly activeContext = this.sessionStore.activeContext;
  readonly availableContexts = this.sessionStore.availableContexts;

  readonly form = this.formBuilder.nonNullable.group({
    contextKey: [''],
    branchId: [''],
    warehouseId: [''],
  });

  private readonly contextKeyValue = toSignal(
    this.form.controls.contextKey.valueChanges.pipe(startWith(this.form.controls.contextKey.value)),
    { initialValue: '' },
  );

  readonly selectedContext = computed(() => {
    const key = this.contextKeyValue();
    return this.availableContexts().find((item) => this.contextKey(item) === key) ?? null;
  });

  readonly showAssignmentFields = computed(
    () => this.selectedContext()?.contextType === 'organization',
  );

  readonly branchOptions = computed(() => {
    const context = this.selectedContext();
    if (context === null || context.contextType !== 'organization') {
      return [] as string[];
    }
    return (context.branchAssignments ?? []).map((item) => item.targetId);
  });

  readonly warehouseOptions = computed(() => {
    const context = this.selectedContext();
    if (context === null || context.contextType !== 'organization') {
      return [] as string[];
    }
    return (context.warehouseAssignments ?? []).map((item) => item.targetId);
  });

  constructor() {
    if (this.sessionStore.session() === null) {
      this.loading.set(true);
      this.sessionStore.loadSession().subscribe({
        next: () => this.loading.set(false),
        error: () => {
          this.loading.set(false);
          this.errorMessage.set('Sign in to manage active context.');
        },
      });
    }
  }

  contextLabel(context: AuthSessionContext): string {
    if (context.contextType === 'platform') {
      return `Platform · ${context.role}`;
    }
    return `Organization ${context.organizationId} · ${context.role}`;
  }

  contextKey(context: AuthSessionContext): string {
    if (context.contextType === 'platform') {
      return 'platform';
    }
    return `organization:${context.membershipId ?? context.organizationId}`;
  }

  submit(): void {
    this.errorMessage.set(null);
    this.successMessage.set(null);
    const raw = this.form.getRawValue();
    if (raw.contextKey === '') {
      this.errorMessage.set('Select an authorized context.');
      return;
    }

    const selection = this.toSelection(raw.contextKey, raw.branchId, raw.warehouseId);
    if (selection === null) {
      this.errorMessage.set('Selected context is not available.');
      return;
    }

    this.submitting.set(true);
    this.sessionStore.switchContext(selection).subscribe({
      next: () => {
        this.submitting.set(false);
        this.successMessage.set('Active context updated.');
        void this.router.navigateByUrl('/app');
      },
      error: () => {
        this.submitting.set(false);
        this.errorMessage.set(
          'Context switch failed. Access was denied or the selection is invalid.',
        );
      },
    });
  }

  continueToWorkspace(): void {
    void this.router.navigateByUrl('/app');
  }

  private toSelection(
    contextKey: string,
    branchId: string,
    warehouseId: string,
  ): SessionContextSelection | null {
    if (contextKey === 'platform') {
      return { contextType: 'platform' };
    }

    const match = this.availableContexts().find((item) => this.contextKey(item) === contextKey);
    if (match === undefined || match.contextType !== 'organization') {
      return null;
    }

    const allowedBranches = new Set((match.branchAssignments ?? []).map((item) => item.targetId));
    const allowedWarehouses = new Set(
      (match.warehouseAssignments ?? []).map((item) => item.targetId),
    );
    const normalizedBranch = branchId.trim();
    const normalizedWarehouse = warehouseId.trim();

    if (normalizedBranch !== '' && !allowedBranches.has(normalizedBranch)) {
      this.errorMessage.set('Selected branch is not in your accessible assignments.');
      return null;
    }
    if (normalizedWarehouse !== '' && !allowedWarehouses.has(normalizedWarehouse)) {
      this.errorMessage.set('Selected warehouse is not in your accessible assignments.');
      return null;
    }

    return {
      contextType: 'organization',
      ...(match.membershipId === undefined ? {} : { membershipId: match.membershipId }),
      ...(match.organizationId === undefined ? {} : { organizationId: match.organizationId }),
      branchId: normalizedBranch === '' ? null : normalizedBranch,
      warehouseId: normalizedWarehouse === '' ? null : normalizedWarehouse,
    };
  }
}
