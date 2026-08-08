import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { PasswordResetRequestPage } from './password-reset-request.page';
import { environment } from '../../../environments/environment';

describe('PasswordResetRequestPage', () => {
  let fixture: ComponentFixture<PasswordResetRequestPage>;
  let http: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PasswordResetRequestPage],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(PasswordResetRequestPage);
    http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
  });

  it('posts a password reset request', () => {
    const page = fixture.componentInstance;
    page.form.setValue({ email: 'owner@example.com' });
    page.submit();

    const req = http.expectOne(
      `${environment.publicApiBaseUrl}/api/v1/auth/password-reset/request`,
    );
    expect(req.request.method).toBe('POST');
    req.flush({ data: { accepted: true }, requestId: 'test' });
    expect(page.successMessage()).toContain('If an account exists');
  });
});
