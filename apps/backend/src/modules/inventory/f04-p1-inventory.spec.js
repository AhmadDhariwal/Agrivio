import { describe, expect, it } from 'vitest';
import {
  API_AUTH_CSRF_PATH,
  API_AUTH_LOGIN_PATH,
  API_BRANCHES_PATH,
  API_CSRF_HEADER,
  API_IDEMPOTENCY_KEY_HEADER,
  API_INVENTORY_BALANCES_PATH,
  API_INVENTORY_BATCHES_PATH,
  API_INVENTORY_MOVEMENTS_PATH,
  API_INVENTORY_OPENING_STOCK_PATH,
  API_ORGANIZATION_ACTIVATION_REQUESTS_PATH,
  API_PLATFORM_ACTOR_HEADER,
  API_PLATFORM_ORGANIZATIONS_PATH,
  API_PLATFORM_SUBSCRIPTION_PLANS_PATH,
  API_PRODUCT_CATEGORIES_PATH,
  API_PRODUCTS_PATH,
  API_USERS_PATH,
  API_WAREHOUSES_PATH,
  ApiTransportErrorCode,
} from '@agrivio/api-contracts';
import { createServer } from 'node:http';

const { createApp } = require('../../app');
const { loadApiEnv } = require('../../platform/config/runtime-config');
const { createMockDatabaseLifecycle } = require('../../platform/database/mongo-connection');

describe('F04 P1 inventory batches, opening stock, movements, WAC', () => {
  it('enforces tenant, warehouse, batch, atomicity, idempotency, reconciliation, and WAC', async () => {
    const { server, baseUrl, jar, app } = await boot();

    try {
      await seedPlan(baseUrl, jar);

      const orgA = await createApprovedOwner(baseUrl, jar, {
        organizationName: 'F04P1 Org A',
        ownerEmail: 'f04p1-owner-a@example.com',
        password: 'a-strong-passphrase',
      });
      const orgB = await createApprovedOwner(baseUrl, jar, {
        organizationName: 'F04P1 Org B',
        ownerEmail: 'f04p1-owner-b@example.com',
        password: 'a-strong-passphrase',
      });

      await login(baseUrl, jar, 'f04p1-owner-a@example.com', 'a-strong-passphrase');
      const fixtureA = await seedInventoryFixture(baseUrl, jar, {
        warehouseName: 'A Main WH',
        invoicePrefix: 'AWH1',
        categoryName: 'Fertilizers A',
        batchProductName: 'Urea A',
        noneProductName: 'Bag A',
      });

      await login(baseUrl, jar, 'f04p1-owner-b@example.com', 'a-strong-passphrase');
      const fixtureB = await seedInventoryFixture(baseUrl, jar, {
        warehouseName: 'B Main WH',
        invoicePrefix: 'BWH1',
        categoryName: 'Fertilizers B',
        batchProductName: 'Urea B',
        noneProductName: 'Bag B',
      });

      // Org A posts opening stock for batch+expiry product.
      await login(baseUrl, jar, 'f04p1-owner-a@example.com', 'a-strong-passphrase');
      const missingBatch = await postOpening(baseUrl, jar, {
        warehouseId: fixtureA.warehouseId,
        productId: fixtureA.batchProductId,
        quantity: '10',
        inventoryValue: { amount: '1000.00', currency: 'PKR' },
        expiryDate: '2027-01-01',
      }, 'missing-batch');
      expect(missingBatch.status).toBe(400);

      const missingExpiry = await postOpening(baseUrl, jar, {
        warehouseId: fixtureA.warehouseId,
        productId: fixtureA.batchProductId,
        quantity: '10',
        batchNumber: 'LOT-A1',
        inventoryValue: { amount: '1000.00', currency: 'PKR' },
      }, 'missing-expiry');
      expect(missingExpiry.status).toBe(400);

      const batchRejectOnNone = await postOpening(baseUrl, jar, {
        warehouseId: fixtureA.warehouseId,
        productId: fixtureA.noneProductId,
        quantity: '5',
        batchNumber: 'SHOULD-NOT',
        inventoryValue: { amount: '50.00', currency: 'PKR' },
      }, 'none-with-batch');
      expect(batchRejectOnNone.status).toBe(400);

      const openBatch = await postOpening(baseUrl, jar, {
        warehouseId: fixtureA.warehouseId,
        productId: fixtureA.batchProductId,
        quantity: '2',
        packagingUnitId: fixtureA.packagingUnitId,
        batchNumber: 'LOT-A1',
        manufacturingDate: '2026-01-01',
        expiryDate: '2027-06-01',
        inventoryValue: { amount: '5000.00', currency: 'PKR' },
      }, 'open-batch-1');
      expect(openBatch.status).toBe(201);
      expect(openBatch.body.data.movement.quantityBase).toBe('100.0000');
      expect(openBatch.body.data.batch.batchNumber).toBe('LOT-A1');
      expect(openBatch.body.data.costState.weightedAverageCost.amount).toBe('50.00');
      expect(openBatch.body.data.balance.quantityBase).toBe('100.0000');

      const replay = await postOpening(baseUrl, jar, {
        warehouseId: fixtureA.warehouseId,
        productId: fixtureA.batchProductId,
        quantity: '2',
        packagingUnitId: fixtureA.packagingUnitId,
        batchNumber: 'LOT-A1',
        manufacturingDate: '2026-01-01',
        expiryDate: '2027-06-01',
        inventoryValue: { amount: '5000.00', currency: 'PKR' },
      }, 'open-batch-1');
      expect(replay.status).toBe(201);
      expect(replay.body.data.movement.id).toBe(openBatch.body.data.movement.id);

      const conflictBody = await postOpening(baseUrl, jar, {
        warehouseId: fixtureA.warehouseId,
        productId: fixtureA.batchProductId,
        quantity: '3',
        packagingUnitId: fixtureA.packagingUnitId,
        batchNumber: 'LOT-A1',
        expiryDate: '2027-06-01',
        inventoryValue: { amount: '5000.00', currency: 'PKR' },
      }, 'open-batch-1');
      expect(conflictBody.status).toBe(409);
      expect(conflictBody.body.error.code).toBe(ApiTransportErrorCode.IdempotencyConflict);

      const openNone = await postOpening(baseUrl, jar, {
        warehouseId: fixtureA.warehouseId,
        productId: fixtureA.noneProductId,
        quantity: '4',
        inventoryValue: { amount: '40.00', currency: 'PKR' },
      }, 'open-none-1');
      expect(openNone.status).toBe(201);
      expect(openNone.body.data.batch).toBeNull();
      expect(openNone.body.data.balance.batchId).toBeNull();

      const secondLot = await postOpening(baseUrl, jar, {
        warehouseId: fixtureA.warehouseId,
        productId: fixtureA.batchProductId,
        quantity: '1',
        packagingUnitId: fixtureA.packagingUnitId,
        batchNumber: 'LOT-A2',
        expiryDate: '2027-08-01',
        inventoryValue: { amount: '3000.00', currency: 'PKR' },
      }, 'open-batch-2');
      expect(secondLot.status).toBe(201);
      expect(secondLot.body.data.batch.batchNumber).toBe('LOT-A2');
      expect(secondLot.body.data.costState.weightedAverageCost.amount).toBe('53.33');
      expect(secondLot.body.data.costState.quantityBase).toBe('150.0000');

      const balances = await fetchJson(baseUrl, 'GET', API_INVENTORY_BALANCES_PATH, undefined, {}, jar);
      expect(balances.status).toBe(200);
      const batchBalances = balances.body.data.filter(
        (item) => item.productId === fixtureA.batchProductId,
      );
      expect(batchBalances).toHaveLength(2);
      expect(batchBalances.map((item) => item.batchId).sort()).toEqual(
        [openBatch.body.data.batch.id, secondLot.body.data.batch.id].sort(),
      );

      const movements = await fetchJson(
        baseUrl,
        'GET',
        `${API_INVENTORY_MOVEMENTS_PATH}?warehouseId=${fixtureA.warehouseId}`,
        undefined,
        {},
        jar,
      );
      expect(movements.status).toBe(200);
      expect(movements.body.data.length).toBeGreaterThanOrEqual(3);

      const batches = await fetchJson(baseUrl, 'GET', API_INVENTORY_BATCHES_PATH, undefined, {}, jar);
      expect(batches.status).toBe(200);
      expect(batches.body.data.some((item) => item.batchNumber === 'LOT-A1')).toBe(true);

      // Balance equals sum of movements for LOT-A1.
      const lotA1Sum = await app.agrivio.inventory.store.sumMovementSignedQuantity(orgA.organizationId, {
        warehouseId: fixtureA.warehouseId,
        productId: fixtureA.batchProductId,
        batchId: openBatch.body.data.batch.id,
      });
      expect(lotA1Sum).toBe('1000000');
      const lotA1Balance = batchBalances.find((item) => item.batchId === openBatch.body.data.batch.id);
      expect(lotA1Balance.quantityBase).toBe('100.0000');

      // Tenant isolation: Org B cannot see Org A inventory.
      await login(baseUrl, jar, 'f04p1-owner-b@example.com', 'a-strong-passphrase');
      const crossBalances = await fetchJson(baseUrl, 'GET', API_INVENTORY_BALANCES_PATH, undefined, {}, jar);
      expect(crossBalances.status).toBe(200);
      expect(
        crossBalances.body.data.every(
          (item) =>
            item.warehouseId === fixtureB.warehouseId ||
            item.productId === fixtureB.batchProductId ||
            item.productId === fixtureB.noneProductId,
        ),
      ).toBe(true);
      expect(
        crossBalances.body.data.some((item) => item.warehouseId === fixtureA.warehouseId),
      ).toBe(false);

      const crossBatch = await fetchJson(
        baseUrl,
        'GET',
        `${API_INVENTORY_BATCHES_PATH}/${openBatch.body.data.batch.id}`,
        undefined,
        {},
        jar,
      );
      expect(crossBatch.status).toBe(404);

      // Warehouse assignment enforcement for Manager.
      await login(baseUrl, jar, 'f04p1-owner-a@example.com', 'a-strong-passphrase');
      const secondWh = await fetchJson(
        baseUrl,
        'POST',
        API_WAREHOUSES_PATH,
        { name: 'A Restricted WH' },
        { [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar) },
        jar,
      );
      expect(secondWh.status).toBe(201);

      const manager = await fetchJson(
        baseUrl,
        'POST',
        API_USERS_PATH,
        {
          email: 'f04p1-manager-a@example.com',
          displayName: 'Manager A',
          role: 'Manager',
        },
        { [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar) },
        jar,
      );
      expect(manager.status).toBe(201);
      const activationToken = manager.body.data.activationToken;
      expect(activationToken).toBeTruthy();

      const assign = await fetchJson(
        baseUrl,
        'PUT',
        `${API_USERS_PATH}/${manager.body.data.id}/access-assignments`,
        {
          branchIds: [fixtureA.branchId],
          warehouseIds: [fixtureA.warehouseId],
        },
        { [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar) },
        jar,
      );
      expect(assign.status).toBe(200);
      expect(assign.body.data.warehouseIds).toContain(fixtureA.warehouseId);

      const activatedManager = await fetchJson(
        baseUrl,
        'POST',
        '/api/v1/auth/activate',
        { token: activationToken, password: 'manager-passphrase' },
        { [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar) },
        jar,
      );
      expect(activatedManager.status).toBe(200);

      await login(baseUrl, jar, 'f04p1-manager-a@example.com', 'manager-passphrase');
      const deniedWh = await postOpening(baseUrl, jar, {
        warehouseId: secondWh.body.data.id,
        productId: fixtureA.noneProductId,
        quantity: '1',
        inventoryValue: { amount: '10.00', currency: 'PKR' },
      }, 'manager-denied-wh');
      expect(deniedWh.status).toBe(403);

      const allowedWh = await postOpening(baseUrl, jar, {
        warehouseId: fixtureA.warehouseId,
        productId: fixtureA.noneProductId,
        quantity: '1',
        inventoryValue: { amount: '10.00', currency: 'PKR' },
      }, 'manager-allowed-wh');
      expect(allowedWh.status).toBe(201);

      // No direct movement mutation endpoints.
      await login(baseUrl, jar, 'f04p1-owner-a@example.com', 'a-strong-passphrase');
      const deleteAttempt = await fetchJson(
        baseUrl,
        'DELETE',
        `${API_INVENTORY_MOVEMENTS_PATH}/${openBatch.body.data.movement.id}`,
        undefined,
        { [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar) },
        jar,
      );
      expect(deleteAttempt.status).toBe(404);

      const patchAttempt = await fetchJson(
        baseUrl,
        'PATCH',
        `${API_INVENTORY_MOVEMENTS_PATH}/${openBatch.body.data.movement.id}`,
        { quantity: '999' },
        { [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar) },
        jar,
      );
      expect(patchAttempt.status).toBe(404);

      // Product master is not an authoritative stock holder.
      const product = await fetchJson(
        baseUrl,
        'GET',
        `${API_PRODUCTS_PATH}/${fixtureA.batchProductId}`,
        undefined,
        {},
        jar,
      );
      expect(product.status).toBe(200);
      expect(product.body.data.quantityBase).toBeUndefined();
      expect(product.body.data.stockOnHand).toBeUndefined();

      // Concurrent posts do not silently overwrite (conflict or both succeed with reconciled qty).
      const inventoryStore = app.agrivio.inventory.store;
      const concurrentCsrf = await issueCsrf(baseUrl, jar);
      const concurrent = await Promise.all([
        fetchJson(
          baseUrl,
          'POST',
          API_INVENTORY_OPENING_STOCK_PATH,
          {
            warehouseId: fixtureA.warehouseId,
            productId: fixtureA.noneProductId,
            quantity: '1',
            inventoryValue: { amount: '11.00', currency: 'PKR' },
          },
          {
            [API_CSRF_HEADER]: concurrentCsrf,
            [API_IDEMPOTENCY_KEY_HEADER]: 'concurrent-1',
          },
          jar,
        ),
        fetchJson(
          baseUrl,
          'POST',
          API_INVENTORY_OPENING_STOCK_PATH,
          {
            warehouseId: fixtureA.warehouseId,
            productId: fixtureA.noneProductId,
            quantity: '1',
            inventoryValue: { amount: '12.00', currency: 'PKR' },
          },
          {
            [API_CSRF_HEADER]: concurrentCsrf,
            [API_IDEMPOTENCY_KEY_HEADER]: 'concurrent-2',
          },
          jar,
        ),
      ]);
      expect(
        concurrent.every((item) => item.status === 201 || item.status === 409),
      ).toBe(true);
      expect(concurrent.some((item) => item.status === 201)).toBe(true);
      const noneBalance = await inventoryStore.findBalance(
        orgA.organizationId,
        fixtureA.warehouseId,
        fixtureA.noneProductId,
        null,
      );
      const noneSum = await inventoryStore.sumMovementSignedQuantity(orgA.organizationId, {
        warehouseId: fixtureA.warehouseId,
        productId: fixtureA.noneProductId,
        batchId: null,
      });
      expect(noneBalance.quantityBaseMinorUnits).toBe(noneSum);
    } finally {
      server.close();
    }
  }, 120000);
});

async function seedInventoryFixture(baseUrl, jar, names) {
  const branch = await fetchJson(
    baseUrl,
    'POST',
    API_BRANCHES_PATH,
    { name: `${names.warehouseName} Branch`, invoicePrefix: names.invoicePrefix },
    { [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar) },
    jar,
  );
  expect(branch.status).toBe(201);

  const warehouse = await fetchJson(
    baseUrl,
    'POST',
    API_WAREHOUSES_PATH,
    { name: names.warehouseName },
    { [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar) },
    jar,
  );
  expect(warehouse.status).toBe(201);

  const category = await fetchJson(
    baseUrl,
    'POST',
    API_PRODUCT_CATEGORIES_PATH,
    { name: names.categoryName, productClass: 'fertilizer' },
    { [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar) },
    jar,
  );
  expect(category.status).toBe(201);

  const bagCategory = await fetchJson(
    baseUrl,
    'POST',
    API_PRODUCT_CATEGORIES_PATH,
    { name: `${names.categoryName} Misc`, productClass: 'general' },
    { [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar) },
    jar,
  );
  expect(bagCategory.status).toBe(201);

  const batchProduct = await fetchJson(
    baseUrl,
    'POST',
    API_PRODUCTS_PATH,
    {
      name: names.batchProductName,
      categoryId: category.body.data.id,
      trackingMode: 'batch_expiry',
      baseUnitCode: 'KG',
      measurementDimension: 'mass',
    },
    { [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar) },
    jar,
  );
  expect(batchProduct.status).toBe(201);

  const packagingReplace = await fetchJson(
    baseUrl,
    'PUT',
    `${API_PRODUCTS_PATH}/${batchProduct.body.data.id}/packaging-units`,
    {
      expectedVersion: batchProduct.body.data.version,
      items: [{ name: '50 KG', conversionFactor: '50' }],
    },
    { [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar) },
    jar,
  );
  expect(packagingReplace.status).toBe(200);

  const packaging = await fetchJson(
    baseUrl,
    'GET',
    `${API_PRODUCTS_PATH}/${batchProduct.body.data.id}/packaging-units`,
    undefined,
    {},
    jar,
  );
  expect(packaging.status).toBe(200);

  const noneProduct = await fetchJson(
    baseUrl,
    'POST',
    API_PRODUCTS_PATH,
    {
      name: names.noneProductName,
      categoryId: bagCategory.body.data.id,
      trackingMode: 'none',
      baseUnitCode: 'KG',
      measurementDimension: 'mass',
    },
    { [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar) },
    jar,
  );
  expect(noneProduct.status).toBe(201);

  return {
    branchId: branch.body.data.id,
    warehouseId: warehouse.body.data.id,
    batchProductId: batchProduct.body.data.id,
    noneProductId: noneProduct.body.data.id,
    packagingUnitId: packaging.body.data.items[0].id,
  };
}

async function postOpening(baseUrl, jar, body, idempotencyKey) {
  return fetchJson(
    baseUrl,
    'POST',
    API_INVENTORY_OPENING_STOCK_PATH,
    body,
    {
      [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar),
      [API_IDEMPOTENCY_KEY_HEADER]: idempotencyKey,
    },
    jar,
  );
}

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
    app,
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
      limits: { customers: 50, suppliers: 50, products: 50, warehouses: 20, users: 20 },
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

  return {
    organizationId: requested.body.data.organizationId,
  };
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
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
}

async function fetchJson(baseUrl, method, path, body, headers = {}, jar) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(jar === undefined ? {} : { cookie: jar.header() }),
      ...headers,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  jar?.absorb(response.headers);
  const json = await response.json();
  return { status: response.status, body: json };
}
