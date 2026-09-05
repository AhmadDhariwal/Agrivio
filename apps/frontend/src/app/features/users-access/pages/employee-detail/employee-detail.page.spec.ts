import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { EmployeeDetailPage } from './employee-detail.page';
import { UsersAccessApi } from '../../data-access/users-access.api';
import { AuthSessionStore } from '../../../auth/data-access/auth-session.store';
import { CapabilityService } from '../../../capabilities/data-access/capability.service';

describe('EmployeeDetailPage', () => {
  it('renders an authoritative employee DTO without an edit form', async () => {
    const api = {
      getEmployee: vi.fn().mockReturnValue(
        of({
          id: 'employee-1',
          membershipId: 'membership-1',
          email: 'worker@example.com',
          displayName: 'Field Worker',
          role: 'StoreKeeper',
          status: 'active',
          userStatus: 'active',
          version: 2,
          branchIds: ['branch-1'],
          warehouseIds: ['warehouse-1'],
          allowedActions: {
            canUpdate: false,
            canDeactivate: false,
            canAssignAccess: false,
            canManageConditionalGrants: false,
          },
        }),
      ),
    };
    await TestBed.configureTestingModule({
      imports: [EmployeeDetailPage],
      providers: [
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: convertToParamMap({ id: 'employee-1' }) } },
        },
        { provide: UsersAccessApi, useValue: api },
        {
          provide: AuthSessionStore,
          useValue: { hasPermission: (permission: string) => permission === 'users.view' },
        },
        {
          provide: CapabilityService,
          useValue: {
            canUseModule: () => true,
            canPerformAction: () => true,
            canViewField: () => true,
          },
        },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(EmployeeDetailPage);
    fixture.detectChanges();
    expect(api.getEmployee).toHaveBeenCalledWith('employee-1');
    expect(fixture.nativeElement.textContent).toContain('Field Worker');
    expect(fixture.nativeElement.textContent).toContain('Store Keeper');
    expect(fixture.nativeElement.querySelector('form')).toBeNull();
    expect(fixture.nativeElement.querySelector('[data-testid="employee-detail-edit"]')).toBeNull();
  });
});
