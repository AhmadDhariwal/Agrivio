import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { AccountFormPage } from './account-form.page';
import { AccountsApi } from '../../data-access/accounts.api';
import { AuthSessionStore } from '../../../auth/data-access/auth-session.store';
import { CapabilityService } from '../../../capabilities/data-access/capability.service';

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
        provideRouter([{ path: 'app/accounts', component: AccountFormPage }]),
        { provide: AccountsApi, useValue: mockApi },
        { provide: AuthSessionStore, useValue: { hasPermission: () => true } },
        {
          provide: CapabilityService,
          useValue: {
            canUseModule: () => true,
            canPerformAction: () => true,
            canViewField: () => true,
            canEditField: () => true,
            canUseView: () => true,
          },
        },
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

  it('disables save while required fields are missing', () => {
    const fixture: ComponentFixture<AccountFormPage> = TestBed.createComponent(AccountFormPage);
    fixture.detectChanges();
    const saveButton = fixture.nativeElement.querySelector(
      '[data-testid="account-save"]',
    ) as HTMLButtonElement;
    expect(saveButton.disabled).toBe(true);
  });

  it('enables save when required create fields are filled', () => {
    const fixture: ComponentFixture<AccountFormPage> = TestBed.createComponent(AccountFormPage);
    fixture.detectChanges();
    const component = fixture.componentInstance;
    component.form.patchValue({ name: 'Main Cash', accountType: 'cash' });
    fixture.detectChanges();
    const saveButton = fixture.nativeElement.querySelector(
      '[data-testid="account-save"]',
    ) as HTMLButtonElement;
    expect(saveButton.disabled).toBe(false);
  });

  it('blocks invalid submit without calling createAccount', () => {
    const fixture: ComponentFixture<AccountFormPage> = TestBed.createComponent(AccountFormPage);
    fixture.detectChanges();
    fixture.componentInstance.save();
    fixture.detectChanges();
    expect(mockApi.createAccount).not.toHaveBeenCalled();
    expect(fixture.nativeElement.textContent).toContain('Name is required.');
  });

  it('requires bank name when account type is bank', () => {
    const fixture: ComponentFixture<AccountFormPage> = TestBed.createComponent(AccountFormPage);
    fixture.detectChanges();
    const page = fixture.componentInstance;
    page.form.patchValue({ accountType: 'bank', name: 'Operations Account' });
    page.save();
    fixture.detectChanges();
    expect(mockApi.createAccount).not.toHaveBeenCalled();
    expect(fixture.nativeElement.textContent).toContain('Bank name is required.');
  });

  it('includes inactive status in the update payload', async () => {
    TestBed.resetTestingModule();
    mockApi.getAccount.mockReturnValue(
      of({
        id: 'acc-1',
        name: 'Main Cash',
        accountType: 'cash',
        bankName: '',
        accountNumberMasked: '',
        walletIdentifier: '',
        status: 'active',
        version: 1,
      }),
    );

    await TestBed.configureTestingModule({
      imports: [AccountFormPage],
      providers: [
        provideRouter([{ path: 'app/accounts', component: AccountFormPage }]),
        { provide: AccountsApi, useValue: mockApi },
        { provide: AuthSessionStore, useValue: { hasPermission: () => true } },
        {
          provide: CapabilityService,
          useValue: {
            canUseModule: () => true,
            canPerformAction: () => true,
            canViewField: () => true,
            canEditField: () => true,
            canUseView: () => true,
          },
        },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              paramMap: { get: (key: string) => (key === 'id' ? 'acc-1' : null) },
              routeConfig: { path: 'accounts/:id' },
            },
          },
        },
      ],
    }).compileComponents();

    const fixture: ComponentFixture<AccountFormPage> = TestBed.createComponent(AccountFormPage);
    fixture.detectChanges();

    const page = fixture.componentInstance;
    page.form.patchValue({ status: 'inactive' });
    page.save();

    expect(mockApi.updateAccount).toHaveBeenCalledWith('acc-1', {
      expectedVersion: 1,
      name: 'Main Cash',
      status: 'inactive',
    });
  });
});
