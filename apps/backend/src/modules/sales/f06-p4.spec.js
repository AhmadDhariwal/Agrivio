import { describe, expect, it } from 'vitest';
import {
  API_AUTH_CSRF_PATH,
  API_AUTH_LOGIN_PATH,
  API_AUTH_LOGOUT_PATH,
  API_ACCOUNTS_PATH,
  API_BRANCHES_PATH,
  API_CSRF_HEADER,
  API_IDEMPOTENCY_KEY_HEADER,
  API_INVENTORY_BALANCES_PATH,
  API_INVENTORY_OPENING_STOCK_PATH,
  API_ORGANIZATION_ACTIVATION_REQUESTS_PATH,
  API_PLATFORM_ACTOR_HEADER,
  API_PLATFORM_ORGANIZATIONS_PATH,
  API_PLATFORM_SUBSCRIPTION_PLANS_PATH,
  API_PRODUCT_CATEGORIES_PATH,
  API_PRODUCTS_PATH,
  API_SALES_PATH,
  API_USERS_PATH,
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

describe('F06 P4 printing and cashier POS wiring', () => {
  it('prints posted snapshots, enforces view/tenant rules, and lets a cashier complete a cash sale', async () => {
    const { server, baseUrl, jar } = await boot();

    try {
      await seedPlan(baseUrl, jar);
      await createApprovedOwner(baseUrl, jar, {
        organizationName: 'F06P4 Org A',
        ownerEmail: 'f06p4-owner-a@example.com',
        password: 'a-strong-passphrase',
      });
      await createApprovedOwner(baseUrl, jar, {
        organizationName: 'F06P4 Org B',
        ownerEmail: 'f06p4-owner-b@example.com',
        password: 'a-strong-passphrase',
      });
      await login(baseUrl, jar, 'f06p4-owner-a@example.com', 'a-strong-passphrase');

      const branch = await postJson(baseUrl, jar, 'POST', API_BRANCHES_PATH, {
        name: 'P4 Branch',
        invoicePrefix: 'P4A',
      });
      expect(branch.status).toBe(201);

      const warehouse = await postJson(baseUrl, jar, 'POST', API_WAREHOUSES_PATH, { name: 'P4 WH' });
      expect(warehouse.status).toBe(201);

      const cash = await postJson(baseUrl, jar, 'POST', API_ACCOUNTS_PATH, {
        name: 'P4 Cash',
        accountType: 'cash',
      });
      expect(cash.status).toBe(201);
      await postJson(
        baseUrl,
        jar,
        'POST',
        `${API_ACCOUNTS_PATH}/${cash.body.data.id}/opening-balance`,
        { amount: { amount: '10000.00', currency: 'PKR' } },
        'p4-cash-open',
      );

      const category = await postJson(baseUrl, jar, 'POST', API_PRODUCT_CATEGORIES_PATH, {
        name: 'P4 Cat',
        productClass: 'general',
      });
      expect(category.status).toBe(201);

      const product = await postJson(baseUrl, jar, 'POST', API_PRODUCTS_PATH, {
        name: 'P4 Seed',
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
          items: [{ priceTier: 'retail', price: { amount: '50.00', currency: 'PKR' } }],
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
          quantity: '100',
          inventoryValue: { amount: '2000.00', currency: 'PKR' },
        },
        'p4-stock',
      );

      const draftBody = {
        branchId: branch.body.data.id,
        warehouseId: warehouse.body.data.id,
        saleDate: '2026-08-13',
        lines: [
          {
            productId: product.body.data.id,
            quantity: '2',
            unitPrice: { amount: '50.00', currency: 'PKR' },
          },
        ],
      };

      const walkInDraft = await postJson(baseUrl, jar, 'POST', API_SALES_PATH, draftBody);
      expect(walkInDraft.status).toBe(201);

      const draftPrint = await fetchJson(
        baseUrl,
        'GET',
        `${API_SALES_PATH}/${walkInDraft.body.data.id}/print`,
        undefined,
        {},
        jar,
      );
      expect(draftPrint.status).toBe(409);

      const walkInPost = await postJson(
        baseUrl,
        jar,
        'POST',
        `${API_SALES_PATH}/${walkInDraft.body.data.id}/post`,
        {
          expectedVersion: walkInDraft.body.data.version,
          payments: [
            { accountId: cash.body.data.id, amount: { amount: '100.00', currency: 'PKR' } },
          ],
        },
        'p4-walkin-cash',
      );
      expect(walkInPost.status).toBe(200);
      expect(walkInPost.body.data.invoiceNumber).toMatch(/^P4A-/);
      expect(walkInPost.body.data.lines[0].productNameSnapshot).toBe('P4 Seed');

      const printBeforeRename = await fetchJson(
        baseUrl,
        'GET',
        `${API_SALES_PATH}/${walkInPost.body.data.id}/print`,
        undefined,
        {},
        jar,
      );
      expect(printBeforeRename.status).toBe(200);
      expect(printBeforeRename.body.data.invoiceNumber).toBe(walkInPost.body.data.invoiceNumber);
      expect(printBeforeRename.body.data.lines[0].productNameSnapshot).toBe('P4 Seed');
      expect(printBeforeRename.body.data.lines[0].unitPrice.amount).toBe('50.00');
      expect(printBeforeRename.body.data.saleTotal.amount).toBe('100.00');
      expect(printBeforeRename.body.data.customerNameSnapshot).toBe('Walk-in');
      expect(printBeforeRename.body.data.branchNameSnapshot).toBe('P4 Branch');
      expect(printBeforeRename.body.data).not.toHaveProperty('cogsTotal');
      expect(printBeforeRename.body.data.lines[0]).not.toHaveProperty('cogsTotal');
      expect(printBeforeRename.body.data.lines[0]).not.toHaveProperty('productId');

      const currentProduct = await fetchJson(
        baseUrl,
        'GET',
        `${API_PRODUCTS_PATH}/${product.body.data.id}`,
        undefined,
        {},
        jar,
      );
      expect(currentProduct.status).toBe(200);

      const renamed = await postJson(
        baseUrl,
        jar,
        'PATCH',
        `${API_PRODUCTS_PATH}/${product.body.data.id}`,
        { expectedVersion: currentProduct.body.data.version, name: 'P4 Seed RENAMED' },
      );
      expect(renamed.status).toBe(200);

      const printAfterRename = await fetchJson(
        baseUrl,
        'GET',
        `${API_SALES_PATH}/${walkInPost.body.data.id}/print`,
        undefined,
        {},
        jar,
      );
      expect(printAfterRename.status).toBe(200);
      expect(printAfterRename.body.data.lines[0].productNameSnapshot).toBe('P4 Seed');
      expect(printAfterRename.body.data.lines[0].productNameSnapshot).not.toBe('P4 Seed RENAMED');

      const cashier = await postJson(baseUrl, jar, 'POST', API_USERS_PATH, {
        email: 'f06p4-cashier@example.com',
        displayName: 'P4 Cashier',
        role: 'Cashier',
      });
      expect(cashier.status).toBe(201);
      expect(cashier.body.data.activationToken).toBeTruthy();

      const assign = await postJson(
        baseUrl,
        jar,
        'PUT',
        `${API_USERS_PATH}/${cashier.body.data.id}/access-assignments`,
        {
          branchIds: [branch.body.data.id],
          warehouseIds: [warehouse.body.data.id],
        },
      );
      expect(assign.status).toBe(200);

      const storeKeeper = await postJson(baseUrl, jar, 'POST', API_USERS_PATH, {
        email: 'f06p4-storekeeper@example.com',
        displayName: 'P4 Store Keeper',
        role: 'StoreKeeper',
      });
      expect(storeKeeper.status).toBe(201);

      const activatedCashier = await postJson(baseUrl, jar, 'POST', '/api/v1/auth/activate', {
        token: cashier.body.data.activationToken,
        password: 'a-strong-passphrase',
      });
      expect(activatedCashier.status).toBe(200);

      const activatedStoreKeeper = await postJson(baseUrl, jar, 'POST', '/api/v1/auth/activate', {
        token: storeKeeper.body.data.activationToken,
        password: 'a-strong-passphrase',
      });
      expect(activatedStoreKeeper.status).toBe(200);

      await postJson(baseUrl, jar, 'POST', API_AUTH_LOGOUT_PATH, {});
      await login(baseUrl, jar, 'f06p4-storekeeper@example.com', 'a-strong-passphrase');
      const storeKeeperPrint = await fetchJson(
        baseUrl,
        'GET',
        `${API_SALES_PATH}/${walkInPost.body.data.id}/print`,
        undefined,
        {},
        jar,
      );
      expect(storeKeeperPrint.status).toBe(403);

      await postJson(baseUrl, jar, 'POST', API_AUTH_LOGOUT_PATH, {});
      await login(baseUrl, jar, 'f06p4-cashier@example.com', 'a-strong-passphrase');

      const cashierPrint = await fetchJson(
        baseUrl,
        'GET',
        `${API_SALES_PATH}/${walkInPost.body.data.id}/print`,
        undefined,
        {},
        jar,
      );
      expect(cashierPrint.status).toBe(200);
      expect(cashierPrint.body.data.invoiceNumber).toBe(walkInPost.body.data.invoiceNumber);

      const posAccounts = await fetchJson(
        baseUrl,
        'GET',
        `${API_SALES_PATH}/payment-accounts`,
        undefined,
        {},
        jar,
      );
      expect(posAccounts.status).toBe(200);
      expect(posAccounts.body.data.items.some((item) => item.name === 'P4 Cash')).toBe(true);
      expect(posAccounts.body.data.items[0]).not.toHaveProperty('openingBalance');

      const cashierDraft = await postJson(baseUrl, jar, 'POST', API_SALES_PATH, draftBody);
      expect(cashierDraft.status).toBe(201);
      const cashierPost = await postJson(
        baseUrl,
        jar,
        'POST',
        `${API_SALES_PATH}/${cashierDraft.body.data.id}/post`,
        {
          expectedVersion: cashierDraft.body.data.version,
          payments: [
            { accountId: cash.body.data.id, amount: { amount: '100.00', currency: 'PKR' } },
          ],
        },
        'p4-cashier-cash',
      );
      expect(cashierPost.status).toBe(200);
      expect(cashierPost.body.data.status).toBe('posted');
      expect(cashierPost.body.data.invoiceNumber).toMatch(/^P4A-/);

      const cashierCancel = await postJson(
        baseUrl,
        jar,
        'POST',
        `${API_SALES_PATH}/${cashierPost.body.data.id}/cancel`,
        { expectedVersion: cashierPost.body.data.version, reason: 'Should be denied' },
        'p4-cashier-cancel',
      );
      expect(cashierCancel.status).toBe(403);

      const balances = await fetchJson(baseUrl, 'GET', API_INVENTORY_BALANCES_PATH, null, {}, jar);
      expect(balances.status).toBe(200);
      const balance = balances.body.data.find((item) => item.productId === product.body.data.id);
      expect(balance.quantityBase).toBe('96.0000');

      await postJson(baseUrl, jar, 'POST', API_AUTH_LOGOUT_PATH, {});
      await login(baseUrl, jar, 'f06p4-owner-b@example.com', 'a-strong-passphrase');
      const orgBPrint = await fetchJson(
        baseUrl,
        'GET',
        `${API_SALES_PATH}/${walkInPost.body.data.id}/print`,
        undefined,
        {},
        jar,
      );
      expect(orgBPrint.status).toBe(404);

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
