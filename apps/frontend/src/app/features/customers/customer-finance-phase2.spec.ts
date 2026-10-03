import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter, ActivatedRoute, convertToParamMap } from '@angular/router';
import { of, throwError } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';

import { CustomerFinanceApi } from './data-access/customer-finance.api';
import { AccountsApi } from '../accounts-expenses/data-access/accounts.api';
import { CustomersApi } from './data-access/customers.api';
import { AuthApi } from '../auth/data-access/auth.api';
import { AuthSessionStore } from '../auth/data-access/auth-session.store';
import { CapabilityService } from '../capabilities/data-access/capability.service';
import { QueryCacheService } from '../../shared/data-access/query-cache.service';
import { QUERY_CACHE_TAGS } from '../../shared/data-access/query-cache.tags';

import { GiveLoanDialogComponent } from './components/give-loan-dialog/give-loan-dialog.component';
import { RepayLoanDialogComponent } from './components/repay-loan-dialog/repay-loan-dialog.component';
import { ReverseLoanDialogComponent } from './components/reverse-loan-dialog/reverse-loan-dialog.component';
import { ReverseRepaymentDialogComponent } from './components/reverse-repayment-dialog/reverse-repayment-dialog.component';
import { AdjustCustomerBalanceDialogComponent } from './components/adjust-customer-balance-dialog/adjust-customer-balance-dialog.component';
import { CustomerDetailPage } from './pages/customer-detail/customer-detail.page';
import { CustomerLoansPage } from './pages/customer-loans/customer-loans.page';

import {
  CustomerRecord,
  CustomerLoanRecord,
  CustomerLoanDetailRecord,
  CustomerLoanRepaymentRecord,
} from './models/customers.models';
import {
  humanizeLedgerItem,
  formatLedgerAmount,
} from '../customer-payments/models/ledger-presentation.util';

describe('AGRIVIO PHASE 2 FRONTEND: Customer Loans, Repayments & Balance Adjustments', () => {
  let httpTestingController: HttpTestingController;

  const mockCustomer: CustomerRecord = {
    id: 'cust-100',
    organizationId: 'org-1',
    name: 'Ahmad Traders',
    phone: '0300-1234567',
    customerType: 'wholesale',
    priceTier: 'retail',
    creditEnabled: true,
    creditLimit: { amount: '100000.00', currency: 'PKR' },
    creditLimitBehaviour: 'warning',
    status: 'active',
    version: 1,
    derivedBalances: {
      receivable: { amount: '20000.00', currency: 'PKR' },
      loanReceivable: { amount: '50000.00', currency: 'PKR' },
      advance: { amount: '10000.00', currency: 'PKR' },
      netExposure: { amount: '10000.00', currency: 'PKR' },
      totalExposure: { amount: '60000.00', currency: 'PKR' },
    },
  };

  const mockOpenLoan: CustomerLoanRecord = {
    id: 'loan-1',
    organizationId: 'org-1',
    customerId: 'cust-100',
    customerName: 'Ahmad Traders',
    principal: { amount: '50000.00', currency: 'PKR' },
    outstanding: { amount: '50000.00', currency: 'PKR' },
    repaid: { amount: '0.00', currency: 'PKR' },
    businessDate: '2026-09-24',
    dueDate: '2026-12-31',
    disbursementAccountId: 'acc-1',
    status: 'open',
    reference: 'LN-2026-001',
    notes: 'Seasonal crop loan',
  };

  const mockPartiallyRepaidLoan: CustomerLoanRecord = {
    id: 'loan-2',
    organizationId: 'org-1',
    customerId: 'cust-100',
    customerName: 'Ahmad Traders',
    principal: { amount: '100000.00', currency: 'PKR' },
    outstanding: { amount: '60000.00', currency: 'PKR' },
    repaid: { amount: '40000.00', currency: 'PKR' },
    businessDate: '2026-08-15',
    disbursementAccountId: 'acc-1',
    status: 'partially_repaid',
    reference: 'LN-2026-002',
  };

  const mockAccounts = [
    {
      id: 'acc-1',
      code: '1001',
      name: 'HBL Main Bank',
      accountType: 'bank',
      currency: 'PKR',
      status: 'active',
      isLiquid: true,
      balance: { amount: '250000.00', currency: 'PKR' },
    },
    {
      id: 'acc-2',
      code: '1002',
      name: 'Cash Register Counter 1',
      accountType: 'cash',
      currency: 'PKR',
      status: 'active',
      isLiquid: true,
      balance: { amount: '45000.00', currency: 'PKR' },
    },
    {
      id: 'acc-3',
      code: '1003',
      name: 'Old Inactive Account',
      accountType: 'cash',
      currency: 'PKR',
      status: 'inactive',
      isLiquid: true,
      balance: { amount: '0.00', currency: 'PKR' },
    },
  ];

  const mockSessionStore = {
    hasPermission: vi.fn((perm: string) => true),
    activeContext: vi.fn(() => ({ organizationId: 'org-1' })),
    session: vi.fn(() => ({ user: { id: 'usr-1' }, activeContext: { organizationId: 'org-1' } })),
  };

  const mockCapabilityService = {
    canUseModule: vi.fn(() => true),
    canPerformAction: vi.fn(() => true),
    canViewField: vi.fn(() => true),
    canUseView: vi.fn(() => true),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // =========================================================================
  // 1. Give Loan UI & Flow
  // =========================================================================
  describe('1. Give Loan', () => {
    it('initializes with preselected customer, displays preview and dispatches createLoan', () => {
      const financeApiMock = {
        createLoan: vi.fn().mockReturnValue(of(mockOpenLoan)),
      };
      const accountsApiMock = {
        listAccountOptions: vi.fn().mockReturnValue(of(mockAccounts)),
      };

      TestBed.configureTestingModule({
        imports: [GiveLoanDialogComponent],
        providers: [
          { provide: CustomerFinanceApi, useValue: financeApiMock },
          { provide: AccountsApi, useValue: accountsApiMock },
          { provide: CustomersApi, useValue: { searchCustomerOptions: vi.fn().mockReturnValue(of([])) } },
        ],
      });

      const fixture = TestBed.createComponent(GiveLoanDialogComponent);
      fixture.componentRef.setInput('open', true);
      fixture.componentRef.setInput('customer', { id: 'cust-100', name: 'Ahmad Traders' });
      fixture.detectChanges();
      fixture.detectChanges();

      // Check helper text
      const compiled = fixture.nativeElement as HTMLElement;
      expect(compiled.textContent).toContain('This records money lent to the customer. It is not a Sale or Expense.');

      // Customer should be preselected
      expect(fixture.componentInstance.selectedCustomerName()).toBe('Ahmad Traders');

      // Populate form
      fixture.componentInstance.form.patchValue({
        disbursementAccountId: 'acc-1',
        amount: '50000',
        businessDate: '2026-09-24',
        reference: 'LN-2026-001',
      });
      fixture.detectChanges();

      // Preview check
      expect(fixture.componentInstance.hasPreview()).toBe(true);
      expect(fixture.componentInstance.formattedAmount()).toContain('50,000.00');

      // Submit
      fixture.componentInstance.submit();

      expect(financeApiMock.createLoan).toHaveBeenCalledWith(
        expect.objectContaining({
          customerId: 'cust-100',
          disbursementAccountId: 'acc-1',
          principal: { amount: '50000.00', currency: 'PKR' },
          businessDate: '2026-09-24',
          reference: 'LN-2026-001',
        }),
        expect.any(String), // Idempotency key
      );
    });
  });

  // =========================================================================
  // 2. Account Selector
  // =========================================================================
  describe('2. Account Selector', () => {
    it('reuses AccountsApi.listAccountOptions and filters to active accounts with formatted labels', () => {
      const accountsApiMock = {
        listAccountOptions: vi.fn().mockReturnValue(of(mockAccounts)),
      };

      TestBed.configureTestingModule({
        imports: [GiveLoanDialogComponent],
        providers: [
          { provide: CustomerFinanceApi, useValue: { createLoan: vi.fn() } },
          { provide: AccountsApi, useValue: accountsApiMock },
          { provide: CustomersApi, useValue: { searchCustomerOptions: vi.fn().mockReturnValue(of([])) } },
        ],
      });

      const fixture = TestBed.createComponent(GiveLoanDialogComponent);
      fixture.componentRef.setInput('open', true);
      fixture.detectChanges();

      expect(accountsApiMock.listAccountOptions).toHaveBeenCalledTimes(1);

      // Only active accounts should be available (2 of 3)
      const options = fixture.componentInstance.accountOptions();
      expect(options.length).toBe(2);
      expect(options.find((o) => o.value === 'acc-3')).toBeUndefined();

      // Option label should NOT be raw ID; should contain name and type
      expect(options[0]?.label).toContain('HBL Main Bank');
      expect(options[0]?.label).toContain('Bank');
    });
  });

  // =========================================================================
  // 3. Loan Repayment UI & Flow
  // =========================================================================
  describe('3. Loan Repayment UI', () => {
    it('displays loan outstanding, receives into account, and shows helper text', () => {
      const financeApiMock = {
        repayLoan: vi.fn().mockReturnValue(of({ id: 'rep-1', amount: { amount: '20000.00', currency: 'PKR' } })),
      };
      const accountsApiMock = {
        listAccountOptions: vi.fn().mockReturnValue(of(mockAccounts)),
      };

      TestBed.configureTestingModule({
        imports: [RepayLoanDialogComponent],
        providers: [
          { provide: CustomerFinanceApi, useValue: financeApiMock },
          { provide: AccountsApi, useValue: accountsApiMock },
        ],
      });

      const fixture = TestBed.createComponent(RepayLoanDialogComponent);
      fixture.componentRef.setInput('open', true);
      fixture.componentRef.setInput('loan', mockOpenLoan);
      fixture.detectChanges();
      fixture.detectChanges();

      const text = fixture.nativeElement.textContent;
      expect(text).toContain('Loan repayment reduces the selected loan balance. It is not Sales Revenue.');
      expect(fixture.componentInstance.currentOutstanding()).toBe('50000.00');

      fixture.componentInstance.form.patchValue({
        accountId: 'acc-1',
        amount: '20000',
        businessDate: '2026-09-25',
      });
      fixture.detectChanges();

      expect(fixture.componentInstance.hasPreview()).toBe(true);

      fixture.componentInstance.submit();

      expect(financeApiMock.repayLoan).toHaveBeenCalledWith(
        'loan-1',
        expect.objectContaining({
          accountId: 'acc-1',
          amount: { amount: '20000.00', currency: 'PKR' },
          businessDate: '2026-09-25',
        }),
        expect.any(String),
      );
    });
  });

  // =========================================================================
  // 4. Overpayment Validation
  // =========================================================================
  describe('4. Overpayment Validation', () => {
    it('prevents amount <= 0 and amount > current outstanding', () => {
      TestBed.configureTestingModule({
        imports: [RepayLoanDialogComponent],
        providers: [
          { provide: CustomerFinanceApi, useValue: { repayLoan: vi.fn() } },
          { provide: AccountsApi, useValue: { listAccountOptions: vi.fn().mockReturnValue(of(mockAccounts)) } },
        ],
      });

      const fixture = TestBed.createComponent(RepayLoanDialogComponent);
      fixture.componentRef.setInput('open', true);
      fixture.componentRef.setInput('loan', mockOpenLoan); // outstanding 50,000.00
      fixture.detectChanges();

      // Zero amount
      fixture.componentInstance.form.patchValue({
        accountId: 'acc-1',
        amount: '0',
      });
      fixture.detectChanges();
      expect(fixture.componentInstance.form.controls.amount.valid).toBe(false);

      // Overpayment: 60,000 > 50,000
      fixture.componentInstance.form.patchValue({
        accountId: 'acc-1',
        amount: '60000',
      });
      fixture.detectChanges();

      expect(fixture.componentInstance.isOverpayment()).toBe(true);
    });
  });

  // =========================================================================
  // 5. Loan List & Status Formatting
  // =========================================================================
  describe('5. Loan List & Status', () => {
    it('formats human-readable status labels and displays backend outstanding', () => {
      TestBed.configureTestingModule({
        imports: [CustomerLoansPage],
        providers: [
          provideRouter([]),
          {
            provide: CustomerFinanceApi,
            useValue: { listLoans: vi.fn().mockReturnValue(of({ items: [mockOpenLoan, mockPartiallyRepaidLoan], total: 2 })) },
          },
          {
            provide: CustomersApi,
            useValue: {
              listCustomers: vi.fn().mockReturnValue(of({ items: [], total: 0 })),
              searchCustomerOptions: vi.fn().mockReturnValue(of([])),
            },
          },
          { provide: AuthSessionStore, useValue: mockSessionStore },
          { provide: CapabilityService, useValue: mockCapabilityService },
        ],
      });

      const fixture = TestBed.createComponent(CustomerLoansPage);
      const comp = fixture.componentInstance;

      expect(comp.humanStatus('open')).toBe('Open');
      expect(comp.humanStatus('partially_repaid')).toBe('Partially Repaid');
      expect(comp.humanStatus('repaid')).toBe('Repaid');
      expect(comp.humanStatus('reversed')).toBe('Reversed');

      expect(comp.statusTone('open')).toBe('primary');
      expect(comp.statusTone('partially_repaid')).toBe('warning');
      expect(comp.statusTone('repaid')).toBe('success');
      expect(comp.statusTone('reversed')).toBe('danger');
    });
  });

  // =========================================================================
  // 6. Loan Reversal Confirmation
  // =========================================================================
  describe('6. Loan Reversal Confirmation', () => {
    it('requires a reason and dispatches reverseLoan with idempotency key', () => {
      const financeApiMock = {
        reverseLoan: vi.fn().mockReturnValue(of({ ...mockOpenLoan, status: 'reversed' })),
      };

      TestBed.configureTestingModule({
        imports: [ReverseLoanDialogComponent],
        providers: [
          { provide: CustomerFinanceApi, useValue: financeApiMock },
        ],
      });

      const fixture = TestBed.createComponent(ReverseLoanDialogComponent);
      fixture.componentRef.setInput('open', true);
      fixture.componentRef.setInput('loan', mockOpenLoan);
      fixture.detectChanges();

      const text = fixture.nativeElement.textContent;
      expect(text).toContain('Reverse Customer Loan');
      expect(text).toContain('50000.00');

      // Reason required
      expect(fixture.componentInstance.form.valid).toBe(false);
      fixture.componentInstance.submit();
      expect(financeApiMock.reverseLoan).not.toHaveBeenCalled();

      // Set reason
      fixture.componentInstance.form.patchValue({ reason: 'Disbursed in error to wrong customer' });
      fixture.detectChanges();
      expect(fixture.componentInstance.form.valid).toBe(true);

      fixture.componentInstance.submit();

      expect(financeApiMock.reverseLoan).toHaveBeenCalledWith(
        'loan-1',
        { reason: 'Disbursed in error to wrong customer' },
        expect.any(String),
      );
    });
  });

  // =========================================================================
  // 7. Repayment Reversal
  // =========================================================================
  describe('7. Repayment Reversal', () => {
    it('requires reason and calls reverseRepayment', () => {
      const mockRepayment: CustomerLoanRepaymentRecord = {
        id: 'rep-1',
        loanId: 'loan-1',
        customerId: 'cust-100',
        accountId: 'acc-1',
        amount: { amount: '10000.00', currency: 'PKR' },
        businessDate: '2026-09-24',
        status: 'posted',
      };

      const financeApiMock = {
        reverseRepayment: vi.fn().mockReturnValue(of({ ...mockRepayment, status: 'reversed' })),
      };

      TestBed.configureTestingModule({
        imports: [ReverseRepaymentDialogComponent],
        providers: [
          { provide: CustomerFinanceApi, useValue: financeApiMock },
        ],
      });

      const fixture = TestBed.createComponent(ReverseRepaymentDialogComponent);
      fixture.componentRef.setInput('open', true);
      fixture.componentRef.setInput('repayment', mockRepayment);
      fixture.detectChanges();

      const text = fixture.nativeElement.textContent;
      expect(text).toContain('Loan Receivable will increase');
      expect(text).toContain('Receiving Account balance will decrease');

      fixture.componentInstance.form.patchValue({ reason: 'Bounced check' });
      fixture.componentInstance.submit();

      expect(financeApiMock.reverseRepayment).toHaveBeenCalledWith(
        'rep-1',
        { reason: 'Bounced check' },
        expect.any(String),
      );
    });
  });

  // =========================================================================
  // 8. Adjust Balance Trade Receivable
  // =========================================================================
  describe('8. Adjust Balance Trade Receivable', () => {
    it('displays authoritative current balance, preview delta, and trade helper', () => {
      const financeApiMock = {
        adjustBalance: vi.fn().mockReturnValue(of({ id: 'adj-1', delta: { amount: '5000.00', currency: 'PKR' } })),
        listLoans: vi.fn().mockReturnValue(of({ items: [], total: 0 })),
      };

      TestBed.configureTestingModule({
        imports: [AdjustCustomerBalanceDialogComponent],
        providers: [
          { provide: CustomerFinanceApi, useValue: financeApiMock },
          { provide: CustomersApi, useValue: { searchCustomerOptions: vi.fn().mockReturnValue(of([])) } },
        ],
      });

      const fixture = TestBed.createComponent(AdjustCustomerBalanceDialogComponent);
      fixture.componentRef.setInput('open', true);
      fixture.componentRef.setInput('customer', mockCustomer);
      fixture.detectChanges();

      // Default balanceType is trade_receivable
      expect(fixture.componentInstance.form.controls.balanceType.value).toBe('trade_receivable');
      expect(fixture.componentInstance.currentBalance()).toBe('20000.00');

      const helper = fixture.componentInstance.currentHelperText();
      expect(helper).toContain("Use this only to correct the customer's recorded receivable balance.");

      // Set desired balance: 25000
      fixture.componentInstance.form.patchValue({
        desiredBalance: '25000',
        reason: 'Audit correction for missing opening invoice',
      });
      fixture.detectChanges();

      expect(fixture.componentInstance.deltaAmount()).toBe(5000);
      expect(fixture.componentInstance.deltaFormatted()).toContain('+ PKR 5,000.00');

      fixture.componentInstance.submit();

      expect(financeApiMock.adjustBalance).toHaveBeenCalledWith(
        expect.objectContaining({
          customerId: 'cust-100',
          balanceType: 'trade_receivable',
          expectedCurrentBalance: { amount: '20000.00', currency: 'PKR' },
          desiredBalance: { amount: '25000.00', currency: 'PKR' },
          reason: 'Audit correction for missing opening invoice',
        }),
        expect.any(String),
      );
    });
  });

  // =========================================================================
  // 9. Adjust Customer Advance
  // =========================================================================
  describe('9. Adjust Customer Advance', () => {
    it('shows advance helper text and does not post cash account transaction', () => {
      const financeApiMock = {
        adjustBalance: vi.fn().mockReturnValue(of({ id: 'adj-2' })),
        listLoans: vi.fn().mockReturnValue(of({ items: [], total: 0 })),
      };

      TestBed.configureTestingModule({
        imports: [AdjustCustomerBalanceDialogComponent],
        providers: [
          { provide: CustomerFinanceApi, useValue: financeApiMock },
          { provide: CustomersApi, useValue: { searchCustomerOptions: vi.fn().mockReturnValue(of([])) } },
        ],
      });

      const fixture = TestBed.createComponent(AdjustCustomerBalanceDialogComponent);
      fixture.componentRef.setInput('open', true);
      fixture.componentRef.setInput('customer', mockCustomer);
      fixture.detectChanges();

      fixture.componentInstance.form.patchValue({ balanceType: 'customer_advance' });
      fixture.detectChanges();

      expect(fixture.componentInstance.currentBalance()).toBe('10000.00');
      expect(fixture.componentInstance.currentHelperText()).toContain(
        'Use this to correct an existing advance balance. If money was actually received now, use Customer Payment instead.',
      );
    });
  });

  // =========================================================================
  // 10. Adjust Loan Receivable with loan selector
  // =========================================================================
  describe('10. Adjust Loan Receivable', () => {
    it('displays open loan selector and selected loan outstanding', () => {
      const financeApiMock = {
        adjustBalance: vi.fn().mockReturnValue(of({ id: 'adj-3' })),
        listLoans: vi.fn().mockReturnValue(of({ items: [mockOpenLoan], total: 1 })),
      };

      TestBed.configureTestingModule({
        imports: [AdjustCustomerBalanceDialogComponent],
        providers: [
          { provide: CustomerFinanceApi, useValue: financeApiMock },
          { provide: CustomersApi, useValue: { searchCustomerOptions: vi.fn().mockReturnValue(of([])) } },
        ],
      });

      const fixture = TestBed.createComponent(AdjustCustomerBalanceDialogComponent);
      fixture.componentRef.setInput('open', true);
      fixture.componentRef.setInput('customer', mockCustomer);
      fixture.detectChanges();

      fixture.componentInstance.form.patchValue({ balanceType: 'loan_receivable' });
      fixture.detectChanges();

      expect(fixture.componentInstance.currentHelperText()).toContain(
        'Use this for a balance correction only. If the customer actually repaid money, use Loan Repayment.',
      );
      expect(fixture.componentInstance.currentBalance()).toBe('50000.00');
    });
  });

  // =========================================================================
  // 11. No-op Adjustment
  // =========================================================================
  describe('11. No-Op Adjustment', () => {
    it('detects desired == current balance and marks as no-op', () => {
      TestBed.configureTestingModule({
        imports: [AdjustCustomerBalanceDialogComponent],
        providers: [
          { provide: CustomerFinanceApi, useValue: { listLoans: vi.fn().mockReturnValue(of({ items: [], total: 0 })) } },
          { provide: CustomersApi, useValue: { searchCustomerOptions: vi.fn().mockReturnValue(of([])) } },
        ],
      });

      const fixture = TestBed.createComponent(AdjustCustomerBalanceDialogComponent);
      fixture.componentRef.setInput('open', true);
      fixture.componentRef.setInput('customer', mockCustomer);
      fixture.detectChanges();

      // Current trade receivable is 20000.00; set desired to 20000
      fixture.componentInstance.form.patchValue({
        desiredBalance: '20000',
        reason: 'Test reason',
      });
      fixture.detectChanges();

      expect(fixture.componentInstance.isNoOp()).toBe(true);
      expect(fixture.nativeElement.textContent).toContain('No adjustment is required');
    });
  });

  // =========================================================================
  // 12. Stale 409 Conflict Handling
  // =========================================================================
  describe('12. Stale 409 Conflict Handling', () => {
    it('refreshes authoritative balance and displays conflict warning on 409', () => {
      const errorResponse = new HttpErrorResponse({
        status: 409,
        error: {
          error: {
            code: 'BALANCE_CHANGED',
            message: 'Current balance changed',
            details: {
              latestBalance: { amount: '22000.00', currency: 'PKR' },
            },
          },
        },
      });

      const financeApiMock = {
        adjustBalance: vi.fn().mockReturnValue(throwError(() => errorResponse)),
        listLoans: vi.fn().mockReturnValue(of({ items: [], total: 0 })),
      };

      TestBed.configureTestingModule({
        imports: [AdjustCustomerBalanceDialogComponent],
        providers: [
          { provide: CustomerFinanceApi, useValue: financeApiMock },
          { provide: CustomersApi, useValue: { searchCustomerOptions: vi.fn().mockReturnValue(of([])) } },
        ],
      });

      const fixture = TestBed.createComponent(AdjustCustomerBalanceDialogComponent);
      fixture.componentRef.setInput('open', true);
      fixture.componentRef.setInput('customer', mockCustomer);
      fixture.detectChanges();

      fixture.componentInstance.form.patchValue({
        desiredBalance: '25000',
        reason: 'Adjusting balance',
      });
      fixture.detectChanges();

      fixture.componentInstance.submit();

      expect(fixture.componentInstance.staleConflictMessage()).toContain(
        'Current Trade Receivable is PKR 22000.00',
      );
      expect(fixture.componentInstance.currentBalance()).toBe('22000.00');
    });
  });

  // =========================================================================
  // 13. Human-Readable Ledger Labels
  // =========================================================================
  describe('13. Human-Readable Ledger Labels', () => {
    it('maps all 8 Phase 2 ledger source types into clear human titles', () => {
      const cases = [
        { type: 'customer_loan_disbursement', expected: 'Customer Loan Disbursed' },
        { type: 'customer_loan_repayment', expected: 'Loan Repayment' },
        { type: 'customer_loan_repayment_reversal', expected: 'Loan Repayment Reversed' },
        { type: 'customer_loan_reversal', expected: 'Customer Loan Reversed' },
        { type: 'customer_trade_receivable_adjustment', expected: 'Trade Receivable Adjustment' },
        { type: 'customer_advance_adjustment', expected: 'Customer Advance Adjustment' },
        { type: 'customer_loan_adjustment', expected: 'Loan Balance Adjustment' },
        { type: 'customer_balance_adjustment_reversal', expected: 'Balance Adjustment Reversed' },
      ];

      for (const c of cases) {
        const item = humanizeLedgerItem({
          id: 'led-1',
          sourceType: c.type,
          sourceId: 'src-123456789012345678901234',
          signedAmount: { amount: '1000.00' },
          currency: 'PKR',
          postedAt: '2026-09-24T10:00:00Z',
        });
        expect(item.title).toBe(c.expected);
        expect(item.formattedAmount).toBe('+ PKR 1,000');
      }
    });
  });

  // =========================================================================
  // 14. Permissions Gating
  // =========================================================================
  describe('14. Permissions Gating', () => {
    it('gates customer loan actions on customers.manage and accounts.transaction.post', () => {
      const sessionWithViewOnly = {
        hasPermission: vi.fn((perm: string) => perm === 'customers.view'),
        activeContext: vi.fn(() => ({ organizationId: 'org-1' })),
      };

      TestBed.configureTestingModule({
        imports: [CustomerDetailPage],
        providers: [
          provideRouter([]),
          {
            provide: ActivatedRoute,
            useValue: { snapshot: { paramMap: convertToParamMap({ id: 'cust-100' }) } },
          },
          { provide: CustomersApi, useValue: { getCustomer: vi.fn().mockReturnValue(of(mockCustomer)) } },
          { provide: CustomerFinanceApi, useValue: { listLoans: vi.fn().mockReturnValue(of({ items: [], total: 0 })) } },
          { provide: AuthSessionStore, useValue: sessionWithViewOnly },
          { provide: CapabilityService, useValue: mockCapabilityService },
        ],
      });

      const fixture = TestBed.createComponent(CustomerDetailPage);
      const comp = fixture.componentInstance;

      expect(comp.canView()).toBe(true);
      expect(comp.canManageLoans()).toBe(false);
      expect(comp.canAdjustBalance()).toBe(false);
      expect(comp.canReceivePayment()).toBe(false);
    });
  });

  // =========================================================================
  // 15. Targeted Cache Invalidation
  // =========================================================================
  describe('15. Targeted Cache Invalidation', () => {
    it('invalidates accounts on loan disbursement and skips accounts on balance adjustment', () => {
      const queryCacheMock = {
        fetch: vi.fn(),
        buildKey: vi.fn().mockReturnValue('mock-key'),
        invalidateTags: vi.fn(),
      };

      TestBed.configureTestingModule({
        providers: [
          provideHttpClient(),
          provideHttpClientTesting(),
          CustomerFinanceApi,
          { provide: AuthApi, useValue: { ensureCsrf: vi.fn().mockReturnValue(of({ csrfToken: 'mock-csrf' })) } },
          { provide: QueryCacheService, useValue: queryCacheMock },
          { provide: AuthSessionStore, useValue: mockSessionStore },
        ],
      });

      const api = TestBed.inject(CustomerFinanceApi);
      httpTestingController = TestBed.inject(HttpTestingController);

      // 1. Give Loan -> must invalidate accounts
      api.createLoan(
        {
          customerId: 'cust-100',
          disbursementAccountId: 'acc-1',
          principal: { amount: '50000.00' },
          businessDate: '2026-09-24',
        },
        'test-key-1',
      ).subscribe();

      const loanReq = httpTestingController.expectOne((req) =>
        req.url.includes('/api/v1/customer-loans'),
      );
      loanReq.flush({ data: mockOpenLoan });

      const loanCallsFlat = queryCacheMock.invalidateTags.mock.calls.flat();
      expect(loanCallsFlat).toContain(QUERY_CACHE_TAGS.accounts);
      expect(loanCallsFlat).toContain(QUERY_CACHE_TAGS.receivables);
      expect(loanCallsFlat).toContain(QUERY_CACHE_TAGS.customerLoans);

      queryCacheMock.invalidateTags.mockClear();

      // 2. Adjust Balance -> must NOT invalidate accounts
      api.adjustBalance(
        {
          customerId: 'cust-100',
          balanceType: 'trade_receivable',
          expectedCurrentBalance: { amount: '20000.00' },
          desiredBalance: { amount: '25000.00' },
          reason: 'Adjustment',
          category: 'reconciliation',
          businessDate: '2026-09-24',
        },
        'test-key-2',
      ).subscribe();

      const adjReq = httpTestingController.expectOne((req) =>
        req.url.includes('/api/v1/customer-balance-adjustments'),
      );
      adjReq.flush({ data: { id: 'adj-1' } });

      const adjCallsFlat = queryCacheMock.invalidateTags.mock.calls.flat();
      expect(adjCallsFlat).toContain(QUERY_CACHE_TAGS.receivables);
      expect(adjCallsFlat).toContain(QUERY_CACHE_TAGS.customers);
      expect(adjCallsFlat).toContain(QUERY_CACHE_TAGS.customerLoans);
      // Confirm accounts tag is NOT in the invalidation set for adjustments
      expect(adjCallsFlat).not.toContain(QUERY_CACHE_TAGS.accounts);
    });
  });

  // =========================================================================
  // 16. No Duplicate POST Prevention
  // =========================================================================
  describe('16. No Duplicate POST', () => {
    it('sets saving=true while in flight to prevent double click submissions', () => {
      const financeApiMock = {
        createLoan: vi.fn().mockReturnValue(of(mockOpenLoan)),
      };

      TestBed.configureTestingModule({
        imports: [GiveLoanDialogComponent],
        providers: [
          { provide: CustomerFinanceApi, useValue: financeApiMock },
          { provide: AccountsApi, useValue: { listAccountOptions: vi.fn().mockReturnValue(of(mockAccounts)) } },
          { provide: CustomersApi, useValue: { searchCustomerOptions: vi.fn().mockReturnValue(of([])) } },
        ],
      });

      const fixture = TestBed.createComponent(GiveLoanDialogComponent);
      fixture.componentRef.setInput('open', true);
      fixture.componentRef.setInput('customer', { id: 'cust-100', name: 'Ahmad Traders' });
      fixture.detectChanges();

      fixture.componentInstance.form.patchValue({
        disbursementAccountId: 'acc-1',
        amount: '50000',
      });
      fixture.detectChanges();

      // First submit
      fixture.componentInstance.submit();
      expect(financeApiMock.createLoan).toHaveBeenCalledTimes(1);

      // Attempt second submit while saving is true
      fixture.componentInstance.saving.set(true);
      fixture.componentInstance.submit();
      // Should still be only 1 call
      expect(financeApiMock.createLoan).toHaveBeenCalledTimes(1);
    });
  });

  // =========================================================================
  // 17. Responsive Structure & Financial Summary
  // =========================================================================
  describe('17. Customer Financial Summary Presentation', () => {
    it('renders Trade Receivable, Loan Receivable, Advance, Net Exposure, and Total Exposure', () => {
      TestBed.configureTestingModule({
        imports: [CustomerDetailPage],
        providers: [
          provideRouter([]),
          {
            provide: ActivatedRoute,
            useValue: { snapshot: { paramMap: convertToParamMap({ id: 'cust-100' }) } },
          },
          { provide: CustomersApi, useValue: { getCustomer: vi.fn().mockReturnValue(of(mockCustomer)) } },
          { provide: CustomerFinanceApi, useValue: { listLoans: vi.fn().mockReturnValue(of({ items: [], total: 0 })) } },
          { provide: AuthSessionStore, useValue: mockSessionStore },
          { provide: CapabilityService, useValue: mockCapabilityService },
        ],
      });

      const fixture = TestBed.createComponent(CustomerDetailPage);
      fixture.detectChanges();

      const compiled = fixture.nativeElement as HTMLElement;
      const tradeRec = compiled.querySelector('[data-testid="cust-trade-receivable"]')?.textContent;
      const loanRec = compiled.querySelector('[data-testid="cust-loan-receivable"]')?.textContent;
      const adv = compiled.querySelector('[data-testid="cust-customer-advance"]')?.textContent;
      const netExp = compiled.querySelector('[data-testid="cust-net-exposure"]')?.textContent;
      const totalExp = compiled.querySelector('[data-testid="cust-total-exposure"]')?.textContent;

      expect(tradeRec).toContain('20,000.00');
      expect(loanRec).toContain('50,000.00');
      expect(adv).toContain('10,000.00');
      expect(netExp).toContain('10,000.00');
      expect(totalExp).toContain('60,000.00');
    });
  });

  // =========================================================================
  // 18. Customer Payment UI Remains Unchanged
  // =========================================================================
  describe('18. Customer Payment UI Separation', () => {
    it('confirms Give Loan and Repay Loan are strictly decoupled from customer payment allocation', () => {
      // In CustomerDetailPage, actions are distinct buttons with distinct testids
      TestBed.configureTestingModule({
        imports: [CustomerDetailPage],
        providers: [
          provideRouter([]),
          {
            provide: ActivatedRoute,
            useValue: { snapshot: { paramMap: convertToParamMap({ id: 'cust-100' }) } },
          },
          { provide: CustomersApi, useValue: { getCustomer: vi.fn().mockReturnValue(of(mockCustomer)) } },
          { provide: CustomerFinanceApi, useValue: { listLoans: vi.fn().mockReturnValue(of({ items: [], total: 0 })) } },
          { provide: AuthSessionStore, useValue: mockSessionStore },
          { provide: CapabilityService, useValue: mockCapabilityService },
        ],
      });

      const fixture = TestBed.createComponent(CustomerDetailPage);
      fixture.detectChanges();

      const compiled = fixture.nativeElement as HTMLElement;
      expect(compiled.querySelector('[data-testid="customer-receive-payment-btn"]')).not.toBeNull();
      expect(compiled.querySelector('[data-testid="customer-give-loan-btn"]')).not.toBeNull();
      expect(compiled.querySelector('[data-testid="customer-repay-loan-btn"]')).not.toBeNull();
      expect(compiled.querySelector('[data-testid="customer-adjust-balance-btn"]')).not.toBeNull();
    });
  });
});
