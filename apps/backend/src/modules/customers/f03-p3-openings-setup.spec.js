import { describe, expect, it } from 'vitest';
import {
  API_AUTH_CSRF_PATH,
  API_AUTH_LOGIN_PATH,
  API_ACCOUNTS_PATH,
  API_CSRF_HEADER,
  API_CUSTOMERS_PATH,
  API_IDEMPOTENCY_KEY_HEADER,
  API_ORGANIZATION_ACTIVATION_REQUESTS_PATH,
  API_ORGANIZATION_SETUP_PROGRESS_PATH,
  API_PLATFORM_ACTOR_HEADER,
  API_PLATFORM_ORGANIZATIONS_PATH,
  API_PLATFORM_SUBSCRIPTION_PLANS_PATH,
  API_SUPPLIERS_PATH,
  ApiTransportErrorCode,
} from '@agrivio/api-contracts';
import { createServer } from 'node:http';

const { createApp } = require('../../app');
const { loadApiEnv } = require('../../platform/config/runtime-config');
const { createMockDatabaseLifecycle } = require('../../platform/database/mongo-connection');

describe('F03 P3 openings, limits, and setup progress', () => {
  it('posts openings with isolation, idempotency, semantics, limits, and setup progress', async () => {
    const { server, baseUrl, jar } = await boot();

    try {
      await seedPlan(baseUrl, jar, {
        planCode: 'Starter',
        limits: { customers: 2, suppliers: 2, products: 10 },
      });

      const orgA = await createApprovedOwner(baseUrl, jar, {
        organizationName: 'F03P3 Org A',
        ownerEmail: 'f03p3-owner-a@example.com',
        password: 'a-strong-passphrase',
      });
      const orgB = await createApprovedOwner(baseUrl, jar, {
        organizationName: 'F03P3 Org B',
        ownerEmail: 'f03p3-owner-b@example.com',
        password: 'a-strong-passphrase',
      });

      await login(baseUrl, jar, 'f03p3-owner-a@example.com', 'a-strong-passphrase');

      const customer = await fetchJson(
        baseUrl,
        'POST',
        API_CUSTOMERS_PATH,
        { name: 'Customer One', customerType: 'farmer', phone: '03001110001' },
        { [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar) },
        jar,
      );
      expect(customer.status).toBe(201);

      const supplier = await fetchJson(
        baseUrl,
        'POST',
        API_SUPPLIERS_PATH,
        { name: 'Supplier One', phone: '03002220002' },
        { [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar) },
        jar,
      );
      expect(supplier.status).toBe(201);

      const account = await fetchJson(
        baseUrl,
        'POST',
        API_ACCOUNTS_PATH,
        { name: 'Cash Drawer', accountType: 'cash' },
        { [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar) },
        jar,
      );
      expect(account.status).toBe(201);

      const missingKey = await fetchJson(
        baseUrl,
        'POST',
        `${API_CUSTOMERS_PATH}/${customer.body.data.id}/opening-balance`,
        { kind: 'receivable', amount: { amount: '1500.00', currency: 'PKR' } },
        { [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar) },
        jar,
      );
      expect(missingKey.status).toBe(400);

      const openingKey = 'cust-opening-1';
      const receivable = await fetchJson(
        baseUrl,
        'POST',
        `${API_CUSTOMERS_PATH}/${customer.body.data.id}/opening-balance`,
        { kind: 'receivable', amount: { amount: '1500.00', currency: 'PKR' } },
        {
          [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar),
          [API_IDEMPOTENCY_KEY_HEADER]: openingKey,
        },
        jar,
      );
      expect(receivable.status).toBe(201);
      expect(receivable.body.data.openingBalance.kind).toBe('receivable');
      expect(receivable.body.data.derivedBalances.receivable.amount).toBe('1500.00');
      expect(receivable.body.data.derivedBalances.advance.amount).toBe('0.00');
      expect(receivable.body.data).not.toHaveProperty('balance');

      const replay = await fetchJson(
        baseUrl,
        'POST',
        `${API_CUSTOMERS_PATH}/${customer.body.data.id}/opening-balance`,
        { kind: 'receivable', amount: { amount: '1500.00', currency: 'PKR' } },
        {
          [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar),
          [API_IDEMPOTENCY_KEY_HEADER]: openingKey,
        },
        jar,
      );
      expect(replay.status).toBe(201);
      expect(replay.body.data.openingBalance.ledgerEffectId).toBe(
        receivable.body.data.openingBalance.ledgerEffectId,
      );

      const conflictBody = await fetchJson(
        baseUrl,
        'POST',
        `${API_CUSTOMERS_PATH}/${customer.body.data.id}/opening-balance`,
        { kind: 'advance', amount: { amount: '100.00', currency: 'PKR' } },
        {
          [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar),
          [API_IDEMPOTENCY_KEY_HEADER]: openingKey,
        },
        jar,
      );
      expect(conflictBody.status).toBe(409);
      expect(conflictBody.body.error.code).toBe(ApiTransportErrorCode.IdempotencyConflict);

      const secondOpening = await fetchJson(
        baseUrl,
        'POST',
        `${API_CUSTOMERS_PATH}/${customer.body.data.id}/opening-balance`,
        { kind: 'advance', amount: { amount: '200.00', currency: 'PKR' } },
        {
          [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar),
          [API_IDEMPOTENCY_KEY_HEADER]: 'cust-opening-2',
        },
        jar,
      );
      expect(secondOpening.status).toBe(409);

      const customer2 = await fetchJson(
        baseUrl,
        'POST',
        API_CUSTOMERS_PATH,
        { name: 'Customer Two', customerType: 'individual' },
        { [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar) },
        jar,
      );
      expect(customer2.status).toBe(201);

      const advance = await fetchJson(
        baseUrl,
        'POST',
        `${API_CUSTOMERS_PATH}/${customer2.body.data.id}/opening-balance`,
        { kind: 'advance', amount: { amount: '250.00', currency: 'PKR' } },
        {
          [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar),
          [API_IDEMPOTENCY_KEY_HEADER]: 'cust-advance-1',
        },
        jar,
      );
      expect(advance.status).toBe(201);
      expect(advance.body.data.derivedBalances.advance.amount).toBe('250.00');
      expect(advance.body.data.derivedBalances.receivable.amount).toBe('0.00');

      const customerLimit = await fetchJson(
        baseUrl,
        'POST',
        API_CUSTOMERS_PATH,
        { name: 'Customer Three', customerType: 'business' },
        { [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar) },
        jar,
      );
      expect(customerLimit.status).toBe(403);

      const customerUpdate = await fetchJson(
        baseUrl,
        'PATCH',
        `${API_CUSTOMERS_PATH}/${customer.body.data.id}`,
        { expectedVersion: receivable.body.data.version, name: 'Customer One Updated' },
        { [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar) },
        jar,
      );
      expect(customerUpdate.status).toBe(200);

      const supplierPayable = await fetchJson(
        baseUrl,
        'POST',
        `${API_SUPPLIERS_PATH}/${supplier.body.data.id}/opening-balance`,
        { kind: 'payable', amount: { amount: '800.00', currency: 'PKR' } },
        {
          [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar),
          [API_IDEMPOTENCY_KEY_HEADER]: 'sup-opening-1',
        },
        jar,
      );
      expect(supplierPayable.status).toBe(201);
      expect(supplierPayable.body.data.derivedBalances.payable.amount).toBe('800.00');

      const accountOpening = await fetchJson(
        baseUrl,
        'POST',
        `${API_ACCOUNTS_PATH}/${account.body.data.id}/opening-balance`,
        { amount: { amount: '5000.00', currency: 'PKR' } },
        {
          [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar),
          [API_IDEMPOTENCY_KEY_HEADER]: 'acct-opening-1',
        },
        jar,
      );
      expect(accountOpening.status).toBe(201);
      expect(accountOpening.body.data.derivedBalances.balance.amount).toBe('5000.00');

      const movements = await fetchJson(
        baseUrl,
        'GET',
        `${API_ACCOUNTS_PATH}/${account.body.data.id}/movements`,
        undefined,
        {},
        jar,
      );
      expect(movements.status).toBe(200);
      expect(movements.body.data).toHaveLength(1);
      expect(movements.body.data[0].sourceType).toBe('account_opening');
      expect(movements.body.meta).toMatchObject({ page: 1, pageSize: 25, total: 1 });

      const setup = await fetchJson(
        baseUrl,
        'GET',
        API_ORGANIZATION_SETUP_PROGRESS_PATH,
        undefined,
        {},
        jar,
      );
      expect(setup.status).toBe(200);
      expect(setup.body.data.steps.some((step) => step.id === 'opening_balances')).toBe(true);
      const openingsStep = setup.body.data.steps.find((step) => step.id === 'opening_balances');
      expect(openingsStep.status).toBe('complete');
      expect(setup.body.data.notes).toContain('Inventory/Purchases/Sales not in scope yet');

      await login(baseUrl, jar, 'f03p3-owner-b@example.com', 'a-strong-passphrase');
      const crossOpening = await fetchJson(
        baseUrl,
        'POST',
        `${API_CUSTOMERS_PATH}/${customer.body.data.id}/opening-balance`,
        { kind: 'receivable', amount: { amount: '10.00', currency: 'PKR' } },
        {
          [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar),
          [API_IDEMPOTENCY_KEY_HEADER]: 'cross-org-opening',
        },
        jar,
      );
      expect(crossOpening.status).toBe(404);

      const crossGet = await fetchJson(
        baseUrl,
        'GET',
        `${API_CUSTOMERS_PATH}/${customer.body.data.id}`,
        undefined,
        {},
        jar,
      );
      expect(crossGet.status).toBe(404);

      expect(orgA.organizationId).not.toBe(orgB.organizationId);
    } finally {
      await close(server);
    }
  });

  it('leaves no customer opening facts when ledger posting fails', async () => {
    const { createInMemoryCustomersStore } = require('./customers.store');
    const { createCustomersModule } = require('./customers.module');
    const { createLedgersModule } = require('../payments-ledgers/ledgers.module');

    const store = createInMemoryCustomersStore();
    const ledgers = createLedgersModule({ persistence: 'memory' });
    ledgers.ledgersService.postLedgerEffect = async () => {
      throw new Error('simulated ledger failure');
    };

    const customers = createCustomersModule({
      persistence: 'memory',
      store,
      ledgersService: ledgers.ledgersService,
    });

    const created = await customers.customersService.createCustomer(
      'org-1',
      { name: 'Rollback Customer', customerType: 'individual' },
      { actorId: 'actor-1' },
    );

    await expect(
      customers.customersService.postOpeningBalance(
        'org-1',
        created.id,
        { kind: 'receivable', amount: { amount: '100.00', currency: 'PKR' } },
        { actorId: 'actor-1' },
        'rollback-key',
      ),
    ).rejects.toThrow(/simulated ledger failure/);

    const after = await customers.customersService.getCustomer('org-1', created.id);
    expect(after.openingBalance).toBeUndefined();
    expect(ledgers.store.listEffectsForTest()).toHaveLength(0);
  });

  it('blocks unauthorized role, platform context, and suspended subscription openings', async () => {
    const { API_USERS_PATH, API_AUTH_LOGOUT_PATH } = require('@agrivio/api-contracts');
    const { server, baseUrl, jar, subscriptions } = await bootFull();

    try {
      await seedPlan(baseUrl, jar, { planCode: 'Starter', limits: { customers: 10 } });
      const org = await createApprovedOwner(baseUrl, jar, {
        organizationName: 'F03P3 Security Org',
        ownerEmail: 'f03p3-sec-owner@example.com',
        password: 'a-strong-passphrase',
      });
      await login(baseUrl, jar, 'f03p3-sec-owner@example.com', 'a-strong-passphrase');

      const customer = await fetchJson(
        baseUrl,
        'POST',
        API_CUSTOMERS_PATH,
        { name: 'Sec Customer', customerType: 'farmer', phone: '03009998888' },
        { [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar) },
        jar,
      );
      expect(customer.status).toBe(201);

      const cashier = await fetchJson(
        baseUrl,
        'POST',
        API_USERS_PATH,
        {
          email: 'f03p3-cashier@example.com',
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
      await login(baseUrl, jar, 'f03p3-cashier@example.com', 'a-strong-passphrase');

      const cashierOpening = await fetchJson(
        baseUrl,
        'POST',
        `${API_CUSTOMERS_PATH}/${customer.body.data.id}/opening-balance`,
        { kind: 'receivable', amount: { amount: '50.00', currency: 'PKR' } },
        {
          [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar),
          [API_IDEMPOTENCY_KEY_HEADER]: 'cashier-denied',
        },
        jar,
      );
      expect(cashierOpening.status).toBe(403);

      await fetchJson(
        baseUrl,
        'POST',
        API_AUTH_LOGOUT_PATH,
        {},
        { [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar) },
        jar,
      );
      const platformSetup = await fetchJson(
        baseUrl,
        'GET',
        API_ORGANIZATION_SETUP_PROGRESS_PATH,
        undefined,
        { [API_PLATFORM_ACTOR_HEADER]: 'super-admin' },
        jar,
      );
      expect([401, 403]).toContain(platformSetup.status);

      await login(baseUrl, jar, 'f03p3-sec-owner@example.com', 'a-strong-passphrase');
      const subscription = await subscriptions.store.findSubscriptionByOrganizationId(
        org.organizationId,
      );
      expect(subscription).not.toBeNull();
      await subscriptions.subscriptionService.suspendSubscription(
        String(subscription['_id'] ?? subscription.id),
        { expectedVersion: subscription.version, reason: 'test-suspend' },
        { actorId: 'platform-test', actorType: 'platform' },
      );

      const suspendedOpening = await fetchJson(
        baseUrl,
        'POST',
        `${API_CUSTOMERS_PATH}/${customer.body.data.id}/opening-balance`,
        { kind: 'receivable', amount: { amount: '50.00', currency: 'PKR' } },
        {
          [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar),
          [API_IDEMPOTENCY_KEY_HEADER]: 'suspended-denied',
        },
        jar,
      );
      expect(suspendedOpening.status).toBe(403);
    } finally {
      await close(server);
    }
  });
});

async function boot() {
  return bootFull();
}

async function bootFull() {
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
    authStore: app.agrivio.auth.store,
    subscriptions: app.agrivio.subscriptions,
  };
}

async function seedPlan(baseUrl, jar, overrides = {}) {
  const response = await fetchJson(
    baseUrl,
    'POST',
    API_PLATFORM_SUBSCRIPTION_PLANS_PATH,
    {
      planCode: overrides.planCode ?? 'Starter',
      activate: true,
      monthlyPriceMinorUnits: 1000,
      ...(overrides.limits === undefined ? {} : { limits: overrides.limits }),
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
