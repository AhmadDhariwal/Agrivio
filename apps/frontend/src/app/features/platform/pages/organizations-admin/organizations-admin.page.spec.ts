import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';
import { PlatformOrganizationsPage } from './organizations-admin.page';
import { PlatformOrganizationsApi } from '../../data-access/platform-organizations.api';
import { PlatformOrganizationSummary } from '../../models/platform-organization.models';

describe('PlatformOrganizationsPage', () => {
  let fixture: ComponentFixture<PlatformOrganizationsPage>;
  let page: PlatformOrganizationsPage;
  let apiMock: {
    list: ReturnType<typeof vi.fn>;
    getSummaryKpis: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    suspend: ReturnType<typeof vi.fn>;
    reactivate: ReturnType<typeof vi.fn>;
    approve: ReturnType<typeof vi.fn>;
    reject: ReturnType<typeof vi.fn>;
    reissueActivation: ReturnType<typeof vi.fn>;
  };

  const sampleOrg: PlatformOrganizationSummary = {
    id: 'org-1',
    name: 'Green Field Enterprises',
    status: 'approved',
    version: 2,
    timezone: 'Asia/Karachi',
    ownerEmail: 'owner@greenfield.com',
    ownerNeedsActivation: false,
    branchCount: 3,
    warehouseCount: 2,
    employeeCount: 15,
    subscription: {
      id: 'sub-1',
      status: 'active',
      planCode: 'Business',
      planVersion: 1,
    },
  };

  beforeEach(async () => {
    apiMock = {
      list: vi.fn().mockReturnValue(
        of({
          items: [sampleOrg],
          meta: { page: 1, pageSize: 25, total: 1 },
        }),
      ),
      getSummaryKpis: vi.fn().mockReturnValue(
        of({
          total: 10,
          active: 8,
          suspended: 1,
          trial: 1,
        }),
      ),
      create: vi.fn().mockReturnValue(
        of({
          organizationId: 'org-created',
          status: 'pending_approval',
          ownerEmail: 'new@example.com',
          duplicate: false,
        }),
      ),
      update: vi.fn().mockReturnValue(
        of({
          id: 'org-1',
          name: 'Green Field Updated',
          status: 'approved',
          version: 3,
          timezone: 'Asia/Dubai',
        }),
      ),
      suspend: vi.fn().mockReturnValue(
        of({
          organizationId: 'org-1',
          status: 'suspended',
          version: 3,
        }),
      ),
      reactivate: vi.fn().mockReturnValue(
        of({
          organizationId: 'org-1',
          status: 'approved',
          version: 4,
        }),
      ),
      approve: vi.fn().mockReturnValue(
        of({
          organizationId: 'org-1',
          status: 'approved',
          ownerEmail: 'owner@greenfield.com',
          ownerDisplayName: 'Owner Name',
          activationToken: 'token-123',
          activationTokenExpiresAt: new Date().toISOString(),
          activationPath: '/activate?token=token-123',
          activationUrl: 'http://localhost:4200/activate?token=token-123',
        }),
      ),
      reject: vi.fn().mockReturnValue(of({})),
      reissueActivation: vi.fn().mockReturnValue(
        of({
          organizationId: 'org-1',
          status: 'approved',
          ownerEmail: 'owner@greenfield.com',
          ownerDisplayName: 'Owner Name',
          activationToken: 'token-456',
          activationTokenExpiresAt: new Date().toISOString(),
          activationPath: '/activate?token=token-456',
          activationUrl: 'http://localhost:4200/activate?token=token-456',
          reissued: true,
        }),
      ),
    };

    await TestBed.configureTestingModule({
      imports: [PlatformOrganizationsPage],
      providers: [provideRouter([]), { provide: PlatformOrganizationsApi, useValue: apiMock }],
    }).compileComponents();

    fixture = TestBed.createComponent(PlatformOrganizationsPage);
    page = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('loads real server KPIs and organizations on initialization', () => {
    expect(apiMock.list).toHaveBeenCalled();
    expect(apiMock.getSummaryKpis).toHaveBeenCalled();
    expect(page.items().length).toBe(1);
    expect(page.items()[0]?.name).toBe('Green Field Enterprises');
    expect(page.kpis()).toEqual({
      total: 10,
      active: 8,
      suspended: 1,
      trial: 1,
    });
  });

  it('filters organizations by status and plan sending server query', () => {
    page.onStatusFilterChange('approved');
    expect(page.statusFilter()).toBe('approved');
    expect(apiMock.list).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'approved', page: 1 }),
      false,
    );

    page.onPlanFilterChange('Business');
    expect(page.planFilter()).toBe('Business');
    expect(apiMock.list).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'approved', plan: 'Business', page: 1 }),
      false,
    );
  });

  it('opens create modal, submits valid payload and refreshes list', () => {
    page.openCreate();
    expect(page.createOpen()).toBe(true);

    page.createForm.setValue({
      organizationName: 'Fresh Harvest',
      ownerEmail: 'harvest@example.com',
      ownerDisplayName: 'Harvester',
      timezone: 'Asia/Karachi',
    });

    page.submitCreate();
    expect(apiMock.create).toHaveBeenCalledWith({
      organizationName: 'Fresh Harvest',
      ownerEmail: 'harvest@example.com',
      ownerDisplayName: 'Harvester',
      timezone: 'Asia/Karachi',
    });
    expect(page.createOpen()).toBe(false);
  });

  it('opens edit modal and handles 409 conflict gracefully', () => {
    page.openEdit(sampleOrg);
    expect(page.editOpen()).toBe(true);
    expect(page.editForm.getRawValue().name).toBe('Green Field Enterprises');

    // Simulate 409 Conflict
    apiMock.update.mockReturnValueOnce(
      throwError(() => new HttpErrorResponse({ status: 409, statusText: 'Conflict' })),
    );

    page.editForm.patchValue({
      name: 'Green Field Modified',
      reason: 'Administrative name fix',
    });

    page.submitEdit();
    expect(apiMock.update).toHaveBeenCalledWith('org-1', {
      expectedVersion: 2,
      name: 'Green Field Modified',
      timezone: 'Asia/Karachi',
      reason: 'Administrative name fix',
    });
    expect(page.conflictError()).toContain('Version conflict');
  });

  it('requires explicit confirmation and reason before suspending an organization', () => {
    page.openSuspend(sampleOrg);
    expect(page.suspendOpen()).toBe(true);

    page.suspendForm.patchValue({
      reason: 'Platform governance violation',
      confirmed: false,
    });

    // Form is invalid when confirmed is false
    expect(page.suspendForm.invalid).toBe(true);

    page.suspendForm.patchValue({ confirmed: true });
    expect(page.suspendForm.valid).toBe(true);

    page.submitSuspend();
    expect(apiMock.suspend).toHaveBeenCalledWith('org-1', {
      expectedVersion: 2,
      reason: 'Platform governance violation',
      confirmed: true,
    });
    expect(page.suspendOpen()).toBe(false);
    expect(page.successMessage()).toContain('suspended');
  });

  it('reactivates a suspended organization with reason', () => {
    const suspendedOrg = { ...sampleOrg, status: 'suspended', version: 3 };
    page.openReactivate(suspendedOrg);
    expect(page.reactivateOpen()).toBe(true);

    page.reactivateForm.patchValue({
      reason: 'Account reinstated following review',
    });

    page.submitReactivate();
    expect(apiMock.reactivate).toHaveBeenCalledWith('org-1', {
      expectedVersion: 3,
      reason: 'Account reinstated following review',
    });
    expect(page.reactivateOpen()).toBe(false);
    expect(page.successMessage()).toContain('reactivated');
  });

  it('approves a pending organization and receives one-time activation handoff', () => {
    const pendingOrg = { ...sampleOrg, status: 'pending_approval' };
    page.askApprove(pendingOrg);
    expect(apiMock.approve).toHaveBeenCalledWith('org-1');
    expect(page.activationHandoff()?.activationUrl).toContain('/activate?token=token-123');
  });

  it('reissues activation link for approved organization with unconsumed token', () => {
    const unactivatedOrg = { ...sampleOrg, ownerNeedsActivation: true };
    page.askReissue(unactivatedOrg);
    expect(apiMock.reissueActivation).toHaveBeenCalledWith('org-1');
    expect(page.activationHandoff()?.reissued).toBe(true);
  });
});
