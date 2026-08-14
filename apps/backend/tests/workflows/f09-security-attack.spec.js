import { describe, expect, it } from 'vitest';
import {
  API_CSRF_HEADER,
  API_CUSTOMERS_PATH,
  API_PRODUCT_CATEGORIES_PATH,
  API_PRODUCTS_PATH,
  API_PURCHASES_PATH,
  API_REPORTS_PATH,
} from '@agrivio/api-contracts';
import { createAuthRateLimiter } from '../../src/modules/identity/auth.rate-limit.js';
import {
  bootF09App,
  closeServer,
  createApprovedOwner,
  fetchJson,
  issueCsrf,
  login,
  seedOrgMember,
  seedPlan,
} from './f09-http-harness.js';

describe('R1-F09-002 tenant-isolation attack tests', () => {
  it('documents the coded default throttle of 20 attempts / 15 minutes (not a Frozen REL-G05 pass)', () => {
    const limiter = createAuthRateLimiter({ now: () => 1_000 });
    for (let i = 0; i < 20; i += 1) {
      limiter.assertAllowed('login:client');
    }
    expect(() => limiter.assertAllowed('login:client')).toThrow(/Too many authentication attempts/);
  });

  it('blocks cross-tenant catalog/customer reads, CSRF gaps, and UI-independent permission bypass', async () => {
    const { server, baseUrl, jar, app } = await bootF09App();
    try {
      await seedPlan(baseUrl, jar);
      const orgA = await createApprovedOwner(baseUrl, jar, {
        organizationName: 'F09 Attack Org A',
        ownerEmail: 'f09-attack-a@example.com',
        password: 'a-strong-passphrase',
      });
      const orgB = await createApprovedOwner(baseUrl, jar, {
        organizationName: 'F09 Attack Org B',
        ownerEmail: 'f09-attack-b@example.com',
        password: 'a-strong-passphrase',
      });

      expect(orgA.organizationId).not.toBe(orgB.organizationId);

      await seedOrgMember(app.agrivio.auth.store, {
        email: 'f09-cashier-a@example.com',
        password: 'a-strong-passphrase',
        organizationId: orgA.organizationId,
        role: 'Cashier',
      });

      await login(baseUrl, jar, 'f09-attack-b@example.com', 'a-strong-passphrase');
      const categoryB = await fetchJson(
        baseUrl,
        'POST',
        API_PRODUCT_CATEGORIES_PATH,
        { name: 'Org B Seed', productClass: 'seed' },
        { [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar) },
        jar,
      );
      expect(categoryB.status).toBe(201);
      const customerB = await fetchJson(
        baseUrl,
        'POST',
        API_CUSTOMERS_PATH,
        { name: 'Farmer B', customerType: 'farmer' },
        { [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar) },
        jar,
      );
      expect(customerB.status).toBe(201);

      await login(baseUrl, jar, 'f09-attack-a@example.com', 'a-strong-passphrase');
      const categoryA = await fetchJson(
        baseUrl,
        'POST',
        API_PRODUCT_CATEGORIES_PATH,
        { name: 'Org A Seed', productClass: 'seed' },
        { [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar) },
        jar,
      );
      expect(categoryA.status).toBe(201);

      const stealCategory = await fetchJson(
        baseUrl,
        'GET',
        `${API_PRODUCT_CATEGORIES_PATH}/${categoryB.body.data.id}`,
        undefined,
        {},
        jar,
      );
      expect(stealCategory.status).toBe(404);

      const stealCustomer = await fetchJson(
        baseUrl,
        'GET',
        `${API_CUSTOMERS_PATH}/${customerB.body.data.id}`,
        undefined,
        {},
        jar,
      );
      expect(stealCustomer.status).toBe(404);

      const listedCustomers = await fetchJson(baseUrl, 'GET', API_CUSTOMERS_PATH, undefined, {}, jar);
      expect(listedCustomers.status).toBe(200);
      expect(listedCustomers.body.data.items.every((item) => item.name !== 'Farmer B')).toBe(true);

      const missingCsrf = await fetchJson(
        baseUrl,
        'POST',
        API_PRODUCTS_PATH,
        {
          name: 'No CSRF',
          categoryId: categoryA.body.data.id,
          trackingMode: 'none',
          baseUnitCode: 'KG',
          measurementDimension: 'mass',
        },
        {},
        jar,
      );
      expect(missingCsrf.status).toBe(403);

      await login(baseUrl, jar, 'f09-cashier-a@example.com', 'a-strong-passphrase');
      const cashierManage = await fetchJson(
        baseUrl,
        'POST',
        API_PRODUCT_CATEGORIES_PATH,
        { name: 'Cashier should not', productClass: 'general' },
        { [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar) },
        jar,
      );
      expect(cashierManage.status).toBe(403);

      const cashierPurchases = await fetchJson(baseUrl, 'GET', API_PURCHASES_PATH, undefined, {}, jar);
      expect(cashierPurchases.status).toBe(403);

      const cashierReports = await fetchJson(baseUrl, 'GET', API_REPORTS_PATH, undefined, {}, jar);
      expect(cashierReports.status).toBe(403);
    } finally {
      await closeServer(server);
    }
  });
});
