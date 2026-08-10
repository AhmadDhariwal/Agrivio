import { describe, expect, it } from 'vitest';
import {
  API_AUTH_CSRF_PATH,
  API_AUTH_LOGIN_PATH,
  API_AUTH_LOGOUT_PATH,
  API_ACCOUNTS_PATH,
  API_CSRF_HEADER,
  API_CUSTOMERS_PATH,
  API_ORGANIZATION_ACTIVATION_REQUESTS_PATH,
  API_PLATFORM_ACTOR_HEADER,
  API_PLATFORM_ORGANIZATIONS_PATH,
  API_PLATFORM_SUBSCRIPTION_PLANS_PATH,
  API_PRODUCT_CATEGORIES_PATH,
  API_PRODUCTS_PATH,
  API_SUPPLIERS_PATH,
  ApiTransportErrorCode,
} from '@agrivio/api-contracts';
import { createServer } from 'node:http';

const { createApp } = require('../../app');
const { loadApiEnv } = require('../../platform/config/runtime-config');
const { createMockDatabaseLifecycle } = require('../../platform/database/mongo-connection');

describe('F03 P2 catalog/customers/suppliers/accounts', () => {
  it('enforces tenant isolation, validation, concurrency, and plan limits', async () => {
    const { server, baseUrl, jar } = await boot();

    try {
      await seedPlan(baseUrl, jar, {
        planCode: 'Starter',
        limits: { products: 2, customers: 2, suppliers: 2 },
      });

      const orgA = await createApprovedOwner(baseUrl, jar, {
        organizationName: 'F03P2 Org A',
        ownerEmail: 'f03p2-owner-a@example.com',
        password: 'a-strong-passphrase',
      });
      const orgB = await createApprovedOwner(baseUrl, jar, {
        organizationName: 'F03P2 Org B',
        ownerEmail: 'f03p2-owner-b@example.com',
        password: 'a-strong-passphrase',
      });

      await login(baseUrl, jar, 'f03p2-owner-a@example.com', 'a-strong-passphrase');

      const category = await fetchJson(
        baseUrl,
        'POST',
        API_PRODUCT_CATEGORIES_PATH,
        { name: 'Fertilizers', productClass: 'fertilizer' },
        { [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar) },
        jar,
      );
      expect(category.status).toBe(201);
      expect(category.body.data.productClass).toBe('fertilizer');

      const badTracking = await fetchJson(
        baseUrl,
        'POST',
        API_PRODUCTS_PATH,
        {
          name: 'Urea',
          categoryId: category.body.data.id,
          trackingMode: 'none',
          baseUnitCode: 'KG',
          measurementDimension: 'mass',
        },
        { [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar) },
        jar,
      );
      expect(badTracking.status).toBe(400);

      const product = await fetchJson(
        baseUrl,
        'POST',
        API_PRODUCTS_PATH,
        {
          name: 'Urea',
          categoryId: category.body.data.id,
          trackingMode: 'batch_expiry',
          baseUnitCode: 'KG',
          measurementDimension: 'mass',
          sku: 'UREA-50',
        },
        { [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar) },
        jar,
      );
      expect(product.status).toBe(201);
      expect(product.body.data.trackingMode).toBe('batch_expiry');
      expect(product.body.data).not.toHaveProperty('stockQuantity');

      const packagingBad = await fetchJson(
        baseUrl,
        'PUT',
        `${API_PRODUCTS_PATH}/${product.body.data.id}/packaging-units`,
        {
          expectedVersion: product.body.data.version,
          items: [{ name: '50 KG', conversionFactor: '0' }],
        },
        { [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar) },
        jar,
      );
      expect(packagingBad.status).toBe(400);

      const packaging = await fetchJson(
        baseUrl,
        'PUT',
        `${API_PRODUCTS_PATH}/${product.body.data.id}/packaging-units`,
        {
          expectedVersion: product.body.data.version,
          items: [
            { name: '1 KG', conversionFactor: '1' },
            { name: '50 KG', conversionFactor: '50' },
          ],
        },
        { [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar) },
        jar,
      );
      expect(packaging.status).toBe(200);
      expect(packaging.body.data.items).toHaveLength(2);
      expect(packaging.body.data.productVersion).toBe(2);

      const prices = await fetchJson(
        baseUrl,
        'PUT',
        `${API_PRODUCTS_PATH}/${product.body.data.id}/prices`,
        {
          expectedVersion: packaging.body.data.productVersion,
          items: [
            { priceTier: 'retail', price: { amount: '100.00', currency: 'PKR' } },
            { priceTier: 'wholesale', price: { amount: '90.00', currency: 'PKR' } },
          ],
        },
        { [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar) },
        jar,
      );
      expect(prices.status).toBe(200);
      expect(prices.body.data.items.some((item) => item.priceTier === 'retail')).toBe(true);

      const staleProduct = await fetchJson(
        baseUrl,
        'PATCH',
        `${API_PRODUCTS_PATH}/${product.body.data.id}`,
        { expectedVersion: 1, name: 'Stale' },
        { [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar) },
        jar,
      );
      expect(staleProduct.status).toBe(409);
      expect(staleProduct.body.error.code).toBe(ApiTransportErrorCode.VersionConflict);

      const anonymousWalkInCredit = await fetchJson(
        baseUrl,
        'POST',
        API_CUSTOMERS_PATH,
        {
          name: 'Anon',
          customerType: 'walk_in',
          priceTier: 'retail',
          creditEnabled: true,
        },
        { [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar) },
        jar,
      );
      expect(anonymousWalkInCredit.status).toBe(400);

      const customer = await fetchJson(
        baseUrl,
        'POST',
        API_CUSTOMERS_PATH,
        {
          name: 'Ali Farmer',
          phone: '03001234567',
          customerType: 'farmer',
          priceTier: 'wholesale',
          creditEnabled: true,
          creditLimit: { amount: '5000.00', currency: 'PKR' },
          creditLimitBehaviour: 'manager_approval',
        },
        { [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar) },
        jar,
      );
      expect(customer.status).toBe(201);
      expect(customer.body.data.customerType).toBe('farmer');
      expect(customer.body.data.priceTier).toBe('wholesale');
      expect(customer.body.data).not.toHaveProperty('receivableBalance');

      const creditPolicy = await fetchJson(
        baseUrl,
        'PATCH',
        `${API_CUSTOMERS_PATH}/${customer.body.data.id}/credit-policy`,
        {
          expectedVersion: customer.body.data.version,
          creditLimitBehaviour: 'block',
          creditLimit: { amount: '2500.00', currency: 'PKR' },
        },
        { [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar) },
        jar,
      );
      expect(creditPolicy.status).toBe(200);
      expect(creditPolicy.body.data.creditLimitBehaviour).toBe('block');

      const supplier = await fetchJson(
        baseUrl,
        'POST',
        API_SUPPLIERS_PATH,
        { name: 'Agri Supply Co', phone: '03007654321', contactName: 'Bilal' },
        { [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar) },
        jar,
      );
      expect(supplier.status).toBe(201);
      expect(supplier.body.data).not.toHaveProperty('payableBalance');

      const account = await fetchJson(
        baseUrl,
        'POST',
        API_ACCOUNTS_PATH,
        { name: 'Till Cash', accountType: 'cash' },
        { [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar) },
        jar,
      );
      expect(account.status).toBe(201);

      const bank = await fetchJson(
        baseUrl,
        'POST',
        API_ACCOUNTS_PATH,
        {
          name: 'HBL Main',
          accountType: 'bank',
          bankName: 'HBL',
          accountNumberMasked: '****1234',
        },
        { [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar) },
        jar,
      );
      expect(bank.status).toBe(201);

      const badAccountType = await fetchJson(
        baseUrl,
        'POST',
        API_ACCOUNTS_PATH,
        { name: 'Ledger', accountType: 'receivable' },
        { [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar) },
        jar,
      );
      expect(badAccountType.status).toBe(400);

      const product2 = await fetchJson(
        baseUrl,
        'POST',
        API_PRODUCTS_PATH,
        {
          name: 'DAP',
          categoryId: category.body.data.id,
          trackingMode: 'batch',
          baseUnitCode: 'KG',
          measurementDimension: 'mass',
        },
        { [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar) },
        jar,
      );
      expect(product2.status).toBe(201);

      const productLimit = await fetchJson(
        baseUrl,
        'POST',
        API_PRODUCTS_PATH,
        {
          name: 'NPK',
          categoryId: category.body.data.id,
          trackingMode: 'batch',
          baseUnitCode: 'KG',
          measurementDimension: 'mass',
        },
        { [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar) },
        jar,
      );
      expect(productLimit.status).toBe(403);

      await login(baseUrl, jar, 'f03p2-owner-b@example.com', 'a-strong-passphrase');
      const crossProduct = await fetchJson(
        baseUrl,
        'GET',
        `${API_PRODUCTS_PATH}/${product.body.data.id}`,
        undefined,
        {},
        jar,
      );
      expect(crossProduct.status).toBe(404);

      const crossCustomer = await fetchJson(
        baseUrl,
        'GET',
        `${API_CUSTOMERS_PATH}/${customer.body.data.id}`,
        undefined,
        {},
        jar,
      );
      expect(crossCustomer.status).toBe(404);

      const crossSupplier = await fetchJson(
        baseUrl,
        'GET',
        `${API_SUPPLIERS_PATH}/${supplier.body.data.id}`,
        undefined,
        {},
        jar,
      );
      expect(crossSupplier.status).toBe(404);

      const crossAccount = await fetchJson(
        baseUrl,
        'GET',
        `${API_ACCOUNTS_PATH}/${account.body.data.id}`,
        undefined,
        {},
        jar,
      );
      expect(crossAccount.status).toBe(404);

      const crossPackaging = await fetchJson(
        baseUrl,
        'GET',
        `${API_PRODUCTS_PATH}/${product.body.data.id}/packaging-units`,
        undefined,
        {},
        jar,
      );
      expect(crossPackaging.status).toBe(404);

      const crossPrices = await fetchJson(
        baseUrl,
        'GET',
        `${API_PRODUCTS_PATH}/${product.body.data.id}/prices`,
        undefined,
        {},
        jar,
      );
      expect(crossPrices.status).toBe(404);

      expect(orgA.organizationId).not.toBe(orgB.organizationId);
    } finally {
      await close(server);
    }
  });
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
