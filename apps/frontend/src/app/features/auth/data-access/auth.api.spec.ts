import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { environment } from '../../../../environments/environment';
import { authErrorInterceptor } from '../../../core/interceptors/auth-error.interceptor';
import { AuthApi } from './auth.api';

describe('AuthApi CSRF token lifecycle', () => {
  const auth = `${environment.publicApiBaseUrl}/api/v1/auth`;
  const mutation = `${environment.publicApiBaseUrl}/api/v1/example`;
  let api: AuthApi;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(withInterceptors([authErrorInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    api = TestBed.inject(AuthApi);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  function issue(token: string) {
    const request = http.expectOne({ method: 'POST', url: `${auth}/csrf` });
    expect(request.request.withCredentials).toBe(true);
    request.flush({ data: { csrfToken: token } });
  }

  function expectCached(token: string) {
    const result = vi.fn();
    api.ensureCsrf().subscribe(result);
    expect(result).toHaveBeenCalledWith({ csrfToken: token });
    http.expectNone(`${auth}/csrf`);
  }

  it('shares one issuance across concurrent mutations and reuses the token on later writes', () => {
    api.postWithCsrf(mutation, { id: 1 }).subscribe();
    api.postWithCsrf(mutation, { id: 2 }).subscribe();
    issue('shared');

    const requests = http.match({ method: 'POST', url: mutation });
    expect(requests).toHaveLength(2);
    for (const request of requests) {
      expect(request.request.headers.get('X-CSRF-Token')).toBe('shared');
      expect(request.request.withCredentials).toBe(true);
      request.flush({});
    }

    api.postWithCsrf(mutation, { id: 3 }).subscribe();
    const later = http.expectOne(mutation);
    expect(later.request.headers.get('X-CSRF-Token')).toBe('shared');
    later.flush({});
    http.expectNone(`${auth}/csrf`);
  });

  it('uses rotated tokens across login and context switch, then clears after logout', () => {
    api.login('owner@example.com', 'password').subscribe();
    issue('anonymous');
    const login = http.expectOne(`${auth}/login`);
    expect(login.request.headers.get('X-CSRF-Token')).toBe('anonymous');
    login.flush({ data: { csrfToken: 'signed-in', session: {} } });

    api.switchContext({ contextType: 'platform' }).subscribe();
    const context = http.expectOne(`${auth}/session/context`);
    expect(context.request.headers.get('X-CSRF-Token')).toBe('signed-in');
    context.flush({ data: { csrfToken: 'platform', session: {} } });

    api.logout().subscribe();
    const logout = http.expectOne(`${auth}/logout`);
    expect(logout.request.headers.get('X-CSRF-Token')).toBe('platform');
    logout.flush({ data: { status: 'logged_out' } });
    api.ensureCsrf().subscribe();
    issue('new-anonymous');
  });

  it('uses the token returned by activation and password reset', () => {
    api.activate('activation', 'password').subscribe();
    issue('anonymous');
    const activate = http.expectOne(`${auth}/activate`);
    expect(activate.request.headers.get('X-CSRF-Token')).toBe('anonymous');
    activate.flush({ data: { csrfToken: 'activated', session: {} } });

    api.confirmPasswordReset('reset', 'password').subscribe();
    const reset = http.expectOne(`${auth}/password-reset/confirm`);
    expect(reset.request.headers.get('X-CSRF-Token')).toBe('activated');
    reset.flush({ data: { csrfToken: 'after-reset', status: 'password_reset' } });
    expectCached('after-reset');
  });

  it('clears on a current session 401 but ignores a session 401 from before login', () => {
    const onError = vi.fn();
    api.getSession().subscribe({ error: onError });
    const stale = http.expectOne(`${auth}/session`);
    api.login('owner@example.com', 'password').subscribe();
    issue('anonymous');
    http.expectOne(`${auth}/login`).flush({ data: { csrfToken: 'signed-in', session: {} } });
    const unauthorized = { status: 401, statusText: 'Unauthorized' };
    stale.flush({ error: { code: 'UNAUTHORIZED' } }, unauthorized);
    expectCached('signed-in');

    api.getSession().subscribe({ error: onError });
    http.expectOne(`${auth}/session`).flush({ error: { code: 'UNAUTHORIZED' } }, unauthorized);
    expect(onError).toHaveBeenCalledTimes(2);
    api.ensureCsrf().subscribe();
    issue('renewed');
  });

  it('reuses the login token after bad credentials but clears it after expiry', () => {
    const onError = vi.fn();
    const unauthorized = { status: 401, statusText: 'Unauthorized' };
    api.login('owner@example.com', 'incorrect').subscribe({ error: onError });
    issue('anonymous');
    http
      .expectOne(`${auth}/login`)
      .flush(
        { error: { code: 'UNAUTHORIZED', message: 'Invalid email or password' } },
        unauthorized,
      );
    expectCached('anonymous');

    api.login('owner@example.com', 'password').subscribe({ error: onError });
    http
      .expectOne(`${auth}/login`)
      .flush({ error: { code: 'UNAUTHORIZED', message: 'Session has expired' } }, unauthorized);
    expect(onError).toHaveBeenCalledTimes(2);
    api.ensureCsrf().subscribe();
    issue('renewed');
  });

  it('clears a rejected token without replaying a mutation or invalidating a newer token', () => {
    const onError = vi.fn();
    const denied = { status: 403, statusText: 'Forbidden' };
    const rejected = { error: { code: 'FORBIDDEN', message: 'CSRF validation failed' } };
    api.postWithCsrf(mutation, { id: 1 }).subscribe({ error: onError });
    issue('old');
    const first = http.expectOne(mutation);
    api.postWithCsrf(mutation, { id: 2 }).subscribe({ error: onError });
    const late = http.expectOne(mutation);
    first.flush(rejected, denied);
    http.expectNone(mutation);
    http.expectNone(`${auth}/csrf`);
    api.ensureCsrf().subscribe();
    issue('new');
    late.flush(rejected, denied);
    expectCached('new');
    expect(onError).toHaveBeenCalledTimes(2);

    api.postWithCsrf(mutation, {}).subscribe({ error: onError });
    http.expectOne(mutation).flush({ error: { code: 'PERMISSION_DENIED' } }, denied);
    expectCached('new');
  });

  it('cancels obsolete issuance at a session change before requesting a new token', () => {
    const next = vi.fn();
    const error = vi.fn();
    api.ensureCsrf().subscribe({ next, error });
    const stale = http.expectOne(`${auth}/csrf`);
    api.clearSecurityState();
    expect(stale.cancelled).toBe(true);
    api.ensureCsrf().subscribe();
    issue('current');
    expect(next).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledOnce();
    expectCached('current');
  });

  it('does not overwrite a newer context token with an older transition response', () => {
    api.ensureCsrf().subscribe();
    issue('current');
    api.switchContext({ contextType: 'organization', organizationId: 'first' }).subscribe();
    const stale = http.expectOne(`${auth}/session/context`);
    api.switchContext({ contextType: 'organization', organizationId: 'second' }).subscribe();
    http.expectOne(`${auth}/session/context`).flush({ data: { csrfToken: 'second', session: {} } });
    stale.flush({ data: { csrfToken: 'first', session: {} } });
    expectCached('second');
  });

  it('releases failed issuance so the same observable can be retried', () => {
    const token = api.ensureCsrf();
    const onError = vi.fn();
    token.subscribe({ error: onError });
    token.subscribe({ error: onError });
    http.expectOne(`${auth}/csrf`).flush(null, { status: 502, statusText: 'Bad Gateway' });
    expect(onError).toHaveBeenCalledTimes(2);
    const result = vi.fn();
    token.subscribe(result);
    issue('retry');
    expect(result).toHaveBeenCalledWith({ csrfToken: 'retry' });
  });
});
