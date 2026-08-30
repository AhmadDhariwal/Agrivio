import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { ExpensesPage } from './expenses.page';
import { ExpensesApi } from '../../data-access/expenses.api';
import { AuthSessionStore } from '../../../auth/data-access/auth-session.store';
import { CapabilityService } from '../../../capabilities/data-access/capability.service';
import { ExpenseRecord } from '../../models/expenses.models';

const postedExpense: ExpenseRecord = {
  id: 'exp-1',
  organizationId: 'org-1',
  categoryId: 'cat-1',
  accountId: 'acc-1',
  categoryName: 'Machinery Maintenance',
  accountName: 'Cash Register',
  amount: { amount: '5000', currency: 'PKR' },
  purpose: 'Pesticide residue testing',
  expenseDate: '2026-08-05',
  reference: 'INV-2026-001',
  status: 'posted',
  postedAt: '2026-08-05T10:00:00Z',
  postedBy: 'user-1',
  accountMovementId: 'mov-1',
  correctionOfId: null,
  correctedByExpenseId: null,
  correctedAt: null,
  correctedBy: null,
  reason: null,
  version: 1,
};

describe('ExpensesPage', () => {
  let mockExpensesApi: {
    listExpenses: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    mockExpensesApi = {
      listExpenses: vi
        .fn()
        .mockReturnValue(of({ items: [postedExpense], meta: { page: 1, pageSize: 25, total: 1 } })),
    };

    await TestBed.configureTestingModule({
      imports: [ExpensesPage],
      providers: [
        provideRouter([]),
        { provide: ExpensesApi, useValue: mockExpensesApi },
        { provide: AuthSessionStore, useValue: { hasPermission: () => true } },
        {
          provide: CapabilityService,
          useValue: {
            canUseModule: () => true,
            canUseView: () => true,
            canPerformAction: () => true,
            canViewField: () => true,
          },
        },
      ],
    }).compileComponents();
  });

  it('renders expenses table with data', () => {
    const fixture: ComponentFixture<ExpensesPage> = TestBed.createComponent(ExpensesPage);
    fixture.detectChanges();
    fixture.detectChanges();
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Expenses');
    expect(text).toContain('Pesticide residue testing');
    expect(text).toContain('Machinery Maintenance');
    expect(text).toContain('Cash Register');
    expect(fixture.nativeElement.querySelector('[data-testid="expense-create-link"]')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('[data-testid="expense-detail-link-exp-1"]')).toBeTruthy();
  });

  it('renders empty state when no expenses exist', async () => {
    mockExpensesApi.listExpenses.mockReturnValue(
      of({ items: [], meta: { page: 1, pageSize: 25, total: 0 } }),
    );
    const fixture: ComponentFixture<ExpensesPage> = TestBed.createComponent(ExpensesPage);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('No expenses found');
  });

  it('shows permission warning when user lacks expenses.view', async () => {
    await TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [ExpensesPage],
      providers: [
        provideRouter([]),
        { provide: ExpensesApi, useValue: mockExpensesApi },
        { provide: AuthSessionStore, useValue: { hasPermission: () => false } },
        {
          provide: CapabilityService,
          useValue: {
            canUseModule: () => true,
            canUseView: () => true,
            canPerformAction: () => true,
            canViewField: () => true,
          },
        },
      ],
    }).compileComponents();

    const fixture: ComponentFixture<ExpensesPage> = TestBed.createComponent(ExpensesPage);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('You do not have permission to view expenses.');
    expect(mockExpensesApi.listExpenses).not.toHaveBeenCalled();
  });

  it('calls listExpenses with status filter when selected', () => {
    const fixture: ComponentFixture<ExpensesPage> = TestBed.createComponent(ExpensesPage);
    fixture.detectChanges();
    mockExpensesApi.listExpenses.mockClear();

    fixture.componentInstance.statusFilter.set('posted');
    fixture.componentInstance.reload();

    expect(mockExpensesApi.listExpenses).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'posted', page: 1 }),
    );
  });

  it('displays correct status badge tone', () => {
    const fixture: ComponentFixture<ExpensesPage> = TestBed.createComponent(ExpensesPage);
    fixture.detectChanges();
    expect(fixture.componentInstance.statusTone('posted')).toBe('success');
    expect(fixture.componentInstance.statusTone('corrected')).toBe('warning');
    expect(fixture.componentInstance.statusTone('draft')).toBe('neutral');
  });

  it('formats money amounts correctly', () => {
    const fixture: ComponentFixture<ExpensesPage> = TestBed.createComponent(ExpensesPage);
    fixture.detectChanges();
    expect(fixture.componentInstance.formatAmount({ amount: '5000', currency: 'PKR' })).toBe(
      'PKR 5,000.00',
    );
  });
});
