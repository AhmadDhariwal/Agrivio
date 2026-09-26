import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  PaymentCorrectionDialogComponent,
  PaymentCorrectionDialogResult,
  PaymentCorrectionTarget,
} from './payment-correction-dialog.component';

describe('PaymentCorrectionDialogComponent', () => {
  let fixture: ComponentFixture<PaymentCorrectionDialogComponent>;
  let component: PaymentCorrectionDialogComponent;

  const sampleTarget: PaymentCorrectionTarget = {
    id: 'pay-test-001',
    partyType: 'customer',
    partyName: 'Haji Aslam Agro',
    amount: { amount: '50000.00', currency: 'PKR' },
    accountId: 'acc-cash-1',
    paymentDate: '2026-08-20',
    allocationMode: 'general',
    appliedTo: 'receivable',
    notes: 'Initial test payment note',
    correctionOfId: null,
    reason: null,
    replacementPaymentId: null,
    allocations: [],
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PaymentCorrectionDialogComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(PaymentCorrectionDialogComponent);
    component = fixture.componentInstance;
  });

  function setupDialog(mode: 'reverse' | 'correct' = 'reverse', open = true) {
    fixture.componentRef.setInput('open', open);
    fixture.componentRef.setInput('payment', sampleTarget);
    fixture.componentRef.setInput('initialMode', mode);
    fixture.detectChanges();
  }

  it('renders original payment read-only information', () => {
    setupDialog('reverse', true);

    const text = fixture.nativeElement.textContent;
    expect(text).toContain('Original Payment (Immutable Record)');
    expect(text).toContain('50,000.00');
    expect(text).toContain('2026-08-20');
    expect(text).toContain('Haji Aslam Agro');
    expect(text).toContain('acc-cash-1');
  });

  it('switches between reverse and correct modes', () => {
    setupDialog('reverse', true);
    expect(component.mode()).toBe('reverse');
    expect(component.dialogTitle()).toBe('Reverse Payment');

    const correctTab: HTMLButtonElement = fixture.nativeElement.querySelector('[data-testid="correction-tab-correct"]');
    correctTab.click();
    fixture.detectChanges();

    expect(component.mode()).toBe('correct');
    expect(component.dialogTitle()).toBe('Correct Payment');
    expect(fixture.nativeElement.querySelector('[data-testid="correction-replacement-amount"]')).toBeTruthy();
  });

  it('requires correction reason and prevents submission when empty', () => {
    setupDialog('reverse', true);

    let emittedResult: PaymentCorrectionDialogResult | undefined;
    component.confirmed.subscribe((res: PaymentCorrectionDialogResult) => (emittedResult = res));

    const submitBtn: HTMLButtonElement = fixture.nativeElement.querySelector('[data-testid="correction-submit-btn"]');
    submitBtn.click();
    fixture.detectChanges();

    expect(emittedResult).toBeUndefined();
    expect(fixture.nativeElement.textContent).toContain('Correction reason is mandatory');
  });

  it('submits pure reversal with reason and generated idempotencyKey', () => {
    setupDialog('reverse', true);

    let emittedResult: PaymentCorrectionDialogResult | undefined;
    component.confirmed.subscribe((res: PaymentCorrectionDialogResult) => (emittedResult = res));

    component.reason.set('Customer requested refund due to order cancellation');
    fixture.detectChanges();

    const submitBtn: HTMLButtonElement = fixture.nativeElement.querySelector('[data-testid="correction-submit-btn"]');
    submitBtn.click();
    fixture.detectChanges();

    expect(emittedResult).toBeDefined();
    expect(emittedResult?.paymentId).toBe('pay-test-001');
    expect(emittedResult?.mode).toBe('reverse');
    expect(emittedResult?.replacement).toBeNull();
    expect(emittedResult?.reason).toBe('Customer requested refund due to order cancellation');
    expect(emittedResult?.idempotencyKey).toContain('corr-pay-test-001-');
  });

  it('submits correction with replacement payload and financial impact preview', () => {
    setupDialog('correct', true);

    let emittedResult: PaymentCorrectionDialogResult | undefined;
    component.confirmed.subscribe((res: PaymentCorrectionDialogResult) => (emittedResult = res));

    component.reason.set('Overstated payment by 10,000 PKR');
    component.replacementAmount.set('40000.00');
    component.replacementDate.set('2026-08-20');
    component.replacementAccountId.set('acc-bank-1');
    component.replacementAllocationMode.set('general');
    component.replacementNotes.set('Corrected amount');
    fixture.detectChanges();

    const previewEl = fixture.nativeElement.querySelector('[data-testid="correction-impact-preview"]');
    expect(previewEl.textContent).toContain('Replacement payment of PKR 40,000.00 will be posted');
    expect(previewEl.textContent).toContain('Net payment adjustment: -PKR 10,000.00');

    const submitBtn: HTMLButtonElement = fixture.nativeElement.querySelector('[data-testid="correction-submit-btn"]');
    submitBtn.click();
    fixture.detectChanges();

    expect(emittedResult).toBeDefined();
    expect(emittedResult?.paymentId).toBe('pay-test-001');
    expect(emittedResult?.mode).toBe('correct');
    expect(emittedResult?.replacement).toEqual({
      accountId: 'acc-bank-1',
      amount: { amount: '40000.00', currency: 'PKR' },
      paymentDate: '2026-08-20',
      allocationMode: 'general',
      notes: 'Corrected amount',
      reference: undefined,
    });
  });

  it('emits dismissed output when cancel button is clicked', () => {
    setupDialog('reverse', true);

    let dismissed = false;
    component.dismissed.subscribe(() => (dismissed = true));

    const cancelBtn: HTMLButtonElement = fixture.nativeElement.querySelector('[data-testid="correction-cancel-btn"]');
    cancelBtn.click();

    expect(dismissed).toBe(true);
  });
});
