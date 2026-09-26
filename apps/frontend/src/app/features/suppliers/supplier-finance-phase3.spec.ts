import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter, ActivatedRoute, convertToParamMap } from '@angular/router';
import { of, throwError } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';

import { SupplierFinanceApi } from './data-access/supplier-finance.api';
import { SuppliersApi } from './data-access/suppliers.api';
import { AccountsApi } from '../accounts-expenses/data-access/accounts.api';
import { SupplierPaymentsApi } from '../supplier-payments/data-access/supplier-payments.api';
import { AuthApi } from '../auth/data-access/auth.api';
import { AuthSessionStore } from '../auth/data-access/auth-session.store';
import { CapabilityService } from '../capabilities/data-access/capability.service';
import { QueryCacheService } from '../../shared/data-access/query-cache.service';
import { QUERY_CACHE_TAGS } from '../../shared/data-access/query-cache.tags';

import { RecordSupplierRefundDialogComponent } from './components/record-supplier-refund-dialog/record-supplier-refund-dialog.component';
import { ReverseSupplierRefundDialogComponent } from './components/reverse-supplier-refund-dialog/reverse-supplier-refund-dialog.component';
import { AdjustSupplierBalanceDialogComponent } from './components/adjust-supplier-balance-dialog/adjust-supplier-balance-dialog.component';
import { SupplierDetailPage } from './pages/supplier-detail/supplier-detail.page';
import { SupplierPaymentFormPage } from '../supplier-payments/pages/supplier-payment-form/supplier-payment-form.page';
import { SupplierLedgerPage } from '../supplier-payments/pages/supplier-ledger/supplier-ledger.page';

import {
  SupplierRecord,
  SupplierRefundRecord,
} from './models/suppliers.models';
import {
  humanizeLedgerItem,
} from '../customer-payments/models/ledger-presentation.util';

describe('AGRIVIO PHASE 3 FRONTEND: Supplier Refunds & Financial Balance Adjustments', () => {
  let httpTestingController: HttpTestingController;

  const mockSupplier: SupplierRecord = {
    id: 'supp-100',
    organizationId: 'org-1',
    name: 'Engro Fertilizers Ltd',
    phone: '042-35871234',
    contactName: 'Tariq Mehmood',
    email: 'info@engro.com',
    status: 'active',
    version: 1,
    derivedBalances: {
      payable: { amount: '40000.00', currency: 'PKR' },
      advance: { amount: '25000.00', currency: 'PKR' },
      netPayable: { amount: '15000.00', currency: 'PKR' },
    },
  };

  const mockRefund: SupplierRefundRecord = {
    id: 'ref-1',
    organizationId: 'org-1',
    supplierId: 'supp-100',
    accountId: 'acc-1',
    amount: { amount: '10000.00', currency: 'PKR' },
    businessDate: '2026-09-24',
    reference: 'REF-2026-001',
    notes: 'Advance refund for cancelled shipment',
    status: 'posted',
    postedBy: 'usr-1',
    reversedAt: null,
    reversedBy: null,
    reversalReason: null,
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
      name: 'Cash Counter 1',
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
    hasPermission: vi.fn(() => true),
    activeContext: vi.fn(() => ({ organizationId: 'org-1' })),
    session: vi.fn(() => ({ user: { id: 'usr-1' }, activeContext: { organizationId: 'org-1' } })),
  };

  const mockCapabilityService = {
    canUseModule: vi.fn(() => true),
    canPerformAction: vi.fn(() => true),
    canViewField: vi.fn(() => true),
    canEditField: vi.fn(() => true),
    canUseView: vi.fn(() => true),
    canUseFeature: vi.fn(() => true),
  };

  beforeEach(() => {
    TestBed.resetTestingModule();
    vi.clearAllMocks();
  });

  // =========================================================================
  // 1. Record Refund
  // =========================================================================
  describe('1. Record Refund', () => {
    it('initializes with preselected supplier, available advance, and dispatches postRefund', () => {
      const financeApiMock = {
        postRefund: vi.fn().mockReturnValue(of(mockRefund)),
      };
      const accountsApiMock = {
        listAccountOptions: vi.fn().mockReturnValue(of(mockAccounts)),
      };

      TestBed.configureTestingModule({
        imports: [RecordSupplierRefundDialogComponent],
        providers: [
          { provide: SupplierFinanceApi, useValue: financeApiMock },
          { provide: AccountsApi, useValue: accountsApiMock },
        ],
      });

      const fixture = TestBed.createComponent(RecordSupplierRefundDialogComponent);
      fixture.componentRef.setInput('open', true);
      fixture.componentRef.setInput('supplier', mockSupplier);
      fixture.detectChanges();

      // Check helper text
      const compiled = fixture.nativeElement as HTMLElement;
      expect(compiled.textContent).toContain(
        'Use this when the supplier actually returns money held as Supplier Advance. It is not Revenue.',
      );

      // Preselected supplier and available advance
      expect(fixture.componentInstance.supplierName()).toBe('Engro Fertilizers Ltd');
      expect(fixture.componentInstance.availableAdvance()).toBe('25000.00');
      expect(fixture.componentInstance.availableAdvanceFormatted()).toBe('25,000.00');

      // Fill valid refund form
      fixture.componentInstance.form.patchValue({
        accountId: 'acc-1',
        amount: '10000.00',
        businessDate: '2026-09-24',
        reference: 'REF-2026-001',
        notes: 'Advance refund for cancelled shipment',
      });
      fixture.detectChanges();

      // Submit
      fixture.componentInstance.submit();

      expect(financeApiMock.postRefund).toHaveBeenCalledWith(
        expect.objectContaining({
          supplierId: 'supp-100',
          accountId: 'acc-1',
          amount: { amount: '10000.00', currency: 'PKR' },
          businessDate: '2026-09-24',
          reference: 'REF-2026-001',
          notes: 'Advance refund for cancelled shipment',
        }),
        expect.any(String), // Idempotency Key
      );
    });
  });

  // =========================================================================
  // 2. Account Selector
  // =========================================================================
  describe('2. Account Selector', () => {
    it('reuses AccountsApi.listAccountOptions and filters to active liquid accounts', () => {
      const accountsApiMock = {
        listAccountOptions: vi.fn().mockReturnValue(of(mockAccounts)),
      };

      TestBed.configureTestingModule({
        imports: [RecordSupplierRefundDialogComponent],
        providers: [
          { provide: SupplierFinanceApi, useValue: { postRefund: vi.fn() } },
          { provide: AccountsApi, useValue: accountsApiMock },
        ],
      });

      const fixture = TestBed.createComponent(RecordSupplierRefundDialogComponent);
      fixture.componentRef.setInput('open', true);
      fixture.detectChanges();

      expect(accountsApiMock.listAccountOptions).toHaveBeenCalledTimes(1);

      // Only active liquid accounts should be available (2 of 3)
      const options = fixture.componentInstance.accountOptions();
      expect(options.length).toBe(2);
      expect(options.find((o) => o.value === 'acc-3')).toBeUndefined();
      expect(options[0]?.label).toContain('HBL Main Bank');
    });
  });

  // =========================================================================
  // 3. Refund > Advance blocked
  // =========================================================================
  describe('3. Refund > Advance blocked', () => {
    it('blocks amount <= 0 and amount exceeding available advance', () => {
      const financeApiMock = {
        postRefund: vi.fn(),
      };

      TestBed.configureTestingModule({
        imports: [RecordSupplierRefundDialogComponent],
        providers: [
          { provide: SupplierFinanceApi, useValue: financeApiMock },
          { provide: AccountsApi, useValue: { listAccountOptions: vi.fn().mockReturnValue(of(mockAccounts)) } },
        ],
      });

      const fixture = TestBed.createComponent(RecordSupplierRefundDialogComponent);
      fixture.componentRef.setInput('open', true);
      fixture.componentRef.setInput('supplier', mockSupplier); // available advance: 25000.00
      fixture.detectChanges();

      // Case 1: amount > advance (30000 > 25000)
      fixture.componentInstance.form.patchValue({
        accountId: 'acc-1',
        amount: '30000.00',
        businessDate: '2026-09-24',
      });
      fixture.detectChanges();

      expect(fixture.componentInstance.exceedsAdvance()).toBe(true);

      fixture.componentInstance.submit();
      expect(financeApiMock.postRefund).not.toHaveBeenCalled();

      // Case 2: amount <= 0
      fixture.componentInstance.form.patchValue({
        amount: '0.00',
      });
      fixture.detectChanges();

      expect(fixture.componentInstance.isInvalidAmount()).toBe(true);

      fixture.componentInstance.submit();
      expect(financeApiMock.postRefund).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // 4. Refund Preview
  // =========================================================================
  describe('4. Refund Preview', () => {
    it('displays negative supplier advance and positive account preview', () => {
      TestBed.configureTestingModule({
        imports: [RecordSupplierRefundDialogComponent],
        providers: [
          { provide: SupplierFinanceApi, useValue: { postRefund: vi.fn() } },
          { provide: AccountsApi, useValue: { listAccountOptions: vi.fn().mockReturnValue(of(mockAccounts)) } },
        ],
      });

      const fixture = TestBed.createComponent(RecordSupplierRefundDialogComponent);
      fixture.componentRef.setInput('open', true);
      fixture.componentRef.setInput('supplier', mockSupplier);
      fixture.detectChanges();

      fixture.componentInstance.form.patchValue({
        accountId: 'acc-1',
        amount: '12500.00',
        businessDate: '2026-09-24',
      });
      fixture.detectChanges();

      expect(fixture.componentInstance.hasPreview()).toBe(true);
      expect(fixture.componentInstance.formattedAmount()).toContain('12,500.00');
      expect(fixture.componentInstance.selectedAccountName()).toBe('HBL Main Bank');

      const compiled = fixture.nativeElement as HTMLElement;
      expect(compiled.querySelector('[data-testid="preview-advance-delta"]')?.textContent).toContain('- PKR 12,500.00');
      expect(compiled.querySelector('[data-testid="preview-account-delta"]')?.textContent).toContain('+ PKR 12,500.00');
    });
  });

  // =========================================================================
  // 5. Refund Reversal Confirmation
  // =========================================================================
  describe('5. Refund Reversal Confirmation', () => {
    it('displays reversal confirmation, requires reason, and posts single reversal', () => {
      const financeApiMock = {
        reverseRefund: vi.fn().mockReturnValue(of({ ...mockRefund, status: 'reversed' })),
      };

      TestBed.configureTestingModule({
        imports: [ReverseSupplierRefundDialogComponent],
        providers: [{ provide: SupplierFinanceApi, useValue: financeApiMock }],
      });

      const fixture = TestBed.createComponent(ReverseSupplierRefundDialogComponent);
      fixture.componentRef.setInput('open', true);
      fixture.componentRef.setInput('refund', mockRefund);
      fixture.componentRef.setInput('accountName', 'HBL Main Bank');
      fixture.detectChanges();

      const compiled = fixture.nativeElement as HTMLElement;
      expect(compiled.querySelector('[data-testid="reversal-advance-impact"]')?.textContent).toContain('+ PKR 10000.00');
      expect(compiled.querySelector('[data-testid="reversal-account-impact"]')?.textContent).toContain('- PKR 10000.00');

      // Submit without reason should be blocked
      fixture.componentInstance.submit();
      expect(financeApiMock.reverseRefund).not.toHaveBeenCalled();

      // Fill reason and submit
      fixture.componentInstance.form.patchValue({
        reason: 'Refund deposited to wrong account; cheque returned',
      });
      fixture.detectChanges();

      fixture.componentInstance.submit();
      expect(financeApiMock.reverseRefund).toHaveBeenCalledWith(
        'ref-1',
        { reason: 'Refund deposited to wrong account; cheque returned' },
        expect.any(String), // Idempotency Key
      );
    });
  });

  // =========================================================================
  // 6. Payable Adjustment
  // =========================================================================
  describe('6. Payable Adjustment', () => {
    it('displays payable current balance, helper guidance, and posts adjustment', () => {
      const financeApiMock = {
        adjustBalance: vi.fn().mockReturnValue(
          of({
            id: 'adj-1',
            supplierId: 'supp-100',
            balanceType: 'supplier_payable',
            expectedCurrentBalance: { amount: '40000.00', currency: 'PKR' },
            desiredBalance: { amount: '45000.00', currency: 'PKR' },
            delta: { amount: '5000.00', currency: 'PKR' },
            signedDeltaMinorUnits: '500000',
            reason: 'Reconciliation correction',
            category: 'reconciliation',
            businessDate: '2026-09-24',
            status: 'posted',
          }),
        ),
      };

      TestBed.configureTestingModule({
        imports: [AdjustSupplierBalanceDialogComponent],
        providers: [{ provide: SupplierFinanceApi, useValue: financeApiMock }],
      });

      const fixture = TestBed.createComponent(AdjustSupplierBalanceDialogComponent);
      fixture.componentRef.setInput('open', true);
      fixture.componentRef.setInput('supplier', mockSupplier);
      fixture.detectChanges();

      // Payable selected by default
      expect(fixture.componentInstance.formValue().balanceType).toBe('supplier_payable');
      expect(fixture.componentInstance.currentBalance()).toBe('40000.00');
      expect(fixture.componentInstance.currentHelperText()).toBe(
        'Use this only to correct the recorded Supplier Payable balance. If you actually paid the supplier, use Supplier Payment.',
      );

      // Desired balance: 45000.00
      fixture.componentInstance.form.patchValue({
        desiredBalance: '45000.00',
        reason: 'Reconciliation correction',
        category: 'reconciliation',
        businessDate: '2026-09-24',
      });
      fixture.detectChanges();

      expect(fixture.componentInstance.deltaAmount()).toBe(5000);
      expect(fixture.componentInstance.deltaFormatted()).toBe('+ PKR 5,000.00');

      fixture.componentInstance.submit();

      expect(financeApiMock.adjustBalance).toHaveBeenCalledWith(
        expect.objectContaining({
          supplierId: 'supp-100',
          balanceType: 'supplier_payable',
          expectedCurrentBalance: { amount: '40000.00', currency: 'PKR' },
          desiredBalance: { amount: '45000.00', currency: 'PKR' },
          reason: 'Reconciliation correction',
          category: 'reconciliation',
          businessDate: '2026-09-24',
        }),
        expect.any(String),
      );
    });
  });

  // =========================================================================
  // 7. Advance Adjustment
  // =========================================================================
  describe('7. Advance Adjustment', () => {
    it('displays advance current balance, helper guidance, and posts adjustment', () => {
      const financeApiMock = {
        adjustBalance: vi.fn().mockReturnValue(
          of({
            id: 'adj-2',
            supplierId: 'supp-100',
            balanceType: 'supplier_advance',
            expectedCurrentBalance: { amount: '25000.00', currency: 'PKR' },
            desiredBalance: { amount: '20000.00', currency: 'PKR' },
            delta: { amount: '-5000.00', currency: 'PKR' },
            signedDeltaMinorUnits: '-500000',
            reason: 'Opening advance audit correction',
            category: 'opening_correction',
            businessDate: '2026-09-24',
            status: 'posted',
          }),
        ),
      };

      TestBed.configureTestingModule({
        imports: [AdjustSupplierBalanceDialogComponent],
        providers: [{ provide: SupplierFinanceApi, useValue: financeApiMock }],
      });

      const fixture = TestBed.createComponent(AdjustSupplierBalanceDialogComponent);
      fixture.componentRef.setInput('open', true);
      fixture.componentRef.setInput('supplier', mockSupplier);
      fixture.detectChanges();

      // Switch to supplier_advance
      fixture.componentInstance.form.controls.balanceType.setValue('supplier_advance');
      fixture.detectChanges();

      expect(fixture.componentInstance.currentBalance()).toBe('25000.00');
      expect(fixture.componentInstance.currentHelperText()).toBe(
        'Use this only to correct the recorded Supplier Advance. If the supplier actually returned money, use Record Refund.',
      );

      // Desired balance: 20000.00
      fixture.componentInstance.form.patchValue({
        desiredBalance: '20000.00',
        reason: 'Opening advance audit correction',
        category: 'opening_correction',
        businessDate: '2026-09-24',
      });
      fixture.detectChanges();

      expect(fixture.componentInstance.deltaAmount()).toBe(-5000);
      expect(fixture.componentInstance.deltaFormatted()).toBe('- PKR 5,000.00');

      fixture.componentInstance.submit();

      expect(financeApiMock.adjustBalance).toHaveBeenCalledWith(
        expect.objectContaining({
          supplierId: 'supp-100',
          balanceType: 'supplier_advance',
          expectedCurrentBalance: { amount: '25000.00', currency: 'PKR' },
          desiredBalance: { amount: '20000.00', currency: 'PKR' },
          category: 'opening_correction',
        }),
        expect.any(String),
      );
    });
  });

  // =========================================================================
  // 8. No-Op Adjustment
  // =========================================================================
  describe('8. No-Op Adjustment', () => {
    it('disables submit and shows guidance when desired equals current balance', () => {
      const financeApiMock = {
        adjustBalance: vi.fn(),
      };

      TestBed.configureTestingModule({
        imports: [AdjustSupplierBalanceDialogComponent],
        providers: [{ provide: SupplierFinanceApi, useValue: financeApiMock }],
      });

      const fixture = TestBed.createComponent(AdjustSupplierBalanceDialogComponent);
      fixture.componentRef.setInput('open', true);
      fixture.componentRef.setInput('supplier', mockSupplier); // payable: 40000.00
      fixture.detectChanges();

      fixture.componentInstance.form.patchValue({
        desiredBalance: '40000.00',
        reason: 'Same balance test',
        category: 'reconciliation',
      });
      fixture.detectChanges();

      expect(fixture.componentInstance.isNoOp()).toBe(true);

      const compiled = fixture.nativeElement as HTMLElement;
      expect(compiled.querySelector('[data-testid="adjust-noop-message"]')?.textContent).toContain(
        'No adjustment is required. Desired balance matches current authoritative balance.',
      );

      fixture.componentInstance.submit();
      expect(financeApiMock.adjustBalance).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // 9. Stale 409 Conflict
  // =========================================================================
  describe('9. Stale 409 Conflict & Concurrency', () => {
    it('handles stale 409 by updating authoritative balance and warning user', () => {
      const conflictError = new HttpErrorResponse({
        status: 409,
        statusText: 'Conflict',
        error: {
          error: {
            code: 'VERSION_CONFLICT',
            message: 'Supplier balance changed; review the latest authoritative balance',
            details: {
              latestBalance: { amount: '48000.00', currency: 'PKR' },
            },
          },
        },
      });

      const financeApiMock = {
        adjustBalance: vi.fn().mockReturnValue(throwError(() => conflictError)),
      };

      TestBed.configureTestingModule({
        imports: [AdjustSupplierBalanceDialogComponent],
        providers: [{ provide: SupplierFinanceApi, useValue: financeApiMock }],
      });

      const fixture = TestBed.createComponent(AdjustSupplierBalanceDialogComponent);
      fixture.componentRef.setInput('open', true);
      fixture.componentRef.setInput('supplier', mockSupplier); // initial: 40000.00
      fixture.detectChanges();

      fixture.componentInstance.form.patchValue({
        desiredBalance: '45000.00',
        reason: 'Stale test',
        category: 'reconciliation',
      });
      fixture.detectChanges();

      fixture.componentInstance.submit();
      fixture.detectChanges();

      // Authoritative balance must be updated from 409
      expect(fixture.componentInstance.currentBalance()).toBe('48000.00');
      expect(fixture.componentInstance.staleConflictMessage()).toContain(
        'The supplier balance changed since this form was opened. Current Supplier Payable is PKR 48000.00.',
      );
    });

    it('updates refund available advance when backend reports concurrent change', () => {
      const refundError = new HttpErrorResponse({
        status: 400,
        statusText: 'Bad Request',
        error: {
          error: {
            code: 'VALIDATION_FAILED',
            message: 'Refund exceeds available supplier advance',
            details: [
              {
                field: 'amount',
                message: 'latest available advance is 18000.00',
                latestAvailableAdvance: { amount: '18000.00', currency: 'PKR' },
              },
            ],
          },
        },
      });

      const financeApiMock = {
        postRefund: vi.fn().mockReturnValue(throwError(() => refundError)),
      };

      TestBed.configureTestingModule({
        imports: [RecordSupplierRefundDialogComponent],
        providers: [
          { provide: SupplierFinanceApi, useValue: financeApiMock },
          { provide: AccountsApi, useValue: { listAccountOptions: vi.fn().mockReturnValue(of(mockAccounts)) } },
        ],
      });

      const fixture = TestBed.createComponent(RecordSupplierRefundDialogComponent);
      fixture.componentRef.setInput('open', true);
      fixture.componentRef.setInput('supplier', mockSupplier); // initial: 25000.00
      fixture.detectChanges();

      fixture.componentInstance.form.patchValue({
        accountId: 'acc-1',
        amount: '20000.00',
        businessDate: '2026-09-24',
      });
      fixture.detectChanges();

      fixture.componentInstance.submit();
      fixture.detectChanges();

      expect(fixture.componentInstance.availableAdvance()).toBe('18000.00');
      expect(fixture.componentInstance.errorMessage()).toContain('Refund exceeds available supplier advance');
    });
  });

  // =========================================================================
  // 10. Supplier Ledger Presentation
  // =========================================================================
  describe('10. Supplier Ledger Labels & Signs', () => {
    it('humanizes Phase 3 ledger events with correct titles, labels, and signs', () => {
      // 1. Supplier Advance Refunded
      const refundEffect = humanizeLedgerItem({
        id: 'eff-1',
        sourceType: 'supplier_advance_refund',
        sourceId: 'ref-1',
        effectKind: 'supplier_advance',
        signedAmount: { amount: '-10000.00' },
        currency: 'PKR',
        postedAt: '2026-09-24T10:00:00Z',
      });
      expect(refundEffect.title).toBe('Supplier Advance Refunded');
      expect(refundEffect.sourceTypeLabel).toBe('Supplier Refund');
      expect(refundEffect.amountSign).toBe('-');
      expect(refundEffect.isPositive).toBe(false);

      // 2. Supplier Refund Reversed
      const reversalEffect = humanizeLedgerItem({
        id: 'eff-2',
        sourceType: 'supplier_advance_refund_reversal',
        sourceId: 'ref-1',
        effectKind: 'supplier_advance',
        signedAmount: { amount: '10000.00' },
        currency: 'PKR',
        postedAt: '2026-09-24T11:00:00Z',
      });
      expect(reversalEffect.title).toBe('Supplier Refund Reversed');
      expect(reversalEffect.sourceTypeLabel).toBe('Supplier Refund Reversal');
      expect(reversalEffect.amountSign).toBe('+');
      expect(reversalEffect.isPositive).toBe(true);

      // 3. Supplier Payable Adjustment
      const payableAdjEffect = humanizeLedgerItem({
        id: 'eff-3',
        sourceType: 'supplier_payable_adjustment',
        sourceId: 'adj-1',
        effectKind: 'payable',
        signedAmount: { amount: '5000.00' },
        currency: 'PKR',
        postedAt: '2026-09-24T12:00:00Z',
      });
      expect(payableAdjEffect.title).toBe('Supplier Payable Adjustment');
      expect(payableAdjEffect.sourceTypeLabel).toBe('Payable Adjustment');

      // 4. Supplier Advance Adjustment
      const advanceAdjEffect = humanizeLedgerItem({
        id: 'eff-4',
        sourceType: 'supplier_advance_adjustment',
        sourceId: 'adj-2',
        effectKind: 'supplier_advance',
        signedAmount: { amount: '-3000.00' },
        currency: 'PKR',
        postedAt: '2026-09-24T13:00:00Z',
      });
      expect(advanceAdjEffect.title).toBe('Supplier Advance Adjustment');
      expect(advanceAdjEffect.sourceTypeLabel).toBe('Advance Adjustment');

      // 5. Supplier Balance Adjustment Reversed
      const adjReversalEffect = humanizeLedgerItem({
        id: 'eff-5',
        sourceType: 'supplier_balance_adjustment_reversal',
        sourceId: 'adj-3',
        effectKind: 'payable',
        signedAmount: { amount: '-5000.00' },
        currency: 'PKR',
        postedAt: '2026-09-24T14:00:00Z',
      });
      expect(adjReversalEffect.title).toBe('Supplier Balance Adjustment Reversed');
      expect(adjReversalEffect.sourceTypeLabel).toBe('Adjustment Reversal');
    });
  });

  // =========================================================================
  // 11. Reconciliation Remains Visible
  // =========================================================================
  describe('11. Reconciliation UI', () => {
    it('preserves reconciliation status and displays diagnostic findings', () => {
      const mockReconciliation = {
        supplierId: 'supp-100',
        ok: false,
        payable: { amount: '40000.00', currency: 'PKR' },
        advance: { amount: '25000.00', currency: 'PKR' },
        netPayable: { amount: '15000.00', currency: 'PKR' },
        allocationTotal: { amount: '0.00', currency: 'PKR' },
        accountMovementTotal: { amount: '0.00', currency: 'PKR' },
        findings: [
          {
            code: 'UNALLOCATED_SUPPLIER_ADVANCE_WITH_PAYABLE',
            message: 'Supplier advance coexists with open payable targets',
          },
        ],
      };

      const paymentsApiMock = {
        listSupplierLedgerSuppliers: vi.fn().mockReturnValue(of([mockSupplier])),
        listSupplierLedger: vi.fn().mockReturnValue(of([])),
        reconcileSupplier: vi.fn().mockReturnValue(of(mockReconciliation)),
      };

      TestBed.configureTestingModule({
        imports: [SupplierLedgerPage],
        providers: [
          { provide: SupplierPaymentsApi, useValue: paymentsApiMock },
          { provide: AuthSessionStore, useValue: mockSessionStore },
          { provide: CapabilityService, useValue: mockCapabilityService },
          provideRouter([]),
        ],
      });

      const fixture = TestBed.createComponent(SupplierLedgerPage);
      fixture.detectChanges();

      fixture.componentInstance.form.controls.supplierId.setValue('supp-100');
      fixture.detectChanges();

      const compiled = fixture.nativeElement as HTMLElement;
      expect(compiled.querySelector('[data-testid="reconciliation-panel"]')).not.toBeNull();
      expect(compiled.textContent).toContain('UNALLOCATED_SUPPLIER_ADVANCE_WITH_PAYABLE');
      expect(compiled.querySelector('[data-testid="supplier-ledger-net-payable"]')?.textContent).toContain(
        'PKR 15000.00',
      );
    });
  });

  // =========================================================================
  // 12. Permissions
  // =========================================================================
  describe('12. Permissions', () => {
    it('enforces exact backend permission matrix on Supplier Detail actions', () => {
      let permissions = new Set<string>();
      const dynamicSessionStore = {
        hasPermission: (perm: string) => permissions.has(perm),
        activeContext: () => ({ organizationId: 'org-1' }),
      };

      const suppliersApiMock = {
        getSupplier: vi.fn().mockReturnValue(of(mockSupplier)),
      };
      const financeApiMock = {
        listRefunds: vi.fn().mockReturnValue(of({ items: [], total: 0 })),
      };

      TestBed.configureTestingModule({
        imports: [SupplierDetailPage],
        providers: [
          provideRouter([]),
          { provide: SuppliersApi, useValue: suppliersApiMock },
          { provide: SupplierFinanceApi, useValue: financeApiMock },
          { provide: AccountsApi, useValue: { listAccountOptions: vi.fn().mockReturnValue(of(mockAccounts)) } },
          { provide: AuthSessionStore, useValue: dynamicSessionStore },
          { provide: CapabilityService, useValue: mockCapabilityService },
          {
            provide: ActivatedRoute,
            useValue: { snapshot: { paramMap: convertToParamMap({ id: 'supp-100' }) } },
          },
        ],
      });

      // 1. Only suppliers.view
      permissions = new Set(['suppliers.view']);
      let fixture = TestBed.createComponent(SupplierDetailPage);
      fixture.detectChanges();

      expect(fixture.componentInstance.canRecordRefund()).toBe(false);
      expect(fixture.componentInstance.canReverseRefund()).toBe(false);
      expect(fixture.componentInstance.canAdjustBalance()).toBe(false);
      expect(fixture.componentInstance.canPaySupplier()).toBe(false);

      // 2. Add supplier-payments.post only (needs accounts.transaction.post for refund)
      permissions.add('supplier-payments.post');
      fixture = TestBed.createComponent(SupplierDetailPage);
      fixture.detectChanges();

      expect(fixture.componentInstance.canPaySupplier()).toBe(true);
      expect(fixture.componentInstance.canRecordRefund()).toBe(false);

      // 3. Add accounts.transaction.post
      permissions.add('accounts.transaction.post');
      fixture = TestBed.createComponent(SupplierDetailPage);
      fixture.detectChanges();

      expect(fixture.componentInstance.canRecordRefund()).toBe(true);

      // 4. Reverse refund requires payments.correct AND accounts.transaction.correct
      permissions.add('payments.correct');
      fixture = TestBed.createComponent(SupplierDetailPage);
      fixture.detectChanges();
      expect(fixture.componentInstance.canReverseRefund()).toBe(false);

      permissions.add('accounts.transaction.correct');
      fixture = TestBed.createComponent(SupplierDetailPage);
      fixture.detectChanges();
      expect(fixture.componentInstance.canReverseRefund()).toBe(true);

      // 5. Adjust balance requires suppliers.manage
      permissions.add('suppliers.manage');
      fixture = TestBed.createComponent(SupplierDetailPage);
      fixture.detectChanges();
      expect(fixture.componentInstance.canAdjustBalance()).toBe(true);
    });
  });

  // =========================================================================
  // 13 & 14. Targeted Invalidation & Balance Adjustment Invalidation
  // =========================================================================
  describe('13 & 14. Targeted Invalidation & Accounts Protection', () => {
    it('Refund invalidates supplier, ledger, payables, refunds, accounts, and dashboard', () => {
      const invalidateTagsSpy = vi.fn();
      const queryCacheMock = {
        invalidateTags: invalidateTagsSpy,
        buildKey: vi.fn(),
        fetch: vi.fn(),
      } as unknown as QueryCacheService;

      TestBed.configureTestingModule({
        providers: [
          provideHttpClient(),
          provideHttpClientTesting(),
          SupplierFinanceApi,
          { provide: QueryCacheService, useValue: queryCacheMock },
          { provide: AuthApi, useClass: AuthApiMock },
        ],
      });

      const api = TestBed.inject(SupplierFinanceApi);
      httpTestingController = TestBed.inject(HttpTestingController);

      api.postRefund(
        {
          supplierId: 'supp-100',
          accountId: 'acc-1',
          amount: { amount: '10000.00', currency: 'PKR' },
          businessDate: '2026-09-24',
        },
        'key-1',
      ).subscribe();

      const req = httpTestingController.expectOne((r) => r.url.includes('/api/v1/supplier-refunds'));
      expect(req.request.method).toBe('POST');
      req.flush({ data: mockRefund, requestId: 'req-1' });

      // Verifies all tags invalidated by refund
      const invalidatedTags = invalidateTagsSpy.mock.calls.flatMap((call) => call);
      expect(invalidatedTags).toContain(QUERY_CACHE_TAGS.suppliers);
      expect(invalidatedTags).toContain(QUERY_CACHE_TAGS.supplierLedger);
      expect(invalidatedTags).toContain(QUERY_CACHE_TAGS.payables);
      expect(invalidatedTags).toContain(QUERY_CACHE_TAGS.supplierRefunds);
      expect(invalidatedTags).toContain(QUERY_CACHE_TAGS.accounts);
      expect(invalidatedTags).toContain(QUERY_CACHE_TAGS.accountsSummary);
      expect(invalidatedTags).toContain(QUERY_CACHE_TAGS.accountMovements);
      expect(invalidatedTags).toContain(QUERY_CACHE_TAGS.dashboard);
      expect(invalidatedTags).toContain(QUERY_CACHE_TAGS.reports);
    });

    it('Balance Adjustment does NOT invalidate Cash/Bank accounts', () => {
      const invalidateTagsSpy = vi.fn();
      const queryCacheMock = {
        invalidateTags: invalidateTagsSpy,
        buildKey: vi.fn(),
        fetch: vi.fn(),
      } as unknown as QueryCacheService;

      TestBed.configureTestingModule({
        providers: [
          provideHttpClient(),
          provideHttpClientTesting(),
          SupplierFinanceApi,
          { provide: QueryCacheService, useValue: queryCacheMock },
          { provide: AuthApi, useClass: AuthApiMock },
        ],
      });

      const api = TestBed.inject(SupplierFinanceApi);
      httpTestingController = TestBed.inject(HttpTestingController);

      api.adjustBalance(
        {
          supplierId: 'supp-100',
          balanceType: 'supplier_payable',
          expectedCurrentBalance: { amount: '40000.00', currency: 'PKR' },
          desiredBalance: { amount: '45000.00', currency: 'PKR' },
          reason: 'Correction',
          category: 'reconciliation',
          businessDate: '2026-09-24',
        },
        'key-2',
      ).subscribe();

      const req = httpTestingController.expectOne((r) => r.url.includes('/api/v1/supplier-balance-adjustments'));
      expect(req.request.method).toBe('POST');
      req.flush({
        data: {
          id: 'adj-1',
          supplierId: 'supp-100',
          balanceType: 'supplier_payable',
          expectedCurrentBalance: { amount: '40000.00', currency: 'PKR' },
          desiredBalance: { amount: '45000.00', currency: 'PKR' },
          delta: { amount: '5000.00', currency: 'PKR' },
          signedDeltaMinorUnits: '500000',
          reason: 'Correction',
          category: 'reconciliation',
          businessDate: '2026-09-24',
          status: 'posted',
        },
        requestId: 'req-2',
      });

      const invalidatedTags = invalidateTagsSpy.mock.calls.flatMap((call) => call);
      expect(invalidatedTags).toContain(QUERY_CACHE_TAGS.suppliers);
      expect(invalidatedTags).toContain(QUERY_CACHE_TAGS.supplierLedger);
      expect(invalidatedTags).toContain(QUERY_CACHE_TAGS.payables);
      expect(invalidatedTags).toContain(QUERY_CACHE_TAGS.supplierPayments);
      expect(invalidatedTags).toContain(QUERY_CACHE_TAGS.reconciliation);
      expect(invalidatedTags).toContain(QUERY_CACHE_TAGS.dashboard);
      expect(invalidatedTags).toContain(QUERY_CACHE_TAGS.reports);

      // MUST NOT invalidate accounts!
      expect(invalidatedTags).not.toContain(QUERY_CACHE_TAGS.accounts);
      expect(invalidatedTags).not.toContain(QUERY_CACHE_TAGS.accountOptions);
      expect(invalidatedTags).not.toContain(QUERY_CACHE_TAGS.accountsSummary);
      expect(invalidatedTags).not.toContain(QUERY_CACHE_TAGS.accountMovements);
    });
  });

  // =========================================================================
  // 15. Single POST / No Duplicate Submission
  // =========================================================================
  describe('15. Single POST / No Duplicate Submission', () => {
    it('sets saving=true and disables submit button during request flight', () => {
      const financeApiMock = {
        postRefund: vi.fn().mockReturnValue(of(mockRefund)),
      };

      TestBed.configureTestingModule({
        imports: [RecordSupplierRefundDialogComponent],
        providers: [
          { provide: SupplierFinanceApi, useValue: financeApiMock },
          { provide: AccountsApi, useValue: { listAccountOptions: vi.fn().mockReturnValue(of(mockAccounts)) } },
        ],
      });

      const fixture = TestBed.createComponent(RecordSupplierRefundDialogComponent);
      fixture.componentRef.setInput('open', true);
      fixture.componentRef.setInput('supplier', mockSupplier);
      fixture.detectChanges();

      fixture.componentInstance.form.patchValue({
        accountId: 'acc-1',
        amount: '5000.00',
        businessDate: '2026-09-24',
      });
      fixture.detectChanges();

      // Submit once
      fixture.componentInstance.submit();
      expect(fixture.componentInstance.saving()).toBe(false); // completed via synchronous of()
      expect(financeApiMock.postRefund).toHaveBeenCalledTimes(1);

      // While saving=true, second call does nothing
      fixture.componentInstance.saving.set(true);
      fixture.componentInstance.submit();
      expect(financeApiMock.postRefund).toHaveBeenCalledTimes(1);
    });
  });

  // =========================================================================
  // 16. Existing Supplier Payment UI Unchanged
  // =========================================================================
  describe('16. Existing Supplier Payment UI Non-Regression', () => {
    it('preserves general allocation and invoice-specific allocation options', () => {
      const paymentsApiMock = {
        listUnpaidPurchases: vi.fn().mockReturnValue(of([])),
        listSupplierLedger: vi.fn().mockReturnValue(of([])),
        postSupplierPayment: vi.fn(),
      };

      TestBed.configureTestingModule({
        imports: [SupplierPaymentFormPage],
        providers: [
          { provide: SupplierPaymentsApi, useValue: paymentsApiMock },
          { provide: SuppliersApi, useValue: { searchSupplierOptions: vi.fn().mockReturnValue(of([mockSupplier])), getSupplier: vi.fn().mockReturnValue(of(mockSupplier)) } },
          { provide: AccountsApi, useValue: { listAccountOptions: vi.fn().mockReturnValue(of(mockAccounts)) } },
          { provide: AuthSessionStore, useValue: mockSessionStore },
          { provide: CapabilityService, useValue: mockCapabilityService },
          provideRouter([]),
        ],
      });

      const fixture = TestBed.createComponent(SupplierPaymentFormPage);
      fixture.detectChanges();

      // Default mode is general
      expect(fixture.componentInstance.form.controls.allocationMode.value).toBe('general');
      expect(fixture.componentInstance.selectedAllocationMode()).toBe('General (oldest-first)');

      // Switch to invoice_specific
      fixture.componentInstance.setAllocationMode('invoice_specific');
      expect(fixture.componentInstance.form.controls.allocationMode.value).toBe('invoice_specific');
      expect(fixture.componentInstance.selectedAllocationMode()).toBe('Invoice-specific');
    });
  });

  // =========================================================================
  // 17. General Supplier Payment Renders Manual Payable Target
  // =========================================================================
  describe('17. General Supplier Payment Renders Manual Payable Target', () => {
    it('renders manual payable target returned by backend in unpaidPurchaseOptions', () => {
      const mockTargets = [
        {
          id: 'open-1',
          targetType: 'supplier_opening_payable',
          purchaseDate: '2026-09-01',
          dueDate: null,
          sequence: null,
          outstanding: { amount: '10000.00', currency: 'PKR' },
          outstandingMinorUnits: '1000000',
        },
        {
          id: 'adj-manual-1',
          targetType: 'supplier_manual_payable',
          purchaseDate: '2026-09-20',
          dueDate: null,
          sequence: 'adj-manual-1',
          reference: 'Manual audit adjustment payable',
          outstanding: { amount: '5000.00', currency: 'PKR' },
          outstandingMinorUnits: '500000',
        },
        {
          id: 'purch-1',
          targetType: 'purchase',
          purchaseDate: '2026-09-15',
          dueDate: '2026-10-15',
          sequence: 'PO-2026-001',
          outstanding: { amount: '25000.00', currency: 'PKR' },
          outstandingMinorUnits: '2500000',
        },
      ];

      const paymentsApiMock = {
        listUnpaidPurchases: vi.fn().mockReturnValue(of(mockTargets)),
        listSupplierLedger: vi.fn().mockReturnValue(of([])),
        postSupplierPayment: vi.fn(),
      };

      TestBed.configureTestingModule({
        imports: [SupplierPaymentFormPage],
        providers: [
          { provide: SupplierPaymentsApi, useValue: paymentsApiMock },
          { provide: SuppliersApi, useValue: { searchSupplierOptions: vi.fn().mockReturnValue(of([mockSupplier])), getSupplier: vi.fn().mockReturnValue(of(mockSupplier)) } },
          { provide: AccountsApi, useValue: { listAccountOptions: vi.fn().mockReturnValue(of(mockAccounts)) } },
          { provide: AuthSessionStore, useValue: mockSessionStore },
          { provide: CapabilityService, useValue: mockCapabilityService },
          provideRouter([]),
        ],
      });

      const fixture = TestBed.createComponent(SupplierPaymentFormPage);
      fixture.detectChanges();

      fixture.componentInstance.unpaidPurchases.set(mockTargets);
      fixture.detectChanges();

      const options = fixture.componentInstance.unpaidPurchaseOptions();
      expect(options.length).toBe(3);

      // Opening payable
      expect(options[0]?.label).toBe('Opening payable');

      // Manual payable target with reference
      expect(options[1]?.label).toBe('Manual audit adjustment payable');
      expect(options[1]?.description).toContain('5000.00 PKR');

      // Normal purchase
      expect(options[2]?.label).toBe('PO-2026-001');
    });
  });

  // =========================================================================
  // 18. Responsive Structure
  // =========================================================================
  describe('18. Responsive Structure', () => {
    it('verifies responsive classes and layout wrappers on Supplier Detail and dialogs', () => {
      const suppliersApiMock = {
        getSupplier: vi.fn().mockReturnValue(of(mockSupplier)),
      };
      const financeApiMock = {
        listRefunds: vi.fn().mockReturnValue(of({ items: [mockRefund], total: 1 })),
      };

      TestBed.configureTestingModule({
        imports: [SupplierDetailPage],
        providers: [
          provideRouter([]),
          { provide: SuppliersApi, useValue: suppliersApiMock },
          { provide: SupplierFinanceApi, useValue: financeApiMock },
          { provide: AccountsApi, useValue: { listAccountOptions: vi.fn().mockReturnValue(of(mockAccounts)) } },
          { provide: AuthSessionStore, useValue: mockSessionStore },
          { provide: CapabilityService, useValue: mockCapabilityService },
          {
            provide: ActivatedRoute,
            useValue: { snapshot: { paramMap: convertToParamMap({ id: 'supp-100' }) } },
          },
        ],
      });

      const fixture = TestBed.createComponent(SupplierDetailPage);
      fixture.detectChanges();

      const compiled = fixture.nativeElement as HTMLElement;
      expect(compiled.querySelector('.detail-shell')).not.toBeNull();
      expect(compiled.querySelector('.table-responsive')).not.toBeNull();
      expect(compiled.querySelector('[data-testid="supplier-refunds-table"]')).not.toBeNull();
      expect(compiled.querySelector('[data-testid="supplier-financial-summary-card"]')).not.toBeNull();
    });
  });
});

class AuthApiMock {
  ensureCsrf() {
    return of({ csrfToken: 'mock-csrf-token' });
  }
}
