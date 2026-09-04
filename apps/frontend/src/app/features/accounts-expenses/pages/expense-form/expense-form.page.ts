import { Component, computed, inject, signal } from '@angular/core';
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { forkJoin } from 'rxjs';
import { ExpensesApi } from '../../data-access/expenses.api';
import { AccountsApi } from '../../data-access/accounts.api';
import { AuthSessionStore } from '../../../auth/data-access/auth-session.store';
import { CapabilityService } from '../../../capabilities/data-access/capability.service';
import { UiAlertComponent } from '../../../../shared/ui/ui-alert/ui-alert.component';
import { UiLoadingStateComponent } from '../../../../shared/ui/ui-loading-state/ui-loading-state.component';
import { UiFieldLabelComponent } from '../../../../shared/ui/ui-field-label/ui-field-label.component';
import {
  fieldValidationMessage,
  hasRequiredValidator,
  shouldShowControlError,
} from '../../../../shared/form/form-field.util';
import { UiConfirmDialogComponent } from '../../../../shared/ui/ui-confirm-dialog/ui-confirm-dialog.component';
import {
  UiStatusBadgeComponent,
  UiBadgeTone,
} from '../../../../shared/ui/ui-status-badge/ui-status-badge.component';
import { AccountRecord } from '../../models/accounts.models';
import { ExpenseCategoryRecord, ExpenseRecord } from '../../models/expenses.models';

const MAX_PURPOSE = 500;
const MAX_REFERENCE = 120;
const MAX_REASON = 1000;

function positiveMoneyValidator(control: AbstractControl): ValidationErrors | null {
  const raw = String(control.value ?? '').trim();
  if (raw === '') {
    return null;
  }
  if (!/^\d+(\.\d{1,2})?$/.test(raw)) {
    return { invalidMoney: true };
  }
  const amount = Number(raw);
  if (!Number.isFinite(amount) || amount <= 0) {
    return { positiveMoney: true };
  }
  return null;
}

@Component({
  selector: 'agrivio-expense-form-page',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    RouterLink,
    UiAlertComponent,
    UiLoadingStateComponent,
    UiConfirmDialogComponent,
    UiFieldLabelComponent,
    UiStatusBadgeComponent,
  ],
  templateUrl: './expense-form.page.html',
  styleUrl: './expense-form.page.scss',
})
export class ExpenseFormPage {
  private readonly api = inject(ExpensesApi);
  private readonly accountsApi = inject(AccountsApi);
  private readonly sessionStore = inject(AuthSessionStore);
  private readonly capabilityService = inject(CapabilityService, { optional: true });
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly formBuilder = inject(FormBuilder);
  readonly isCorrectionMode = this.route.snapshot.routeConfig?.path === 'expenses/:id/correct';

  readonly expenseId = signal<string | null>(null);
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly posting = signal(false);
  readonly correcting = signal(false);
  readonly discarding = signal(false);
  readonly discardConfirmOpen = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly formSubmitAttempted = signal(false);
  readonly expense = signal<ExpenseRecord | null>(null);
  readonly categories = signal<ExpenseCategoryRecord[]>([]);
  readonly accounts = signal<AccountRecord[]>([]);
  readonly canPost = computed(
    () =>
      this.sessionStore.hasPermission('expenses.post') &&
      (this.capabilityService?.canPerformAction('expenses.actions.post') ?? true),
  );
  readonly canCorrect = computed(
    () =>
      this.sessionStore.hasPermission('expenses.correct') &&
      (this.capabilityService?.canPerformAction('expenses.actions.correct') ?? true),
  );
  readonly canView = computed(() => this.sessionStore.hasPermission('expenses.view'));
  readonly canSave = computed(
    () => this.canPost() && this.isDraft && this.form.valid && !this.saving(),
  );
  readonly showCategory = computed(
    () => this.capabilityService?.canViewField('expenses.fields.category') ?? true,
  );
  readonly showAccount = computed(
    () => this.capabilityService?.canViewField('expenses.fields.account') ?? true,
  );
  readonly showAmount = computed(
    () => this.capabilityService?.canViewField('expenses.fields.amount') ?? true,
  );
  readonly showPurpose = computed(
    () => this.capabilityService?.canViewField('expenses.fields.purpose') ?? true,
  );
  readonly showExpenseDate = computed(
    () => this.capabilityService?.canViewField('expenses.fields.expenseDate') ?? true,
  );
  readonly successMessage = signal<string | null>(null);
  private version = 1;

  readonly fieldRequired = hasRequiredValidator;
  readonly fieldError = fieldValidationMessage;

  statusTone(status: string | undefined): UiBadgeTone {
    switch (status) {
      case 'posted':
        return 'success';
      case 'corrected':
        return 'warning';
      case 'draft':
        return 'neutral';
      default:
        return 'neutral';
    }
  }

  readonly form = this.formBuilder.nonNullable.group({
    categoryId: ['', [Validators.required]],
    accountId: ['', [Validators.required]],
    amount: ['', [Validators.required, positiveMoneyValidator]],
    purpose: ['', [Validators.required, Validators.maxLength(MAX_PURPOSE)]],
    expenseDate: ['', [Validators.required]],
    reference: ['', [Validators.maxLength(MAX_REFERENCE)]],
  });

  readonly correctForm = this.formBuilder.nonNullable.group({
    reason: ['', [Validators.required, Validators.maxLength(MAX_REASON)]],
  });

  constructor() {
    const id = this.route.snapshot.paramMap.get('id');
    this.loading.set(true);
    if (id && id !== 'new') {
      this.api.getExpense(id).subscribe({
        next: (expense) => {
          const allowedStatus = this.isCorrectionMode
            ? expense.status === 'posted'
            : expense.status === 'draft';
          if (!allowedStatus) {
            void this.router.navigateByUrl(`/app/expenses/${expense.id}`, { replaceUrl: true });
            return;
          }
          this.expenseId.set(expense.id);
          this.applyExpense(expense);
          if (this.isCorrectionMode) {
            this.loading.set(false);
            return;
          }
          this.loadEditableOptions(expense);
        },
        error: (error: unknown) => {
          this.loading.set(false);
          this.errorMessage.set(this.mapError(error, 'Unable to load expense.'));
        },
      });
      return;
    }
    this.loadEditableOptions(null);
  }

  private loadEditableOptions(expense: ExpenseRecord | null): void {
    forkJoin({
      categories: this.api.searchCategoryOptions(),
      accounts: this.accountsApi.searchAccountOptions(),
    }).subscribe({
      next: ({ categories, accounts }) => {
        this.categories.set(
          categories.filter(
            (item) => item.status === 'active' || (expense && item.id === expense.categoryId),
          ),
        );
        this.accounts.set(
          accounts.filter(
            (item) => item.status === 'active' || (expense && item.id === expense.accountId),
          ),
        );
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.loading.set(false);
        this.errorMessage.set(this.mapError(error, 'Unable to load expense.'));
      },
    });
  }

  get isDraft(): boolean {
    return this.expense()?.status === 'draft' || this.expenseId() === null;
  }

  moneyFieldError(control: AbstractControl, label: string): string | null {
    if (!shouldShowControlError(control, this.formSubmitAttempted())) {
      return null;
    }
    if (control.hasError('positiveMoney')) {
      return `${label} must be greater than zero.`;
    }
    if (control.hasError('invalidMoney')) {
      return `${label} must have up to two decimal places.`;
    }
    return fieldValidationMessage(control, label, this.formSubmitAttempted());
  }

  isReadOnlyField(fieldKey: string): boolean {
    return (
      this.expenseId() !== null &&
      !(this.capabilityService?.canEditField(`expenses.fields.${fieldKey}`) ?? true)
    );
  }

  save(): void {
    this.formSubmitAttempted.set(true);
    this.form.markAllAsTouched();
    if (!this.canPost() || !this.isDraft || this.form.invalid) {
      return;
    }
    this.saving.set(true);
    this.errorMessage.set(null);
    this.successMessage.set(null);
    const value = this.form.getRawValue();
    const id = this.expenseId();
    const request$ =
      id === null
        ? this.api.createExpense(this.buildExpenseCreatePayload(value))
        : this.api.updateExpense(id, {
            expectedVersion: this.version,
            ...this.buildExpensePatchPayload(value),
          });
    request$.subscribe({
      next: (expense) => {
        this.saving.set(false);
        if (this.expenseId() === null) {
          void this.router.navigateByUrl(`/app/expenses/${expense.id}/edit`);
          return;
        }
        this.applyExpense(expense);
      },
      error: (error: unknown) => {
        this.saving.set(false);
        this.errorMessage.set(this.mapError(error, 'Unable to save expense.'));
      },
    });
  }

  askDiscard(): void {
    if (!this.expenseId() || !this.canPost() || !this.isDraft) {
      return;
    }
    this.discardConfirmOpen.set(true);
  }

  confirmDiscard(): void {
    const id = this.expenseId();
    this.discardConfirmOpen.set(false);
    if (!id || !this.canPost() || !this.isDraft) {
      return;
    }
    this.discarding.set(true);
    this.api.discardExpense(id).subscribe({
      next: () => {
        this.discarding.set(false);
        void this.router.navigateByUrl('/app/expenses');
      },
      error: (error: unknown) => {
        this.discarding.set(false);
        this.errorMessage.set(this.mapError(error, 'Unable to discard expense draft.'));
      },
    });
  }

  post(): void {
    const id = this.expenseId();
    const current = this.expense();
    if (!id || !current || !this.canPost() || current.status !== 'draft') {
      return;
    }
    this.posting.set(true);
    this.errorMessage.set(null);
    this.successMessage.set(null);
    this.api.postExpense(id, { expectedVersion: this.version }, crypto.randomUUID()).subscribe({
        next: (expense) => {
          this.posting.set(false);
          void this.router.navigateByUrl(`/app/expenses/${expense.id}`);
      },
      error: (error: unknown) => {
        this.posting.set(false);
        this.errorMessage.set(this.mapError(error, 'Unable to post expense.'));
      },
    });
  }

  correct(): void {
    const id = this.expenseId();
    const current = this.expense();
    if (!id || !current || !this.canCorrect() || current.status !== 'posted' || this.correctForm.invalid) {
      this.correctForm.markAllAsTouched();
      return;
    }
    this.correcting.set(true);
    this.errorMessage.set(null);
    this.successMessage.set(null);
    this.api
      .correctExpense(
        id,
        { expectedVersion: this.version, reason: this.correctForm.getRawValue().reason.trim() },
        crypto.randomUUID(),
      )
      .subscribe({
        next: (expense) => {
          this.correcting.set(false);
          void this.router.navigateByUrl(`/app/expenses/${expense.id}`);
        },
        error: (error: unknown) => {
          this.correcting.set(false);
          this.errorMessage.set(this.mapError(error, 'Unable to correct expense.'));
        },
      });
  }

  private buildExpenseCreatePayload(value: ReturnType<typeof this.form.getRawValue>): {
    categoryId: string;
    accountId: string;
    amount: { amount: string; currency: string };
    purpose: string;
    expenseDate: string;
    reference?: string;
  } {
    const payload: {
      categoryId: string;
      accountId: string;
      amount: { amount: string; currency: string };
      purpose: string;
      expenseDate: string;
      reference?: string;
    } = {
      categoryId: value.categoryId,
      accountId: value.accountId,
      amount: { amount: value.amount.trim(), currency: 'PKR' },
      purpose: value.purpose.trim(),
      expenseDate: value.expenseDate,
    };
    if (value.reference.trim() !== '') {
      payload.reference = value.reference.trim();
    }
    return payload;
  }

  private buildExpensePatchPayload(value: ReturnType<typeof this.form.getRawValue>): {
    categoryId?: string;
    accountId?: string;
    amount?: { amount: string; currency: string };
    purpose?: string;
    expenseDate?: string;
    reference?: string;
  } {
    const payload: {
      categoryId?: string;
      accountId?: string;
      amount?: { amount: string; currency: string };
      purpose?: string;
      expenseDate?: string;
      reference?: string;
    } = {};

    if (!this.isReadOnlyField('category')) {
      payload.categoryId = value.categoryId;
    }
    if (!this.isReadOnlyField('account')) {
      payload.accountId = value.accountId;
    }
    if (!this.isReadOnlyField('amount')) {
      payload.amount = { amount: value.amount.trim(), currency: 'PKR' };
    }
    if (!this.isReadOnlyField('purpose')) {
      payload.purpose = value.purpose.trim();
    }
    if (!this.isReadOnlyField('expenseDate')) {
      payload.expenseDate = value.expenseDate;
    }
    if (!this.isReadOnlyField('reference')) {
      const reference = value.reference.trim();
      if (reference !== '') {
        payload.reference = reference;
      }
    }

    return payload;
  }

  private applyExpense(expense: ExpenseRecord): void {
    this.expense.set(expense);
    this.version = expense.version;
    this.form.patchValue({
      categoryId: expense.categoryId,
      accountId: expense.accountId,
      amount: expense.amount.amount,
      purpose: expense.purpose,
      expenseDate: expense.expenseDate,
      reference: expense.reference ?? '',
    });
    if (expense.status !== 'draft') {
      this.form.disable();
    } else {
      this.form.enable();
    }
  }

  private mapError(error: unknown, fallback: string): string {
    if (!(error instanceof HttpErrorResponse)) {
      return fallback;
    }
    if (error.error?.error?.code === 'VERSION_CONFLICT') {
      return 'This expense changed elsewhere. Reload and try again.';
    }
    if (error.status === 403) {
      return error.error?.error?.message ?? 'You do not have permission for this action.';
    }
    return error.error?.error?.message ?? fallback;
  }
}
