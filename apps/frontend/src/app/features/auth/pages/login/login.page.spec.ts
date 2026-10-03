import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { LoginPage } from './login.page';
import { environment } from '../../../../../environments/environment';

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

  it('marks required fields with visible asterisks and aria-required', () => {
    const requiredMarkers = fixture.nativeElement.querySelectorAll('.ag-field__required');
    expect(requiredMarkers.length).toBe(2);
    const emailInput = fixture.nativeElement.querySelector('#login-email') as HTMLInputElement;
    const passwordInput = fixture.nativeElement.querySelector('#login-password') as HTMLInputElement;
    expect(emailInput.getAttribute('aria-required')).toBe('true');
    expect(passwordInput.getAttribute('aria-required')).toBe('true');
    expect(fixture.nativeElement.querySelector('.ag-form--with-required-hint')).toBeTruthy();
  });

  it('requests CSRF then posts login credentials', () => {
    const page = fixture.componentInstance;
    page.form.setValue({
      email: 'owner@example.com',
      password: 'a-strong-passphrase',
    });
    page.submit();

    expect(page.form.getRawValue()).toEqual({
      email: 'owner@example.com',
      password: 'a-strong-passphrase',
    });
    expect(page.form.disabled).toBe(true);
    expect(page.submitting()).toBe(true);
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
    expect(page.form.getRawValue().password).toBe('a-strong-passphrase');
    expect(page.form.disabled).toBe(true);
    http.expectNone(`${environment.publicApiBaseUrl}/api/v1/auth/session`);
  });

  it('keeps values stable while pending and re-enables the form after login failure', () => {
    const page = fixture.componentInstance;
    page.form.setValue({
      email: 'owner@example.com',
      password: 'a-strong-passphrase',
    });

    page.submit();
    http.expectOne(`${environment.publicApiBaseUrl}/api/v1/auth/csrf`).flush({
      data: { csrfToken: 'csrf-test' },
      requestId: 'test',
    });

    expect(page.form.disabled).toBe(true);
    expect(page.form.getRawValue().password).toBe('a-strong-passphrase');
    http.expectOne(`${environment.publicApiBaseUrl}/api/v1/auth/login`).flush(
      { error: { code: 'UNAUTHORIZED', message: 'Authentication failed' } },
      { status: 401, statusText: 'Unauthorized' },
    );

    expect(page.submitting()).toBe(false);
    expect(page.form.enabled).toBe(true);
    expect(page.form.getRawValue()).toEqual({
      email: 'owner@example.com',
      password: 'a-strong-passphrase',
    });
    expect(page.errorMessage()).toBe('Sign-in failed. Check your email and password.');
  });
});
