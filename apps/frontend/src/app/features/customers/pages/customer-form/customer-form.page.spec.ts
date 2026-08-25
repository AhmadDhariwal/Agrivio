import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { CustomerFormPage } from './customer-form.page';
import { CustomersApi } from '../../data-access/customers.api';
import { AuthSessionStore } from '../../../auth/data-access/auth-session.store';
import { CapabilityService } from '../../../capabilities/data-access/capability.service';
import { CustomerRecord } from '../../models/customers.models';

const mockCustomer: CustomerRecord = {
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

describe('CustomerFormPage', () => {
  let mockApi: {
    getCustomer: any;
    createCustomer: any;
    updateCustomer: any;
    updateCreditPolicy: any;
    postOpeningBalance: any;
  };
  let mockSession: { hasPermission: any };

  beforeEach(() => {
    mockApi = {
      getCustomer: vi.fn().mockReturnValue(of(mockCustomer)),
      createCustomer: vi.fn().mockReturnValue(of({ id: 'customer-1' })),
      updateCustomer: vi.fn().mockReturnValue(of(mockCustomer)),
      updateCreditPolicy: vi.fn().mockReturnValue(of(mockCustomer)),
      postOpeningBalance: vi.fn().mockReturnValue(of(mockCustomer)),
    };
    mockSession = { hasPermission: vi.fn().mockReturnValue(true) };
  });

  async function createPage(options: {
    routeId?: string;
    capabilities?: Partial<Record<string, boolean>>;
    permissions?: string[];
  } = {}): Promise<ComponentFixture<CustomerFormPage>> {
    const routeId = options.routeId ?? 'new';
    const mockCapability = {
      canUseModule: vi.fn().mockReturnValue(options.capabilities?.['customers'] ?? true),
      canUseView: vi.fn().mockImplementation((key: string) => options.capabilities?.[key] ?? true),
      canViewField: vi.fn().mockImplementation((key: string) => options.capabilities?.[key] ?? true),
      canEditField: vi.fn().mockImplementation((key: string) => options.capabilities?.[key] ?? true),
      canPerformAction: vi.fn().mockImplementation((key: string) => options.capabilities?.[key] ?? true),
    };

    if (options.permissions) {
      mockSession.hasPermission.mockImplementation((perm: string) => options.permissions!.includes(perm));
    }

    await TestBed.configureTestingModule({
      imports: [CustomerFormPage],
      providers: [
        provideRouter([{ path: 'app/customers', component: class {} }]),
        { provide: CustomersApi, useValue: mockApi },
        { provide: AuthSessionStore, useValue: mockSession },
        { provide: CapabilityService, useValue: mockCapability },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: { get: () => routeId } } },
        },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(CustomerFormPage);
    fixture.detectChanges();
    return fixture;
  }

  it('renders create form with default capability values', async () => {
    const fixture = await createPage();
    expect(fixture.nativeElement.querySelector('[data-testid="customer-form"]')).toBeTruthy();
    expect(fixture.componentInstance.showPhone()).toBe(true);
    expect(fixture.componentInstance.showPriceTier()).toBe(true);
    expect(fixture.componentInstance.showCreditSection()).toBe(true);
    expect(fixture.componentInstance.showCreditLimit()).toBe(true);
    expect(fixture.componentInstance.showCreditLimitBehaviour()).toBe(true);
  });

  it('blocks create workflow when customers.actions.create is disabled', async () => {
    const fixture = await createPage({
      capabilities: { 'customers.actions.create': false },
    });

    expect(fixture.componentInstance.canManage()).toBe(false);
    expect(fixture.nativeElement.querySelector('[data-testid="customer-form"]')).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('You do not have permission to manage customers.');
  });

  it('hides optional fields when capabilities are disabled', async () => {
    const fixture = await createPage({
      capabilities: {
        'customers.features.creditSection': false,
        'customers.fields.phone': false,
        'customers.fields.priceTier': false,
      },
    });

    expect(fixture.componentInstance.showPhone()).toBe(false);
    expect(fixture.componentInstance.showPriceTier()).toBe(false);
    expect(fixture.componentInstance.showCreditSection()).toBe(false);
    expect(fixture.nativeElement.querySelector('[data-testid="customer-phone"]')).toBeNull();
    expect(fixture.nativeElement.querySelector('[data-testid="customer-price-tier"]')).toBeNull();
    expect(fixture.nativeElement.querySelector('[data-testid="customer-credit-enabled"]')).toBeNull();
  });

  describe('Edit Mode Capability Enforcement', () => {
    it('loads customer and updates both profile and credit policy when all capabilities allowed', async () => {
      const fixture = await createPage({ routeId: 'customer-1' });
      const page = fixture.componentInstance;
      expect(page.canEditCreditPolicy()).toBe(true);

      page.save();

      expect(mockApi.updateCustomer).toHaveBeenCalledWith('customer-1', expect.objectContaining({
        name: 'Punjab Agri Corp',
      }));
      expect(mockApi.updateCreditPolicy).toHaveBeenCalledWith('customer-1', expect.objectContaining({
        creditEnabled: true,
      }));
    });

    it('skips credit policy update and disables credit controls when customers.actions.editCreditPolicy is disabled', async () => {
      const fixture = await createPage({
        routeId: 'customer-1',
        capabilities: { 'customers.actions.editCreditPolicy': false },
      });

      const page = fixture.componentInstance;
      expect(page.canEditCreditPolicy()).toBe(false);
      expect(page.form.controls.creditEnabled.disabled).toBe(true);
      expect(page.form.controls.creditLimitAmount.disabled).toBe(true);
      expect(page.form.controls.creditLimitBehaviour.disabled).toBe(true);

      page.save();

      expect(mockApi.updateCustomer).toHaveBeenCalled();
      expect(mockApi.updateCreditPolicy).not.toHaveBeenCalled();
    });

    it('disables opening balance posting when customers.actions.postOpeningBalance is disabled', async () => {
      const fixture = await createPage({
        routeId: 'customer-1',
        capabilities: { 'customers.actions.postOpeningBalance': false },
      });

      const page = fixture.componentInstance;
      expect(page.canPostOpening()).toBe(false);
      expect(fixture.nativeElement.querySelector('[data-testid="customer-opening-section"]')).toBeNull();
    });
  });
});
