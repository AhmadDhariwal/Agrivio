import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { vi } from 'vitest';
import { EmployeeFormPage } from './employee-form.page';
import { EmployeeRecord, UsersAccessApi } from '../../data-access/users-access.api';
import { AuthSessionStore } from '../../../auth/data-access/auth-session.store';
import { CapabilityService } from '../../../capabilities/data-access/capability.service';

describe('EmployeeFormPage', () => {
  const mockBranches = [
    { id: 'b-1', name: 'Multan Main Commercial Branch' },
    { id: 'b-2', name: 'Khanewal Sub-Branch' },
  ];

  const mockWarehouses = [
    { id: 'w-1', name: 'Central Distribution Warehouse' },
    { id: 'w-2', name: 'Chemical Storage Facility' },
  ];

  const mockEmployee: EmployeeRecord = {
    id: 'emp-1',
    membershipId: 'mem-1',
    email: 'rashid@agrivio.pk',
    displayName: 'Rashid Ali',
    role: 'StoreKeeper',
    status: 'active',
    userStatus: 'active',
    version: 1,
    branchIds: ['b-1'],
    warehouseIds: ['w-1'],
  };

  const ownerAccessPolicy = {
    actorRole: 'Owner',
    assignableRoles: ['Owner', 'Manager', 'Cashier', 'StoreKeeper'] as const,
    canManageConditionalGrants: true,
    roleDescriptions: {
      Owner: 'Full organization administrator with access to all tenant operations and settings.',
      Manager:
        'Runs day-to-day operations and can manage Cashiers and Store Keepers within assigned locations.',
      Cashier: 'POS-focused role for sales, customer payments, and required read-only operational data.',
      StoreKeeper:
        'Warehouse-focused role for inventory, transfers, purchasing, expiry, and supplier operations.',
    },
    grantablePermissions: {
      Cashier: [{ code: 'pricing.override', group: 'Pricing' }],
      Manager: [{ code: 'audit.view', group: 'Audit' }],
      StoreKeeper: [],
      Owner: [],
    },
  };

  let createEmployeeSpy: ReturnType<typeof vi.fn>;
  let updateEmployeeSpy: ReturnType<typeof vi.fn>;
  let replaceAssignmentsSpy: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    createEmployeeSpy = vi.fn().mockReturnValue(
      of({ ...mockEmployee, activationUrl: 'http://localhost:4200/activate?token=abc' }),
    );
    updateEmployeeSpy = vi.fn().mockReturnValue(of(mockEmployee));
    replaceAssignmentsSpy = vi.fn().mockReturnValue(
      of({ membershipId: 'mem-1', userId: 'emp-1', branchIds: ['b-1'], warehouseIds: ['w-1'] }),
    );

    await TestBed.configureTestingModule({
      imports: [EmployeeFormPage],
      providers: [
        provideRouter([]),
        {
          provide: UsersAccessApi,
          useValue: {
            getEmployee: () => of(mockEmployee),
            createEmployee: createEmployeeSpy,
            updateEmployee: updateEmployeeSpy,
            replaceAccessAssignments: replaceAssignmentsSpy,
            listAssignmentBranches: () => of(mockBranches),
            listAssignmentWarehouses: () => of(mockWarehouses),
            getAccessPolicy: () => of(ownerAccessPolicy),
          },
        },
        {
          provide: AuthSessionStore,
          useValue: {
            hasPermission: () => true,
            activeContext: () => ({ role: 'Owner', contextType: 'organization' }),
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

  it('renders create form with guidance card and assignment lists', () => {
    const fixture: ComponentFixture<EmployeeFormPage> = TestBed.createComponent(EmployeeFormPage);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[data-testid="employee-form"]')).toBeTruthy();
    expect(fixture.nativeElement.textContent).toContain('Access & role overview');
    expect(fixture.nativeElement.textContent).toContain('Multan Main Commercial Branch');
    expect(fixture.nativeElement.textContent).toContain('Central Distribution Warehouse');
  });

  it('allows toggling branch and warehouse assignments and helper actions', () => {
    const fixture: ComponentFixture<EmployeeFormPage> = TestBed.createComponent(EmployeeFormPage);
    fixture.detectChanges();

    const comp = fixture.componentInstance;
    comp.toggleBranch('b-1', true);
    expect(comp.isBranchChecked('b-1')).toBe(true);

    comp.selectAllBranches();
    expect(comp.isBranchChecked('b-1')).toBe(true);
    expect(comp.isBranchChecked('b-2')).toBe(true);

    comp.clearAllBranches();
    expect(comp.isBranchChecked('b-1')).toBe(false);
    expect(comp.isBranchChecked('b-2')).toBe(false);
  });

  it('submits valid create payload and replaces assignments', () => {
    const fixture: ComponentFixture<EmployeeFormPage> = TestBed.createComponent(EmployeeFormPage);
    fixture.detectChanges();

    const comp = fixture.componentInstance;
    comp.form.patchValue({
      email: 'newbie@agrivio.pk',
      displayName: 'New Member',
      role: 'Cashier',
      branchIds: ['b-1'],
      warehouseIds: ['w-1'],
    });

    comp.save();

    expect(createEmployeeSpy).toHaveBeenCalledWith({
      email: 'newbie@agrivio.pk',
      displayName: 'New Member',
      role: 'Cashier',
      conditionalPermissionGrants: [],
    });
    expect(replaceAssignmentsSpy).toHaveBeenCalledWith('emp-1', {
      branchIds: ['b-1'],
      warehouseIds: ['w-1'],
    });
  });

  it('disables save while required fields are missing', () => {
    const fixture: ComponentFixture<EmployeeFormPage> = TestBed.createComponent(EmployeeFormPage);
    fixture.detectChanges();

    const saveButton = fixture.nativeElement.querySelector(
      '[data-testid="employee-save"]',
    ) as HTMLButtonElement;
    expect(saveButton.disabled).toBe(true);
  });

  it('enables save when required fields are filled', () => {
    const fixture: ComponentFixture<EmployeeFormPage> = TestBed.createComponent(EmployeeFormPage);
    fixture.detectChanges();

    const comp = fixture.componentInstance;
    comp.form.patchValue({
      email: 'cashier@agrivio.test',
      displayName: 'Test Cashier',
    });
    fixture.detectChanges();

    const saveButton = fixture.nativeElement.querySelector(
      '[data-testid="employee-save"]',
    ) as HTMLButtonElement;
    expect(saveButton.disabled).toBe(false);
  });

  it('blocks invalid submit without calling createEmployee', () => {
    const fixture: ComponentFixture<EmployeeFormPage> = TestBed.createComponent(EmployeeFormPage);
    fixture.detectChanges();

    const comp = fixture.componentInstance;
    comp.save();
    fixture.detectChanges();

    expect(createEmployeeSpy).not.toHaveBeenCalled();
    expect(fixture.nativeElement.textContent).toContain('Email is required.');
  });

  it('shows Owner role options, role description, and Cashier C-grants', () => {
    const fixture: ComponentFixture<EmployeeFormPage> = TestBed.createComponent(EmployeeFormPage);
    fixture.detectChanges();

    const options = [
      ...fixture.nativeElement.querySelectorAll('[data-testid="employee-role"] option'),
    ].map((option: HTMLOptionElement) => option.value);
    expect(options).toEqual(['Owner', 'Manager', 'Cashier', 'StoreKeeper']);
    expect(
      fixture.nativeElement.querySelector('[data-testid="employee-role-description"]')?.textContent,
    ).toContain('POS-focused role');

    fixture.componentInstance.form.controls.role.setValue('Cashier');
    fixture.componentInstance.onRoleChange('Cashier');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-testid="employee-conditional-grants"]')).toBeTruthy();
    expect(fixture.nativeElement.textContent).toContain('Pricing');
  });

  it('does not replace assignments when assignAccess capability is disabled', async () => {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [EmployeeFormPage],
      providers: [
        provideRouter([]),
        {
          provide: UsersAccessApi,
          useValue: {
            getEmployee: () => of(mockEmployee),
            createEmployee: createEmployeeSpy,
            updateEmployee: updateEmployeeSpy,
            replaceAccessAssignments: replaceAssignmentsSpy,
            listAssignmentBranches: () => of(mockBranches),
            listAssignmentWarehouses: () => of(mockWarehouses),
            getAccessPolicy: () => of(ownerAccessPolicy),
          },
        },
        {
          provide: AuthSessionStore,
          useValue: { hasPermission: () => true, activeContext: () => ({ role: 'Owner' }) },
        },
        {
          provide: CapabilityService,
          useValue: {
            canUseModule: () => true,
            canViewField: () => true,
            canEditField: () => true,
            canPerformAction: (key: string) => key !== 'employees.actions.assignAccess',
          },
        },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: { paramMap: { get: () => null } },
          },
        },
      ],
    }).compileComponents();

    const fixture: ComponentFixture<EmployeeFormPage> = TestBed.createComponent(EmployeeFormPage);
    fixture.detectChanges();

    const comp = fixture.componentInstance;
    comp.form.patchValue({
      email: 'newbie@agrivio.pk',
      displayName: 'New Member',
      role: 'Cashier',
      branchIds: ['b-1'],
      warehouseIds: ['w-1'],
    });
    comp.save();

    expect(createEmployeeSpy).toHaveBeenCalled();
    expect(replaceAssignmentsSpy).not.toHaveBeenCalled();
    expect(comp.canAssign()).toBe(false);
  });
});
