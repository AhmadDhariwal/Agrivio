import { createServer } from 'node:http';
import express from 'express';
import { describe, expect, it, vi } from 'vitest';
import errorHandlerModule from '../../platform/errors/error-handler.middleware';
import appErrorModule from '../../platform/errors/app-error';
import requestIdModule from '../../platform/http/request-id.middleware';
import inventoryRoutesModule from './routes/inventory.routes';

const { createErrorHandlerMiddleware } = errorHandlerModule;
const { orgCapabilityDisabled } = appErrorModule;
const { createRequestIdMiddleware } = requestIdModule;
const { registerInventoryRoutes } = inventoryRoutesModule;

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

function buildApp({ assertAllowed, inventoryService, organizationId = 'org-a', permissions }) {
  const app = express();
  app.use(createRequestIdMiddleware());
  app.use(
    registerInventoryRoutes({
      requireAuth: (req, _res, next) => {
        req.auth = { session: {}, user: {} };
        req.authContext = {
          contextType: 'organization',
          organizationId,
          userId: 'user-a',
          permissions: permissions ?? ['inventory.view'],
        };
        next();
      },
      requireCsrf: (_req, _res, next) => next(),
      requireOperationalAccess: (_req, _res, next) => next(),
      capabilityService: { assertAllowed },
      inventoryService,
    }),
  );
  app.use(createErrorHandlerMiddleware('test', () => undefined));
  return app;
}

describe('Stock Movements capability route enforcement', () => {
  it('blocks org-a movement list when its module is disabled', async () => {
    const listMovements = vi.fn();
    const assertAllowed = vi.fn(async (organizationId, key, mode) => {
      expect(organizationId).toBe('org-a');
      expect(key).toBe('inventory.movements');
      expect(mode).toBe('enabled');
      throw orgCapabilityDisabled('Stock Movements is disabled', { controlKey: key });
    });
    const app = buildApp({ assertAllowed, inventoryService: { listMovements } });

    await withServer(app, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/v1/inventory/movements`);
      expect(response.status).toBe(403);
      expect((await response.json()).error.code).toBe('ORG_CAPABILITY_DISABLED');
      expect(listMovements).not.toHaveBeenCalled();
    });
  });

  it('allows org-b movement list when its module remains enabled', async () => {
    const listMovements = vi.fn(async () => ({ items: [], total: 0 }));
    const assertAllowed = vi.fn(async (organizationId, key, mode) => {
      expect(organizationId).toBe('org-b');
      expect(key).toBe('inventory.movements');
      expect(mode).toBe('enabled');
    });
    const app = buildApp({
      assertAllowed,
      inventoryService: { listMovements },
      organizationId: 'org-b',
    });

    await withServer(app, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/v1/inventory/movements`);
      expect(response.status).toBe(200);
      expect(listMovements).toHaveBeenCalledOnce();
    });
  });

  it('does not apply the movement gate to balances, batches, or reconciliation', async () => {
    const listBalances = vi.fn(async () => ({ items: [], total: 0 }));
    const listBatches = vi.fn(async () => ({ items: [], total: 0 }));
    const reconcileInventory = vi.fn(async () => ({ items: [], total: 0 }));
    const assertAllowed = vi.fn(async (_organizationId, key) => {
      if (key === 'inventory.movements') {
        throw orgCapabilityDisabled('Stock Movements is disabled', { controlKey: key });
      }
    });
    const app = buildApp({
      assertAllowed,
      inventoryService: { listBalances, listBatches, reconcileInventory },
    });

    await withServer(app, async (baseUrl) => {
      expect((await fetch(`${baseUrl}/api/v1/inventory/balances`)).status).toBe(200);
      expect((await fetch(`${baseUrl}/api/v1/inventory/batches`)).status).toBe(200);
      expect((await fetch(`${baseUrl}/api/v1/inventory/reconciliation`)).status).toBe(200);
    });
    expect(listBalances).toHaveBeenCalledOnce();
    expect(listBatches).toHaveBeenCalledOnce();
    expect(reconcileInventory).toHaveBeenCalledOnce();
    expect(assertAllowed).not.toHaveBeenCalledWith(
      expect.anything(),
      'inventory.movements',
      expect.anything(),
      expect.anything(),
    );
  });

  it('keeps RBAC authoritative before the capability middleware', async () => {
    const listMovements = vi.fn();
    const assertAllowed = vi.fn();
    const app = buildApp({
      assertAllowed,
      inventoryService: { listMovements },
      permissions: [],
    });

    await withServer(app, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/v1/inventory/movements`);
      expect(response.status).toBe(403);
    });
    expect(assertAllowed).not.toHaveBeenCalled();
    expect(listMovements).not.toHaveBeenCalled();
  });
});
