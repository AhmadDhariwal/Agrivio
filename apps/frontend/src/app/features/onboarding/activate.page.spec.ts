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
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(ActivatePage);
    http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
  });

  it('posts activation token and password', () => {
    const page = fixture.componentInstance;
    page.form.setValue({
      token: 'activation-token',
      password: 'a-strong-passphrase',
    });
    page.submit();

    const req = http.expectOne(`${environment.publicApiBaseUrl}/api/v1/auth/activate`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({
      token: 'activation-token',
      password: 'a-strong-passphrase',
    });
    req.flush({ data: { status: 'active' }, requestId: 'test' });
    expect(page.successMessage()).toContain('activated');
  });
});
