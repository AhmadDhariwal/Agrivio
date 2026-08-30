import { describe, expect, it } from 'vitest';
import {
  API_AUTH_CSRF_PATH,
  API_AUTH_LOGIN_PATH,
  API_AUTH_LOGOUT_PATH,
  API_AUTH_SESSION_CONTEXT_PATH,
  API_AUTH_SESSION_PATH,
  API_CSRF_HEADER,
  API_ORGANIZATION_ACTIVATION_REQUESTS_PATH,
  API_ORGANIZATION_PATH,
  API_PLATFORM_ORGANIZATIONS_PATH,
  API_PLATFORM_SUBSCRIPTION_PLANS_PATH,
  API_PLATFORM_SUBSCRIPTIONS_PATH,
  API_SUBSCRIPTION_BILLING_EVIDENCE_PATH,
  API_SUBSCRIPTION_BILLING_RECORDS_PATH,
  API_SUBSCRIPTION_PATH,
  API_PLATFORM_ACTOR_HEADER,
  ApiTransportErrorCode,
} from '@agrivio/api-contracts';
import { createServer } from 'node:http';
import { Router } from 'express';
import { createApp } from '../../app';
import { loadApiEnv } from '../../platform/config/runtime-config';
import { createMockDatabaseLifecycle } from '../../platform/database/mongo-connection';
import { createRequirePermissionMiddleware } from './permission.middleware';
import { hashPassword } from './password.service';

/**
 * R1-F02-014 — attack-style cross-tenant and platform-context suite.
 * Uses currently implemented routes only (no invented F03/F04 endpoints).
 */
describe('R1-F02-014 tenant isolation and platform context attacks', () => {
  it('blocks cross-tenant reads/mutations, context escalation, CSRF gaps, and suspension writes', async () => {
    const { server, baseUrl, jar, authStore, onboarding, subscriptionStore, subscriptions } =
      await boot({ registerProbes: true });

    try {
      await seedPlan(baseUrl, jar);

      const orgA = await createApprovedOwner(baseUrl, jar, {
        organizationName: 'Isolation Org A',
        ownerEmail: 'owner-a@example.com',
        password: 'a-strong-passphrase',
      });
      const orgB = await createApprovedOwner(baseUrl, jar, {
        organizationName: 'Isolation Org B',
        ownerEmail: 'owner-b@example.com',
        password: 'a-strong-passphrase',
      });

      await seedCashier(authStore, onboarding.store, {
        email: 'cashier-a@example.com',
        password: 'a-strong-passphrase',
        organizationId: orgA.organizationId,
        branchId: 'branch-a1',
        warehouseId: 'wh-a1',
      });
      await seedCashier(authStore, onboarding.store, {
        email: 'cashier-b@example.com',
        password: 'a-strong-passphrase',
        organizationId: orgB.organizationId,
        branchId: 'branch-b1',
        warehouseId: 'wh-b1',
      });
      await seedSuperAdmin(authStore, {
        email: 'platform@example.com',
        password: 'a-strong-passphrase',
      });
      await seedTrialSubscription(subscriptionStore, orgA.organizationId);
      await seedTrialSubscription(subscriptionStore, orgB.organizationId);

      // Org A cannot read Org B data through session-scoped organization API.
      await login(baseUrl, jar, 'owner-a@example.com', 'a-strong-passphrase');
      const readA = await fetchJson(baseUrl, 'GET', API_ORGANIZATION_PATH, undefined, {}, jar);
      expect(readA.status).toBe(200);
      expect(readA.body.data.id).toBe(orgA.organizationId);

      // Membership/context identifiers cannot be changed to gain another organization.
      const stealContext = await switchContext(baseUrl, jar, {
        contextType: 'organization',
        organizationId: orgB.organizationId,
        membershipId: orgB.membershipId,
      });
      expect(stealContext.status).toBe(403);

      // Branch/warehouse assignments cannot be used across tenants.
      await login(baseUrl, jar, 'cashier-a@example.com', 'a-strong-passphrase');
      const crossBranch = await fetchJson(
        baseUrl,
        'GET',
        '/api/v1/__probe/branches/branch-b1',
        undefined,
        {},
        jar,
      );
      expect(crossBranch.status).toBe(403);
      const crossWarehouse = await fetchJson(
        baseUrl,
        'POST',
        '/api/v1/__probe/warehouses/wh-b1',
        { note: 'cross' },
        { [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar) },
        jar,
      );
      expect(crossWarehouse.status).toBe(403);

      // Organization context cannot invoke platform-only administration.
      const orgPlatform = await fetchJson(
        baseUrl,
        'GET',
        API_PLATFORM_ORGANIZATIONS_PATH,
        undefined,
        {},
        jar,
      );
      expect(orgPlatform.status).toBe(403);
      const orgPlans = await fetchJson(
        baseUrl,
        'GET',
        API_PLATFORM_SUBSCRIPTION_PLANS_PATH,
        undefined,
        {},
        jar,
      );
      expect(orgPlans.status).toBe(403);

      // Platform context does not accidentally inherit organization permissions.
      await login(baseUrl, jar, 'platform@example.com', 'a-strong-passphrase');
      const platformOrg = await fetchJson(
        baseUrl,
        'GET',
        API_ORGANIZATION_PATH,
        undefined,
        {},
        jar,
      );
      expect(platformOrg.status).toBe(403);
      const platformList = await fetchJson(
        baseUrl,
        'GET',
        API_PLATFORM_ORGANIZATIONS_PATH,
        undefined,
        {},
        jar,
      );
      expect(platformList.status).toBe(200);

      // Organization role does not gain platform permissions.
      await login(baseUrl, jar, 'owner-a@example.com', 'a-strong-passphrase');
      const ownerPlatform = await fetchJson(
        baseUrl,
        'GET',
        API_PLATFORM_ORGANIZATIONS_PATH,
        undefined,
        {},
        jar,
      );
      expect(ownerPlatform.status).toBe(403);

      // Unknown permissions remain default-deny.
      const unknown = createRequirePermissionMiddleware('totally.unknown.permission');
      let unknownStatus;
      await new Promise((resolve) => {
        unknown(
          {
            auth: {},
            authContext: { permissions: ['organization.view'] },
          },
          {},
          (error) => {
            unknownStatus = error?.statusCode;
            resolve(undefined);
          },
        );
      });
      expect(unknownStatus).toBe(403);

      // Direct API calls cannot bypass Angular permission hiding (Owner lacks imports entitlement probe permission path).
      const cashierProbe = await login(baseUrl, jar, 'cashier-a@example.com', 'a-strong-passphrase');
      expect(cashierProbe.activeContext.permissions).not.toContain('organization.update');
      const deniedWrite = await fetchJson(
        baseUrl,
        'POST',
        '/api/v1/__probe/operational',
        { note: 'ui-hidden' },
        { [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar) },
        jar,
      );
      expect(deniedWrite.status).toBe(403);

      // CSRF remains enforced on authenticated mutations.
      await login(baseUrl, jar, 'owner-a@example.com', 'a-strong-passphrase');
      const missingCsrf = await fetchJson(
        baseUrl,
        'POST',
        '/api/v1/__probe/operational',
        { note: 'no-csrf' },
        {},
        jar,
      );
      expect(missingCsrf.status).toBe(403);

      // Tampered/invalid session credentials fail safely.
      const tampered = await fetch(`${baseUrl}${API_AUTH_SESSION_PATH}`, {
        headers: { cookie: 'agrivio_session=not-a-real-session' },
      });
      expect(tampered.status).toBe(401);

      // Revoked/disabled membership loses access; session cannot retain stale unauthorized scope.
      await login(baseUrl, jar, 'cashier-a@example.com', 'a-strong-passphrase');
      const memberships = await authStore.listMembershipsByUserId(
        String((await authStore.findUserByEmailNormalized('cashier-a@example.com'))['_id']),
      );
      const membershipId = String(memberships[0]['_id']);
      await authStore.updateMembership(null, membershipId, { status: 'deactivated' });
      const afterRevoke = await fetchJson(baseUrl, 'GET', API_AUTH_SESSION_PATH, undefined, {}, jar);
      expect(afterRevoke.status).toBe(401);

      // Billing/subscription records cannot be accessed cross-tenant.
      await login(baseUrl, jar, 'owner-a@example.com', 'a-strong-passphrase');
      const uploadedA = await uploadPdfEvidence(baseUrl, jar, 'org-a.pdf');
      expect(uploadedA.status).toBe(201);
      const billingA = await fetchJson(
        baseUrl,
        'POST',
        API_SUBSCRIPTION_BILLING_RECORDS_PATH,
        {
          paymentMethod: 'bank_transfer',
          billingPeriod: 'monthly',
          submittedAmountMinorUnits: 1000,
          paymentReference: `ref-a-${Date.now()}`,
          evidenceStorageRef: uploadedA.body.data.evidenceStorageRef,
          requestedPlanCode: 'Starter',
          requestedPlanVersion: 1,
        },
        { [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar) },
        jar,
      );
      expect(billingA.status).toBe(201);
      const billingId = billingA.body.data.id;

      await login(baseUrl, jar, 'owner-b@example.com', 'a-strong-passphrase');
      const crossBilling = await fetchJson(
        baseUrl,
        'GET',
        `${API_SUBSCRIPTION_BILLING_RECORDS_PATH}/${billingId}`,
        undefined,
        {},
        jar,
      );
      expect(crossBilling.status).toBe(404);

      // Platform plan management remains platform-only.
      const orgCreatePlan = await fetchJson(
        baseUrl,
        'POST',
        API_PLATFORM_SUBSCRIPTION_PLANS_PATH,
        { planCode: 'Hacked', activate: true },
        { [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar) },
        jar,
      );
      expect(orgCreatePlan.status).toBe(403);

      // Subscription suspension blocks operational writes; permitted suspended reads remain.
      const listed = await fetchJson(
        baseUrl,
        'GET',
        API_PLATFORM_SUBSCRIPTIONS_PATH,
        undefined,
        { [API_PLATFORM_ACTOR_HEADER]: 'super-admin' },
        jar,
      );
      const subscription = listed.body.data.items.find(
        (item) => item.organizationId === orgA.organizationId,
      );
      expect(subscription).toBeTruthy();
      const suspended = await fetchJson(
        baseUrl,
        'POST',
        `${API_PLATFORM_SUBSCRIPTIONS_PATH}/${subscription.id}/suspend`,
        {
          expectedVersion: subscription.version,
          reason: 'Isolation suite suspension',
        },
        {
          [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar),
          [API_PLATFORM_ACTOR_HEADER]: 'super-admin',
        },
        jar,
      );
      expect(suspended.status).toBe(200);

      await login(baseUrl, jar, 'owner-a@example.com', 'a-strong-passphrase');
      const blocked = await fetchJson(
        baseUrl,
        'POST',
        '/api/v1/__probe/operational',
        { note: 'suspended' },
        { [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar) },
        jar,
      );
      expect(blocked.status).toBe(403);

      const suspendedRead = await fetchJson(
        baseUrl,
        'GET',
        API_SUBSCRIPTION_PATH,
        undefined,
        {},
        jar,
      );
      expect(suspendedRead.status).toBe(200);
      expect(suspendedRead.body.data.status).toBe('suspended');

      const orgReadWhileSuspended = await fetchJson(
        baseUrl,
        'GET',
        API_ORGANIZATION_PATH,
        undefined,
        {},
        jar,
      );
      expect(orgReadWhileSuspended.status).toBe(200);

      // Logout clears session credentials.
      const logout = await fetchJson(
        baseUrl,
        'POST',
        API_AUTH_LOGOUT_PATH,
        {},
        { [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar) },
        jar,
      );
      expect(logout.status).toBe(200);
      const afterLogout = await fetchJson(baseUrl, 'GET', API_AUTH_SESSION_PATH, undefined, {}, jar);
      expect(afterLogout.status).toBe(401);

      void subscriptions;
      void API_ORGANIZATION_ACTIVATION_REQUESTS_PATH;
      void ApiTransportErrorCode;
    } finally {
      await close(server);
    }
  });
});

async function boot(options = {}) {
  const config = loadApiEnv({ NODE_ENV: 'test' });
  const app = createApp({
    config,
    database: createMockDatabaseLifecycle({ ready: true }),
    ...(options.registerProbes
      ? {
          registerOperationalProbe: (expressApp, middlewares) => {
            const router = Router();
            router.get(
              '/api/v1/__probe/branches/:branchId',
              middlewares.requireAuth,
              middlewares.requireOrganizationContext,
              createRequirePermissionMiddleware('branches.view'),
              middlewares.requireBranchAccess(),
              (req, res) => {
                res.status(200).json({
                  data: { branchId: req.params.branchId },
                  requestId: 'probe',
                });
              },
            );
            router.post(
              '/api/v1/__probe/warehouses/:warehouseId',
              middlewares.requireAuth,
              middlewares.requireCsrf,
              middlewares.requireOrganizationContext,
              createRequirePermissionMiddleware('warehouses.view'),
              middlewares.requireWarehouseAccess(),
              (req, res) => {
                res.status(200).json({
                  data: { warehouseId: req.params.warehouseId },
                  requestId: 'probe',
                });
              },
            );
            router.post(
              '/api/v1/__probe/operational',
              middlewares.requireAuth,
              middlewares.requireCsrf,
              middlewares.requireOrganizationContext,
              createRequirePermissionMiddleware('organization.update'),
              middlewares.requireOperationalAccess,
              (_req, res) => {
                res.status(200).json({ data: { ok: true }, requestId: 'probe' });
              },
            );
            expressApp.use(router);
          },
        }
      : {}),
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
    authStore: app.agrivio.auth.store,
    onboarding: app.agrivio.onboarding,
    subscriptionStore: app.agrivio.subscriptions.store,
    subscriptions: app.agrivio.subscriptions,
  };
}

async function seedPlan(baseUrl, jar) {
  const response = await fetchJson(
    baseUrl,
    'POST',
    API_PLATFORM_SUBSCRIPTION_PLANS_PATH,
    {
      planCode: 'Starter',
      activate: true,
      monthlyPriceMinorUnits: 1000,
    },
    {
      [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar),
      [API_PLATFORM_ACTOR_HEADER]: 'super-admin',
    },
    jar,
  );
  expect([200, 201]).toContain(response.status);
}

async function createApprovedOwner(baseUrl, jar, input) {
  const requested = await fetchJson(
    baseUrl,
    'POST',
    API_ORGANIZATION_ACTIVATION_REQUESTS_PATH,
    {
      organizationName: input.organizationName,
      ownerEmail: input.ownerEmail,
      ownerDisplayName: 'Owner',
    },
    { [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar) },
    jar,
  );
  expect(requested.status).toBe(201);

  const approved = await fetchJson(
    baseUrl,
    'POST',
    `${API_PLATFORM_ORGANIZATIONS_PATH}/${requested.body.data.organizationId}/approve`,
    {},
    {
      [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar),
      [API_PLATFORM_ACTOR_HEADER]: 'super-admin',
    },
    jar,
  );
  expect(approved.status).toBe(200);

  const activated = await fetchJson(
    baseUrl,
    'POST',
    '/api/v1/auth/activate',
    {
      token: approved.body.data.activationToken,
      password: input.password,
    },
    { [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar) },
    jar,
  );
  expect(activated.status).toBe(200);

  return {
    organizationId: requested.body.data.organizationId,
    membershipId: activated.body.data.session.activeContext.membershipId,
  };
}

async function seedCashier(authStore, orgStore, input) {
  const passwordHash = await hashPassword(input.password);
  const user = await authStore.insertUser(null, {
    email: input.email,
    emailNormalized: input.email,
    displayName: 'Cashier',
    passwordHash,
    status: 'active',
    platformAccess: null,
    version: 1,
  });
  const membership = await authStore.insertMembership(null, {
    organizationId: input.organizationId,
    userId: user['_id'],
    role: 'Cashier',
    status: 'active',
    conditionalPermissionGrants: [],
    version: 1,
  });
  await authStore.insertAccessAssignment(null, {
    organizationId: input.organizationId,
    membershipId: membership['_id'],
    assignmentType: 'branch',
    targetId: input.branchId,
    status: 'active',
    version: 1,
  });
  await authStore.insertAccessAssignment(null, {
    organizationId: input.organizationId,
    membershipId: membership['_id'],
    assignmentType: 'warehouse',
    targetId: input.warehouseId,
    status: 'active',
    version: 1,
  });
  void orgStore;
  return { user, membership };
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

async function seedTrialSubscription(subscriptionStore, organizationId) {
  const existing = await subscriptionStore.findSubscriptionByOrganizationId(organizationId);
  if (existing !== null) {
    return existing;
  }
  return subscriptionStore.insertSubscription(null, {
    organizationId,
    status: 'trial',
    planCode: 'Starter',
    planVersion: 1,
    trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
    version: 1,
  });
}

async function login(baseUrl, jar, email, password) {
  const csrf = await issueCsrf(baseUrl, jar);
  const response = await fetchJson(
    baseUrl,
    'POST',
    API_AUTH_LOGIN_PATH,
    { email, password },
    { [API_CSRF_HEADER]: csrf },
    jar,
  );
  expect(response.status).toBe(200);
  return response.body.data.session;
}

async function switchContext(baseUrl, jar, body) {
  return fetchJson(
    baseUrl,
    'POST',
    API_AUTH_SESSION_CONTEXT_PATH,
    body,
    { [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar) },
    jar,
  );
}

async function uploadPdfEvidence(baseUrl, jar, fileName) {
  const csrf = await issueCsrf(baseUrl, jar);
  const response = await fetch(`${baseUrl}${API_SUBSCRIPTION_BILLING_EVIDENCE_PATH}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/pdf',
      'X-Filename': fileName,
      [API_CSRF_HEADER]: csrf,
      cookie: jar.header(),
    },
    body: Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n'),
  });
  jar.absorb(response.headers);
  return { status: response.status, body: await response.json() };
}

async function issueCsrf(baseUrl, jar) {
  const response = await fetchJson(baseUrl, 'POST', API_AUTH_CSRF_PATH, {}, {}, jar);
  expect(response.status).toBe(200);
  return response.body.data.csrfToken;
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
