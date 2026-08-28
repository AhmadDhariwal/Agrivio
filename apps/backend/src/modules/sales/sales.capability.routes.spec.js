import { createServer } from 'node:http';
import express from 'express';
import { describe, expect, it, vi } from 'vitest';
import errorHandlerModule from '../../platform/errors/error-handler.middleware';
import appErrorModule from '../../platform/errors/app-error';
import requestIdModule from '../../platform/http/request-id.middleware';
import salesRoutesModule from './routes/sales.routes';
import returnsRoutesModule from '../returns-corrections/routes/returns.routes';

const { createErrorHandlerMiddleware } = errorHandlerModule;
const { orgActionNotAllowed, orgCapabilityDisabled } = appErrorModule;
const { createRequestIdMiddleware } = requestIdModule;
const { registerSalesRoutes } = salesRoutesModule;
const { registerReturnsRoutes } = returnsRoutesModule;

async function withServer(app, work) {
  const server = createServer(app);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(undefined));
  });
  try {
    const address = server.address();
    if (address === null || typeof address === 'string') throw new Error('Expected TCP port');
    await work(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve(undefined)));
    });
  }
}

function serviceWith() {
  return {
    listSales: vi.fn(async () => ({ items: [], total: 0 })),
    getSale: vi.fn(async () => ({})),
    getSalePrintInvoice: vi.fn(async () => ({})),
    listPosPaymentAccounts: vi.fn(async () => ({ items: [] })),
    createSaleDraft: vi.fn(async () => ({})),
    updateSaleDraft: vi.fn(async () => ({})),
    discardSaleDraft: vi.fn(async () => ({})),
    postSale: vi.fn(async () => ({ data: {} })),
    cancelSale: vi.fn(async () => ({ data: {} })),
  };
}

function auth(permissions) {
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

function buildApp(assertAllowed, salesService, permissions = [
  'sales.view',
  'sales.create',
  'sales.post',
  'sales.cancel',
]) {
  const app = express();
  app.use(express.json());
  app.use(createRequestIdMiddleware());
  app.use(
    registerSalesRoutes({
      requireAuth: auth(permissions),
      requireCsrf: (_req, _res, next) => next(),
      requireOperationalAccess: (_req, _res, next) => next(),
      capabilityService: { assertAllowed },
      salesService,
    }),
  );
  app.use(createErrorHandlerMiddleware('test', () => undefined));
  return app;
}

function buildSalesReturnApp(assertAllowed, createSalesReturnDraft) {
  const app = express();
  app.use(express.json());
  app.use(createRequestIdMiddleware());
  app.use(
    registerReturnsRoutes({
      requireAuth: auth(['returns.post']),
      requireCsrf: (_req, _res, next) => next(),
      requireOperationalAccess: (_req, _res, next) => next(),
      capabilityService: { assertAllowed },
      returnsService: { createSalesReturnDraft },
    }),
  );
  app.use(createErrorHandlerMiddleware('test', () => undefined));
  return app;
}

const ENDPOINTS = [
  ['/api/v1/sales', 'GET'],
  ['/api/v1/sales', 'POST'],
  ['/api/v1/sales/payment-accounts', 'GET'],
  ['/api/v1/sales/sale-1', 'GET'],
  ['/api/v1/sales/sale-1/print', 'GET'],
  ['/api/v1/sales/sale-1', 'PATCH'],
  ['/api/v1/sales/sale-1', 'DELETE'],
  ['/api/v1/sales/sale-1/post', 'POST'],
  ['/api/v1/sales/sale-1/cancel', 'POST'],
];

describe('Sales capability route enforcement', () => {
  it('blocks every Sales endpoint when the organization module is disabled', async () => {
    const salesService = serviceWith();
    const assertAllowed = vi.fn(async (_organizationId, key) => {
      if (key === 'sales') throw orgCapabilityDisabled('Sales disabled');
    });
    await withServer(buildApp(assertAllowed, salesService), async (baseUrl) => {
      for (const [path, method] of ENDPOINTS) {
        const response = await fetch(`${baseUrl}${path}`, { method });
        expect(response.status).toBe(403);
        expect((await response.json()).error.code).toBe('ORG_CAPABILITY_DISABLED');
      }
    });
    for (const method of Object.values(salesService)) expect(method).not.toHaveBeenCalled();
  });

  it.each([
    ['createDraft', '/api/v1/sales', 'POST', 'createSaleDraft'],
    ['addPaymentAtPost', '/api/v1/sales/payment-accounts', 'GET', 'listPosPaymentAccounts'],
    ['inspect', '/api/v1/sales/sale-1', 'GET', 'getSale'],
    ['print', '/api/v1/sales/sale-1/print', 'GET', 'getSalePrintInvoice'],
    ['editDraft', '/api/v1/sales/sale-1', 'PATCH', 'updateSaleDraft'],
    ['discardDraft', '/api/v1/sales/sale-1', 'DELETE', 'discardSaleDraft'],
    ['post', '/api/v1/sales/sale-1/post', 'POST', 'postSale'],
    ['cancel', '/api/v1/sales/sale-1/cancel', 'POST', 'cancelSale'],
  ])('blocks %s independently', async (action, path, method, serviceMethod) => {
    const salesService = serviceWith();
    const assertAllowed = vi.fn(async (_organizationId, key) => {
      if (key === `sales.actions.${action}`) throw orgActionNotAllowed(`${action} disabled`);
    });
    await withServer(buildApp(assertAllowed, salesService), async (baseUrl) => {
      const response = await fetch(`${baseUrl}${path}`, { method });
      expect(response.status).toBe(403);
      expect((await response.json()).error.code).toBe('ORG_ACTION_NOT_ALLOWED');
    });
    expect(salesService[serviceMethod]).not.toHaveBeenCalled();
  });

  it('keeps RBAC authoritative before capability evaluation', async () => {
    const assertAllowed = vi.fn();
    await withServer(buildApp(assertAllowed, serviceWith(), []), async (baseUrl) => {
      expect((await fetch(`${baseUrl}/api/v1/sales`)).status).toBe(403);
    });
    expect(assertAllowed).not.toHaveBeenCalled();
  });

  it('blocks linked Sales return launch after Returns safety checks', async () => {
    const createSalesReturnDraft = vi.fn(async () => ({}));
    const assertAllowed = vi.fn(async (_organizationId, key) => {
      if (key === 'sales.actions.createReturn') {
        throw orgActionNotAllowed('Linked Sales return disabled');
      }
    });
    await withServer(buildSalesReturnApp(assertAllowed, createSalesReturnDraft), async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/v1/sales/sale-1/returns`, { method: 'POST' });
      expect(response.status).toBe(403);
      expect((await response.json()).error.code).toBe('ORG_ACTION_NOT_ALLOWED');
    });
    expect(assertAllowed.mock.calls.map((call) => call[1])).toEqual([
      'returns',
      'returns.actions.post',
      'sales.actions.createReturn',
    ]);
    expect(createSalesReturnDraft).not.toHaveBeenCalled();
  });
});
