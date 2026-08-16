import { describe, expect, it } from 'vitest';
import {
  API_AUTH_CSRF_PATH,
  API_AUTH_LOGIN_PATH,
  API_AUTH_NAVIGATION_PREFERENCES_PATH,
  API_CSRF_HEADER,
} from '@agrivio/api-contracts';
import { createServer } from 'node:http';
import { createApp } from '../../app';
import { loadApiEnv } from '../../platform/config/runtime-config';
import { createMockDatabaseLifecycle } from '../../platform/database/mongo-connection';
import { createOnboardingModule } from '../onboarding/onboarding.module';
import { createAuthModule } from './auth.module';
import { createBridgedAuthStore } from './auth.bridge-store';
import {
  validateHiddenItemIds,
  createNavigationPreferencesService,
} from './navigation-preferences.service';
import { hashPassword } from './password.service';

function createCookieJar() {
  const cookies = new Map();
  return {
    get(name) {
      return cookies.get(name);
    },
    absorb(headers) {
      const raw = headers.getSetCookie?.() ?? [];
      for (const entry of raw) {
        const [pair] = entry.split(';');
        const index = pair.indexOf('=');
        if (index > 0) {
          cookies.set(pair.slice(0, index), decodeURIComponent(pair.slice(index + 1)));
        }
      }
    },
    header() {
      return [...cookies.entries()].map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('; ');
    },
  };
}

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(undefined));
  });
}

function close(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve(undefined)));
  });
}

async function fetchJson(baseUrl, method, path, body, headers = {}, jar) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(jar === undefined ? {} : { cookie: jar.header() }),
      ...headers,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  jar?.absorb(response.headers);
  const json = await response.json();
  return { status: response.status, body: json };
}

async function boot(options = {}) {
  const config = loadApiEnv({ NODE_ENV: 'test' });
  const onboarding = createOnboardingModule({
    config,
    persistence: 'memory',
    ...(options.now === undefined ? {} : { now: options.now }),
  });
  const authStore = createBridgedAuthStore({ identityStore: onboarding.store });

  const prefStore = new Map();
  const mockPrefModel = {
    findOne(query) {
      return {
        lean() {
          return {
            async exec() {
              const key = `${query.userId}:${query.contextType}:${query.organizationId}`;
              return prefStore.get(key) || null;
            },
          };
        },
      };
    },
    findOneAndUpdate(filter, update) {
      return {
        lean() {
          return {
            async exec() {
              const key = `${filter.userId}:${filter.contextType}:${filter.organizationId}`;
              const record = {
                userId: filter.userId,
                contextType: filter.contextType,
                organizationId: filter.organizationId,
                hiddenItemIds: update.$set.hiddenItemIds,
                groupOrder: update.$set.groupOrder ?? [],
                itemOrderByGroup: update.$set.itemOrderByGroup ?? {},
              };
              prefStore.set(key, record);
              return record;
            },
          };
        },
      };
    },
  };

  const navigationPreferencesService = createNavigationPreferencesService({
    NavigationPreferenceModel: mockPrefModel,
  });

  const auth = createAuthModule({
    config,
    persistence: 'memory',
    store: authStore,
    onboardingService: onboarding.onboardingService,
    navigationPreferencesService,
    ...(options.now === undefined ? {} : { now: options.now }),
  });
  const app = createApp({
    config,
    database: createMockDatabaseLifecycle({ ready: true }),
    onboarding,
    auth,
  });
  const server = createServer(app);
  await listen(server);
  const address = server.address();
  if (address === null || typeof address === 'string') {
    throw new Error('Expected TCP port');
  }
  return {
    server,
    baseUrl: `http://127.0.0.1:${address.port}`,
    jar: createCookieJar(),
    authStore,
  };
}

async function seedUser(authStore, input) {
  const passwordHash = await hashPassword(input.password);
  const user = await authStore.insertUser(null, {
    email: input.email,
    emailNormalized: input.email,
    displayName: input.displayName ?? 'User',
    passwordHash,
    status: input.status ?? 'active',
    platformAccess: input.platformAccess ?? null,
    version: 1,
  });
  if (input.role) {
    await authStore.insertMembership(null, {
      organizationId: input.organizationId ?? 'org-1',
      userId: user['_id'],
      role: input.role,
      status: 'active',
      conditionalPermissionGrants: [],
      version: 1,
    });
  }
  return user;
}

describe('Navigation preferences service & validation', () => {
  it('validates hidden item IDs format, max length, characters, and deduplication', () => {
    expect(() => validateHiddenItemIds('not-an-array')).toThrow();
    expect(() => validateHiddenItemIds(Array(201).fill('item'))).toThrow();
    expect(() => validateHiddenItemIds(['valid.id', ''])).toThrow();
    expect(() => validateHiddenItemIds(['valid.id', 'x'.repeat(101)])).toThrow();
    expect(() => validateHiddenItemIds(['valid.id', 'bad<script>'])).toThrow();

    const cleaned = validateHiddenItemIds([
      'sales.new',
      'inventory.adjustments',
      'sales.new',
      'reports.view',
    ]);
    expect(cleaned).toEqual(['sales.new', 'inventory.adjustments', 'reports.view']);
  });

  it('validates groupOrder and itemOrderByGroup, ignoring duplicate IDs', () => {
    const { validateGroupOrder, validateItemOrderByGroup } = require('./navigation-preferences.service');
    expect(() => validateGroupOrder({ not: 'array' })).toThrow();
    expect(validateGroupOrder(['inventory', 'sales', 'inventory'])).toEqual(['inventory', 'sales']);
    expect(() => validateItemOrderByGroup(['nope'])).toThrow();
    expect(
      validateItemOrderByGroup({
        inventory: ['inventory.stock', 'inventory.stock', 'inventory.batches'],
      }),
    ).toEqual({
      inventory: ['inventory.stock', 'inventory.batches'],
    });
  });

  it('in-memory model isolation for user and organization context', async () => {
    const store = new Map();
    const mockModel = {
      findOne(query) {
        return {
          lean() {
            return {
              async exec() {
                const key = `${query.userId}:${query.contextType}:${query.organizationId}`;
                return store.get(key) || null;
              },
            };
          },
        };
      },
      findOneAndUpdate(filter, update) {
        return {
          lean() {
            return {
              async exec() {
                const key = `${filter.userId}:${filter.contextType}:${filter.organizationId}`;
                const record = {
                  userId: filter.userId,
                  contextType: filter.contextType,
                  organizationId: filter.organizationId,
                  hiddenItemIds: update.$set.hiddenItemIds,
                  groupOrder: update.$set.groupOrder ?? [],
                  itemOrderByGroup: update.$set.itemOrderByGroup ?? {},
                };
                store.set(key, record);
                return record;
              },
            };
          },
        };
      },
    };

    const service = createNavigationPreferencesService({ NavigationPreferenceModel: mockModel });

    const userA = { user: { id: 'user-A' } };
    const userB = { user: { id: 'user-B' } };
    const org1Context = { contextType: 'organization', organizationId: 'org-1' };
    const org2Context = { contextType: 'organization', organizationId: 'org-2' };
    const platformContext = { contextType: 'platform', organizationId: undefined };

    // Default when none exists
    const defA = await service.getPreferences(userA, org1Context);
    expect(defA.hiddenItemIds).toEqual([]);
    expect(defA.groupOrder).toEqual([]);
    expect(defA.itemOrderByGroup).toEqual({});

    // User A updates preferences in Org 1
    await service.updatePreferences(userA, org1Context, {
      hiddenItemIds: ['inventory.stock', 'sales.new'],
    });

    // User A in Org 2 has separate preferences
    const prefAOrg2 = await service.getPreferences(userA, org2Context);
    expect(prefAOrg2.hiddenItemIds).toEqual([]);

    // User A in Platform context has separate preferences
    const prefAPlat = await service.getPreferences(userA, platformContext);
    expect(prefAPlat.hiddenItemIds).toEqual([]);

    // User B in Org 1 has separate preferences (cannot see User A's hidden items)
    const prefBOrg1 = await service.getPreferences(userB, org1Context);
    expect(prefBOrg1.hiddenItemIds).toEqual([]);

    // User A in Org 1 still has their saved preferences
    const prefAOrg1 = await service.getPreferences(userA, org1Context);
    expect(prefAOrg1.hiddenItemIds).toEqual(['inventory.stock', 'sales.new']);
    expect(prefAOrg1.groupOrder).toEqual([]);
    expect(prefAOrg1.itemOrderByGroup).toEqual({});

    await service.updatePreferences(userA, org1Context, {
      hiddenItemIds: ['inventory.stock'],
      groupOrder: ['inventory', 'sales', 'unknown.stale'],
      itemOrderByGroup: { inventory: ['inventory.batches', 'inventory.stock'] },
    });
    const ordered = await service.getPreferences(userA, org1Context);
    expect(ordered.groupOrder).toEqual(['inventory', 'sales', 'unknown.stale']);
    expect(ordered.itemOrderByGroup).toEqual({
      inventory: ['inventory.batches', 'inventory.stock'],
    });
  });
});

describe('Navigation preferences HTTP endpoints', () => {
  it('enforces authentication and CSRF, and stores preferences scoped to session context', async () => {
    const { server, baseUrl, jar, authStore } = await boot();

    try {
      await seedUser(authStore, {
        email: 'usera@example.com',
        password: 'Password123!',
        displayName: 'User A',
        role: 'Owner',
        organizationId: 'org-1',
      });

      await seedUser(authStore, {
        email: 'userb@example.com',
        password: 'Password123!',
        displayName: 'User B',
        role: 'Cashier',
        organizationId: 'org-1',
      });

      // Unauthenticated request fails with 401
      const unauthGet = await fetchJson(baseUrl, 'GET', API_AUTH_NAVIGATION_PREFERENCES_PATH);
      expect(unauthGet.status).toBe(401);

      // Login User A
      const csrfA = await fetchJson(baseUrl, 'POST', API_AUTH_CSRF_PATH, {}, {}, jar);
      const loginA = await fetchJson(
        baseUrl,
        'POST',
        API_AUTH_LOGIN_PATH,
        { email: 'usera@example.com', password: 'Password123!' },
        { [API_CSRF_HEADER]: csrfA.body.data.csrfToken },
        jar,
      );
      expect(loginA.status).toBe(200);

      // User A gets default preferences
      const getA = await fetchJson(
        baseUrl,
        'GET',
        API_AUTH_NAVIGATION_PREFERENCES_PATH,
        undefined,
        {},
        jar,
      );
      expect(getA.status).toBe(200);
      expect(getA.body.data.hiddenItemIds).toEqual([]);
      expect(getA.body.data.groupOrder).toEqual([]);
      expect(getA.body.data.itemOrderByGroup).toEqual({});

      // User A updates preferences without CSRF -> fails with 403
      const putNoCsrf = await fetchJson(
        baseUrl,
        'PUT',
        API_AUTH_NAVIGATION_PREFERENCES_PATH,
        { hiddenItemIds: ['inventory.stock', 'sales.history'] },
        {},
        jar,
      );
      expect(putNoCsrf.status).toBe(403);

      // User A updates preferences with valid CSRF
      const putA = await fetchJson(
        baseUrl,
        'PUT',
        API_AUTH_NAVIGATION_PREFERENCES_PATH,
        { hiddenItemIds: ['inventory.stock', 'sales.history'] },
        { [API_CSRF_HEADER]: loginA.body.data.csrfToken },
        jar,
      );
      expect(putA.status).toBe(200);
      expect(putA.body.data.hiddenItemIds).toEqual(['inventory.stock', 'sales.history']);
      expect(putA.body.data.groupOrder).toEqual([]);
      expect(putA.body.data.itemOrderByGroup).toEqual({});

      // User A submits invalid payload (bad character) -> fails with 400
      const putInvalid = await fetchJson(
        baseUrl,
        'PUT',
        API_AUTH_NAVIGATION_PREFERENCES_PATH,
        { hiddenItemIds: ['invalid<script>'] },
        { [API_CSRF_HEADER]: loginA.body.data.csrfToken },
        jar,
      );
      expect(putInvalid.status).toBe(400);

      // Login User B in separate jar
      const jarB = createCookieJar();
      const csrfB = await fetchJson(baseUrl, 'POST', API_AUTH_CSRF_PATH, {}, {}, jarB);
      const loginB = await fetchJson(
        baseUrl,
        'POST',
        API_AUTH_LOGIN_PATH,
        { email: 'userb@example.com', password: 'Password123!' },
        { [API_CSRF_HEADER]: csrfB.body.data.csrfToken },
        jarB,
      );
      expect(loginB.status).toBe(200);

      // User B gets their own preferences (empty default, not User A's)
      const getB = await fetchJson(
        baseUrl,
        'GET',
        API_AUTH_NAVIGATION_PREFERENCES_PATH,
        undefined,
        {},
        jarB,
      );
      expect(getB.status).toBe(200);
      expect(getB.body.data.hiddenItemIds).toEqual([]);
    } finally {
      await close(server);
    }
  });
});
