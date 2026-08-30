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
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectSourceFiles, extractImportSpecifiers } from '../../platform/architecture/boundary-scan.js';

const { createApp } = require('../../app');
const { loadApiEnv } = require('../../platform/config/runtime-config');
const { createMockDatabaseLifecycle } = require('../../platform/database/mongo-connection');

const testDir = fileURLToPath(new URL('.', import.meta.url));
const backendRoot = join(testDir, '../..');

describe('F06 P3 approvals, walk-in/customer, and sale cancellation', () => {
  it('enforces approvals, walk-in policy, cancellation reconciliation, and architecture boundaries', async () => {
    const { server, baseUrl, jar } = await boot();

    try {
      await seedPlan(baseUrl, jar);
      await createApprovedOwner(baseUrl, jar, {
        organizationName: 'F06P3 Org',
        ownerEmail: 'f06p3-owner@example.com',
        password: 'a-strong-passphrase',
      });
      await login(baseUrl, jar, 'f06p3-owner@example.com', 'a-strong-passphrase');

      const branch = await postJson(baseUrl, jar, 'POST', API_BRANCHES_PATH, {
        name: 'P3 Branch',
        invoicePrefix: 'P3B',
      });
      expect(branch.status).toBe(201);

      const warehouse = await postJson(baseUrl, jar, 'POST', API_WAREHOUSES_PATH, { name: 'P3 WH' });
      expect(warehouse.status).toBe(201);

      const cash = await postJson(baseUrl, jar, 'POST', API_ACCOUNTS_PATH, {
        name: 'P3 Cash',
        accountType: 'cash',
      });
      expect(cash.status).toBe(201);
      await postJson(
        baseUrl,
        jar,
        'POST',
        `${API_ACCOUNTS_PATH}/${cash.body.data.id}/opening-balance`,
        { amount: { amount: '100000.00', currency: 'PKR' } },
        'p3-cash-open',
      );

      const category = await postJson(baseUrl, jar, 'POST', API_PRODUCT_CATEGORIES_PATH, {
        name: 'P3 Cat',
        productClass: 'general',
      });
      expect(category.status).toBe(201);

      const product = await postJson(baseUrl, jar, 'POST', API_PRODUCTS_PATH, {
        name: 'P3 Seed',
        categoryId: category.body.data.id,
        trackingMode: 'none',
        baseUnitCode: 'KG',
        measurementDimension: 'mass',
      });
      expect(product.status).toBe(201);

      await postJson(
        baseUrl,
        jar,
        'PUT',
        `${API_PRODUCTS_PATH}/${product.body.data.id}/prices`,
        {
          expectedVersion: product.body.data.version,
          items: [{ priceTier: 'retail', price: { amount: '100.00', currency: 'PKR' } }],
        },
      );

      await postJson(
        baseUrl,
        jar,
        'POST',
        API_INVENTORY_OPENING_STOCK_PATH,
        {
          warehouseId: warehouse.body.data.id,
          productId: product.body.data.id,
          quantity: '50',
          inventoryValue: { amount: '2500.00', currency: 'PKR' },
        },
        'p3-stock',
      );

      const expiryProduct = await postJson(baseUrl, jar, 'POST', API_PRODUCTS_PATH, {
        name: 'P3 Expiry Seed',
        categoryId: category.body.data.id,
        trackingMode: 'batch_expiry',
        baseUnitCode: 'KG',
        measurementDimension: 'mass',
      });
      expect(expiryProduct.status).toBe(201);
      await postJson(
        baseUrl,
        jar,
        'PUT',
        `${API_PRODUCTS_PATH}/${expiryProduct.body.data.id}/prices`,
        {
          expectedVersion: expiryProduct.body.data.version,
          items: [{ priceTier: 'retail', price: { amount: '40.00', currency: 'PKR' } }],
        },
      );
      await postJson(
        baseUrl,
        jar,
        'POST',
        API_INVENTORY_OPENING_STOCK_PATH,
        {
          warehouseId: warehouse.body.data.id,
          productId: expiryProduct.body.data.id,
          quantity: '10',
          inventoryValue: { amount: '400.00', currency: 'PKR' },
          batchNumber: 'EXP-1',
          expiryDate: '2020-01-01',
        },
        'p3-expired-stock',
      );

      const limitedCustomer = await postJson(baseUrl, jar, 'POST', API_CUSTOMERS_PATH, {
        name: 'Limited Customer',
        customerType: 'individual',
        phone: '03001112233',
        creditEnabled: true,
        creditLimit: { amount: '50.00', currency: 'PKR' },
        creditLimitBehaviour: 'manager_approval',
      });
      expect(limitedCustomer.status).toBe(201);

      const blockedCustomer = await postJson(baseUrl, jar, 'POST', API_CUSTOMERS_PATH, {
        name: 'Blocked Customer',
        customerType: 'individual',
        phone: '03001112244',
        creditEnabled: true,
        creditLimit: { amount: '10.00', currency: 'PKR' },
        creditLimitBehaviour: 'block',
      });
      expect(blockedCustomer.status).toBe(201);

      const walkInNamed = await postJson(baseUrl, jar, 'POST', API_CUSTOMERS_PATH, {
        name: 'Walk-in Named',
        customerType: 'walk_in',
        phone: '03009998877',
        creditEnabled: true,
        creditLimit: { amount: '500.00', currency: 'PKR' },
        creditLimitBehaviour: 'warning',
      });
      expect(walkInNamed.status).toBe(201);

      const draftBase = {
        branchId: branch.body.data.id,
        warehouseId: warehouse.body.data.id,
        saleDate: '2026-08-13',
        lines: [
          {
            productId: product.body.data.id,
            quantity: '1',
            unitPrice: { amount: '100.00', currency: 'PKR' },
          },
        ],
      };

      // Credit-limit denial without approval
      const creditDraft = await postJson(baseUrl, jar, 'POST', API_SALES_PATH, {
        ...draftBase,
        customerId: limitedCustomer.body.data.id,
      });
      expect(creditDraft.status).toBe(201);
      const creditDenied = await postJson(
        baseUrl,
        jar,
        'POST',
        `${API_SALES_PATH}/${creditDraft.body.data.id}/post`,
        { expectedVersion: creditDraft.body.data.version, payments: [] },
        'credit-denied',
      );
      expect(creditDenied.status).toBe(403);

      // Credit-limit approval
      const creditApproved = await postJson(
        baseUrl,
        jar,
        'POST',
        `${API_SALES_PATH}/${creditDraft.body.data.id}/post`,
        {
          expectedVersion: creditDraft.body.data.version,
          payments: [],
          approvals: { creditLimit: { reason: 'Manager approved temporary exceed' } },
        },
        'credit-approved',
      );
      expect(creditApproved.status).toBe(200);
      expect(creditApproved.body.data.creditLimitApproval.reason).toContain('Manager approved');

      // Block behaviour denies even with approval
      const blockDraft = await postJson(baseUrl, jar, 'POST', API_SALES_PATH, {
        ...draftBase,
        customerId: blockedCustomer.body.data.id,
      });
      expect(blockDraft.status).toBe(201);
      const blockPost = await postJson(
        baseUrl,
        jar,
        'POST',
        `${API_SALES_PATH}/${blockDraft.body.data.id}/post`,
        {
          expectedVersion: blockDraft.body.data.version,
          payments: [],
          approvals: { creditLimit: { reason: 'Should still block' } },
        },
        'credit-block',
      );
      expect(blockPost.status).toBe(400);

      // Expired stock denial / approval
      const expiredDraft = await postJson(baseUrl, jar, 'POST', API_SALES_PATH, {
        branchId: branch.body.data.id,
        warehouseId: warehouse.body.data.id,
        saleDate: '2026-08-13',
        lines: [
          {
            productId: expiryProduct.body.data.id,
            quantity: '2',
            unitPrice: { amount: '40.00', currency: 'PKR' },
          },
        ],
      });
      expect(expiredDraft.status).toBe(201);
      const expiredDenied = await postJson(
        baseUrl,
        jar,
        'POST',
        `${API_SALES_PATH}/${expiredDraft.body.data.id}/post`,
        {
          expectedVersion: expiredDraft.body.data.version,
          payments: [
            { accountId: cash.body.data.id, amount: { amount: '80.00', currency: 'PKR' } },
          ],
        },
        'expired-denied',
      );
      expect(expiredDenied.status).toBe(403);

      const expiredApproved = await postJson(
        baseUrl,
        jar,
        'POST',
        `${API_SALES_PATH}/${expiredDraft.body.data.id}/post`,
        {
          expectedVersion: expiredDraft.body.data.version,
          payments: [
            { accountId: cash.body.data.id, amount: { amount: '80.00', currency: 'PKR' } },
          ],
          approvals: { expiredStock: { reason: 'Dispose expired batch to farmer' } },
        },
        'expired-approved',
      );
      expect(expiredApproved.status).toBe(200);
      expect(expiredApproved.body.data.expiredStockApproval.reason).toContain('Dispose expired');

      // Negative-stock denial / approval
      const negativeDraft = await postJson(baseUrl, jar, 'POST', API_SALES_PATH, {
        ...draftBase,
        lines: [
          {
            productId: product.body.data.id,
            quantity: '1000',
            unitPrice: { amount: '100.00', currency: 'PKR' },
          },
        ],
      });
      expect(negativeDraft.status).toBe(201);
      const negativeDenied = await postJson(
        baseUrl,
        jar,
        'POST',
        `${API_SALES_PATH}/${negativeDraft.body.data.id}/post`,
        {
          expectedVersion: negativeDraft.body.data.version,
          payments: [
            { accountId: cash.body.data.id, amount: { amount: '100000.00', currency: 'PKR' } },
          ],
        },
        'negative-denied',
      );
      expect([400, 409]).toContain(negativeDenied.status);

      const negativeApproved = await postJson(
        baseUrl,
        jar,
        'POST',
        `${API_SALES_PATH}/${negativeDraft.body.data.id}/post`,
        {
          expectedVersion: negativeDraft.body.data.version,
          payments: [
            { accountId: cash.body.data.id, amount: { amount: '100000.00', currency: 'PKR' } },
          ],
          approvals: { negativeStock: { reason: 'Owner emergency override' } },
        },
        'negative-approved',
      );
      expect(negativeApproved.status).toBe(200);
      expect(negativeApproved.body.data.negativeStockOverride.reason).toContain('emergency');

      // Restock after negative override so later cash/cancel proofs have sellable qty
      await postJson(
        baseUrl,
        jar,
        'POST',
        API_INVENTORY_OPENING_STOCK_PATH,
        {
          warehouseId: warehouse.body.data.id,
          productId: product.body.data.id,
          quantity: '2000',
          inventoryValue: { amount: '100000.00', currency: 'PKR' },
        },
        'p3-restock',
      );

      // Anonymous walk-in credit denied; walk-in cash allowed
      const anonCreditDraft = await postJson(baseUrl, jar, 'POST', API_SALES_PATH, draftBase);
      expect(anonCreditDraft.status).toBe(201);
      const anonCreditPost = await postJson(
        baseUrl,
        jar,
        'POST',
        `${API_SALES_PATH}/${anonCreditDraft.body.data.id}/post`,
        { expectedVersion: anonCreditDraft.body.data.version, payments: [] },
        'anon-credit',
      );
      expect(anonCreditPost.status).toBe(400);

      const walkInCashDraft = await postJson(baseUrl, jar, 'POST', API_SALES_PATH, draftBase);
      expect(walkInCashDraft.status).toBe(201);
      const walkInCashPost = await postJson(
        baseUrl,
        jar,
        'POST',
        `${API_SALES_PATH}/${walkInCashDraft.body.data.id}/post`,
        {
          expectedVersion: walkInCashDraft.body.data.version,
          payments: [
            { accountId: cash.body.data.id, amount: { amount: '100.00', currency: 'PKR' } },
          ],
        },
        'walkin-cash',
      );
      expect(walkInCashPost.status).toBe(200);
      expect(walkInCashPost.body.data.customerId).toBeNull();
      expect(walkInCashPost.body.data.receivableTotal.amount).toBe('0.00');

      // Named walk-in credit allowed when credit-enabled with identity
      const namedWalkInDraft = await postJson(baseUrl, jar, 'POST', API_SALES_PATH, {
        ...draftBase,
        customerId: walkInNamed.body.data.id,
      });
      expect(namedWalkInDraft.status).toBe(201);
      const namedWalkInPost = await postJson(
        baseUrl,
        jar,
        'POST',
        `${API_SALES_PATH}/${namedWalkInDraft.body.data.id}/post`,
        { expectedVersion: namedWalkInDraft.body.data.version, payments: [] },
        'named-walkin-credit',
      );
      expect(namedWalkInPost.status).toBe(200);
      expect(namedWalkInPost.body.data.receivableTotal.amount).toBe('100.00');

      // Cancellation: unpaid credit sale
      const unpaidDraft = await postJson(baseUrl, jar, 'POST', API_SALES_PATH, {
        ...draftBase,
        customerId: walkInNamed.body.data.id,
      });
      const unpaidPost = await postJson(
        baseUrl,
        jar,
        'POST',
        `${API_SALES_PATH}/${unpaidDraft.body.data.id}/post`,
        { expectedVersion: unpaidDraft.body.data.version, payments: [] },
        'cancel-unpaid-post',
      );
      expect(unpaidPost.status).toBe(200);
      const unpaidCancel = await postJson(
        baseUrl,
        jar,
        'POST',
        `${API_SALES_PATH}/${unpaidDraft.body.data.id}/cancel`,
        { expectedVersion: unpaidPost.body.data.version, reason: 'Customer cancelled order' },
        'cancel-unpaid',
      );
      expect(unpaidCancel.status).toBe(200);
      expect(unpaidCancel.body.data.status).toBe('cancelled');
      expect(unpaidCancel.body.data.invoiceNumber).toBe(unpaidPost.body.data.invoiceNumber);
      expect(unpaidCancel.body.data.cancellationReason).toBe('Customer cancelled order');

      const doubleCancel = await postJson(
        baseUrl,
        jar,
        'POST',
        `${API_SALES_PATH}/${unpaidDraft.body.data.id}/cancel`,
        { expectedVersion: unpaidCancel.body.data.version, reason: 'again' },
        'cancel-unpaid-again',
      );
      expect(doubleCancel.status).toBe(409);

      // Cancellation: paid walk-in + idempotent retry
      const paidDraft = await postJson(baseUrl, jar, 'POST', API_SALES_PATH, draftBase);
      const paidPost = await postJson(
        baseUrl,
        jar,
        'POST',
        `${API_SALES_PATH}/${paidDraft.body.data.id}/post`,
        {
          expectedVersion: paidDraft.body.data.version,
          payments: [
            { accountId: cash.body.data.id, amount: { amount: '100.00', currency: 'PKR' } },
          ],
        },
        'cancel-paid-post',
      );
      expect(paidPost.status).toBe(200);
      const balancesBefore = await fetchJson(
        baseUrl,
        'GET',
        API_INVENTORY_BALANCES_PATH,
        null,
        {},
        jar,
      );
      const qtyBefore = balancesBefore.body.data.find(
        (item) => item.productId === product.body.data.id,
      )?.quantityBase;

      const paidCancel = await postJson(
        baseUrl,
        jar,
        'POST',
        `${API_SALES_PATH}/${paidDraft.body.data.id}/cancel`,
        { expectedVersion: paidPost.body.data.version, reason: 'Wrong cash sale' },
        'cancel-paid',
      );
      expect(paidCancel.status).toBe(200);
      expect(paidCancel.body.data.status).toBe('cancelled');

      const paidCancelReplay = await postJson(
        baseUrl,
        jar,
        'POST',
        `${API_SALES_PATH}/${paidDraft.body.data.id}/cancel`,
        { expectedVersion: paidPost.body.data.version, reason: 'Wrong cash sale' },
        'cancel-paid',
      );
      expect(paidCancelReplay.status).toBe(200);
      expect(paidCancelReplay.body.data.id).toBe(paidDraft.body.data.id);

      const balancesAfter = await fetchJson(
        baseUrl,
        'GET',
        API_INVENTORY_BALANCES_PATH,
        null,
        {},
        jar,
      );
      const qtyAfter = balancesAfter.body.data.find(
        (item) => item.productId === product.body.data.id,
      )?.quantityBase;
      expect(Number(qtyAfter)).toBeGreaterThan(Number(qtyBefore));

      const movements = await fetchJson(baseUrl, 'GET', API_INVENTORY_MOVEMENTS_PATH, null, {}, jar);
      expect(movements.status).toBe(200);
      expect(
        movements.body.data.some((item) => item.sourceType === 'sale_cancellation'),
      ).toBe(true);

      // Partial/mixed cancellation
      const mixedCustomer = await postJson(baseUrl, jar, 'POST', API_CUSTOMERS_PATH, {
        name: 'Mixed Customer',
        customerType: 'farmer',
        phone: '03005556677',
        creditEnabled: true,
        creditLimit: { amount: '10000.00', currency: 'PKR' },
        creditLimitBehaviour: 'warning',
      });
      const mixedDraft = await postJson(baseUrl, jar, 'POST', API_SALES_PATH, {
        ...draftBase,
        customerId: mixedCustomer.body.data.id,
        lines: [
          {
            productId: product.body.data.id,
            quantity: '2',
            unitPrice: { amount: '100.00', currency: 'PKR' },
          },
        ],
      });
      const mixedPost = await postJson(
        baseUrl,
        jar,
        'POST',
        `${API_SALES_PATH}/${mixedDraft.body.data.id}/post`,
        {
          expectedVersion: mixedDraft.body.data.version,
          payments: [
            { accountId: cash.body.data.id, amount: { amount: '50.00', currency: 'PKR' } },
          ],
        },
        'cancel-mixed-post',
      );
      expect(mixedPost.status).toBe(200);
      expect(mixedPost.body.data.receivableTotal.amount).toBe('150.00');
      const mixedCancel = await postJson(
        baseUrl,
        jar,
        'POST',
        `${API_SALES_PATH}/${mixedDraft.body.data.id}/cancel`,
        { expectedVersion: mixedPost.body.data.version, reason: 'Partial sale voided' },
        'cancel-mixed',
      );
      expect(mixedCancel.status).toBe(200);
      expect(mixedCancel.body.data.status).toBe('cancelled');
      expect(mixedCancel.body.data.invoiceNumber).toBeTruthy();

      // Cancel reason required
      const reasonDraft = await postJson(baseUrl, jar, 'POST', API_SALES_PATH, {
        ...draftBase,
        customerId: mixedCustomer.body.data.id,
      });
      const reasonPost = await postJson(
        baseUrl,
        jar,
        'POST',
        `${API_SALES_PATH}/${reasonDraft.body.data.id}/post`,
        { expectedVersion: reasonDraft.body.data.version, payments: [] },
        'reason-post',
      );
      const reasonMissing = await postJson(
        baseUrl,
        jar,
        'POST',
        `${API_SALES_PATH}/${reasonDraft.body.data.id}/cancel`,
        { expectedVersion: reasonPost.body.data.version, reason: '' },
        'reason-missing',
      );
      expect(reasonMissing.status).toBe(400);

      // Architecture: Sales must not import foreign persistence
      const salesFiles = collectSourceFiles(join(backendRoot, 'modules/sales')).filter(
        (file) => !file.includes('.spec.') && !file.includes('mongo.integration'),
      );
      for (const file of salesFiles) {
        for (const specifier of extractImportSpecifiers(file)) {
          expect(specifier).not.toMatch(/modules\/inventory\/persistence/);
          expect(specifier).not.toMatch(/modules\/payments-ledgers\/persistence/);
          expect(specifier).not.toMatch(/modules\/accounts-expenses\/persistence/);
        }
      }
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
