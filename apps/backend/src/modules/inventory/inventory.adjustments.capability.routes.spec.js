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

const BASE = '/api/v1/stock-adjustments';

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
          permissions: ['inventory.view', 'inventory.adjust', 'inventory.adjust.reverse'],
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

describe('Stock Adjustments capability route enforcement — module gate', () => {
  it('blocks list, get-detail, create, update, discard, post, and reverse when module is disabled', async () => {
    const listAdjustments = vi.fn(async () => ({ items: [], total: 0 }));
    const getAdjustment = vi.fn();
    const createAdjustment = vi.fn();
    const updateAdjustment = vi.fn();
    const discardAdjustment = vi.fn();
    const postAdjustment = vi.fn();
    const reverseAdjustment = vi.fn();
    const listMovements = vi.fn(async () => ({ items: [], total: 0 }));

    const assertAllowed = vi.fn(async (_organizationId, key, mode) => {
      if (key === 'inventory.adjustments') {
        expect(mode).toBe('enabled');
        throw orgCapabilityDisabled('Stock Adjustments is disabled', { controlKey: key });
      }
    });

    const app = buildApp(assertAllowed, {
      listAdjustments,
      getAdjustment,
      createAdjustment,
      updateAdjustment,
      discardAdjustment,
      postAdjustment,
      reverseAdjustment,
      listMovements,
    });

    await withServer(app, async (baseUrl) => {
      const list = await fetch(`${baseUrl}${BASE}`);
      expect(list.status).toBe(403);
      expect((await list.json()).error.code).toBe('ORG_CAPABILITY_DISABLED');
      expect(listAdjustments).not.toHaveBeenCalled();

      const detail = await fetch(`${baseUrl}${BASE}/adj-1`);
      expect(detail.status).toBe(403);
      expect(getAdjustment).not.toHaveBeenCalled();

      const create = await fetch(`${baseUrl}${BASE}`, { method: 'POST' });
      expect(create.status).toBe(403);
      expect(createAdjustment).not.toHaveBeenCalled();

      const update = await fetch(`${baseUrl}${BASE}/adj-1`, { method: 'PATCH' });
      expect(update.status).toBe(403);
      expect(updateAdjustment).not.toHaveBeenCalled();

      const discard = await fetch(`${baseUrl}${BASE}/adj-1`, { method: 'DELETE' });
      expect(discard.status).toBe(403);
      expect(discardAdjustment).not.toHaveBeenCalled();

      const post = await fetch(`${baseUrl}${BASE}/adj-1/post`, { method: 'POST' });
      expect(post.status).toBe(403);
      expect(postAdjustment).not.toHaveBeenCalled();

      const reverse = await fetch(`${baseUrl}${BASE}/adj-1/reverse`, { method: 'POST' });
      expect(reverse.status).toBe(403);
      expect(reverseAdjustment).not.toHaveBeenCalled();

      const movements = await fetch(`${baseUrl}/api/v1/inventory/movements`);
      expect(movements.status).toBe(200);
      expect(listMovements).toHaveBeenCalledOnce();
    });
  });

  it('allows adjustment list and get-detail for an organization that has not disabled the module', async () => {
    const listAdjustments = vi.fn(async () => ({ items: [], total: 0 }));
    const getAdjustment = vi.fn(async () => ({ id: 'adj-1', status: 'draft' }));

    const assertAllowed = vi.fn(async (_organizationId, key, mode) => {
      expect(key).toMatch(/^inventory\.adjustments/);
      expect(mode).toMatch(/^(enabled|allowed)$/);
    });

    const app = buildApp(assertAllowed, { listAdjustments, getAdjustment });

    await withServer(app, async (baseUrl) => {
      const list = await fetch(`${baseUrl}${BASE}`);
      expect(list.status).toBe(200);
      expect(listAdjustments).toHaveBeenCalledOnce();

      const detail = await fetch(`${baseUrl}${BASE}/adj-1`);
      expect(detail.status).toBe(200);
      expect(getAdjustment).toHaveBeenCalledOnce();
    });
  });
});

describe('Stock Adjustments capability route enforcement — Post action gate', () => {
  it('blocks create-draft and final post when Post action is disabled, while allowing list and discard', async () => {
    const listAdjustments = vi.fn(async () => ({ items: [], total: 0 }));
    const createAdjustmentDraft = vi.fn();
    const discardAdjustmentDraft = vi.fn(async () => ({ id: 'adj-1', status: 'discarded' }));
    const postAdjustment = vi.fn();

    const assertAllowed = vi.fn(async (_organizationId, key, mode) => {
      if (key === 'inventory.adjustments') {
        expect(mode).toBe('enabled');
        return;
      }
      if (key === 'inventory.adjustments.actions.post') {
        expect(mode).toBe('allowed');
        throw orgActionNotAllowed('Post Adjustment is not allowed', { controlKey: key });
      }
    });

    const app = buildApp(assertAllowed, {
      listAdjustments,
      createAdjustmentDraft,
      discardAdjustmentDraft,
      postAdjustment,
    });

    await withServer(app, async (baseUrl) => {
      const list = await fetch(`${baseUrl}${BASE}`);
      expect(list.status).toBe(200);
      expect(listAdjustments).toHaveBeenCalledOnce();

      const create = await fetch(`${baseUrl}${BASE}`, { method: 'POST' });
      expect(create.status).toBe(403);
      expect((await create.json()).error.code).toBe('ORG_ACTION_NOT_ALLOWED');
      expect(createAdjustmentDraft).not.toHaveBeenCalled();

      const post = await fetch(`${baseUrl}${BASE}/adj-1/post`, { method: 'POST' });
      expect(post.status).toBe(403);
      expect((await post.json()).error.code).toBe('ORG_ACTION_NOT_ALLOWED');
      expect(postAdjustment).not.toHaveBeenCalled();

      const discard = await fetch(`${baseUrl}${BASE}/adj-1`, { method: 'DELETE' });
      expect(discard.status).toBe(200);
      expect(discardAdjustmentDraft).toHaveBeenCalledOnce();
    });
  });

  it('blocks update-draft when Post action is disabled', async () => {
    const updateAdjustment = vi.fn();

    const assertAllowed = vi.fn(async (_organizationId, key) => {
      if (key === 'inventory.adjustments') return;
      if (key === 'inventory.adjustments.actions.post') {
        throw orgActionNotAllowed('Post Adjustment is not allowed', { controlKey: key });
      }
    });

    const app = buildApp(assertAllowed, { updateAdjustment });

    await withServer(app, async (baseUrl) => {
      const update = await fetch(`${baseUrl}${BASE}/adj-1`, { method: 'PATCH' });
      expect(update.status).toBe(403);
      expect((await update.json()).error.code).toBe('ORG_ACTION_NOT_ALLOWED');
      expect(updateAdjustment).not.toHaveBeenCalled();
    });
  });
});

describe('Stock Adjustments capability route enforcement — Reverse action gate', () => {
  it('blocks reversal when Reverse action is disabled and the posted adjustment is not changed', async () => {
    const reverseAdjustment = vi.fn();
    const listAdjustments = vi.fn(async () => ({ items: [], total: 0 }));

    const assertAllowed = vi.fn(async (_organizationId, key, mode) => {
      if (key === 'inventory.adjustments') return;
      if (key === 'inventory.adjustments.actions.reverse') {
        expect(mode).toBe('allowed');
        throw orgActionNotAllowed('Reverse Adjustment is not allowed', { controlKey: key });
      }
    });

    const app = buildApp(assertAllowed, { reverseAdjustment, listAdjustments });

    await withServer(app, async (baseUrl) => {
      const reverse = await fetch(`${baseUrl}${BASE}/adj-1/reverse`, { method: 'POST' });
      expect(reverse.status).toBe(403);
      expect((await reverse.json()).error.code).toBe('ORG_ACTION_NOT_ALLOWED');
      expect(reverseAdjustment).not.toHaveBeenCalled();

      const list = await fetch(`${baseUrl}${BASE}`);
      expect(list.status).toBe(200);
      expect(listAdjustments).toHaveBeenCalledOnce();
    });
  });
});

describe('Stock Adjustments capability — unrelated module isolation', () => {
  it('Stock balance and movements endpoints remain unaffected when Adjustments module is disabled', async () => {
    const listBalances = vi.fn(async () => ({ items: [], total: 0 }));
    const listMovements = vi.fn(async () => ({ items: [], total: 0 }));

    const assertAllowed = vi.fn(async (_organizationId, key) => {
      if (key === 'inventory.adjustments') {
        throw orgCapabilityDisabled('Stock Adjustments is disabled', { controlKey: key });
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

describe('Stock Adjustments capability — negative-stock override security regression', () => {
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
