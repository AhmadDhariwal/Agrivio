import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { vi } from 'vitest';
import { EmployeeFormPage } from './employee-form.page';
import { EmployeeRecord, UsersAccessApi } from '../../data-access/users-access.api';
import { AuthSessionStore } from '../../../auth/data-access/auth-session.store';

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
          },
        },
        {
          provide: AuthSessionStore,
          useValue: {
            hasPermission: () => true,
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
    });
    expect(replaceAssignmentsSpy).toHaveBeenCalledWith('emp-1', {
      branchIds: ['b-1'],
      warehouseIds: ['w-1'],
    });
  });
});
