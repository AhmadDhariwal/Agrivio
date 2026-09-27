import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { TransferMoneyDialogComponent } from './transfer-money-dialog.component';
import { AccountsApi } from '../../data-access/accounts.api';
import { AccountRecord } from '../../models/accounts.models';

const mockCashAccount: AccountRecord = {
  id: 'acc-cash',
  organizationId: 'org-1',
  accountType: 'cash',
  name: 'Cash Counter',
  bankName: '',
  accountNumberMasked: '',
  walletIdentifier: '',
  status: 'active',
  version: 1,
  derivedBalances: { balance: { amount: '100000.00', currency: 'PKR' } },
};

const mockBankAccount: AccountRecord = {
  id: 'acc-bank',
  organizationId: 'org-1',
  accountType: 'bank',
  name: 'HBL Bank',
  bankName: 'Habib Bank Limited',
  accountNumberMasked: '****5678',
  walletIdentifier: '',
  status: 'active',
  version: 2,
  derivedBalances: { balance: { amount: '250000.00', currency: 'PKR' } },
};

const mockInactiveAccount: AccountRecord = {
  id: 'acc-inactive',
  organizationId: 'org-1',
  accountType: 'cash',
  name: 'Old Register',
  bankName: '',
  accountNumberMasked: '',
  walletIdentifier: '',
  status: 'inactive',
  version: 1,
  derivedBalances: { balance: { amount: '0.00', currency: 'PKR' } },
};

describe('TransferMoneyDialogComponent', () => {
  let fixture: ComponentFixture<TransferMoneyDialogComponent>;
  let component: TransferMoneyDialogComponent;
  let mockApi: {
    listAccounts: ReturnType<typeof vi.fn>;
    postTransfer: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    mockApi = {
      listAccounts: vi.fn().mockReturnValue(
        of({ items: [mockCashAccount, mockBankAccount, mockInactiveAccount], meta: { page: 1, pageSize: 200, total: 3 } }),
      ),
      postTransfer: vi.fn().mockReturnValue(of({ id: 'transfer-1' })),
    };

    await TestBed.configureTestingModule({
      imports: [TransferMoneyDialogComponent],
      providers: [{ provide: AccountsApi, useValue: mockApi }],
    }).compileComponents();

    fixture = TestBed.createComponent(TransferMoneyDialogComponent);
    component = fixture.componentInstance;
  });

  it('filters out inactive accounts from local account selectors', () => {
    fixture.componentRef.setInput('open', true);
    fixture.detectChanges();

    const options = component.accountOptions();
    expect(options.length).toBe(2);
    expect(options.some((o: { value: string }) => o.value === 'acc-inactive')).toBe(false);
    expect(options.some((o: { value: string }) => o.value === 'acc-cash')).toBe(true);
    expect(options.some((o: { value: string }) => o.value === 'acc-bank')).toBe(true);
  });

  it('validates that from and to accounts cannot be identical', () => {
    fixture.componentRef.setInput('open', true);
    fixture.detectChanges();

    component.form.patchValue({
      fromAccountId: 'acc-cash',
      toAccountId: 'acc-cash',
      amount: '5000',
    });
    fixture.detectChanges();

    expect(component.isSameAccount()).toBe(true);
    expect(component.form.errors?.['sameAccount']).toBe(true);
    expect(component.form.invalid).toBe(true);

    const submitBtn = fixture.nativeElement.querySelector('[data-testid="transfer-submit-btn"]') as HTMLButtonElement;
    expect(submitBtn.disabled).toBe(true);
  });

  it('renders reactive preview showing fund movement without treating as income or expense', () => {
    fixture.componentRef.setInput('accounts', [mockCashAccount, mockBankAccount]);
    fixture.componentRef.setInput('open', true);
    fixture.detectChanges();

    component.form.patchValue({
      fromAccountId: 'acc-cash',
      toAccountId: 'acc-bank',
      amount: '80000',
    });
    fixture.detectChanges();

    expect(component.canPreview()).toBe(true);
    const previewEl = fixture.nativeElement.querySelector('[data-testid="transfer-preview"]');
    expect(previewEl).toBeTruthy();
    expect(previewEl.textContent).toContain('Cash Counter');
    expect(previewEl.textContent).toContain('HBL Bank');
    expect(previewEl.textContent).toContain('- PKR 80,000.00');
    expect(previewEl.textContent).toContain('+ PKR 80,000.00');
    expect(previewEl.textContent).toContain('No change');
    expect(previewEl.textContent).not.toContain('Income');
    expect(previewEl.textContent).not.toContain('Expense');
  });

  it('submits valid transfer once and emits transferred on success', () => {
    fixture.componentRef.setInput('accounts', [mockCashAccount, mockBankAccount]);
    fixture.componentRef.setInput('open', true);
    fixture.detectChanges();

    const transferredSpy = vi.fn();
    component.transferred.subscribe(transferredSpy);

    component.form.patchValue({
      fromAccountId: 'acc-cash',
      toAccountId: 'acc-bank',
      amount: '15000',
      businessDate: '2026-09-24',
      reference: 'REF-TRF-01',
      notes: 'Treasury rebalancing',
    });
    fixture.detectChanges();

    component.submit();

    expect(mockApi.postTransfer).toHaveBeenCalledTimes(1);
    expect(mockApi.postTransfer).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceAccountId: 'acc-cash',
        destinationAccountId: 'acc-bank',
        amount: { amount: '15000.00', currency: 'PKR' },
        reference: 'REF-TRF-01',
        notes: 'Treasury rebalancing',
        businessDate: '2026-09-24',
      }),
      expect.any(String),
    );
    expect(transferredSpy).toHaveBeenCalledWith('Transfer completed successfully.');
  });
});
