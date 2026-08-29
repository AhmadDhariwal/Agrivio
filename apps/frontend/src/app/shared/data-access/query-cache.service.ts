import { Injectable, inject } from '@angular/core';
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
  writeGeneration: number;
}

interface InFlightEntry<T> {
  observable: Observable<T>;
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
  private lastOrganizationId: string | null = null;

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

    const writeGeneration = this.keyWriteGeneration.get(options.key) ?? 0;
    const existing = this.inFlight.get(options.key);
    if (existing && !forceRefresh && existing.writeGeneration === writeGeneration) {
      return existing.observable as Observable<T>;
    }

    const flightWriteGeneration = writeGeneration;
    const observable = options.loader().pipe(
      tap({
        next: (value) => {
          if ((this.keyWriteGeneration.get(options.key) ?? 0) !== flightWriteGeneration) {
            return;
          }
          this.writeEntry(options.key, value, policy, tags, flightWriteGeneration);
        },
      }),
      shareReplay({ bufferSize: 1, refCount: true }),
      finalize(() => {
        this.inFlight.delete(options.key);
      }),
    );

    this.inFlight.set(options.key, {
      observable: observable as Observable<unknown>,
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
    this.entries.clear();
    this.inFlight.clear();
    this.tagIndex.clear();
    this.keyWriteGeneration.clear();
    this.lastOrganizationId = null;
  }

  private syncOrganizationScope(): void {
    const orgId = this.sessionStore.activeContext()?.organizationId ?? null;
    if (this.lastOrganizationId !== null && orgId !== null && this.lastOrganizationId !== orgId) {
      this.clearTenantCache();
    }
    this.lastOrganizationId = orgId;
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
    if (entry.writeGeneration !== (this.keyWriteGeneration.get(key) ?? 0)) {
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
    writeGeneration: number,
  ): void {
    const ttl = TTL_MS[policy];
    this.removeStoredEntry(key);
    this.entries.set(key, {
      value,
      expiresAt: ttl === null ? null : Date.now() + ttl,
      tags,
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
