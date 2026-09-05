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
  API_PRODUCT_CATEGORIES_PATH,
  API_REPORTS_PATH,
} from '@agrivio/api-contracts';
import {
  bootF09App,
  closeServer,
  createApprovedOwner,
  createCookieJar,
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

      const inquiry = await fetchJson(
        baseUrl,
        'GET',
        `${API_PLATFORM_ORGANIZATIONS_PATH}?plan=Starter&subscriptionStatus=trial&sort=name&direction=asc`,
        undefined,
        { [API_PLATFORM_ACTOR_HEADER]: 'super-admin' },
      );
      expect(inquiry.status).toBe(200);
      expect(
        inquiry.body.data.some(
          (item) =>
            item.id === operational.organizationId &&
            item.subscription.planCode === 'Starter' &&
            item.employeeCount === 1,
        ),
      ).toBe(true);

      const detailBefore = await fetchJson(
        baseUrl,
        'GET',
        `${API_PLATFORM_ORGANIZATIONS_PATH}/${operational.organizationId}`,
        undefined,
        { [API_PLATFORM_ACTOR_HEADER]: 'super-admin' },
      );
      expect(detailBefore.status).toBe(200);
      expect(detailBefore.body.data.usage.resources.activeUsers.current).toBe(1);
      expect(detailBefore.body.data.members.summary.active).toBe(1);
      expect(JSON.stringify(detailBefore.body.data)).not.toContain('passwordHash');

      const hardDelete = await fetchJson(
        baseUrl,
        'DELETE',
        `${API_PLATFORM_ORGANIZATIONS_PATH}/${operational.organizationId}`,
        undefined,
        { [API_PLATFORM_ACTOR_HEADER]: 'super-admin' },
      );
      expect(hardDelete.status).toBe(404);

      const usage = await fetchJson(
        baseUrl,
        'GET',
        `${API_PLATFORM_ORGANIZATIONS_PATH}/${operational.organizationId}/usage`,
        undefined,
        { [API_PLATFORM_ACTOR_HEADER]: 'super-admin' },
      );
      expect(usage.status).toBe(200);
      expect(usage.body.data.resources.branches.current).toBe(0);

      const members = await fetchJson(
        baseUrl,
        'GET',
        `${API_PLATFORM_ORGANIZATIONS_PATH}/${operational.organizationId}/members?role=Owner`,
        undefined,
        { [API_PLATFORM_ACTOR_HEADER]: 'super-admin' },
      );
      expect(members.status).toBe(200);
      expect(members.body.data).toHaveLength(1);
      expect(members.body.data[0]).toMatchObject({ role: 'Owner', status: 'active' });

      const profileUpdated = await fetchJson(
        baseUrl,
        'PATCH',
        `${API_PLATFORM_ORGANIZATIONS_PATH}/${operational.organizationId}`,
        { expectedVersion: 1, reason: 'Correct registered name', name: 'Platform Suspend Updated' },
        { ...(await csrf()), [API_PLATFORM_ACTOR_HEADER]: 'super-admin' },
        jar,
      );
      expect(profileUpdated.status).toBe(200);
      expect(profileUpdated.body.data).toMatchObject({
        name: 'Platform Suspend Updated',
        version: 2,
      });

      const staleProfile = await fetchJson(
        baseUrl,
        'PATCH',
        `${API_PLATFORM_ORGANIZATIONS_PATH}/${operational.organizationId}`,
        { expectedVersion: 1, reason: 'Stale write', timezone: 'UTC' },
        { ...(await csrf()), [API_PLATFORM_ACTOR_HEADER]: 'super-admin' },
        jar,
      );
      expect(staleProfile.status).toBe(409);

      const suspendKey = 'plat-org-suspend-1';
      const suspended = await fetchJson(
        baseUrl,
        'POST',
        `${API_PLATFORM_ORGANIZATIONS_PATH}/${operational.organizationId}/suspend`,
        { reason: 'Frozen org suspend gap', expectedVersion: 2, confirmed: true },
        {
          ...(await csrf()),
          [API_PLATFORM_ACTOR_HEADER]: 'super-admin',
          [API_IDEMPOTENCY_KEY_HEADER]: suspendKey,
        },
        jar,
      );
      expect(suspended.status).toBe(200);
      expect(suspended.body.data.subscriptionStatus).toBe('suspended');
      expect(suspended.body.data.status).toBe('suspended');
      expect(suspended.body.data.version).toBe(3);

      const suspendReplay = await fetchJson(
        baseUrl,
        'POST',
        `${API_PLATFORM_ORGANIZATIONS_PATH}/${operational.organizationId}/suspend`,
        { reason: 'Frozen org suspend gap', expectedVersion: 2, confirmed: true },
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
        { reason: 'already suspended', expectedVersion: 3, confirmed: true },
        {
          ...(await csrf()),
          [API_PLATFORM_ACTOR_HEADER]: 'super-admin',
          [API_IDEMPOTENCY_KEY_HEADER]: 'plat-org-suspend-2',
        },
        jar,
      );
      expect(suspendAgain.status).toBe(409);

      const orgStillThere = await fetchJson(
        baseUrl,
        'GET',
        API_ORGANIZATION_PATH,
        undefined,
        {},
        jar,
      );
      expect(orgStillThere.status).toBe(401);

      const platformDetail = await fetchJson(
        baseUrl,
        'GET',
        `${API_PLATFORM_ORGANIZATIONS_PATH}/${operational.organizationId}`,
        undefined,
        { [API_PLATFORM_ACTOR_HEADER]: 'super-admin' },
      );
      expect(platformDetail.status).toBe(200);
      expect(platformDetail.body.data.status).toBe('suspended');

      const reportView = await fetchJson(
        baseUrl,
        'GET',
        `${API_REPORTS_PATH}/sales`,
        undefined,
        {},
        jar,
      );
      expect(reportView.status).toBe(401);

      const dashboard = await fetchJson(baseUrl, 'GET', API_DASHBOARD_PATH, undefined, {}, jar);
      expect(dashboard.status).toBe(401);

      const writeBlocked = await fetchJson(
        baseUrl,
        'POST',
        API_PRODUCT_CATEGORIES_PATH,
        { name: 'After Suspend', productClass: 'general' },
        await csrf(),
        jar,
      );
      expect(writeBlocked.status).toBe(401);

      const importBlocked = await fetchJson(
        baseUrl,
        'POST',
        API_IMPORTS_PATH,
        { importType: 'product_categories' },
        await csrf(),
        jar,
      );
      expect(importBlocked.status).toBe(401);

      const suspendAudits = app.agrivio.onboarding.store.listAuditEventsForTest();
      expect(
        suspendAudits.some(
          (item) =>
            item.action === 'organization.suspended' &&
            String(item.resourceId) === operational.organizationId,
        ),
      ).toBe(true);

      const platformJar = createCookieJar();
      const reactivated = await fetchJson(
        baseUrl,
        'POST',
        `${API_PLATFORM_ORGANIZATIONS_PATH}/${operational.organizationId}/reactivate`,
        { expectedVersion: 3, reason: 'restore after org suspend' },
        {
          [API_CSRF_HEADER]: await issueCsrf(baseUrl, platformJar),
          [API_PLATFORM_ACTOR_HEADER]: 'super-admin',
          [API_IDEMPOTENCY_KEY_HEADER]: 'plat-org-reactivate-1',
        },
        platformJar,
      );
      expect(reactivated.status).toBe(200);
      expect(reactivated.body.data.status).toBe('approved');

      await login(baseUrl, jar, 'platform-suspend-owner@example.com', PASSWORD);

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
