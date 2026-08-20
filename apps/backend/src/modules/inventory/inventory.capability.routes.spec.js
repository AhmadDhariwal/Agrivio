import { createServer } from 'node:http';
import express from 'express';
import { describe, expect, it, vi } from 'vitest';
import errorHandlerModule from '../../platform/errors/error-handler.middleware';
import appErrorModule from '../../platform/errors/app-error';
import requestIdModule from '../../platform/http/request-id.middleware';
import inventoryRoutesModule from './routes/inventory.routes';

const { createErrorHandlerMiddleware } = errorHandlerModule;
const { orgActionNotAllowed, orgCapabilityDisabled } = appErrorModule;
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

describe('Stock-on-Hand capability route enforcement', () => {
  it('blocks only balance inquiry when the target organization disables Stock on Hand', async () => {
    const listBalances = vi.fn(async () => ({ items: [], total: 0 }));
    const listMovements = vi.fn(async () => ({ items: [], total: 0 }));
    const assertAllowed = vi.fn(async (organizationId, key, mode) => {
      expect(organizationId).toBe('org-a');
      expect(key).toBe('inventory.stock');
      expect(mode).toBe('enabled');
      throw orgCapabilityDisabled('Stock on Hand is disabled', { controlKey: key });
    });
    const app = express();
    app.use(createRequestIdMiddleware());
    app.use(
      registerInventoryRoutes({
        requireAuth: (req, _res, next) => {
          req.auth = { session: {}, user: {} };
          req.authContext = {
            contextType: 'organization',
            organizationId: 'org-a',
            userId: 'user-a',
            permissions: ['inventory.view'],
          };
          next();
        },
        requireCsrf: (_req, _res, next) => next(),
        requireOperationalAccess: (_req, _res, next) => next(),
        capabilityService: { assertAllowed },
        inventoryService: {
          listBalances,
          listMovements,
        },
      }),
    );
    app.use(createErrorHandlerMiddleware('test', () => undefined));

    await withServer(app, async (baseUrl) => {
      const balances = await fetch(`${baseUrl}/api/v1/inventory/balances`);
      const balanceBody = await balances.json();
      expect(balances.status).toBe(403);
      expect(balanceBody.error.code).toBe('ORG_CAPABILITY_DISABLED');
      expect(listBalances).not.toHaveBeenCalled();

      const movements = await fetch(`${baseUrl}/api/v1/inventory/movements`);
      expect(movements.status).toBe(200);
      expect(listMovements).toHaveBeenCalledOnce();
      expect(assertAllowed).toHaveBeenCalledOnce();
    });
  });
});

describe('Opening Stock capability route enforcement', () => {
  it('checks both module access and the posting action before posting', async () => {
    const postOpeningStock = vi.fn();
    const assertAllowed = vi.fn(async (_organizationId, key, mode) => {
      if (key === 'inventory.openingStock') {
        expect(mode).toBe('enabled');
        return;
      }
      expect(key).toBe('inventory.openingStock.actions.post');
      expect(mode).toBe('allowed');
      throw orgActionNotAllowed('Post Opening Stock is not allowed', { controlKey: key });
    });
    const app = express();
    app.use(createRequestIdMiddleware());
    app.use(
      registerInventoryRoutes({
        requireAuth: (req, _res, next) => {
          req.auth = { session: {}, user: {} };
          req.authContext = {
            contextType: 'organization',
            organizationId: 'org-a',
            userId: 'user-a',
            permissions: ['inventory.view', 'inventory.opening-stock.post'],
          };
          next();
        },
        requireCsrf: (_req, _res, next) => next(),
        requireOperationalAccess: (_req, _res, next) => next(),
        capabilityService: { assertAllowed },
        inventoryService: { postOpeningStock },
      }),
    );
    app.use(createErrorHandlerMiddleware('test', () => undefined));

    await withServer(app, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/v1/inventory/opening-stock`, {
        method: 'POST',
      });
      const body = await response.json();
      expect(response.status).toBe(403);
      expect(body.error.code).toBe('ORG_ACTION_NOT_ALLOWED');
      expect(postOpeningStock).not.toHaveBeenCalled();
      expect(assertAllowed).toHaveBeenCalledTimes(2);
    });
  });

  it('blocks posting at the module boundary when Opening Stock is disabled', async () => {
    const postOpeningStock = vi.fn();
    const assertAllowed = vi.fn(async (_organizationId, key) => {
      expect(key).toBe('inventory.openingStock');
      throw orgCapabilityDisabled('Opening Stock is disabled', { controlKey: key });
    });
    const app = express();
    app.use(createRequestIdMiddleware());
    app.use(
      registerInventoryRoutes({
        requireAuth: (req, _res, next) => {
          req.auth = { session: {}, user: {} };
          req.authContext = {
            contextType: 'organization',
            organizationId: 'org-a',
            userId: 'user-a',
            permissions: ['inventory.view', 'inventory.opening-stock.post'],
          };
          next();
        },
        requireCsrf: (_req, _res, next) => next(),
        requireOperationalAccess: (_req, _res, next) => next(),
        capabilityService: { assertAllowed },
        inventoryService: { postOpeningStock },
      }),
    );
    app.use(createErrorHandlerMiddleware('test', () => undefined));

    await withServer(app, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/v1/inventory/opening-stock`, {
        method: 'POST',
      });
      const body = await response.json();
      expect(response.status).toBe(403);
      expect(body.error.code).toBe('ORG_CAPABILITY_DISABLED');
      expect(postOpeningStock).not.toHaveBeenCalled();
      expect(assertAllowed).toHaveBeenCalledOnce();
    });
  });
});
