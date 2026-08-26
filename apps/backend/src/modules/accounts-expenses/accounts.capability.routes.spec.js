import { createServer } from 'node:http';
import express from 'express';
import { describe, expect, it, vi } from 'vitest';
import errorHandlerModule from '../../platform/errors/error-handler.middleware';
import appErrorModule from '../../platform/errors/app-error';
import requestIdModule from '../../platform/http/request-id.middleware';
import accountsRoutesModule from './routes/accounts.routes';

const { createErrorHandlerMiddleware } = errorHandlerModule;
const { orgActionNotAllowed, orgCapabilityDisabled } = appErrorModule;
const { createRequestIdMiddleware } = requestIdModule;
const { registerAccountsRoutes } = accountsRoutesModule;

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

const ALL_PERMISSIONS = [
  'accounts.view',
  'accounts.manage',
  'accounts.opening-balance.post',
  'accounts.transaction.post',
  'accounts.transaction.correct',
  'accounts.transfer',
  'accounts.transfer.reverse',
];

function buildApp({ assertAllowed, accountsService, permissions = ALL_PERMISSIONS, organizationId = 'org-a' }) {
  const app = express();
  app.use(express.json());
  app.use(createRequestIdMiddleware());
  app.use(
    registerAccountsRoutes({
      requireAuth: (req, _res, next) => {
        req.auth = { session: {}, user: {} };
        req.authContext = {
          contextType: 'organization',
          organizationId,
          userId: 'user-a',
          permissions,
        };
        next();
      },
      requireCsrf: (_req, _res, next) => next(),
      requireOperationalAccess: (_req, _res, next) => next(),
      capabilityService: { assertAllowed },
      accountsService,
    }),
  );
  app.use(createErrorHandlerMiddleware('test', () => undefined));
  return app;
}

function serviceWith(overrides = {}) {
  return {
    listAccounts: vi.fn(async () => ({ items: [], total: 0 })),
    getAccountsSummary: vi.fn(async () => ({ totalAccounts: 0, activeAccounts: 0, inactiveAccounts: 0, totalBalance: { amount: '0.00', currency: 'PKR' } })),
    getAccount: vi.fn(async () => ({})),
    createAccount: vi.fn(async () => ({})),
    updateAccount: vi.fn(async () => ({})),
    deleteAccount: vi.fn(async () => ({})),
    postOpeningBalance: vi.fn(async () => ({ data: {} })),
    listAccountMovements: vi.fn(async () => ({ items: [], total: 0 })),
    postManualAccountTransaction: vi.fn(async () => ({ data: {} })),
    getManualAccountTransaction: vi.fn(async () => ({})),
    reverseManualAccountTransaction: vi.fn(async () => ({ data: {} })),
    postAccountTransfer: vi.fn(async () => ({ data: {} })),
    reverseAccountTransfer: vi.fn(async () => ({ data: {} })),
    ...overrides,
  };
}

const ENDPOINTS = [
  ['/api/v1/accounts', 'GET'],
  ['/api/v1/accounts/summary', 'GET'],
  ['/api/v1/accounts', 'POST'],
  ['/api/v1/accounts/account-1', 'GET'],
  ['/api/v1/accounts/account-1', 'PATCH'],
  ['/api/v1/accounts/account-1', 'DELETE'],
  ['/api/v1/accounts/account-1/opening-balance', 'POST'],
  ['/api/v1/accounts/account-1/movements', 'GET'],
  ['/api/v1/account-transactions', 'POST'],
  ['/api/v1/account-transactions/transaction-1', 'GET'],
  ['/api/v1/account-transactions/transaction-1/reverse', 'POST'],
  ['/api/v1/account-transfers', 'POST'],
  ['/api/v1/account-transfers/transfer-1/reverse', 'POST'],
];

describe('Accounts capability route enforcement', () => {
  it('blocks every Accounts endpoint for only a disabled organization', async () => {
    const accountsService = serviceWith();
    const assertAllowed = vi.fn(async (organizationId, key) => {
      expect(organizationId).toBe('org-a');
      if (key === 'accounts') throw orgCapabilityDisabled('Accounts disabled', { controlKey: key });
    });
    const app = buildApp({ assertAllowed, accountsService });
    await withServer(app, async (baseUrl) => {
      for (const [path, method] of ENDPOINTS) {
        const response = await fetch(`${baseUrl}${path}`, { method });
        expect(response.status).toBe(403);
        expect((await response.json()).error.code).toBe('ORG_CAPABILITY_DISABLED');
      }
    });
    for (const method of Object.values(accountsService)) expect(method).not.toHaveBeenCalled();
  });

  it.each([
    ['create', '/api/v1/accounts', 'POST', 'createAccount'],
    ['inspect', '/api/v1/accounts/account-1', 'GET', 'getAccount'],
    ['delete', '/api/v1/accounts/account-1', 'DELETE', 'deleteAccount'],
    ['postOpeningBalance', '/api/v1/accounts/account-1/opening-balance', 'POST', 'postOpeningBalance'],
    ['postManualMovement', '/api/v1/account-transactions', 'POST', 'postManualAccountTransaction'],
    ['reverseMovement', '/api/v1/account-transactions/transaction-1/reverse', 'POST', 'reverseManualAccountTransaction'],
    ['transfer', '/api/v1/account-transfers', 'POST', 'postAccountTransfer'],
    ['reverseTransfer', '/api/v1/account-transfers/transfer-1/reverse', 'POST', 'reverseAccountTransfer'],
  ])('blocks %s independently', async (action, path, method, serviceMethod) => {
    const accountsService = serviceWith();
    const assertAllowed = vi.fn(async (_organizationId, key) => {
      if (key === `accounts.actions.${action}`) {
        throw orgActionNotAllowed(`${action} disabled`, { controlKey: key });
      }
    });
    const app = buildApp({ assertAllowed, accountsService });
    await withServer(app, async (baseUrl) => {
      const response = await fetch(`${baseUrl}${path}`, { method });
      expect(response.status).toBe(403);
      expect((await response.json()).error.code).toBe('ORG_ACTION_NOT_ALLOWED');
    });
    expect(accountsService[serviceMethod]).not.toHaveBeenCalled();
  });

  it('blocks movement history independently while leaving Account inspection enabled', async () => {
    const accountsService = serviceWith();
    const assertAllowed = vi.fn(async (_organizationId, key) => {
      if (key === 'accounts.features.movementHistory') {
        throw orgCapabilityDisabled('Movement history disabled', { controlKey: key });
      }
    });
    const app = buildApp({ assertAllowed, accountsService });
    await withServer(app, async (baseUrl) => {
      expect((await fetch(`${baseUrl}/api/v1/accounts/account-1`)).status).toBe(200);
      const response = await fetch(`${baseUrl}/api/v1/accounts/account-1/movements`);
      expect(response.status).toBe(403);
      expect((await response.json()).error.code).toBe('ORG_CAPABILITY_DISABLED');
    });
    expect(accountsService.getAccount).toHaveBeenCalled();
    expect(accountsService.listAccountMovements).not.toHaveBeenCalled();
  });

  it('blocks KPI summary independently while leaving list enabled', async () => {
    const accountsService = serviceWith();
    const assertAllowed = vi.fn(async (_organizationId, key) => {
      if (key === 'accounts.features.kpiCards') {
        throw orgCapabilityDisabled('KPI cards disabled', { controlKey: key });
      }
    });
    const app = buildApp({ assertAllowed, accountsService });
    await withServer(app, async (baseUrl) => {
      expect((await fetch(`${baseUrl}/api/v1/accounts`)).status).toBe(200);
      const response = await fetch(`${baseUrl}/api/v1/accounts/summary`);
      expect(response.status).toBe(403);
      expect((await response.json()).error.code).toBe('ORG_CAPABILITY_DISABLED');
    });
    expect(accountsService.listAccounts).toHaveBeenCalled();
    expect(accountsService.getAccountsSummary).not.toHaveBeenCalled();
  });

  it('keeps RBAC authoritative before capability evaluation and passes tenant context', async () => {
    const deniedService = serviceWith();
    const deniedCapability = vi.fn();
    const deniedApp = buildApp({
      assertAllowed: deniedCapability,
      accountsService: deniedService,
      permissions: [],
    });
    await withServer(deniedApp, async (baseUrl) => {
      expect((await fetch(`${baseUrl}/api/v1/accounts`)).status).toBe(403);
    });
    expect(deniedCapability).not.toHaveBeenCalled();

    const enabledService = serviceWith();
    const enabledCapability = vi.fn(async (organizationId, key, mode) => {
      expect(organizationId).toBe('org-b');
      expect(key).toBe('accounts');
      expect(mode).toBe('enabled');
    });
    const enabledApp = buildApp({
      assertAllowed: enabledCapability,
      accountsService: enabledService,
      organizationId: 'org-b',
    });
    await withServer(enabledApp, async (baseUrl) => {
      expect((await fetch(`${baseUrl}/api/v1/accounts`)).status).toBe(200);
    });
    expect(enabledService.listAccounts).toHaveBeenCalledWith(
      'org-b',
      expect.objectContaining({ skip: 0, pageSize: 25 }),
    );
  });
});
