import { createServer } from 'node:http';
import express from 'express';
import { describe, expect, it, vi } from 'vitest';
import errorHandlerModule from '../../platform/errors/error-handler.middleware';
import appErrorModule from '../../platform/errors/app-error';
import requestIdModule from '../../platform/http/request-id.middleware';
import paymentsRoutesModule from './routes/payments.routes';

const { createErrorHandlerMiddleware } = errorHandlerModule;
const { orgActionNotAllowed, orgCapabilityDisabled } = appErrorModule;
const { createRequestIdMiddleware } = requestIdModule;
const { registerPaymentsRoutes } = paymentsRoutesModule;

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
    listSupplierPayments: vi.fn(async () => ({ items: [], total: 0 })),
    postSupplierPayment: vi.fn(async () => ({ statusCode: 201, data: {} })),
    getSupplierPayment: vi.fn(async () => ({})),
    listSupplierLedgerSuppliers: vi.fn(async () => ({ items: [] })),
    listSupplierLedger: vi.fn(async () => ({ items: [] })),
    listUnpaidPurchasesForSupplier: vi.fn(async () => []),
    reconcileSupplierLedger: vi.fn(async () => ({})),
    listCustomerPayments: vi.fn(async () => ({ items: [], total: 0 })),
    postCustomerPayment: vi.fn(async () => ({ statusCode: 201, data: {} })),
    getCustomerPayment: vi.fn(async () => ({})),
    listCustomerLedger: vi.fn(async () => []),
    correctPayment: vi.fn(async () => ({ statusCode: 201, data: {} })),
  };
}

function buildApp(
  assertAllowed,
  paymentsService,
  permissions = ['supplier-payments.view', 'supplier-payments.post', 'payments.correct'],
) {
  const app = express();
  app.use(express.json());
  app.use(createRequestIdMiddleware());
  app.use(
    registerPaymentsRoutes({
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
      paymentsService,
    }),
  );
  app.use(createErrorHandlerMiddleware('test', () => undefined));
  return app;
}

const SUPPLIER_ENDPOINTS = [
  ['/api/v1/supplier-payments', 'GET'],
  ['/api/v1/supplier-payments', 'POST'],
  ['/api/v1/supplier-payments/payment-1', 'GET'],
  ['/api/v1/suppliers/supplier-1/unpaid-purchases', 'GET'],
];

const SUPPLIER_LEDGER_ENDPOINTS = [
  ['/api/v1/supplier-ledger/suppliers', 'GET'],
  ['/api/v1/suppliers/supplier-1/ledger', 'GET'],
  ['/api/v1/suppliers/supplier-1/reconciliation', 'GET'],
];

describe('Supplier Payments capability route enforcement', () => {
  it('blocks Supplier Payments without disabling direct Supplier Ledger endpoints', async () => {
    const paymentsService = serviceWith();
    const assertAllowed = vi.fn(async (_organizationId, key) => {
      if (key === 'payments.supplier') throw orgCapabilityDisabled('Supplier Payments disabled');
    });
    await withServer(buildApp(assertAllowed, paymentsService), async (baseUrl) => {
      for (const [path, method] of SUPPLIER_ENDPOINTS) {
        const response = await fetch(`${baseUrl}${path}`, { method });
        expect(response.status).toBe(403);
        expect((await response.json()).error.code).toBe('ORG_CAPABILITY_DISABLED');
      }
      for (const [path, method] of SUPPLIER_LEDGER_ENDPOINTS) {
        expect((await fetch(`${baseUrl}${path}`, { method })).status).toBe(200);
      }
    });
    expect(paymentsService.listSupplierPayments).not.toHaveBeenCalled();
    expect(paymentsService.postSupplierPayment).not.toHaveBeenCalled();
    expect(paymentsService.getSupplierPayment).not.toHaveBeenCalled();
    expect(paymentsService.listUnpaidPurchasesForSupplier).not.toHaveBeenCalled();
    expect(paymentsService.listSupplierLedger).toHaveBeenCalled();
    expect(paymentsService.reconcileSupplierLedger).toHaveBeenCalled();
  });

  it.each([
    ['post', '/api/v1/supplier-payments', 'POST', 'postSupplierPayment'],
    ['inspect', '/api/v1/supplier-payments/payment-1', 'GET', 'getSupplierPayment'],
  ])('blocks %s independently', async (action, path, method, serviceMethod) => {
    const paymentsService = serviceWith();
    const assertAllowed = vi.fn(async (_organizationId, key) => {
      if (key === `payments.supplier.actions.${action}`) {
        throw orgActionNotAllowed(`${action} disabled`);
      }
    });
    await withServer(buildApp(assertAllowed, paymentsService), async (baseUrl) => {
      const response = await fetch(`${baseUrl}${path}`, { method });
      expect(response.status).toBe(403);
      expect((await response.json()).error.code).toBe('ORG_ACTION_NOT_ALLOWED');
    });
    expect(paymentsService[serviceMethod]).not.toHaveBeenCalled();
  });

  it('blocks every Supplier Ledger read when its own submodule is disabled', async () => {
    const paymentsService = serviceWith();
    const assertAllowed = vi.fn(async (_organizationId, key) => {
      if (key === 'payments.supplierLedger')
        throw orgCapabilityDisabled('Supplier Ledger disabled');
    });
    await withServer(buildApp(assertAllowed, paymentsService), async (baseUrl) => {
      for (const [path, method] of SUPPLIER_LEDGER_ENDPOINTS) {
        const response = await fetch(`${baseUrl}${path}`, { method });
        expect(response.status).toBe(403);
        expect((await response.json()).error.code).toBe('ORG_CAPABILITY_DISABLED');
      }
      expect((await fetch(`${baseUrl}/api/v1/supplier-payments`)).status).toBe(200);
    });
    expect(paymentsService.listSupplierLedgerSuppliers).not.toHaveBeenCalled();
    expect(paymentsService.listSupplierLedger).not.toHaveBeenCalled();
    expect(paymentsService.reconcileSupplierLedger).not.toHaveBeenCalled();
  });

  it('blocks the reconciliation summary feature independently', async () => {
    const paymentsService = serviceWith();
    const assertAllowed = vi.fn(async (_organizationId, key) => {
      if (key === 'payments.supplierLedger.features.reconciliationSummary') {
        throw orgCapabilityDisabled('Reconciliation summary disabled');
      }
    });
    await withServer(buildApp(assertAllowed, paymentsService), async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/v1/suppliers/supplier-1/reconciliation`);
      expect(response.status).toBe(403);
      expect((await response.json()).error.code).toBe('ORG_CAPABILITY_DISABLED');
    });
    expect(paymentsService.reconcileSupplierLedger).not.toHaveBeenCalled();
  });

  it('keeps ledger supplier lookup available when only search presentation is disabled', async () => {
    const paymentsService = serviceWith();
    const assertAllowed = vi.fn(async (_organizationId, key) => {
      if (key === 'payments.supplierLedger.features.supplierSearch') {
        throw orgCapabilityDisabled('Supplier search disabled');
      }
    });
    await withServer(buildApp(assertAllowed, paymentsService), async (baseUrl) => {
      expect((await fetch(`${baseUrl}/api/v1/supplier-ledger/suppliers`)).status).toBe(200);
    });
    expect(paymentsService.listSupplierLedgerSuppliers).toHaveBeenCalledWith('org-a', '');
  });

  it('keeps RBAC authoritative before capability evaluation', async () => {
    const assertAllowed = vi.fn();
    await withServer(buildApp(assertAllowed, serviceWith(), []), async (baseUrl) => {
      expect((await fetch(`${baseUrl}/api/v1/supplier-payments`)).status).toBe(403);
    });
    expect(assertAllowed).not.toHaveBeenCalled();
  });

  it('keeps Supplier Ledger RBAC authoritative before capability evaluation', async () => {
    const assertAllowed = vi.fn();
    await withServer(buildApp(assertAllowed, serviceWith(), []), async (baseUrl) => {
      for (const [path] of SUPPLIER_LEDGER_ENDPOINTS) {
        expect((await fetch(`${baseUrl}${path}`)).status).toBe(403);
      }
    });
    expect(assertAllowed).not.toHaveBeenCalled();
  });

  it('does not apply Supplier Payments controls to Customer Payments endpoints', async () => {
    const paymentsService = serviceWith();
    const assertAllowed = vi.fn(async () => {
      throw orgCapabilityDisabled('Supplier Payments disabled');
    });
    await withServer(
      buildApp(assertAllowed, paymentsService, ['customer-payments.view']),
      async (baseUrl) => {
        expect((await fetch(`${baseUrl}/api/v1/customer-payments`)).status).toBe(200);
      },
    );
    expect(assertAllowed).not.toHaveBeenCalled();
  });

  it('forwards paymentDate, supplierId, and pagination parameters to paymentsService', async () => {
    const paymentsService = serviceWith();
    const assertAllowed = vi.fn();
    await withServer(buildApp(assertAllowed, paymentsService), async (baseUrl) => {
      const response = await fetch(
        `${baseUrl}/api/v1/supplier-payments?paymentDate=2026-08-12&supplierId=sup-1&page=2&pageSize=10`,
      );
      expect(response.status).toBe(200);
      expect(paymentsService.listSupplierPayments).toHaveBeenCalledWith('org-a', {
        supplierId: 'sup-1',
        paymentDate: '2026-08-12',
        skip: 10,
        pageSize: 10,
      });
    });
  });

  it('forwards bounded supplier search to the ledger-owned lookup', async () => {
    const paymentsService = serviceWith();
    await withServer(buildApp(vi.fn(), paymentsService), async (baseUrl) => {
      expect((await fetch(`${baseUrl}/api/v1/supplier-ledger/suppliers?search=agri`)).status).toBe(
        200,
      );
    });
    expect(paymentsService.listSupplierLedgerSuppliers).toHaveBeenCalledWith('org-a', 'agri');
  });
});
