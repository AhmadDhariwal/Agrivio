import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { ActivatePage } from './activate.page';
import { environment } from '../../../environments/environment';

describe('ActivatePage', () => {
  let fixture: ComponentFixture<ActivatePage>;
  let http: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ActivatePage],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([{ path: 'context', children: [] }]),
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ActivatePage);
    http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
  });

  it('activates an owner account with CSRF and applies session', () => {
    const page = fixture.componentInstance;
    page.form.setValue({
      token: 'activation-token',
      password: 'a-strong-passphrase',
      confirmPassword: 'a-strong-passphrase',
    });
    page.submit();

    const csrf = http.expectOne(`${environment.publicApiBaseUrl}/api/v1/auth/csrf`);
    csrf.flush({ data: { csrfToken: 'csrf-test' }, requestId: 'test' });

    const req = http.expectOne(`${environment.publicApiBaseUrl}/api/v1/auth/activate`);
    expect(req.request.method).toBe('POST');
    expect(req.request.headers.get('X-CSRF-Token')).toBe('csrf-test');
    req.flush({
      data: {
        status: 'active',
        session: {
          user: {
            id: 'u1',
            email: 'owner@example.com',
            displayName: 'Owner',
            status: 'active',
          },
          activeContext: {
            contextType: 'organization',
            organizationId: 'org-1',
            role: 'Owner',
            permissions: ['organization.view'],
          },
          availableContexts: [],
          branchAssignments: [],
          warehouseAssignments: [],
          subscriptionAccessState: null,
        },
      },
      requestId: 'test',
    });
    expect(page.successMessage()).toContain('activated');
  });
});
