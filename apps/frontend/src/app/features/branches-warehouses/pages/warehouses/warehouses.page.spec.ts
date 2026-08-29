import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { vi } from 'vitest';
import { WarehousesPage } from './warehouses.page';
import { BranchesWarehousesApi, WarehouseRecord } from '../../data-access/branches-warehouses.api';
import { AuthSessionStore } from '../../../auth/data-access/auth-session.store';
import { CapabilityService } from '../../../capabilities/data-access/capability.service';

describe('WarehousesPage', () => {
  const mockWarehouses: WarehouseRecord[] = [
    {
      id: 'wh-1',
      organizationId: 'org-1',
      name: 'Central Distribution Hub (Multan)',
      code: 'WH-MLT-01',
      status: 'active',
      version: 1,
    },
    {
      id: 'wh-2',
      organizationId: 'org-1',
      name: 'Raw Material Store (Lodhran)',
      code: 'WH-LOD-01',
      status: 'inactive',
      version: 2,
    },
  ];

  let listWarehousesSpy: ReturnType<typeof vi.fn>;
  let updateWarehouseSpy: ReturnType<typeof vi.fn>;
  let deleteWarehouseSpy: ReturnType<typeof vi.fn>;
  let canUseModuleSpy: ReturnType<typeof vi.fn>;
  let canUseFeatureSpy: ReturnType<typeof vi.fn>;
  let canViewFieldSpy: ReturnType<typeof vi.fn>;
  let canPerformActionSpy: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    listWarehousesSpy = vi.fn().mockReturnValue(
      of({ items: [], meta: { page: 1, pageSize: 25, total: 0 } }),
    );
    updateWarehouseSpy = vi.fn().mockReturnValue(
      of({ ...mockWarehouses[0], status: 'inactive' }),
    );
    deleteWarehouseSpy = vi.fn().mockReturnValue(of({ id: 'wh-1', deleted: true }));
    canUseModuleSpy = vi.fn().mockReturnValue(true);
    canUseFeatureSpy = vi.fn().mockReturnValue(true);
    canViewFieldSpy = vi.fn().mockReturnValue(true);
    canPerformActionSpy = vi.fn().mockReturnValue(true);

    await TestBed.configureTestingModule({
      imports: [WarehousesPage],
      providers: [
        provideRouter([]),
        {
          provide: BranchesWarehousesApi,
          useValue: {
            listWarehouses: listWarehousesSpy,
            updateWarehouse: updateWarehouseSpy,
            deleteWarehouse: deleteWarehouseSpy,
          },
        },
        {
          provide: AuthSessionStore,
          useValue: {
            hasPermission: (perm: string) =>
              ['warehouses.view', 'warehouses.manage'].includes(perm),
          },
        },
        {
          provide: CapabilityService,
          useValue: {
            canUseModule: canUseModuleSpy,
            canUseFeature: canUseFeatureSpy,
            canViewField: canViewFieldSpy,
            canPerformAction: canPerformActionSpy,
          },
        },
      ],
    }).compileComponents();
  });

  it('shows empty state when no warehouses exist', () => {
    const fixture: ComponentFixture<WarehousesPage> = TestBed.createComponent(WarehousesPage);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('No warehouses yet');
  });

  it('renders warehouse table rows with code and status indicator', () => {
    listWarehousesSpy.mockReturnValue(
      of({ items: mockWarehouses, meta: { page: 1, pageSize: 25, total: 2 } }),
    );

    const fixture: ComponentFixture<WarehousesPage> = TestBed.createComponent(WarehousesPage);
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent;
    expect(text).toContain('Central Distribution Hub (Multan)');
    expect(text).toContain('WH-MLT-01');
    expect(text).toContain('Active');
    expect(text).toContain('Raw Material Store (Lodhran)');
    expect(text).toContain('WH-LOD-01');
    expect(text).toContain('Inactive');
  });

  it('dispatches server queries on status filter and search changes', () => {
    listWarehousesSpy.mockReturnValue(
      of({ items: mockWarehouses, meta: { page: 1, pageSize: 25, total: 2 } }),
    );

    const fixture: ComponentFixture<WarehousesPage> = TestBed.createComponent(WarehousesPage);
    fixture.detectChanges();

    fixture.componentInstance.onStatusChange('active');
    expect(listWarehousesSpy).toHaveBeenCalledWith({
      page: 1,
      pageSize: 25,
      status: 'active',
    });
  });

  it('triggers deactivate and reactivate lifecycle dialogs', () => {
    listWarehousesSpy.mockReturnValue(
      of({ items: mockWarehouses, meta: { page: 1, pageSize: 25, total: 2 } }),
    );

    const fixture: ComponentFixture<WarehousesPage> = TestBed.createComponent(WarehousesPage);
    fixture.detectChanges();

    const activeItem = mockWarehouses[0];
    if (activeItem) {
      fixture.componentInstance.askDeactivate(activeItem);
      expect(fixture.componentInstance.confirmOpen()).toBe(true);
      expect(fixture.componentInstance.confirmLabel()).toBe('Deactivate');

      fixture.componentInstance.confirmLifecycle();
      expect(updateWarehouseSpy).toHaveBeenCalledWith('wh-1', {
        expectedVersion: 1,
        status: 'inactive',
      });
    }
  });

  it('triggers permanent delete dialog and handles submission', () => {
    listWarehousesSpy.mockReturnValue(
      of({ items: mockWarehouses, meta: { page: 1, pageSize: 25, total: 2 } }),
    );

    const fixture: ComponentFixture<WarehousesPage> = TestBed.createComponent(WarehousesPage);
    fixture.detectChanges();

    const target = mockWarehouses[0];
    if (target) {
      fixture.componentInstance.askDelete(target);
      expect(fixture.componentInstance.confirmOpen()).toBe(true);
      expect(fixture.componentInstance.confirmLabel()).toBe('Delete permanently');

      fixture.componentInstance.confirmLifecycle();
      expect(deleteWarehouseSpy).toHaveBeenCalledWith('wh-1');
    }
  });

  it('hides create button when warehouses.actions.create capability is disallowed', () => {
    canPerformActionSpy.mockImplementation((action: string) => action !== 'warehouses.actions.create');
    const fixture: ComponentFixture<WarehousesPage> = TestBed.createComponent(WarehousesPage);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[data-testid="warehouse-create-link"]')).toBeNull();
  });

  it('hides code column when warehouses.fields.code capability is not visible', () => {
    listWarehousesSpy.mockReturnValue(
      of({ items: mockWarehouses, meta: { page: 1, pageSize: 25, total: 2 } }),
    );
    canViewFieldSpy.mockImplementation((field: string) => field !== 'warehouses.fields.code');

    const fixture: ComponentFixture<WarehousesPage> = TestBed.createComponent(WarehousesPage);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.wh-table__th--code')).toBeNull();
    expect(fixture.nativeElement.textContent).not.toContain('WH-MLT-01');
  });

  it('hides module info when warehouses.features.moduleInfo capability is disabled', () => {
    canUseFeatureSpy.mockImplementation((feat: string) => feat !== 'warehouses.features.moduleInfo');
    const fixture: ComponentFixture<WarehousesPage> = TestBed.createComponent(WarehousesPage);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('agrivio-ui-module-info')).toBeNull();
  });
});
