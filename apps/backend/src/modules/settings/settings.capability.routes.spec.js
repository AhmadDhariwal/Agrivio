import { createServer } from 'node:http';
import express from 'express';
import { describe, expect, it, vi } from 'vitest';
import { API_ORGANIZATION_PATH, API_SETTINGS_PATH } from '@agrivio/api-contracts';
import errorHandlerModule from '../../platform/errors/error-handler.middleware';
import requestIdModule from '../../platform/http/request-id.middleware';
import capabilityStoreModule from '../capabilities/capability.store';
import capabilityServiceModule from '../capabilities/capability.service';
import transactionRunnerModule from '../../platform/transactions/transaction-runner';
import auditWriterModule from '../../platform/audit/audit-writer';
import settingsModule from './settings.module';
import settingsRoutesModule from './routes/settings.routes';
import organizationRoutesModule from '../organizations/routes/organization.routes';

const { createErrorHandlerMiddleware } = errorHandlerModule;
const { createRequestIdMiddleware } = requestIdModule;
const { createInMemoryCapabilityPolicyStore } = capabilityStoreModule;
const { createCapabilityService } = capabilityServiceModule;
const { createMockTransactionSessionPort, createTransactionRunner } = transactionRunnerModule;
const { createInMemoryAuditEventStore } = auditWriterModule;
const { createSettingsModule } = settingsModule;
const { registerSettingsRoutes } = settingsRoutesModule;
const { registerOrganizationRoutes } = organizationRoutesModule;

const ALL_PERMISSIONS = ['settings.view', 'settings.manage', 'organization.view'];

function createHarness(permissions = ALL_PERMISSIONS) {
  const capabilityService = createCapabilityService({
    store: createInMemoryCapabilityPolicyStore(),
    auditStore: createInMemoryAuditEventStore(),
    transactionRunner: createTransactionRunner(createMockTransactionSessionPort().port),
    resolveSubscriptionAccessState: async () => ({
      status: 'active',
      accessLevel: 'operational',
    }),
  });
  const settings = createSettingsModule({ persistence: 'memory', capabilityService });
  const app = express();
  app.use(express.json());
  app.use(createRequestIdMiddleware());
  app.use(
    registerOrganizationRoutes({
      requireAuth: createAuthMiddleware(permissions),
      requireCsrf: (_req, _res, next) => next(),
      requireBillingAccess: (_req, _res, next) => next(),
      requireOperationalAccess: (_req, _res, next) => next(),
      capabilityService,
      findOrganizationById: async () => ({
        _id: 'org-a',
        name: 'Org A',
        status: 'active',
        timezone: 'Asia/Karachi',
        version: 1,
      }),
      setupProgressService: { getSetupProgress: async () => ({ steps: [] }) },
    }),
  );
  app.use(
    registerSettingsRoutes({
      requireAuth: createAuthMiddleware(permissions),
      requireCsrf: (_req, _res, next) => next(),
      requireOperationalAccess: (_req, _res, next) => next(),
      capabilityService,
      settingsService: settings.settingsService,
    }),
  );
  app.use(createErrorHandlerMiddleware('test', () => undefined));
  return { app, capabilityService, settingsService: settings.settingsService };
}

function createAuthMiddleware(permissions) {
  return (req, _res, next) => {
    req.auth = { session: {}, user: {} };
    req.authContext = {
      contextType: 'organization',
      organizationId: 'org-a',
      userId: 'user-a',
      permissions,
    };
    next();
  };
}

async function withServer(app, work) {
  const server = createServer(app);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  try {
    const address = server.address();
    if (address === null || typeof address === 'string') throw new Error('Expected TCP server');
    await work(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
}

async function requestJson(baseUrl, path, method, body) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { response, body: await response.json() };
}

describe('Settings capability API enforcement', () => {
  it('blocks Settings reads when the module is disabled', async () => {
    const harness = createHarness();
    await harness.capabilityService.updatePolicy(
      'org-a',
      { expectedVersion: 0, changes: [{ key: 'settings', value: { enabled: false } }] },
      { actorId: 'platform-admin' },
    );
    await withServer(harness.app, async (baseUrl) => {
      const { response, body } = await requestJson(baseUrl, API_SETTINGS_PATH, 'GET');
      expect(response.status).toBe(403);
      expect(body.error).toMatchObject({
        code: 'ORG_CAPABILITY_DISABLED',
        details: { controlKey: 'settings' },
      });
    });
  });

  it('does not let an enabled module bypass settings.view', async () => {
    const harness = createHarness([]);
    const getSettings = vi.spyOn(harness.settingsService, 'getSettings');
    await withServer(harness.app, async (baseUrl) => {
      const { response, body } = await requestJson(baseUrl, API_SETTINGS_PATH, 'GET');
      expect(response.status).toBe(403);
      expect(body.error.code).toBe('PERMISSION_DENIED');
    });
    expect(getSettings).not.toHaveBeenCalled();
  });

  it('blocks PATCH when the update action is disabled', async () => {
    const harness = createHarness();
    const current = await harness.settingsService.getSettings('org-a');
    await harness.capabilityService.updatePolicy(
      'org-a',
      {
        expectedVersion: 0,
        changes: [{ key: 'settings.actions.update', value: { allowed: false } }],
      },
      { actorId: 'platform-admin' },
    );
    await withServer(harness.app, async (baseUrl) => {
      const { response, body } = await requestJson(baseUrl, API_SETTINGS_PATH, 'PATCH', {
        expectedVersion: current.version,
        tradingName: 'Blocked',
      });
      expect(response.status).toBe(403);
      expect(body.error).toMatchObject({
        code: 'ORG_ACTION_NOT_ALLOWED',
        details: { controlKey: 'settings.actions.update' },
      });
    });
    expect((await harness.settingsService.getSettings('org-a')).tradingName).toBe('');
  });

  it('rejects every disabled field mutation and preserves stored values', async () => {
    const fields = [
      'tradingName',
      'contactPhone',
      'contactEmail',
      'addressLine',
      'documentFooterNote',
    ];
    for (const field of fields) {
      const harness = createHarness();
      const current = await harness.settingsService.updateSettings(
        'org-a',
        { expectedVersion: 1, [field]: `existing-${field}` },
        { actorId: 'owner-a' },
      );
      await harness.capabilityService.updatePolicy(
        'org-a',
        {
          expectedVersion: 0,
          changes: [{ key: `settings.fields.${field}`, value: { editable: false } }],
        },
        { actorId: 'platform-admin' },
      );
      await withServer(harness.app, async (baseUrl) => {
        const { response, body } = await requestJson(baseUrl, API_SETTINGS_PATH, 'PATCH', {
          expectedVersion: current.version,
          [field]: `crafted-${field}`,
        });
        expect(response.status).toBe(403);
        expect(body.error).toMatchObject({
          code: 'ORG_FIELD_NOT_EDITABLE',
          details: { controlKey: `settings.fields.${field}` },
        });
      });
      expect((await harness.settingsService.getSettings('org-a'))[field]).toBe(`existing-${field}`);
    }
  });

  it('keeps the Organization profile endpoint independent from Settings capability', async () => {
    const harness = createHarness(['organization.view']);
    await harness.capabilityService.updatePolicy(
      'org-a',
      { expectedVersion: 0, changes: [{ key: 'settings', value: { enabled: false } }] },
      { actorId: 'platform-admin' },
    );
    await withServer(harness.app, async (baseUrl) => {
      const { response, body } = await requestJson(baseUrl, API_ORGANIZATION_PATH, 'GET');
      expect(response.status).toBe(200);
      expect(body.data).toMatchObject({ id: 'org-a', name: 'Org A' });
    });
  });
});
