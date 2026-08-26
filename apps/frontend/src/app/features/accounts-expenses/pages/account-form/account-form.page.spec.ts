import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { AccountFormPage } from './account-form.page';
import { AccountsApi } from '../../data-access/accounts.api';
import { AuthSessionStore } from '../../../auth/data-access/auth-session.store';

describe('AccountFormPage', () => {
  let mockApi: {
    getAccount: ReturnType<typeof vi.fn>;
    listMovements: ReturnType<typeof vi.fn>;
    listAccounts: ReturnType<typeof vi.fn>;
    listAccountOptions: ReturnType<typeof vi.fn>;
    createAccount: ReturnType<typeof vi.fn>;
    updateAccount: ReturnType<typeof vi.fn>;
    postOpeningBalance: ReturnType<typeof vi.fn>;
    postManualTransaction: ReturnType<typeof vi.fn>;
    postTransfer: ReturnType<typeof vi.fn>;
    reverseManualTransaction: ReturnType<typeof vi.fn>;
    reverseTransfer: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    mockApi = {
      getAccount: vi.fn().mockReturnValue(of(null)),
      listMovements: vi.fn().mockReturnValue(of({ items: [], meta: { page: 1, pageSize: 25, total: 0 } })),
      listAccounts: vi.fn().mockReturnValue(of({ items: [], meta: { page: 1, pageSize: 25, total: 0 } })),
      listAccountOptions: vi.fn().mockReturnValue(of([])),
      createAccount: vi.fn().mockReturnValue(of({})),
      updateAccount: vi.fn().mockReturnValue(of({})),
      postOpeningBalance: vi.fn().mockReturnValue(of({})),
      postManualTransaction: vi.fn().mockReturnValue(of({})),
      postTransfer: vi.fn().mockReturnValue(of({})),
      reverseManualTransaction: vi.fn().mockReturnValue(of({})),
      reverseTransfer: vi.fn().mockReturnValue(of({})),
    };

    await TestBed.configureTestingModule({
      imports: [AccountFormPage],
      providers: [
        provideRouter([]),
        { provide: AccountsApi, useValue: mockApi },
        { provide: AuthSessionStore, useValue: { hasPermission: () => true } },
      ],
    }).compileComponents();
  });

  it('renders create form', () => {
    const fixture: ComponentFixture<AccountFormPage> = TestBed.createComponent(AccountFormPage);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-testid="account-form"]')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('[data-testid="account-type"]')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('[data-testid="account-name"]')).toBeTruthy();
  });

  it('shows bank fields when account type is bank', () => {
    const fixture: ComponentFixture<AccountFormPage> = TestBed.createComponent(AccountFormPage);
    fixture.detectChanges();
    const component = fixture.componentInstance;
    component.form.controls.accountType.setValue('bank');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-testid="account-bank-name"]')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('[data-testid="account-number-masked"]')).toBeTruthy();
  });

  it('shows wallet field when account type is jazzcash or easypaisa', () => {
    const fixture: ComponentFixture<AccountFormPage> = TestBed.createComponent(AccountFormPage);
    fixture.detectChanges();
    const component = fixture.componentInstance;
    component.form.controls.accountType.setValue('jazzcash');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-testid="account-wallet-identifier"]')).toBeTruthy();
  });
});
