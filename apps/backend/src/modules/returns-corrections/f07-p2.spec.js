import { describe, expect, it } from 'vitest';
import {
  API_AUTH_CSRF_PATH,
  API_AUTH_LOGIN_PATH,
  API_AUTH_LOGOUT_PATH,
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
  API_PURCHASES_PATH,
  API_RETURNS_PATH,
  API_SALES_PATH,
  API_SUPPLIERS_PATH,
  API_USERS_PATH,
  API_WAREHOUSES_PATH,
} from '@agrivio/api-contracts';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  collectSourceFiles,
  extractImportSpecifiers,
} from '../../platform/architecture/boundary-scan.js';

const { createApp } = require('../../app');
const { loadApiEnv } = require('../../platform/config/runtime-config');
const { createMockDatabaseLifecycle } = require('../../platform/database/mongo-connection');

const backendRoot = join(fileURLToPath(new URL('.', import.meta.url)), '../..');

describe('F07 P2 return reversal and purchase-return integration', () => {
  it('reverses linked returns with netting, linkage, permission, and idempotency proofs', async () => {
    const { server, baseUrl, jar } = await boot();

    try {
      await seedPlan(baseUrl, jar);
      const owner = await createApprovedOwner(baseUrl, jar, {
        organizationName: 'F07P2 Org',
        ownerEmail: 'f07p2-owner@example.com',
        password: 'a-strong-passphrase',
      });
      await login(baseUrl, jar, 'f07p2-owner@example.com', 'a-strong-passphrase');
      const organizationId = owner.organizationId;

      const branch = await postJson(baseUrl, jar, 'POST', API_BRANCHES_PATH, {
        name: 'F07P2 Branch',
        invoicePrefix: 'F7B',
      });
      expect(branch.status).toBe(201);

      const warehouse = await postJson(baseUrl, jar, 'POST', API_WAREHOUSES_PATH, {
        name: 'F07P2 WH',
      });
      expect(warehouse.status).toBe(201);

      const cash = await postJson(baseUrl, jar, 'POST', API_ACCOUNTS_PATH, {
        name: 'F07P2 Cash',
        accountType: 'cash',
      });
      expect(cash.status).toBe(201);
      await postJson(
        baseUrl,
        jar,
        'POST',
        `${API_ACCOUNTS_PATH}/${cash.body.data.id}/opening-balance`,
        { amount: { amount: '100000.00', currency: 'PKR' } },
        'f07p2-cash-open',
      );

      const category = await postJson(baseUrl, jar, 'POST', API_PRODUCT_CATEGORIES_PATH, {
        name: 'F07P2 Cat',
        productClass: 'general',
      });
      expect(category.status).toBe(201);

      const saleProduct = await postJson(baseUrl, jar, 'POST', API_PRODUCTS_PATH, {
        name: 'F07P2 Sale Seed',
        categoryId: category.body.data.id,
        trackingMode: 'none',
        baseUnitCode: 'KG',
        measurementDimension: 'mass',
      });
      expect(saleProduct.status).toBe(201);
      await postJson(
        baseUrl,
        jar,
        'PUT',
        `${API_PRODUCTS_PATH}/${saleProduct.body.data.id}/prices`,
        {
          expectedVersion: saleProduct.body.data.version,
          items: [{ priceTier: 'retail', price: { amount: '90.00', currency: 'PKR' } }],
        },
      );
      await postJson(
        baseUrl,
        jar,
        'POST',
        API_INVENTORY_OPENING_STOCK_PATH,
        {
          warehouseId: warehouse.body.data.id,
          productId: saleProduct.body.data.id,
          quantity: '100',
          inventoryValue: { amount: '5000.00', currency: 'PKR' },
        },
        'f07p2-sale-stock',
      );

      const purchaseProduct = await postJson(baseUrl, jar, 'POST', API_PRODUCTS_PATH, {
        name: 'F07P2 Purchase Seed',
        categoryId: category.body.data.id,
        trackingMode: 'none',
        baseUnitCode: 'KG',
        measurementDimension: 'mass',
      });
      expect(purchaseProduct.status).toBe(201);

      const customer = await postJson(baseUrl, jar, 'POST', API_CUSTOMERS_PATH, {
        name: 'F07P2 Farmer',
        customerType: 'farmer',
        phone: '03007654322',
        creditEnabled: true,
        creditLimit: { amount: '100000.00', currency: 'PKR' },
        creditLimitBehaviour: 'warning',
      });
      expect(customer.status).toBe(201);

      const creditDraft = await postJson(baseUrl, jar, 'POST', API_SALES_PATH, {
        branchId: branch.body.data.id,
        warehouseId: warehouse.body.data.id,
        customerId: customer.body.data.id,
        saleDate: '2026-08-13',
        lines: [
          {
            productId: saleProduct.body.data.id,
            quantity: '10',
            unitPrice: { amount: '90.00', currency: 'PKR' },
          },
        ],
      });
      expect(creditDraft.status).toBe(201);
      const creditPost = await postJson(
        baseUrl,
        jar,
        'POST',
        `${API_SALES_PATH}/${creditDraft.body.data.id}/post`,
        { expectedVersion: creditDraft.body.data.version, payments: [] },
        'f07p2-credit-sale',
      );
      expect(creditPost.status).toBe(200);

      const returnDraft = await postJson(
        baseUrl,
        jar,
        'POST',
        `${API_SALES_PATH}/${creditPost.body.data.id}/returns`,
        {
          lines: [{ originalLineIndex: 0, quantity: '4', stockCondition: 'sellable' }],
        },
      );
      expect(returnDraft.status).toBe(201);
      const postedReturn = await postJson(
        baseUrl,
        jar,
        'POST',
        `${API_RETURNS_PATH}/${returnDraft.body.data.id}/post`,
        {
          expectedVersion: returnDraft.body.data.version,
          reason: 'Customer returned good stock',
          resolution: 'ledger_adjustment',
        },
        'f07p2-sales-return',
      );
      expect(postedReturn.status).toBe(200);
      expect(postedReturn.body.data.status).toBe('posted');
      const originalReturnReason = postedReturn.body.data.reason;
      const originalReturnTotal = postedReturn.body.data.returnTotal.amount;
      const originalLineQty = postedReturn.body.data.lines[0].quantity;

      const missingReason = await postJson(
        baseUrl,
        jar,
        'POST',
        `${API_RETURNS_PATH}/${postedReturn.body.data.id}/reverse`,
        { expectedVersion: postedReturn.body.data.version },
        'f07p2-missing-reason',
      );
      expect(missingReason.status).toBe(400);

      const reversed = await postJson(
        baseUrl,
        jar,
        'POST',
        `${API_RETURNS_PATH}/${postedReturn.body.data.id}/reverse`,
        {
          expectedVersion: postedReturn.body.data.version,
          reason: 'Posted return in error',
        },
        'f07p2-sales-reverse',
      );
      expect(reversed.status).toBe(200);
      expect(reversed.body.data.status).toBe('reversed');
      expect(reversed.body.data.reversedByCorrectiveTransactionId).toBeTruthy();
      expect(reversed.body.data.reason).toBe(originalReturnReason);
      expect(reversed.body.data.returnTotal.amount).toBe(originalReturnTotal);
      expect(reversed.body.data.lines[0].quantity).toBe(originalLineQty);

      const replay = await postJson(
        baseUrl,
        jar,
        'POST',
        `${API_RETURNS_PATH}/${postedReturn.body.data.id}/reverse`,
        {
          expectedVersion: postedReturn.body.data.version,
          reason: 'Posted return in error',
        },
        'f07p2-sales-reverse',
      );
      expect(replay.status).toBe(200);
      expect(replay.body.data.id).toBe(reversed.body.data.id);
      expect(replay.body.data.reversedByCorrectiveTransactionId).toBe(
        reversed.body.data.reversedByCorrectiveTransactionId,
      );

      const doubleReverse = await postJson(
        baseUrl,
        jar,
        'POST',
        `${API_RETURNS_PATH}/${postedReturn.body.data.id}/reverse`,
        {
          expectedVersion: reversed.body.data.version,
          reason: 'Try again',
        },
        'f07p2-sales-reverse-2',
      );
      expect(doubleReverse.status).toBe(409);

      const saleAfter = await fetchJson(
        baseUrl,
        'GET',
        `${API_SALES_PATH}/${creditPost.body.data.id}`,
        null,
        {},
        jar,
      );
      expect(saleAfter.body.data.status).toBe('posted');
      expect(saleAfter.body.data.saleTotal.amount).toBe('900.00');

      const balances = await fetchJson(baseUrl, 'GET', API_INVENTORY_BALANCES_PATH, null, {}, jar);
      const saleBalance = balances.body.data.find(
        (item) => item.productId === saleProduct.body.data.id && !item.batchId,
      );
      expect(saleBalance.quantityBase).toBe('90.0000');

      const movements = await fetchJson(
        baseUrl,
        'GET',
        API_INVENTORY_MOVEMENTS_PATH,
        null,
        {},
        jar,
      );
      const originalMoves = movements.body.data.filter(
        (item) =>
          item.sourceType === 'sales_return' && item.sourceId === postedReturn.body.data.id,
      );
      const reversalMoves = movements.body.data.filter(
        (item) =>
          item.sourceType === 'sales_return_reversal' &&
          item.sourceId === reversed.body.data.reversedByCorrectiveTransactionId,
      );
      expect(originalMoves).toHaveLength(1);
      expect(reversalMoves).toHaveLength(1);
      expect(originalMoves[0].direction).toBe('inbound');
      expect(reversalMoves[0].direction).toBe('outbound');
      expect(originalMoves[0].quantityBase).toBe(reversalMoves[0].quantityBase);

      const ledger = await fetchJson(
        baseUrl,
        'GET',
        `${API_CUSTOMERS_PATH}/${customer.body.data.id}/ledger`,
        null,
        {},
        jar,
      );
      const originalLedger = ledger.body.data.items.find(
        (item) =>
          item.sourceType === 'sales_return' && item.sourceId === postedReturn.body.data.id,
      );
      const reversalLedger = ledger.body.data.items.find(
        (item) =>
          item.sourceType === 'sales_return_reversal' &&
          item.sourceId === reversed.body.data.reversedByCorrectiveTransactionId,
      );
      expect(originalLedger.signedAmount.amount).toBe('-360.00');
      expect(reversalLedger.signedAmount.amount).toBe('360.00');

      const secondDraft = await postJson(
        baseUrl,
        jar,
        'POST',
        `${API_SALES_PATH}/${creditPost.body.data.id}/returns`,
        {
          lines: [{ originalLineIndex: 0, quantity: '4', stockCondition: 'unsellable', unsellableReason: 'damaged' }],
        },
      );
      expect(secondDraft.status).toBe(201);
      const unsellablePost = await postJson(
        baseUrl,
        jar,
        'POST',
        `${API_RETURNS_PATH}/${secondDraft.body.data.id}/post`,
        {
          expectedVersion: secondDraft.body.data.version,
          reason: 'Damaged goods',
          resolution: 'ledger_adjustment',
          lines: [{ stockCondition: 'unsellable', unsellableReason: 'damaged' }],
        },
        'f07p2-unsellable-return',
      );
      expect(unsellablePost.status).toBe(200);

      const afterUnsellable = await fetchJson(
        baseUrl,
        'GET',
        API_INVENTORY_BALANCES_PATH,
        null,
        {},
        jar,
      );
      const unsellableBalance = afterUnsellable.body.data.find(
        (item) => item.productId === saleProduct.body.data.id && !item.batchId,
      );
      expect(unsellableBalance.quantityBase).toBe('90.0000');
      expect(unsellableBalance.unsellableQuantityBase).toBe('4.0000');

      const unsellableReverse = await postJson(
        baseUrl,
        jar,
        'POST',
        `${API_RETURNS_PATH}/${unsellablePost.body.data.id}/reverse`,
        {
          expectedVersion: unsellablePost.body.data.version,
          reason: 'Unsellable return reversed',
        },
        'f07p2-unsellable-reverse',
      );
      expect(unsellableReverse.status).toBe(200);
      expect(unsellableReverse.body.data.status).toBe('reversed');

      const afterUnsellableReverse = await fetchJson(
        baseUrl,
        'GET',
        API_INVENTORY_BALANCES_PATH,
        null,
        {},
        jar,
      );
      const clearedUnsellable = afterUnsellableReverse.body.data.find(
        (item) => item.productId === saleProduct.body.data.id && !item.batchId,
      );
      expect(clearedUnsellable.quantityBase).toBe('90.0000');
      expect(clearedUnsellable.unsellableQuantityBase).toBe('0.0000');

      const supplier = await postJson(baseUrl, jar, 'POST', API_SUPPLIERS_PATH, {
        name: 'F07P2 Supplier',
        phone: '03001112233',
      });
      expect(supplier.status).toBe(201);

      const purchaseDraft = await postJson(baseUrl, jar, 'POST', API_PURCHASES_PATH, {
        warehouseId: warehouse.body.data.id,
        supplierId: supplier.body.data.id,
        purchaseDate: '2026-08-13',
        lines: [
          {
            productId: purchaseProduct.body.data.id,
            quantity: '10',
            unitCost: { amount: '50.00', currency: 'PKR' },
          },
        ],
        landedCosts: { freight: { amount: '0.00', currency: 'PKR' } },
      });
      expect(purchaseDraft.status).toBe(201);
      const postedPurchase = await postJson(
        baseUrl,
        jar,
        'POST',
        `${API_PURCHASES_PATH}/${purchaseDraft.body.data.id}/post`,
        { expectedVersion: purchaseDraft.body.data.version, payments: [] },
        'f07p2-purchase-post',
      );
      expect(postedPurchase.status).toBe(200);

      const purchaseReturnDraft = await postJson(
        baseUrl,
        jar,
        'POST',
        `${API_PURCHASES_PATH}/${postedPurchase.body.data.id}/returns`,
        { lines: [{ originalLineIndex: 0, quantity: '4' }] },
      );
      expect(purchaseReturnDraft.status).toBe(201);
      const postedPurchaseReturn = await postJson(
        baseUrl,
        jar,
        'POST',
        `${API_RETURNS_PATH}/${purchaseReturnDraft.body.data.id}/post`,
        {
          expectedVersion: purchaseReturnDraft.body.data.version,
          reason: 'Supplier quality return',
          resolution: 'ledger_adjustment',
        },
        'f07p2-purchase-return',
      );
      expect(postedPurchaseReturn.status).toBe(200);
      expect(postedPurchaseReturn.body.data.returnType).toBe('purchase');

      const purchaseReversed = await postJson(
        baseUrl,
        jar,
        'POST',
        `${API_RETURNS_PATH}/${postedPurchaseReturn.body.data.id}/reverse`,
        {
          expectedVersion: postedPurchaseReturn.body.data.version,
          reason: 'Purchase return reversed',
        },
        'f07p2-purchase-reverse',
      );
      expect(purchaseReversed.status).toBe(200);
      expect(purchaseReversed.body.data.status).toBe('reversed');
      expect(purchaseReversed.body.data.reason).toBe('Supplier quality return');
      expect(purchaseReversed.body.data.returnTotal.amount).toBe(
        postedPurchaseReturn.body.data.returnTotal.amount,
      );

      const purchaseBalances = await fetchJson(
        baseUrl,
        'GET',
        API_INVENTORY_BALANCES_PATH,
        null,
        {},
        jar,
      );
      const purchaseBalance = purchaseBalances.body.data.find(
        (item) => item.productId === purchaseProduct.body.data.id && !item.batchId,
      );
      expect(purchaseBalance.quantityBase).toBe('10.0000');

      const supplierLedger = await fetchJson(
        baseUrl,
        'GET',
        `${API_SUPPLIERS_PATH}/${supplier.body.data.id}/ledger`,
        null,
        {},
        jar,
      );
      const purchaseReturnEffect = supplierLedger.body.data.items.find(
        (item) =>
          item.sourceType === 'purchase_return' &&
          item.sourceId === postedPurchaseReturn.body.data.id,
      );
      const purchaseReturnReversalEffect = supplierLedger.body.data.items.find(
        (item) =>
          item.sourceType === 'purchase_return_reversal' &&
          item.sourceId === purchaseReversed.body.data.reversedByCorrectiveTransactionId,
      );
      expect(purchaseReturnEffect).toBeTruthy();
      expect(purchaseReturnReversalEffect).toBeTruthy();
      expect(purchaseReturnReversalEffect.signedAmount.amount).toBe(
        String((-Number(purchaseReturnEffect.signedAmount.amount)).toFixed(2)),
      );

      const remainingDraft = await postJson(
        baseUrl,
        jar,
        'POST',
        `${API_PURCHASES_PATH}/${postedPurchase.body.data.id}/returns`,
        { lines: [{ originalLineIndex: 0, quantity: '4' }] },
      );
      expect(remainingDraft.status).toBe(201);
      const remainingPost = await postJson(
        baseUrl,
        jar,
        'POST',
        `${API_RETURNS_PATH}/${remainingDraft.body.data.id}/post`,
        {
          expectedVersion: remainingDraft.body.data.version,
          reason: 'Returnable again after reverse',
          resolution: 'ledger_adjustment',
        },
        'f07p2-purchase-return-again',
      );
      expect(remainingPost.status).toBe(200);

      const cashier = await postJson(baseUrl, jar, 'POST', API_USERS_PATH, {
        email: 'f07p2-cashier@example.com',
        displayName: 'F07P2 Cashier',
        role: 'Cashier',
      });
      expect(cashier.status).toBe(201);
      await postJson(
        baseUrl,
        jar,
        'PUT',
        `${API_USERS_PATH}/${cashier.body.data.id}/access-assignments`,
        {
          branchIds: [branch.body.data.id],
          warehouseIds: [warehouse.body.data.id],
        },
      );
      const activatedCashier = await postJson(baseUrl, jar, 'POST', '/api/v1/auth/activate', {
        token: cashier.body.data.activationToken,
        password: 'a-strong-passphrase',
      });
      expect(activatedCashier.status).toBe(200);
      await postJson(baseUrl, jar, 'POST', API_AUTH_LOGOUT_PATH, {});
      await login(baseUrl, jar, 'f07p2-cashier@example.com', 'a-strong-passphrase');
      const cashierReverse = await postJson(
        baseUrl,
        jar,
        'POST',
        `${API_RETURNS_PATH}/${remainingPost.body.data.id}/reverse`,
        {
          expectedVersion: remainingPost.body.data.version,
          reason: 'Cashier should not reverse',
        },
        'f07p2-cashier-reverse',
      );
      expect(cashierReverse.status).toBe(403);

      await postJson(baseUrl, jar, 'POST', API_AUTH_LOGOUT_PATH, {});
      await login(baseUrl, jar, 'f07p2-owner@example.com', 'a-strong-passphrase');

      const genericCorrection = await postJson(
        baseUrl,
        jar,
        'POST',
        '/api/v1/corrective-transactions',
        { reason: 'nope' },
        'f07p2-generic-1',
      );
      expect(genericCorrection.status).toBe(404);
      const genericAdjust = await postJson(
        baseUrl,
        jar,
        'POST',
        '/api/v1/generic-correction',
        { reason: 'nope' },
        'f07p2-generic-2',
      );
      expect(genericAdjust.status).toBe(404);
      const adjustAnything = await postJson(
        baseUrl,
        jar,
        'POST',
        '/api/v1/adjust-anything',
        { reason: 'nope' },
        'f07p2-generic-3',
      );
      expect(adjustAnything.status).toBe(404);
      void organizationId;
    } finally {
      await close(server);
    }
  }, 180000);

  it('architecture: no foreign persistence coupling and no generic correction routes', () => {
    const foreign = scanForeignPersistenceViolations(
      backendRoot,
      ['/modules/returns-corrections/'],
      [
        '/inventory/persistence/',
        '/accounts-expenses/persistence/',
        '/payments-ledgers/persistence/',
        '/purchases/persistence/',
        '/sales/persistence/',
      ],
    );
    expect(foreign).toEqual([]);

    const purchasesCoupling = scanForeignPersistenceViolations(
      backendRoot,
      ['/modules/purchases/'],
      ['/returns-corrections/persistence/'],
    );
    expect(purchasesCoupling).toEqual([]);

    const forbidden = ['/generic-correction', '/adjust-anything', '/corrective-transactions'];
    const routeViolations = [];
    for (const filePath of collectSourceFiles(backendRoot)) {
      const normalized = filePath.replaceAll('\\', '/');
      if (!normalized.includes('/routes/') && !normalized.endsWith('/app.js')) {
        continue;
      }
      const contents = readFileSync(filePath, 'utf8');
      for (const fragment of forbidden) {
        if (contents.includes(fragment)) {
          routeViolations.push(`${normalized} contains ${fragment}`);
        }
      }
    }
    expect(routeViolations).toEqual([]);
  });
});

function scanForeignPersistenceViolations(rootDirectory, consumerDirs, forbiddenFragments) {
  const files = collectSourceFiles(rootDirectory);
  const violations = [];
  for (const filePath of files) {
    const normalized = filePath.replaceAll('\\', '/');
    if (!consumerDirs.some((dir) => normalized.includes(dir))) {
      continue;
    }
    if (normalized.includes('/public/')) {
      continue;
    }
    for (const specifier of extractImportSpecifiers(filePath)) {
      for (const fragment of forbiddenFragments) {
        if (specifier.includes(fragment)) {
          violations.push(`${normalized} -> ${specifier}`);
        }
      }
    }
  }
  return violations;
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
