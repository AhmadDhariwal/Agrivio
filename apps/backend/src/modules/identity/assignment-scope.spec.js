import { describe, expect, it } from 'vitest';
import express from 'express';
import { createServer } from 'node:http';
import {
  API_AUTH_CSRF_PATH,
  API_AUTH_LOGIN_PATH,
  API_CSRF_HEADER,
  ApiTransportErrorCode,
} from '@agrivio/api-contracts';
import { createApp } from '../../app';
import { loadApiEnv } from '../../platform/config/runtime-config';
import { createMockDatabaseLifecycle } from '../../platform/database/mongo-connection';
import { createOnboardingModule } from '../onboarding/onboarding.module';
import { createAuthModule } from './auth.module';
import { createBridgedAuthStore } from './auth.bridge-store';
import { hashPassword } from './password.service';
import {
  assertBranchAccess,
  assertWarehouseAccess,
  canAccessBranch,
  canAccessWarehouse,
  isOrganizationWideRole,
} from './assignment-scope.js';
import {
  createRequireBranchAccessMiddleware,
  createRequirePermissionMiddleware,
  createRequireWarehouseAccessMiddleware,
} from './permission.middleware.js';
import { permissionsForMembershipRole } from './role-permissions.js';

describe('assignment scope enforcement foundation', () => {
  it('allows Owner organization-wide access and denies unassigned Cashier targets', () => {
    const ownerContext = {
      contextType: 'organization',
      organizationId: 'org-1',
      role: 'Owner',
      branchAssignments: [],
      warehouseAssignments: [],
      permissions: permissionsForMembershipRole('Owner'),
    };
    expect(isOrganizationWideRole('Owner')).toBe(true);
    expect(canAccessBranch(ownerContext, 'any-branch')).toBe(true);
    expect(canAccessWarehouse(ownerContext, 'any-wh')).toBe(true);
    assertBranchAccess(ownerContext, 'any-branch');
    assertWarehouseAccess(ownerContext, 'any-wh');

    const cashierContext = {
      contextType: 'organization',
      organizationId: 'org-1',
      role: 'Cashier',
      branchAssignments: [{ targetId: 'branch-a', organizationId: 'org-1' }],
      warehouseAssignments: [{ targetId: 'wh-a', organizationId: 'org-1' }],
      permissions: permissionsForMembershipRole('Cashier'),
    };
    expect(canAccessBranch(cashierContext, 'branch-a')).toBe(true);
    expect(canAccessBranch(cashierContext, 'branch-b')).toBe(false);
    expect(canAccessWarehouse(cashierContext, 'wh-a')).toBe(true);
    expect(canAccessWarehouse(cashierContext, 'wh-b')).toBe(false);

    try {
      assertBranchAccess(cashierContext, 'branch-b');
      expect.unreachable('expected branch denial');
    } catch (error) {
      expect(error).toMatchObject({
        code: ApiTransportErrorCode.Forbidden,
      });
    }

    try {
      assertWarehouseAccess(cashierContext, 'wh-b');
      expect.unreachable('expected warehouse denial');
    } catch (error) {
      expect(error).toMatchObject({
        code: ApiTransportErrorCode.Forbidden,
      });
    }

    const crossTenant = {
      ...cashierContext,
      branchAssignments: [{ targetId: 'branch-a', organizationId: 'org-other' }],
    };
    expect(canAccessBranch(crossTenant, 'branch-a')).toBe(false);
  });

  it('enforces permission plus assignment on HTTP handlers and rejects revoked membership', async () => {
    const config = loadApiEnv({ NODE_ENV: 'test' });
    const onboarding = createOnboardingModule({ config, persistence: 'memory' });
    const authStore = createBridgedAuthStore({ identityStore: onboarding.store });
    const auth = createAuthModule({
      config,
      persistence: 'memory',
      store: authStore,
      onboardingService: onboarding.onboardingService,
    });

    const seeded = await seedCashier(authStore, onboarding.store);
    const app = express();
    app.use(auth.middlewares.authTransport);
    app.get(
      '/api/v1/__probe/branches/:branchId',
      auth.middlewares.requireAuth,
      auth.middlewares.requireOrganizationContext,
      createRequirePermissionMiddleware('branches.view'),
      createRequireBranchAccessMiddleware(),
      (req, res) => {
        res.status(200).json({
          ok: true,
          branchId: req.params.branchId,
          organizationId: req.authContext.organizationId,
        });
      },
    );
    app.get(
      '/api/v1/__probe/warehouses/:warehouseId',
      auth.middlewares.requireAuth,
      auth.middlewares.requireOrganizationContext,
      createRequirePermissionMiddleware('warehouses.view'),
      createRequireWarehouseAccessMiddleware(),
      (req, res) => {
        res.status(200).json({
          ok: true,
          warehouseId: req.params.warehouseId,
        });
      },
    );
    app.get(
      '/api/v1/__probe/inventory-adjust/:warehouseId',
      auth.middlewares.requireAuth,
      auth.middlewares.requireOrganizationContext,
      createRequirePermissionMiddleware('inventory.adjust'),
      createRequireWarehouseAccessMiddleware(),
      (_req, res) => {
        res.status(200).json({ ok: true });
      },
    );
    app.use((error, _req, res, next) => {
      void next;
      res.status(error.statusCode ?? 500).json({
        error: { code: error.code ?? 'INTERNAL_ERROR', message: error.message },
      });
    });

    const loginApp = createApp({
      config,
      database: createMockDatabaseLifecycle({ ready: true }),
      onboarding,
      auth,
    });
    const loginServer = createServer(loginApp);
    await listen(loginServer);
    const probeServer = createServer(app);
    await listen(probeServer);

    const loginBase = baseUrlOf(loginServer);
    const probeBase = baseUrlOf(probeServer);
    const jar = createCookieJar();

    try {
      await login(loginBase, jar, 'cashier@example.com', 'a-strong-passphrase');

      const allowedBranch = await fetchJson(
        probeBase,
        'GET',
        `/api/v1/__probe/branches/${seeded.branchId}`,
        undefined,
        {},
        jar,
      );
      expect(allowedBranch.status).toBe(200);

      const deniedBranch = await fetchJson(
        probeBase,
        'GET',
        '/api/v1/__probe/branches/branch-denied',
        undefined,
        {},
        jar,
      );
      expect(deniedBranch.status).toBe(403);

      const allowedWh = await fetchJson(
        probeBase,
        'GET',
        `/api/v1/__probe/warehouses/${seeded.warehouseId}`,
        undefined,
        {},
        jar,
      );
      expect(allowedWh.status).toBe(200);

      const deniedWh = await fetchJson(
        probeBase,
        'GET',
        '/api/v1/__probe/warehouses/wh-denied',
        undefined,
        {},
        jar,
      );
      expect(deniedWh.status).toBe(403);

      // Cashier lacks inventory.adjust by default even for assigned warehouse.
      const permissionDenied = await fetchJson(
        probeBase,
        'GET',
        `/api/v1/__probe/inventory-adjust/${seeded.warehouseId}`,
        undefined,
        {},
        jar,
      );
      expect(permissionDenied.status).toBe(403);

      await authStore.updateMembership(null, seeded.membershipId, { status: 'deactivated' });
      const revoked = await fetchJson(
        probeBase,
        'GET',
        `/api/v1/__probe/branches/${seeded.branchId}`,
        undefined,
        {},
        jar,
      );
      expect(revoked.status).toBe(401);
    } finally {
      await close(loginServer);
      await close(probeServer);
    }
  });

  it('allows Owner through assignment middleware without explicit assignments', async () => {
    const config = loadApiEnv({ NODE_ENV: 'test' });
    const onboarding = createOnboardingModule({ config, persistence: 'memory' });
    const authStore = createBridgedAuthStore({ identityStore: onboarding.store });
    const auth = createAuthModule({
      config,
      persistence: 'memory',
      store: authStore,
      onboardingService: onboarding.onboardingService,
    });
    await seedOwner(authStore, onboarding.store);

    const app = express();
    app.use(auth.middlewares.authTransport);
    app.get(
      '/api/v1/__probe/branches/:branchId',
      auth.middlewares.requireAuth,
      auth.middlewares.requireOrganizationContext,
      createRequirePermissionMiddleware('branches.view'),
      createRequireBranchAccessMiddleware(),
      (_req, res) => res.status(200).json({ ok: true }),
    );
    app.use((error, _req, res, next) => {
      void next;
      res.status(error.statusCode ?? 500).json({
        error: { code: error.code ?? 'INTERNAL_ERROR', message: error.message },
      });
    });

    const loginApp = createApp({
      config,
      database: createMockDatabaseLifecycle({ ready: true }),
      onboarding,
      auth,
    });
    const loginServer = createServer(loginApp);
    await listen(loginServer);
    const probeServer = createServer(app);
    await listen(probeServer);
    const jar = createCookieJar();

    try {
      await login(baseUrlOf(loginServer), jar, 'owner@example.com', 'a-strong-passphrase');
      const response = await fetchJson(
        baseUrlOf(probeServer),
        'GET',
        '/api/v1/__probe/branches/unlisted-branch',
        undefined,
        {},
        jar,
      );
      expect(response.status).toBe(200);
    } finally {
      await close(loginServer);
      await close(probeServer);
    }
  });
});

async function seedCashier(authStore, orgStore) {
  const passwordHash = await hashPassword('a-strong-passphrase');
  const user = await authStore.insertUser(null, {
    email: 'cashier@example.com',
    emailNormalized: 'cashier@example.com',
    displayName: 'Cashier',
    passwordHash,
    status: 'active',
    platformAccess: null,
    version: 1,
  });
  await orgStore.insertOrganization(null, {
    _id: 'org-assign',
    name: 'Assign Org',
    nameNormalized: 'assign org',
    timezone: 'Asia/Karachi',
    status: 'approved',
    applicantFingerprint: 'fp-assign',
    ownerUserId: user['_id'],
    version: 1,
  });
  const membership = await authStore.insertMembership(null, {
    organizationId: 'org-assign',
    userId: user['_id'],
    role: 'Cashier',
    status: 'active',
    conditionalPermissionGrants: [],
    version: 1,
  });
  await authStore.insertAccessAssignment(null, {
    organizationId: 'org-assign',
    membershipId: membership['_id'],
    assignmentType: 'branch',
    targetId: 'branch-a',
    status: 'active',
    version: 1,
  });
  await authStore.insertAccessAssignment(null, {
    organizationId: 'org-assign',
    membershipId: membership['_id'],
    assignmentType: 'warehouse',
    targetId: 'wh-a',
    status: 'active',
    version: 1,
  });
  return {
    membershipId: String(membership['_id']),
    branchId: 'branch-a',
    warehouseId: 'wh-a',
  };
}

async function seedOwner(authStore, orgStore) {
  const passwordHash = await hashPassword('a-strong-passphrase');
  const user = await authStore.insertUser(null, {
    email: 'owner@example.com',
    emailNormalized: 'owner@example.com',
    displayName: 'Owner',
    passwordHash,
    status: 'active',
    platformAccess: null,
    version: 1,
  });
  await orgStore.insertOrganization(null, {
    _id: 'org-owner-assign',
    name: 'Owner Org',
    nameNormalized: 'owner org',
    timezone: 'Asia/Karachi',
    status: 'approved',
    applicantFingerprint: 'fp-owner-assign',
    ownerUserId: user['_id'],
    version: 1,
  });
  await authStore.insertMembership(null, {
    organizationId: 'org-owner-assign',
    userId: user['_id'],
    role: 'Owner',
    status: 'active',
    conditionalPermissionGrants: [],
    version: 1,
  });
}

async function login(baseUrl, jar, email, password) {
  const csrf = await fetchJson(baseUrl, 'POST', API_AUTH_CSRF_PATH, {}, {}, jar);
  const response = await fetchJson(
    baseUrl,
    'POST',
    API_AUTH_LOGIN_PATH,
    { email, password },
    { [API_CSRF_HEADER]: csrf.body.data.csrfToken },
    jar,
  );
  expect(response.status).toBe(200);
  return response.body.data.session;
}

function createCookieJar() {
  const cookies = new Map();
  return {
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

function baseUrlOf(server) {
  const address = server.address();
  if (address === null || typeof address === 'string') {
    throw new Error('Expected TCP port');
  }
  return `http://127.0.0.1:${address.port}`;
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
  const json = await response.json().catch(() => ({}));
  return { status: response.status, body: json };
}
