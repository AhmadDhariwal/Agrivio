import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { BranchesWarehousesApi } from '../../data-access/branches-warehouses.api';
import { AuthSessionStore } from '../../../auth/data-access/auth-session.store';
import { UiPageHeaderComponent } from '../../../../shared/ui/ui-page-header/ui-page-header.component';
import { UiAlertComponent } from '../../../../shared/ui/ui-alert/ui-alert.component';
import { UiLoadingStateComponent } from '../../../../shared/ui/ui-loading-state/ui-loading-state.component';

@Component({
  selector: 'agrivio-branch-form-page',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    RouterLink,
    UiPageHeaderComponent,
    UiAlertComponent,
    UiLoadingStateComponent,
  ],
  templateUrl: './branch-form.page.html',
  styleUrl: './branch-form.page.scss',
})
export class BranchFormPage {
  private readonly api = inject(BranchesWarehousesApi);
  private readonly sessionStore = inject(AuthSessionStore);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly formBuilder = inject(FormBuilder);

  readonly branchId = signal<string | null>(null);
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly canManage = computed(() => this.sessionStore.hasPermission('branches.manage'));
  private version = 1;

  readonly form = this.formBuilder.nonNullable.group({
    name: ['', [Validators.required, Validators.minLength(2)]],
    invoicePrefix: ['', [Validators.required, Validators.pattern(/^[A-Za-z0-9-]{1,20}$/)]],
    code: [''],
    status: ['active'],
  });

  constructor() {
    const id = this.route.snapshot.paramMap.get('id');
    if (id && id !== 'new') {
      this.branchId.set(id);
      this.loading.set(true);
      this.api.getBranch(id).subscribe({
        next: (branch) => {
          this.version = branch.version;
          this.form.patchValue({
            name: branch.name,
            invoicePrefix: branch.invoicePrefix,
            code: branch.code,
            status: branch.status,
          });
          this.loading.set(false);
        },
        error: (error: unknown) => {
          this.loading.set(false);
          this.errorMessage.set(this.mapError(error, 'Unable to load branch.'));
        },
      });
    }
  }

  save(): void {
    if (!this.canManage() || this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.saving.set(true);
    this.errorMessage.set(null);
    const value = this.form.getRawValue();
    const request$ =
      this.branchId() === null
        ? this.api.createBranch({
            name: value.name,
            invoicePrefix: value.invoicePrefix,
            ...(value.code.trim() === '' ? {} : { code: value.code }),
          })
        : this.api.updateBranch(this.branchId()!, {
            expectedVersion: this.version,
            name: value.name,
            invoicePrefix: value.invoicePrefix,
            code: value.code,
            status: value.status,
          });

    request$.subscribe({
      next: () => {
        this.saving.set(false);
        void this.router.navigateByUrl('/app/branches');
      },
      error: (error: unknown) => {
        this.saving.set(false);
        this.errorMessage.set(this.mapError(error, 'Unable to save branch.'));
      },
    });
  }

  private mapError(error: unknown, fallback: string): string {
    if (!(error instanceof HttpErrorResponse)) {
      return fallback;
    }
    if (error.error?.error?.code === 'VERSION_CONFLICT') {
      return 'This branch changed elsewhere. Reload and try again.';
    }
    return error.error?.error?.message ?? fallback;
  }
}
