import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter, Router } from '@angular/router';
import { of } from 'rxjs';
import { ExpenseFormPage } from './expense-form.page';
import { ExpensesApi } from '../../data-access/expenses.api';
import { AccountsApi } from '../../data-access/accounts.api';
import { AuthSessionStore } from '../../../auth/data-access/auth-session.store';
import { CapabilityService } from '../../../capabilities/data-access/capability.service';
import { ExpenseRecord } from '../../models/expenses.models';

const expense = (status: ExpenseRecord['status']): ExpenseRecord => ({
  id: 'exp-1',
  organizationId: 'org-1',
  categoryId: 'cat-1',
  accountId: 'acc-1',
  categoryName: 'Maintenance',
  accountName: 'Cash',
  amount: { amount: '5000', currency: 'PKR' },
  purpose: 'Repairs',
  expenseDate: '2026-09-04',
  reference: null,
  status,
  postedAt: status === 'posted' ? '2026-09-04T10:00:00Z' : null,
  postedBy: null,
  accountMovementId: null,
  correctionOfId: null,
  correctedByExpenseId: null,
  correctedAt: null,
  correctedBy: null,
  reason: null,
  version: 1,
});

describe('ExpenseFormPage route lifecycle', () => {
  async function setup(routePath: string, record: ExpenseRecord) {
    const expensesApi = {
      getExpense: vi.fn().mockReturnValue(of(record)),
      searchCategoryOptions: vi.fn().mockReturnValue(of([])),
    };
    const accountsApi = { searchAccountOptions: vi.fn().mockReturnValue(of([])) };
    await TestBed.configureTestingModule({
      imports: [ExpenseFormPage],
      providers: [
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              paramMap: convertToParamMap({ id: 'exp-1' }),
              routeConfig: { path: routePath },
            },
          },
        },
        { provide: ExpensesApi, useValue: expensesApi },
        { provide: AccountsApi, useValue: accountsApi },
        { provide: AuthSessionStore, useValue: { hasPermission: () => true } },
        { provide: CapabilityService, useValue: { canPerformAction: () => true } },
      ],
    }).compileComponents();
    const router = TestBed.inject(Router);
    const navigate = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
    const fixture: ComponentFixture<ExpenseFormPage> = TestBed.createComponent(ExpenseFormPage);
    fixture.detectChanges();
    return { fixture, expensesApi, accountsApi, navigate };
  }

  it('redirects an immutable expense away from Edit before loading editable options', async () => {
    const { fixture, expensesApi, accountsApi, navigate } = await setup(
      'expenses/:id/edit',
      expense('posted'),
    );
    expect(expensesApi.searchCategoryOptions).not.toHaveBeenCalled();
    expect(accountsApi.searchAccountOptions).not.toHaveBeenCalled();
    expect(fixture.nativeElement.querySelector('select')).toBeNull();
    expect(navigate).toHaveBeenCalledWith('/app/expenses/exp-1', { replaceUrl: true });
  });

  it('loads correction without category or account dropdown dependencies', async () => {
    const { fixture, expensesApi, accountsApi } = await setup(
      'expenses/:id/correct',
      expense('posted'),
    );

    expect(expensesApi.getExpense).toHaveBeenCalledWith('exp-1');
    expect(expensesApi.searchCategoryOptions).not.toHaveBeenCalled();
    expect(accountsApi.searchAccountOptions).not.toHaveBeenCalled();
    expect(fixture.nativeElement.querySelector('[data-testid="expense-form"]')).toBeNull();
    expect(
      fixture.nativeElement.querySelector('[data-testid="expense-correct-section"]'),
    ).toBeTruthy();
  });
});
