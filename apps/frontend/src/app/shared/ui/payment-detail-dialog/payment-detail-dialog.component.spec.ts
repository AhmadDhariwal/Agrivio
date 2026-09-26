import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { PaymentDetailDialogComponent } from './payment-detail-dialog.component';
import { PaymentCorrectionTarget } from '../payment-correction-dialog/payment-correction-dialog.component';

describe('PaymentDetailDialogComponent', () => {
  let fixture: ComponentFixture<PaymentDetailDialogComponent>;
  let component: PaymentDetailDialogComponent;

  const sampleActiveTarget: PaymentCorrectionTarget = {
    id: 'pay-detail-001',
    partyType: 'customer',
    partyName: 'Bilal Traders',
    partyPhone: '0301-9876543',
    amount: { amount: '75000.00', currency: 'PKR' },
    accountId: 'acc-bank-meezan',
    paymentDate: '2026-08-25',
    allocationMode: 'general',
    appliedTo: 'receivable_and_advance',
    notes: 'Advance & receivable settlement',
    reference: 'CHQ-98124',
    correctionOfId: null,
    reason: null,
    replacementPaymentId: null,
    allocations: [
      {
        id: 'alloc-1',
        targetType: 'sale_invoice',
        targetId: 'inv-1001',
        allocatedAmount: { amount: '50000.00', currency: 'PKR' },
        status: 'posted',
      },
    ],
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PaymentDetailDialogComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(PaymentDetailDialogComponent);
    component = fixture.componentInstance;
  });

  function setupDialog(payment: PaymentCorrectionTarget = sampleActiveTarget, canCorrect = true, open = true) {
    fixture.componentRef.setInput('open', open);
    fixture.componentRef.setInput('payment', payment);
    fixture.componentRef.setInput('canCorrect', canCorrect);
    fixture.detectChanges();
  }

  it('renders payment details, allocation table, and action buttons for active payment', () => {
    setupDialog(sampleActiveTarget, true, true);

    const text = fixture.nativeElement.textContent;
    expect(text).toContain('Customer Payment Details');
    expect(text).toContain('75,000.00');
    expect(text).toContain('Bilal Traders');
    expect(text).toContain('0301-9876543');
    expect(text).toContain('acc-bank-meezan');
    expect(text).toContain('CHQ-98124');
    expect(text).toContain('Receivable & Advance');
    expect(text).toContain('Allocation Breakdown (1)');
    expect(text).toContain('inv-1001');

    const reverseBtn = fixture.nativeElement.querySelector('[data-testid="payment-detail-reverse-btn"]');
    const correctBtn = fixture.nativeElement.querySelector('[data-testid="payment-detail-correct-btn"]');
    expect(reverseBtn).toBeTruthy();
    expect(correctBtn).toBeTruthy();
  });

  it('hides reverse/correct buttons when canCorrect is false', () => {
    setupDialog(sampleActiveTarget, false, true);

    const reverseBtn = fixture.nativeElement.querySelector('[data-testid="payment-detail-reverse-btn"]');
    const correctBtn = fixture.nativeElement.querySelector('[data-testid="payment-detail-correct-btn"]');
    expect(reverseBtn).toBeFalsy();
    expect(correctBtn).toBeFalsy();
  });

  it('displays reversal notice and hides action buttons for reversal record', () => {
    const reversalTarget: PaymentCorrectionTarget = {
      ...sampleActiveTarget,
      id: 'pay-rev-999',
      correctionOfId: 'pay-orig-001',
      reason: 'Refund due to duplicate entry',
    };
    setupDialog(reversalTarget, true, true);

    expect(fixture.nativeElement.querySelector('[data-testid="detail-reversal-notice"]')).toBeTruthy();
    expect(fixture.nativeElement.textContent).toContain('Immutable Reversal Record');
    expect(fixture.nativeElement.textContent).toContain('Refund due to duplicate entry');

    expect(fixture.nativeElement.querySelector('[data-testid="payment-detail-reverse-btn"]')).toBeFalsy();
    expect(fixture.nativeElement.querySelector('[data-testid="payment-detail-correct-btn"]')).toBeFalsy();
  });

  it('displays superseded notice and hides action buttons for corrected payment', () => {
    const replacedTarget: PaymentCorrectionTarget = {
      ...sampleActiveTarget,
      id: 'pay-orig-001',
      reversalPaymentId: 'pay-rev-002',
      replacementPaymentId: 'pay-rep-002',
      correctionStatus: 'corrected',
      reason: 'Incorrect amount fixed',
    };
    setupDialog(replacedTarget, true, true);

    expect(fixture.nativeElement.querySelector('[data-testid="detail-replaced-notice"]')).toBeTruthy();
    expect(fixture.nativeElement.textContent).toContain('Payment Superseded by Correction');
    expect(fixture.nativeElement.textContent).toContain('Incorrect amount fixed');

    expect(fixture.nativeElement.querySelector('[data-testid="payment-detail-reverse-btn"]')).toBeFalsy();
    expect(fixture.nativeElement.querySelector('[data-testid="payment-detail-correct-btn"]')).toBeFalsy();
  });

  it('emits reverseClicked and correctClicked outputs when buttons are clicked', () => {
    setupDialog(sampleActiveTarget, true, true);

    let reverseEmitted: PaymentCorrectionTarget | undefined;
    let correctEmitted: PaymentCorrectionTarget | undefined;
    component.reverseClicked.subscribe((p: PaymentCorrectionTarget) => (reverseEmitted = p));
    component.correctClicked.subscribe((p: PaymentCorrectionTarget) => (correctEmitted = p));

    const reverseBtn: HTMLButtonElement = fixture.nativeElement.querySelector('[data-testid="payment-detail-reverse-btn"]');
    reverseBtn.click();
    expect(reverseEmitted?.id).toBe(sampleActiveTarget.id);

    const correctBtn: HTMLButtonElement = fixture.nativeElement.querySelector('[data-testid="payment-detail-correct-btn"]');
    correctBtn.click();
    expect(correctEmitted?.id).toBe(sampleActiveTarget.id);
  });
});
