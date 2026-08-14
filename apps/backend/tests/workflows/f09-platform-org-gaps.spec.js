import { describe, expect, it } from 'vitest';
import {
  API_AUTH_LOGIN_PATH,
  API_CSRF_HEADER,
  API_DASHBOARD_PATH,
  API_IDEMPOTENCY_KEY_HEADER,
  API_IMPORTS_PATH,
  API_ORGANIZATION_PATH,
  API_PLATFORM_ACTOR_HEADER,
  API_PLATFORM_ORGANIZATIONS_PATH,
  API_PLATFORM_SUBSCRIPTIONS_PATH,
  API_PRODUCT_CATEGORIES_PATH,
  API_REPORTS_PATH,
} from '@agrivio/api-contracts';
import {
  bootF09App,
  closeServer,
  createApprovedOwner,
  fetchJson,
  issueCsrf,
  login,
  logout,
  seedPlan,
} from './f09-http-harness.js';

const PASSWORD = 'a-strong-passphrase';

describe('Frozen platform organization create and suspend gaps', () => {
  it('creates pending organizations and suspends through the existing subscription lifecycle', async () => {
    const { server, baseUrl, jar, app } = await bootF09App();
    try {
      await seedPlan(baseUrl, jar);
      const csrf = async (extra = {}) => ({
        [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar),
        ...extra,
      });

      const created = await fetchJson(
        baseUrl,
        'POST',
        API_PLATFORM_ORGANIZATIONS_PATH,
        {
          organizationName: 'Platform Direct Org',
          ownerEmail: 'platform-direct-owner@example.com',
          ownerDisplayName: 'Direct Owner',
        },
        {
          ...(await csrf()),
          [API_PLATFORM_ACTOR_HEADER]: 'super-admin',
          [API_IDEMPOTENCY_KEY_HEADER]: 'plat-org-create-1',
        },
        jar,
      );
      expect(created.status).toBe(201);
      expect(created.body.data.status).toBe('pending_approval');
      expect(created.body.data.duplicate).toBe(false);
      const organizationId = created.body.data.organizationId;

      const replay = await fetchJson(
        baseUrl,
        'POST',
        API_PLATFORM_ORGANIZATIONS_PATH,
        {
          organizationName: 'Platform Direct Org',
          ownerEmail: 'platform-direct-owner@example.com',
          ownerDisplayName: 'Direct Owner',
        },
        {
          ...(await csrf()),
          [API_PLATFORM_ACTOR_HEADER]: 'super-admin',
          [API_IDEMPOTENCY_KEY_HEADER]: 'plat-org-create-1',
        },
        jar,
      );
      expect(replay.status).toBe(201);
      expect(replay.body.data.organizationId).toBe(organizationId);

      const fingerprintRetry = await fetchJson(
        baseUrl,
        'POST',
        API_PLATFORM_ORGANIZATIONS_PATH,
        {
          organizationName: 'Platform Direct Org',
          ownerEmail: 'platform-direct-owner@example.com',
          ownerDisplayName: 'Direct Owner',
        },
        {
          ...(await csrf()),
          [API_PLATFORM_ACTOR_HEADER]: 'super-admin',
          [API_IDEMPOTENCY_KEY_HEADER]: 'plat-org-create-2',
        },
        jar,
      );
      expect(fingerprintRetry.status).toBe(200);
      expect(fingerprintRetry.body.data.duplicate).toBe(true);
      expect(fingerprintRetry.body.data.organizationId).toBe(organizationId);

      const listed = await fetchJson(
        baseUrl,
        'GET',
        `${API_PLATFORM_ORGANIZATIONS_PATH}/${organizationId}`,
        undefined,
        { [API_PLATFORM_ACTOR_HEADER]: 'super-admin' },
        jar,
      );
      expect(listed.status).toBe(200);
      expect(listed.body.data.status).toBe('pending_approval');

      const ownerLogin = await fetchJson(
        baseUrl,
        'POST',
        API_AUTH_LOGIN_PATH,
        { email: 'platform-direct-owner@example.com', password: PASSWORD },
        await csrf(),
        jar,
      );
      expect(ownerLogin.status).toBe(401);

      const createAudits = app.agrivio.onboarding.store.listAuditEventsForTest();
      expect(
        createAudits.some(
          (item) =>
            item.action === 'organization.created_by_platform' &&
            String(item.resourceId) === organizationId,
        ),
      ).toBe(true);

      const operational = await createApprovedOwner(baseUrl, jar, {
        organizationName: 'Platform Suspend Org',
        ownerEmail: 'platform-suspend-owner@example.com',
        password: PASSWORD,
      });

      await login(baseUrl, jar, 'platform-suspend-owner@example.com', PASSWORD);
      const orgDeniedCreate = await fetchJson(
        baseUrl,
        'POST',
        API_PLATFORM_ORGANIZATIONS_PATH,
        {
          organizationName: 'Should Fail',
          ownerEmail: 'should-fail@example.com',
          ownerDisplayName: 'Nope',
        },
        { ...(await csrf()), [API_IDEMPOTENCY_KEY_HEADER]: 'org-user-create' },
        jar,
      );
      expect(orgDeniedCreate.status).toBe(403);

      const orgDeniedSuspend = await fetchJson(
        baseUrl,
        'POST',
        `${API_PLATFORM_ORGANIZATIONS_PATH}/${operational.organizationId}/suspend`,
        { reason: 'org user cannot suspend' },
        { ...(await csrf()), [API_IDEMPOTENCY_KEY_HEADER]: 'org-user-suspend' },
        jar,
      );
      expect(orgDeniedSuspend.status).toBe(403);

      const categoryBefore = await fetchJson(
        baseUrl,
        'POST',
        API_PRODUCT_CATEGORIES_PATH,
        { name: 'Before Suspend', productClass: 'seed' },
        await csrf(),
        jar,
      );
      expect(categoryBefore.status).toBe(201);

      const suspendKey = 'plat-org-suspend-1';
      const suspended = await fetchJson(
        baseUrl,
        'POST',
        `${API_PLATFORM_ORGANIZATIONS_PATH}/${operational.organizationId}/suspend`,
        { reason: 'Frozen org suspend gap' },
        {
          ...(await csrf()),
          [API_PLATFORM_ACTOR_HEADER]: 'super-admin',
          [API_IDEMPOTENCY_KEY_HEADER]: suspendKey,
        },
        jar,
      );
      expect(suspended.status).toBe(200);
      expect(suspended.body.data.subscriptionStatus).toBe('suspended');
      expect(suspended.body.data.status).toBe('approved');

      const suspendReplay = await fetchJson(
        baseUrl,
        'POST',
        `${API_PLATFORM_ORGANIZATIONS_PATH}/${operational.organizationId}/suspend`,
        { reason: 'Frozen org suspend gap' },
        {
          ...(await csrf()),
          [API_PLATFORM_ACTOR_HEADER]: 'super-admin',
          [API_IDEMPOTENCY_KEY_HEADER]: suspendKey,
        },
        jar,
      );
      expect(suspendReplay.status).toBe(200);
      expect(suspendReplay.body.data.subscriptionId).toBe(suspended.body.data.subscriptionId);

      const suspendAgain = await fetchJson(
        baseUrl,
        'POST',
        `${API_PLATFORM_ORGANIZATIONS_PATH}/${operational.organizationId}/suspend`,
        { reason: 'already suspended' },
        {
          ...(await csrf()),
          [API_PLATFORM_ACTOR_HEADER]: 'super-admin',
          [API_IDEMPOTENCY_KEY_HEADER]: 'plat-org-suspend-2',
        },
        jar,
      );
      expect(suspendAgain.status).toBe(200);
      expect(suspendAgain.body.data.subscriptionStatus).toBe('suspended');

      const orgStillThere = await fetchJson(baseUrl, 'GET', API_ORGANIZATION_PATH, undefined, {}, jar);
      expect(orgStillThere.status).toBe(200);
      expect(orgStillThere.body.data.id ?? orgStillThere.body.data.organizationId).toBeTruthy();

      const reportView = await fetchJson(baseUrl, 'GET', `${API_REPORTS_PATH}/sales`, undefined, {}, jar);
      expect(reportView.status).toBe(200);

      const dashboard = await fetchJson(baseUrl, 'GET', API_DASHBOARD_PATH, undefined, {}, jar);
      expect(dashboard.status).toBe(403);

      const writeBlocked = await fetchJson(
        baseUrl,
        'POST',
        API_PRODUCT_CATEGORIES_PATH,
        { name: 'After Suspend', productClass: 'general' },
        await csrf(),
        jar,
      );
      expect(writeBlocked.status).toBe(403);

      const importBlocked = await fetchJson(
        baseUrl,
        'POST',
        API_IMPORTS_PATH,
        { importType: 'product_categories' },
        await csrf(),
        jar,
      );
      expect(importBlocked.status).toBe(403);

      const suspendAudits = app.agrivio.onboarding.store.listAuditEventsForTest();
      expect(
        suspendAudits.some(
          (item) =>
            item.action === 'organization.suspended' &&
            String(item.resourceId) === operational.organizationId,
        ),
      ).toBe(true);

      const listedSubs = await fetchJson(
        baseUrl,
        'GET',
        API_PLATFORM_SUBSCRIPTIONS_PATH,
        undefined,
        { [API_PLATFORM_ACTOR_HEADER]: 'super-admin' },
        jar,
      );
      const subscription = listedSubs.body.data.items.find(
        (item) => item.organizationId === operational.organizationId,
      );
      expect(subscription.status).toBe('suspended');

      const reactivated = await fetchJson(
        baseUrl,
        'POST',
        `${API_PLATFORM_SUBSCRIPTIONS_PATH}/${subscription.id}/reactivate`,
        { expectedVersion: subscription.version, reason: 'restore after org suspend' },
        {
          ...(await csrf()),
          [API_PLATFORM_ACTOR_HEADER]: 'super-admin',
        },
        jar,
      );
      expect(reactivated.status).toBe(200);

      const writeRestored = await fetchJson(
        baseUrl,
        'POST',
        API_PRODUCT_CATEGORIES_PATH,
        { name: 'After Reactivate', productClass: 'general' },
        await csrf(),
        jar,
      );
      expect(writeRestored.status).toBe(201);

      await logout(baseUrl, jar);
    } finally {
      await closeServer(server);
    }
  }, 120000);
});
