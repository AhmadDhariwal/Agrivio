import { createServer } from 'node:http';
import express from 'express';
import { describe, expect, it, vi } from 'vitest';
import errorHandlerModule from '../../platform/errors/error-handler.middleware';
import requestIdModule from '../../platform/http/request-id.middleware';
import routesModule from './routes/supplier-finance.routes';

const { createErrorHandlerMiddleware } = errorHandlerModule;
const { createRequestIdMiddleware } = requestIdModule;
const { registerSupplierFinanceRoutes } = routesModule;

async function withServer(app, work) {
  const server = createServer(app);
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', () => resolve()); });
  try { const address = server.address(); await work(`http://127.0.0.1:${address.port}`); }
  finally { await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve()))); }
}

function buildApp(permissions, service) {
  const app = express(); app.use(express.json()); app.use(createRequestIdMiddleware());
  app.use(registerSupplierFinanceRoutes({
    requireAuth: (req, _res, next) => { req.auth = { session: {}, user: {} }; req.authContext = { contextType: 'organization', organizationId: 'org-a', userId: 'user-a', permissions }; next(); },
    requireCsrf: (_req, _res, next) => next(),
    requireOperationalAccess: (_req, _res, next) => next(),
    supplierFinanceService: service,
  }));
  app.use(createErrorHandlerMiddleware('test', () => undefined));
  return app;
}

function service() {
  return {
    listRefunds: vi.fn(async () => ({ items: [], total: 0, page: 1, pageSize: 25 })),
    postRefund: vi.fn(async () => ({ statusCode: 201, data: {} })),
    reverseRefund: vi.fn(async () => ({ statusCode: 200, data: {} })),
    adjustBalance: vi.fn(async () => ({ statusCode: 201, data: {} })),
    reverseAdjustment: vi.fn(async () => ({ statusCode: 200, data: {} })),
  };
}

describe('supplier finance route authorization', () => {
  it.each([
    ['GET', '/api/v1/supplier-refunds', [], 'listRefunds'],
    ['POST', '/api/v1/supplier-refunds', ['supplier-payments.post'], 'postRefund'],
    ['POST', '/api/v1/supplier-refunds/refund-1/reverse', ['payments.correct'], 'reverseRefund'],
    ['POST', '/api/v1/supplier-balance-adjustments', [], 'adjustBalance'],
    ['POST', '/api/v1/supplier-balance-adjustments/adjustment-1/reverse', [], 'reverseAdjustment'],
  ])('blocks %s %s when a required permission is missing', async (method, path, permissions, serviceMethod) => {
    const mock = service();
    await withServer(buildApp(permissions, mock), async (baseUrl) => {
      const response = await fetch(`${baseUrl}${path}`, { method, headers: { 'Content-Type': 'application/json' }, body: method === 'POST' ? '{}' : undefined });
      expect(response.status).toBe(403);
      expect((await response.json()).error.code).toBe('PERMISSION_DENIED');
    });
    expect(mock[serviceMethod]).not.toHaveBeenCalled();
  });

  it('allows refund and adjustment workflows with the frozen permission intersections', async () => {
    const mock = service();
    const permissions = ['supplier-payments.view', 'supplier-payments.post', 'accounts.transaction.post', 'payments.correct', 'accounts.transaction.correct', 'suppliers.manage'];
    await withServer(buildApp(permissions, mock), async (baseUrl) => {
      expect((await fetch(`${baseUrl}/api/v1/supplier-refunds`)).status).toBe(200);
      expect((await fetch(`${baseUrl}/api/v1/supplier-refunds`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status).toBe(201);
      expect((await fetch(`${baseUrl}/api/v1/supplier-refunds/refund-1/reverse`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status).toBe(200);
      expect((await fetch(`${baseUrl}/api/v1/supplier-balance-adjustments`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status).toBe(201);
    });
  });
});
