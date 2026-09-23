import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { AccountMovementsTableComponent } from './account-movements-table.component';
import { AccountsApi } from '../../data-access/accounts.api';
import { AuthSessionStore } from '../../../auth/data-access/auth-session.store';
import { CapabilityService } from '../../../capabilities/data-access/capability.service';
import { AccountMovementRecord } from '../../models/accounts.models';

const mockMovements: AccountMovementRecord[] = [
  {
    id: 'mov-1',
    organizationId: 'org-1',
    accountId: 'acc-1',
    direction: 'outflow',
    sourceType: 'account_transfer_out',
    sourceId: 'trf-1',
    purpose: 'Transfer to HBL Bank',
    signedAmount: { amount: '-80000.00', currency: 'PKR' },
    status: 'posted',
    postedAt: '2026-09-24T10:00:00Z',
    postedBy: 'user-1',
  },
  {
    id: 'mov-2',
    organizationId: 'org-1',
    accountId: 'acc-1',
    direction: 'inflow',
    sourceType: 'account_balance_adjustment',
    sourceId: 'adj-1',
    purpose: 'Reconciliation count',
    signedAmount: { amount: '+15000.00', currency: 'PKR' },
    status: 'posted',
    postedAt: '2026-09-24T11:00:00Z',
    postedBy: 'user-1',
  },
  {
    id: 'mov-3',
    organizationId: 'org-1',
    accountId: 'acc-1',
    direction: 'inflow',
    sourceType: 'account_transaction_manual',
    sourceId: 'tx-1',
    purpose: 'Owner funding',
    signedAmount: { amount: '+50000.00', currency: 'PKR' },
    status: 'posted',
    postedAt: '2026-09-24T12:00:00Z',
    postedBy: 'user-1',
  },
];

describe('AccountMovementsTableComponent', () => {
  let fixture: ComponentFixture<AccountMovementsTableComponent>;
  let component: AccountMovementsTableComponent;
  let mockApi: {
    listMovements: ReturnType<typeof vi.fn>;
    listAccounts: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    mockApi = {
      listMovements: vi.fn().mockReturnValue(
        of({ items: mockMovements, meta: { page: 1, pageSize: 25, total: 3 } }),
      ),
      listAccounts: vi.fn().mockReturnValue(of({ items: [], meta: { page: 1, pageSize: 200, total: 0 } })),
    };

    await TestBed.configureTestingModule({
      imports: [AccountMovementsTableComponent],
      providers: [
        { provide: AccountsApi, useValue: mockApi },
        { provide: AuthSessionStore, useValue: { hasPermission: () => true } },
        { provide: CapabilityService, useValue: { canUseModule: () => true, canPerformAction: () => true } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(AccountMovementsTableComponent);
    component = fixture.componentInstance;
  });

  it('renders human-readable transaction titles and never raw source types', () => {
    fixture.componentRef.setInput('accountId', 'acc-1');
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Internal Transfer');
    expect(text).toContain('Balance Adjustment');
    expect(text).toContain('External Money Added');
    expect(text).not.toContain('account_transfer_out');
    expect(text).not.toContain('account_balance_adjustment');
    expect(text).not.toContain('account_transaction_manual');
  });

  it('formats In and Out columns accurately', () => {
    fixture.componentRef.setInput('accountId', 'acc-1');
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('80,000.00');
    expect(text).toContain('15,000.00');
    expect(text).toContain('50,000.00');
  });

  it('opens reverse dialog when reverse is clicked', () => {
    fixture.componentRef.setInput('accountId', 'acc-1');
    fixture.detectChanges();

    const reverseButtons = fixture.nativeElement.querySelectorAll('[data-testid="reverse-movement-btn"]');
    expect(reverseButtons.length).toBeGreaterThan(0);

    reverseButtons[0].click();
    fixture.detectChanges();

    expect(component.reversalDialogOpen()).toBe(true);
    expect(component.selectedMovementForReversal()?.id).toBe('mov-1');
  });
});
