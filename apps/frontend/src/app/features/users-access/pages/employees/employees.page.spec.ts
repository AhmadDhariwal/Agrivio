import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';
import { vi } from 'vitest';
import { EmployeesPage } from './employees.page';
import { EmployeeRecord, UsersAccessApi } from '../../data-access/users-access.api';
import { AuthSessionStore } from '../../../auth/data-access/auth-session.store';
import { CapabilityService } from '../../../capabilities/data-access/capability.service';
import { UiConfirmDialogComponent } from '../../../../shared/ui/ui-confirm-dialog/ui-confirm-dialog.component';

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

  const mockPendingEmployee: EmployeeRecord = {
    id: 'emp-pending',
    membershipId: 'mem-pending',
    email: 'pending@agrivio.pk',
    displayName: 'Pending Member',
    role: 'Cashier',
    status: 'pending',
    userStatus: 'pending_activation',
    version: 1,
    branchIds: ['b-1'],
    warehouseIds: [],
    activationUrl: 'https://app.agrivio.pk/activate?token=token-123',
    allowedActions: {
      canUpdate: true,
      canDeactivate: false,
      canCancelInvitation: true,
      canAssignAccess: true,
      canManageConditionalGrants: false,
    },
  };

  let listEmployeesSpy: ReturnType<typeof vi.fn>;
  let deactivateEmployeeSpy: ReturnType<typeof vi.fn>;
  let cancelInvitationSpy: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    listEmployeesSpy = vi
      .fn()
      .mockReturnValue(of({ items: [], meta: { page: 1, pageSize: 25, total: 0 } }));
    deactivateEmployeeSpy = vi
      .fn()
      .mockReturnValue(of({ ...mockEmployees[0], status: 'deactivated' }));
    cancelInvitationSpy = vi
      .fn()
      .mockReturnValue(of({ id: 'emp-pending', invitationCancelled: true }));

    await TestBed.configureTestingModule({
      imports: [EmployeesPage],
      providers: [
        provideRouter([]),
        {
          provide: UsersAccessApi,
          useValue: {
            listEmployees: listEmployeesSpy,
            deactivateEmployee: deactivateEmployeeSpy,
            cancelInvitation: cancelInvitationSpy,
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

  it('does not render authoritative-looking zero KPI values when meta.summary is absent', () => {
    listEmployeesSpy.mockReturnValue(
      of({ items: mockEmployees, meta: { page: 1, pageSize: 25, total: 2 } }),
    );

    const fixture: ComponentFixture<EmployeesPage> = TestBed.createComponent(EmployeesPage);
    fixture.detectChanges();

    expect(
      fixture.nativeElement
        .querySelector('[data-testid="kpi-total-employees"]')
        ?.textContent?.trim(),
    ).toBe('—');
    expect(
      fixture.nativeElement
        .querySelector('[data-testid="kpi-active-employees"]')
        ?.textContent?.trim(),
    ).toBe('—');
    expect(
      fixture.nativeElement
        .querySelector('[data-testid="kpi-pending-inactive-employees"]')
        ?.textContent?.trim(),
    ).toBe('—');
  });

  it('renders authoritative KPI cards from list metadata instead of paginated page rows', () => {
    listEmployeesSpy.mockReturnValue(
      of({
        items: [mockEmployees[0]],
        meta: {
          page: 1,
          pageSize: 25,
          total: 1,
          summary: { total: 12, active: 9, pendingInactive: 3 },
        },
      }),
    );

    const fixture: ComponentFixture<EmployeesPage> = TestBed.createComponent(EmployeesPage);
    fixture.detectChanges();

    expect(
      fixture.nativeElement
        .querySelector('[data-testid="kpi-total-employees"]')
        ?.textContent?.trim(),
    ).toBe('12');
    expect(
      fixture.nativeElement
        .querySelector('[data-testid="kpi-active-employees"]')
        ?.textContent?.trim(),
    ).toBe('9');
    expect(
      fixture.nativeElement
        .querySelector('[data-testid="kpi-pending-inactive-employees"]')
        ?.textContent?.trim(),
    ).toBe('3');
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
    expect(
      fixture.nativeElement
        .querySelector('[data-testid="employee-inspect-link"]')
        ?.getAttribute('href'),
    ).toBe('/app/employees/emp-1');
    expect(
      fixture.nativeElement
        .querySelector('[data-testid="employee-edit-link"]')
        ?.getAttribute('href'),
    ).toBe('/app/employees/emp-1/edit');
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

  it('uses backend allowedActions so a Manager cannot mutate Owner or Manager rows', () => {
    listEmployeesSpy.mockReturnValue(
      of({
        items: [
          {
            ...mockEmployees[0],
            allowedActions: {
              canUpdate: true,
              canDeactivate: true,
              canAssignAccess: true,
              canManageConditionalGrants: false,
            },
          },
          {
            ...mockEmployees[1],
            allowedActions: {
              canUpdate: false,
              canDeactivate: false,
              canAssignAccess: false,
              canManageConditionalGrants: false,
            },
          },
          {
            id: 'emp-3',
            membershipId: 'mem-3',
            email: 'manager@agrivio.pk',
            displayName: 'Ops Manager',
            role: 'Manager',
            status: 'active',
            userStatus: 'active',
            version: 1,
            branchIds: ['b-1'],
            warehouseIds: [],
            allowedActions: {
              canUpdate: false,
              canDeactivate: false,
              canAssignAccess: false,
              canManageConditionalGrants: false,
            },
          },
        ],
        meta: { page: 1, pageSize: 25, total: 3 },
      }),
    );

    const fixture: ComponentFixture<EmployeesPage> = TestBed.createComponent(EmployeesPage);
    fixture.detectChanges();
    const page = fixture.componentInstance;
    const storeKeeper = page.visibleItems()[0];
    const owner = page.visibleItems()[1];
    const manager = page.visibleItems()[2];
    expect(storeKeeper && page.rowCanUpdate(storeKeeper)).toBe(true);
    expect(storeKeeper && page.rowCanDeactivate(storeKeeper)).toBe(true);
    expect(owner && page.rowCanUpdate(owner)).toBe(false);
    expect(owner && page.rowCanDeactivate(owner)).toBe(false);
    expect(owner && page.rowCanInspect(owner)).toBe(true);
    expect(manager && page.rowCanUpdate(manager)).toBe(false);
    expect(manager && page.rowCanDeactivate(manager)).toBe(false);
  });

  it('renders [ Resend ] and [ Cancel Invitation ] for pending invitations and hides Deactivate', () => {
    listEmployeesSpy.mockReturnValue(
      of({ items: [mockPendingEmployee], meta: { page: 1, pageSize: 25, total: 1 } }),
    );

    const fixture = TestBed.createComponent(EmployeesPage);
    fixture.detectChanges();
    const page = fixture.componentInstance;
    const item = page.visibleItems()[0]!;

    expect(page.rowCanDeactivate(item)).toBe(false);
    expect(page.rowCanCancelInvitation(item)).toBe(true);
    expect(page.rowCanResendInvitation(item)).toBe(true);

    // Open desktop row dropdown
    page.openMenuEmployeeId.set(item.id);
    fixture.detectChanges();

    const resendBtn = fixture.nativeElement.querySelector('[data-testid="employee-resend-btn"]');
    const cancelBtn = fixture.nativeElement.querySelector(
      '[data-testid="employee-cancel-invitation-btn"]',
    );
    const deactivateBtn = fixture.nativeElement.querySelector(
      '[data-testid="employee-deactivate-btn"]',
    );

    expect(resendBtn).toBeTruthy();
    expect(cancelBtn).toBeTruthy();
    expect(deactivateBtn).toBeNull();

    // Mobile card actions
    const mobileResend = fixture.nativeElement.querySelector(
      '[data-testid="employee-mobile-resend-btn"]',
    );
    const mobileCancel = fixture.nativeElement.querySelector(
      '[data-testid="employee-mobile-cancel-invitation-btn"]',
    );
    const mobileDeactivate = fixture.nativeElement.querySelector(
      '[data-testid="employee-mobile-deactivate-btn"]',
    );

    expect(mobileResend).toBeTruthy();
    expect(mobileCancel).toBeTruthy();
    expect(mobileDeactivate).toBeNull();
  });

  it('renders Deactivate only for active employee and hides Resend and Cancel Invitation', () => {
    listEmployeesSpy.mockReturnValue(
      of({ items: [mockEmployees[0]], meta: { page: 1, pageSize: 25, total: 1 } }),
    );

    const fixture = TestBed.createComponent(EmployeesPage);
    fixture.detectChanges();
    const page = fixture.componentInstance;
    const item = page.visibleItems()[0]!;

    expect(page.rowCanDeactivate(item)).toBe(true);
    expect(page.rowCanCancelInvitation(item)).toBe(false);
    expect(page.rowCanResendInvitation(item)).toBe(false);

    // Open desktop row dropdown
    page.openMenuEmployeeId.set(item.id);
    fixture.detectChanges();

    const resendBtn = fixture.nativeElement.querySelector('[data-testid="employee-resend-btn"]');
    const cancelBtn = fixture.nativeElement.querySelector(
      '[data-testid="employee-cancel-invitation-btn"]',
    );
    const deactivateBtn = fixture.nativeElement.querySelector(
      '[data-testid="employee-deactivate-btn"]',
    );

    expect(deactivateBtn).toBeTruthy();
    expect(resendBtn).toBeNull();
    expect(cancelBtn).toBeNull();

    // Mobile card actions
    const mobileDeactivate = fixture.nativeElement.querySelector(
      '[data-testid="employee-mobile-deactivate-btn"]',
    );
    const mobileResend = fixture.nativeElement.querySelector(
      '[data-testid="employee-mobile-resend-btn"]',
    );
    const mobileCancel = fixture.nativeElement.querySelector(
      '[data-testid="employee-mobile-cancel-invitation-btn"]',
    );

    expect(mobileDeactivate).toBeTruthy();
    expect(mobileResend).toBeNull();
    expect(mobileCancel).toBeNull();
  });

  it('opens confirmation dialog on cancel invitation with danger=true and confirmLabel="Cancel Invitation"', () => {
    listEmployeesSpy.mockReturnValue(
      of({ items: [mockPendingEmployee], meta: { page: 1, pageSize: 25, total: 1 } }),
    );

    const fixture = TestBed.createComponent(EmployeesPage);
    fixture.detectChanges();
    const page = fixture.componentInstance;

    expect(page.cancelConfirmOpen()).toBe(false);
    page.askCancelInvitation(mockPendingEmployee);
    fixture.detectChanges();

    expect(page.cancelConfirmOpen()).toBe(true);

    const dialogDebugs = fixture.debugElement.queryAll(By.directive(UiConfirmDialogComponent));
    const cancelDialog = dialogDebugs.find(
      (d) => d.componentInstance.confirmLabel() === 'Cancel Invitation',
    );
    expect(cancelDialog).toBeTruthy();
    expect(cancelDialog!.componentInstance.open()).toBe(true);
    expect(cancelDialog!.componentInstance.confirmLabel()).toBe('Cancel Invitation');
    expect(cancelDialog!.componentInstance.danger()).toBe(true);
    expect(cancelDialog!.componentInstance.title()).toBe('Cancel employee invitation?');
  });

  it('executes cancel invitation and reloads the employee list', () => {
    listEmployeesSpy.mockReturnValue(
      of({ items: [mockPendingEmployee], meta: { page: 1, pageSize: 25, total: 1 } }),
    );

    const fixture = TestBed.createComponent(EmployeesPage);
    fixture.detectChanges();
    const page = fixture.componentInstance;

    page.askCancelInvitation(mockPendingEmployee);
    page.confirmCancelInvitation();

    expect(cancelInvitationSpy).toHaveBeenCalledWith('emp-pending', 1);
    expect(page.successMessage()).toContain('Invitation for Pending Member was cancelled.');
  });

  it('handles 409 conflict when cancelling invitation with standard message', () => {
    listEmployeesSpy.mockReturnValue(
      of({ items: [mockPendingEmployee], meta: { page: 1, pageSize: 25, total: 1 } }),
    );
    cancelInvitationSpy.mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 409, statusText: 'Conflict' })),
    );

    const fixture = TestBed.createComponent(EmployeesPage);
    fixture.detectChanges();
    const page = fixture.componentInstance;

    page.askCancelInvitation(mockPendingEmployee);
    page.confirmCancelInvitation();

    expect(page.errorMessage()).toBe('Invitation was modified or has already been activated.');
  });

  it('resends invitation link and displays success notification', () => {
    listEmployeesSpy.mockReturnValue(
      of({ items: [mockPendingEmployee], meta: { page: 1, pageSize: 25, total: 1 } }),
    );

    const fixture = TestBed.createComponent(EmployeesPage);
    fixture.detectChanges();
    const page = fixture.componentInstance;

    page.resendInvitation(mockPendingEmployee);

    expect(page.successMessage()).toContain('Invitation link resent for Pending Member');
  });

  it('enforces RBAC: hides Cancel Invitation when users.deactivate is missing, hides Resend when users.create is missing', () => {
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
            cancelInvitation: cancelInvitationSpy,
          },
        },
        {
          provide: AuthSessionStore,
          useValue: {
            hasPermission: (perm: string) => ['users.view'].includes(perm),
          },
        },
      ],
    }).compileComponents();

    listEmployeesSpy.mockReturnValue(
      of({ items: [mockPendingEmployee], meta: { page: 1, pageSize: 25, total: 1 } }),
    );

    const fixture = TestBed.createComponent(EmployeesPage);
    fixture.detectChanges();
    const page = fixture.componentInstance;
    const item = page.visibleItems()[0]!;

    expect(page.rowCanCancelInvitation(item)).toBe(false);
    expect(page.rowCanResendInvitation(item)).toBe(false);
    expect(page.rowCanDeactivate(item)).toBe(false);
  });
});
