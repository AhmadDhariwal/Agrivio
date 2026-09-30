import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { CustomerDetailPage } from './customer-detail.page';
import { CustomersApi } from '../../data-access/customers.api';
import { AuthSessionStore } from '../../../auth/data-access/auth-session.store';
import { CapabilityService } from '../../../capabilities/data-access/capability.service';
import { CustomerRecord } from '../../models/customers.models';

const customer: CustomerRecord = {
  id: 'customer-1',
  organizationId: 'org-1',
  name: 'Punjab Agri Corp',
  customerType: 'corporate',
  priceTier: 'wholesale',
  status: 'active',
  version: 2,
  phone: '042-99200001',
  creditEnabled: true,
  creditLimit: { amount: '100000.00', currency: 'PKR' },
  creditLimitBehaviour: 'warning',
  derivedBalances: {
    receivable: { amount: '25000.00', currency: 'PKR' },
    advance: { amount: '0.00', currency: 'PKR' },
  },
};

function provideDetailDeps(api: object) {
  return [
    provideRouter([]),
    {
      provide: ActivatedRoute,
      useValue: { snapshot: { paramMap: convertToParamMap({ id: 'customer-1' }) } },
    },
    { provide: CustomersApi, useValue: api },
    { provide: AuthSessionStore, useValue: { hasPermission: () => true } },
    {
      provide: CapabilityService,
      useValue: {
        canUseModule: () => true,
        canPerformAction: () => true,
        canViewField: () => true,
        canUseView: () => true,
      },
    },
  ];
}

describe('CustomerDetailPage', () => {
  it('renders inquiry data without form controls and links Edit to the explicit edit route', async () => {
    const api = { getCustomer: vi.fn().mockReturnValue(of(customer)) };
    await TestBed.configureTestingModule({
      imports: [CustomerDetailPage],
      providers: provideDetailDeps(api),
    }).compileComponents();
    const fixture: ComponentFixture<CustomerDetailPage> =
      TestBed.createComponent(CustomerDetailPage);
    fixture.detectChanges();

    expect(api.getCustomer).toHaveBeenCalledWith('customer-1');
    expect(fixture.nativeElement.querySelector('form')).toBeNull();
    expect(
      fixture.nativeElement
        .querySelector('[data-testid="customer-edit-link"]')
        ?.getAttribute('href'),
    ).toBe('/app/customers/customer-1/edit');
  });

  describe('Financial summary — loan receivable discoverability', () => {
    it('shows formula subtitle "Trade + Loan − Advance" when totalExposure is present', async () => {
      const withExposure: CustomerRecord = {
        ...customer,
        derivedBalances: {
          receivable: { amount: '20000.00', currency: 'PKR' },
          loanReceivable: { amount: '15000.00', currency: 'PKR' },
          advance: { amount: '5000.00', currency: 'PKR' },
          totalExposure: { amount: '30000.00', currency: 'PKR' },
        },
      };

      const api = { getCustomer: vi.fn().mockReturnValue(of(withExposure)) };
      await TestBed.configureTestingModule({
        imports: [CustomerDetailPage],
        providers: provideDetailDeps(api),
      }).compileComponents();

      const fixture = TestBed.createComponent(CustomerDetailPage);
      fixture.detectChanges();

      const formula = fixture.nativeElement.querySelector('[data-testid="cust-total-exposure-formula"]');
      expect(formula).toBeTruthy();
      expect(formula.textContent.trim()).toBe('Trade + Loan − Advance');
    });

    it('does NOT render formula subtitle when totalExposure is absent', async () => {
      const withoutExposure: CustomerRecord = {
        ...customer,
        derivedBalances: {
          receivable: { amount: '10000.00', currency: 'PKR' },
          advance: { amount: '0.00', currency: 'PKR' },
        },
      };

      const api = { getCustomer: vi.fn().mockReturnValue(of(withoutExposure)) };
      await TestBed.configureTestingModule({
        imports: [CustomerDetailPage],
        providers: provideDetailDeps(api),
      }).compileComponents();

      const fixture = TestBed.createComponent(CustomerDetailPage);
      fixture.detectChanges();

      expect(
        fixture.nativeElement.querySelector('[data-testid="cust-total-exposure-formula"]'),
      ).toBeNull();
    });

    it('shows both Trade Receivable and Loan Receivable labels in financial summary', async () => {
      const withLoan: CustomerRecord = {
        ...customer,
        derivedBalances: {
          receivable: { amount: '18000.00', currency: 'PKR' },
          loanReceivable: { amount: '12000.00', currency: 'PKR' },
          advance: { amount: '0.00', currency: 'PKR' },
        },
      };

      const api = { getCustomer: vi.fn().mockReturnValue(of(withLoan)) };
      await TestBed.configureTestingModule({
        imports: [CustomerDetailPage],
        providers: provideDetailDeps(api),
      }).compileComponents();

      const fixture = TestBed.createComponent(CustomerDetailPage);
      fixture.detectChanges();

      const summary = fixture.nativeElement.querySelector('[data-testid="customer-financial-summary"]');
      expect(summary).toBeTruthy();
      expect(summary.textContent).toContain('Trade Receivable');
      expect(summary.textContent).toContain('Loan Receivable');
      expect(fixture.nativeElement.querySelector('[data-testid="cust-trade-receivable"]')?.textContent).toContain('18,000');
      expect(fixture.nativeElement.querySelector('[data-testid="cust-loan-receivable"]')?.textContent).toContain('12,000');
    });

    it('trade receivable value is unchanged and shown separately from loan receivable', async () => {
      const api = { getCustomer: vi.fn().mockReturnValue(of(customer)) };
      await TestBed.configureTestingModule({
        imports: [CustomerDetailPage],
        providers: provideDetailDeps(api),
      }).compileComponents();

      const fixture = TestBed.createComponent(CustomerDetailPage);
      fixture.detectChanges();

      const tradeEl = fixture.nativeElement.querySelector('[data-testid="cust-trade-receivable"]');
      expect(tradeEl).toBeTruthy();
      expect(tradeEl.textContent).toContain('25,000');

      // loan receivable defaults to 0.00 when not provided
      const loanEl = fixture.nativeElement.querySelector('[data-testid="cust-loan-receivable"]');
      expect(loanEl).toBeTruthy();
      expect(loanEl.textContent).toContain('0.00');
    });
  });
});
