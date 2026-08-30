import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { Subject, of, throwError, delay, firstValueFrom } from 'rxjs';
import { QueryCacheService } from './query-cache.service';
import { QUERY_CACHE_TAGS } from './query-cache.tags';
import { AuthSessionStore } from '../../features/auth/data-access/auth-session.store';

describe('QueryCacheService', () => {
  let service: QueryCacheService;
  let organizationId = 'org-1';
  let sessionState = signal<ReturnType<typeof sessionSnapshot> | null>(sessionSnapshot('org-1'));

  beforeEach(() => {
    vi.useFakeTimers();
    organizationId = 'org-1';
    sessionState = signal<ReturnType<typeof sessionSnapshot> | null>(sessionSnapshot('org-1'));
    TestBed.configureTestingModule({
      providers: [
        QueryCacheService,
        {
          provide: AuthSessionStore,
          useValue: {
            session: sessionState.asReadonly(),
            activeContext: () =>
              organizationId ? { ...sessionState()?.activeContext, organizationId } : null,
          },
        },
      ],
    });
    service = TestBed.inject(QueryCacheService);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns cached value on hit', async () => {
    const loader = vi.fn(() => of('value'));
    const key = service.buildKey('products', { page: 1 });

    await firstValueFrom(
      service.fetch({ key, loader, policy: 'short', tags: [QUERY_CACHE_TAGS.products] }),
    );
    await firstValueFrom(
      service.fetch({ key, loader, policy: 'short', tags: [QUERY_CACHE_TAGS.products] }),
    );

    expect(loader).toHaveBeenCalledTimes(1);
  });

  it('deduplicates simultaneous requests', async () => {
    const loader = vi.fn(() => of('shared').pipe(delay(10)));
    const key = service.buildKey('warehouses', {});

    const first = firstValueFrom(
      service.fetch({ key, loader, tags: [QUERY_CACHE_TAGS.warehouses] }),
    );
    const second = firstValueFrom(
      service.fetch({ key, loader, tags: [QUERY_CACHE_TAGS.warehouses] }),
    );

    await vi.advanceTimersByTimeAsync(10);
    const [a, b] = await Promise.all([first, second]);

    expect(a).toBe('shared');
    expect(b).toBe('shared');
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it('keeps an in-flight request shared when one subscriber leaves early', async () => {
    const response = new Subject<string>();
    const loader = vi.fn(() => response.asObservable());
    const key = service.buildKey('customer-options', { search: 'ali' });
    const shared = service.fetch({
      key,
      loader,
      policy: 'reference',
      tags: [QUERY_CACHE_TAGS.customerOptions],
    });

    const first = shared.subscribe();
    const second = firstValueFrom(
      service.fetch({
        key,
        loader,
        policy: 'reference',
        tags: [QUERY_CACHE_TAGS.customerOptions],
      }),
    );
    first.unsubscribe();
    const third = firstValueFrom(
      service.fetch({
        key,
        loader,
        policy: 'reference',
        tags: [QUERY_CACHE_TAGS.customerOptions],
      }),
    );

    expect(loader).toHaveBeenCalledTimes(1);
    response.next('shared');
    response.complete();
    await expect(Promise.all([second, third])).resolves.toEqual(['shared', 'shared']);
  });

  it('uses different cache entries for different params', async () => {
    const loader = vi.fn((value: string) => of(value));
    const keyA = service.buildKey('batches', { page: 1 });
    const keyB = service.buildKey('batches', { page: 2 });

    await firstValueFrom(
      service.fetch({ key: keyA, loader: () => loader('a'), tags: [QUERY_CACHE_TAGS.batches] }),
    );
    await firstValueFrom(
      service.fetch({ key: keyB, loader: () => loader('b'), tags: [QUERY_CACHE_TAGS.batches] }),
    );

    expect(loader).toHaveBeenCalledTimes(2);
  });

  it('expires short-cache entries after TTL', async () => {
    const loader = vi.fn(() => of('fresh'));
    const key = service.buildKey('expiry', {});

    await firstValueFrom(
      service.fetch({ key, loader, policy: 'short', tags: [QUERY_CACHE_TAGS.expiry] }),
    );
    await vi.advanceTimersByTimeAsync(16_000);
    await firstValueFrom(
      service.fetch({ key, loader, policy: 'short', tags: [QUERY_CACHE_TAGS.expiry] }),
    );

    expect(loader).toHaveBeenCalledTimes(2);
  });

  it('force refresh bypasses cached value', async () => {
    const loader = vi.fn(() => of('v'));
    const key = service.buildKey('movements', { page: 1 });

    await firstValueFrom(
      service.fetch({ key, loader, policy: 'short', tags: [QUERY_CACHE_TAGS.stockMovements] }),
    );
    await firstValueFrom(
      service.fetch({
        key,
        loader,
        policy: 'short',
        tags: [QUERY_CACHE_TAGS.stockMovements],
        forceRefresh: true,
      }),
    );

    expect(loader).toHaveBeenCalledTimes(2);
  });

  it('does not cache failed requests', async () => {
    const loader = vi
      .fn()
      .mockImplementationOnce(() => throwError(() => new Error('fail')))
      .mockImplementationOnce(() => of('ok'));
    const key = service.buildKey('reconciliation', {});

    await expect(
      firstValueFrom(
        service.fetch({ key, loader, policy: 'short', tags: [QUERY_CACHE_TAGS.reconciliation] }),
      ),
    ).rejects.toThrow('fail');

    const value = await firstValueFrom(
      service.fetch({ key, loader, policy: 'short', tags: [QUERY_CACHE_TAGS.reconciliation] }),
    );

    expect(value).toBe('ok');
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it('invalidates entries by tag', async () => {
    const loader = vi.fn(() => of('x'));
    const key = service.buildKey('products', { page: 1 });

    await firstValueFrom(
      service.fetch({ key, loader, policy: 'short', tags: [QUERY_CACHE_TAGS.products] }),
    );
    service.invalidateTags(QUERY_CACHE_TAGS.products);
    await firstValueFrom(
      service.fetch({ key, loader, policy: 'short', tags: [QUERY_CACHE_TAGS.products] }),
    );

    expect(loader).toHaveBeenCalledTimes(2);
  });

  it('isolates cache by organization', async () => {
    const loader = vi.fn(() => of('tenant'));
    const key = service.buildKey('warehouses', {});

    await firstValueFrom(
      service.fetch({ key, loader, tags: [QUERY_CACHE_TAGS.warehouses] }),
    );
    organizationId = 'org-2';
    await firstValueFrom(
      service.fetch({ key, loader, tags: [QUERY_CACHE_TAGS.warehouses] }),
    );

    expect(loader).toHaveBeenCalledTimes(2);
  });

  it('clears cached tenant data across logout and a fresh login to the same organization', async () => {
    const loader = vi.fn(() => of('customers'));
    const key = service.buildKey('customers', { page: 1, status: 'active' });

    await firstValueFrom(
      service.fetch({ key, loader, policy: 'reference', tags: [QUERY_CACHE_TAGS.customers] }),
    );

    organizationId = '';
    sessionState.set(null);
    TestBed.tick();
    organizationId = 'org-1';
    sessionState.set(sessionSnapshot('org-1'));
    TestBed.tick();

    const freshKey = service.buildKey('customers', { page: 1, status: 'active' });
    await firstValueFrom(
      service.fetch({
        key: freshKey,
        loader,
        policy: 'reference',
        tags: [QUERY_CACHE_TAGS.customers],
      }),
    );

    expect(freshKey).toBe(key);
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it('does not cache a stale response that completes after logout', async () => {
    const staleLoader = vi.fn(() => of('stale-customers').pipe(delay(20)));
    const freshLoader = vi.fn(() => of('fresh-customers'));
    const key = service.buildKey('customers', { page: 1, status: 'active' });

    void firstValueFrom(
      service.fetch({
        key,
        loader: staleLoader,
        policy: 'reference',
        tags: [QUERY_CACHE_TAGS.customers],
      }),
    );
    organizationId = '';
    sessionState.set(null);
    TestBed.tick();
    await vi.advanceTimersByTimeAsync(20);

    organizationId = 'org-1';
    sessionState.set(sessionSnapshot('org-1'));
    TestBed.tick();
    const freshKey = service.buildKey('customers', { page: 1, status: 'active' });
    const value = await firstValueFrom(
      service.fetch({
        key: freshKey,
        loader: freshLoader,
        policy: 'reference',
        tags: [QUERY_CACHE_TAGS.customers],
      }),
    );

    expect(value).toBe('fresh-customers');
    expect(staleLoader).toHaveBeenCalledTimes(1);
    expect(freshLoader).toHaveBeenCalledTimes(1);
  });

  it('does not repopulate cache from stale in-flight responses after invalidation', async () => {
    const staleLoader = vi.fn(() => of('stale').pipe(delay(20)));
    const freshLoader = vi.fn(() => of('fresh'));
    const key = service.buildKey('batches', { page: 1 });

    void firstValueFrom(
      service.fetch({
        key,
        loader: staleLoader,
        policy: 'short',
        tags: [QUERY_CACHE_TAGS.batches],
      }),
    );
    service.invalidateTags(QUERY_CACHE_TAGS.batches);
    await vi.advanceTimersByTimeAsync(20);

    const value = await firstValueFrom(
      service.fetch({
        key,
        loader: freshLoader,
        policy: 'short',
        tags: [QUERY_CACHE_TAGS.batches],
      }),
    );

    expect(value).toBe('fresh');
    expect(staleLoader).toHaveBeenCalledTimes(1);
    expect(freshLoader).toHaveBeenCalledTimes(1);
  });
});

function sessionSnapshot(organizationId: string) {
  return {
    user: { id: 'user-1' },
    activeContext: {
      contextType: 'organization' as const,
      organizationId,
      membershipId: `membership-${organizationId}`,
      role: 'Owner',
      permissions: ['customers.view'],
    },
  };
}
