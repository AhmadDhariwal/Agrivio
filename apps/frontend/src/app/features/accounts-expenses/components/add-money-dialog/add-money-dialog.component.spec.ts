import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { AddMoneyDialogComponent } from './add-money-dialog.component';
import { AccountsApi } from '../../data-access/accounts.api';
import { AccountRecord } from '../../models/accounts.models';

const mockAccount: AccountRecord = {
  id: 'acc-cash',
  organizationId: 'org-1',
  accountType: 'cash',
  name: 'Counter Cash',
  bankName: '',
  accountNumberMasked: '',
  walletIdentifier: '',
  status: 'active',
  version: 1,
  derivedBalances: { balance: { amount: '10000.00', currency: 'PKR' } },
};

describe('AddMoneyDialogComponent', () => {
  let fixture: ComponentFixture<AddMoneyDialogComponent>;
  let component: AddMoneyDialogComponent;
  let mockApi: {
    listAccounts: ReturnType<typeof vi.fn>;
    postManualTransaction: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    mockApi = {
      listAccounts: vi.fn().mockReturnValue(
        of({ items: [mockAccount], meta: { page: 1, pageSize: 200, total: 1 } }),
      ),
      postManualTransaction: vi.fn().mockReturnValue(of({ id: 'tx-1' })),
    };

    await TestBed.configureTestingModule({
      imports: [AddMoneyDialogComponent],
      providers: [{ provide: AccountsApi, useValue: mockApi }],
    }).compileComponents();

    fixture = TestBed.createComponent(AddMoneyDialogComponent);
    component = fixture.componentInstance;
  });

  it('renders explanatory helper text without labeling it as revenue', () => {
    fixture.componentRef.setInput('open', true);
    fixture.detectChanges();

    const helperEl = fixture.nativeElement.querySelector('.helper-text');
    expect(helperEl).toBeTruthy();
    expect(helperEl.textContent).toContain(
      'Use this when money enters the business but is not being recorded through a Sale, Customer Payment, or another existing Agrivio transaction.',
    );
    expect(fixture.nativeElement.textContent).not.toContain('Revenue');
  });

  it('defaults to unclassified category and supports submission', () => {
    fixture.componentRef.setInput('open', true);
    fixture.componentRef.setInput('preselectedAccountId', 'acc-cash');
    fixture.detectChanges();

    expect(component.form.controls.category.value).toBe('unclassified');

    const moneyAddedSpy = vi.fn();
    component.moneyAdded.subscribe(moneyAddedSpy);

    component.form.patchValue({
      amount: '50000',
      category: 'unclassified',
      purpose: 'Owner additional capital injection',
      businessDate: '2026-09-24',
      reference: 'DEP-001',
      notes: 'Initial cash injection',
    });
    fixture.detectChanges();

    component.submit();

    expect(mockApi.postManualTransaction).toHaveBeenCalledTimes(1);
    expect(mockApi.postManualTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        accountId: 'acc-cash',
        direction: 'inflow',
        amount: { amount: '50000.00', currency: 'PKR' },
        category: 'unclassified',
        purpose: 'Owner additional capital injection',
        businessDate: '2026-09-24',
        reference: 'DEP-001',
        notes: 'Initial cash injection',
      }),
      expect.any(String),
    );
    expect(moneyAddedSpy).toHaveBeenCalledWith('Money added successfully.');
  });
});
