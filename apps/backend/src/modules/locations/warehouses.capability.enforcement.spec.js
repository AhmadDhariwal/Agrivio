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

const BASE = '/api/v1/warehouses';
const ALL_PERMISSIONS = ['warehouses.view', 'warehouses.manage'];

function createCapabilityHarness() {
  return createCapabilityService({
    store: createInMemoryCapabilityPolicyStore(),
    auditStore: createInMemoryAuditEventStore(),
    transactionRunner: createTransactionRunner(createMockTransactionSessionPort().port),
    resolveSubscriptionAccessState: async () => ({
      status: 'active',
      accessLevel: 'operational',
    }),
  });
}

async function withServer(app, work) {
  const server = createServer(app);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(undefined));
  });
  try {
    const address = server.address();
    if (address === null || typeof address === 'string') {
      throw new Error('Expected server to listen on a TCP port');
    }
    await work(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve(undefined)));
    });
  }
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

async function createIntegratedHarness(options = {}) {
  const capabilityService = createCapabilityHarness();
  const locations = createLocationsModule({
    persistence: 'memory',
    capabilityService,
    ...(options.listWarehouseReferences === undefined
      ? {}
      : { listWarehouseReferences: options.listWarehouseReferences }),
  });
  const warehouse = await locations.locationsService.createWarehouse(
    'org-a',
    { name: 'Main Warehouse', code: 'MAIN' },
    { actorId: 'user-a' },
  );
  return {
    capabilityService,
    locationsService: locations.locationsService,
    warehouse,
    app: buildApp({ capabilityService, locationsService: locations.locationsService }),
  };
}

async function requestJson(baseUrl, path, method, body) {
  return fetch(`${baseUrl}${path}`, {
    method,
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe('Warehouses capability API enforcement', () => {
  it('blocks every direct Warehouse API operation when the module is disabled', async () => {
    const { capabilityService, warehouse, app } = await createIntegratedHarness();
    await capabilityService.updatePolicy(
      'org-a',
      { expectedVersion: 0, changes: [{ key: 'warehouses', value: { enabled: false } }] },
      { actorId: 'platform-admin' },
    );

    await withServer(app, async (baseUrl) => {
      for (const [path, method] of [
        [BASE, 'GET'],
        [`${BASE}/${warehouse.id}`, 'GET'],
        [BASE, 'POST'],
        [`${BASE}/${warehouse.id}`, 'PATCH'],
        [`${BASE}/${warehouse.id}`, 'DELETE'],
      ]) {
        const response = await requestJson(baseUrl, path, method);
        expect(response.status).toBe(403);
        expect((await response.json()).error).toMatchObject({
          code: 'ORG_CAPABILITY_DISABLED',
          details: { controlKey: 'warehouses' },
        });
      }
    });
  });

  it('rejects create when the organization action is disabled', async () => {
    const { capabilityService, locationsService } = await createIntegratedHarness();
    await capabilityService.updatePolicy(
      'org-a',
      {
        expectedVersion: 0,
        changes: [{ key: 'warehouses.actions.create', value: { allowed: false } }],
      },
      { actorId: 'platform-admin' },
    );
    const app = buildApp({ capabilityService, locationsService });

    await withServer(app, async (baseUrl) => {
      const response = await requestJson(baseUrl, BASE, 'POST', { name: 'Blocked Warehouse' });
      expect(response.status).toBe(403);
      expect((await response.json()).error).toMatchObject({
        code: 'ORG_ACTION_NOT_ALLOWED',
        details: { controlKey: 'warehouses.actions.create' },
      });
    });
  });

  it('rejects normal edits and crafted Code payloads through parsed service enforcement', async () => {
    for (const [key, patch, expectedCode] of [
      ['warehouses.actions.edit', { name: 'Renamed Warehouse' }, 'ORG_ACTION_NOT_ALLOWED'],
      ['warehouses.fields.code', { code: 'CRAFTED' }, 'ORG_FIELD_NOT_EDITABLE'],
    ]) {
      const { capabilityService, warehouse, app } = await createIntegratedHarness();
      await capabilityService.updatePolicy(
        'org-a',
        {
          expectedVersion: 0,
          changes: [
            {
              key,
              value: key.endsWith('.code') ? { editable: false } : { allowed: false },
            },
          ],
        },
        { actorId: 'platform-admin' },
      );

      await withServer(app, async (baseUrl) => {
        const response = await requestJson(baseUrl, `${BASE}/${warehouse.id}`, 'PATCH', {
          expectedVersion: warehouse.version,
          ...patch,
        });
        expect(response.status).toBe(403);
        expect((await response.json()).error.code).toBe(expectedCode);
      });
    }
  });

  it.each([
    ['deactivate', 'active', 'inactive'],
    ['reactivate', 'inactive', 'active'],
  ])('rejects %s when its lifecycle action is disabled', async (action, initial, next) => {
    const { capabilityService, locationsService, warehouse } = await createIntegratedHarness();
    let current = warehouse;
    if (initial === 'inactive') {
      current = await locationsService.updateWarehouse(
        'org-a',
        warehouse.id,
        { expectedVersion: warehouse.version, status: 'inactive' },
        { actorId: 'user-a' },
      );
    }
    await capabilityService.updatePolicy(
      'org-a',
      {
        expectedVersion: 0,
        changes: [{ key: `warehouses.actions.${action}`, value: { allowed: false } }],
      },
      { actorId: 'platform-admin' },
    );
    const app = buildApp({ capabilityService, locationsService });

    await withServer(app, async (baseUrl) => {
      const response = await requestJson(baseUrl, `${BASE}/${current.id}`, 'PATCH', {
        expectedVersion: current.version,
        status: next,
      });
      expect(response.status).toBe(403);
      expect((await response.json()).error).toMatchObject({
        code: 'ORG_ACTION_NOT_ALLOWED',
        details: { controlKey: `warehouses.actions.${action}` },
      });
    });
  });

  it('rejects permanent delete when disabled and preserves record-in-use protection when enabled', async () => {
    const blocked = await createIntegratedHarness();
    await blocked.capabilityService.updatePolicy(
      'org-a',
      {
        expectedVersion: 0,
        changes: [{ key: 'warehouses.actions.delete', value: { allowed: false } }],
      },
      { actorId: 'platform-admin' },
    );
    await withServer(blocked.app, async (baseUrl) => {
      const response = await requestJson(
        baseUrl,
        `${BASE}/${blocked.warehouse.id}`,
        'DELETE',
      );
      expect(response.status).toBe(403);
      expect((await response.json()).error.code).toBe('ORG_ACTION_NOT_ALLOWED');
    });

    const inUse = await createIntegratedHarness({
      listWarehouseReferences: vi.fn(async () => ['Referenced by posted stock movement']),
    });
    await withServer(inUse.app, async (baseUrl) => {
      const response = await requestJson(baseUrl, `${BASE}/${inUse.warehouse.id}`, 'DELETE');
      expect(response.status).toBe(409);
      expect((await response.json()).error.code).toBe('RECORD_IN_USE');
    });
  });

  it('keeps RBAC authoritative before organization controls can evaluate or grant access', async () => {
    const assertAllowed = vi.fn();
    const createWarehouse = vi.fn();
    const app = buildApp({
      capabilityService: { assertAllowed },
      locationsService: { createWarehouse },
      permissions: ['warehouses.view'],
    });

    await withServer(app, async (baseUrl) => {
      const response = await requestJson(baseUrl, BASE, 'POST', { name: 'RBAC Blocked' });
      expect(response.status).toBe(403);
    });
    expect(assertAllowed).not.toHaveBeenCalled();
    expect(createWarehouse).not.toHaveBeenCalled();
  });
});
