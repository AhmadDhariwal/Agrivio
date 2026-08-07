import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { RequestAccessPage } from './request-access.page';
import { environment } from '../../../environments/environment';

describe('RequestAccessPage', () => {
  let fixture: ComponentFixture<RequestAccessPage>;
  let http: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RequestAccessPage],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(RequestAccessPage);
    http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
  });

  it('submits a normalized organization activation request', () => {
    const page = fixture.componentInstance;
    page.form.setValue({
      organizationName: 'Green Fields',
      ownerEmail: 'owner@example.com',
      ownerDisplayName: 'Owner',
      timezone: 'Asia/Karachi',
    });
    page.submit();

    const req = http.expectOne(
      `${environment.publicApiBaseUrl}/api/v1/organization-activation-requests`,
    );
    expect(req.request.method).toBe('POST');
    req.flush({ data: { status: 'pending_approval' }, requestId: 'test' });
    expect(page.successMessage()).toContain('Super Admin');
  });
});
