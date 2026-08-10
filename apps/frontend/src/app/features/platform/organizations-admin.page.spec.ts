import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { PlatformOrganizationsPage } from './organizations-admin.page';
import { PlatformOrganizationsApi } from './platform-organizations.api';

describe('PlatformOrganizationsPage', () => {
  let fixture: ComponentFixture<PlatformOrganizationsPage>;
  let approveCalls: string[];

  beforeEach(async () => {
    approveCalls = [];
    const api = {
      list: () => of([]),
      approve: (organizationId: string) => {
        approveCalls.push(organizationId);
        return of({
          organizationId,
          status: 'approved',
          activationToken: 'token-1',
          activationTokenExpiresAt: new Date().toISOString(),
        });
      },
      reject: () => of({}),
    };

    await TestBed.configureTestingModule({
      imports: [PlatformOrganizationsPage],
      providers: [{ provide: PlatformOrganizationsApi, useValue: api }],
    }).compileComponents();

    fixture = TestBed.createComponent(PlatformOrganizationsPage);
    fixture.detectChanges();
  });

  it('requires confirmation before approving an organization', () => {
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
  });
});
