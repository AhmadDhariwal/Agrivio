import { createServer } from 'node:http';
import express from 'express';
import { describe, expect, it, vi } from 'vitest';
import errorHandlerModule from '../../platform/errors/error-handler.middleware';
import appErrorModule from '../../platform/errors/app-error';
import requestIdModule from '../../platform/http/request-id.middleware';
import purchasesRoutesModule from './routes/purchases.routes';
import returnsRoutesModule from '../returns-corrections/routes/returns.routes';

const { createErrorHandlerMiddleware } = errorHandlerModule;
const { orgActionNotAllowed, orgCapabilityDisabled } = appErrorModule;
const { createRequestIdMiddleware } = requestIdModule;
const { registerPurchasesRoutes } = purchasesRoutesModule;
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
    listPurchases: vi.fn(async () => ({ items: [], total: 0 })),
    getPurchase: vi.fn(async () => ({})),
    createPurchaseDraft: vi.fn(async () => ({})),
    updatePurchaseDraft: vi.fn(async () => ({})),
    discardPurchaseDraft: vi.fn(async () => ({})),
    postPurchase: vi.fn(async () => ({ data: {} })),
    cancelPurchase: vi.fn(async () => ({ data: {} })),
  };
}

function buildApp(assertAllowed, purchasesService, permissions = [
  'purchases.view',
  'purchases.create',
  'purchases.post',
  'purchases.cancel',
]) {
  const app = express();
  app.use(express.json());
  app.use(createRequestIdMiddleware());
  app.use(
    registerPurchasesRoutes({
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
      capabilityService: { assertAllowed },
      purchasesService,
    }),
  );
  app.use(createErrorHandlerMiddleware('test', () => undefined));
  return app;
}

function buildPurchaseReturnApp(assertAllowed, createPurchaseReturnDraft) {
  const app = express();
  app.use(express.json());
  app.use(createRequestIdMiddleware());
  app.use(
    registerReturnsRoutes({
      requireAuth: (req, _res, next) => {
        req.auth = { session: {}, user: {} };
        req.authContext = {
          contextType: 'organization',
          organizationId: 'org-a',
          userId: 'user-a',
          permissions: ['returns.post', 'purchases.return'],
        };
        next();
      },
      requireCsrf: (_req, _res, next) => next(),
      requireOperationalAccess: (_req, _res, next) => next(),
      capabilityService: { assertAllowed },
      returnsService: { createPurchaseReturnDraft },
    }),
  );
  app.use(createErrorHandlerMiddleware('test', () => undefined));
  return app;
}

const ENDPOINTS = [
  ['/api/v1/purchases', 'GET'],
  ['/api/v1/purchases', 'POST'],
  ['/api/v1/purchases/purchase-1', 'GET'],
  ['/api/v1/purchases/purchase-1', 'PATCH'],
  ['/api/v1/purchases/purchase-1', 'DELETE'],
  ['/api/v1/purchases/purchase-1/post', 'POST'],
  ['/api/v1/purchases/purchase-1/cancel', 'POST'],
];

describe('Purchases capability route enforcement', () => {
  it('blocks every Purchases endpoint when the organization module is disabled', async () => {
    const purchasesService = serviceWith();
    const assertAllowed = vi.fn(async (_organizationId, key) => {
      if (key === 'purchases') throw orgCapabilityDisabled('Purchases disabled');
    });
    await withServer(buildApp(assertAllowed, purchasesService), async (baseUrl) => {
      for (const [path, method] of ENDPOINTS) {
        const response = await fetch(`${baseUrl}${path}`, { method });
        expect(response.status).toBe(403);
        expect((await response.json()).error.code).toBe('ORG_CAPABILITY_DISABLED');
      }
    });
    for (const method of Object.values(purchasesService)) expect(method).not.toHaveBeenCalled();
  });

  it.each([
    ['createDraft', '/api/v1/purchases', 'POST', 'createPurchaseDraft'],
    ['inspect', '/api/v1/purchases/purchase-1', 'GET', 'getPurchase'],
    ['editDraft', '/api/v1/purchases/purchase-1', 'PATCH', 'updatePurchaseDraft'],
    ['discardDraft', '/api/v1/purchases/purchase-1', 'DELETE', 'discardPurchaseDraft'],
    ['post', '/api/v1/purchases/purchase-1/post', 'POST', 'postPurchase'],
    ['cancel', '/api/v1/purchases/purchase-1/cancel', 'POST', 'cancelPurchase'],
  ])('blocks %s independently', async (action, path, method, serviceMethod) => {
    const purchasesService = serviceWith();
    const assertAllowed = vi.fn(async (_organizationId, key) => {
      if (key === `purchases.actions.${action}`) throw orgActionNotAllowed(`${action} disabled`);
    });
    await withServer(buildApp(assertAllowed, purchasesService), async (baseUrl) => {
      const response = await fetch(`${baseUrl}${path}`, { method });
      expect(response.status).toBe(403);
      expect((await response.json()).error.code).toBe('ORG_ACTION_NOT_ALLOWED');
    });
    expect(purchasesService[serviceMethod]).not.toHaveBeenCalled();
  });

  it('keeps RBAC authoritative before capability evaluation', async () => {
    const assertAllowed = vi.fn();
    await withServer(buildApp(assertAllowed, serviceWith(), []), async (baseUrl) => {
      expect((await fetch(`${baseUrl}/api/v1/purchases`)).status).toBe(403);
    });
    expect(assertAllowed).not.toHaveBeenCalled();
  });

  it('blocks linked purchase-return launch independently after Returns safety checks', async () => {
    const createPurchaseReturnDraft = vi.fn(async () => ({}));
    const assertAllowed = vi.fn(async (_organizationId, key) => {
      if (key === 'purchases.actions.createReturn') {
        throw orgActionNotAllowed('Purchase return disabled');
      }
    });
    await withServer(buildPurchaseReturnApp(assertAllowed, createPurchaseReturnDraft), async (baseUrl) => {
      for (const path of ['/api/v1/returns', '/api/v1/purchases/purchase-1/returns']) {
        const response = await fetch(`${baseUrl}${path}`, { method: 'POST' });
        expect(response.status).toBe(403);
        expect((await response.json()).error.code).toBe('ORG_ACTION_NOT_ALLOWED');
      }
    });
    expect(assertAllowed.mock.calls.map((call) => call[1])).toEqual([
      'returns',
      'returns.actions.post',
      'purchases.actions.createReturn',
      'returns',
      'returns.actions.post',
      'purchases.actions.createReturn',
    ]);
    expect(createPurchaseReturnDraft).not.toHaveBeenCalled();
  });
});
