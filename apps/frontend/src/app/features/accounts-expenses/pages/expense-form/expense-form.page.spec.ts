import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { ExpenseFormPage } from './expense-form.page';
import { ExpensesApi } from '../../data-access/expenses.api';
import { AccountsApi } from '../../data-access/accounts.api';
import { AuthSessionStore } from '../../../auth/data-access/auth-session.store';

describe('ExpenseFormPage', () => {
  let mockExpensesApi: {
    searchCategoryOptions: ReturnType<typeof vi.fn>;
    getExpense: ReturnType<typeof vi.fn>;
    createExpense: ReturnType<typeof vi.fn>;
    updateExpense: ReturnType<typeof vi.fn>;
    discardExpense: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    mockExpensesApi = {
      searchCategoryOptions: vi.fn().mockReturnValue(of([])),
      getExpense: vi.fn().mockReturnValue(of(null)),
      createExpense: vi.fn().mockReturnValue(of({ id: 'expense-1' })),
      updateExpense: vi.fn().mockReturnValue(of({ id: 'expense-1', status: 'draft', version: 2 })),
      discardExpense: vi.fn().mockReturnValue(of({ discarded: true })),
    };

    await TestBed.configureTestingModule({
      imports: [ExpenseFormPage],
      providers: [
        provideRouter([]),
        { provide: ExpensesApi, useValue: mockExpensesApi },
        {
          provide: AccountsApi,
          useValue: {
            searchAccountOptions: vi.fn().mockReturnValue(of([])),
          },
        },
        { provide: AuthSessionStore, useValue: { hasPermission: () => true } },
      ],
    }).compileComponents();
  });

  it('renders expense form', () => {
    const fixture: ComponentFixture<ExpenseFormPage> = TestBed.createComponent(ExpenseFormPage);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-testid="expense-form"]')).toBeTruthy();
  });

  it('disables save while required fields are missing', () => {
    const fixture: ComponentFixture<ExpenseFormPage> = TestBed.createComponent(ExpenseFormPage);
    fixture.detectChanges();
    const saveButton = fixture.nativeElement.querySelector(
      '[data-testid="expense-save"]',
    ) as HTMLButtonElement;
    expect(saveButton.disabled).toBe(true);
  });

  it('blocks invalid submit without calling createExpense', () => {
    const fixture: ComponentFixture<ExpenseFormPage> = TestBed.createComponent(ExpenseFormPage);
    fixture.detectChanges();
    fixture.componentInstance.save();
    fixture.detectChanges();
    expect(mockExpensesApi.createExpense).not.toHaveBeenCalled();
    expect(fixture.nativeElement.textContent).toContain('Category is required.');
  });

  it('rejects non-positive amount values', () => {
    const fixture: ComponentFixture<ExpenseFormPage> = TestBed.createComponent(ExpenseFormPage);
    fixture.detectChanges();
    const page = fixture.componentInstance;
    page.form.patchValue({
      categoryId: 'cat-1',
      accountId: 'acct-1',
      amount: '0',
      purpose: 'Fuel',
      expenseDate: '2026-08-29',
    });
    page.save();
    fixture.detectChanges();
    expect(mockExpensesApi.createExpense).not.toHaveBeenCalled();
    expect(fixture.nativeElement.textContent).toContain('Amount must be greater than zero.');
  });
});
