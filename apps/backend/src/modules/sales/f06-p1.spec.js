import { describe, expect, it } from 'vitest';
import {
  API_AUTH_CSRF_PATH,
  API_AUTH_LOGIN_PATH,
  API_ACCOUNTS_PATH,
  API_BRANCHES_PATH,
  API_CSRF_HEADER,
  API_CUSTOMER_PAYMENTS_PATH,
  API_CUSTOMERS_PATH,
  API_IDEMPOTENCY_KEY_HEADER,
  API_INVENTORY_BALANCES_PATH,
  API_INVENTORY_MOVEMENTS_PATH,
  API_ORGANIZATION_ACTIVATION_REQUESTS_PATH,
  API_PLATFORM_ACTOR_HEADER,
  API_PLATFORM_ORGANIZATIONS_PATH,
  API_PLATFORM_SUBSCRIPTION_PLANS_PATH,
  API_PRODUCT_CATEGORIES_PATH,
  API_PRODUCTS_PATH,
  API_SALES_PATH,
  API_WAREHOUSES_PATH,
  ApiTransportErrorCode,
} from '@agrivio/api-contracts';
import { createServer } from 'node:http';

const { createApp } = require('../../app');
const { loadApiEnv } = require('../../platform/config/runtime-config');
const { createMockDatabaseLifecycle } = require('../../platform/database/mongo-connection');

describe('F06 P1 customer payments, accounts, and sale drafts', () => {
  it('covers payments, customer ledger, draft effectlessness, isolation, and security', async () => {
    const { server, baseUrl, jar, subscriptions, ledgers, accounts, inventory, sales } =
      await boot();

    try {
      await seedPlan(baseUrl, jar);

      const orgA = await createApprovedOwner(baseUrl, jar, {
        organizationName: 'F06P1 Org A',
        ownerEmail: 'f06p1-owner-a@example.com',
        password: 'a-strong-passphrase',
      });
      const orgB = await createApprovedOwner(baseUrl, jar, {
        organizationName: 'F06P1 Org B',
        ownerEmail: 'f06p1-owner-b@example.com',
        password: 'a-strong-passphrase',
      });

      await login(baseUrl, jar, 'f06p1-owner-a@example.com', 'a-strong-passphrase');

      const customerA = await fetchJson(
        baseUrl,
        'POST',
        API_CUSTOMERS_PATH,
        { name: 'Customer A', customerType: 'farmer', phone: '03001110001' },
        { [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar) },
        jar,
      );
      expect(customerA.status).toBe(201);

      const accountA = await fetchJson(
        baseUrl,
        'POST',
        API_ACCOUNTS_PATH,
        { name: 'Cash A', accountType: 'cash' },
        { [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar) },
        jar,
      );
      expect(accountA.status).toBe(201);

      const accountOpening = await fetchJson(
        baseUrl,
        'POST',
        `${API_ACCOUNTS_PATH}/${accountA.body.data.id}/opening-balance`,
        { amount: { amount: '10000.00', currency: 'PKR' } },
        {
          [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar),
          [API_IDEMPOTENCY_KEY_HEADER]: 'acct-open-a',
        },
        jar,
      );
      expect(accountOpening.status).toBe(201);
      expect(accountOpening.body.data.derivedBalances.balance.amount).toBe('10000.00');

      const customerOpening = await fetchJson(
        baseUrl,
        'POST',
        `${API_CUSTOMERS_PATH}/${customerA.body.data.id}/opening-balance`,
        { kind: 'receivable', amount: { amount: '500.00', currency: 'PKR' } },
        {
          [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar),
          [API_IDEMPOTENCY_KEY_HEADER]: 'cust-open-a',
        },
        jar,
      );
      expect(customerOpening.status).toBe(201);
      expect(customerOpening.body.data.derivedBalances.receivable.amount).toBe('500.00');

      const paymentBody = {
        customerId: customerA.body.data.id,
        accountId: accountA.body.data.id,
        amount: { amount: '200.00', currency: 'PKR' },
        paymentDate: '2026-08-12',
        allocationMode: 'general',
        notes: 'advance foundation',
      };
      const paymentKey = 'cust-pay-1';
      const payment = await fetchJson(
        baseUrl,
        'POST',
        API_CUSTOMER_PAYMENTS_PATH,
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
      expect(payment.body.data.allocations[0].targetType).toBe('customer_advance');
      expect(payment.body.data.allocations[0].allocatedAmount.amount).toBe('200.00');

      const paymentReplay = await fetchJson(
        baseUrl,
        'POST',
        API_CUSTOMER_PAYMENTS_PATH,
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
        API_CUSTOMER_PAYMENTS_PATH,
        { ...paymentBody, amount: { amount: '250.00', currency: 'PKR' } },
        {
          [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar),
          [API_IDEMPOTENCY_KEY_HEADER]: paymentKey,
        },
        jar,
      );
      expect(paymentConflict.status).toBe(409);
      expect(paymentConflict.body.error.code).toBe(ApiTransportErrorCode.IdempotencyConflict);

      const paymentsList = await fetchJson(
        baseUrl,
        'GET',
        API_CUSTOMER_PAYMENTS_PATH,
        undefined,
        {},
        jar,
      );
      expect(paymentsList.status).toBe(200);
      expect(paymentsList.body.data.items).toHaveLength(1);

      const customerLedger = await fetchJson(
        baseUrl,
        'GET',
        `${API_CUSTOMERS_PATH}/${customerA.body.data.id}/ledger`,
        undefined,
        {},
        jar,
      );
      expect(customerLedger.status).toBe(200);
      expect(customerLedger.body.data.items.length).toBeGreaterThanOrEqual(2);

      const customerAfter = await fetchJson(
        baseUrl,
        'GET',
        `${API_CUSTOMERS_PATH}/${customerA.body.data.id}`,
        undefined,
        {},
        jar,
      );
      expect(customerAfter.status).toBe(200);
      expect(customerAfter.body.data.derivedBalances.receivable.amount).toBe('500.00');
      expect(customerAfter.body.data.derivedBalances.advance.amount).toBe('200.00');

      const accountAfter = await fetchJson(
        baseUrl,
        'GET',
        `${API_ACCOUNTS_PATH}/${accountA.body.data.id}`,
        undefined,
        {},
        jar,
      );
      expect(accountAfter.status).toBe(200);
      expect(accountAfter.body.data.derivedBalances.balance.amount).toBe('10200.00');

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
      expect(movementSum.toFixed(2)).toBe('10200.00');

      const branch = await fetchJson(
        baseUrl,
        'POST',
        API_BRANCHES_PATH,
        { name: 'Sale Branch', invoicePrefix: 'LHR' },
        { [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar) },
        jar,
      );
      expect(branch.status).toBe(201);

      const warehouse = await fetchJson(
        baseUrl,
        'POST',
        API_WAREHOUSES_PATH,
        { name: 'Sale WH' },
        { [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar) },
        jar,
      );
      expect(warehouse.status).toBe(201);

      const category = await fetchJson(
        baseUrl,
        'POST',
        API_PRODUCT_CATEGORIES_PATH,
        { name: 'F06 Cat', productClass: 'general' },
        { [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar) },
        jar,
      );
      expect(category.status).toBe(201);

      const product = await fetchJson(
        baseUrl,
        'POST',
        API_PRODUCTS_PATH,
        {
          name: 'Widget',
          categoryId: category.body.data.id,
          trackingMode: 'none',
          baseUnitCode: 'EA',
          measurementDimension: 'mass',
        },
        { [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar) },
        jar,
      );
      expect(product.status).toBe(201);

      const draftBody = {
        branchId: branch.body.data.id,
        warehouseId: warehouse.body.data.id,
        customerId: customerA.body.data.id,
        saleDate: '2026-08-12',
        notes: 'draft only',
        lines: [
          {
            productId: product.body.data.id,
            quantity: '2',
            unitPrice: { amount: '50.00', currency: 'PKR' },
          },
        ],
      };

      const draft = await fetchJson(
        baseUrl,
        'POST',
        API_SALES_PATH,
        draftBody,
        { [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar) },
        jar,
      );
      expect(draft.status).toBe(201);
      expect(draft.body.data.status).toBe('draft');
      expect(draft.body.data.invoiceNumber).toBeNull();
      expect(draft.body.data.lines[0].productNameSnapshot).toBe('Widget');
      expect(draft.body.data.lines[0].quantityBase).toBe('2.0000');

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
        await ledgers.ledgersService.listCustomerEffects(orgA.organizationId, customerA.body.data.id)
      ).items.length;
      expect(ledgerCountAfterDraft).toBe(customerLedger.body.data.items.length);

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
        `${API_SALES_PATH}/${draft.body.data.id}`,
        {
          expectedVersion: draft.body.data.version,
          notes: 'edited draft',
          lines: draftBody.lines,
          branchId: draftBody.branchId,
          warehouseId: draftBody.warehouseId,
          customerId: draftBody.customerId,
          saleDate: draftBody.saleDate,
        },
        { [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar) },
        jar,
      );
      expect(edited.status).toBe(200);
      expect(edited.body.data.status).toBe('draft');
      expect(edited.body.data.notes).toBe('edited draft');
      expect(edited.body.data.version).toBe(2);
      expect(edited.body.data.invoiceNumber).toBeNull();

      const stale = await fetchJson(
        baseUrl,
        'PATCH',
        `${API_SALES_PATH}/${draft.body.data.id}`,
        {
          expectedVersion: 1,
          notes: 'stale',
          lines: draftBody.lines,
          branchId: draftBody.branchId,
          warehouseId: draftBody.warehouseId,
          customerId: draftBody.customerId,
          saleDate: draftBody.saleDate,
        },
        { [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar) },
        jar,
      );
      expect(stale.status).toBe(409);
      expect(stale.body.error.code).toBe(ApiTransportErrorCode.VersionConflict);

      await login(baseUrl, jar, 'f06p1-owner-b@example.com', 'a-strong-passphrase');
      const crossLedger = await fetchJson(
        baseUrl,
        'GET',
        `${API_CUSTOMERS_PATH}/${customerA.body.data.id}/ledger`,
        undefined,
        {},
        jar,
      );
      expect(crossLedger.status).toBe(404);

      const crossPaymentRead = await fetchJson(
        baseUrl,
        'GET',
        `${API_CUSTOMER_PAYMENTS_PATH}/${payment.body.data.id}`,
        undefined,
        {},
        jar,
      );
      expect(crossPaymentRead.status).toBe(404);

      const crossPayment = await fetchJson(
        baseUrl,
        'POST',
        API_CUSTOMER_PAYMENTS_PATH,
        paymentBody,
        {
          [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar),
          [API_IDEMPOTENCY_KEY_HEADER]: 'cross-org-pay',
        },
        jar,
      );
      expect([400, 404]).toContain(crossPayment.status);

      const crossSale = await fetchJson(
        baseUrl,
        'GET',
        `${API_SALES_PATH}/${draft.body.data.id}`,
        undefined,
        {},
        jar,
      );
      expect(crossSale.status).toBe(404);

      const customerB = await fetchJson(
        baseUrl,
        'POST',
        API_CUSTOMERS_PATH,
        { name: 'Customer B', customerType: 'farmer' },
        { [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar) },
        jar,
      );
      expect(customerB.status).toBe(201);
      const branchB = await fetchJson(
        baseUrl,
        'POST',
        API_BRANCHES_PATH,
        { name: 'Branch B', invoicePrefix: 'ISB' },
        { [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar) },
        jar,
      );
      expect(branchB.status).toBe(201);
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
        API_SALES_PATH,
        {
          branchId: branchB.body.data.id,
          warehouseId: warehouseB.body.data.id,
          customerId: customerA.body.data.id,
          saleDate: '2026-08-12',
          lines: [
            {
              productId: productB.body.data.id,
              quantity: '1',
              unitPrice: { amount: '5.00', currency: 'PKR' },
            },
          ],
        },
        { [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar) },
        jar,
      );
      expect([400, 404]).toContain(crossRefDraft.status);

      await login(baseUrl, jar, 'f06p1-owner-a@example.com', 'a-strong-passphrase');
      const discarded = await fetchJson(
        baseUrl,
        'DELETE',
        `${API_SALES_PATH}/${draft.body.data.id}`,
        undefined,
        { [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar) },
        jar,
      );
      expect(discarded.status).toBe(200);
      expect(discarded.body.data.discarded).toBe(true);

      const afterDiscard = await fetchJson(
        baseUrl,
        'GET',
        `${API_SALES_PATH}/${draft.body.data.id}`,
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
        (await sales.salesService.listSales(orgA.organizationId, {}, {
          userId: 'owner',
          permissions: ['sales.view'],
          contextType: 'organization',
          role: 'Owner',
        })).items.filter((item) => item.id === draft.body.data.id),
      ).toHaveLength(0);

      await login(baseUrl, jar, 'f06p1-owner-a@example.com', 'a-strong-passphrase');
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
        API_SALES_PATH,
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
    sales: app.agrivio.sales,
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
