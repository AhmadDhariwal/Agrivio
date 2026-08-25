import { createServer } from 'node:http';
import express from 'express';
import { describe, expect, it, vi } from 'vitest';
import errorHandlerModule from '../../platform/errors/error-handler.middleware';
import appErrorModule from '../../platform/errors/app-error';
import requestIdModule from '../../platform/http/request-id.middleware';
import suppliersRoutesModule from './routes/suppliers.routes';

const { createErrorHandlerMiddleware } = errorHandlerModule;
const { orgActionNotAllowed, orgCapabilityDisabled } = appErrorModule;
const { createRequestIdMiddleware } = requestIdModule;
const { registerSuppliersRoutes } = suppliersRoutesModule;

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

function buildApp({ assertAllowed, suppliersService, organizationId = 'org-a', permissions }) {
  const app = express();
  app.use(createRequestIdMiddleware());
  app.use(
    registerSuppliersRoutes({
      requireAuth: (req, _res, next) => {
        req.auth = { session: {}, user: {} };
        req.authContext = {
          contextType: 'organization',
          organizationId,
          userId: 'user-a',
          permissions: permissions ?? [
            'suppliers.view',
            'suppliers.manage',
            'suppliers.opening-balance.post',
          ],
        };
        next();
      },
      requireCsrf: (_req, _res, next) => next(),
      requireOperationalAccess: (_req, _res, next) => next(),
      capabilityService: { assertAllowed },
      suppliersService,
    }),
  );
  app.use(createErrorHandlerMiddleware('test', () => undefined));
  return app;
}

const BASE = '/api/v1/suppliers';

describe('Suppliers capability route enforcement', () => {
  it('blocks every Supplier API operation for only the disabled organization', async () => {
    const suppliersService = {
      listSuppliers: vi.fn(),
      getSupplier: vi.fn(),
      createSupplier: vi.fn(),
      updateSupplier: vi.fn(),
      deleteSupplier: vi.fn(),
      postOpeningBalance: vi.fn(),
    };
    const assertAllowed = vi.fn(async (organizationId, key, mode) => {
      expect(organizationId).toBe('org-a');
      if (key === 'suppliers') {
        expect(mode).toBe('enabled');
        throw orgCapabilityDisabled('Suppliers is disabled', { controlKey: key });
      }
    });
    const app = buildApp({ assertAllowed, suppliersService });

    await withServer(app, async (baseUrl) => {
      for (const [path, method] of [
        [BASE, 'GET'],
        [`${BASE}/supplier-1`, 'GET'],
        [BASE, 'POST'],
        [`${BASE}/supplier-1`, 'PATCH'],
        [`${BASE}/supplier-1`, 'DELETE'],
        [`${BASE}/supplier-1/opening-balance`, 'POST'],
      ]) {
        const response = await fetch(`${baseUrl}${path}`, { method });
        expect(response.status).toBe(403);
        expect((await response.json()).error.code).toBe('ORG_CAPABILITY_DISABLED');
      }
    });
    for (const method of Object.values(suppliersService)) {
      expect(method).not.toHaveBeenCalled();
    }
  });

  it.each([
    ['create', BASE, 'POST', 'createSupplier'],
    ['edit', `${BASE}/supplier-1`, 'PATCH', 'updateSupplier'],
    ['delete', `${BASE}/supplier-1`, 'DELETE', 'deleteSupplier'],
    ['postOpeningBalance', `${BASE}/supplier-1/opening-balance`, 'POST', 'postOpeningBalance'],
  ])('blocks %s when its action is disabled', async (action, path, method, serviceMethod) => {
    const suppliersService = { [serviceMethod]: vi.fn() };
    const assertAllowed = vi.fn(async (_organizationId, key, mode) => {
      if (key === 'suppliers') return;
      if (key === `suppliers.actions.${action}`) {
        expect(mode).toBe('allowed');
        throw orgActionNotAllowed(`${action} is disabled`, { controlKey: key });
      }
    });
    const app = buildApp({ assertAllowed, suppliersService });

    await withServer(app, async (baseUrl) => {
      const response = await fetch(`${baseUrl}${path}`, { method });
      expect(response.status).toBe(403);
      expect((await response.json()).error.code).toBe('ORG_ACTION_NOT_ALLOWED');
    });
    expect(suppliersService[serviceMethod]).not.toHaveBeenCalled();
  });

  it('keeps RBAC authoritative before capability evaluation', async () => {
    const listSuppliers = vi.fn();
    const assertAllowed = vi.fn();
    const app = buildApp({
      assertAllowed,
      suppliersService: { listSuppliers },
      permissions: [],
    });

    await withServer(app, async (baseUrl) => {
      expect((await fetch(`${baseUrl}${BASE}`)).status).toBe(403);
    });
    expect(assertAllowed).not.toHaveBeenCalled();
    expect(listSuppliers).not.toHaveBeenCalled();
  });

  it('passes the tenant organization to the module gate when Suppliers is enabled', async () => {
    const listSuppliers = vi.fn(async () => ({ items: [], total: 0 }));
    const assertAllowed = vi.fn(async (organizationId, key, mode) => {
      expect(organizationId).toBe('org-b');
      expect(key).toBe('suppliers');
      expect(mode).toBe('enabled');
    });
    const app = buildApp({
      assertAllowed,
      suppliersService: { listSuppliers },
      organizationId: 'org-b',
    });

    await withServer(app, async (baseUrl) => {
      expect((await fetch(`${baseUrl}${BASE}`)).status).toBe(200);
    });
    expect(listSuppliers).toHaveBeenCalledWith(
      'org-b',
      expect.objectContaining({ pageSize: 25, skip: 0 }),
    );
  });
});
