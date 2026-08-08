import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, map, switchMap, tap } from 'rxjs';
import { environment } from '../../../environments/environment';

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

  login(email: string, password: string): Observable<unknown> {
    return this.ensureCsrf().pipe(
      switchMap(({ csrfToken }) =>
        this.http
          .post(
            `${environment.publicApiBaseUrl}/api/v1/auth/login`,
            { email, password },
            {
              withCredentials: true,
              headers: new HttpHeaders({ 'X-CSRF-Token': csrfToken }),
            },
          )
          .pipe(
            tap((response) => {
              const body = response as { data?: { csrfToken?: string } };
              if (typeof body.data?.csrfToken === 'string') {
                this.csrfToken = body.data.csrfToken;
              }
            }),
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
