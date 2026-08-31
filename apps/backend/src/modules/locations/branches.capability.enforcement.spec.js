import { createServer } from 'node:http';
import express from 'express';
import { describe, expect, it, vi } from 'vitest';
import transactionRunnerModule from '../../platform/transactions/transaction-runner';
import auditWriterModule from '../../platform/audit/audit-writer';
import capabilityStoreModule from '../capabilities/capability.store';
import capabilityServiceModule from '../capabilities/capability.service';
import errorHandlerModule from '../../platform/errors/error-handler.middleware';
import requestIdModule from '../../platform/http/request-id.middleware';
import locationsModule from './locations.module';
import locationsRoutesModule from './routes/locations.routes';

const { createMockTransactionSessionPort, createTransactionRunner } = transactionRunnerModule;
const { createInMemoryAuditEventStore } = auditWriterModule;
const { createInMemoryCapabilityPolicyStore } = capabilityStoreModule;
const { createCapabilityService } = capabilityServiceModule;
const { createErrorHandlerMiddleware } = errorHandlerModule;
const { createRequestIdMiddleware } = requestIdModule;
const { createLocationsModule } = locationsModule;
const { registerLocationsRoutes } = locationsRoutesModule;

const BASE = '/api/v1/branches';
const ALL_PERMISSIONS = ['branches.view', 'branches.manage'];

function createCapabilityHarness() {
  return createCapabilityService({
    store: createInMemoryCapabilityPolicyStore(),
    auditStore: createInMemoryAuditEventStore(),
    transactionRunner: createTransactionRunner(createMockTransactionSessionPort().port),
    resolveSubscriptionAccessState: async () => ({ status: 'active', accessLevel: 'operational' }),
  });
}

function buildApp({ capabilityService, locationsService, permissions = ALL_PERMISSIONS }) {
  const app = express();
  app.use(express.json());
  app.use(createRequestIdMiddleware());
  app.use(
    registerLocationsRoutes({
      requireAuth: (req, _res, next) => {
        req.auth = { session: {}, user: {} };
        req.authContext = {
          contextType: 'organization',
          organizationId: 'org-a',
          userId: 'user-a',
          permissions,
        };
        next();
      },
      requireCsrf: (_req, _res, next) => next(),
      requireOperationalAccess: (_req, _res, next) => next(),
      capabilityService,
      locationsService,
    }),
  );
  app.use(createErrorHandlerMiddleware('test', () => undefined));
  return app;
}

async function withServer(app, work) {
  const server = createServer(app);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(undefined));
  });
  try {
    const address = server.address();
    if (address === null || typeof address === 'string') throw new Error('Expected TCP server');
    await work(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve(undefined))),
    );
  }
}

async function requestJson(baseUrl, path, method, body) {
  return fetch(`${baseUrl}${path}`, {
    method,
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function createIntegratedHarness(options = {}) {
  const capabilityService = createCapabilityHarness();
  const locations = createLocationsModule({
    persistence: 'memory',
    capabilityService,
    ...(options.evaluateEntitlement === undefined
      ? {}
      : { evaluateEntitlement: options.evaluateEntitlement }),
    ...(options.listBranchReferences === undefined
      ? {}
      : { listBranchReferences: options.listBranchReferences }),
  });
  const branch = await locations.locationsService.createBranch(
    'org-a',
    { name: 'Main Branch', invoicePrefix: 'MAIN' },
    { actorId: 'user-a' },
  );
  return {
    capabilityService,
    locationsService: locations.locationsService,
    branch,
    app: buildApp({ capabilityService, locationsService: locations.locationsService }),
  };
}

describe('Branches capability API enforcement', () => {
  it('blocks every direct Branch API operation when the module is disabled', async () => {
    const { capabilityService, branch, app } = await createIntegratedHarness();
    await capabilityService.updatePolicy(
      'org-a',
      {
        expectedVersion: 0,
        changes: [{ key: 'branches', value: { enabled: false } }],
      },
      { actorId: 'platform-admin' },
    );
    await withServer(app, async (baseUrl) => {
      for (const [path, method] of [
        [BASE, 'GET'],
        [`${BASE}/options`, 'GET'],
        [`${BASE}/${branch.id}`, 'GET'],
        [BASE, 'POST'],
        [`${BASE}/${branch.id}`, 'PATCH'],
        [`${BASE}/${branch.id}`, 'DELETE'],
      ]) {
        const response = await requestJson(
          baseUrl,
          path,
          method,
          method === 'POST' ? { name: 'Blocked', invoicePrefix: 'BLK' } : undefined,
        );
        expect(response.status).toBe(403);
        expect((await response.json()).error).toMatchObject({
          code: 'ORG_CAPABILITY_DISABLED',
          details: { controlKey: 'branches' },
        });
      }
    });
  });

  it('rejects create and delete when their actions are disabled', async () => {
    const create = await createIntegratedHarness();
    await create.capabilityService.updatePolicy(
      'org-a',
      {
        expectedVersion: 0,
        changes: [{ key: 'branches.actions.create', value: { allowed: false } }],
      },
      { actorId: 'platform-admin' },
    );
    await withServer(
      buildApp({
        capabilityService: create.capabilityService,
        locationsService: create.locationsService,
      }),
      async (baseUrl) => {
        const response = await requestJson(baseUrl, BASE, 'POST', {
          name: 'Blocked',
          invoicePrefix: 'BLK',
        });
        expect(response.status).toBe(403);
        expect((await response.json()).error.code).toBe('ORG_ACTION_NOT_ALLOWED');
      },
    );

    const deletion = await createIntegratedHarness();
    await deletion.capabilityService.updatePolicy(
      'org-a',
      {
        expectedVersion: 0,
        changes: [{ key: 'branches.actions.delete', value: { allowed: false } }],
      },
      { actorId: 'platform-admin' },
    );
    await withServer(deletion.app, async (baseUrl) => {
      const response = await requestJson(baseUrl, `${BASE}/${deletion.branch.id}`, 'DELETE');
      expect(response.status).toBe(403);
      expect((await response.json()).error.code).toBe('ORG_ACTION_NOT_ALLOWED');
    });
  });

  it('rejects edit, crafted Code, crafted Status, and lifecycle mutations', async () => {
    for (const [key, patch, expectedCode] of [
      ['branches.actions.edit', { name: 'Renamed' }, 'ORG_ACTION_NOT_ALLOWED'],
      ['branches.fields.code', { code: 'CRAFTED' }, 'ORG_FIELD_NOT_EDITABLE'],
      ['branches.fields.status', { status: 'inactive' }, 'ORG_FIELD_NOT_EDITABLE'],
    ]) {
      const harness = await createIntegratedHarness();
      await harness.capabilityService.updatePolicy(
        'org-a',
        {
          expectedVersion: 0,
          changes: [
            {
              key,
              value:
                key.endsWith('.code') || key.endsWith('.status')
                  ? { editable: false }
                  : { allowed: false },
            },
          ],
        },
        { actorId: 'platform-admin' },
      );
      await withServer(harness.app, async (baseUrl) => {
        const response = await requestJson(baseUrl, `${BASE}/${harness.branch.id}`, 'PATCH', {
          expectedVersion: harness.branch.version,
          ...patch,
        });
        expect(response.status).toBe(403);
        expect((await response.json()).error.code).toBe(expectedCode);
      });
    }

    for (const [action, initial, next] of [
      ['deactivate', 'active', 'inactive'],
      ['reactivate', 'inactive', 'active'],
    ]) {
      const harness = await createIntegratedHarness();
      let current = harness.branch;
      if (initial === 'inactive') {
        current = await harness.locationsService.updateBranch(
          'org-a',
          current.id,
          {
            expectedVersion: current.version,
            status: 'inactive',
          },
          { actorId: 'user-a' },
        );
      }
      await harness.capabilityService.updatePolicy(
        'org-a',
        {
          expectedVersion: 0,
          changes: [{ key: `branches.actions.${action}`, value: { allowed: false } }],
        },
        { actorId: 'platform-admin' },
      );
      await withServer(harness.app, async (baseUrl) => {
        const response = await requestJson(baseUrl, `${BASE}/${current.id}`, 'PATCH', {
          expectedVersion: current.version,
          status: next,
        });
        expect(response.status).toBe(403);
        expect((await response.json()).error.details.controlKey).toBe(`branches.actions.${action}`);
      });
    }
  });

  it('keeps RBAC authoritative and does not alter the Branch subscription limit', async () => {
    const assertAllowed = vi.fn();
    const createBranch = vi.fn();
    const app = buildApp({
      capabilityService: { assertAllowed },
      locationsService: { createBranch },
      permissions: ['branches.view'],
    });
    await withServer(app, async (baseUrl) => {
      const response = await requestJson(baseUrl, BASE, 'POST', {
        name: 'RBAC blocked',
        invoicePrefix: 'RBAC',
      });
      expect(response.status).toBe(403);
    });
    expect(assertAllowed).not.toHaveBeenCalled();
    expect(createBranch).not.toHaveBeenCalled();

    const limited = await createIntegratedHarness({
      evaluateEntitlement: async (_organizationId, { currentUsage }) =>
        currentUsage === 0
          ? { allowed: true, limit: { limit: 1, used: 0 } }
          : { allowed: false, reason: 'limit_reached', limit: { limit: 1, used: currentUsage } },
    });
    await expect(
      limited.locationsService.createBranch(
        'org-a',
        { name: 'Over limit', invoicePrefix: 'LIMIT' },
        { actorId: 'user-a' },
      ),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});
