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

const BASE = '/api/v1/warehouse-transfers';

function buildApp(assertAllowed, inventoryService) {
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
          permissions: [
            'inventory.view',
            'inventory.transfer',
            'inventory.transfer.reverse',
          ],
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

// ── Module Gate ───────────────────────────────────────────────────────────────

describe('Warehouse Transfers capability route enforcement — module gate', () => {
  it('blocks list, detail, create, update, discard, post, and reverse when module is disabled', async () => {
    const listTransfers = vi.fn(async () => ({ items: [], total: 0 }));
    const getTransfer = vi.fn();
    const createTransfer = vi.fn();
    const updateTransfer = vi.fn();
    const discardTransfer = vi.fn();
    const postTransfer = vi.fn();
    const reverseTransfer = vi.fn();
    const listMovements = vi.fn(async () => ({ items: [], total: 0 }));

    const assertAllowed = vi.fn(async (_organizationId, key, mode) => {
      if (key === 'inventory.transfers') {
        expect(mode).toBe('enabled');
        throw orgCapabilityDisabled('Warehouse Transfers is disabled', { controlKey: key });
      }
    });

    const app = buildApp(assertAllowed, {
      listTransfers,
      getTransfer,
      createTransfer,
      updateTransfer,
      discardTransfer,
      postTransfer,
      reverseTransfer,
      listMovements,
    });

    await withServer(app, async (baseUrl) => {
      const list = await fetch(`${baseUrl}${BASE}`);
      expect(list.status).toBe(403);
      expect((await list.json()).error.code).toBe('ORG_CAPABILITY_DISABLED');
      expect(listTransfers).not.toHaveBeenCalled();

      const detail = await fetch(`${baseUrl}${BASE}/xfer-1`);
      expect(detail.status).toBe(403);
      expect(getTransfer).not.toHaveBeenCalled();

      const create = await fetch(`${baseUrl}${BASE}`, { method: 'POST' });
      expect(create.status).toBe(403);
      expect(createTransfer).not.toHaveBeenCalled();

      const update = await fetch(`${baseUrl}${BASE}/xfer-1`, { method: 'PATCH' });
      expect(update.status).toBe(403);
      expect(updateTransfer).not.toHaveBeenCalled();

      const discard = await fetch(`${baseUrl}${BASE}/xfer-1`, { method: 'DELETE' });
      expect(discard.status).toBe(403);
      expect(discardTransfer).not.toHaveBeenCalled();

      const post = await fetch(`${baseUrl}${BASE}/xfer-1/post`, { method: 'POST' });
      expect(post.status).toBe(403);
      expect(postTransfer).not.toHaveBeenCalled();

      const reverse = await fetch(`${baseUrl}${BASE}/xfer-1/reverse`, { method: 'POST' });
      expect(reverse.status).toBe(403);
      expect(reverseTransfer).not.toHaveBeenCalled();

      // stock movements endpoint must remain unaffected
      const movements = await fetch(`${baseUrl}/api/v1/inventory/movements`);
      expect(movements.status).toBe(200);
      expect(listMovements).toHaveBeenCalledOnce();
    });
  });

  it('allows list when module is enabled for org-a', async () => {
    const listTransfers = vi.fn(async () => ({ items: [], total: 0 }));

    const assertAllowed = vi.fn(async (_organizationId, key, mode) => {
      expect(key).toMatch(/^inventory\.transfers/);
      expect(mode).toMatch(/^(enabled|allowed)$/);
    });

    const app = buildApp(assertAllowed, { listTransfers });

    await withServer(app, async (baseUrl) => {
      const list = await fetch(`${baseUrl}${BASE}`);
      expect(list.status).toBe(200);
      expect(listTransfers).toHaveBeenCalledOnce();
    });
  });
});

// ── Post Action Gate ──────────────────────────────────────────────────────────

describe('Warehouse Transfers capability route enforcement — Post action gate', () => {
  it('blocks create and final post when Post action is disabled, while allowing list and discard', async () => {
    const listTransfers = vi.fn(async () => ({ items: [], total: 0 }));
    const createTransfer = vi.fn();
    const discardTransferDraft = vi.fn(async () => ({ id: 'xfer-1', status: 'discarded' }));
    const postTransfer = vi.fn();

    const assertAllowed = vi.fn(async (_organizationId, key, mode) => {
      if (key === 'inventory.transfers') {
        expect(mode).toBe('enabled');
        return;
      }
      if (key === 'inventory.transfers.actions.post') {
        expect(mode).toBe('allowed');
        throw orgActionNotAllowed('Post Transfer is not allowed', { controlKey: key });
      }
    });

    const app = buildApp(assertAllowed, {
      listTransfers,
      createTransfer,
      discardTransferDraft,
      postTransfer,
    });

    await withServer(app, async (baseUrl) => {
      const list = await fetch(`${baseUrl}${BASE}`);
      expect(list.status).toBe(200);
      expect(listTransfers).toHaveBeenCalledOnce();

      const create = await fetch(`${baseUrl}${BASE}`, { method: 'POST' });
      expect(create.status).toBe(403);
      expect((await create.json()).error.code).toBe('ORG_ACTION_NOT_ALLOWED');
      expect(createTransfer).not.toHaveBeenCalled();

      const post = await fetch(`${baseUrl}${BASE}/xfer-1/post`, { method: 'POST' });
      expect(post.status).toBe(403);
      expect((await post.json()).error.code).toBe('ORG_ACTION_NOT_ALLOWED');
      expect(postTransfer).not.toHaveBeenCalled();

      const discard = await fetch(`${baseUrl}${BASE}/xfer-1`, { method: 'DELETE' });
      expect(discard.status).toBe(200);
      expect(discardTransferDraft).toHaveBeenCalledOnce();

    });
  });

  it('blocks update-draft when Post action is disabled', async () => {
    const updateTransfer = vi.fn();

    const assertAllowed = vi.fn(async (_organizationId, key) => {
      if (key === 'inventory.transfers') return;
      if (key === 'inventory.transfers.actions.post') {
        throw orgActionNotAllowed('Post Transfer is not allowed', { controlKey: key });
      }
    });

    const app = buildApp(assertAllowed, { updateTransfer });

    await withServer(app, async (baseUrl) => {
      const update = await fetch(`${baseUrl}${BASE}/xfer-1`, { method: 'PATCH' });
      expect(update.status).toBe(403);
      expect((await update.json()).error.code).toBe('ORG_ACTION_NOT_ALLOWED');
      expect(updateTransfer).not.toHaveBeenCalled();
    });
  });
});

// ── Reverse Action Gate ───────────────────────────────────────────────────────

describe('Warehouse Transfers capability route enforcement — Reverse action gate', () => {
  it('blocks reversal when Reverse action is disabled and the posted transfer is not changed', async () => {
    const reverseTransfer = vi.fn();
    const listTransfers = vi.fn(async () => ({ items: [], total: 0 }));

    const assertAllowed = vi.fn(async (_organizationId, key, mode) => {
      if (key === 'inventory.transfers') return;
      if (key === 'inventory.transfers.actions.inspect') return;
      if (key === 'inventory.transfers.actions.reverse') {
        expect(mode).toBe('allowed');
        throw orgActionNotAllowed('Reverse Transfer is not allowed', { controlKey: key });
      }
    });

    const app = buildApp(assertAllowed, { reverseTransfer, listTransfers });

    await withServer(app, async (baseUrl) => {
      const reverse = await fetch(`${baseUrl}${BASE}/xfer-1/reverse`, { method: 'POST' });
      expect(reverse.status).toBe(403);
      expect((await reverse.json()).error.code).toBe('ORG_ACTION_NOT_ALLOWED');
      expect(reverseTransfer).not.toHaveBeenCalled();

      const list = await fetch(`${baseUrl}${BASE}`);
      expect(list.status).toBe(200);
      expect(listTransfers).toHaveBeenCalledOnce();
    });
  });
});

// ── Inspect Action Gate ───────────────────────────────────────────────────────

describe('Warehouse Transfers capability route enforcement — Inspect action gate', () => {
  it('blocks detail when Inspect action is disabled while list remains available', async () => {
    const listTransfers = vi.fn(async () => ({ items: [], total: 0 }));
    const getTransfer = vi.fn();

    const assertAllowed = vi.fn(async (_organizationId, key, mode) => {
      if (key === 'inventory.transfers') return;
      if (key === 'inventory.transfers.actions.inspect') {
        expect(mode).toBe('allowed');
        throw orgActionNotAllowed('Inspect Transfer is not allowed', { controlKey: key });
      }
    });

    const app = buildApp(assertAllowed, { listTransfers, getTransfer });

    await withServer(app, async (baseUrl) => {
      const detail = await fetch(`${baseUrl}${BASE}/xfer-1`);
      expect(detail.status).toBe(403);
      expect((await detail.json()).error.code).toBe('ORG_ACTION_NOT_ALLOWED');
      expect(getTransfer).not.toHaveBeenCalled();

      const list = await fetch(`${baseUrl}${BASE}`);
      expect(list.status).toBe(200);
      expect(listTransfers).toHaveBeenCalledOnce();
    });
  });
});

// ── Unrelated Module Isolation ────────────────────────────────────────────────

describe('Warehouse Transfers capability — unrelated module isolation', () => {
  it('Stock balance and movements endpoints remain unaffected when Transfers module is disabled', async () => {
    const listBalances = vi.fn(async () => ({ items: [], total: 0 }));
    const listMovements = vi.fn(async () => ({ items: [], total: 0 }));

    const assertAllowed = vi.fn(async (_organizationId, key) => {
      if (key === 'inventory.transfers') {
        throw orgCapabilityDisabled('Warehouse Transfers is disabled', { controlKey: key });
      }
      if (key === 'inventory.stock') return;
    });

    const app = buildApp(assertAllowed, { listBalances, listMovements });

    await withServer(app, async (baseUrl) => {
      const balances = await fetch(`${baseUrl}/api/v1/inventory/balances`);
      expect(balances.status).toBe(200);
      expect(listBalances).toHaveBeenCalledOnce();

      const movements = await fetch(`${baseUrl}/api/v1/inventory/movements`);
      expect(movements.status).toBe(200);
      expect(listMovements).toHaveBeenCalledOnce();
    });
  });
});

// ── Negative-Stock Override Security Regression ───────────────────────────────

describe('Warehouse Transfers capability — negative-stock override security regression', () => {
  it('inventory.negative-stock.override is not in the capability registry', async () => {
    const capabilityRegistryModule = await import(
      '../../modules/capabilities/capability.registry'
    );
    const { listCapabilityControls } = capabilityRegistryModule.default ?? capabilityRegistryModule;
    const all = listCapabilityControls();
    const negStockKeys = all.filter(
      (c) => c.key.includes('negative-stock') || c.key.includes('negativeStock'),
    );
    expect(negStockKeys).toHaveLength(0);
  });
});
