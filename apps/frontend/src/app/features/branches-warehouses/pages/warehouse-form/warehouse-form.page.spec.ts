import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { vi } from 'vitest';
import { WarehouseFormPage } from './warehouse-form.page';
import { BranchesWarehousesApi, WarehouseRecord } from '../../data-access/branches-warehouses.api';
import { AuthSessionStore } from '../../../auth/data-access/auth-session.store';
import { CapabilityService } from '../../../capabilities/data-access/capability.service';

describe('WarehouseFormPage', () => {
  const mockWarehouse: WarehouseRecord = {
    id: 'wh-1',
    organizationId: 'org-1',
    name: 'Central Distribution Hub (Multan)',
    code: 'WH-MLT-01',
    status: 'active',
    version: 1,
  };

  let createWarehouseSpy: ReturnType<typeof vi.fn>;
  let updateWarehouseSpy: ReturnType<typeof vi.fn>;
  let canUseModuleSpy: ReturnType<typeof vi.fn>;
  let canViewFieldSpy: ReturnType<typeof vi.fn>;
  let canEditFieldSpy: ReturnType<typeof vi.fn>;
  let canPerformActionSpy: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    createWarehouseSpy = vi.fn().mockReturnValue(of(mockWarehouse));
    updateWarehouseSpy = vi.fn().mockReturnValue(of(mockWarehouse));
    canUseModuleSpy = vi.fn().mockReturnValue(true);
    canViewFieldSpy = vi.fn().mockReturnValue(true);
    canEditFieldSpy = vi.fn().mockReturnValue(true);
    canPerformActionSpy = vi.fn().mockReturnValue(true);

    await TestBed.configureTestingModule({
      imports: [WarehouseFormPage],
      providers: [
        provideRouter([{ path: 'app/warehouses', component: WarehouseFormPage }]),
        {
          provide: BranchesWarehousesApi,
          useValue: {
            getWarehouse: () => of(mockWarehouse),
            createWarehouse: createWarehouseSpy,
            updateWarehouse: updateWarehouseSpy,
          },
        },
        {
          provide: AuthSessionStore,
          useValue: {
            hasPermission: () => true,
          },
        },
        {
          provide: CapabilityService,
          useValue: {
            canUseModule: canUseModuleSpy,
            canViewField: canViewFieldSpy,
            canEditField: canEditFieldSpy,
            canPerformAction: canPerformActionSpy,
          },
        },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              paramMap: {
                get: (key: string) => (key === 'id' ? null : null),
              },
            },
          },
        },
      ],
    }).compileComponents();
  });

  it('renders create form with guidance card', () => {
    const fixture: ComponentFixture<WarehouseFormPage> = TestBed.createComponent(WarehouseFormPage);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[data-testid="warehouse-form"]')).toBeTruthy();
    expect(fixture.nativeElement.textContent).toContain('Warehouse code guidance');
    expect(fixture.nativeElement.textContent).toContain('Short and easy to remember');
  });

  it('validates required warehouse name on submit', () => {
    const fixture: ComponentFixture<WarehouseFormPage> = TestBed.createComponent(WarehouseFormPage);
    fixture.detectChanges();

    const comp = fixture.componentInstance;
    comp.form.patchValue({ name: '', code: '' });
    comp.save();
    fixture.detectChanges();

    expect(comp.form.invalid).toBe(true);
    expect(createWarehouseSpy).not.toHaveBeenCalled();
    expect(fixture.nativeElement.textContent).toContain('Name is required.');
  });

  it('submits valid create warehouse payload', () => {
    const fixture: ComponentFixture<WarehouseFormPage> = TestBed.createComponent(WarehouseFormPage);
    fixture.detectChanges();

    const comp = fixture.componentInstance;
    comp.form.patchValue({
      name: 'Lahore Central Warehouse',
      code: 'LHR-CENTRAL',
    });

    comp.save();

    expect(createWarehouseSpy).toHaveBeenCalledWith({
      name: 'Lahore Central Warehouse',
      code: 'LHR-CENTRAL',
    });
  });

  it('hides code field when warehouses.fields.code is not viewable', () => {
    canViewFieldSpy.mockImplementation((field: string) => field !== 'warehouses.fields.code');
    const fixture: ComponentFixture<WarehouseFormPage> = TestBed.createComponent(WarehouseFormPage);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[data-testid="warehouse-code"]')).toBeNull();
  });

  it('prevents saving when warehouses.actions.create is disallowed', () => {
    canPerformActionSpy.mockImplementation((action: string) => action !== 'warehouses.actions.create');
    const fixture: ComponentFixture<WarehouseFormPage> = TestBed.createComponent(WarehouseFormPage);
    fixture.detectChanges();

    const comp = fixture.componentInstance;
    comp.form.patchValue({ name: 'Test', code: 'TST' });
    comp.save();

    expect(createWarehouseSpy).not.toHaveBeenCalled();
    expect(comp.errorMessage()).toContain('You do not have permission');
  });

  it('disables save while required fields are missing', () => {
    const fixture: ComponentFixture<WarehouseFormPage> = TestBed.createComponent(WarehouseFormPage);
    fixture.detectChanges();

    const saveButton = fixture.nativeElement.querySelector(
      '[data-testid="warehouse-save"]',
    ) as HTMLButtonElement;
    expect(saveButton.disabled).toBe(true);
  });

  it('enables save when the required name is filled', () => {
    const fixture: ComponentFixture<WarehouseFormPage> = TestBed.createComponent(WarehouseFormPage);
    fixture.detectChanges();

    const comp = fixture.componentInstance;
    comp.form.patchValue({ name: 'Lahore Central Warehouse' });
    fixture.detectChanges();

    const saveButton = fixture.nativeElement.querySelector(
      '[data-testid="warehouse-save"]',
    ) as HTMLButtonElement;
    expect(saveButton.disabled).toBe(false);
  });

  it('omits code from update payload when code field is not editable', async () => {
    TestBed.resetTestingModule();
    canEditFieldSpy.mockImplementation((field: string) => field !== 'warehouses.fields.code');
    canViewFieldSpy.mockReturnValue(true);
    canPerformActionSpy.mockReturnValue(true);

    await TestBed.configureTestingModule({
      imports: [WarehouseFormPage],
      providers: [
        provideRouter([{ path: 'app/warehouses', component: WarehouseFormPage }]),
        {
          provide: BranchesWarehousesApi,
          useValue: {
            getWarehouse: () => of(mockWarehouse),
            createWarehouse: createWarehouseSpy,
            updateWarehouse: updateWarehouseSpy,
          },
        },
        {
          provide: AuthSessionStore,
          useValue: { hasPermission: () => true },
        },
        {
          provide: CapabilityService,
          useValue: {
            canUseModule: canUseModuleSpy,
            canViewField: canViewFieldSpy,
            canEditField: canEditFieldSpy,
            canPerformAction: canPerformActionSpy,
          },
        },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              paramMap: {
                get: (key: string) => (key === 'id' ? 'wh-1' : null),
              },
            },
          },
        },
      ],
    }).compileComponents();

    const fixture: ComponentFixture<WarehouseFormPage> = TestBed.createComponent(WarehouseFormPage);
    fixture.detectChanges();

    const comp = fixture.componentInstance;
    comp.form.patchValue({ name: 'Updated Name', code: 'WH-MLT-01', status: 'active' });
    comp.save();

    expect(updateWarehouseSpy).toHaveBeenCalledWith('wh-1', {
      expectedVersion: 1,
      name: 'Updated Name',
      status: 'active',
    });
  });
});
