import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { vi } from 'vitest';
import { EmployeesPage } from './employees.page';
import { EmployeeRecord, UsersAccessApi } from '../../data-access/users-access.api';
import { AuthSessionStore } from '../../../auth/data-access/auth-session.store';
import { CapabilityService } from '../../../capabilities/data-access/capability.service';

describe('EmployeesPage', () => {
  const mockEmployees: EmployeeRecord[] = [
    {
      id: 'emp-1',
      membershipId: 'mem-1',
      email: 'rashid@agrivio.pk',
      displayName: 'Rashid Ali',
      role: 'StoreKeeper',
      status: 'active',
      userStatus: 'active',
      version: 1,
      branchIds: ['b-1', 'b-2'],
      warehouseIds: ['w-1'],
    },
    {
      id: 'emp-2',
      membershipId: 'mem-2',
      email: 'tariq@agrivio.pk',
      displayName: 'Chaudhry Tariq',
      role: 'Owner',
      status: 'active',
      userStatus: 'active',
      version: 2,
      branchIds: ['b-1'],
      warehouseIds: [],
    },
  ];

  let listEmployeesSpy: ReturnType<typeof vi.fn>;
  let deactivateEmployeeSpy: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    listEmployeesSpy = vi.fn().mockReturnValue(
      of({ items: [], meta: { page: 1, pageSize: 25, total: 0 } }),
    );
    deactivateEmployeeSpy = vi.fn().mockReturnValue(
      of({ ...mockEmployees[0], status: 'deactivated' }),
    );

    await TestBed.configureTestingModule({
      imports: [EmployeesPage],
      providers: [
        provideRouter([]),
        {
          provide: UsersAccessApi,
          useValue: {
            listEmployees: listEmployeesSpy,
            deactivateEmployee: deactivateEmployeeSpy,
          },
        },
        {
          provide: AuthSessionStore,
          useValue: {
            hasPermission: (perm: string) =>
              ['users.view', 'users.create', 'users.update', 'users.deactivate'].includes(perm),
          },
        },
      ],
    }).compileComponents();
  });

  it('shows empty state when no employees exist', () => {
    const fixture: ComponentFixture<EmployeesPage> = TestBed.createComponent(EmployeesPage);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('No employees found');
  });

  it('renders employee table rows with role badges and access summaries', () => {
    listEmployeesSpy.mockReturnValue(
      of({ items: mockEmployees, meta: { page: 1, pageSize: 25, total: 2 } }),
    );

    const fixture: ComponentFixture<EmployeesPage> = TestBed.createComponent(EmployeesPage);
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent;
    expect(text).toContain('Rashid Ali');
    expect(text).toContain('rashid@agrivio.pk');
    expect(text).toContain('Store Keeper');
    expect(text).toContain('2 branches');
    expect(text).toContain('1 warehouse');
    expect(text).toContain('Chaudhry Tariq');
  });

  it('filters employees by status and role', () => {
    listEmployeesSpy.mockReturnValue(
      of({ items: mockEmployees, meta: { page: 1, pageSize: 25, total: 2 } }),
    );

    const fixture: ComponentFixture<EmployeesPage> = TestBed.createComponent(EmployeesPage);
    fixture.detectChanges();

    fixture.componentInstance.onRoleChange('Owner');
    fixture.detectChanges();

    expect(fixture.componentInstance.visibleItems().length).toBe(1);
    expect(fixture.componentInstance.visibleItems()[0]?.displayName).toBe('Chaudhry Tariq');
  });

  it('triggers deactivation modal and calls API on confirm', () => {
    listEmployeesSpy.mockReturnValue(
      of({ items: mockEmployees, meta: { page: 1, pageSize: 25, total: 2 } }),
    );

    const fixture: ComponentFixture<EmployeesPage> = TestBed.createComponent(EmployeesPage);
    fixture.detectChanges();

    const target = mockEmployees[0];
    if (target) {
      fixture.componentInstance.askDeactivate(target);
      expect(fixture.componentInstance.confirmOpen()).toBe(true);

      fixture.componentInstance.confirmDeactivate();
      expect(deactivateEmployeeSpy).toHaveBeenCalledWith('emp-1');
    }
  });

  it('hides Add Employee when create action capability is disabled', () => {
    listEmployeesSpy.mockReturnValue(
      of({ items: mockEmployees, meta: { page: 1, pageSize: 25, total: 2 } }),
    );

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [EmployeesPage],
      providers: [
        provideRouter([]),
        {
          provide: UsersAccessApi,
          useValue: {
            listEmployees: listEmployeesSpy,
            deactivateEmployee: deactivateEmployeeSpy,
          },
        },
        {
          provide: AuthSessionStore,
          useValue: {
            hasPermission: (perm: string) =>
              ['users.view', 'users.create', 'users.update', 'users.deactivate'].includes(perm),
          },
        },
        {
          provide: CapabilityService,
          useValue: {
            canUseModule: () => true,
            canUseFeature: () => true,
            canViewField: () => true,
            canPerformAction: (key: string) => key !== 'employees.actions.create',
          },
        },
      ],
    }).compileComponents();

    const fixture: ComponentFixture<EmployeesPage> = TestBed.createComponent(EmployeesPage);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[data-testid="employee-create-link"]')).toBeNull();
    expect(fixture.componentInstance.canCreate()).toBe(false);
  });
});
