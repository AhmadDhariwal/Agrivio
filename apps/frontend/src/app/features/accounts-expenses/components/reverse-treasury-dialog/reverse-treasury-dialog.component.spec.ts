import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { ReverseTreasuryDialogComponent } from './reverse-treasury-dialog.component';
import { AccountsApi } from '../../data-access/accounts.api';
import { AccountMovementRecord } from '../../models/accounts.models';

const mockTransferMovement: AccountMovementRecord = {
  id: 'mov-trf-out-1',
  organizationId: 'org-1',
  accountId: 'acc-cash',
  direction: 'outflow',
  sourceType: 'account_transfer_out',
  sourceId: 'trf-999',
  purpose: 'Transfer to HBL',
  category: 'transfer',
  signedAmount: { amount: '-80000.00', currency: 'PKR' },
  status: 'posted',
  postedAt: '2026-09-24T10:00:00Z',
  postedBy: 'user-1',
};

const mockAdjustmentMovement: AccountMovementRecord = {
  id: 'mov-adj-1',
  organizationId: 'org-1',
  accountId: 'acc-cash',
  direction: 'inflow',
  sourceType: 'account_balance_adjustment',
  sourceId: 'adj-888',
  purpose: 'Physical count reconciliation',
  category: 'reconciliation',
  signedAmount: { amount: '+15000.00', currency: 'PKR' },
  status: 'posted',
  postedAt: '2026-09-24T10:30:00Z',
  postedBy: 'user-1',
};

describe('ReverseTreasuryDialogComponent', () => {
  let fixture: ComponentFixture<ReverseTreasuryDialogComponent>;
  let component: ReverseTreasuryDialogComponent;
  let mockApi: {
    reverseTransfer: ReturnType<typeof vi.fn>;
    reverseManualTransaction: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    mockApi = {
      reverseTransfer: vi.fn().mockReturnValue(of({ id: 'trf-999' })),
      reverseManualTransaction: vi.fn().mockReturnValue(of({ id: 'mov-adj-1' })),
    };

    await TestBed.configureTestingModule({
      imports: [ReverseTreasuryDialogComponent],
      providers: [{ provide: AccountsApi, useValue: mockApi }],
    }).compileComponents();

    fixture = TestBed.createComponent(ReverseTreasuryDialogComponent);
    component = fixture.componentInstance;
  });

  it('renders confirmation view with details and required reason', () => {
    fixture.componentRef.setInput('open', true);
    fixture.componentRef.setInput('movement', mockTransferMovement);
    fixture.detectChanges();

    const detailsEl = fixture.nativeElement.querySelector('[data-testid="reversal-details-card"]');
    expect(detailsEl).toBeTruthy();
    expect(detailsEl.textContent).toContain('Internal Transfer');
    expect(detailsEl.textContent).toContain('80,000.00');

    const submitBtn = fixture.nativeElement.querySelector('[data-testid="confirm-reversal-btn"]') as HTMLButtonElement;
    expect(submitBtn.disabled).toBe(true);
  });

  it('calls reverseTransfer with sourceId for transfer movements', () => {
    fixture.componentRef.setInput('open', true);
    fixture.componentRef.setInput('movement', mockTransferMovement);
    fixture.detectChanges();

    const reversedSpy = vi.fn();
    component.reversed.subscribe(reversedSpy);

    component.form.patchValue({
      reason: 'Incorrect recipient account selected',
    });
    fixture.detectChanges();

    component.submit();

    expect(mockApi.reverseTransfer).toHaveBeenCalledTimes(1);
    expect(mockApi.reverseTransfer).toHaveBeenCalledWith(
      'trf-999',
      { reason: 'Incorrect recipient account selected' },
      expect.any(String),
    );
    expect(mockApi.reverseManualTransaction).not.toHaveBeenCalled();
    expect(reversedSpy).toHaveBeenCalledTimes(1);
  });

  it('calls reverseManualTransaction with movement id for adjustments and manual transactions', () => {
    fixture.componentRef.setInput('open', true);
    fixture.componentRef.setInput('movement', mockAdjustmentMovement);
    fixture.detectChanges();

    component.form.patchValue({
      reason: 'Duplicate entry entered by cashier',
    });
    fixture.detectChanges();

    component.submit();

    expect(mockApi.reverseManualTransaction).toHaveBeenCalledTimes(1);
    expect(mockApi.reverseManualTransaction).toHaveBeenCalledWith(
      'mov-adj-1',
      { reason: 'Duplicate entry entered by cashier' },
      expect.any(String),
    );
    expect(mockApi.reverseTransfer).not.toHaveBeenCalled();
  });
});
