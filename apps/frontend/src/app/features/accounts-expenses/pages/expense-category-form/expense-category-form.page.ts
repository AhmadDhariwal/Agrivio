import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { ExpensesApi } from '../../data-access/expenses.api';
import { ExpenseCategoryRecord } from '../../models/expenses.models';
import { AuthSessionStore } from '../../../auth/data-access/auth-session.store';
import { CapabilityService } from '../../../capabilities/data-access/capability.service';
import { UiAlertComponent } from '../../../../shared/ui/ui-alert/ui-alert.component';
import { UiLoadingStateComponent } from '../../../../shared/ui/ui-loading-state/ui-loading-state.component';
import { UiFieldLabelComponent } from '../../../../shared/ui/ui-field-label/ui-field-label.component';
import { UiConfirmDialogComponent } from '../../../../shared/ui/ui-confirm-dialog/ui-confirm-dialog.component';
import {
  fieldValidationMessage,
  hasRequiredValidator,
} from '../../../../shared/form/form-field.util';
import { recordInUseMessage } from '../../../../shared/lifecycle/master-lifecycle';

const MAX_NAME = 160;

@Component({
  selector: 'agrivio-expense-category-form-page',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    RouterLink,
    UiAlertComponent,
    UiLoadingStateComponent,
    UiFieldLabelComponent,
    UiConfirmDialogComponent,
  ],
  templateUrl: './expense-category-form.page.html',
  styleUrl: './expense-category-form.page.scss',
})
export class ExpenseCategoryFormPage {
  private readonly api = inject(ExpensesApi);
  private readonly sessionStore = inject(AuthSessionStore);
  private readonly capabilityService = inject(CapabilityService, { optional: true });
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly formBuilder = inject(FormBuilder);

  readonly categoryId = signal<string | null>(null);
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly deleting = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly successMessage = signal<string | null>(null);
  readonly formSubmitAttempted = signal(false);
  readonly category = signal<ExpenseCategoryRecord | null>(null);
  readonly loadedStatus = signal<'active' | 'inactive'>('active');
  readonly deleteConfirmOpen = signal(false);

  readonly canManage = computed(
    () =>
      this.sessionStore.hasPermission('expenses.post') &&
      (this.capabilityService?.canPerformAction('expenses.actions.manageCategories') ?? true),
  );
  readonly canCreate = computed(
    () =>
      this.canManage() &&
      (this.capabilityService?.canPerformAction('expenses.categories.actions.create') ?? true),
  );
  readonly canEditCategory = computed(
    () =>
      this.canManage() &&
      (this.capabilityService?.canPerformAction('expenses.categories.actions.edit') ?? true),
  );
  readonly canEditName = computed(
    () => this.capabilityService?.canEditField('expenses.categories.fields.name') ?? true,
  );
  readonly showName = computed(
    () => this.capabilityService?.canViewField('expenses.categories.fields.name') ?? true,
  );
  readonly showStatus = computed(
    () => this.capabilityService?.canViewField('expenses.categories.fields.status') ?? true,
  );
  readonly canChangeStatus = computed(() => {
    if (!this.isEdit()) {
      return false;
    }
    const action = this.loadedStatus() === 'active' ? 'deactivate' : 'reactivate';
    return (
      this.canEditCategory() &&
      (this.capabilityService?.canPerformAction(`expenses.categories.actions.${action}`) ?? true)
    );
  });
  readonly canDelete = computed(
    () =>
      this.canManage() &&
      (this.capabilityService?.canPerformAction('expenses.categories.actions.delete') ?? true),
  );

  private version = 1;
  readonly fieldRequired = hasRequiredValidator;
  readonly fieldError = fieldValidationMessage;

  readonly form = this.formBuilder.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(MAX_NAME)]],
    status: ['active'],
  });

  readonly isEdit = computed(() => this.categoryId() !== null);
  readonly pageTitle = computed(() => (this.isEdit() ? 'Edit expense category' : 'Create expense category'));

  constructor() {
    const id = this.route.snapshot.paramMap.get('id');
    if (id && id !== 'new') {
      this.categoryId.set(id);
      this.loading.set(true);
      this.api.listCategories({ page: 1, pageSize: 100 }).subscribe({
        next: ({ items }) => {
          const cat = items.find((item) => item.id === id);
          if (!cat) {
            this.errorMessage.set('Expense category not found.');
            this.loading.set(false);
            return;
          }
          this.category.set(cat);
          this.version = cat.version;
          this.loadedStatus.set(cat.status === 'inactive' ? 'inactive' : 'active');
          this.form.patchValue({ name: cat.name, status: cat.status });
          this.loading.set(false);
        },
        error: (error: unknown) => {
          this.loading.set(false);
          this.errorMessage.set(this.mapError(error, 'Unable to load expense category.'));
        },
      });
    }
  }

  save(): void {
    this.formSubmitAttempted.set(true);
    this.form.markAllAsTouched();
    const allowed = this.categoryId() === null ? this.canCreate() : this.canEditCategory();
    if (!allowed || this.form.invalid) {
      return;
    }
    this.saving.set(true);
    this.errorMessage.set(null);
    const value = this.form.getRawValue();
    const catId = this.categoryId();
    const request$ =
      catId === null
        ? this.api.createCategory({ name: value.name.trim() })
        : this.api.updateCategory(catId, {
            expectedVersion: this.version,
            ...this.buildPayload(value),
          });
    request$.subscribe({
      next: () => {
        this.saving.set(false);
        void this.router.navigateByUrl('/app/expense-categories');
      },
      error: (error: unknown) => {
        this.saving.set(false);
        this.errorMessage.set(this.mapError(error, 'Unable to save expense category.'));
      },
    });
  }

  askDelete(): void {
    this.deleteConfirmOpen.set(true);
  }

  confirmDelete(): void {
    this.deleteConfirmOpen.set(false);
    const id = this.categoryId();
    if (!id || !this.canDelete()) return;
    this.deleting.set(true);
    this.api.deleteCategory(id).subscribe({
      next: () => {
        this.deleting.set(false);
        void this.router.navigateByUrl('/app/expense-categories');
      },
      error: (error: unknown) => {
        this.deleting.set(false);
        this.errorMessage.set(recordInUseMessage(error, 'Unable to delete expense category.'));
      },
    });
  }

  private buildPayload(
    value: ReturnType<typeof this.form.getRawValue>,
  ): { name?: string; status?: string } {
    const payload: { name?: string; status?: string } = {};

    if (this.canEditName()) {
      payload.name = value.name.trim();
    }
    if (this.canChangeStatus()) {
      payload.status = value.status;
    }

    return payload;
  }

  private mapError(error: unknown, fallback: string): string {
    if (!(error instanceof HttpErrorResponse)) return fallback;
    return error.error?.error?.message ?? fallback;
  }
}
