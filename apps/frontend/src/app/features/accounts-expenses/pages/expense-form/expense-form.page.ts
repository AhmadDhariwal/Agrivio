import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { forkJoin, of } from 'rxjs';
import { ExpensesApi } from '../../data-access/expenses.api';
import { AccountsApi } from '../../data-access/accounts.api';
import { AuthSessionStore } from '../../../auth/data-access/auth-session.store';
import { CapabilityService } from '../../../capabilities/data-access/capability.service';
import { UiAlertComponent } from '../../../../shared/ui/ui-alert/ui-alert.component';
import { UiLoadingStateComponent } from '../../../../shared/ui/ui-loading-state/ui-loading-state.component';
import { UiFieldLabelComponent } from '../../../../shared/ui/ui-field-label/ui-field-label.component';
import { hasRequiredValidator } from '../../../../shared/form/form-field.util';
import { UiConfirmDialogComponent } from '../../../../shared/ui/ui-confirm-dialog/ui-confirm-dialog.component';
import {
  UiStatusBadgeComponent,
  UiBadgeTone,
} from '../../../../shared/ui/ui-status-badge/ui-status-badge.component';
import { AccountRecord } from '../../models/accounts.models';
import { ExpenseCategoryRecord, ExpenseRecord } from '../../models/expenses.models';

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

  readonly expenseId = signal<string | null>(null);
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly posting = signal(false);
  readonly correcting = signal(false);
  readonly discarding = signal(false);
  readonly discardConfirmOpen = signal(false);
  readonly errorMessage = signal<string | null>(null);
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
  readonly successMessage = signal<string | null>(null);
  private version = 1;

  readonly fieldRequired = hasRequiredValidator;

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
    amount: ['', [Validators.required]],
    purpose: ['', [Validators.required]],
    expenseDate: ['', [Validators.required]],
    reference: [''],
  });

  readonly correctForm = this.formBuilder.nonNullable.group({
    reason: ['', [Validators.required]],
  });

  constructor() {
    const id = this.route.snapshot.paramMap.get('id');
    this.loading.set(true);
    forkJoin({
      categories: this.api.listCategoryOptions(),
      accounts: this.accountsApi.listAccountOptions(),
      expense: id && id !== 'new' ? this.api.getExpense(id) : of(null),
    }).subscribe({
      next: ({ categories, accounts, expense }) => {
        this.categories.set(categories.filter((item) => item.status === 'active' || (expense && item.id === expense.categoryId)));
        this.accounts.set(accounts.filter((item) => item.status === 'active' || (expense && item.id === expense.accountId)));
        if (expense) {
          this.expenseId.set(expense.id);
          this.applyExpense(expense);
        }
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

  save(): void {
    if (!this.canPost() || this.form.invalid || !this.isDraft) {
      this.form.markAllAsTouched();
      return;
    }
    this.saving.set(true);
    this.errorMessage.set(null);
    this.successMessage.set(null);
    const value = this.form.getRawValue();
    const payload = {
      categoryId: value.categoryId,
      accountId: value.accountId,
      amount: { amount: value.amount.trim(), currency: 'PKR' },
      purpose: value.purpose.trim(),
      expenseDate: value.expenseDate,
      ...(value.reference.trim() === '' ? {} : { reference: value.reference.trim() }),
    };
    const id = this.expenseId();
    const request$ =
      id === null
        ? this.api.createExpense(payload)
        : this.api.updateExpense(id, {
            expectedVersion: this.version,
            ...payload,
          });
    request$.subscribe({
      next: (expense) => {
        this.saving.set(false);
        if (this.expenseId() === null) {
          void this.router.navigateByUrl(`/app/expenses/${expense.id}`);
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
        this.applyExpense(expense);
        this.successMessage.set('Expense posted. A matching account outflow was recorded.');
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
          this.applyExpense(expense);
          this.successMessage.set(
            'Expense corrected. Original expense is preserved and the account effect was reversed.',
          );
        },
        error: (error: unknown) => {
          this.correcting.set(false);
          this.errorMessage.set(this.mapError(error, 'Unable to correct expense.'));
        },
      });
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
