import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { SupplierFormPage } from './supplier-form.page';
import { SuppliersApi } from '../../data-access/suppliers.api';
import { AuthSessionStore } from '../../../auth/data-access/auth-session.store';
import { CapabilityService } from '../../../capabilities/data-access/capability.service';
import { SupplierRecord } from '../../models/suppliers.models';

const mockSupplier: SupplierRecord = {
  id: 'supplier-1',
  organizationId: 'org-1',
  name: 'BioFert Organic & Chemical',
  contactName: 'Muhammad Tariq',
  phone: '042-35920001',
  email: 'sales@biofert.pk',
  status: 'active',
  version: 2,
  derivedBalances: {
    payable: { amount: '45000.00', currency: 'PKR' },
    advance: { amount: '0.00', currency: 'PKR' },
  },
};

describe('SupplierFormPage', () => {
  let mockApi: {
    getSupplier: any;
    createSupplier: any;
    updateSupplier: any;
    postOpeningBalance: any;
  };
  let mockSession: { hasPermission: any };

  beforeEach(() => {
    mockApi = {
      getSupplier: vi.fn().mockReturnValue(of(mockSupplier)),
      createSupplier: vi.fn().mockReturnValue(of({ id: 'supplier-1' })),
      updateSupplier: vi.fn().mockReturnValue(of(mockSupplier)),
      postOpeningBalance: vi.fn().mockReturnValue(of(mockSupplier)),
    };
    mockSession = { hasPermission: vi.fn().mockReturnValue(true) };
  });

  async function createPage(options: {
    routeId?: string;
    capabilities?: Partial<Record<string, boolean>>;
    permissions?: string[];
  } = {}): Promise<ComponentFixture<SupplierFormPage>> {
    const routeId = options.routeId ?? 'new';
    const mockCapability = {
      canUseModule: vi.fn().mockReturnValue(options.capabilities?.['suppliers'] ?? true),
      canUseView: vi.fn().mockImplementation((key: string) => options.capabilities?.[key] ?? true),
      canViewField: vi.fn().mockImplementation((key: string) => options.capabilities?.[key] ?? true),
      canEditField: vi.fn().mockImplementation((key: string) => options.capabilities?.[key] ?? true),
      canPerformAction: vi.fn().mockImplementation((key: string) => options.capabilities?.[key] ?? true),
    };

    if (options.permissions) {
      mockSession.hasPermission.mockImplementation((perm: string) => options.permissions!.includes(perm));
    }

    await TestBed.configureTestingModule({
      imports: [SupplierFormPage],
      providers: [
        provideRouter([{ path: 'app/suppliers', component: class {} }]),
        { provide: SuppliersApi, useValue: mockApi },
        { provide: AuthSessionStore, useValue: mockSession },
        { provide: CapabilityService, useValue: mockCapability },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: { get: () => routeId } } },
        },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(SupplierFormPage);
    fixture.detectChanges();
    return fixture;
  }

  it('renders create form with default capability values', async () => {
    const fixture = await createPage();
    expect(fixture.nativeElement.querySelector('[data-testid="supplier-form"]')).toBeTruthy();
    expect(fixture.componentInstance.showContactName()).toBe(true);
    expect(fixture.componentInstance.showPhone()).toBe(true);
    expect(fixture.componentInstance.showEmail()).toBe(true);
  });

  it('blocks create workflow when suppliers.actions.create is disabled', async () => {
    const fixture = await createPage({
      capabilities: { 'suppliers.actions.create': false },
    });

    expect(fixture.componentInstance.canManage()).toBe(false);
    expect(fixture.nativeElement.querySelector('[data-testid="supplier-form"]')).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('You do not have permission to manage suppliers.');
  });

  it('hides optional fields when capabilities are disabled', async () => {
    const fixture = await createPage({
      capabilities: {
        'suppliers.fields.contactName': false,
        'suppliers.fields.phone': false,
        'suppliers.fields.email': false,
      },
    });

    expect(fixture.componentInstance.showContactName()).toBe(false);
    expect(fixture.componentInstance.showPhone()).toBe(false);
    expect(fixture.componentInstance.showEmail()).toBe(false);
    expect(fixture.nativeElement.querySelector('[data-testid="supplier-contact-name"]')).toBeNull();
    expect(fixture.nativeElement.querySelector('[data-testid="supplier-phone"]')).toBeNull();
    expect(fixture.nativeElement.querySelector('[data-testid="supplier-email"]')).toBeNull();
  });

  it('disables save while required fields are missing', async () => {
    const fixture = await createPage();
    const saveButton = fixture.nativeElement.querySelector(
      '[data-testid="supplier-save"]',
    ) as HTMLButtonElement;
    expect(saveButton.disabled).toBe(true);
  });

  it('enables save when valid required name is entered', async () => {
    const fixture = await createPage();
    const page = fixture.componentInstance;
    page.form.controls.name.setValue('Ahmad Supplier');
    fixture.detectChanges();
    const saveButton = fixture.nativeElement.querySelector(
      '[data-testid="supplier-save"]',
    ) as HTMLButtonElement;
    expect(saveButton.disabled).toBe(false);
  });

  it('blocks invalid submit without calling createSupplier', async () => {
    const fixture = await createPage();
    const page = fixture.componentInstance;

    page.save();
    fixture.detectChanges();

    expect(mockApi.createSupplier).not.toHaveBeenCalled();
    expect(fixture.nativeElement.textContent).toContain('Name is required.');
  });

  describe('Edit Mode Capability Enforcement', () => {
    it('loads supplier and updates profile when all capabilities allowed', async () => {
      const fixture = await createPage({ routeId: 'supplier-1' });
      const page = fixture.componentInstance;
      expect(page.canManage()).toBe(true);

      page.save();

      expect(mockApi.updateSupplier).toHaveBeenCalledWith('supplier-1', expect.objectContaining({
        name: 'BioFert Organic & Chemical',
      }));
    });

    it('disables field controls when capability indicates not editable', async () => {
      const fixture = await createPage({
        routeId: 'supplier-1',
        capabilities: { 'suppliers.fields.contactName': false },
      });

      const page = fixture.componentInstance;
      expect(page.form.controls.contactName.disabled).toBe(true);
    });

    it('omits disabled fields from edit PATCH payload', async () => {
      const fixture = await createPage({
        routeId: 'supplier-1',
        capabilities: { 'suppliers.fields.contactName': false },
      });

      const page = fixture.componentInstance;
      page.save();

      expect(mockApi.updateSupplier).toHaveBeenCalledWith(
        'supplier-1',
        expect.not.objectContaining({ contactName: expect.anything() }),
      );
    });

    it('disables opening balance posting when suppliers.actions.postOpeningBalance is disabled', async () => {
      const fixture = await createPage({
        routeId: 'supplier-1',
        capabilities: { 'suppliers.actions.postOpeningBalance': false },
      });

      const page = fixture.componentInstance;
      expect(page.canPostOpening()).toBe(false);
      expect(fixture.nativeElement.querySelector('[data-testid="supplier-opening-section"]')).toBeNull();
    });
  });
});
