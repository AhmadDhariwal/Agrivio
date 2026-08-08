import { describe, expect, it } from 'vitest';
import {
  API_AUTH_CSRF_PATH,
  API_AUTH_LOGIN_PATH,
  API_AUTH_SESSION_CONTEXT_PATH,
  API_AUTH_SESSION_PATH,
  API_CSRF_HEADER,
  API_ORGANIZATION_PATH,
  API_PLATFORM_ORGANIZATIONS_PATH,
} from '@agrivio/api-contracts';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from '../../app';
import { loadApiEnv } from '../../platform/config/runtime-config';
import { createMockDatabaseLifecycle } from '../../platform/database/mongo-connection';
import { getRequestContext } from '../../platform/http/request-context';
import { createOnboardingModule } from '../onboarding/onboarding.module';
import { createAuthModule } from './auth.module';
import { createBridgedAuthStore } from './auth.bridge-store';
import { hashPassword } from './password.service';
import { createRequirePermissionMiddleware } from './permission.middleware';

const here = fileURLToPath(new URL('.', import.meta.url));

describe('F02 Phase 3 active context and permissions', () => {
  it('selects authorized org/branch/warehouse context and rejects inaccessible selections', async () => {
    const { server, baseUrl, jar, authStore, onboarding, subscriptionStore } = await boot();

    try {
      const seeded = await seedMultiOrgUser(
        authStore,
        onboarding.store,
        {
          email: 'cashier@example.com',
          password: 'a-strong-passphrase',
          role: 'Cashier',
        },
        subscriptionStore,
      );

      const session = await login(baseUrl, jar, 'cashier@example.com', 'a-strong-passphrase');
      expect(session.activeContext.contextType).toBe('organization');
      expect(session.activeContext.organizationId).toBe(seeded.orgA);

      const valid = await switchContext(baseUrl, jar, {
        contextType: 'organization',
        membershipId: seeded.membershipA,
        branchId: 'branch-a1',
        warehouseId: 'wh-a1',
      });
      expect(valid.status).toBe(200);
      expect(valid.body.data.session.activeContext.branchId).toBe('branch-a1');
      expect(valid.body.data.session.activeContext.warehouseId).toBe('wh-a1');

      const badOrg = await switchContext(baseUrl, jar, {
        contextType: 'organization',
        organizationId: 'org-foreign',
      });
      expect(badOrg.status).toBe(403);

      const badBranch = await switchContext(baseUrl, jar, {
        contextType: 'organization',
        membershipId: seeded.membershipA,
        branchId: 'branch-other',
      });
      expect(badBranch.status).toBe(403);

      const badWarehouse = await switchContext(baseUrl, jar, {
        contextType: 'organization',
        membershipId: seeded.membershipA,
        warehouseId: 'wh-other',
      });
      expect(badWarehouse.status).toBe(403);

      const crossTenant = await switchContext(baseUrl, jar, {
        contextType: 'organization',
        membershipId: seeded.membershipA,
        branchId: 'branch-b1',
      });
      expect(crossTenant.status).toBe(403);

      const switchOrg = await switchContext(baseUrl, jar, {
        contextType: 'organization',
        membershipId: seeded.membershipB,
        branchId: 'branch-b1',
      });
      expect(switchOrg.status).toBe(200);
      expect(switchOrg.body.data.session.activeContext.organizationId).toBe(seeded.orgB);
      expect(switchOrg.body.data.session.activeContext.branchId).toBe('branch-b1');
      expect(switchOrg.body.data.session.activeContext.warehouseId).toBeUndefined();
    } finally {
      await close(server);
    }
  });

  it('fails immediately when membership is deactivated and clears inaccessible context on switch', async () => {
    const { server, baseUrl, jar, authStore, onboarding, subscriptionStore } = await boot();

    try {
      const seeded = await seedMultiOrgUser(
        authStore,
        onboarding.store,
        {
          email: 'member@example.com',
          password: 'a-strong-passphrase',
          role: 'Cashier',
        },
        subscriptionStore,
      );
      await login(baseUrl, jar, 'member@example.com', 'a-strong-passphrase');
      await switchContext(baseUrl, jar, {
        contextType: 'organization',
        membershipId: seeded.membershipA,
        branchId: 'branch-a1',
      });

      await authStore.updateMembership(null, seeded.membershipA, { status: 'deactivated' });

      const afterRevoke = await fetchJson(baseUrl, 'GET', API_AUTH_SESSION_PATH, undefined, {}, jar);
      expect(afterRevoke.status).toBe(401);

      const csrf = await fetchJson(baseUrl, 'POST', API_AUTH_CSRF_PATH, {}, {}, jar);
      const relogin = await fetchJson(
        baseUrl,
        'POST',
        API_AUTH_LOGIN_PATH,
        { email: 'member@example.com', password: 'a-strong-passphrase' },
        { [API_CSRF_HEADER]: csrf.body.data.csrfToken },
        jar,
      );
      expect(relogin.status).toBe(200);
      expect(relogin.body.data.session.activeContext.organizationId).toBe(seeded.orgB);

      const staleBranch = await switchContext(baseUrl, jar, {
        contextType: 'organization',
        membershipId: seeded.membershipB,
        branchId: 'branch-a1',
      });
      expect(staleBranch.status).toBe(403);
    } finally {
      await close(server);
    }
  });

  it('enforces permissions with stable 401/403 and Super Admin platform separation', async () => {
    const { server, baseUrl, jar, authStore, onboarding, subscriptionStore } = await boot();

    try {
      await seedMultiOrgUser(
        authStore,
        onboarding.store,
        {
          email: 'cashier@example.com',
          password: 'a-strong-passphrase',
          role: 'Cashier',
        },
        subscriptionStore,
      );
      await seedSuperAdmin(authStore, {
        email: 'admin@example.com',
        password: 'a-strong-passphrase',
      });
      await seedOwnerWithOrg(
        authStore,
        onboarding.store,
        {
          email: 'owner@example.com',
          password: 'a-strong-passphrase',
          organizationId: 'org-owner',
          organizationName: 'Owner Org',
        },
        subscriptionStore,
      );

      const unauthenticated = await fetchJson(
        baseUrl,
        'GET',
        API_ORGANIZATION_PATH,
        undefined,
        {},
        jar,
      );
      expect(unauthenticated.status).toBe(401);

      await login(baseUrl, jar, 'cashier@example.com', 'a-strong-passphrase');
      const cashierOrg = await fetchJson(baseUrl, 'GET', API_ORGANIZATION_PATH, undefined, {}, jar);
      expect(cashierOrg.status).toBe(200);

      const cashierPlatform = await fetchJson(
        baseUrl,
        'GET',
        API_PLATFORM_ORGANIZATIONS_PATH,
        undefined,
        {},
        jar,
      );
      expect(cashierPlatform.status).toBe(403);

      await login(baseUrl, jar, 'admin@example.com', 'a-strong-passphrase');
      const adminOrgWhilePlatform = await fetchJson(
        baseUrl,
        'GET',
        API_ORGANIZATION_PATH,
        undefined,
        {},
        jar,
      );
      expect(adminOrgWhilePlatform.status).toBe(403);

      const adminPlatform = await fetchJson(
        baseUrl,
        'GET',
        API_PLATFORM_ORGANIZATIONS_PATH,
        undefined,
        {},
        jar,
      );
      expect(adminPlatform.status).toBe(200);

      const deniedUnknown = createRequirePermissionMiddleware('totally.unknown.permission');
      let unknownStatus;
      await new Promise((resolve) => {
        deniedUnknown(
          { auth: {}, authContext: { permissions: ['organization.view'] } },
          {},
          (error) => {
            unknownStatus = error?.statusCode;
            resolve(undefined);
          },
        );
      });
      expect(unknownStatus).toBe(403);

      await login(baseUrl, jar, 'owner@example.com', 'a-strong-passphrase');
      const ownerOrg = await fetchJson(baseUrl, 'GET', API_ORGANIZATION_PATH, undefined, {}, jar);
      expect(ownerOrg.status).toBe(200);
      expect(ownerOrg.body.data.id).toBe('org-owner');
    } finally {
      await close(server);
    }
  });

  it('propagates authenticated request context for downstream modules', async () => {
    const express = (await import('express')).default;
    const { createRequestIdMiddleware } = await import(
      '../../platform/http/request-id.middleware.js'
    );
    const config = loadApiEnv({ NODE_ENV: 'test' });
    const onboarding = createOnboardingModule({ config, persistence: 'memory' });
    const authStore = createBridgedAuthStore({ identityStore: onboarding.store });
    const auth = createAuthModule({
      config,
      persistence: 'memory',
      store: authStore,
      onboardingService: onboarding.onboardingService,
    });

    // Minimal app so requireAuth can bind ALS before not-found handlers exist.
    const app = express();
    app.use(createRequestIdMiddleware());
    app.use(auth.middlewares.authTransport);

    let captured;
    app.get('/api/v1/__probe/context', auth.middlewares.requireAuth, (req, res) => {
      captured = {
        authContext: req.authContext,
        requestContext: req.requestContext,
        als: getRequestContext() ?? req.requestContext,
      };
      res.status(200).json({ ok: true });
    });

    const loginApp = createApp({
      config,
      database: createMockDatabaseLifecycle({ ready: true }),
      onboarding,
      auth,
    });
    const loginServer = createServer(loginApp);
    await listen(loginServer);
    const loginAddress = loginServer.address();
    if (loginAddress === null || typeof loginAddress === 'string') {
      throw new Error('Expected TCP port');
    }
    const loginBase = `http://127.0.0.1:${loginAddress.port}`;
    const jar = createCookieJar();

    const probeServer = createServer(app);
    await listen(probeServer);
    const probeAddress = probeServer.address();
    if (probeAddress === null || typeof probeAddress === 'string') {
      throw new Error('Expected TCP port');
    }
    const probeBase = `http://127.0.0.1:${probeAddress.port}`;

    try {
      await seedOwnerWithOrg(authStore, onboarding.store, {
        email: 'ctx@example.com',
        password: 'a-strong-passphrase',
        organizationId: 'org-ctx',
        organizationName: 'Context Org',
      });
      await login(loginBase, jar, 'ctx@example.com', 'a-strong-passphrase');

      const response = await fetchJson(
        probeBase,
        'GET',
        '/api/v1/__probe/context',
        undefined,
        {},
        jar,
      );
      expect(response.status).toBe(200);
      expect(captured.authContext.organizationId).toBe('org-ctx');
      expect(captured.authContext.permissions).toContain('organization.view');
      expect(captured.requestContext.organizationId).toBe('org-ctx');
      expect(captured.als.organizationId).toBe('org-ctx');
      expect(captured.als.authContext.userId).toBeTruthy();
    } finally {
      await close(loginServer);
      await close(probeServer);
    }
  });

  it('keeps API permission enforcement independent of frontend UI checks', () => {
    const routesPath = join(here, '../organizations/organization.routes.js');
    const source = readFileSync(routesPath, 'utf8');
    expect(source).toContain("createRequirePermissionMiddleware('organization.view')");
    expect(source).toContain('createRequireOrganizationContextMiddleware');
    expect(source).toContain('requireBillingAccess');
  });
});

async function boot() {
  const config = loadApiEnv({ NODE_ENV: 'test' });
  const onboarding = createOnboardingModule({
    config,
    persistence: 'memory',
  });
  const authStore = createBridgedAuthStore({ identityStore: onboarding.store });
  const auth = createAuthModule({
    config,
    persistence: 'memory',
    store: authStore,
    onboardingService: onboarding.onboardingService,
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
    auth,
    onboarding,
    subscriptionStore: app.agrivio.subscriptions.store,
  };
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

async function switchContext(baseUrl, jar, body) {
  const csrf = await fetchJson(baseUrl, 'POST', API_AUTH_CSRF_PATH, {}, {}, jar);
  return fetchJson(
    baseUrl,
    'POST',
    API_AUTH_SESSION_CONTEXT_PATH,
    body,
    { [API_CSRF_HEADER]: csrf.body.data.csrfToken },
    jar,
  );
}

async function seedOrganization(orgStore, input) {
  await orgStore.insertOrganization(null, {
    _id: input.organizationId,
    name: input.name,
    nameNormalized: input.name.toLowerCase(),
    timezone: 'Asia/Karachi',
    status: 'approved',
    applicantFingerprint: `fp-${input.organizationId}`,
    ownerUserId: input.ownerUserId,
    version: 1,
  });
}

async function seedMultiOrgUser(authStore, orgStore, input, subscriptionStore) {
  const passwordHash = await hashPassword(input.password);
  const user = await authStore.insertUser(null, {
    email: input.email,
    emailNormalized: input.email,
    displayName: 'Member',
    passwordHash,
    status: 'active',
    platformAccess: null,
    version: 1,
  });

  await seedOrganization(orgStore, {
    organizationId: 'org-a',
    name: 'Org A',
    ownerUserId: user['_id'],
  });
  await seedOrganization(orgStore, {
    organizationId: 'org-b',
    name: 'Org B',
    ownerUserId: user['_id'],
  });

  const membershipA = await authStore.insertMembership(null, {
    organizationId: 'org-a',
    userId: user['_id'],
    role: input.role,
    status: 'active',
    conditionalPermissionGrants: [],
    version: 1,
  });
  const membershipB = await authStore.insertMembership(null, {
    organizationId: 'org-b',
    userId: user['_id'],
    role: input.role,
    status: 'active',
    conditionalPermissionGrants: [],
    version: 1,
  });

  await authStore.insertAccessAssignment(null, {
    organizationId: 'org-a',
    membershipId: membershipA['_id'],
    assignmentType: 'branch',
    targetId: 'branch-a1',
    status: 'active',
    version: 1,
  });
  await authStore.insertAccessAssignment(null, {
    organizationId: 'org-a',
    membershipId: membershipA['_id'],
    assignmentType: 'warehouse',
    targetId: 'wh-a1',
    status: 'active',
    version: 1,
  });
  await authStore.insertAccessAssignment(null, {
    organizationId: 'org-b',
    membershipId: membershipB['_id'],
    assignmentType: 'branch',
    targetId: 'branch-b1',
    status: 'active',
    version: 1,
  });

  if (subscriptionStore !== undefined) {
    await seedTrialSubscription(subscriptionStore, 'org-a');
    await seedTrialSubscription(subscriptionStore, 'org-b');
  }

  return {
    user,
    orgA: 'org-a',
    orgB: 'org-b',
    membershipA: String(membershipA['_id']),
    membershipB: String(membershipB['_id']),
  };
}

async function seedSuperAdmin(authStore, input) {
  const passwordHash = await hashPassword(input.password);
  return authStore.insertUser(null, {
    email: input.email,
    emailNormalized: input.email,
    displayName: 'Super Admin',
    passwordHash,
    status: 'active',
    platformAccess: 'super_admin',
    version: 1,
  });
}

async function seedOwnerWithOrg(authStore, orgStore, input, subscriptionStore) {
  const passwordHash = await hashPassword(input.password);
  const user = await authStore.insertUser(null, {
    email: input.email,
    emailNormalized: input.email,
    displayName: 'Owner',
    passwordHash,
    status: 'active',
    platformAccess: null,
    version: 1,
  });
  await seedOrganization(orgStore, {
    organizationId: input.organizationId,
    name: input.organizationName,
    ownerUserId: user['_id'],
  });
  await authStore.insertMembership(null, {
    organizationId: input.organizationId,
    userId: user['_id'],
    role: 'Owner',
    status: 'active',
    conditionalPermissionGrants: [],
    version: 1,
  });
  if (subscriptionStore !== undefined) {
    await seedTrialSubscription(subscriptionStore, input.organizationId);
  }
  return user;
}

async function seedTrialSubscription(subscriptionStore, organizationId) {
  await subscriptionStore.insertSubscription(null, {
    organizationId,
    status: 'trial',
    planCode: 'Starter',
    planVersion: 1,
    trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
    version: 1,
  });
}

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
