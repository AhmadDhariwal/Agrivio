import { createServer } from 'node:http';
import express from 'express';
import { describe, expect, it, vi } from 'vitest';
import errorHandlerModule from '../../platform/errors/error-handler.middleware';
import appErrorModule from '../../platform/errors/app-error';
import requestIdModule from '../../platform/http/request-id.middleware';
import returnsRoutesModule from './routes/returns.routes';

const { createErrorHandlerMiddleware } = errorHandlerModule;
const { orgActionNotAllowed, orgCapabilityDisabled } = appErrorModule;
const { createRequestIdMiddleware } = requestIdModule;
const { registerReturnsRoutes } = returnsRoutesModule;

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

const BASE = '/api/v1/returns';

function buildApp(assertAllowed, returnsService) {
  const app = express();
  app.use(createRequestIdMiddleware());
  app.use(
    registerReturnsRoutes({
      requireAuth: (req, _res, next) => {
        req.auth = { session: {}, user: {} };
        req.authContext = {
          contextType: 'organization',
          organizationId: 'org-a',
          userId: 'user-a',
          permissions: [
            'returns.view',
            'returns.post',
            'returns.without-invoice.approve',
            'returns.reverse',
            'purchases.return',
          ],
        };
        next();
      },
      requireCsrf: (_req, _res, next) => next(),
      requireOperationalAccess: (_req, _res, next) => next(),
      capabilityService: { assertAllowed },
      returnsService,
    }),
  );
  app.use(createErrorHandlerMiddleware('test', () => undefined));
  return app;
}

// ── Module Gate ───────────────────────────────────────────────────────────────

describe('Returns and Corrections capability route enforcement — module gate', () => {
  it('blocks list, detail, create, without-invoice, update, discard, post, and reverse when module is disabled', async () => {
    const listReturns = vi.fn(async () => ({ items: [], total: 0 }));
    const getReturn = vi.fn();
    const createPurchaseReturnDraft = vi.fn();
    const createWithoutInvoiceDraft = vi.fn();
    const updateReturnDraft = vi.fn();
    const discardReturnDraft = vi.fn();
    const postReturn = vi.fn();
    const reverseReturn = vi.fn();

    const assertAllowed = vi.fn(async (_organizationId, key, mode) => {
      if (key === 'returns') {
        expect(mode).toBe('enabled');
        throw orgCapabilityDisabled('Returns and Corrections is disabled', { controlKey: key });
      }
    });

    const app = buildApp(assertAllowed, {
      listReturns,
      getReturn,
      createPurchaseReturnDraft,
      createWithoutInvoiceDraft,
      updateReturnDraft,
      discardReturnDraft,
      postReturn,
      reverseReturn,
    });

    await withServer(app, async (baseUrl) => {
      const list = await fetch(`${baseUrl}${BASE}`);
      expect(list.status).toBe(403);
      expect((await list.json()).error.code).toBe('ORG_CAPABILITY_DISABLED');
      expect(listReturns).not.toHaveBeenCalled();

      const detail = await fetch(`${baseUrl}${BASE}/ret-1`);
      expect(detail.status).toBe(403);
      expect(getReturn).not.toHaveBeenCalled();

      const create = await fetch(`${baseUrl}${BASE}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      expect(create.status).toBe(403);
      expect(createPurchaseReturnDraft).not.toHaveBeenCalled();

      const withoutInvoice = await fetch(`${baseUrl}${BASE}/without-invoice`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      expect(withoutInvoice.status).toBe(403);
      expect(createWithoutInvoiceDraft).not.toHaveBeenCalled();

      const update = await fetch(`${baseUrl}${BASE}/ret-1`, { method: 'PATCH' });
      expect(update.status).toBe(403);
      expect(updateReturnDraft).not.toHaveBeenCalled();

      const discard = await fetch(`${baseUrl}${BASE}/ret-1`, { method: 'DELETE' });
      expect(discard.status).toBe(403);
      expect(discardReturnDraft).not.toHaveBeenCalled();

      const post = await fetch(`${baseUrl}${BASE}/ret-1/post`, { method: 'POST' });
      expect(post.status).toBe(403);
      expect(postReturn).not.toHaveBeenCalled();

      const reverse = await fetch(`${baseUrl}${BASE}/ret-1/reverse`, { method: 'POST' });
      expect(reverse.status).toBe(403);
      expect(reverseReturn).not.toHaveBeenCalled();
    });
  });

  it('allows list when module is enabled for org-a', async () => {
    const listReturns = vi.fn(async () => ({ items: [], total: 0 }));

    const assertAllowed = vi.fn(async (_organizationId, key, mode) => {
      expect(key).toMatch(/^returns/);
      expect(mode).toMatch(/^(enabled|allowed)$/);
    });

    const app = buildApp(assertAllowed, { listReturns });

    await withServer(app, async (baseUrl) => {
      const list = await fetch(`${baseUrl}${BASE}`);
      expect(list.status).toBe(200);
      expect(listReturns).toHaveBeenCalledOnce();
    });
  });
});

// ── Post Action Gate ──────────────────────────────────────────────────────────

describe('Returns and Corrections capability route enforcement — Post action gate', () => {
  it('blocks create and final post when Post action is disabled, while allowing list and discard', async () => {
    const listReturns = vi.fn(async () => ({ items: [], total: 0 }));
    const createPurchaseReturnDraft = vi.fn();
    const discardReturnDraft = vi.fn(async () => ({ id: 'ret-1', status: 'discarded' }));
    const postReturn = vi.fn();

    const assertAllowed = vi.fn(async (_organizationId, key, mode) => {
      if (key === 'returns') {
        expect(mode).toBe('enabled');
        return;
      }
      if (key === 'returns.actions.post') {
        expect(mode).toBe('allowed');
        throw orgActionNotAllowed('Post Return is not allowed', { controlKey: key });
      }
    });

    const app = buildApp(assertAllowed, {
      listReturns,
      createPurchaseReturnDraft,
      discardReturnDraft,
      postReturn,
    });

    await withServer(app, async (baseUrl) => {
      const list = await fetch(`${baseUrl}${BASE}`);
      expect(list.status).toBe(200);
      expect(listReturns).toHaveBeenCalledOnce();

      const create = await fetch(`${baseUrl}${BASE}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      expect(create.status).toBe(403);
      expect((await create.json()).error.code).toBe('ORG_ACTION_NOT_ALLOWED');
      expect(createPurchaseReturnDraft).not.toHaveBeenCalled();

      const post = await fetch(`${baseUrl}${BASE}/ret-1/post`, { method: 'POST' });
      expect(post.status).toBe(403);
      expect((await post.json()).error.code).toBe('ORG_ACTION_NOT_ALLOWED');
      expect(postReturn).not.toHaveBeenCalled();

      const discard = await fetch(`${baseUrl}${BASE}/ret-1`, { method: 'DELETE' });
      expect(discard.status).toBe(200);
      expect(discardReturnDraft).toHaveBeenCalledOnce();
    });
  });

  it('blocks update-draft when Post action is disabled', async () => {
    const updateReturnDraft = vi.fn();

    const assertAllowed = vi.fn(async (_organizationId, key) => {
      if (key === 'returns') return;
      if (key === 'returns.actions.post') {
        throw orgActionNotAllowed('Post Return is not allowed', { controlKey: key });
      }
    });

    const app = buildApp(assertAllowed, { updateReturnDraft });

    await withServer(app, async (baseUrl) => {
      const update = await fetch(`${baseUrl}${BASE}/ret-1`, { method: 'PATCH' });
      expect(update.status).toBe(403);
      expect((await update.json()).error.code).toBe('ORG_ACTION_NOT_ALLOWED');
      expect(updateReturnDraft).not.toHaveBeenCalled();
    });
  });

  it('blocks linked purchase-return and linked sales-return creation when Post action is disabled', async () => {
    const createPurchaseReturnDraft = vi.fn();
    const createSalesReturnDraft = vi.fn();

    const assertAllowed = vi.fn(async (_organizationId, key) => {
      if (key === 'returns') return;
      if (key === 'returns.actions.post') {
        throw orgActionNotAllowed('Post Return is not allowed', { controlKey: key });
      }
    });

    const app = buildApp(assertAllowed, { createPurchaseReturnDraft, createSalesReturnDraft });

    await withServer(app, async (baseUrl) => {
      const purchaseReturn = await fetch(`${baseUrl}/api/v1/purchases/po-1/returns`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      expect(purchaseReturn.status).toBe(403);
      expect((await purchaseReturn.json()).error.code).toBe('ORG_ACTION_NOT_ALLOWED');
      expect(createPurchaseReturnDraft).not.toHaveBeenCalled();

      const salesReturn = await fetch(`${baseUrl}/api/v1/sales/sale-1/returns`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      expect(salesReturn.status).toBe(403);
      expect((await salesReturn.json()).error.code).toBe('ORG_ACTION_NOT_ALLOWED');
      expect(createSalesReturnDraft).not.toHaveBeenCalled();
    });
  });
});

// ── Return Without Invoice Action Gate ────────────────────────────────────────

describe('Returns and Corrections capability route enforcement — Return Without Invoice action gate', () => {
  it('blocks the without-invoice draft endpoint when the action is disabled while list remains available', async () => {
    const listReturns = vi.fn(async () => ({ items: [], total: 0 }));
    const createWithoutInvoiceDraft = vi.fn();

    const assertAllowed = vi.fn(async (_organizationId, key, mode) => {
      if (key === 'returns') return;
      if (key === 'returns.actions.withoutInvoice') {
        expect(mode).toBe('allowed');
        throw orgActionNotAllowed('Return Without Invoice is not allowed', { controlKey: key });
      }
    });

    const app = buildApp(assertAllowed, { listReturns, createWithoutInvoiceDraft });

    await withServer(app, async (baseUrl) => {
      const withoutInvoice = await fetch(`${baseUrl}${BASE}/without-invoice`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      expect(withoutInvoice.status).toBe(403);
      expect((await withoutInvoice.json()).error.code).toBe('ORG_ACTION_NOT_ALLOWED');
      expect(createWithoutInvoiceDraft).not.toHaveBeenCalled();

      const list = await fetch(`${baseUrl}${BASE}`);
      expect(list.status).toBe(200);
      expect(listReturns).toHaveBeenCalledOnce();
    });
  });
});

// ── Reverse Action Gate ───────────────────────────────────────────────────────

describe('Returns and Corrections capability route enforcement — Reverse action gate', () => {
  it('blocks reversal when Reverse action is disabled and the posted return is not changed', async () => {
    const reverseReturn = vi.fn();
    const listReturns = vi.fn(async () => ({ items: [], total: 0 }));

    const assertAllowed = vi.fn(async (_organizationId, key, mode) => {
      if (key === 'returns') return;
      if (key === 'returns.actions.inspect') return;
      if (key === 'returns.actions.reverse') {
        expect(mode).toBe('allowed');
        throw orgActionNotAllowed('Reverse Return is not allowed', { controlKey: key });
      }
    });

    const app = buildApp(assertAllowed, { reverseReturn, listReturns });

    await withServer(app, async (baseUrl) => {
      const reverse = await fetch(`${baseUrl}${BASE}/ret-1/reverse`, { method: 'POST' });
      expect(reverse.status).toBe(403);
      expect((await reverse.json()).error.code).toBe('ORG_ACTION_NOT_ALLOWED');
      expect(reverseReturn).not.toHaveBeenCalled();

      const list = await fetch(`${baseUrl}${BASE}`);
      expect(list.status).toBe(200);
      expect(listReturns).toHaveBeenCalledOnce();
    });
  });
});

// ── Inspect Action Gate ───────────────────────────────────────────────────────

describe('Returns and Corrections capability route enforcement — Inspect action gate', () => {
  it('blocks detail when Inspect action is disabled while list remains available', async () => {
    const listReturns = vi.fn(async () => ({ items: [], total: 0 }));
    const getReturn = vi.fn();

    const assertAllowed = vi.fn(async (_organizationId, key, mode) => {
      if (key === 'returns') return;
      if (key === 'returns.actions.inspect') {
        expect(mode).toBe('allowed');
        throw orgActionNotAllowed('Inspect Return is not allowed', { controlKey: key });
      }
    });

    const app = buildApp(assertAllowed, { listReturns, getReturn });

    await withServer(app, async (baseUrl) => {
      const detail = await fetch(`${baseUrl}${BASE}/ret-1`);
      expect(detail.status).toBe(403);
      expect((await detail.json()).error.code).toBe('ORG_ACTION_NOT_ALLOWED');
      expect(getReturn).not.toHaveBeenCalled();

      const list = await fetch(`${baseUrl}${BASE}`);
      expect(list.status).toBe(200);
      expect(listReturns).toHaveBeenCalledOnce();
    });
  });
});

// ── Unrelated Module Isolation ────────────────────────────────────────────────

describe('Returns and Corrections capability — unrelated module isolation', () => {
  it('does not gate on any other module key', async () => {
    const listReturns = vi.fn(async () => ({ items: [], total: 0 }));
    const seenKeys = new Set();

    const assertAllowed = vi.fn(async (_organizationId, key) => {
      seenKeys.add(key);
    });

    const app = buildApp(assertAllowed, { listReturns });

    await withServer(app, async (baseUrl) => {
      const list = await fetch(`${baseUrl}${BASE}`);
      expect(list.status).toBe(200);
      for (const key of seenKeys) {
        expect(key).toMatch(/^returns/);
      }
    });
  });
});

// ── Registry Safety Regression ────────────────────────────────────────────────

describe('Returns and Corrections capability — domain safety regression', () => {
  it('does not register any capability control for reversal reason or lifecycle status text', async () => {
    const capabilityRegistryModule = await import('../capabilities/capability.registry');
    const { listCapabilityControls } = capabilityRegistryModule.default ?? capabilityRegistryModule;
    const all = listCapabilityControls();
    const returnsKeys = all.filter((c) => c.moduleKey === 'returns').map((c) => c.key);
    expect(returnsKeys).not.toContain('returns.fields.status');
    expect(returnsKeys).not.toContain('returns.fields.lifecycle');
  });
});
