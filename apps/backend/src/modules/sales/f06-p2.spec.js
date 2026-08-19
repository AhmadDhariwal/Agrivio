import { describe, expect, it } from 'vitest';
import {
  API_AUTH_CSRF_PATH,
  API_AUTH_LOGIN_PATH,
  API_ACCOUNTS_PATH,
  API_BRANCHES_PATH,
  API_CSRF_HEADER,
  API_CUSTOMERS_PATH,
  API_IDEMPOTENCY_KEY_HEADER,
  API_INVENTORY_BALANCES_PATH,
  API_INVENTORY_MOVEMENTS_PATH,
  API_INVENTORY_OPENING_STOCK_PATH,
  API_ORGANIZATION_ACTIVATION_REQUESTS_PATH,
  API_PLATFORM_ACTOR_HEADER,
  API_PLATFORM_ORGANIZATIONS_PATH,
  API_PLATFORM_SUBSCRIPTION_PLANS_PATH,
  API_PRODUCT_CATEGORIES_PATH,
  API_PRODUCTS_PATH,
  API_SALES_PATH,
  API_WAREHOUSES_PATH,
} from '@agrivio/api-contracts';
import { createServer } from 'node:http';

const { createApp } = require('../../app');
const { loadApiEnv } = require('../../platform/config/runtime-config');
const { createMockDatabaseLifecycle } = require('../../platform/database/mongo-connection');

describe('F06 P2 sale posting, tier pricing, and payments', () => {
  it('posts cash/credit/partial/mixed sales with inventory and ledger reconciliation', async () => {
    const { server, baseUrl, jar } = await boot();

    try {
      await seedPlan(baseUrl, jar);
      await createApprovedOwner(baseUrl, jar, {
        organizationName: 'F06P2 Org',
        ownerEmail: 'f06p2-owner@example.com',
        password: 'a-strong-passphrase',
      });
      await login(baseUrl, jar, 'f06p2-owner@example.com', 'a-strong-passphrase');

      const branch = await postJson(
        baseUrl,
        jar,
        'POST',
        API_BRANCHES_PATH,
        { name: 'LHR Branch', invoicePrefix: 'LHR' },
      );
      expect(branch.status).toBe(201);

      const warehouse = await postJson(baseUrl, jar, 'POST', API_WAREHOUSES_PATH, { name: 'Main WH' });
      expect(warehouse.status).toBe(201);

      const cash = await postJson(baseUrl, jar, 'POST', API_ACCOUNTS_PATH, {
        name: 'Cash',
        accountType: 'cash',
      });
      expect(cash.status).toBe(201);
      await postJson(
        baseUrl,
        jar,
        'POST',
        `${API_ACCOUNTS_PATH}/${cash.body.data.id}/opening-balance`,
        { amount: { amount: '50000.00', currency: 'PKR' } },
        'cash-open',
      );

      const bank = await postJson(baseUrl, jar, 'POST', API_ACCOUNTS_PATH, {
        name: 'Bank',
        accountType: 'bank',
        bankName: 'HBL',
      });
      expect(bank.status).toBe(201);
      await postJson(
        baseUrl,
        jar,
        'POST',
        `${API_ACCOUNTS_PATH}/${bank.body.data.id}/opening-balance`,
        { amount: { amount: '50000.00', currency: 'PKR' } },
        'bank-open',
      );

      const category = await postJson(baseUrl, jar, 'POST', API_PRODUCT_CATEGORIES_PATH, {
        name: 'Seeds',
        productClass: 'general',
      });
      expect(category.status).toBe(201);

      const product = await postJson(baseUrl, jar, 'POST', API_PRODUCTS_PATH, {
        name: 'Wheat Seed',
        categoryId: category.body.data.id,
        trackingMode: 'none',
        baseUnitCode: 'KG',
        measurementDimension: 'mass',
      });
      expect(product.status).toBe(201);

      const prices = await postJson(
        baseUrl,
        jar,
        'PUT',
        `${API_PRODUCTS_PATH}/${product.body.data.id}/prices`,
        {
          expectedVersion: product.body.data.version,
          items: [
            { priceTier: 'retail', price: { amount: '100.00', currency: 'PKR' } },
            { priceTier: 'wholesale', price: { amount: '90.00', currency: 'PKR' } },
          ],
        },
      );
      expect(prices.status).toBe(200);

      const stock = await postJson(
        baseUrl,
        jar,
        'POST',
        API_INVENTORY_OPENING_STOCK_PATH,
        {
          warehouseId: warehouse.body.data.id,
          productId: product.body.data.id,
          quantity: '100',
          inventoryValue: { amount: '5000.00', currency: 'PKR' },
        },
        'seed-stock',
      );
      expect(stock.status).toBe(201);

      const customer = await postJson(baseUrl, jar, 'POST', API_CUSTOMERS_PATH, {
        name: 'Farmer Ali',
        customerType: 'farmer',
        priceTier: 'wholesale',
        phone: '03001234567',
        creditEnabled: true,
        creditLimit: { amount: '100000.00', currency: 'PKR' },
        creditLimitBehaviour: 'warning',
      });
      expect(customer.status).toBe(201);

      const draftBody = {
        branchId: branch.body.data.id,
        warehouseId: warehouse.body.data.id,
        saleDate: '2026-08-12',
        lines: [
          {
            productId: product.body.data.id,
            quantity: '2',
            unitPrice: { amount: '90.00', currency: 'PKR' },
          },
        ],
      };

      // Walk-in cash sale
      const walkInDraft = await postJson(baseUrl, jar, 'POST', API_SALES_PATH, {
        ...draftBody,
        lines: [
          {
            productId: product.body.data.id,
            quantity: '2',
            unitPrice: { amount: '100.00', currency: 'PKR' },
          },
        ],
      });
      expect(walkInDraft.status).toBe(201);

      const walkInPost = await postJson(
        baseUrl,
        jar,
        'POST',
        `${API_SALES_PATH}/${walkInDraft.body.data.id}/post`,
        {
          expectedVersion: walkInDraft.body.data.version,
          payments: [{ accountId: cash.body.data.id, amount: { amount: '200.00', currency: 'PKR' } }],
        },
        'walkin-cash-post',
      );
      expect(walkInPost.status).toBe(200);
      expect(walkInPost.body.data.status).toBe('posted');
      expect(walkInPost.body.data.invoiceNumber).toMatch(/^LHR-/);
      expect(walkInPost.body.data.saleTotal.amount).toBe('200.00');
      expect(walkInPost.body.data.paidTotal.amount).toBe('200.00');
      expect(walkInPost.body.data.receivableTotal.amount).toBe('0.00');
      expect(walkInPost.body.data.lines[0].priceTierSnapshot).toBe('retail');
      expect(walkInPost.body.data.lines[0].catalogPrice.amount).toBe('100.00');

      const walkInReplay = await postJson(
        baseUrl,
        jar,
        'POST',
        `${API_SALES_PATH}/${walkInDraft.body.data.id}/post`,
        {
          expectedVersion: walkInDraft.body.data.version,
          payments: [{ accountId: cash.body.data.id, amount: { amount: '200.00', currency: 'PKR' } }],
        },
        'walkin-cash-post',
      );
      expect(walkInReplay.status).toBe(200);
      expect(walkInReplay.body.data.id).toBe(walkInDraft.body.data.id);

      const balancesAfterWalkIn = await fetchJson(
        baseUrl,
        'GET',
        API_INVENTORY_BALANCES_PATH,
        null,
        {},
        jar,
      );
      expect(balancesAfterWalkIn.status).toBe(200);
      const balance = balancesAfterWalkIn.body.data.find(
        (item) => item.productId === product.body.data.id,
      );
      expect(balance.quantityBase).toBe('98.0000');

      // Customer credit sale
      const creditDraft = await postJson(baseUrl, jar, 'POST', API_SALES_PATH, {
        ...draftBody,
        customerId: customer.body.data.id,
      });
      expect(creditDraft.status).toBe(201);

      const creditPost = await postJson(
        baseUrl,
        jar,
        'POST',
        `${API_SALES_PATH}/${creditDraft.body.data.id}/post`,
        { expectedVersion: creditDraft.body.data.version, payments: [] },
        'credit-post',
      );
      expect(creditPost.status).toBe(200);
      expect(creditPost.body.data.receivableTotal.amount).toBe('180.00');
      expect(creditPost.body.data.lines[0].priceTierSnapshot).toBe('wholesale');
      expect(creditPost.body.data.lines[0].catalogPrice.amount).toBe('90.00');

      const ledger = await fetchJson(
        baseUrl,
        'GET',
        `${API_CUSTOMERS_PATH}/${customer.body.data.id}/ledger`,
        null,
        {},
        jar,
      );
      expect(ledger.status).toBe(200);
      expect(
        ledger.body.data.items.some((item) => item.sourceType === 'sale_receivable'),
      ).toBe(true);

      // Partial + mixed payment sale
      const mixedDraft = await postJson(baseUrl, jar, 'POST', API_SALES_PATH, {
        ...draftBody,
        customerId: customer.body.data.id,
      });
      expect(mixedDraft.status).toBe(201);

      const mixedPost = await postJson(
        baseUrl,
        jar,
        'POST',
        `${API_SALES_PATH}/${mixedDraft.body.data.id}/post`,
        {
          expectedVersion: mixedDraft.body.data.version,
          payments: [
            { accountId: cash.body.data.id, amount: { amount: '80.00', currency: 'PKR' } },
            { accountId: bank.body.data.id, amount: { amount: '100.00', currency: 'PKR' } },
          ],
        },
        'mixed-post',
      );
      expect(mixedPost.status).toBe(200);
      expect(mixedPost.body.data.paidTotal.amount).toBe('180.00');
      expect(mixedPost.body.data.receivableTotal.amount).toBe('0.00');
      expect(mixedPost.body.data.payments).toHaveLength(2);

      const movements = await fetchJson(
        baseUrl,
        'GET',
        API_INVENTORY_MOVEMENTS_PATH,
        null,
        {},
        jar,
      );
      expect(movements.status).toBe(200);
      expect(movements.body.data.filter((item) => item.sourceType === 'sale').length).toBe(3);

      // Walk-in credit blocked
      const walkInCreditDraft = await postJson(baseUrl, jar, 'POST', API_SALES_PATH, {
        ...draftBody,
        lines: [
          {
            productId: product.body.data.id,
            quantity: '2',
            unitPrice: { amount: '100.00', currency: 'PKR' },
          },
        ],
      });
      expect(walkInCreditDraft.status).toBe(201);
      const walkInCreditPost = await postJson(
        baseUrl,
        jar,
        'POST',
        `${API_SALES_PATH}/${walkInCreditDraft.body.data.id}/post`,
        { expectedVersion: walkInCreditDraft.body.data.version, payments: [] },
        'walkin-credit-block',
      );
      expect(walkInCreditPost.status).toBe(400);

      // Price override requires permission + reason
      const overrideDraft = await postJson(baseUrl, jar, 'POST', API_SALES_PATH, {
        ...draftBody,
        lines: [
          {
            productId: product.body.data.id,
            quantity: '1',
            unitPrice: { amount: '85.00', currency: 'PKR' },
          },
        ],
      });
      expect(overrideDraft.status).toBe(201);
      const overrideDenied = await postJson(
        baseUrl,
        jar,
        'POST',
        `${API_SALES_PATH}/${overrideDraft.body.data.id}/post`,
        {
          expectedVersion: overrideDraft.body.data.version,
          payments: [{ accountId: cash.body.data.id, amount: { amount: '85.00', currency: 'PKR' } }],
        },
        'override-denied',
      );
      expect(overrideDenied.status).toBe(400);

      const overridePost = await postJson(
        baseUrl,
        jar,
        'POST',
        `${API_SALES_PATH}/${overrideDraft.body.data.id}/post`,
        {
          expectedVersion: overrideDraft.body.data.version,
          payments: [{ accountId: cash.body.data.id, amount: { amount: '85.00', currency: 'PKR' } }],
          linePriceOverrides: [{ lineIndex: 0, reason: 'Bulk discount approved' }],
        },
        'override-post',
      );
      expect(overridePost.status).toBe(200);
      expect(overridePost.body.data.lines[0].priceOverrideReason).toBe('Bulk discount approved');

      const editPosted = await postJson(
        baseUrl,
        jar,
        'PATCH',
        `${API_SALES_PATH}/${walkInDraft.body.data.id}`,
        { ...draftBody, notes: 'fail', expectedVersion: walkInPost.body.data.version },
      );
      expect(editPosted.status).toBe(409);
    } finally {
      await close(server);
    }
  }, 120000);
});

async function boot() {
  const config = loadApiEnv({ NODE_ENV: 'test' });
  const app = createApp({
    config,
    database: createMockDatabaseLifecycle({ ready: true }),
  });
  const server = createServer(app);
  await listen(server);
  const address = server.address();
  if (address === null || typeof address === 'string') {
    throw new Error('Expected TCP port');
  }
  return {
    server,
    baseUrl: `http://127.0.0.1:${address.port}`,
    jar: createCookieJar(),
  };
}

async function seedPlan(baseUrl, jar) {
  const response = await fetchJson(
    baseUrl,
    'POST',
    API_PLATFORM_SUBSCRIPTION_PLANS_PATH,
    {
      planCode: 'Starter',
      activate: true,
      monthlyPriceMinorUnits: 1000,
    },
    {
      [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar),
      [API_PLATFORM_ACTOR_HEADER]: 'super-admin',
    },
    jar,
  );
  expect([200, 201]).toContain(response.status);
}

async function createApprovedOwner(baseUrl, jar, input) {
  const requested = await fetchJson(
    baseUrl,
    'POST',
    API_ORGANIZATION_ACTIVATION_REQUESTS_PATH,
    {
      organizationName: input.organizationName,
      ownerEmail: input.ownerEmail,
      ownerDisplayName: 'Owner',
    },
    { [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar) },
    jar,
  );
  expect(requested.status).toBe(201);

  const approved = await fetchJson(
    baseUrl,
    'POST',
    `${API_PLATFORM_ORGANIZATIONS_PATH}/${requested.body.data.organizationId}/approve`,
    {},
    {
      [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar),
      [API_PLATFORM_ACTOR_HEADER]: 'super-admin',
    },
    jar,
  );
  expect(approved.status).toBe(200);

  const activated = await fetchJson(
    baseUrl,
    'POST',
    '/api/v1/auth/activate',
    {
      token: approved.body.data.activationToken,
      password: input.password,
    },
    { [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar) },
    jar,
  );
  expect(activated.status).toBe(200);

  return { organizationId: requested.body.data.organizationId };
}

async function login(baseUrl, jar, email, password) {
  const csrf = await issueCsrf(baseUrl, jar);
  const response = await fetchJson(
    baseUrl,
    'POST',
    API_AUTH_LOGIN_PATH,
    { email, password },
    { [API_CSRF_HEADER]: csrf },
    jar,
  );
  expect(response.status).toBe(200);
}

async function issueCsrf(baseUrl, jar) {
  const response = await fetchJson(baseUrl, 'POST', API_AUTH_CSRF_PATH, {}, {}, jar);
  expect(response.status).toBe(200);
  return response.body.data.csrfToken;
}

async function postJson(baseUrl, jar, method, path, body, idempotencyKey) {
  const headers = { [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar) };
  if (idempotencyKey) {
    headers[API_IDEMPOTENCY_KEY_HEADER] = idempotencyKey;
  }
  return fetchJson(baseUrl, method, path, body, headers, jar);
}

function createCookieJar() {
  const cookies = new Map();
  return {
    absorb(headers) {
      const raw = headers.getSetCookie?.() ?? [];
      for (const entry of raw) {
        const [pair] = entry.split(';');
        const index = pair.indexOf('=');
        if (index > 0) {
          cookies.set(pair.slice(0, index), decodeURIComponent(pair.slice(index + 1)));
        }
      }
    },
    header() {
      return [...cookies.entries()].map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('; ');
    },
  };
}

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(undefined));
  });
}

function close(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve(undefined)));
  });
}

async function fetchJson(baseUrl, method, path, body, headers, jar) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...(body === null || body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(jar?.header() ? { Cookie: jar.header() } : {}),
      ...headers,
    },
    body: body === null || body === undefined ? undefined : JSON.stringify(body),
  });
  jar?.absorb(response.headers);
  const text = await response.text();
  let parsed;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = { raw: text };
  }
  return { status: response.status, body: parsed };
}
