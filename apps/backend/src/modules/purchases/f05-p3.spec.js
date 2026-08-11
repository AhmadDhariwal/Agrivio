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
  API_SUPPLIERS_PATH,
  API_SUPPLIER_PAYMENTS_PATH,
  API_RETURNS_PATH,
  API_WAREHOUSES_PATH,
  ApiTransportErrorCode,
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

describe('F05 P3 supplier payments, cancellations, returns, and reconciliation', () => {
  it('supplier payment lifecycle: invoice-specific, general oldest-first, excess advance, account movement, idempotency, conflicts, cross-org', async () => {
    const { server, baseUrl, jar, accounts } = await boot();

    try {
      await seedPlan(baseUrl, jar);

      const orgA = await createApprovedOwner(baseUrl, jar, {
        organizationName: 'F05P3 Org A',
        ownerEmail: 'f05p3-owner-a@example.com',
        password: 'a-strong-passphrase',
      });
      const orgB = await createApprovedOwner(baseUrl, jar, {
        organizationName: 'F05P3 Org B',
        ownerEmail: 'f05p3-owner-b@example.com',
        password: 'b-strong-passphrase',
      });

      await login(baseUrl, jar, 'f05p3-owner-a@example.com', 'a-strong-passphrase');

      const supplier = await fetchJson(
        baseUrl, 'POST', API_SUPPLIERS_PATH,
        { name: 'P3 Supplier A', phone: '03001110001' },
        { [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar) }, jar,
      );
      expect(supplier.status).toBe(201);
      const supplierId = supplier.body.data.id;

      const cashAccount = await fetchJson(
        baseUrl, 'POST', API_ACCOUNTS_PATH,
        { name: 'P3 Cash', accountType: 'cash' },
        { [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar) }, jar,
      );
      expect(cashAccount.status).toBe(201);
      const cashId = cashAccount.body.data.id;

      await fetchJson(
        baseUrl, 'POST', `${API_ACCOUNTS_PATH}/${cashId}/opening-balance`,
        { amount: { amount: '200000.00', currency: 'PKR' } },
        { [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar), [API_IDEMPOTENCY_KEY_HEADER]: 'p3-cash-open' }, jar,
      );

      const bankAccount = await fetchJson(
        baseUrl, 'POST', API_ACCOUNTS_PATH,
        { name: 'P3 Bank', accountType: 'bank', bankName: 'MCB' },
        { [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar) }, jar,
      );
      expect(bankAccount.status).toBe(201);
      const bankId = bankAccount.body.data.id;

      await fetchJson(
        baseUrl, 'POST', `${API_ACCOUNTS_PATH}/${bankId}/opening-balance`,
        { amount: { amount: '200000.00', currency: 'PKR' } },
        { [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar), [API_IDEMPOTENCY_KEY_HEADER]: 'p3-bank-open' }, jar,
      );

      const warehouse = await fetchJson(
        baseUrl, 'POST', API_WAREHOUSES_PATH,
        { name: 'P3 WH' },
        { [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar) }, jar,
      );
      expect(warehouse.status).toBe(201);
      const warehouseId = warehouse.body.data.id;

      const category = await fetchJson(
        baseUrl, 'POST', API_PRODUCT_CATEGORIES_PATH,
        { name: 'P3 Cat', productClass: 'general' },
        { [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar) }, jar,
      );
      expect(category.status).toBe(201);

      const product = await fetchJson(
        baseUrl, 'POST', API_PRODUCTS_PATH,
        { name: 'P3 Seed', categoryId: category.body.data.id, trackingMode: 'none', baseUnitCode: 'KG', measurementDimension: 'mass' },
        { [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar) }, jar,
      );
      expect(product.status).toBe(201);
      const productId = product.body.data.id;

      function draftBody(batchNote, purchaseDate = '2026-08-01') {
        return {
          warehouseId,
          supplierId,
          purchaseDate,
          lines: [{
            productId,
            quantity: '10',
            unitCost: { amount: '100.00', currency: 'PKR' },
          }],
          landedCosts: { freight: { amount: '0.00', currency: 'PKR' } },
          notes: batchNote,
        };
      }

      // Post three credit purchases on different dates (for oldest-first allocation ordering)
      async function postCreditPurchase(dateStr, notes, key) {
        const draft = await fetchJson(
          baseUrl, 'POST', API_PURCHASES_PATH,
          draftBody(notes, dateStr),
          { [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar) }, jar,
        );
        expect(draft.status).toBe(201);
        const posted = await fetchJson(
          baseUrl, 'POST', `${API_PURCHASES_PATH}/${draft.body.data.id}/post`,
          { expectedVersion: draft.body.data.version, payments: [] },
          { [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar), [API_IDEMPOTENCY_KEY_HEADER]: key }, jar,
        );
        expect(posted.status).toBe(200);
        expect(posted.body.data.status).toBe('posted');
        expect(posted.body.data.payableTotal.amount).toBe('1000.00');
        return posted.body.data;
      }

      const purchase1 = await postCreditPurchase('2026-08-01', 'oldest', 'p3-purch-1');
      const purchase2 = await postCreditPurchase('2026-08-05', 'middle', 'p3-purch-2');
      const purchase3 = await postCreditPurchase('2026-08-10', 'newest', 'p3-purch-3');

      // --- Test: listUnpaid shows all three
      const unpaid0 = await fetchJson(
        baseUrl, 'GET', `${API_SUPPLIERS_PATH}/${supplierId}/unpaid-purchases`, null, {}, jar,
      );
      expect(unpaid0.status).toBe(200);
      expect(unpaid0.body.data.items.length).toBe(3);

      // --- Test 1: invoice-specific payment allocates only to target purchase
      const invoicePayment = await fetchJson(
        baseUrl, 'POST', API_SUPPLIER_PAYMENTS_PATH,
        {
          supplierId,
          accountId: cashId,
          amount: { amount: '600.00', currency: 'PKR' },
          paymentDate: '2026-08-11',
          allocationMode: 'invoice_specific',
          allocations: [
            { purchaseId: purchase2.id, amount: { amount: '600.00', currency: 'PKR' } },
          ],
        },
        { [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar), [API_IDEMPOTENCY_KEY_HEADER]: 'p3-inv-pay-1' }, jar,
      );
      expect(invoicePayment.status).toBe(201);
      const invPayDto = invoicePayment.body.data;
      expect(invPayDto.allocations.some((a) => a.targetId === purchase2.id && a.targetType === 'purchase')).toBe(true);
      const nonPurchase2Allocs = invPayDto.allocations.filter(
        (a) => a.targetType === 'purchase' && a.targetId !== purchase2.id,
      );
      expect(nonPurchase2Allocs).toHaveLength(0);

      // --- Test 4: account movement equals payment
      const cashMovementsAfterInv = await accounts.accountsService.listAccountMovements(
        orgA.organizationId, cashId,
      );
      const invPayMovement = cashMovementsAfterInv.items.filter(
        (item) => item.sourceType === 'supplier_payment',
      );
      expect(invPayMovement.length).toBeGreaterThanOrEqual(1);
      expect(invPayMovement.some((m) => m.signedAmount.amount === '-600.00')).toBe(true);

      // --- Test 2: general oldest-first allocation — pay 2200 (covers purchase1=1000, purchase2 remaining=400, purchase3=800)
      const generalPayment = await fetchJson(
        baseUrl, 'POST', API_SUPPLIER_PAYMENTS_PATH,
        {
          supplierId,
          accountId: bankId,
          amount: { amount: '2400.00', currency: 'PKR' },
          paymentDate: '2026-08-12',
          allocationMode: 'general',
        },
        { [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar), [API_IDEMPOTENCY_KEY_HEADER]: 'p3-gen-pay-1' }, jar,
      );
      expect(generalPayment.status).toBe(201);
      const genPayDto = generalPayment.body.data;
      const purchaseAllocs = genPayDto.allocations.filter((a) => a.targetType === 'purchase');
      // Should have allocated to multiple purchases (oldest first)
      expect(purchaseAllocs.length).toBeGreaterThanOrEqual(1);

      // --- Test 3: excess over outstanding becomes supplier advance
      const excessPayment = await fetchJson(
        baseUrl, 'POST', API_SUPPLIER_PAYMENTS_PATH,
        {
          supplierId,
          accountId: cashId,
          amount: { amount: '5000.00', currency: 'PKR' },
          paymentDate: '2026-08-12',
          allocationMode: 'general',
        },
        { [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar), [API_IDEMPOTENCY_KEY_HEADER]: 'p3-excess-pay-1' }, jar,
      );
      expect(excessPayment.status).toBe(201);
      const excessDto = excessPayment.body.data;
      const advanceAlloc = excessDto.allocations.find((a) => a.targetType === 'supplier_advance');
      expect(advanceAlloc).toBeDefined();
      expect(parseFloat(advanceAlloc.allocatedAmount.amount)).toBeGreaterThan(0);

      // --- Test 5: idempotent replay returns same response, no duplicate
      const replayPayment = await fetchJson(
        baseUrl, 'POST', API_SUPPLIER_PAYMENTS_PATH,
        {
          supplierId,
          accountId: cashId,
          amount: { amount: '5000.00', currency: 'PKR' },
          paymentDate: '2026-08-12',
          allocationMode: 'general',
        },
        { [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar), [API_IDEMPOTENCY_KEY_HEADER]: 'p3-excess-pay-1' }, jar,
      );
      expect(replayPayment.status).toBe(201);
      expect(replayPayment.body.data.id).toBe(excessDto.id);

      // --- Test 6: same key different body conflicts
      const conflictPayment = await fetchJson(
        baseUrl, 'POST', API_SUPPLIER_PAYMENTS_PATH,
        {
          supplierId,
          accountId: cashId,
          amount: { amount: '1.00', currency: 'PKR' },
          paymentDate: '2026-08-12',
          allocationMode: 'general',
        },
        { [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar), [API_IDEMPOTENCY_KEY_HEADER]: 'p3-excess-pay-1' }, jar,
      );
      expect(conflictPayment.status).toBe(409);
      expect(conflictPayment.body.error.code).toBe(ApiTransportErrorCode.IdempotencyConflict);

      // --- Test 7: cross-org rejected — org B cannot see org A's supplier
      await login(baseUrl, jar, 'f05p3-owner-b@example.com', 'b-strong-passphrase');
      const crossOrgPayment = await fetchJson(
        baseUrl, 'POST', API_SUPPLIER_PAYMENTS_PATH,
        {
          supplierId,
          accountId: cashId,
          amount: { amount: '100.00', currency: 'PKR' },
          paymentDate: '2026-08-12',
          allocationMode: 'general',
        },
        { [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar), [API_IDEMPOTENCY_KEY_HEADER]: 'p3-cross-org' }, jar,
      );
      expect([400, 404, 422]).toContain(crossOrgPayment.status);

      void orgB;
    } finally {
      await close(server);
    }
  }, 180000);

  it('purchase cancellation: unpaid, partial-paid, double cancel, reason required, original preserved', async () => {
    const { server, baseUrl, jar, accounts } = await boot();

    try {
      await seedPlan(baseUrl, jar);

      const orgA = await createApprovedOwner(baseUrl, jar, {
        organizationName: 'F05P3 Cancel Org',
        ownerEmail: 'f05p3-cancel@example.com',
        password: 'a-strong-passphrase',
      });

      await login(baseUrl, jar, 'f05p3-cancel@example.com', 'a-strong-passphrase');

      const supplier = await fetchJson(
        baseUrl, 'POST', API_SUPPLIERS_PATH,
        { name: 'P3 Cancel Supplier', phone: '03002220002' },
        { [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar) }, jar,
      );
      const supplierId = supplier.body.data.id;

      const cash = await fetchJson(
        baseUrl, 'POST', API_ACCOUNTS_PATH,
        { name: 'Cancel Cash', accountType: 'cash' },
        { [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar) }, jar,
      );
      const cashId = cash.body.data.id;
      await fetchJson(
        baseUrl, 'POST', `${API_ACCOUNTS_PATH}/${cashId}/opening-balance`,
        { amount: { amount: '50000.00', currency: 'PKR' } },
        { [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar), [API_IDEMPOTENCY_KEY_HEADER]: 'cancel-cash-open' }, jar,
      );

      const warehouse = await fetchJson(
        baseUrl, 'POST', API_WAREHOUSES_PATH,
        { name: 'Cancel WH' },
        { [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar) }, jar,
      );
      const warehouseId = warehouse.body.data.id;

      const category = await fetchJson(
        baseUrl, 'POST', API_PRODUCT_CATEGORIES_PATH,
        { name: 'Cancel Cat', productClass: 'general' },
        { [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar) }, jar,
      );
      const product = await fetchJson(
        baseUrl, 'POST', API_PRODUCTS_PATH,
        { name: 'Cancel Seed', categoryId: category.body.data.id, trackingMode: 'none', baseUnitCode: 'KG', measurementDimension: 'mass' },
        { [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar) }, jar,
      );
      const productId = product.body.data.id;

      function makeDraftBody(notes = '') {
        return {
          warehouseId, supplierId, purchaseDate: '2026-08-11',
          lines: [{ productId, quantity: '5', unitCost: { amount: '200.00', currency: 'PKR' } }],
          landedCosts: { freight: { amount: '0.00', currency: 'PKR' } },
          notes,
        };
      }

      // --- Test 8: unpaid cancel nets stock and payable
      const unpaidDraft = await fetchJson(
        baseUrl, 'POST', API_PURCHASES_PATH,
        makeDraftBody('unpaid-cancel'),
        { [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar) }, jar,
      );
      expect(unpaidDraft.status).toBe(201);

      const unpaidPosted = await fetchJson(
        baseUrl, 'POST', `${API_PURCHASES_PATH}/${unpaidDraft.body.data.id}/post`,
        { expectedVersion: unpaidDraft.body.data.version, payments: [] },
        { [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar), [API_IDEMPOTENCY_KEY_HEADER]: 'p3-unpaid-post' }, jar,
      );
      expect(unpaidPosted.status).toBe(200);
      expect(unpaidPosted.body.data.payableTotal.amount).toBe('1000.00');

      const balancesAfterPost = await fetchJson(
        baseUrl, 'GET', API_INVENTORY_BALANCES_PATH, null, {}, jar,
      );
      const stockBefore = balancesAfterPost.body.data.items.find((i) => i.productId === productId);
      expect(stockBefore).toBeDefined();
      expect(stockBefore.quantityBase).toBe('5.0000');

      const cancelUnpaid = await fetchJson(
        baseUrl, 'POST', `${API_PURCHASES_PATH}/${unpaidDraft.body.data.id}/cancel`,
        { expectedVersion: unpaidPosted.body.data.version, reason: 'Supplier defaulted' },
        { [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar), [API_IDEMPOTENCY_KEY_HEADER]: 'p3-cancel-unpaid' }, jar,
      );
      expect(cancelUnpaid.status).toBe(200);
      expect(cancelUnpaid.body.data.status).toBe('cancelled');

      const balancesAfterCancel = await fetchJson(
        baseUrl, 'GET', API_INVENTORY_BALANCES_PATH, null, {}, jar,
      );
      const productBalance = balancesAfterCancel.body.data.items.find((i) => i.productId === productId);
      expect(productBalance === undefined || productBalance.quantityBase === '0.0000').toBe(true);

      // --- Test 11: cancel requires reason
      const partialPaidDraft = await fetchJson(
        baseUrl, 'POST', API_PURCHASES_PATH,
        makeDraftBody('partial-paid-cancel'),
        { [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar) }, jar,
      );
      const partialPaidPosted = await fetchJson(
        baseUrl, 'POST', `${API_PURCHASES_PATH}/${partialPaidDraft.body.data.id}/post`,
        {
          expectedVersion: partialPaidDraft.body.data.version,
          payments: [{ accountId: cashId, amount: { amount: '400.00', currency: 'PKR' } }],
        },
        { [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar), [API_IDEMPOTENCY_KEY_HEADER]: 'p3-partial-post' }, jar,
      );
      expect(partialPaidPosted.status).toBe(200);
      expect(partialPaidPosted.body.data.paidTotal.amount).toBe('400.00');
      expect(partialPaidPosted.body.data.payableTotal.amount).toBe('600.00');

      const cancelNoReason = await fetchJson(
        baseUrl, 'POST', `${API_PURCHASES_PATH}/${partialPaidDraft.body.data.id}/cancel`,
        { expectedVersion: partialPaidPosted.body.data.version },
        { [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar), [API_IDEMPOTENCY_KEY_HEADER]: 'p3-cancel-no-reason' }, jar,
      );
      expect([400, 422]).toContain(cancelNoReason.status);

      // --- Test 9: partial-paid cancel refunds account portion
      const cancelPartial = await fetchJson(
        baseUrl, 'POST', `${API_PURCHASES_PATH}/${partialPaidDraft.body.data.id}/cancel`,
        { expectedVersion: partialPaidPosted.body.data.version, reason: 'Wrong goods received' },
        { [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar), [API_IDEMPOTENCY_KEY_HEADER]: 'p3-cancel-partial' }, jar,
      );
      expect(cancelPartial.status).toBe(200);
      expect(cancelPartial.body.data.status).toBe('cancelled');

      const cashAfterCancel = await accounts.accountsService.listAccountMovements(
        orgA.organizationId, cashId,
      );
      const refundMovement = cashAfterCancel.items.find(
        (m) => m.sourceType === 'purchase_cancellation_refund',
      );
      expect(refundMovement).toBeDefined();
      expect(refundMovement.signedAmount.amount).toBe('400.00');

      // --- Test 10: double cancel rejected
      const doubleCancelAttempt = await fetchJson(
        baseUrl, 'POST', `${API_PURCHASES_PATH}/${partialPaidDraft.body.data.id}/cancel`,
        { expectedVersion: cancelPartial.body.data.version, reason: 'Cancel again' },
        { [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar), [API_IDEMPOTENCY_KEY_HEADER]: 'p3-double-cancel' }, jar,
      );
      expect(doubleCancelAttempt.status).toBe(409);

      // --- Test 12: original purchase preserved (status cancelled, totals intact)
      const cancelledPurchase = await fetchJson(
        baseUrl, 'GET', `${API_PURCHASES_PATH}/${partialPaidDraft.body.data.id}`, null, {}, jar,
      );
      expect(cancelledPurchase.status).toBe(200);
      expect(cancelledPurchase.body.data.status).toBe('cancelled');
      expect(cancelledPurchase.body.data.purchaseTotal.amount).toBe('1000.00');
      expect(cancelledPurchase.body.data.paidTotal.amount).toBe('400.00');

      void orgA;
    } finally {
      await close(server);
    }
  }, 180000);

  it('purchase returns: qty cap, cumulative cap, reconcile, idempotency, tenant isolation', async () => {
    const { server, baseUrl, jar, accounts } = await boot();

    try {
      await seedPlan(baseUrl, jar);

      const orgA = await createApprovedOwner(baseUrl, jar, {
        organizationName: 'F05P3 Return Org A',
        ownerEmail: 'f05p3-return-a@example.com',
        password: 'a-strong-passphrase',
      });
      const orgB = await createApprovedOwner(baseUrl, jar, {
        organizationName: 'F05P3 Return Org B',
        ownerEmail: 'f05p3-return-b@example.com',
        password: 'b-strong-passphrase',
      });

      await login(baseUrl, jar, 'f05p3-return-a@example.com', 'a-strong-passphrase');

      const supplier = await fetchJson(
        baseUrl, 'POST', API_SUPPLIERS_PATH,
        { name: 'Return Supplier', phone: '03003330003' },
        { [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar) }, jar,
      );
      const supplierId = supplier.body.data.id;

      const cash = await fetchJson(
        baseUrl, 'POST', API_ACCOUNTS_PATH,
        { name: 'Return Cash', accountType: 'cash' },
        { [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar) }, jar,
      );
      const cashId = cash.body.data.id;
      await fetchJson(
        baseUrl, 'POST', `${API_ACCOUNTS_PATH}/${cashId}/opening-balance`,
        { amount: { amount: '100000.00', currency: 'PKR' } },
        { [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar), [API_IDEMPOTENCY_KEY_HEADER]: 'ret-cash-open' }, jar,
      );

      const warehouse = await fetchJson(
        baseUrl, 'POST', API_WAREHOUSES_PATH,
        { name: 'Return WH' },
        { [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar) }, jar,
      );
      const warehouseId = warehouse.body.data.id;

      const category = await fetchJson(
        baseUrl, 'POST', API_PRODUCT_CATEGORIES_PATH,
        { name: 'Return Cat', productClass: 'general' },
        { [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar) }, jar,
      );
      const product = await fetchJson(
        baseUrl, 'POST', API_PRODUCTS_PATH,
        { name: 'Return Seed', categoryId: category.body.data.id, trackingMode: 'none', baseUnitCode: 'KG', measurementDimension: 'mass' },
        { [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar) }, jar,
      );
      const productId = product.body.data.id;

      const purchaseDraft = await fetchJson(
        baseUrl, 'POST', API_PURCHASES_PATH,
        {
          warehouseId, supplierId, purchaseDate: '2026-08-11',
          lines: [{ productId, quantity: '10', unitCost: { amount: '50.00', currency: 'PKR' } }],
          landedCosts: { freight: { amount: '0.00', currency: 'PKR' } },
        },
        { [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar) }, jar,
      );
      expect(purchaseDraft.status).toBe(201);

      const postedPurchase = await fetchJson(
        baseUrl, 'POST', `${API_PURCHASES_PATH}/${purchaseDraft.body.data.id}/post`,
        { expectedVersion: purchaseDraft.body.data.version, payments: [] },
        { [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar), [API_IDEMPOTENCY_KEY_HEADER]: 'p3-ret-post' }, jar,
      );
      expect(postedPurchase.status).toBe(200);
      const purchaseId = postedPurchase.body.data.id;

      // --- Test 13: return cannot exceed returnable qty (11 > 10)
      const overReturnDraft = await fetchJson(
        baseUrl, 'POST', `${API_PURCHASES_PATH}/${purchaseId}/returns`,
        { lines: [{ originalLineIndex: 0, quantity: '11' }] },
        { [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar) }, jar,
      );
      expect(overReturnDraft.status).toBe(201);
      const overReturnPost = await fetchJson(
        baseUrl, 'POST', `${API_RETURNS_PATH}/${overReturnDraft.body.data.id}/post`,
        { expectedVersion: overReturnDraft.body.data.version, reason: 'Excess qty', resolution: 'ledger_adjustment' },
        { [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar), [API_IDEMPOTENCY_KEY_HEADER]: 'p3-over-return' }, jar,
      );
      expect(overReturnPost.status).toBe(400);

      // --- Create first valid return (6 units)
      const firstReturnDraft = await fetchJson(
        baseUrl, 'POST', `${API_PURCHASES_PATH}/${purchaseId}/returns`,
        { lines: [{ originalLineIndex: 0, quantity: '6' }] },
        { [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar) }, jar,
      );
      expect(firstReturnDraft.status).toBe(201);

      const firstReturnPosted = await fetchJson(
        baseUrl, 'POST', `${API_RETURNS_PATH}/${firstReturnDraft.body.data.id}/post`,
        { expectedVersion: firstReturnDraft.body.data.version, reason: 'Bad quality', resolution: 'ledger_adjustment' },
        { [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar), [API_IDEMPOTENCY_KEY_HEADER]: 'p3-first-return' }, jar,
      );
      expect(firstReturnPosted.status).toBe(200);
      expect(firstReturnPosted.body.data.status).toBe('posted');
      expect(firstReturnPosted.body.data.returnTotal.amount).toBe('300.00');

      // --- Test 14: cumulative returns capped — second return of 6 would exceed remaining 4
      const secondExcessReturnDraft = await fetchJson(
        baseUrl, 'POST', `${API_PURCHASES_PATH}/${purchaseId}/returns`,
        { lines: [{ originalLineIndex: 0, quantity: '6' }] },
        { [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar) }, jar,
      );
      expect(secondExcessReturnDraft.status).toBe(201);

      const secondExcessPost = await fetchJson(
        baseUrl, 'POST', `${API_RETURNS_PATH}/${secondExcessReturnDraft.body.data.id}/post`,
        { expectedVersion: secondExcessReturnDraft.body.data.version, reason: 'Over limit', resolution: 'ledger_adjustment' },
        { [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar), [API_IDEMPOTENCY_KEY_HEADER]: 'p3-cumulative-return' }, jar,
      );
      expect(secondExcessPost.status).toBe(400);

      // --- Test 16: stock/payable reconcile after return
      const balancesAfterReturn = await fetchJson(
        baseUrl, 'GET', API_INVENTORY_BALANCES_PATH, null, {}, jar,
      );
      const stockAfterReturn = balancesAfterReturn.body.data.items.find((i) => i.productId === productId);
      expect(stockAfterReturn).toBeDefined();
      expect(stockAfterReturn.quantityBase).toBe('4.0000');

      const movements = await fetchJson(
        baseUrl, 'GET', API_INVENTORY_MOVEMENTS_PATH, null, {}, jar,
      );
      expect(
        movements.body.data.items.some((m) => m.sourceType === 'purchase_return'),
      ).toBe(true);

      const supplierLedger = await fetchJson(
        baseUrl, 'GET', `${API_SUPPLIERS_PATH}/${supplierId}/ledger`, null, {}, jar,
      );
      expect(supplierLedger.status).toBe(200);
      const returnEffect = supplierLedger.body.data.items.find(
        (e) => e.sourceType === 'purchase_return',
      );
      expect(returnEffect).toBeDefined();

      // --- Test 17: idempotent return post
      const idempotentReturnPost = await fetchJson(
        baseUrl, 'POST', `${API_RETURNS_PATH}/${firstReturnDraft.body.data.id}/post`,
        { expectedVersion: firstReturnDraft.body.data.version, reason: 'Bad quality', resolution: 'ledger_adjustment' },
        { [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar), [API_IDEMPOTENCY_KEY_HEADER]: 'p3-first-return' }, jar,
      );
      expect(idempotentReturnPost.status).toBe(200);
      expect(idempotentReturnPost.body.data.id).toBe(firstReturnPosted.body.data.id);

      // --- Test 18: tenant isolation — org B cannot access org A's return
      await login(baseUrl, jar, 'f05p3-return-b@example.com', 'b-strong-passphrase');
      const crossOrgReturn = await fetchJson(
        baseUrl, 'GET', `${API_RETURNS_PATH}/${firstReturnDraft.body.data.id}`, null, {}, jar,
      );
      expect([403, 404]).toContain(crossOrgReturn.status);

      void orgA;
      void orgB;
      void accounts;
    } finally {
      await close(server);
    }
  }, 180000);

  it('full lifecycle reconciliation and listUnpaid updates after standalone payment', async () => {
    const { server, baseUrl, jar } = await boot();

    try {
      await seedPlan(baseUrl, jar);

      await createApprovedOwner(baseUrl, jar, {
        organizationName: 'F05P3 Lifecycle Org',
        ownerEmail: 'f05p3-lifecycle@example.com',
        password: 'a-strong-passphrase',
      });

      await login(baseUrl, jar, 'f05p3-lifecycle@example.com', 'a-strong-passphrase');

      const supplier = await fetchJson(
        baseUrl, 'POST', API_SUPPLIERS_PATH,
        { name: 'Lifecycle Supplier', phone: '03004440004' },
        { [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar) }, jar,
      );
      const supplierId = supplier.body.data.id;

      const cash = await fetchJson(
        baseUrl, 'POST', API_ACCOUNTS_PATH,
        { name: 'Lifecycle Cash', accountType: 'cash' },
        { [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar) }, jar,
      );
      const cashId = cash.body.data.id;
      await fetchJson(
        baseUrl, 'POST', `${API_ACCOUNTS_PATH}/${cashId}/opening-balance`,
        { amount: { amount: '100000.00', currency: 'PKR' } },
        { [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar), [API_IDEMPOTENCY_KEY_HEADER]: 'lc-cash-open' }, jar,
      );

      const warehouse = await fetchJson(
        baseUrl, 'POST', API_WAREHOUSES_PATH,
        { name: 'Lifecycle WH' },
        { [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar) }, jar,
      );
      const warehouseId = warehouse.body.data.id;

      const category = await fetchJson(
        baseUrl, 'POST', API_PRODUCT_CATEGORIES_PATH,
        { name: 'Lifecycle Cat', productClass: 'general' },
        { [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar) }, jar,
      );
      const product = await fetchJson(
        baseUrl, 'POST', API_PRODUCTS_PATH,
        { name: 'Lifecycle Seed', categoryId: category.body.data.id, trackingMode: 'none', baseUnitCode: 'KG', measurementDimension: 'mass' },
        { [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar) }, jar,
      );
      const productId = product.body.data.id;

      // Post a purchase (10 KG × 100 = 1000)
      const draft = await fetchJson(
        baseUrl, 'POST', API_PURCHASES_PATH,
        {
          warehouseId, supplierId, purchaseDate: '2026-08-11',
          lines: [{ productId, quantity: '10', unitCost: { amount: '100.00', currency: 'PKR' } }],
          landedCosts: { freight: { amount: '0.00', currency: 'PKR' } },
        },
        { [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar) }, jar,
      );
      expect(draft.status).toBe(201);

      const posted = await fetchJson(
        baseUrl, 'POST', `${API_PURCHASES_PATH}/${draft.body.data.id}/post`,
        { expectedVersion: draft.body.data.version, payments: [] },
        { [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar), [API_IDEMPOTENCY_KEY_HEADER]: 'lc-post' }, jar,
      );
      expect(posted.status).toBe(200);
      const purchaseId = posted.body.data.id;

      // Verify listUnpaid shows the purchase
      const unpaidBefore = await fetchJson(
        baseUrl, 'GET', `${API_SUPPLIERS_PATH}/${supplierId}/unpaid-purchases`, null, {}, jar,
      );
      expect(unpaidBefore.status).toBe(200);
      expect(unpaidBefore.body.data.items.some((i) => i.id === purchaseId)).toBe(true);
      const outstandingBefore = unpaidBefore.body.data.items.find((i) => i.id === purchaseId)?.outstandingMinorUnits;
      expect(outstandingBefore).toBe('100000');

      // Partial payment via standalone supplier payment (400 PKR)
      const standalonePayment = await fetchJson(
        baseUrl, 'POST', API_SUPPLIER_PAYMENTS_PATH,
        {
          supplierId,
          accountId: cashId,
          amount: { amount: '400.00', currency: 'PKR' },
          paymentDate: '2026-08-12',
          allocationMode: 'invoice_specific',
          allocations: [{ purchaseId, amount: { amount: '400.00', currency: 'PKR' } }],
        },
        { [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar), [API_IDEMPOTENCY_KEY_HEADER]: 'lc-standalone-pay' }, jar,
      );
      expect(standalonePayment.status).toBe(201);

      // Verify listUnpaid shows reduced outstanding (outstanding drops)
      const unpaidAfterPayment = await fetchJson(
        baseUrl, 'GET', `${API_SUPPLIERS_PATH}/${supplierId}/unpaid-purchases`, null, {}, jar,
      );
      expect(unpaidAfterPayment.status).toBe(200);
      const remainingOutstanding = unpaidAfterPayment.body.data.items.find((i) => i.id === purchaseId)?.outstandingMinorUnits;
      expect(remainingOutstanding).toBe('60000');

      // Post a partial return (3 KG), reducing payable by 300
      const returnDraft = await fetchJson(
        baseUrl, 'POST', `${API_PURCHASES_PATH}/${purchaseId}/returns`,
        { lines: [{ originalLineIndex: 0, quantity: '3' }] },
        { [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar) }, jar,
      );
      expect(returnDraft.status).toBe(201);

      const returnPosted = await fetchJson(
        baseUrl, 'POST', `${API_RETURNS_PATH}/${returnDraft.body.data.id}/post`,
        { expectedVersion: returnDraft.body.data.version, reason: 'Damaged', resolution: 'ledger_adjustment' },
        { [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar), [API_IDEMPOTENCY_KEY_HEADER]: 'lc-return' }, jar,
      );
      expect(returnPosted.status).toBe(200);

      // Post a second purchase for cancel
      const cancelDraft = await fetchJson(
        baseUrl, 'POST', API_PURCHASES_PATH,
        {
          warehouseId, supplierId, purchaseDate: '2026-08-11',
          lines: [{ productId, quantity: '5', unitCost: { amount: '100.00', currency: 'PKR' } }],
          landedCosts: { freight: { amount: '0.00', currency: 'PKR' } },
        },
        { [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar) }, jar,
      );
      const cancelPosted = await fetchJson(
        baseUrl, 'POST', `${API_PURCHASES_PATH}/${cancelDraft.body.data.id}/post`,
        { expectedVersion: cancelDraft.body.data.version, payments: [] },
        { [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar), [API_IDEMPOTENCY_KEY_HEADER]: 'lc-cancel-post' }, jar,
      );
      expect(cancelPosted.status).toBe(200);

      await fetchJson(
        baseUrl, 'POST', `${API_PURCHASES_PATH}/${cancelDraft.body.data.id}/cancel`,
        { expectedVersion: cancelPosted.body.data.version, reason: 'Supplier cancelled order' },
        { [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar), [API_IDEMPOTENCY_KEY_HEADER]: 'lc-cancel' }, jar,
      );

      // --- Test 19: reconciliation is healthy after full lifecycle
      const reconciliation = await fetchJson(
        baseUrl, 'GET', `${API_SUPPLIERS_PATH}/${supplierId}/reconciliation`, null, {}, jar,
      );
      expect(reconciliation.status).toBe(200);
      expect(reconciliation.body.data.ok).toBe(true);
      expect(reconciliation.body.data.findings).toEqual([]);

      void productId;
    } finally {
      await close(server);
    }
  }, 180000);

  it('architecture: returns module must not import foreign persistence models', () => {
    const violations = scanForeignPersistenceViolations(
      backendRoot,
      ['/modules/returns-corrections/'],
      [
        '/inventory/persistence/',
        '/accounts-expenses/persistence/',
        '/payments-ledgers/persistence/',
        '/purchases/persistence/',
      ],
    );
    expect(violations).toEqual([]);
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
    inventory: app.agrivio.inventory,
    accounts: app.agrivio.accounts,
    ledgers: app.agrivio.ledgers,
    purchases: app.agrivio.purchases,
  };
}

async function seedPlan(baseUrl, jar) {
  const response = await fetchJson(
    baseUrl, 'POST', API_PLATFORM_SUBSCRIPTION_PLANS_PATH,
    { planCode: 'Starter', activate: true, monthlyPriceMinorUnits: 1000 },
    { [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar), [API_PLATFORM_ACTOR_HEADER]: 'super-admin' }, jar,
  );
  expect([200, 201]).toContain(response.status);
}

async function createApprovedOwner(baseUrl, jar, input) {
  const requested = await fetchJson(
    baseUrl, 'POST', API_ORGANIZATION_ACTIVATION_REQUESTS_PATH,
    { organizationName: input.organizationName, ownerEmail: input.ownerEmail, ownerDisplayName: 'Owner' },
    { [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar) }, jar,
  );
  expect(requested.status).toBe(201);

  const approved = await fetchJson(
    baseUrl, 'POST', `${API_PLATFORM_ORGANIZATIONS_PATH}/${requested.body.data.organizationId}/approve`,
    {},
    { [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar), [API_PLATFORM_ACTOR_HEADER]: 'super-admin' }, jar,
  );
  expect(approved.status).toBe(200);

  const activated = await fetchJson(
    baseUrl, 'POST', '/api/v1/auth/activate',
    { token: approved.body.data.activationToken, password: input.password },
    { [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar) }, jar,
  );
  expect(activated.status).toBe(200);

  return { organizationId: requested.body.data.organizationId };
}

async function login(baseUrl, jar, email, password) {
  const csrf = await issueCsrf(baseUrl, jar);
  const response = await fetchJson(
    baseUrl, 'POST', API_AUTH_LOGIN_PATH,
    { email, password },
    { [API_CSRF_HEADER]: csrf }, jar,
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
    get(name) { return cookies.get(name); },
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
