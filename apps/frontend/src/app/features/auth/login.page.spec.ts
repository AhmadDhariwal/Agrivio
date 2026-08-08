import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { LoginPage } from './login.page';
import { environment } from '../../../environments/environment';

describe('LoginPage', () => {
  let fixture: ComponentFixture<LoginPage>;
  let http: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LoginPage],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([{ path: 'context', children: [] }]),
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(LoginPage);
    http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
  });

  it('requests CSRF then posts login credentials', () => {
    const page = fixture.componentInstance;
    page.form.setValue({
      email: 'owner@example.com',
      password: 'a-strong-passphrase',
    });
    page.submit();

    const csrf = http.expectOne(`${environment.publicApiBaseUrl}/api/v1/auth/csrf`);
    expect(csrf.request.method).toBe('POST');
    csrf.flush({ data: { csrfToken: 'csrf-test' }, requestId: 'test' });

    const login = http.expectOne(`${environment.publicApiBaseUrl}/api/v1/auth/login`);
    expect(login.request.method).toBe('POST');
    expect(login.request.headers.get('X-CSRF-Token')).toBe('csrf-test');
    login.flush({
      data: {
        csrfToken: 'csrf-next',
        session: {
          user: { id: 'u1', email: 'owner@example.com', displayName: 'Owner', status: 'active' },
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
    expect(page.successMessage()).toContain('Signed in');
  });
});
