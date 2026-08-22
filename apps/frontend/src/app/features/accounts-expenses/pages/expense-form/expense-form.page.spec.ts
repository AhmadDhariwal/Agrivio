import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { ExpenseFormPage } from './expense-form.page';
import { ExpensesApi } from '../../data-access/expenses.api';
import { AccountsApi } from '../../data-access/accounts.api';
import { AuthSessionStore } from '../../../auth/data-access/auth-session.store';

describe('ExpenseFormPage', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ExpenseFormPage],
      providers: [
        provideRouter([]),
        {
          provide: ExpensesApi,
          useValue: {
            listCategories: () => of({ items: [], meta: { page: 1, pageSize: 25, total: 0 } }),
            listCategoryOptions: () => of([]),
            getExpense: () => of(null),
            createExpense: () => of({}),
            discardExpense: () => of({ discarded: true }),
          },
        },
        {
          provide: AccountsApi,
          useValue: {
            listAccounts: () => of({ items: [], meta: { page: 1, pageSize: 25, total: 0 } }),
            listAccountOptions: () => of([]),
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
});
