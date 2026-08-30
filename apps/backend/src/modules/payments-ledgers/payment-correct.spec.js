import { describe, expect, it } from 'vitest';
import {
  API_ACCOUNTS_PATH,
  API_CSRF_HEADER,
  API_CUSTOMER_PAYMENTS_PATH,
  API_CUSTOMERS_PATH,
  API_IDEMPOTENCY_KEY_HEADER,
  API_PAYMENTS_PATH,
  API_SUPPLIER_PAYMENTS_PATH,
  API_SUPPLIERS_PATH,
} from '@agrivio/api-contracts';
import {
  bootF09App,
  closeServer,
  createApprovedOwner,
  fetchJson,
  issueCsrf,
  login,
  logout,
  seedOrgMember,
  seedPlan,
} from '../../../tests/workflows/f09-http-harness.js';

const PASSWORD = 'a-strong-passphrase';

describe('Frozen payment correction HTTP', () => {
  it('corrects customer and supplier payments with reconciliation, denial, and idempotency', async () => {
    const { server, baseUrl, jar, app } = await bootF09App();
    try {
      await seedPlan(baseUrl, jar);
      const orgA = await createApprovedOwner(baseUrl, jar, {
        organizationName: 'Pay Correct Org A',
        ownerEmail: 'pay-correct-a@example.com',
        password: PASSWORD,
      });
      const orgB = await createApprovedOwner(baseUrl, jar, {
        organizationName: 'Pay Correct Org B',
        ownerEmail: 'pay-correct-b@example.com',
        password: PASSWORD,
      });
      await seedOrgMember(app.agrivio.auth.store, {
        email: 'pay-correct-cashier@example.com',
        password: PASSWORD,
        organizationId: orgA.organizationId,
        role: 'Cashier',
      });

      await login(baseUrl, jar, 'pay-correct-a@example.com', PASSWORD);
      const csrf = async () => ({ [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar) });

      const customer = await fetchJson(
        baseUrl,
        'POST',
        API_CUSTOMERS_PATH,
        { name: 'Correct Customer', customerType: 'farmer', phone: '03001112221' },
        await csrf(),
        jar,
      );
      expect(customer.status).toBe(201);

      const cash = await fetchJson(
        baseUrl,
        'POST',
        API_ACCOUNTS_PATH,
        { name: 'Correct Cash', accountType: 'cash' },
        await csrf(),
        jar,
      );
      expect(cash.status).toBe(201);

      const cashOpen = await fetchJson(
        baseUrl,
        'POST',
        `${API_ACCOUNTS_PATH}/${cash.body.data.id}/opening-balance`,
        { amount: { amount: '10000.00', currency: 'PKR' } },
        { ...(await csrf()), [API_IDEMPOTENCY_KEY_HEADER]: 'pay-correct-cash-open' },
        jar,
      );
      expect(cashOpen.status).toBe(201);

      const customerPayment = await fetchJson(
        baseUrl,
        'POST',
        API_CUSTOMER_PAYMENTS_PATH,
        {
          customerId: customer.body.data.id,
          accountId: cash.body.data.id,
          amount: { amount: '200.00', currency: 'PKR' },
          paymentDate: '2026-08-14',
          allocationMode: 'general',
          notes: 'to correct',
        },
        { ...(await csrf()), [API_IDEMPOTENCY_KEY_HEADER]: 'pay-correct-cust-1' },
        jar,
      );
      expect(customerPayment.status).toBe(201);
      const originalCustomerId = customerPayment.body.data.id;
      const originalPostedAt = customerPayment.body.data.postedAt;
      const originalAmount = customerPayment.body.data.amount.amount;

      const afterPayCash = await fetchJson(
        baseUrl,
        'GET',
        `${API_ACCOUNTS_PATH}/${cash.body.data.id}`,
        undefined,
        {},
        jar,
      );
      expect(afterPayCash.body.data.derivedBalances.balance.amount).toBe('10200.00');

      const missingReason = await fetchJson(
        baseUrl,
        'POST',
        `${API_PAYMENTS_PATH}/${originalCustomerId}/correct`,
        {},
        { ...(await csrf()), [API_IDEMPOTENCY_KEY_HEADER]: 'pay-correct-missing-reason' },
        jar,
      );
      expect(missingReason.status).toBe(400);

      const correctKey = 'pay-correct-cust-fix';
      const corrected = await fetchJson(
        baseUrl,
        'POST',
        `${API_PAYMENTS_PATH}/${originalCustomerId}/correct`,
        { reason: 'Wrong customer receipt' },
        { ...(await csrf()), [API_IDEMPOTENCY_KEY_HEADER]: correctKey },
        jar,
      );
      expect(corrected.status).toBe(200);
      expect(corrected.body.data.original.id).toBe(originalCustomerId);
      expect(corrected.body.data.original.amount.amount).toBe(originalAmount);
      expect(corrected.body.data.reversal.correctionOfId).toBe(originalCustomerId);
      expect(corrected.body.data.reversal.reason).toBe('Wrong customer receipt');
      expect(corrected.body.data.replacement).toBeNull();

      const replay = await fetchJson(
        baseUrl,
        'POST',
        `${API_PAYMENTS_PATH}/${originalCustomerId}/correct`,
        { reason: 'Wrong customer receipt' },
        { ...(await csrf()), [API_IDEMPOTENCY_KEY_HEADER]: correctKey },
        jar,
      );
      expect(replay.status).toBe(200);
      expect(replay.body.data.reversal.id).toBe(corrected.body.data.reversal.id);

      const originalAfter = await fetchJson(
        baseUrl,
        'GET',
        `${API_CUSTOMER_PAYMENTS_PATH}/${originalCustomerId}`,
        undefined,
        {},
        jar,
      );
      expect(originalAfter.status).toBe(200);
      expect(originalAfter.body.data.postedAt).toBe(originalPostedAt);
      expect(originalAfter.body.data.amount.amount).toBe(originalAmount);
      expect(originalAfter.body.data.correctionOfId).toBeNull();

      const double = await fetchJson(
        baseUrl,
        'POST',
        `${API_PAYMENTS_PATH}/${originalCustomerId}/correct`,
        { reason: 'second attempt' },
        { ...(await csrf()), [API_IDEMPOTENCY_KEY_HEADER]: 'pay-correct-cust-double' },
        jar,
      );
      expect(double.status).toBe(409);

      const cashAfterCorrect = await fetchJson(
        baseUrl,
        'GET',
        `${API_ACCOUNTS_PATH}/${cash.body.data.id}`,
        undefined,
        {},
        jar,
      );
      expect(cashAfterCorrect.body.data.derivedBalances.balance.amount).toBe('10000.00');

      const customerAfter = await fetchJson(
        baseUrl,
        'GET',
        `${API_CUSTOMERS_PATH}/${customer.body.data.id}`,
        undefined,
        {},
        jar,
      );
      expect(customerAfter.body.data.derivedBalances.advance.amount).toBe('0.00');

      const ledger = await fetchJson(
        baseUrl,
        'GET',
        `${API_CUSTOMERS_PATH}/${customer.body.data.id}/ledger`,
        undefined,
        {},
        jar,
      );
      expect(ledger.status).toBe(200);
      const advanceNet = ledger.body.data.items
        .filter((item) => item.effectKind === 'advance')
        .reduce((sum, item) => sum + Number(item.signedAmount.amount), 0);
      expect(advanceNet).toBe(0);

      const supplier = await fetchJson(
        baseUrl,
        'POST',
        API_SUPPLIERS_PATH,
        { name: 'Correct Supplier', phone: '03001112222' },
        await csrf(),
        jar,
      );
      expect(supplier.status).toBe(201);

      const supplierPayment = await fetchJson(
        baseUrl,
        'POST',
        API_SUPPLIER_PAYMENTS_PATH,
        {
          supplierId: supplier.body.data.id,
          accountId: cash.body.data.id,
          amount: { amount: '75.00', currency: 'PKR' },
          paymentDate: '2026-08-14',
          allocationMode: 'general',
        },
        { ...(await csrf()), [API_IDEMPOTENCY_KEY_HEADER]: 'pay-correct-sup-1' },
        jar,
      );
      expect(supplierPayment.status).toBe(201);

      const supplierCorrected = await fetchJson(
        baseUrl,
        'POST',
        `${API_PAYMENTS_PATH}/${supplierPayment.body.data.id}/correct`,
        { reason: 'Wrong supplier payment' },
        { ...(await csrf()), [API_IDEMPOTENCY_KEY_HEADER]: 'pay-correct-sup-fix' },
        jar,
      );
      expect(supplierCorrected.status).toBe(200);
      expect(supplierCorrected.body.data.reversal.correctionOfId).toBe(supplierPayment.body.data.id);

      const cashAfterSupplier = await fetchJson(
        baseUrl,
        'GET',
        `${API_ACCOUNTS_PATH}/${cash.body.data.id}`,
        undefined,
        {},
        jar,
      );
      expect(cashAfterSupplier.body.data.derivedBalances.balance.amount).toBe('10000.00');

      await logout(baseUrl, jar);
      await login(baseUrl, jar, 'pay-correct-cashier@example.com', PASSWORD);
      const cashierDenied = await fetchJson(
        baseUrl,
        'POST',
        `${API_PAYMENTS_PATH}/${originalCustomerId}/correct`,
        { reason: 'cashier attempt' },
        { ...(await csrf()), [API_IDEMPOTENCY_KEY_HEADER]: 'pay-correct-cashier' },
        jar,
      );
      expect(cashierDenied.status).toBe(403);

      await logout(baseUrl, jar);
      await login(baseUrl, jar, 'pay-correct-b@example.com', PASSWORD);
      const crossTenant = await fetchJson(
        baseUrl,
        'POST',
        `${API_PAYMENTS_PATH}/${originalCustomerId}/correct`,
        { reason: 'foreign payment' },
        { ...(await csrf()), [API_IDEMPOTENCY_KEY_HEADER]: 'pay-correct-cross' },
        jar,
      );
      expect([403, 404]).toContain(crossTenant.status);
      void orgB;
    } finally {
      await closeServer(server);
    }
  }, 120000);
});
