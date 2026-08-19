import { describe, expect, it } from 'vitest';
import {
  API_AUTH_CSRF_PATH,
  API_AUTH_LOGIN_PATH,
  API_ACCOUNTS_PATH,
  API_CSRF_HEADER,
  API_IDEMPOTENCY_KEY_HEADER,
  API_INVENTORY_BALANCES_PATH,
  API_INVENTORY_MOVEMENTS_PATH,
  API_ORGANIZATION_ACTIVATION_REQUESTS_PATH,
  API_PLATFORM_ACTOR_HEADER,
  API_PLATFORM_ORGANIZATIONS_PATH,
  API_PLATFORM_SUBSCRIPTION_PLANS_PATH,
  API_PRODUCT_CATEGORIES_PATH,
  API_PRODUCTS_PATH,
  API_PURCHASES_PATH,
  API_SUPPLIERS_PATH,
  API_USERS_PATH,
  API_AUTH_LOGOUT_PATH,
  API_WAREHOUSES_PATH,
  ApiTransportErrorCode,
} from '@agrivio/api-contracts';
import { createServer } from 'node:http';

const { createApp } = require('../../app');
const { loadApiEnv } = require('../../platform/config/runtime-config');
const { createMockDatabaseLifecycle } = require('../../platform/database/mongo-connection');

describe('F05 P2 purchase posting, landed cost, and payments', () => {
  it('posts credit/full/partial/mixed purchases with inventory and ledger reconciliation', async () => {
    const { server, baseUrl, jar, inventory, accounts, ledgers } = await boot();

    try {
      await seedPlan(baseUrl, jar);

      const orgA = await createApprovedOwner(baseUrl, jar, {
        organizationName: 'F05P2 Org A',
        ownerEmail: 'f05p2-owner-a@example.com',
        password: 'a-strong-passphrase',
      });
      const orgB = await createApprovedOwner(baseUrl, jar, {
        organizationName: 'F05P2 Org B',
        ownerEmail: 'f05p2-owner-b@example.com',
        password: 'b-strong-passphrase',
      });

      await login(baseUrl, jar, 'f05p2-owner-a@example.com', 'a-strong-passphrase');

      const supplier = await fetchJson(
        baseUrl,
        'POST',
        API_SUPPLIERS_PATH,
        { name: 'P2 Supplier', phone: '03002220001' },
        { [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar) },
        jar,
      );
      expect(supplier.status).toBe(201);

      const cash = await fetchJson(
        baseUrl,
        'POST',
        API_ACCOUNTS_PATH,
        { name: 'Cash P2', accountType: 'cash' },
        { [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar) },
        jar,
      );
      expect(cash.status).toBe(201);
      await fetchJson(
        baseUrl,
        'POST',
        `${API_ACCOUNTS_PATH}/${cash.body.data.id}/opening-balance`,
        { amount: { amount: '100000.00', currency: 'PKR' } },
        {
          [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar),
          [API_IDEMPOTENCY_KEY_HEADER]: 'p2-cash-open',
        },
        jar,
      );

      const bank = await fetchJson(
        baseUrl,
        'POST',
        API_ACCOUNTS_PATH,
        { name: 'Bank P2', accountType: 'bank', bankName: 'HBL' },
        { [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar) },
        jar,
      );
      expect(bank.status).toBe(201);
      await fetchJson(
        baseUrl,
        'POST',
        `${API_ACCOUNTS_PATH}/${bank.body.data.id}/opening-balance`,
        { amount: { amount: '100000.00', currency: 'PKR' } },
        {
          [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar),
          [API_IDEMPOTENCY_KEY_HEADER]: 'p2-bank-open',
        },
        jar,
      );

      const warehouse = await fetchJson(
        baseUrl,
        'POST',
        API_WAREHOUSES_PATH,
        { name: 'P2 WH' },
        { [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar) },
        jar,
      );
      expect(warehouse.status).toBe(201);

      const category = await fetchJson(
        baseUrl,
        'POST',
        API_PRODUCT_CATEGORIES_PATH,
        { name: 'P2 Cat', productClass: 'general' },
        { [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar) },
        jar,
      );
      expect(category.status).toBe(201);

      const product = await fetchJson(
        baseUrl,
        'POST',
        API_PRODUCTS_PATH,
        {
          name: 'P2 Seed',
          categoryId: category.body.data.id,
          trackingMode: 'batch_expiry',
          baseUnitCode: 'KG',
          measurementDimension: 'mass',
        },
        { [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar) },
        jar,
      );
      expect(product.status).toBe(201);

      const packaging = await fetchJson(
        baseUrl,
        'PUT',
        `${API_PRODUCTS_PATH}/${product.body.data.id}/packaging-units`,
        {
          expectedVersion: product.body.data.version,
          items: [{ name: '50 KG', conversionFactor: '50' }],
        },
        { [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar) },
        jar,
      );
      expect(packaging.status).toBe(200);
      const packagingUnitId = packaging.body.data.items[0].id;

      const draftBody = {
        warehouseId: warehouse.body.data.id,
        supplierId: supplier.body.data.id,
        purchaseDate: '2026-08-11',
        lines: [
          {
            productId: product.body.data.id,
            packagingUnitId,
            quantity: '2',
            unitCost: { amount: '1000.00', currency: 'PKR' },
            batchNumber: 'LOT-P2-1',
            expiryDate: '2027-12-31',
          },
        ],
        landedCosts: {
          freight: { amount: '200.00', currency: 'PKR' },
        },
      };

      // Credit / unpaid purchase
      const creditDraft = await fetchJson(
        baseUrl,
        'POST',
        API_PURCHASES_PATH,
        draftBody,
        { [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar) },
        jar,
      );
      expect(creditDraft.status).toBe(201);
      expect(creditDraft.body.data.status).toBe('draft');

      const balancesBefore = await fetchJson(
        baseUrl,
        'GET',
        API_INVENTORY_BALANCES_PATH,
        null,
        {},
        jar,
      );
      expect(balancesBefore.status).toBe(200);
      expect(balancesBefore.body.data).toHaveLength(0);

      const creditPost = await fetchJson(
        baseUrl,
        'POST',
        `${API_PURCHASES_PATH}/${creditDraft.body.data.id}/post`,
        { expectedVersion: creditDraft.body.data.version, payments: [] },
        {
          [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar),
          [API_IDEMPOTENCY_KEY_HEADER]: 'p2-credit-post',
        },
        jar,
      );
      expect(creditPost.status).toBe(200);
      expect(creditPost.body.data.status).toBe('posted');
      expect(creditPost.body.data.purchaseTotal.amount).toBe('2200.00');
      expect(creditPost.body.data.paidTotal.amount).toBe('0.00');
      expect(creditPost.body.data.payableTotal.amount).toBe('2200.00');
      expect(creditPost.body.data.lines[0].quantityBase).toBe('100.0000');
      expect(creditPost.body.data.lines[0].allocatedLandedCost.amount).toBe('200.00');
      expect(creditPost.body.data.lines[0].receiptInventoryValue.amount).toBe('2200.00');

      const balancesAfterCredit = await fetchJson(
        baseUrl,
        'GET',
        API_INVENTORY_BALANCES_PATH,
        null,
        {},
        jar,
      );
      expect(balancesAfterCredit.status).toBe(200);
      expect(balancesAfterCredit.body.data.length).toBeGreaterThan(0);
      const stock = balancesAfterCredit.body.data.find(
        (item) => item.productId === product.body.data.id,
      );
      expect(stock.quantityBase).toBe('100.0000');
      expect(stock.valuation.inventoryValue.amount).toBe('2200.00');
      expect(stock.valuation.weightedAverageCost.amount).toBe('22.00');

      const movements = await fetchJson(
        baseUrl,
        'GET',
        API_INVENTORY_MOVEMENTS_PATH,
        null,
        {},
        jar,
      );
      expect(movements.status).toBe(200);
      expect(movements.body.data.some((item) => item.sourceType === 'purchase')).toBe(true);

      const ledger = await fetchJson(
        baseUrl,
        'GET',
        `${API_SUPPLIERS_PATH}/${supplier.body.data.id}/ledger`,
        null,
        {},
        jar,
      );
      expect(ledger.status).toBe(200);
      const payableEffects = ledger.body.data.items.filter(
        (item) => item.sourceType === 'purchase_payable',
      );
      expect(payableEffects.length).toBeGreaterThanOrEqual(1);

      const editPosted = await fetchJson(
        baseUrl,
        'PATCH',
        `${API_PURCHASES_PATH}/${creditDraft.body.data.id}`,
        {
          ...draftBody,
          notes: 'should fail',
          expectedVersion: creditPost.body.data.version,
        },
        { [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar) },
        jar,
      );
      expect(editPosted.status).toBe(409);

      const discardPosted = await fetchJson(
        baseUrl,
        'DELETE',
        `${API_PURCHASES_PATH}/${creditDraft.body.data.id}`,
        null,
        { [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar) },
        jar,
      );
      expect(discardPosted.status).toBe(409);

      // Partial + mixed payments purchase
      const mixedDraft = await fetchJson(
        baseUrl,
        'POST',
        API_PURCHASES_PATH,
        {
          ...draftBody,
          lines: [
            {
              ...draftBody.lines[0],
              batchNumber: 'LOT-P2-2',
            },
          ],
        },
        { [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar) },
        jar,
      );
      expect(mixedDraft.status).toBe(201);

      const mixedPostBody = {
        expectedVersion: mixedDraft.body.data.version,
        payments: [
          {
            accountId: cash.body.data.id,
            amount: { amount: '700.00', currency: 'PKR' },
          },
          {
            accountId: bank.body.data.id,
            amount: { amount: '500.00', currency: 'PKR' },
          },
        ],
      };

      const mixedPost = await fetchJson(
        baseUrl,
        'POST',
        `${API_PURCHASES_PATH}/${mixedDraft.body.data.id}/post`,
        mixedPostBody,
        {
          [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar),
          [API_IDEMPOTENCY_KEY_HEADER]: 'p2-mixed-post',
        },
        jar,
      );
      expect(mixedPost.status).toBe(200);
      expect(mixedPost.body.data.paidTotal.amount).toBe('1200.00');
      expect(mixedPost.body.data.payableTotal.amount).toBe('1000.00');
      expect(mixedPost.body.data.payments).toHaveLength(2);

      const replay = await fetchJson(
        baseUrl,
        'POST',
        `${API_PURCHASES_PATH}/${mixedDraft.body.data.id}/post`,
        mixedPostBody,
        {
          [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar),
          [API_IDEMPOTENCY_KEY_HEADER]: 'p2-mixed-post',
        },
        jar,
      );
      expect(replay.status).toBe(200);
      expect(replay.body.data.id).toBe(mixedPost.body.data.id);

      const conflictBody = await fetchJson(
        baseUrl,
        'POST',
        `${API_PURCHASES_PATH}/${mixedDraft.body.data.id}/post`,
        {
          expectedVersion: mixedDraft.body.data.version,
          payments: [
            {
              accountId: cash.body.data.id,
              amount: { amount: '100.00', currency: 'PKR' },
            },
          ],
        },
        {
          [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar),
          [API_IDEMPOTENCY_KEY_HEADER]: 'p2-mixed-post',
        },
        jar,
      );
      expect(conflictBody.status).toBe(409);
      expect(conflictBody.body.error.code).toBe(ApiTransportErrorCode.IdempotencyConflict);

      const cashMovements = await accounts.accountsService.listAccountMovements(
        orgA.organizationId,
        cash.body.data.id,
      );
      const purchaseCashOut = cashMovements.items.filter(
        (item) => item.sourceType === 'purchase_payment',
      );
      expect(purchaseCashOut.length).toBe(1);
      expect(purchaseCashOut[0].signedAmount.amount).toBe('-700.00');

      const bankMovements = await accounts.accountsService.listAccountMovements(
        orgA.organizationId,
        bank.body.data.id,
      );
      expect(
        bankMovements.items.some(
          (item) =>
            item.sourceType === 'purchase_payment' && item.signedAmount.amount === '-500.00',
        ),
      ).toBe(true);

      // Org isolation
      await login(baseUrl, jar, 'f05p2-owner-b@example.com', 'b-strong-passphrase');
      const crossRead = await fetchJson(
        baseUrl,
        'GET',
        `${API_PURCHASES_PATH}/${creditDraft.body.data.id}`,
        null,
        {},
        jar,
      );
      expect(crossRead.status).toBe(404);

      // Unauthorized role cannot post
      await login(baseUrl, jar, 'f05p2-owner-a@example.com', 'a-strong-passphrase');
      const unauthDraft = await fetchJson(
        baseUrl,
        'POST',
        API_PURCHASES_PATH,
        {
          ...draftBody,
          lines: [
            {
              ...draftBody.lines[0],
              batchNumber: 'LOT-P2-UNAUTH',
            },
          ],
        },
        { [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar) },
        jar,
      );
      expect(unauthDraft.status).toBe(201);

      const cashier = await fetchJson(
        baseUrl,
        'POST',
        API_USERS_PATH,
        {
          email: 'f05p2-cashier@example.com',
          displayName: 'Cashier',
          role: 'Cashier',
        },
        { [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar) },
        jar,
      );
      expect(cashier.status).toBe(201);
      const activatedCashier = await fetchJson(
        baseUrl,
        'POST',
        '/api/v1/auth/activate',
        {
          token: cashier.body.data.activationToken,
          password: 'a-strong-passphrase',
        },
        { [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar) },
        jar,
      );
      expect(activatedCashier.status).toBe(200);

      await fetchJson(
        baseUrl,
        'POST',
        API_AUTH_LOGOUT_PATH,
        {},
        { [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar) },
        jar,
      );
      await login(baseUrl, jar, 'f05p2-cashier@example.com', 'a-strong-passphrase');
      const unauthorizedPost = await fetchJson(
        baseUrl,
        'POST',
        `${API_PURCHASES_PATH}/${unauthDraft.body.data.id}/post`,
        { expectedVersion: unauthDraft.body.data.version, payments: [] },
        {
          [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar),
          [API_IDEMPOTENCY_KEY_HEADER]: 'p2-unauth-post',
        },
        jar,
      );
      expect(unauthorizedPost.status).toBe(403);

      void inventory;
      void ledgers;
      void orgB;
    } finally {
      await close(server);
    }
  }, 180000);
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
    inventory: app.agrivio.inventory,
    accounts: app.agrivio.accounts,
    ledgers: app.agrivio.ledgers,
    purchases: app.agrivio.purchases,
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
  return response.body.data.session;
}

async function issueCsrf(baseUrl, jar) {
  const response = await fetchJson(baseUrl, 'POST', API_AUTH_CSRF_PATH, {}, {}, jar);
  expect(response.status).toBe(200);
  return response.body.data.csrfToken;
}

function createCookieJar() {
  const cookies = new Map();
  return {
    get(name) {
      return cookies.get(name);
    },
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
