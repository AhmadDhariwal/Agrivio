import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, forkJoin, map, switchMap, tap } from 'rxjs';
import {
  API_CSRF_HEADER,
  API_IDEMPOTENCY_KEY_HEADER,
  API_PLATFORM_ORGANIZATIONS_PATH,
  API_PLATFORM_SUBSCRIPTIONS_PATH,
} from '@agrivio/api-contracts';
import { environment } from '../../../../environments/environment';
import { AuthApi } from '../../auth/data-access/auth.api';
import { PaginatedResult } from '../../../shared/data-access/pagination';
import { QueryCacheService } from '../../../shared/data-access/query-cache.service';
import {
  PlatformAuditEvent,
  PlatformChangePlanPayload,
  PlatformOrganizationActivationHandoff,
  PlatformOrganizationDetail,
  PlatformOrganizationKpis,
  PlatformOrganizationMember,
  PlatformOrganizationQuery,
  PlatformOrganizationSummary,
  PlatformOrganizationUsage,
  PlatformProfilePatchPayload,
  PlatformReactivatePayload,
  PlatformSuspendPayload,
} from '../models/platform-organization.models';

export * from '../models/platform-organization.models';

@Injectable({ providedIn: 'root' })
export class PlatformOrganizationsApi {
  private readonly http = inject(HttpClient);
  private readonly authApi = inject(AuthApi);
  private readonly queryCache = inject(QueryCacheService);

  list(
    params: PlatformOrganizationQuery = {},
    forceRefresh = false,
  ): Observable<PaginatedResult<PlatformOrganizationSummary>> {
    const page = params.page ?? 1;
    const pageSize = params.pageSize ?? 25;
    const queryKeyParams: Record<string, unknown> = { page, pageSize };
    if (params.status) queryKeyParams['status'] = params.status;
    if (params.subscriptionStatus) queryKeyParams['subscriptionStatus'] = params.subscriptionStatus;
    if (params.plan) queryKeyParams['plan'] = params.plan;
    if (params.search) queryKeyParams['search'] = params.search;
    if (params.sort) queryKeyParams['sort'] = params.sort;
    if (params.direction) queryKeyParams['direction'] = params.direction;
    if (params.createdFrom) queryKeyParams['createdFrom'] = params.createdFrom;
    if (params.createdTo) queryKeyParams['createdTo'] = params.createdTo;

    return this.queryCache.fetch({
      key: this.queryCache.buildKey('platform:organizations', queryKeyParams),
      policy: 'short',
      forceRefresh,
      loader: () => {
        let httpParams = new HttpParams()
          .set('page', String(page))
          .set('pageSize', String(pageSize));

        if (params.status) httpParams = httpParams.set('status', params.status);
        if (params.subscriptionStatus) {
          httpParams = httpParams.set('subscriptionStatus', params.subscriptionStatus);
        }
        if (params.plan) httpParams = httpParams.set('plan', params.plan);
        if (params.search) httpParams = httpParams.set('search', params.search);
        if (params.sort) httpParams = httpParams.set('sort', params.sort);
        if (params.direction) httpParams = httpParams.set('direction', params.direction);
        if (params.createdFrom) httpParams = httpParams.set('createdFrom', params.createdFrom);
        if (params.createdTo) httpParams = httpParams.set('createdTo', params.createdTo);

        return this.http
          .get<{
            data: Array<Record<string, unknown>>;
            meta: PaginatedResult<PlatformOrganizationSummary>['meta'];
          }>(`${environment.publicApiBaseUrl}${API_PLATFORM_ORGANIZATIONS_PATH}`, {
            withCredentials: true,
            params: httpParams,
          })
          .pipe(
            map((response) => ({
              items: response.data.map(mapOrganizationSummary),
              meta: response.meta,
            })),
          );
      },
    });
  }

  getSummaryKpis(forceRefresh = false): Observable<PlatformOrganizationKpis> {
    return this.queryCache.fetch({
      key: this.queryCache.buildKey('platform:organizations:kpis'),
      policy: 'short',
      forceRefresh,
      loader: () =>
        forkJoin({
          totalRes: this.list({ page: 1, pageSize: 1 }, true),
          activeRes: this.list({ page: 1, pageSize: 1, status: 'approved' }, true),
          suspendedRes: this.list({ page: 1, pageSize: 1, status: 'suspended' }, true),
          trialRes: this.list({ page: 1, pageSize: 1, subscriptionStatus: 'trial' }, true),
        }).pipe(
          map(({ totalRes, activeRes, suspendedRes, trialRes }) => ({
            total: totalRes.meta.total,
            active: activeRes.meta.total,
            suspended: suspendedRes.meta.total,
            trial: trialRes.meta.total,
          })),
        ),
    });
  }

  getById(id: string, forceRefresh = false): Observable<PlatformOrganizationDetail> {
    return this.queryCache.fetch({
      key: this.queryCache.buildKey('platform:organization-detail', { id }),
      policy: 'short',
      forceRefresh,
      loader: () =>
        this.http
          .get<{ data: Record<string, unknown> }>(
            `${environment.publicApiBaseUrl}${API_PLATFORM_ORGANIZATIONS_PATH}/${id}`,
            { withCredentials: true },
          )
          .pipe(map((res) => mapOrganizationDetail(res.data))),
    });
  }

  getUsage(id: string, forceRefresh = false): Observable<PlatformOrganizationUsage> {
    return this.queryCache.fetch({
      key: this.queryCache.buildKey('platform:organization-usage', { id }),
      policy: 'short',
      forceRefresh,
      loader: () =>
        this.http
          .get<{ data: PlatformOrganizationUsage }>(
            `${environment.publicApiBaseUrl}${API_PLATFORM_ORGANIZATIONS_PATH}/${id}/usage`,
            { withCredentials: true },
          )
          .pipe(map((res) => res.data)),
    });
  }

  listMembers(
    id: string,
    params: { page?: number; pageSize?: number; search?: string; status?: string; role?: string } = {},
  ): Observable<PaginatedResult<PlatformOrganizationMember>> {
    let httpParams = new HttpParams()
      .set('page', String(params.page ?? 1))
      .set('pageSize', String(params.pageSize ?? 25));

    if (params.search) httpParams = httpParams.set('search', params.search);
    if (params.status) httpParams = httpParams.set('status', params.status);
    if (params.role) httpParams = httpParams.set('role', params.role);

    return this.http
      .get<{
        data: PlatformOrganizationMember[];
        meta: PaginatedResult<PlatformOrganizationMember>['meta'];
      }>(`${environment.publicApiBaseUrl}${API_PLATFORM_ORGANIZATIONS_PATH}/${id}/members`, {
        withCredentials: true,
        params: httpParams,
      })
      .pipe(map((res) => ({ items: res.data ?? [], meta: res.meta })));
  }

  update(
    id: string,
    input: PlatformProfilePatchPayload,
  ): Observable<PlatformOrganizationSummary> {
    return this.authApi.ensureCsrf().pipe(
      switchMap(({ csrfToken }) =>
        this.http.patch<{ data: Record<string, unknown> }>(
          `${environment.publicApiBaseUrl}${API_PLATFORM_ORGANIZATIONS_PATH}/${id}`,
          input,
          {
            withCredentials: true,
            headers: {
              [API_CSRF_HEADER]: csrfToken,
            },
          },
        ),
      ),
      map((res) => mapOrganizationSummary(res.data)),
      tap(() => this.invalidatePlatformOrgData(id)),
    );
  }

  suspend(
    id: string,
    input: PlatformSuspendPayload,
  ): Observable<{ organizationId: string; status: string; version: number }> {
    const key = crypto.randomUUID();
    return this.authApi.ensureCsrf().pipe(
      switchMap(({ csrfToken }) =>
        this.http.post<{
          data: { organizationId: string; status: string; version: number };
        }>(
          `${environment.publicApiBaseUrl}${API_PLATFORM_ORGANIZATIONS_PATH}/${id}/suspend`,
          input,
          {
            withCredentials: true,
            headers: {
              [API_CSRF_HEADER]: csrfToken,
              [API_IDEMPOTENCY_KEY_HEADER]: key,
            },
          },
        ),
      ),
      map((res) => res.data),
      tap(() => this.invalidatePlatformOrgData(id)),
    );
  }

  reactivate(
    id: string,
    input: PlatformReactivatePayload,
  ): Observable<{ organizationId: string; status: string; version: number }> {
    const key = crypto.randomUUID();
    return this.authApi.ensureCsrf().pipe(
      switchMap(({ csrfToken }) =>
        this.http.post<{
          data: { organizationId: string; status: string; version: number };
        }>(
          `${environment.publicApiBaseUrl}${API_PLATFORM_ORGANIZATIONS_PATH}/${id}/reactivate`,
          input,
          {
            withCredentials: true,
            headers: {
              [API_CSRF_HEADER]: csrfToken,
              [API_IDEMPOTENCY_KEY_HEADER]: key,
            },
          },
        ),
      ),
      map((res) => res.data),
      tap(() => this.invalidatePlatformOrgData(id)),
    );
  }

  changeSubscriptionPlan(
    subscriptionId: string,
    input: PlatformChangePlanPayload,
    organizationId?: string,
  ): Observable<unknown> {
    return this.authApi.ensureCsrf().pipe(
      switchMap(({ csrfToken }) =>
        this.http.post<{ data: unknown }>(
          `${environment.publicApiBaseUrl}${API_PLATFORM_SUBSCRIPTIONS_PATH}/${subscriptionId}/change-plan`,
          input,
          {
            withCredentials: true,
            headers: {
              [API_CSRF_HEADER]: csrfToken,
            },
          },
        ),
      ),
      map((res) => res.data),
      tap(() => {
        if (organizationId) {
          this.invalidatePlatformOrgData(organizationId);
        }
      }),
    );
  }

  create(input: {
    organizationName: string;
    ownerEmail: string;
    ownerDisplayName: string;
    timezone?: string;
  }): Observable<{ organizationId: string; status: string; ownerEmail: string; duplicate: boolean }> {
    const key = crypto.randomUUID();
    return this.authApi.ensureCsrf().pipe(
      switchMap(({ csrfToken }) =>
        this.http.post<{
          data: {
            organizationId: string;
            status: string;
            ownerEmail: string;
            duplicate?: boolean;
          };
        }>(`${environment.publicApiBaseUrl}${API_PLATFORM_ORGANIZATIONS_PATH}`, input, {
          withCredentials: true,
          headers: {
            [API_CSRF_HEADER]: csrfToken,
            [API_IDEMPOTENCY_KEY_HEADER]: key,
          },
        }),
      ),
      map((response) => ({
        organizationId: response.data.organizationId,
        status: response.data.status,
        ownerEmail: response.data.ownerEmail,
        duplicate: response.data.duplicate === true,
      })),
      tap(() => this.invalidatePlatformOrgList()),
    );
  }

  approve(organizationId: string): Observable<PlatformOrganizationActivationHandoff> {
    return this.postActivationAction(organizationId, 'approve');
  }

  reissueActivation(organizationId: string): Observable<PlatformOrganizationActivationHandoff> {
    return this.postActivationAction(organizationId, 'reissue-activation');
  }

  reject(organizationId: string, reason: string): Observable<unknown> {
    return this.authApi.ensureCsrf().pipe(
      switchMap(({ csrfToken }) =>
        this.http.post(
          `${environment.publicApiBaseUrl}${API_PLATFORM_ORGANIZATIONS_PATH}/${organizationId}/reject`,
          { reason },
          {
            withCredentials: true,
            headers: { [API_CSRF_HEADER]: csrfToken },
          },
        ),
      ),
      tap(() => this.invalidatePlatformOrgData(organizationId)),
    );
  }

  private postActivationAction(
    organizationId: string,
    action: 'approve' | 'reissue-activation',
  ): Observable<PlatformOrganizationActivationHandoff> {
    return this.authApi.ensureCsrf().pipe(
      switchMap(({ csrfToken }) =>
        this.http
          .post<{ data: Record<string, unknown> }>(
            `${environment.publicApiBaseUrl}${API_PLATFORM_ORGANIZATIONS_PATH}/${organizationId}/${action}`,
            {},
            {
              withCredentials: true,
              headers: { [API_CSRF_HEADER]: csrfToken },
            },
          )
          .pipe(map((response) => mapActivationHandoff(response.data, organizationId))),
      ),
      tap(() => this.invalidatePlatformOrgData(organizationId)),
    );
  }

  private invalidatePlatformOrgData(organizationId: string): void {
    this.queryCache.invalidateKey(
      this.queryCache.buildKey('platform:organization-detail', { id: organizationId }),
    );
    this.queryCache.invalidateKey(
      this.queryCache.buildKey('platform:organization-usage', { id: organizationId }),
    );
    this.invalidatePlatformOrgList();
  }

  private invalidatePlatformOrgList(): void {
    this.queryCache.invalidateKey(this.queryCache.buildKey('platform:organizations:kpis'));
  }
}

function mapOrganizationSummary(item: Record<string, unknown>): PlatformOrganizationSummary {
  const sub = item['subscription'] as Record<string, unknown> | undefined;
  return {
    id: String(item['id'] ?? item['_id'] ?? ''),
    name: String(item['name'] ?? ''),
    status: String(item['status'] ?? ''),
    version: Number(item['version'] ?? 1),
    ...(typeof item['timezone'] === 'string' ? { timezone: item['timezone'] } : {}),
    ...(item['createdAt'] !== undefined ? { createdAt: (item['createdAt'] as string | null) } : {}),
    ...(item['updatedAt'] !== undefined ? { updatedAt: (item['updatedAt'] as string | null) } : {}),
    ...(item['approvedAt'] !== undefined ? { approvedAt: (item['approvedAt'] as string | null) } : {}),
    ...(item['rejectedAt'] !== undefined ? { rejectedAt: (item['rejectedAt'] as string | null) } : {}),
    ...(item['rejectionReason'] !== undefined ? { rejectionReason: (item['rejectionReason'] as string | null) } : {}),
    ...(typeof item['ownerUserId'] === 'string' ? { ownerUserId: item['ownerUserId'] } : {}),
    ...(item['ownerEmail'] !== undefined ? { ownerEmail: (item['ownerEmail'] as string | null) } : {}),
    ...(item['ownerStatus'] !== undefined ? { ownerStatus: (item['ownerStatus'] as string | null) } : {}),
    ...(typeof item['ownerNeedsActivation'] === 'boolean'
      ? { ownerNeedsActivation: item['ownerNeedsActivation'] }
      : {}),
    ...(typeof item['branchCount'] === 'number' ? { branchCount: item['branchCount'] } : {}),
    ...(typeof item['warehouseCount'] === 'number' ? { warehouseCount: item['warehouseCount'] } : {}),
    ...(typeof item['employeeCount'] === 'number' ? { employeeCount: item['employeeCount'] } : {}),
    ...(typeof item['ownerCount'] === 'number' ? { ownerCount: item['ownerCount'] } : {}),
    subscription: sub
      ? {
          id: String(sub['id'] ?? sub['_id'] ?? ''),
          status: String(sub['status'] ?? ''),
          planCode: String(sub['planCode'] ?? ''),
          planVersion: Number(sub['planVersion'] ?? 1),
          trialEndsAt: typeof sub['trialEndsAt'] === 'string' ? sub['trialEndsAt'] : null,
          graceEndsAt: typeof sub['graceEndsAt'] === 'string' ? sub['graceEndsAt'] : null,
          periodStartsAt:
            typeof sub['periodStartsAt'] === 'string' ? sub['periodStartsAt'] : null,
          periodEndsAt: typeof sub['periodEndsAt'] === 'string' ? sub['periodEndsAt'] : null,
          version: Number(sub['version'] ?? 1),
        }
      : null,
  };
}

function mapOrganizationDetail(data: Record<string, unknown>): PlatformOrganizationDetail {
  const summary = mapOrganizationSummary(data);
  const owner = data['owner'] as Record<string, unknown> | undefined;
  const identity = data['identity'] as Record<string, unknown> | undefined;
  const lifecycle = data['lifecycle'] as Record<string, unknown> | undefined;
  const usage = data['usage'] as PlatformOrganizationUsage | undefined;
  const members = data['members'] as { items: PlatformOrganizationMember[]; total: number } | undefined;
  const branches = data['branches'] as { items: Array<{ id: string; name: string }>; total: number } | undefined;
  const warehouses = data['warehouses'] as { items: Array<{ id: string; name: string }>; total: number } | undefined;
  const capabilities = data['capabilities'] as Record<string, unknown> | undefined;
  const setup = data['setup'] as { completed: boolean; percentage: number } | undefined;
  const audit = data['audit'] as { total: number; recent: PlatformAuditEvent[] } | undefined;
  const billing = data['billing'] as Record<string, unknown> | undefined;
  const operationalWarnings = data['operationalWarnings'] as Array<{ code: string; message: string }> | undefined;

  return {
    ...summary,
    owner: owner
      ? {
          id: String(owner['id'] ?? owner['_id'] ?? ''),
          email: String(owner['email'] ?? ''),
          displayName: String(owner['displayName'] ?? ''),
          status: String(owner['status'] ?? ''),
          hasPassword: Boolean(owner['hasPassword']),
        }
      : null,
    ...(identity
      ? {
          identity: {
            name: String(identity['name'] ?? summary.name),
            timezone: String(identity['timezone'] ?? summary.timezone ?? 'Asia/Karachi'),
            settings: identity['settings'] as Record<string, unknown> | undefined,
          },
        }
      : {}),
    ...(lifecycle
      ? {
          lifecycle: {
            status: String(lifecycle['status'] ?? summary.status),
            version: Number(lifecycle['version'] ?? summary.version ?? 1),
          },
        }
      : {}),
    ...(usage ? { usage } : {}),
    ...(members ? { members: { items: members.items ?? [], total: members.total ?? 0 } } : {}),
    ...(branches ? { branches: { items: branches.items ?? [], total: branches.total ?? 0 } } : {}),
    ...(warehouses ? { warehouses: { items: warehouses.items ?? [], total: warehouses.total ?? 0 } } : {}),
    ...(capabilities ? { capabilities } : {}),
    ...(setup ? { setup } : {}),
    ...(audit ? { audit: { total: audit.total ?? 0, recent: audit.recent ?? [] } } : {}),
    ...(billing ? { billing } : {}),
    operationalWarnings: operationalWarnings ?? [],
  };
}

function mapActivationHandoff(
  data: Record<string, unknown>,
  organizationId: string,
): PlatformOrganizationActivationHandoff {
  const activationToken = String(data['activationToken'] ?? '');
  const activationPath =
    typeof data['activationPath'] === 'string' && data['activationPath'].length > 0
      ? data['activationPath']
      : `/activate?token=${encodeURIComponent(activationToken)}`;
  const activationUrl =
    typeof data['activationUrl'] === 'string' && data['activationUrl'].length > 0
      ? data['activationUrl']
      : `${window.location.origin}${activationPath}`;

  return {
    organizationId: String(data['organizationId'] ?? organizationId),
    status: String(data['status'] ?? 'approved'),
    ownerEmail: String(data['ownerEmail'] ?? ''),
    ownerDisplayName: String(data['ownerDisplayName'] ?? ''),
    activationToken,
    activationTokenExpiresAt: String(data['activationTokenExpiresAt'] ?? ''),
    activationPath,
    activationUrl,
    ...(data['reissued'] === true ? { reissued: true } : {}),
  };
}
