import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { AccountsPage } from './accounts.page';
import { AccountsApi } from '../../data-access/accounts.api';
import { AuthSessionStore } from '../../../auth/data-access/auth-session.store';
import { CapabilityService } from '../../../capabilities/data-access/capability.service';
import { AccountRecord, AccountsSummary } from '../../models/accounts.models';

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
  derivedBalances: { balance: { amount: '25000.00', currency: 'PKR' } },
};

const mockSummary: AccountsSummary = {
  totalAccounts: 10,
  activeAccounts: 8,
  inactiveAccounts: 2,
  totalBalance: { amount: '1500000.00', currency: 'PKR' },
};

describe('AccountsPage', () => {
  let mockApi: {
    listAccounts: ReturnType<typeof vi.fn>;
    getSummary: ReturnType<typeof vi.fn>;
  };
  let mockCapabilityService: {
    canUseModule: ReturnType<typeof vi.fn>;
    canUseView: ReturnType<typeof vi.fn>;
    canViewField: ReturnType<typeof vi.fn>;
    canPerformAction: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    mockApi = {
      listAccounts: vi.fn().mockReturnValue(
        of({ items: [activeAccount], meta: { page: 1, pageSize: 25, total: 1 } }),
      ),
      getSummary: vi.fn().mockReturnValue(of(mockSummary)),
    };
    mockCapabilityService = {
      canUseModule: vi.fn().mockReturnValue(true),
      canUseView: vi.fn().mockReturnValue(true),
      canViewField: vi.fn().mockReturnValue(true),
      canPerformAction: vi.fn().mockReturnValue(true),
    };
    await TestBed.configureTestingModule({
      imports: [AccountsPage],
      providers: [
        provideRouter([]),
        { provide: AccountsApi, useValue: mockApi },
        { provide: CapabilityService, useValue: mockCapabilityService },
        { provide: AuthSessionStore, useValue: { hasPermission: () => true } },
      ],
    }).compileComponents();
  });

  it('renders accounts table and authoritative KPI summary cards without page-derived calculations', () => {
    const fixture: ComponentFixture<AccountsPage> = TestBed.createComponent(AccountsPage);
    fixture.detectChanges();
    const text = fixture.nativeElement.textContent as string;

    // Table content
    expect(text).toContain('Accounts');
    expect(text).toContain('Cash Register Multan');
    expect(text).toContain('PKR 25,000.00');

    // Authoritative KPI summary card values (independent of the 1 paginated row)
    expect(mockApi.getSummary).toHaveBeenCalledTimes(1);
    const kpiRow = fixture.nativeElement.querySelector('[data-testid="accounts-kpi-row"]');
    expect(kpiRow).toBeTruthy();

    const totalKpi = fixture.nativeElement.querySelector('[data-testid="kpi-total-value"]');
    expect(totalKpi?.textContent?.trim()).toBe('10');

    const activeKpi = fixture.nativeElement.querySelector('[data-testid="kpi-active-value"]');
    expect(activeKpi?.textContent?.trim()).toBe('8');

    const inactiveKpi = fixture.nativeElement.querySelector('[data-testid="kpi-inactive-value"]');
    expect(inactiveKpi?.textContent?.trim()).toBe('2');

    const balanceKpi = fixture.nativeElement.querySelector('[data-testid="kpi-balance-value"]');
    expect(balanceKpi?.textContent?.trim()).toBe('PKR 1,500,000.00');
  });

  it('hides KPI summary row and does not request summary when accounts.features.kpiCards is disabled', () => {
    mockCapabilityService.canUseView.mockImplementation((key: string) => {
      if (key === 'accounts.features.kpiCards') return false;
      return true;
    });
    const fixture: ComponentFixture<AccountsPage> = TestBed.createComponent(AccountsPage);
    fixture.detectChanges();

    expect(mockApi.getSummary).not.toHaveBeenCalled();
    const kpiRow = fixture.nativeElement.querySelector('[data-testid="accounts-kpi-row"]');
    expect(kpiRow).toBeNull();
  });

  it('shows empty state when no accounts exist', () => {
    mockApi.listAccounts.mockReturnValue(
      of({ items: [], meta: { page: 1, pageSize: 25, total: 0 } }),
    );
    const fixture: ComponentFixture<AccountsPage> = TestBed.createComponent(AccountsPage);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('No accounts found');
  });

  it('calls listAccounts with status filter', () => {
    const fixture: ComponentFixture<AccountsPage> = TestBed.createComponent(AccountsPage);
    fixture.detectChanges();
    expect(mockApi.listAccounts).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'active' }),
    );
  });
});
