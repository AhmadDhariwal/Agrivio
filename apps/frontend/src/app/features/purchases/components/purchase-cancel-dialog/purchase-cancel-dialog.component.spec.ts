import { ComponentFixture, TestBed } from '@angular/core/testing';
import { PurchaseCancelDialogComponent } from './purchase-cancel-dialog.component';
import { PurchaseRecord } from '../../models/purchases.models';

const mockPurchase: PurchaseRecord = {
  id: 'pur-101',
  organizationId: 'org-1',
  branchId: null,
  warehouseId: 'wh-1',
  warehouseNameSnapshot: 'Main Warehouse',
  supplierId: 'sup-1',
  supplierNameSnapshot: 'Engro Fertilizers',
  supplierInvoiceReference: 'ENG-888',
  purchaseDate: '2026-03-10',
  notes: 'Original note',
  status: 'posted',
  lines: [
    {
      productId: 'prod-1',
      productNameSnapshot: 'Urea 50kg',
      trackingModeSnapshot: 'none',
      packagingUnitId: null,
      unitCodeSnapshot: 'BAG',
      conversionFactorSnapshot: '1',
      quantity: '100',
      quantityBase: '100',
      unitCost: { amount: '5000.00', currency: 'PKR' },
      lineProductAmount: { amount: '500000.00', currency: 'PKR' },
      batchNumber: null,
      manufacturingDate: null,
      expiryDate: null,
    },
  ],
  landedCosts: {
    freight: { amount: '0.00', currency: 'PKR' },
    loading: { amount: '0.00', currency: 'PKR' },
    transport: { amount: '0.00', currency: 'PKR' },
    other: { amount: '0.00', currency: 'PKR' },
  },
  purchaseTotal: { amount: '500000.00', currency: 'PKR' },
  paidTotal: { amount: '100000.00', currency: 'PKR' },
  payableTotal: { amount: '400000.00', currency: 'PKR' },
  payments: [
    {
      paymentId: 'pay-1',
      accountId: 'acc-cash',
      accountNameSnapshot: 'Main Cash',
      accountTypeSnapshot: 'cash',
      amount: { amount: '100000.00', currency: 'PKR' },
    },
  ],
  version: 1,
  createdBy: 'usr-1',
  createdAt: '2026-03-10T10:00:00.000Z',
  updatedAt: null,
  postedAt: '2026-03-10T10:00:00.000Z',
};

describe('PurchaseCancelDialogComponent', () => {
  let fixture: ComponentFixture<PurchaseCancelDialogComponent>;
  let component: PurchaseCancelDialogComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PurchaseCancelDialogComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(PurchaseCancelDialogComponent);
    component = fixture.componentInstance;
  });

  it('renders purchase summary and compensating impact details when open', () => {
    fixture.componentRef.setInput('open', true);
    fixture.componentRef.setInput('purchase', mockPurchase);
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('[data-testid="purchase-cancel-dialog"]')).toBeTruthy();
    expect(compiled.textContent).toContain('ENG-888');
    expect(compiled.textContent).toContain('Engro Fertilizers');
    expect(compiled.textContent).toContain('PKR 500,000.00');

    // Impact notices
    expect(compiled.querySelector('[data-testid="cancel-inventory-impact"]')).toBeTruthy();
    expect(compiled.querySelector('[data-testid="cancel-payable-impact"]')).toBeTruthy();
    expect(compiled.querySelector('[data-testid="cancel-account-impact"]')).toBeTruthy();
    expect(compiled.textContent).toContain('Main Cash');
  });

  it('validates mandatory cancellation reason (1 to 1000 chars)', () => {
    fixture.componentRef.setInput('open', true);
    fixture.componentRef.setInput('purchase', mockPurchase);
    fixture.detectChanges();

    const confirmSpy = vi.fn();
    component.confirmed.subscribe(confirmSpy);

    // Attempt submit with empty reason
    component.onSubmit();
    fixture.detectChanges();

    expect(component.isReasonValid()).toBe(false);
    expect(component.reasonError()).toBe('Cancellation reason is required.');
    expect(confirmSpy).not.toHaveBeenCalled();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('[data-testid="cancel-reason-error"]')?.textContent).toContain(
      'Cancellation reason is required.',
    );

    // Provide valid reason
    component.onReasonChange('Received incorrect grade from supplier; purchase was rejected at receiving.');
    fixture.detectChanges();

    expect(component.isReasonValid()).toBe(true);
    expect(component.reasonError()).toBeNull();

    component.onSubmit();
    expect(confirmSpy).toHaveBeenCalledWith({
      reason: 'Received incorrect grade from supplier; purchase was rejected at receiving.',
    });
  });

  it('emits dismissed and resets reason on cancel', () => {
    fixture.componentRef.setInput('open', true);
    fixture.componentRef.setInput('purchase', mockPurchase);
    component.onReasonChange('Some text that will be cancelled');
    fixture.detectChanges();

    const dismissSpy = vi.fn();
    component.dismissed.subscribe(dismissSpy);

    component.onCancel();
    expect(dismissSpy).toHaveBeenCalled();
    expect(component.reason()).toBe('');
    expect(component.submitAttempted()).toBe(false);
  });

  it('disables submit button and shows progress text when submitting is true', () => {
    fixture.componentRef.setInput('open', true);
    fixture.componentRef.setInput('purchase', mockPurchase);
    fixture.componentRef.setInput('submitting', true);
    component.onReasonChange('Valid reason for cancelling');
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const confirmBtn = compiled.querySelector('[data-testid="cancel-dialog-confirm"]') as HTMLButtonElement;
    expect(confirmBtn.disabled).toBe(true);
    expect(confirmBtn.textContent).toContain('Cancelling…');
  });
});
