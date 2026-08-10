import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, map, switchMap, tap } from 'rxjs';
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

@Injectable({ providedIn: 'root' })
export class AuthApi {
  private readonly http = inject(HttpClient);
  private csrfToken: string | null = null;

  ensureCsrf(): Observable<{ csrfToken: string }> {
    return this.http
      .post<{ data: { csrfToken: string } }>(
        `${environment.publicApiBaseUrl}/api/v1/auth/csrf`,
        {},
        { withCredentials: true },
      )
      .pipe(
        tap((response) => {
          this.csrfToken = response.data.csrfToken;
        }),
        map((response) => ({ csrfToken: response.data.csrfToken })),
      );
  }

  login(
    email: string,
    password: string,
  ): Observable<{ csrfToken: string; session: AuthSessionSnapshot }> {
    return this.ensureCsrf().pipe(
      switchMap(({ csrfToken }) =>
        this.http
          .post<{ data: { csrfToken: string; session: AuthSessionSnapshot } }>(
            `${environment.publicApiBaseUrl}/api/v1/auth/login`,
            { email, password },
            {
              withCredentials: true,
              headers: new HttpHeaders({ 'X-CSRF-Token': csrfToken }),
            },
          )
          .pipe(
            tap((response) => {
              this.csrfToken = response.data.csrfToken;
            }),
            map((response) => response.data),
          ),
      ),
    );
  }

  getSession(): Observable<AuthSessionSnapshot> {
    return this.http
      .get<{ data: AuthSessionSnapshot }>(`${environment.publicApiBaseUrl}/api/v1/auth/session`, {
        withCredentials: true,
      })
      .pipe(map((response) => response.data));
  }

  switchContext(
    selection: SessionContextSelection,
  ): Observable<{ csrfToken: string; session: AuthSessionSnapshot }> {
    return this.ensureCsrf().pipe(
      switchMap(({ csrfToken }) =>
        this.http
          .post<{ data: { csrfToken: string; session: AuthSessionSnapshot } }>(
            `${environment.publicApiBaseUrl}/api/v1/auth/session/context`,
            selection,
            {
              withCredentials: true,
              headers: new HttpHeaders({ 'X-CSRF-Token': csrfToken }),
            },
          )
          .pipe(
            tap((response) => {
              this.csrfToken = response.data.csrfToken;
            }),
            map((response) => response.data),
          ),
      ),
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
    return this.ensureCsrf().pipe(
      switchMap(({ csrfToken }) =>
        this.http.post(
          `${environment.publicApiBaseUrl}/api/v1/auth/password-reset/confirm`,
          { token, password },
          {
            withCredentials: true,
            headers: new HttpHeaders({ 'X-CSRF-Token': csrfToken }),
          },
        ),
      ),
    );
  }

  logout(): Observable<unknown> {
    return this.ensureCsrf().pipe(
      switchMap(({ csrfToken }) =>
        this.http.post(
          `${environment.publicApiBaseUrl}/api/v1/auth/logout`,
          {},
          {
            withCredentials: true,
            headers: new HttpHeaders({ 'X-CSRF-Token': csrfToken }),
          },
        ),
      ),
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
