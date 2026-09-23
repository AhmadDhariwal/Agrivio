import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { of, throwError } from 'rxjs';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { AdjustBalanceDialogComponent } from './adjust-balance-dialog.component';
import { AccountsApi } from '../../data-access/accounts.api';
import { AccountRecord } from '../../models/accounts.models';

const mockAccount: AccountRecord = {
  id: 'acc-1',
  organizationId: 'org-1',
  accountType: 'cash',
  name: 'Main Cash Register',
  bankName: '',
  accountNumberMasked: '',
  walletIdentifier: '',
  status: 'active',
  version: 3,
  derivedBalances: { balance: { amount: '100000.00', currency: 'PKR' } },
};

describe('AdjustBalanceDialogComponent', () => {
  let fixture: ComponentFixture<AdjustBalanceDialogComponent>;
  let component: AdjustBalanceDialogComponent;
  let mockApi: {
    listAccounts: ReturnType<typeof vi.fn>;
    getAccount: ReturnType<typeof vi.fn>;
    adjustBalance: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    mockApi = {
      listAccounts: vi.fn().mockReturnValue(
        of({ items: [mockAccount], meta: { page: 1, pageSize: 200, total: 1 } }),
      ),
      getAccount: vi.fn().mockReturnValue(of(mockAccount)),
      adjustBalance: vi.fn().mockReturnValue(of({ id: 'adj-1', movementId: 'mov-1' })),
    };

    await TestBed.configureTestingModule({
      imports: [AdjustBalanceDialogComponent],
      providers: [{ provide: AccountsApi, useValue: mockApi }],
    }).compileComponents();

    fixture = TestBed.createComponent(AdjustBalanceDialogComponent);
    component = fixture.componentInstance;
  });

  it('calculates positive delta preview with explicit sign and direction', () => {
    fixture.componentRef.setInput('accounts', [mockAccount]);
    fixture.componentRef.setInput('open', true);
    fixture.componentRef.setInput('preselectedAccountId', 'acc-1');
    fixture.detectChanges();

    component.form.patchValue({
      actualBalance: '115000',
    });
    fixture.detectChanges();

    const delta = component.delta();
    expect(delta).toBe(15000);
    expect(component.formattedDelta()).toBe('+ PKR 15,000.00 (Increase)');

    const previewEl = fixture.nativeElement.querySelector('[data-testid="adjustment-preview"]');
    expect(previewEl).toBeTruthy();
    expect(previewEl.textContent).toContain('PKR 100,000.00');
    expect(previewEl.textContent).toContain('+ PKR 15,000.00 (Increase)');
  });

  it('calculates negative delta preview with explicit sign and direction', () => {
    fixture.componentRef.setInput('accounts', [mockAccount]);
    fixture.componentRef.setInput('open', true);
    fixture.componentRef.setInput('preselectedAccountId', 'acc-1');
    fixture.detectChanges();

    component.form.patchValue({
      actualBalance: '90000',
    });
    fixture.detectChanges();

    const delta = component.delta();
    expect(delta).toBe(-10000);
    expect(component.formattedDelta()).toBe('- PKR 10,000.00 (Decrease)');

    const previewEl = fixture.nativeElement.querySelector('[data-testid="adjustment-preview"]');
    expect(previewEl).toBeTruthy();
    expect(previewEl.textContent).toContain('- PKR 10,000.00 (Decrease)');
  });

  it('disables submission and shows no adjustment required message on no-op', () => {
    fixture.componentRef.setInput('accounts', [mockAccount]);
    fixture.componentRef.setInput('open', true);
    fixture.componentRef.setInput('preselectedAccountId', 'acc-1');
    fixture.detectChanges();

    component.form.patchValue({
      actualBalance: '100000',
      reason: 'Physical count verified matches',
    });
    fixture.detectChanges();

    expect(component.isNoOp()).toBe(true);

    const submitBtn = fixture.nativeElement.querySelector('[data-testid="adjust-submit-btn"]') as HTMLButtonElement;
    expect(submitBtn.disabled).toBe(true);

    const noOpEl = fixture.nativeElement.querySelector('[data-testid="no-op-message"]');
    expect(noOpEl).toBeTruthy();
    expect(noOpEl.textContent).toContain('No adjustment is required.');

    // Clicking submit does nothing
    component.submit();
    expect(mockApi.adjustBalance).not.toHaveBeenCalled();
  });

  it('submits valid adjustment payload with expected balance and version', () => {
    fixture.componentRef.setInput('accounts', [mockAccount]);
    fixture.componentRef.setInput('open', true);
    fixture.componentRef.setInput('preselectedAccountId', 'acc-1');
    fixture.detectChanges();

    component.form.patchValue({
      actualBalance: '120000',
      category: 'reconciliation',
      reason: 'Month end physical count adjustment',
      reference: 'RECON-2026-09',
      notes: 'Audited by head cashier',
      businessDate: '2026-09-24',
    });
    fixture.detectChanges();

    component.submit();

    expect(mockApi.adjustBalance).toHaveBeenCalledTimes(1);
    expect(mockApi.adjustBalance).toHaveBeenCalledWith(
      expect.objectContaining({
        accountId: 'acc-1',
        expectedCurrentBalance: { amount: '100000.00', currency: 'PKR' },
        desiredBalance: { amount: '120000.00', currency: 'PKR' },
        reason: 'Month end physical count adjustment',
        category: 'reconciliation',
        businessDate: '2026-09-24',
        reference: 'RECON-2026-09',
        notes: 'Audited by head cashier',
      }),
      expect.any(String),
    );
  });

  it('handles 409 stale balance conflict by updating authoritative balance without silently resubmitting', () => {
    const conflictError = new HttpErrorResponse({
      status: 409,
      error: {
        error: {
          code: 'VERSION_CONFLICT',
          message: 'The account balance changed concurrently.',
          details: {
            currentBalance: { amount: '130000.00', currency: 'PKR' },
            currentVersion: 4,
          },
        },
      },
    });

    mockApi.adjustBalance.mockReturnValue(throwError(() => conflictError));

    fixture.componentRef.setInput('open', true);
    fixture.componentRef.setInput('preselectedAccountId', 'acc-1');
    fixture.detectChanges();

    component.form.patchValue({
      actualBalance: '120000',
      reason: 'Reconciliation count',
    });
    fixture.detectChanges();

    component.submit();

    // Verify 409 error message prompt requirement
    expect(component.errorMessage()).toContain(
      'The account balance changed since this form was opened. Current balance is PKR 130,000.00. Review the new balance before adjusting.',
    );
    // Authoritative balance updated
    expect(component.currentBalanceAmount()).toBe('130000.00');
    // Does not silently resubmit
    expect(mockApi.adjustBalance).toHaveBeenCalledTimes(1);
  });
});
