import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import {
  ActivatedRoute,
  convertToParamMap,
  DefaultUrlSerializer,
  ParamMap,
  provideRouter,
} from '@angular/router';
import { ActivatePage } from './activate.page';
import { environment } from '../../../../../environments/environment';

describe('ActivatePage', () => {
  let fixture: ComponentFixture<ActivatePage>;
  let http: HttpTestingController;
  let queryParamMap: ParamMap;

  beforeEach(async () => {
    queryParamMap = convertToParamMap({});
    await TestBed.configureTestingModule({
      imports: [ActivatePage],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([{ path: 'context', children: [] }]),
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              get queryParamMap(): ParamMap {
                return queryParamMap;
              },
            },
          },
        },
      ],
    }).compileComponents();

    http = TestBed.inject(HttpTestingController);
  });

  function createFixture(): ActivatePage {
    fixture = TestBed.createComponent(ActivatePage);
    fixture.detectChanges();
    return fixture.componentInstance;
  }

  it('activates an owner account with CSRF and applies session', () => {
    const page = createFixture();
    page.form.setValue({
      token: 'activation-token',
      password: 'a-strong-passphrase',
      confirmPassword: 'a-strong-passphrase',
    });
    page.submit();

    const csrf = http.expectOne(`${environment.publicApiBaseUrl}/api/v1/auth/csrf`);
    expect(csrf.request.method).toBe('POST');
    expect(csrf.request.withCredentials).toBe(true);
    csrf.flush({ data: { csrfToken: 'csrf-test' }, requestId: 'test' });

    const req = http.expectOne(`${environment.publicApiBaseUrl}/api/v1/auth/activate`);
    expect(req.request.method).toBe('POST');
    expect(req.request.withCredentials).toBe(true);
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

  it('preserves an encoded opaque activation token through Angular parsing and the request payload', () => {
    const activationToken = 'opaque+token/with=reserved_%2B-and_base64url-_';
    const activationPath = `/activate?token=${encodeURIComponent(activationToken)}`;
    queryParamMap = new DefaultUrlSerializer().parse(activationPath).queryParamMap;

    const page = createFixture();
    expect(page.form.controls.token.value).toBe(activationToken);
    page.form.patchValue({
      password: 'a-strong-passphrase',
      confirmPassword: 'a-strong-passphrase',
    });
    page.submit();

    const csrf = http.expectOne(`${environment.publicApiBaseUrl}/api/v1/auth/csrf`);
    csrf.flush({ data: { csrfToken: 'csrf-test' }, requestId: 'test' });

    const activation = http.expectOne(`${environment.publicApiBaseUrl}/api/v1/auth/activate`);
    expect(activation.request.body).toEqual({
      token: activationToken,
      password: 'a-strong-passphrase',
    });
    activation.flush({
      data: {
        status: 'active',
      },
      requestId: 'test',
    });
  });
});
