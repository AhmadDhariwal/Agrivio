import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { PasswordResetConfirmPage } from './password-reset-confirm.page';
import { environment } from '../../../environments/environment';

describe('PasswordResetConfirmPage', () => {
  let fixture: ComponentFixture<PasswordResetConfirmPage>;
  let http: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PasswordResetConfirmPage],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(PasswordResetConfirmPage);
    http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
  });

  it('confirms password reset with CSRF', () => {
    const page = fixture.componentInstance;
    page.form.setValue({
      token: 'reset-token',
      password: 'a-strong-passphrase',
    });
    page.submit();

    const csrf = http.expectOne(`${environment.publicApiBaseUrl}/api/v1/auth/csrf`);
    csrf.flush({ data: { csrfToken: 'csrf-test' }, requestId: 'test' });

    const confirm = http.expectOne(
      `${environment.publicApiBaseUrl}/api/v1/auth/password-reset/confirm`,
    );
    expect(confirm.request.headers.get('X-CSRF-Token')).toBe('csrf-test');
    confirm.flush({ data: { status: 'password_reset' }, requestId: 'test' });
    expect(page.successMessage()).toContain('Password updated');
  });
});
