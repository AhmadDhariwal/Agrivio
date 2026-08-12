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
  API_SUPPLIER_PAYMENTS_PATH,
  API_SUPPLIERS_PATH,
  API_WAREHOUSES_PATH,
  ApiTransportErrorCode,
} from '@agrivio/api-contracts';
import { createServer } from 'node:http';

const { createApp } = require('../../app');
const { loadApiEnv } = require('../../platform/config/runtime-config');
const { createMockDatabaseLifecycle } = require('../../platform/database/mongo-connection');

describe('F05 P1 supplier payments, accounts, and purchase drafts', () => {
  it('covers payments, account movements, draft effectlessness, isolation, and security', async () => {
    const { server, baseUrl, jar, subscriptions, ledgers, accounts, inventory, purchases } =
      await boot();

    try {
      await seedPlan(baseUrl, jar);

      const orgA = await createApprovedOwner(baseUrl, jar, {
        organizationName: 'F05P1 Org A',
        ownerEmail: 'f05p1-owner-a@example.com',
        password: 'a-strong-passphrase',
      });
      const orgB = await createApprovedOwner(baseUrl, jar, {
        organizationName: 'F05P1 Org B',
        ownerEmail: 'f05p1-owner-b@example.com',
        password: 'a-strong-passphrase',
      });

      await login(baseUrl, jar, 'f05p1-owner-a@example.com', 'a-strong-passphrase');

      const supplierA = await fetchJson(
        baseUrl,
        'POST',
        API_SUPPLIERS_PATH,
        { name: 'Supplier A', phone: '03001110001' },
        { [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar) },
        jar,
      );
      expect(supplierA.status).toBe(201);

      const accountA = await fetchJson(
        baseUrl,
        'POST',
        API_ACCOUNTS_PATH,
        { name: 'Cash A', accountType: 'cash' },
        { [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar) },
        jar,
      );
      expect(accountA.status).toBe(201);

      const openingKey = 'acct-open-a';
      const accountOpening = await fetchJson(
        baseUrl,
        'POST',
        `${API_ACCOUNTS_PATH}/${accountA.body.data.id}/opening-balance`,
        { amount: { amount: '10000.00', currency: 'PKR' } },
        {
          [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar),
          [API_IDEMPOTENCY_KEY_HEADER]: openingKey,
        },
        jar,
      );
      expect(accountOpening.status).toBe(201);
      expect(accountOpening.body.data.derivedBalances.balance.amount).toBe('10000.00');

      const supplierOpening = await fetchJson(
        baseUrl,
        'POST',
        `${API_SUPPLIERS_PATH}/${supplierA.body.data.id}/opening-balance`,
        { kind: 'payable', amount: { amount: '500.00', currency: 'PKR' } },
        {
          [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar),
          [API_IDEMPOTENCY_KEY_HEADER]: 'sup-open-a',
        },
        jar,
      );
      expect(supplierOpening.status).toBe(201);
      expect(supplierOpening.body.data.derivedBalances.payable.amount).toBe('500.00');

      const paymentBody = {
        supplierId: supplierA.body.data.id,
        accountId: accountA.body.data.id,
        amount: { amount: '200.00', currency: 'PKR' },
        paymentDate: '2026-08-11',
        allocationMode: 'general',
        notes: 'advance foundation',
      };
      const paymentKey = 'sup-pay-1';
      const payment = await fetchJson(
        baseUrl,
        'POST',
        API_SUPPLIER_PAYMENTS_PATH,
        paymentBody,
        {
          [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar),
          [API_IDEMPOTENCY_KEY_HEADER]: paymentKey,
        },
        jar,
      );
      expect(payment.status).toBe(201);
      expect(payment.body.data.status).toBe('posted');
      expect(payment.body.data.allocations).toHaveLength(1);
      expect(payment.body.data.allocations[0].targetType).toBe('supplier_advance');
      expect(payment.body.data.allocations[0].allocatedAmount.amount).toBe('200.00');

      const paymentReplay = await fetchJson(
        baseUrl,
        'POST',
        API_SUPPLIER_PAYMENTS_PATH,
        paymentBody,
        {
          [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar),
          [API_IDEMPOTENCY_KEY_HEADER]: paymentKey,
        },
        jar,
      );
      expect(paymentReplay.status).toBe(201);
      expect(paymentReplay.body.data.id).toBe(payment.body.data.id);

      const paymentConflict = await fetchJson(
        baseUrl,
        'POST',
        API_SUPPLIER_PAYMENTS_PATH,
        { ...paymentBody, amount: { amount: '250.00', currency: 'PKR' } },
        {
          [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar),
          [API_IDEMPOTENCY_KEY_HEADER]: paymentKey,
        },
        jar,
      );
      expect(paymentConflict.status).toBe(409);
      expect(paymentConflict.body.error.code).toBe(ApiTransportErrorCode.IdempotencyConflict);

      const paymentsList = await fetchJson(baseUrl, 'GET', API_SUPPLIER_PAYMENTS_PATH, undefined, {}, jar);
      expect(paymentsList.status).toBe(200);
      expect(paymentsList.body.data.items).toHaveLength(1);

      const supplierLedger = await fetchJson(
        baseUrl,
        'GET',
        `${API_SUPPLIERS_PATH}/${supplierA.body.data.id}/ledger`,
        undefined,
        {},
        jar,
      );
      expect(supplierLedger.status).toBe(200);
      expect(supplierLedger.body.data.items.length).toBeGreaterThanOrEqual(2);

      const supplierAfter = await fetchJson(
        baseUrl,
        'GET',
        `${API_SUPPLIERS_PATH}/${supplierA.body.data.id}`,
        undefined,
        {},
        jar,
      );
      expect(supplierAfter.status).toBe(200);
      expect(supplierAfter.body.data.derivedBalances.payable.amount).toBe('500.00');
      expect(supplierAfter.body.data.derivedBalances.advance.amount).toBe('200.00');

      const accountAfter = await fetchJson(
        baseUrl,
        'GET',
        `${API_ACCOUNTS_PATH}/${accountA.body.data.id}`,
        undefined,
        {},
        jar,
      );
      expect(accountAfter.status).toBe(200);
      expect(accountAfter.body.data.derivedBalances.balance.amount).toBe('9800.00');

      const movements = await fetchJson(
        baseUrl,
        'GET',
        `${API_ACCOUNTS_PATH}/${accountA.body.data.id}/movements`,
        undefined,
        {},
        jar,
      );
      expect(movements.status).toBe(200);
      expect(movements.body.data.items).toHaveLength(2);
      const movementSum = movements.body.data.items.reduce(
        (total, item) => total + Number(item.signedAmount.amount),
        0,
      );
      expect(movementSum.toFixed(2)).toBe('9800.00');

      const warehouse = await fetchJson(
        baseUrl,
        'POST',
        API_WAREHOUSES_PATH,
        { name: 'Receive WH' },
        { [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar) },
        jar,
      );
      expect(warehouse.status).toBe(201);

      const category = await fetchJson(
        baseUrl,
        'POST',
        API_PRODUCT_CATEGORIES_PATH,
        { name: 'F05 Cat', productClass: 'general' },
        { [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar) },
        jar,
      );
      expect(category.status).toBe(201);

      const product = await fetchJson(
        baseUrl,
        'POST',
        API_PRODUCTS_PATH,
        {
          name: 'Urea Bag',
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
        supplierId: supplierA.body.data.id,
        purchaseDate: '2026-08-11',
        supplierInvoiceReference: 'INV-100',
        notes: 'draft only',
        lines: [
          {
            productId: product.body.data.id,
            packagingUnitId,
            quantity: '2',
            unitCost: { amount: '100.00', currency: 'PKR' },
            batchNumber: 'B-1',
            expiryDate: '2027-01-01',
          },
        ],
        landedCosts: {
          freight: { amount: '10.00', currency: 'PKR' },
        },
      };

      const draft = await fetchJson(
        baseUrl,
        'POST',
        API_PURCHASES_PATH,
        draftBody,
        { [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar) },
        jar,
      );
      expect(draft.status).toBe(201);
      expect(draft.body.data.status).toBe('draft');
      expect(draft.body.data.lines[0].productNameSnapshot).toBe('Urea Bag');
      expect(draft.body.data.lines[0].quantityBase).toBe('100.0000');

      const balancesAfterDraft = await fetchJson(
        baseUrl,
        'GET',
        API_INVENTORY_BALANCES_PATH,
        undefined,
        {},
        jar,
      );
      expect(balancesAfterDraft.status).toBe(200);
      expect(balancesAfterDraft.body.data.items).toHaveLength(0);

      const movementsAfterDraft = await fetchJson(
        baseUrl,
        'GET',
        API_INVENTORY_MOVEMENTS_PATH,
        undefined,
        {},
        jar,
      );
      expect(movementsAfterDraft.status).toBe(200);
      expect(movementsAfterDraft.body.data.items).toHaveLength(0);

      const ledgerCountAfterDraft = (
        await ledgers.ledgersService.listSupplierEffects(orgA.organizationId, supplierA.body.data.id)
      ).items.length;
      expect(ledgerCountAfterDraft).toBe(supplierLedger.body.data.items.length);

      const accountMovementsAfterDraft = (
        await accounts.accountsService.listAccountMovements(
          orgA.organizationId,
          accountA.body.data.id,
        )
      ).items.length;
      expect(accountMovementsAfterDraft).toBe(2);

      const edited = await fetchJson(
        baseUrl,
        'PATCH',
        `${API_PURCHASES_PATH}/${draft.body.data.id}`,
        {
          expectedVersion: draft.body.data.version,
          notes: 'edited draft',
          lines: draftBody.lines,
          warehouseId: draftBody.warehouseId,
          supplierId: draftBody.supplierId,
          purchaseDate: draftBody.purchaseDate,
        },
        { [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar) },
        jar,
      );
      expect(edited.status).toBe(200);
      expect(edited.body.data.status).toBe('draft');
      expect(edited.body.data.notes).toBe('edited draft');
      expect(edited.body.data.version).toBe(2);

      const stale = await fetchJson(
        baseUrl,
        'PATCH',
        `${API_PURCHASES_PATH}/${draft.body.data.id}`,
        {
          expectedVersion: 1,
          notes: 'stale',
          lines: draftBody.lines,
          warehouseId: draftBody.warehouseId,
          supplierId: draftBody.supplierId,
          purchaseDate: draftBody.purchaseDate,
        },
        { [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar) },
        jar,
      );
      expect(stale.status).toBe(409);
      expect(stale.body.error.code).toBe(ApiTransportErrorCode.VersionConflict);

      const missingBatch = await fetchJson(
        baseUrl,
        'POST',
        API_PURCHASES_PATH,
        {
          ...draftBody,
          lines: [
            {
              productId: product.body.data.id,
              packagingUnitId,
              quantity: '1',
              unitCost: { amount: '10.00', currency: 'PKR' },
            },
          ],
        },
        { [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar) },
        jar,
      );
      expect(missingBatch.status).toBe(400);

      await login(baseUrl, jar, 'f05p1-owner-b@example.com', 'a-strong-passphrase');
      const crossLedger = await fetchJson(
        baseUrl,
        'GET',
        `${API_SUPPLIERS_PATH}/${supplierA.body.data.id}/ledger`,
        undefined,
        {},
        jar,
      );
      expect(crossLedger.status).toBe(404);

      const crossPayment = await fetchJson(
        baseUrl,
        'POST',
        API_SUPPLIER_PAYMENTS_PATH,
        paymentBody,
        {
          [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar),
          [API_IDEMPOTENCY_KEY_HEADER]: 'cross-org-pay',
        },
        jar,
      );
      expect([400, 404]).toContain(crossPayment.status);

      const crossPurchase = await fetchJson(
        baseUrl,
        'GET',
        `${API_PURCHASES_PATH}/${draft.body.data.id}`,
        undefined,
        {},
        jar,
      );
      expect(crossPurchase.status).toBe(404);

      const supplierB = await fetchJson(
        baseUrl,
        'POST',
        API_SUPPLIERS_PATH,
        { name: 'Supplier B' },
        { [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar) },
        jar,
      );
      expect(supplierB.status).toBe(201);
      const warehouseB = await fetchJson(
        baseUrl,
        'POST',
        API_WAREHOUSES_PATH,
        { name: 'WH B' },
        { [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar) },
        jar,
      );
      expect(warehouseB.status).toBe(201);
      const categoryB = await fetchJson(
        baseUrl,
        'POST',
        API_PRODUCT_CATEGORIES_PATH,
        { name: 'Cat B', productClass: 'general' },
        { [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar) },
        jar,
      );
      expect(categoryB.status).toBe(201);
      const productB = await fetchJson(
        baseUrl,
        'POST',
        API_PRODUCTS_PATH,
        {
          name: 'Product B',
          categoryId: categoryB.body.data.id,
          trackingMode: 'none',
          baseUnitCode: 'EA',
          measurementDimension: 'mass',
        },
        { [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar) },
        jar,
      );
      expect(productB.status).toBe(201);

      const crossRefDraft = await fetchJson(
        baseUrl,
        'POST',
        API_PURCHASES_PATH,
        {
          warehouseId: warehouseB.body.data.id,
          supplierId: supplierA.body.data.id,
          purchaseDate: '2026-08-11',
          lines: [
            {
              productId: productB.body.data.id,
              quantity: '1',
              unitCost: { amount: '5.00', currency: 'PKR' },
            },
          ],
        },
        { [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar) },
        jar,
      );
      expect([400, 404]).toContain(crossRefDraft.status);

      await login(baseUrl, jar, 'f05p1-owner-a@example.com', 'a-strong-passphrase');
      const discarded = await fetchJson(
        baseUrl,
        'DELETE',
        `${API_PURCHASES_PATH}/${draft.body.data.id}`,
        undefined,
        { [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar) },
        jar,
      );
      expect(discarded.status).toBe(200);
      expect(discarded.body.data.discarded).toBe(true);

      const afterDiscard = await fetchJson(
        baseUrl,
        'GET',
        `${API_PURCHASES_PATH}/${draft.body.data.id}`,
        undefined,
        {},
        jar,
      );
      expect(afterDiscard.status).toBe(404);

      expect(
        (
          await inventory.inventoryService.listBalances(orgA.organizationId, {}, {
            userId: 'owner',
            permissions: ['inventory.view'],
            contextType: 'organization',
            role: 'Owner',
            organizationId: orgA.organizationId,
          })
        ).items,
      ).toHaveLength(0);
      expect(
        (
          await accounts.accountsService.listAccountMovements(
            orgA.organizationId,
            accountA.body.data.id,
          )
        ).items,
      ).toHaveLength(2);
      expect(
        (await purchases.purchasesService.listPurchases(orgA.organizationId, {}, {
          userId: 'owner',
          permissions: ['purchases.view'],
          contextType: 'organization',
          role: 'Owner',
        })).items.filter((item) => item.id === draft.body.data.id),
      ).toHaveLength(0);

      await login(baseUrl, jar, 'f05p1-owner-a@example.com', 'a-strong-passphrase');
      const subscription = await subscriptions.store.findSubscriptionByOrganizationId(
        orgA.organizationId,
      );
      await subscriptions.subscriptionService.suspendSubscription(
        String(subscription['_id'] ?? subscription.id),
        { expectedVersion: subscription.version, reason: 'test-suspend' },
        { actorId: 'platform-test', actorType: 'platform' },
      );

      const suspendedWrite = await fetchJson(
        baseUrl,
        'POST',
        API_PURCHASES_PATH,
        draftBody,
        { [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar) },
        jar,
      );
      expect(suspendedWrite.status).toBe(403);

      void orgB;
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
    subscriptions: app.agrivio.subscriptions,
    ledgers: app.agrivio.ledgers,
    accounts: app.agrivio.accounts,
    inventory: app.agrivio.inventory,
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
