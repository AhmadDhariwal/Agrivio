import { TestBed } from '@angular/core/testing';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Router } from '@angular/router';
import { authErrorInterceptor } from './auth-error.interceptor';
import { AuthSessionStore } from '../../features/auth/data-access/auth-session.store';

describe('authErrorInterceptor', () => {
  let httpClient: HttpClient;
  let httpTestingController: HttpTestingController;
  let sessionStore: AuthSessionStore;
  let router: Router;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authErrorInterceptor])),
        provideHttpClientTesting(),
        {
          provide: Router,
          useValue: {
            url: '/dashboard',
            navigate: vi.fn().mockResolvedValue(true),
          },
        },
      ],
    });

    httpClient = TestBed.inject(HttpClient);
    httpTestingController = TestBed.inject(HttpTestingController);
    sessionStore = TestBed.inject(AuthSessionStore);
    router = TestBed.inject(Router);
  });

  afterEach(() => {
    httpTestingController.verify();
  });

  it('redirects to /login and clears session when a 401 response occurs on protected endpoints', () => {
    const clearSpy = vi.spyOn(sessionStore, 'clear');

    let errored = false;
    httpClient.get('/api/v1/customers').subscribe({
      next: () => undefined,
      error: (err) => {
        errored = true;
        expect(err.status).toBe(401);
      },
    });

    const req = httpTestingController.expectOne('/api/v1/customers');
    req.flush('Session has expired', { status: 401, statusText: 'Unauthorized' });

    expect(errored).toBe(true);
    expect(clearSpy).toHaveBeenCalled();
    expect(router.navigate).toHaveBeenCalledWith(['/login']);
  });

  it('does not redirect to /login when 401 occurs on login attempt', () => {
    const clearSpy = vi.spyOn(sessionStore, 'clear');

    let errored = false;
    httpClient.post('/api/v1/auth/login', { email: 'test@example.com' }).subscribe({
      next: () => undefined,
      error: (err) => {
        errored = true;
        expect(err.status).toBe(401);
      },
    });

    const req = httpTestingController.expectOne('/api/v1/auth/login');
    req.flush('Invalid credentials', { status: 401, statusText: 'Unauthorized' });

    expect(errored).toBe(true);
    expect(clearSpy).not.toHaveBeenCalled();
    expect(router.navigate).not.toHaveBeenCalled();
  });

  it('replaces raw 403 text with a user-safe authorization message', () => {
    let message = '';
    httpClient.get('/api/v1/purchases').subscribe({
      next: () => undefined,
      error: (err) => {
        message = err.error?.error?.message ?? '';
      },
    });

    const req = httpTestingController.expectOne('/api/v1/purchases');
    req.flush('Request failed with status code 403', { status: 403, statusText: 'Forbidden' });

    expect(message).toContain("You don't have permission to access this area");
    expect(message).not.toMatch(/status code 403/i);
  });
});
