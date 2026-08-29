import { Injectable, effect, inject } from '@angular/core';
import { Observable, of, finalize, shareReplay, tap } from 'rxjs';
import { AuthSessionStore } from '../../features/auth/data-access/auth-session.store';
import type { QueryCacheTag } from './query-cache.tags';

export type QueryCachePolicy = 'reference' | 'short' | 'dedupe-only';

const TTL_MS: Record<QueryCachePolicy, number | null> = {
  reference: 10 * 60 * 1000,
  short: 15 * 1000,
  'dedupe-only': null,
};

interface CacheEntry<T> {
  value: T;
  expiresAt: number | null;
  tags: readonly QueryCacheTag[];
  cacheGeneration: number;
  writeGeneration: number;
}

interface InFlightEntry<T> {
  observable: Observable<T>;
  cacheGeneration: number;
  writeGeneration: number;
  tags: readonly QueryCacheTag[];
}

@Injectable({ providedIn: 'root' })
export class QueryCacheService {
  private readonly sessionStore = inject(AuthSessionStore);
  private readonly entries = new Map<string, CacheEntry<unknown>>();
  private readonly inFlight = new Map<string, InFlightEntry<unknown>>();
  private readonly tagIndex = new Map<string, Set<string>>();
  private readonly keyWriteGeneration = new Map<string, number>();
  private cacheGeneration = 0;
  private lastOrganizationId: string | null | undefined;
  private lastSessionScope: string | undefined;

  constructor() {
    effect(() => {
      const scope = this.sessionScope();
      const organizationId = this.currentOrganizationId();
      if (this.lastSessionScope !== undefined && scope !== this.lastSessionScope) {
        this.clearStoredEntries();
      }
      this.lastSessionScope = scope;
      this.lastOrganizationId = organizationId;
    });
  }

  buildKey(resource: string, params: Record<string, unknown> = {}): string {
    this.syncOrganizationScope();
    const orgId = this.sessionStore.activeContext()?.organizationId ?? 'anonymous';
    const normalized = this.normalizeParams(params);
    const paramPart = Object.keys(normalized)
      .sort()
      .map((key) => `${key}=${normalized[key]}`)
      .join('|');
    return `org:${orgId}|${resource}${paramPart ? `|${paramPart}` : ''}`;
  }

  fetch<T>(options: {
    key: string;
    loader: () => Observable<T>;
    policy?: QueryCachePolicy;
    tags?: readonly QueryCacheTag[];
    forceRefresh?: boolean;
  }): Observable<T> {
    this.syncOrganizationScope();
    const policy = options.policy ?? 'dedupe-only';
    const tags = options.tags ?? [];
    const forceRefresh = options.forceRefresh === true;

    if (forceRefresh) {
      this.invalidateKey(options.key);
    } else {
      const cached = this.readEntry<T>(options.key);
      if (cached !== undefined) {
        return of(cached);
      }
    }

    const cacheGeneration = this.cacheGeneration;
    const writeGeneration = this.keyWriteGeneration.get(options.key) ?? 0;
    const existing = this.inFlight.get(options.key);
    if (
      existing &&
      !forceRefresh &&
      existing.cacheGeneration === cacheGeneration &&
      existing.writeGeneration === writeGeneration
    ) {
      return existing.observable as Observable<T>;
    }

    const flightCacheGeneration = cacheGeneration;
    const flightWriteGeneration = writeGeneration;
    const observable = options.loader().pipe(
      tap({
        next: (value) => {
          if (
            this.cacheGeneration !== flightCacheGeneration ||
            (this.keyWriteGeneration.get(options.key) ?? 0) !== flightWriteGeneration
          ) {
            return;
          }
          this.writeEntry(
            options.key,
            value,
            policy,
            tags,
            flightCacheGeneration,
            flightWriteGeneration,
          );
        },
      }),
      finalize(() => {
        const current = this.inFlight.get(options.key);
        if (
          current?.cacheGeneration === flightCacheGeneration &&
          current.writeGeneration === flightWriteGeneration
        ) {
          this.inFlight.delete(options.key);
        }
      }),
      shareReplay({ bufferSize: 1, refCount: true }),
    );

    this.inFlight.set(options.key, {
      observable: observable as Observable<unknown>,
      cacheGeneration,
      writeGeneration,
      tags,
    });
    return observable;
  }

  invalidateTags(...tags: QueryCacheTag[]): void {
    for (const tag of tags) {
      for (const [key, flight] of this.inFlight.entries()) {
        if (flight.tags.includes(tag)) {
          this.invalidateKey(key);
        }
      }
      const keys = this.tagIndex.get(tag);
      if (!keys) {
        continue;
      }
      for (const key of [...keys]) {
        this.invalidateKey(key);
      }
    }
  }

  invalidateKey(key: string): void {
    this.keyWriteGeneration.set(key, (this.keyWriteGeneration.get(key) ?? 0) + 1);
    const entry = this.entries.get(key);
    if (entry) {
      for (const tag of entry.tags) {
        const keys = this.tagIndex.get(tag);
        keys?.delete(key);
        if (keys && keys.size === 0) {
          this.tagIndex.delete(tag);
        }
      }
    }
    this.entries.delete(key);
    this.inFlight.delete(key);
  }

  clearTenantCache(): void {
    this.clearStoredEntries();
    this.lastOrganizationId = this.currentOrganizationId();
    this.lastSessionScope = this.sessionScope();
  }

  private clearStoredEntries(): void {
    this.cacheGeneration += 1;
    this.entries.clear();
    this.inFlight.clear();
    this.tagIndex.clear();
    this.keyWriteGeneration.clear();
  }

  private syncOrganizationScope(): void {
    const orgId = this.currentOrganizationId();
    if (this.lastOrganizationId !== undefined && this.lastOrganizationId !== orgId) {
      this.clearStoredEntries();
    }
    this.lastOrganizationId = orgId;
  }

  private currentOrganizationId(): string | null {
    return this.sessionStore.activeContext()?.organizationId ?? null;
  }

  private sessionScope(): string {
    const session =
      typeof this.sessionStore.session === 'function' ? this.sessionStore.session() : null;
    if (!session) {
      return 'anonymous';
    }
    const context = session.activeContext;
    return JSON.stringify({
      userId: session.user.id,
      contextType: context?.contextType ?? null,
      membershipId: context?.membershipId ?? null,
      organizationId: context?.organizationId ?? null,
      branchId: context?.branchId ?? null,
      warehouseId: context?.warehouseId ?? null,
      permissions: [...(context?.permissions ?? [])].sort(),
    });
  }

  private normalizeParams(params: Record<string, unknown>): Record<string, string> {
    const normalized: Record<string, string> = {};
    for (const [key, value] of Object.entries(params)) {
      if (value === undefined || value === null || value === '') {
        continue;
      }
      normalized[key] = String(value);
    }
    return normalized;
  }

  private readEntry<T>(key: string): T | undefined {
    const entry = this.entries.get(key);
    if (!entry) {
      return undefined;
    }
    if (
      entry.cacheGeneration !== this.cacheGeneration ||
      entry.writeGeneration !== (this.keyWriteGeneration.get(key) ?? 0)
    ) {
      this.entries.delete(key);
      return undefined;
    }
    if (entry.expiresAt !== null && Date.now() > entry.expiresAt) {
      this.removeStoredEntry(key);
      return undefined;
    }
    return entry.value as T;
  }

  private writeEntry<T>(
    key: string,
    value: T,
    policy: QueryCachePolicy,
    tags: readonly QueryCacheTag[],
    cacheGeneration: number,
    writeGeneration: number,
  ): void {
    const ttl = TTL_MS[policy];
    this.removeStoredEntry(key);
    this.entries.set(key, {
      value,
      expiresAt: ttl === null ? null : Date.now() + ttl,
      tags,
      cacheGeneration,
      writeGeneration,
    });
    for (const tag of tags) {
      const keys = this.tagIndex.get(tag) ?? new Set<string>();
      keys.add(key);
      this.tagIndex.set(tag, keys);
    }
  }

  private removeStoredEntry(key: string): void {
    const entry = this.entries.get(key);
    if (!entry) {
      return;
    }
    for (const tag of entry.tags) {
      const keys = this.tagIndex.get(tag);
      keys?.delete(key);
      if (keys && keys.size === 0) {
        this.tagIndex.delete(tag);
      }
    }
    this.entries.delete(key);
  }
}
