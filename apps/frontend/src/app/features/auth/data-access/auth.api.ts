import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import {
  Observable,
  Subject,
  defer,
  finalize,
  map,
  of,
  shareReplay,
  switchMap,
  takeUntil,
  tap,
} from 'rxjs';
import { environment } from '../../../../environments/environment';

export interface AuthSessionUser {
  id: string;
  email: string;
  displayName: string;
  status: string;
}

export interface AuthSessionContext {
  contextType: 'platform' | 'organization';
  membershipId?: string;
  organizationId?: string;
  role: string;
  permissions: string[];
  branchId?: string;
  warehouseId?: string;
  branchAssignments?: Array<{ targetId: string }>;
  warehouseAssignments?: Array<{ targetId: string }>;
}

export interface AuthSessionSnapshot {
  user: AuthSessionUser;
  activeContext: AuthSessionContext | null;
  availableContexts: AuthSessionContext[];
  branchAssignments: Array<{ targetId: string }>;
  warehouseAssignments: Array<{ targetId: string }>;
  subscriptionAccessState: {
    status: string | null;
    accessLevel?: string;
    operationalWriteAllowed?: boolean;
    billingAccessAllowed?: boolean;
    planCode?: string | null;
    planVersion?: number | null;
    trialEndsAt?: string | null;
    graceEndsAt?: string | null;
    periodEndsAt?: string | null;
    warnings?: Array<{ code: string; message: string; endsAt?: string }>;
  } | null;
}

export interface SessionContextSelection {
  contextType: 'platform' | 'organization';
  membershipId?: string;
  organizationId?: string;
  branchId?: string | null;
  warehouseId?: string | null;
}

interface RotatedSession {
  csrfToken: string;
  session: AuthSessionSnapshot;
}

@Injectable({ providedIn: 'root' })
export class AuthApi {
  private readonly http = inject(HttpClient);
  private csrfToken: string | null = null;
  private csrfRequest: Observable<{ csrfToken: string }> | null = null;
  private readonly csrfInvalidated = new Subject<void>();
  private csrfGeneration = 0;

  ensureCsrf(): Observable<{ csrfToken: string }> {
    return defer(() => {
      if (this.csrfToken !== null) {
        return of({ csrfToken: this.csrfToken });
      }
      if (this.csrfRequest !== null) {
        return this.csrfRequest;
      }

      const release = () => {
        if (this.csrfRequest === request) {
          this.csrfRequest = null;
        }
      };
      const request = this.http
        .post<{ data: { csrfToken: string } }>(
          `${environment.publicApiBaseUrl}/api/v1/auth/csrf`,
          {},
          { withCredentials: true },
        )
        .pipe(
          takeUntil(
            this.csrfInvalidated.pipe(
              map(() => {
                throw new Error(
                  'The session changed while obtaining a CSRF token. Please try again.',
                );
              }),
            ),
          ),
          map(({ data }) => data),
          tap(({ csrfToken }) => {
            this.csrfToken = csrfToken;
          }),
          tap({ error: release }),
          finalize(release),
          shareReplay({ bufferSize: 1, refCount: false }),
        );
      this.csrfRequest = request;
      return request;
    });
  }

  login(email: string, password: string): Observable<RotatedSession> {
    return this.postSessionTransition<RotatedSession>('/login', { email, password }).pipe(
      map(({ data }) => data),
    );
  }

  getSession(): Observable<AuthSessionSnapshot> {
    return defer(() => {
      const generation = this.csrfGeneration;
      return this.http
        .get<{ data: AuthSessionSnapshot }>(`${environment.publicApiBaseUrl}/api/v1/auth/session`, {
          withCredentials: true,
        })
        .pipe(
          tap({
            error: (error: unknown) => {
              if (
                error instanceof HttpErrorResponse &&
                error.status === 401 &&
                generation === this.csrfGeneration
              ) {
                this.clearSecurityState();
              }
            },
          }),
          map((response) => response.data),
        );
    });
  }

  switchContext(selection: SessionContextSelection): Observable<RotatedSession> {
    return this.postSessionTransition<RotatedSession>('/session/context', selection).pipe(
      map(({ data }) => data),
    );
  }

  activate(token: string, password: string): Observable<RotatedSession> {
    return this.postSessionTransition<RotatedSession>('/activate', { token, password }).pipe(
      map(({ data }) => data),
    );
  }

  requestPasswordReset(email: string): Observable<unknown> {
    return this.http.post(
      `${environment.publicApiBaseUrl}/api/v1/auth/password-reset/request`,
      { email },
      { withCredentials: true },
    );
  }

  confirmPasswordReset(token: string, password: string): Observable<unknown> {
    return this.postSessionTransition('/password-reset/confirm', {
      token,
      password,
      passwordConfirmation: password,
    });
  }

  logout(): Observable<unknown> {
    return this.postSessionTransition('/logout', {});
  }

  clearSecurityState(): void {
    this.csrfGeneration += 1;
    this.csrfToken = null;
    this.csrfRequest = null;
    this.csrfInvalidated.next();
  }

  invalidateCsrf(rejectedToken: string): void {
    if (this.csrfToken === rejectedToken) {
      this.clearSecurityState();
    }
  }

  private postSessionTransition<T extends { csrfToken?: string }>(
    path: string,
    body: unknown,
  ): Observable<{ data: T }> {
    return this.ensureCsrf().pipe(
      switchMap(({ csrfToken }) => {
        // A later transition or invalidation supersedes this response's token.
        const generation = ++this.csrfGeneration;
        return this.http
          .post<{ data: T }>(`${environment.publicApiBaseUrl}/api/v1/auth${path}`, body, {
            withCredentials: true,
            headers: new HttpHeaders({ 'X-CSRF-Token': csrfToken }),
          })
          .pipe(
            tap(({ data }) => {
              if (generation === this.csrfGeneration) {
                this.clearSecurityState();
                this.csrfToken = data.csrfToken ?? null;
              }
            }),
          );
      }),
    );
  }

  postWithCsrf(url: string, body: unknown): Observable<unknown> {
    return this.ensureCsrf().pipe(
      switchMap(({ csrfToken }) =>
        this.http.post(url, body, {
          withCredentials: true,
          headers: new HttpHeaders({ 'X-CSRF-Token': csrfToken }),
        }),
      ),
    );
  }
}
