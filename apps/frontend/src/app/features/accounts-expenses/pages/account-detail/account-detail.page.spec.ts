import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { AccountDetailPage } from './account-detail.page';
import { AccountsApi } from '../../data-access/accounts.api';
import { AuthSessionStore } from '../../../auth/data-access/auth-session.store';
import { CapabilityService } from '../../../capabilities/data-access/capability.service';
import { AccountRecord } from '../../models/accounts.models';

const account: AccountRecord = {
  id: 'acc-1',
  organizationId: 'org-1',
  accountType: 'bank',
  name: 'Operations Bank',
  bankName: 'HBL',
  accountNumberMasked: '****1234',
  walletIdentifier: '',
  status: 'active',
  version: 1,
  derivedBalances: { balance: { amount: '25000.00', currency: 'PKR' } },
};

describe('AccountDetailPage', () => {
  it('loads the authoritative account on a read-only page with separate action routes', async () => {
    const api = { getAccount: vi.fn().mockReturnValue(of(account)) };
    await TestBed.configureTestingModule({
      imports: [AccountDetailPage],
      providers: [
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: convertToParamMap({ id: 'acc-1' }) } },
        },
        { provide: AccountsApi, useValue: api },
        { provide: AuthSessionStore, useValue: { hasPermission: () => true } },
        {
          provide: CapabilityService,
          useValue: {
            canUseModule: () => true,
            canPerformAction: () => true,
            canViewField: () => true,
          },
        },
      ],
    }).compileComponents();
    const fixture: ComponentFixture<AccountDetailPage> = TestBed.createComponent(AccountDetailPage);
    fixture.detectChanges();

    expect(api.getAccount).toHaveBeenCalledWith('acc-1');
    expect(fixture.nativeElement.textContent).toContain('Operations Bank');
    expect(fixture.nativeElement.querySelector('form')).toBeNull();
    expect(
      fixture.nativeElement
        .querySelector('[data-testid="account-edit-link"]')
        ?.getAttribute('href'),
    ).toBe('/app/accounts/acc-1/edit');
    expect(
      fixture.nativeElement
        .querySelector('[data-testid="account-activity-link"]')
        ?.getAttribute('href'),
    ).toBe('/app/accounts/acc-1/activity');
  });
});
