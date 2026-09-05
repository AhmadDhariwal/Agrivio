import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ActivatedRoute } from '@angular/router';
import { of, throwError } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';
import { PlatformOrganizationDetailPage } from './organization-detail.page';
import { PlatformOrganizationsApi } from '../../data-access/platform-organizations.api';
import { SubscriptionApi } from '../../../subscriptions/data-access/subscription.api';
import { PlatformOrganizationDetail } from '../../models/platform-organization.models';

describe('PlatformOrganizationDetailPage', () => {
  let fixture: ComponentFixture<PlatformOrganizationDetailPage>;
  let page: PlatformOrganizationDetailPage;
  let apiMock: {
    getById: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    suspend: ReturnType<typeof vi.fn>;
    reactivate: ReturnType<typeof vi.fn>;
    changeSubscriptionPlan: ReturnType<typeof vi.fn>;
  };
  let subscriptionApiMock: {
    listPlatformPlans: ReturnType<typeof vi.fn>;
  };

  const sampleDetail: PlatformOrganizationDetail = {
    id: 'org-456',
    name: 'Sunrise Agro Ventures',
    status: 'approved',
    version: 4,
    timezone: 'Asia/Karachi',
    createdAt: '2026-08-01T10:00:00Z',
    updatedAt: '2026-08-15T12:00:00Z',
    owner: {
      id: 'usr-1',
      email: 'owner@sunrise.com',
      displayName: 'Sunrise Owner',
      status: 'active',
      hasPassword: true,
    },
    subscription: {
      id: 'sub-789',
      status: 'active',
      planCode: 'Business',
      planVersion: 2,
      periodStartsAt: '2026-08-01T00:00:00Z',
      periodEndsAt: '2026-09-01T00:00:00Z',
      version: 5,
    },
    identity: {
      name: 'Sunrise Agro Ventures',
      timezone: 'Asia/Karachi',
      settings: {
        tradingName: 'Sunrise Agri',
        contactEmail: 'contact@sunrise.com',
        contactPhone: '+923001234567',
        addressLine: 'Farm Road, Multan',
      },
    },
    usage: {
      planCode: 'Business',
      planVersion: 2,
      resources: {
        branches: { current: 4, limit: 5 }, // 80% -> near-limit
        warehouses: { current: 3, limit: 3 }, // 100% -> limit-reached
        activeUsers: { current: 10, limit: 25 }, // 40% -> normal
      },
    },
    members: {
      total: 2,
      items: [
        {
          id: 'mem-1',
          userId: 'usr-1',
          email: 'owner@sunrise.com',
          displayName: 'Sunrise Owner',
          role: 'Owner',
          status: 'active',
          branchAssignments: [{ targetId: 'b-1' }],
          warehouseAssignments: [{ targetId: 'w-1' }],
        },
        {
          id: 'mem-2',
          userId: 'usr-2',
          email: 'manager@sunrise.com',
          displayName: 'Branch Manager',
          role: 'Admin',
          status: 'active',
          branchAssignments: [{ targetId: 'b-1' }],
        },
      ],
    },
    branches: {
      total: 2,
      items: [
        { id: 'b-1', name: 'Main Branch', isDefault: true },
        { id: 'b-2', name: 'South Branch' },
      ],
    },
    warehouses: {
      total: 1,
      items: [{ id: 'w-1', name: 'Central Grain Store', isDefault: true }],
    },
    audit: {
      total: 1,
      recent: [
        {
          id: 'aud-1',
          timestamp: '2026-08-15T12:00:00Z',
          actorId: 'admin@platform.gov',
          action: 'organization.updated',
          resourceType: 'organization',
          resourceId: 'org-456',
          reason: 'Profile details updated',
        },
      ],
    },
    operationalWarnings: [],
  };

  beforeEach(async () => {
    apiMock = {
      getById: vi.fn().mockReturnValue(of(sampleDetail)),
      update: vi.fn().mockReturnValue(
        of({ ...sampleDetail, name: 'Sunrise Agro Global', version: 5 }),
      ),
      suspend: vi.fn().mockReturnValue(
        of({ organizationId: 'org-456', status: 'suspended', version: 5 }),
      ),
      reactivate: vi.fn().mockReturnValue(
        of({ organizationId: 'org-456', status: 'approved', version: 6 }),
      ),
      changeSubscriptionPlan: vi.fn().mockReturnValue(of({})),
    };

    subscriptionApiMock = {
      listPlatformPlans: vi.fn().mockReturnValue(
        of([
          { id: 'p-1', planCode: 'Starter', planVersion: 1, status: 'active' },
          { id: 'p-2', planCode: 'Business', planVersion: 2, status: 'active' },
          { id: 'p-3', planCode: 'Enterprise', planVersion: 1, status: 'active' },
        ]),
      ),
    };

    await TestBed.configureTestingModule({
      imports: [PlatformOrganizationDetailPage],
      providers: [
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: { get: () => 'org-456' } } } },
        { provide: PlatformOrganizationsApi, useValue: apiMock },
        { provide: SubscriptionApi, useValue: subscriptionApiMock },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(PlatformOrganizationDetailPage);
    page = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('loads authoritative organization detail and renders all primary sections', () => {
    expect(apiMock.getById).toHaveBeenCalledWith('org-456', true);
    expect(page.detail()?.name).toBe('Sunrise Agro Ventures');
    expect(page.detail()?.status).toBe('approved');
    expect(page.detail()?.usage?.planCode).toBe('Business');
    expect(page.detail()?.members?.total).toBe(2);
    expect(page.detail()?.branches?.total).toBe(2);
    expect(page.detail()?.warehouses?.total).toBe(1);
    expect(page.detail()?.audit?.total).toBe(1);
  });

  it('evaluates usage presentation states accurately', () => {
    const u = sampleDetail.usage?.resources;
    expect(page.getUsageState(u?.branches)).toBe('near-limit');
    expect(page.getUsageState(u?.warehouses)).toBe('limit-reached');
    expect(page.getUsageState(u?.activeUsers)).toBe('normal');
  });

  it('executes organization profile edit with version concurrency and 409 conflict handling', () => {
    page.openEdit();
    expect(page.editOpen()).toBe(true);
    expect(page.editForm.getRawValue().name).toBe('Sunrise Agro Ventures');

    page.editForm.patchValue({
      name: 'Sunrise Agro Global',
      reason: 'Rebranding verified',
    });

    page.submitEdit();
    expect(apiMock.update).toHaveBeenCalledWith('org-456', {
      expectedVersion: 4,
      name: 'Sunrise Agro Global',
      timezone: 'Asia/Karachi',
      reason: 'Rebranding verified',
    });
    expect(page.editOpen()).toBe(false);

    // Test 409 conflict
    apiMock.update.mockReturnValueOnce(
      throwError(() => new HttpErrorResponse({ status: 409, statusText: 'Conflict' })),
    );
    page.openEdit();
    page.editForm.patchValue({
      name: 'Sunrise Agro Global V2',
      reason: 'Second update attempt',
    });
    page.submitEdit();
    expect(page.conflictError()).toContain('Version conflict');
  });

  it('suspends organization with reason and explicit confirmation', () => {
    page.openSuspend();
    expect(page.suspendOpen()).toBe(true);

    page.suspendForm.patchValue({
      reason: 'Policy violation',
      confirmed: true,
    });

    page.submitSuspend();
    expect(apiMock.suspend).toHaveBeenCalledWith('org-456', {
      expectedVersion: 4,
      reason: 'Policy violation',
      confirmed: true,
    });
    expect(page.suspendOpen()).toBe(false);
    expect(page.successMessage()).toContain('suspended');
  });

  it('reactivates suspended organization with reason', () => {
    page.openReactivate();
    expect(page.reactivateOpen()).toBe(true);

    page.reactivateForm.patchValue({
      reason: 'Reinstated by platform director',
    });

    page.submitReactivate();
    expect(apiMock.reactivate).toHaveBeenCalledWith('org-456', {
      expectedVersion: 4,
      reason: 'Reinstated by platform director',
    });
    expect(page.reactivateOpen()).toBe(false);
    expect(page.successMessage()).toContain('reactivated');
  });

  it('changes subscription plan calling authoritative workflow', () => {
    page.openChangePlan();
    expect(page.changePlanOpen()).toBe(true);
    expect(subscriptionApiMock.listPlatformPlans).toHaveBeenCalled();

    page.changePlanForm.patchValue({
      planSelection: 'Enterprise:1',
      reason: 'Upgraded for additional capacity',
      effective: 'immediate',
    });

    page.submitChangePlan();
    expect(apiMock.changeSubscriptionPlan).toHaveBeenCalledWith(
      'sub-789',
      {
        expectedVersion: 5,
        planCode: 'Enterprise',
        planVersion: 1,
        reason: 'Upgraded for additional capacity',
        effective: 'immediate',
      },
      'org-456',
    );
    expect(page.changePlanOpen()).toBe(false);
  });

  it('displays access denied when receiving 403', () => {
    apiMock.getById.mockReturnValueOnce(
      throwError(() => new HttpErrorResponse({ status: 403, statusText: 'Forbidden' })),
    );

    page.loadDetail(true);
    expect(page.accessDenied()).toBe(true);
  });

  it('displays not found when receiving 404', () => {
    apiMock.getById.mockReturnValueOnce(
      throwError(() => new HttpErrorResponse({ status: 404, statusText: 'Not Found' })),
    );

    page.loadDetail(true);
    expect(page.notFound()).toBe(true);
  });
});
