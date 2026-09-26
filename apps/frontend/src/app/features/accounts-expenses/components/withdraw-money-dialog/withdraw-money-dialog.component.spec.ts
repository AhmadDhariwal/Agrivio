import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { WithdrawMoneyDialogComponent } from './withdraw-money-dialog.component';
import { AccountsApi } from '../../data-access/accounts.api';
import { AccountRecord } from '../../models/accounts.models';

const mockAccount: AccountRecord = {
  id: 'acc-bank',
  organizationId: 'org-1',
  accountType: 'bank',
  name: 'Operating Account HBL',
  bankName: 'HBL',
  accountNumberMasked: '****4321',
  walletIdentifier: '',
  status: 'active',
  version: 1,
  derivedBalances: { balance: { amount: '200000.00', currency: 'PKR' } },
};

describe('WithdrawMoneyDialogComponent', () => {
  let fixture: ComponentFixture<WithdrawMoneyDialogComponent>;
  let component: WithdrawMoneyDialogComponent;
  let mockApi: {
    listAccounts: ReturnType<typeof vi.fn>;
    postManualTransaction: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    mockApi = {
      listAccounts: vi.fn().mockReturnValue(
        of({ items: [mockAccount], meta: { page: 1, pageSize: 200, total: 1 } }),
      ),
      postManualTransaction: vi.fn().mockReturnValue(of({ id: 'tx-2' })),
    };

    await TestBed.configureTestingModule({
      imports: [WithdrawMoneyDialogComponent],
      providers: [{ provide: AccountsApi, useValue: mockApi }],
    }).compileComponents();

    fixture = TestBed.createComponent(WithdrawMoneyDialogComponent);
    component = fixture.componentInstance;
  });

  it('renders explanatory helper text without automatically calling it expense', () => {
    fixture.componentRef.setInput('open', true);
    fixture.detectChanges();

    const helperEl = fixture.nativeElement.querySelector('.helper-text');
    expect(helperEl).toBeTruthy();
    expect(helperEl.textContent).toContain(
      'Use this for money leaving an account outside existing Supplier Payment, Expense, or other Agrivio workflows.',
    );
  });

  it('submits valid withdrawal transaction with outflow direction', () => {
    fixture.componentRef.setInput('open', true);
    fixture.componentRef.setInput('preselectedAccountId', 'acc-bank');
    fixture.detectChanges();

    const moneyWithdrawnSpy = vi.fn();
    component.moneyWithdrawn.subscribe(moneyWithdrawnSpy);

    component.form.patchValue({
      amount: '25000',
      category: 'owner_draw',
      purpose: 'Owner personal withdrawal',
      businessDate: '2026-09-24',
      reference: 'WTH-001',
      notes: 'Monthly drawing',
    });
    fixture.detectChanges();

    component.submit();

    expect(mockApi.postManualTransaction).toHaveBeenCalledTimes(1);
    expect(mockApi.postManualTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        accountId: 'acc-bank',
        direction: 'outflow',
        amount: { amount: '25000.00', currency: 'PKR' },
        category: 'owner_draw',
        purpose: 'Owner personal withdrawal',
        businessDate: '2026-09-24',
        reference: 'WTH-001',
        notes: 'Monthly drawing',
      }),
      expect.any(String),
    );
    expect(moneyWithdrawnSpy).toHaveBeenCalledWith('Money withdrawn successfully.');
  });
});
