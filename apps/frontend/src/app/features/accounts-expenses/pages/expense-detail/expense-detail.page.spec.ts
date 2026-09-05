import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { ExpenseDetailPage } from './expense-detail.page';
import { ExpensesApi } from '../../data-access/expenses.api';
import { AuthSessionStore } from '../../../auth/data-access/auth-session.store';
import { CapabilityService } from '../../../capabilities/data-access/capability.service';
import { ExpenseRecord } from '../../models/expenses.models';

const expense: ExpenseRecord = {
  id: 'exp-1',
  organizationId: 'org-1',
  categoryId: 'cat-1',
  accountId: 'acc-1',
  categoryName: 'Maintenance',
  accountName: 'Cash',
  amount: { amount: '5000', currency: 'PKR' },
  purpose: 'Repairs',
  expenseDate: '2026-09-04',
  reference: 'INV-1',
  status: 'posted',
  postedAt: '2026-09-04T10:00:00Z',
  postedBy: 'user-1',
  postedByName: 'Chaudhry Tariq',
  accountMovementId: 'mov-1',
  accountMovementName: 'Pesticide residue testing',
  correctionOfId: null,
  correctedByExpenseId: 'exp-2',
  correctedByExpenseName: 'Pesticide residue testing',
  correctedAt: '2026-09-05T08:55:45Z',
  correctedBy: 'user-1',
  correctedByName: 'Chaudhry Tariq',
  reason: null,
  version: 1,
};

describe('ExpenseDetailPage', () => {
  it('keeps posted expense inquiry read-only and exposes correction as a distinct action', async () => {
    const api = { getExpense: vi.fn().mockReturnValue(of(expense)) };
    await TestBed.configureTestingModule({
      imports: [ExpenseDetailPage],
      providers: [
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: convertToParamMap({ id: 'exp-1' }) } },
        },
        { provide: ExpensesApi, useValue: api },
        { provide: AuthSessionStore, useValue: { hasPermission: () => true } },
        {
          provide: CapabilityService,
          useValue: {
            canUseModule: () => true,
            canPerformAction: () => true,
            canViewField: () => true,
          },
        },
      ],
    }).compileComponents();
    const fixture: ComponentFixture<ExpenseDetailPage> = TestBed.createComponent(ExpenseDetailPage);
    fixture.detectChanges();

    expect(api.getExpense).toHaveBeenCalledWith('exp-1');
    expect(fixture.nativeElement.querySelector('form')).toBeNull();
    expect(
      fixture.nativeElement
        .querySelector('[data-testid="expense-correct-link"]')
        ?.getAttribute('href'),
    ).toBe('/app/expenses/exp-1/correct');
    expect(fixture.nativeElement.querySelector('[data-testid="expense-edit-link"]')).toBeNull();
  });

  it('shows actor and related record names instead of ids', async () => {
    const corrected: ExpenseRecord = {
      ...expense,
      status: 'corrected',
    };
    const api = { getExpense: vi.fn().mockReturnValue(of(corrected)) };
    await TestBed.configureTestingModule({
      imports: [ExpenseDetailPage],
      providers: [
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: convertToParamMap({ id: 'exp-1' }) } },
        },
        { provide: ExpensesApi, useValue: api },
        { provide: AuthSessionStore, useValue: { hasPermission: () => true } },
        {
          provide: CapabilityService,
          useValue: {
            canUseModule: () => true,
            canPerformAction: () => true,
            canViewField: () => true,
          },
        },
      ],
    }).compileComponents();
    const fixture: ComponentFixture<ExpenseDetailPage> = TestBed.createComponent(ExpenseDetailPage);
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Chaudhry Tariq');
    expect(text).toContain('Pesticide residue testing');
    expect(text).not.toContain('user-1');
    expect(text).not.toContain('mov-1');
  });
});
