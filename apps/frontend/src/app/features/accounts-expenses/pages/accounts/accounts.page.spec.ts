import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { AccountsPage } from './accounts.page';
import { AccountsApi } from '../../data-access/accounts.api';
import { AuthSessionStore } from '../../../auth/data-access/auth-session.store';
import { AccountRecord } from '../../models/accounts.models';

const activeAccount: AccountRecord = {
  id: 'acc-1',
  organizationId: 'org-1',
  accountType: 'cash',
  name: 'Cash Register Multan',
  bankName: '',
  accountNumberMasked: '',
  walletIdentifier: '',
  status: 'active',
  version: 1,
  derivedBalances: { balance: { amount: '25000', currency: 'PKR' } },
};

describe('AccountsPage', () => {
  let mockApi: { listAccounts: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    mockApi = {
      listAccounts: vi.fn().mockReturnValue(
        of({ items: [activeAccount], meta: { page: 1, pageSize: 25, total: 1 } }),
      ),
    };
    await TestBed.configureTestingModule({
      imports: [AccountsPage],
      providers: [
        provideRouter([]),
        { provide: AccountsApi, useValue: mockApi },
        { provide: AuthSessionStore, useValue: { hasPermission: () => true } },
      ],
    }).compileComponents();
  });

  it('renders accounts table with data', () => {
    const fixture: ComponentFixture<AccountsPage> = TestBed.createComponent(AccountsPage);
    fixture.detectChanges();
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Accounts');
    expect(text).toContain('Cash Register Multan');
    expect(text).toContain('PKR 25,000.00');
    expect(fixture.nativeElement.querySelector('[data-testid="account-create-link"]')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('[data-testid="account-open"]')).toBeTruthy();
  });

  it('shows empty state when no accounts exist', () => {
    mockApi.listAccounts.mockReturnValue(of({ items: [], meta: { page: 1, pageSize: 25, total: 0 } }));
    const fixture: ComponentFixture<AccountsPage> = TestBed.createComponent(AccountsPage);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('No accounts found');
  });

  it('calls listAccounts with status filter', () => {
    const fixture: ComponentFixture<AccountsPage> = TestBed.createComponent(AccountsPage);
    fixture.detectChanges();
    expect(mockApi.listAccounts).toHaveBeenCalledWith(expect.objectContaining({ status: 'active' }));
  });
});
