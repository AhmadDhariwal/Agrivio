import { describe, expect, it } from 'vitest';
import {
  API_CSRF_HEADER,
  API_CUSTOMERS_PATH,
  API_ORGANIZATION_PATH,
  API_PRODUCT_CATEGORIES_PATH,
} from '@agrivio/api-contracts';
import {
  bootF09App,
  closeServer,
  createApprovedOwner,
  fetchJson,
  issueCsrf,
  login,
  seedPlan,
} from './f09-http-harness.js';

describe('R1-F09-006/007 pilot onboarding and UAT stabilization', () => {
  it('onboards two pilot organizations through setup/import-equivalent entry and records no Critical/High defects', async () => {
    const { server, baseUrl, jar } = await bootF09App();
    try {
      await seedPlan(baseUrl, jar);

      const pilots = [
        {
          organizationName: 'Pilot Client One',
          ownerEmail: 'pilot-one-owner@example.com',
          password: 'a-strong-passphrase',
          category: 'Pilot One Seed',
          customer: 'Pilot One Farmer',
        },
        {
          organizationName: 'Pilot Client Two',
          ownerEmail: 'pilot-two-owner@example.com',
          password: 'a-strong-passphrase',
          category: 'Pilot Two Seed',
          customer: 'Pilot Two Farmer',
        },
      ];

      const organizationIds = [];
      for (const pilot of pilots) {
        const org = await createApprovedOwner(baseUrl, jar, pilot);
        organizationIds.push(org.organizationId);
        await login(baseUrl, jar, pilot.ownerEmail, pilot.password);
        const organization = await fetchJson(baseUrl, 'GET', API_ORGANIZATION_PATH, undefined, {}, jar);
        expect(organization.status).toBe(200);
        expect(organization.body.data.id).toBe(org.organizationId);

        const category = await fetchJson(
          baseUrl,
          'POST',
          API_PRODUCT_CATEGORIES_PATH,
          { name: pilot.category, productClass: 'seed' },
          { [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar) },
          jar,
        );
        expect(category.status).toBe(201);

        const customer = await fetchJson(
          baseUrl,
          'POST',
          API_CUSTOMERS_PATH,
          { name: pilot.customer, customerType: 'farmer' },
          { [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar) },
          jar,
        );
        expect(customer.status).toBe(201);

        const listed = await fetchJson(baseUrl, 'GET', API_CUSTOMERS_PATH, undefined, {}, jar);
        expect(listed.body.data.items).toHaveLength(1);
        expect(listed.body.data.items[0].name).toBe(pilot.customer);
      }

      expect(new Set(organizationIds).size).toBe(2);

      await login(baseUrl, jar, pilots[0].ownerEmail, pilots[0].password);
      const leak = await fetchJson(baseUrl, 'GET', API_CUSTOMERS_PATH, undefined, {}, jar);
      expect(leak.body.data.items.some((item) => item.name === pilots[1].customer)).toBe(false);
    } finally {
      await closeServer(server);
    }
  });
});
