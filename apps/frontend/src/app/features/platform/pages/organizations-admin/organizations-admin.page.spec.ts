import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { PlatformOrganizationsPage } from './organizations-admin.page';
import { PlatformOrganizationsApi } from '../../data-access/platform-organizations.api';

describe('PlatformOrganizationsPage', () => {
  let fixture: ComponentFixture<PlatformOrganizationsPage>;
  let approveCalls: string[];
  let reissueCalls: string[];
  let createCalls: Array<Record<string, string>>;

  beforeEach(async () => {
    approveCalls = [];
    reissueCalls = [];
    createCalls = [];
    const api = {
      create: (input: Record<string, string>) => {
        createCalls.push(input);
        return of({
          organizationId: 'org-created',
          status: 'pending_approval',
          ownerEmail: String(input['ownerEmail'] ?? ''),
          duplicate: false,
        });
      },
      list: () =>
        of({
          items: [
            {
              id: 'org-approved',
              name: 'Approved Co',
              status: 'approved',
              ownerEmail: 'pending@example.com',
              ownerNeedsActivation: true,
            },
          ],
          meta: { page: 1, pageSize: 25, total: 1 },
        }),
      approve: (organizationId: string) => {
        approveCalls.push(organizationId);
        return of({
          organizationId,
          status: 'approved',
          ownerEmail: 'owner@example.com',
          ownerDisplayName: 'Owner',
          activationToken: 'token-1',
          activationTokenExpiresAt: new Date().toISOString(),
          activationPath: '/activate?token=token-1',
          activationUrl: 'http://localhost:4200/activate?token=token-1',
        });
      },
      reissueActivation: (organizationId: string) => {
        reissueCalls.push(organizationId);
        return of({
          organizationId,
          status: 'approved',
          ownerEmail: 'pending@example.com',
          ownerDisplayName: 'Pending Owner',
          activationToken: 'token-2',
          activationTokenExpiresAt: new Date().toISOString(),
          activationPath: '/activate?token=token-2',
          activationUrl: 'http://localhost:4200/activate?token=token-2',
          reissued: true,
        });
      },
      reject: () => of({}),
    };

    await TestBed.configureTestingModule({
      imports: [PlatformOrganizationsPage],
      providers: [provideRouter([]), { provide: PlatformOrganizationsApi, useValue: api }],
    }).compileComponents();

    fixture = TestBed.createComponent(PlatformOrganizationsPage);
    fixture.detectChanges();
  });

  it('creates a pending organization from the platform form', () => {
    const page = fixture.componentInstance;
    page.createForm.setValue({
      organizationName: 'Direct Co',
      ownerEmail: 'direct@example.com',
      ownerDisplayName: 'Direct Owner',
      timezone: 'Asia/Karachi',
    });
    page.createOrganization();
    expect(createCalls).toEqual([
      {
        organizationName: 'Direct Co',
        ownerEmail: 'direct@example.com',
        ownerDisplayName: 'Direct Owner',
        timezone: 'Asia/Karachi',
      },
    ]);
  });

  it('requires confirmation before approving an organization and shows handoff fields', () => {
    const page = fixture.componentInstance;
    page.askApprove({
      id: 'org-1',
      name: 'Green Farms',
      status: 'pending_approval',
      ownerEmail: 'owner@example.com',
    });
    expect(page.confirmOpen()).toBe(true);
    expect(approveCalls).toEqual([]);
    page.runConfirmedAction();
    expect(approveCalls).toEqual(['org-1']);
    fixture.detectChanges();
    expect(page.activationHandoff()?.activationUrl).toContain('/activate?token=');
    expect(page.activationHandoff()?.ownerEmail).toBe('owner@example.com');
  });

  it('can reissue activation for an approved owner that still needs activation', () => {
    const page = fixture.componentInstance;
    page.askReissue({
      id: 'org-approved',
      name: 'Approved Co',
      status: 'approved',
      ownerEmail: 'pending@example.com',
      ownerNeedsActivation: true,
    });
    page.runConfirmedAction();
    expect(reissueCalls).toEqual(['org-approved']);
    expect(page.activationHandoff()?.reissued).toBe(true);
  });
});
