import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { ContextSwitcherPage } from './context-switcher.page';
import { AuthSessionStore } from '../../data-access/auth-session.store';
import { environment } from '../../../../../environments/environment';

describe('ContextSwitcherPage', () => {
  let fixture: ComponentFixture<ContextSwitcherPage>;
  let http: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ContextSwitcherPage],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([{ path: 'app', children: [] }]),
      ],
    }).compileComponents();

    const store = TestBed.inject(AuthSessionStore);
    store.applySession({
      user: {
        id: 'u1',
        email: 'owner@example.com',
        displayName: 'Owner',
        status: 'active',
      },
      activeContext: {
        contextType: 'organization',
        organizationId: 'org-1',
        membershipId: 'mem-1',
        role: 'Owner',
        permissions: ['organization.view'],
      },
      availableContexts: [
        {
          contextType: 'organization',
          organizationId: 'org-1',
          membershipId: 'mem-1',
          role: 'Owner',
          permissions: ['organization.view'],
        },
        {
          contextType: 'platform',
          role: 'Super Admin',
          permissions: ['platform.organizations.view'],
        },
      ],
      branchAssignments: [],
      warehouseAssignments: [],
      subscriptionAccessState: null,
    });

    fixture = TestBed.createComponent(ContextSwitcherPage);
    http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
  });

  it('posts an authorized context switch and updates the active context', () => {
    const page = fixture.componentInstance;
    page.form.setValue({
      contextKey: 'platform',
      branchId: '',
      warehouseId: '',
    });
    page.submit();

    const csrf = http.expectOne(`${environment.publicApiBaseUrl}/api/v1/auth/csrf`);
    csrf.flush({ data: { csrfToken: 'csrf-test' }, requestId: 'test' });

    const switchCall = http.expectOne(
      `${environment.publicApiBaseUrl}/api/v1/auth/session/context`,
    );
    expect(switchCall.request.body).toEqual({ contextType: 'platform' });
    switchCall.flush({
      data: {
        csrfToken: 'csrf-next',
        session: {
          user: {
            id: 'u1',
            email: 'owner@example.com',
            displayName: 'Owner',
            status: 'active',
          },
          activeContext: {
            contextType: 'platform',
            role: 'Super Admin',
            permissions: ['platform.organizations.view'],
          },
          availableContexts: [],
          branchAssignments: [],
          warehouseAssignments: [],
          subscriptionAccessState: null,
        },
      },
      requestId: 'test',
    });

    expect(page.activeContext()?.contextType).toBe('platform');
    expect(page.successMessage()).toContain('Active context updated');
  });

  it('does not offer an authenticated path back to sign in', () => {
    expect(fixture.nativeElement.textContent).not.toContain('Back to sign in');
    expect(fixture.nativeElement.querySelector('a[href="/signin"]')).toBeNull();
  });
});
