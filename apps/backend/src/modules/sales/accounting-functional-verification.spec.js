import { describe, expect, it } from 'vitest';
import {
  API_AUTH_CSRF_PATH,
  API_AUTH_LOGIN_PATH,
  API_ACCOUNTS_PATH,
  API_BRANCHES_PATH,
  API_CSRF_HEADER,
  API_CUSTOMERS_PATH,
  API_CUSTOMER_PAYMENTS_PATH,
  API_DASHBOARD_PATH,
  API_IDEMPOTENCY_KEY_HEADER,
  API_INVENTORY_OPENING_STOCK_PATH,
  API_ORGANIZATION_ACTIVATION_REQUESTS_PATH,
  API_PLATFORM_ACTOR_HEADER,
  API_PLATFORM_ORGANIZATIONS_PATH,
  API_PLATFORM_SUBSCRIPTION_PLANS_PATH,
  API_PRODUCT_CATEGORIES_PATH,
  API_PRODUCTS_PATH,
  API_SALES_PATH,
  API_WAREHOUSES_PATH,
} from '@agrivio/api-contracts';
import { createServer } from 'node:http';

const { createApp } = require('../../app');
const { loadApiEnv } = require('../../platform/config/runtime-config');
const { createMockDatabaseLifecycle } = require('../../platform/database/mongo-connection');

describe('Accounting Functional Verification: Advance, Receivable, Credit Limits, Openings, Cancellations, Dashboard', () => {
  it('executes full suite of accounting scenarios with ledger reconciliation and tenant isolation', async () => {
    const { server, baseUrl, jar } = await boot();

    try {
      await seedPlan(baseUrl, jar);
      await createApprovedOwner(baseUrl, jar, {
        organizationName: 'Agrivio Accounting Org',
        ownerEmail: 'accounting-owner@example.com',
        password: 'a-strong-passphrase',
      });
      await login(baseUrl, jar, 'accounting-owner@example.com', 'a-strong-passphrase');

      // 1. Setup branch, warehouse, cash account, category, product, stock
      const branch = await postJson(baseUrl, jar, 'POST', API_BRANCHES_PATH, {
        name: 'Main Branch',
        invoicePrefix: 'MB',
      });
      expect(branch.status).toBe(201);

      const warehouse = await postJson(baseUrl, jar, 'POST', API_WAREHOUSES_PATH, {
        name: 'Main Warehouse',
      });
      expect(warehouse.status).toBe(201);

      const cashAccount = await postJson(baseUrl, jar, 'POST', API_ACCOUNTS_PATH, {
        name: 'Main Cash',
        accountType: 'cash',
      });
      expect(cashAccount.status).toBe(201);
      await postJson(
        baseUrl,
        jar,
        'POST',
        `${API_ACCOUNTS_PATH}/${cashAccount.body.data.id}/opening-balance`,
        { amount: { amount: '100000.00', currency: 'PKR' } },
        'acc-cash-open',
      );

      const category = await postJson(baseUrl, jar, 'POST', API_PRODUCT_CATEGORIES_PATH, {
        name: 'Fertilizers',
        productClass: 'general',
      });
      expect(category.status).toBe(201);

      const product = await postJson(baseUrl, jar, 'POST', API_PRODUCTS_PATH, {
        name: 'Urea 50kg',
        categoryId: category.body.data.id,
        trackingMode: 'none',
        baseUnitCode: 'BAG',
        measurementDimension: 'mass',
      });
      expect(product.status).toBe(201);

      await postJson(
        baseUrl,
        jar,
        'PUT',
        `${API_PRODUCTS_PATH}/${product.body.data.id}/prices`,
        {
          expectedVersion: product.body.data.version,
          items: [
            { priceTier: 'retail', price: { amount: '1000.00', currency: 'PKR' } },
            { priceTier: 'wholesale', price: { amount: '1000.00', currency: 'PKR' } },
          ],
        },
      );

      // Seed 1000 bags of Urea @ 500 PKR
      const stock = await postJson(
        baseUrl,
        jar,
        'POST',
        API_INVENTORY_OPENING_STOCK_PATH,
        {
          warehouseId: warehouse.body.data.id,
          productId: product.body.data.id,
          quantity: '1000',
          inventoryValue: { amount: '500000.00', currency: 'PKR' },
        },
        'seed-urea-stock',
      );
      expect(stock.status).toBe(201);

      // =========================================================================
      // SCENARIO 1: ADVANCE TESTS
      // =========================================================================

      // Advance Test 1: Advance 10000, Sale 6000 -> Expected: Advance = 4000, Receivable = 0
      const customerAdv10k = await postJson(baseUrl, jar, 'POST', API_CUSTOMERS_PATH, {
        name: 'Customer Advance 10k',
        customerType: 'farmer',
        creditEnabled: true,
        creditLimit: { amount: '50000.00', currency: 'PKR' },
        creditLimitBehaviour: 'block',
      });
      expect(customerAdv10k.status).toBe(201);

      await postJson(
        baseUrl,
        jar,
        'POST',
        `${API_CUSTOMERS_PATH}/${customerAdv10k.body.data.id}/opening-balance`,
        { kind: 'advance', amount: { amount: '10000.00', currency: 'PKR' } },
        'adv-10k-opening',
      );

      // Verify initial balance
      const adv10kInit = await fetchJson(
        baseUrl,
        'GET',
        `${API_CUSTOMERS_PATH}/${customerAdv10k.body.data.id}`,
        null,
        {},
        jar,
      );
      expect(adv10kInit.body.data.derivedBalances.advance.amount).toBe('10000.00');
      expect(adv10kInit.body.data.derivedBalances.receivable.amount).toBe('0.00');

      // Sale of 6 bags @ 1000 = 6000.00
      const draftSale1 = await postJson(baseUrl, jar, 'POST', API_SALES_PATH, {
        branchId: branch.body.data.id,
        warehouseId: warehouse.body.data.id,
        customerId: customerAdv10k.body.data.id,
        saleDate: '2026-09-01',
        lines: [
          {
            productId: product.body.data.id,
            quantity: '6',
            unitPrice: { amount: '1000.00', currency: 'PKR' },
          },
        ],
      });
      const postSale1 = await postJson(
        baseUrl,
        jar,
        'POST',
        `${API_SALES_PATH}/${draftSale1.body.data.id}/post`,
        { expectedVersion: draftSale1.body.data.version, payments: [] },
        'post-sale-1-adv10k',
      );
      expect(postSale1.status).toBe(200);
      expect(postSale1.body.data.receivableTotal.amount).toBe('0.00');

      const adv10kAfter = await fetchJson(
        baseUrl,
        'GET',
        `${API_CUSTOMERS_PATH}/${customerAdv10k.body.data.id}`,
        null,
        {},
        jar,
      );
      expect(adv10kAfter.body.data.derivedBalances.advance.amount).toBe('4000.00');
      expect(adv10kAfter.body.data.derivedBalances.receivable.amount).toBe('0.00');

      // Advance Test 2: Advance 3000, Sale 6000 -> Expected: Advance = 0, Receivable = 3000
      const customerAdv3k = await postJson(baseUrl, jar, 'POST', API_CUSTOMERS_PATH, {
        name: 'Customer Advance 3k',
        customerType: 'farmer',
        creditEnabled: true,
        creditLimit: { amount: '50000.00', currency: 'PKR' },
        creditLimitBehaviour: 'block',
      });
      expect(customerAdv3k.status).toBe(201);

      await postJson(
        baseUrl,
        jar,
        'POST',
        `${API_CUSTOMERS_PATH}/${customerAdv3k.body.data.id}/opening-balance`,
        { kind: 'advance', amount: { amount: '3000.00', currency: 'PKR' } },
        'adv-3k-opening',
      );

      const draftSale2 = await postJson(baseUrl, jar, 'POST', API_SALES_PATH, {
        branchId: branch.body.data.id,
        warehouseId: warehouse.body.data.id,
        customerId: customerAdv3k.body.data.id,
        saleDate: '2026-09-01',
        lines: [
          {
            productId: product.body.data.id,
            quantity: '6',
            unitPrice: { amount: '1000.00', currency: 'PKR' },
          },
        ],
      });
      const postSale2 = await postJson(
        baseUrl,
        jar,
        'POST',
        `${API_SALES_PATH}/${draftSale2.body.data.id}/post`,
        { expectedVersion: draftSale2.body.data.version, payments: [] },
        'post-sale-2-adv3k',
      );
      expect(postSale2.status).toBe(200);
      expect(postSale2.body.data.receivableTotal.amount).toBe('3000.00');

      const adv3kAfter = await fetchJson(
        baseUrl,
        'GET',
        `${API_CUSTOMERS_PATH}/${customerAdv3k.body.data.id}`,
        null,
        {},
        jar,
      );
      expect(adv3kAfter.body.data.derivedBalances.advance.amount).toBe('0.00');
      expect(adv3kAfter.body.data.derivedBalances.receivable.amount).toBe('3000.00');

      // Advance Test 3: No advance, Sale 6000 -> Expected: Existing receivable flow unchanged (Advance = 0, Receivable = 6000)
      const customerNoAdv = await postJson(baseUrl, jar, 'POST', API_CUSTOMERS_PATH, {
        name: 'Customer No Advance',
        customerType: 'farmer',
        creditEnabled: true,
        creditLimit: { amount: '50000.00', currency: 'PKR' },
        creditLimitBehaviour: 'block',
      });
      expect(customerNoAdv.status).toBe(201);

      const draftSale3 = await postJson(baseUrl, jar, 'POST', API_SALES_PATH, {
        branchId: branch.body.data.id,
        warehouseId: warehouse.body.data.id,
        customerId: customerNoAdv.body.data.id,
        saleDate: '2026-09-01',
        lines: [
          {
            productId: product.body.data.id,
            quantity: '6',
            unitPrice: { amount: '1000.00', currency: 'PKR' },
          },
        ],
      });
      const postSale3 = await postJson(
        baseUrl,
        jar,
        'POST',
        `${API_SALES_PATH}/${draftSale3.body.data.id}/post`,
        { expectedVersion: draftSale3.body.data.version, payments: [] },
        'post-sale-3-noadv',
      );
      expect(postSale3.status).toBe(200);
      expect(postSale3.body.data.receivableTotal.amount).toBe('6000.00');

      const noAdvAfter = await fetchJson(
        baseUrl,
        'GET',
        `${API_CUSTOMERS_PATH}/${customerNoAdv.body.data.id}`,
        null,
        {},
        jar,
      );
      expect(noAdvAfter.body.data.derivedBalances.advance.amount).toBe('0.00');
      expect(noAdvAfter.body.data.derivedBalances.receivable.amount).toBe('6000.00');

      // =========================================================================
      // SCENARIO 2: CREDIT LIMIT TESTS (Receivable - Advance + New Credit Sale)
      // =========================================================================

      // Test customer with advance only:
      // Credit limit: 5000.00, block behaviour. Advance: 4000.00, Receivable: 0.00.
      const custCreditAdvOnly = await postJson(baseUrl, jar, 'POST', API_CUSTOMERS_PATH, {
        name: 'Cust Credit Advance Only',
        customerType: 'farmer',
        creditEnabled: true,
        creditLimit: { amount: '5000.00', currency: 'PKR' },
        creditLimitBehaviour: 'block',
      });
      await postJson(
        baseUrl,
        jar,
        'POST',
        `${API_CUSTOMERS_PATH}/${custCreditAdvOnly.body.data.id}/opening-balance`,
        { kind: 'advance', amount: { amount: '4000.00', currency: 'PKR' } },
        'credit-test-adv-only',
      );

      // New credit sale of 8000:
      // Projected = Receivable (0) - Advance (4000) + New Credit (8000) = 4000 <= 5000 -> Should succeed!
      const draftCreditAdv1 = await postJson(baseUrl, jar, 'POST', API_SALES_PATH, {
        branchId: branch.body.data.id,
        warehouseId: warehouse.body.data.id,
        customerId: custCreditAdvOnly.body.data.id,
        saleDate: '2026-09-02',
        lines: [
          {
            productId: product.body.data.id,
            quantity: '8',
            unitPrice: { amount: '1000.00', currency: 'PKR' },
          },
        ],
      });
      const postCreditAdv1 = await postJson(
        baseUrl,
        jar,
        'POST',
        `${API_SALES_PATH}/${draftCreditAdv1.body.data.id}/post`,
        { expectedVersion: draftCreditAdv1.body.data.version, payments: [] },
        'post-credit-adv-allowed',
      );
      expect(postCreditAdv1.status).toBe(200);

      // Now customer has Receivable: 4000, Advance: 0.
      // Another sale of 2000:
      // Projected = Receivable (4000) - Advance (0) + New Credit (2000) = 6000 > 5000 -> Should be blocked!
      const draftCreditAdvBlocked = await postJson(baseUrl, jar, 'POST', API_SALES_PATH, {
        branchId: branch.body.data.id,
        warehouseId: warehouse.body.data.id,
        customerId: custCreditAdvOnly.body.data.id,
        saleDate: '2026-09-02',
        lines: [
          {
            productId: product.body.data.id,
            quantity: '2',
            unitPrice: { amount: '1000.00', currency: 'PKR' },
          },
        ],
      });
      const postCreditAdvBlocked = await postJson(
        baseUrl,
        jar,
        'POST',
        `${API_SALES_PATH}/${draftCreditAdvBlocked.body.data.id}/post`,
        { expectedVersion: draftCreditAdvBlocked.body.data.version, payments: [] },
        'post-credit-adv-blocked',
      );
      expect([400, 409]).toContain(postCreditAdvBlocked.status);

      // Test customer with receivable only:
      // Credit limit: 5000.00, block. Opening receivable: 4000.00, Advance: 0.00.
      const custCreditRecOnly = await postJson(baseUrl, jar, 'POST', API_CUSTOMERS_PATH, {
        name: 'Cust Credit Receivable Only',
        customerType: 'farmer',
        creditEnabled: true,
        creditLimit: { amount: '5000.00', currency: 'PKR' },
        creditLimitBehaviour: 'block',
      });
      await postJson(
        baseUrl,
        jar,
        'POST',
        `${API_CUSTOMERS_PATH}/${custCreditRecOnly.body.data.id}/opening-balance`,
        { kind: 'receivable', amount: { amount: '4000.00', currency: 'PKR' } },
        'credit-test-rec-only',
      );

      // Sale of 2000 -> Projected = 4000 - 0 + 2000 = 6000 > 5000 -> Blocked!
      const draftCreditRecBlocked = await postJson(baseUrl, jar, 'POST', API_SALES_PATH, {
        branchId: branch.body.data.id,
        warehouseId: warehouse.body.data.id,
        customerId: custCreditRecOnly.body.data.id,
        saleDate: '2026-09-02',
        lines: [
          {
            productId: product.body.data.id,
            quantity: '2',
            unitPrice: { amount: '1000.00', currency: 'PKR' },
          },
        ],
      });
      const postCreditRecBlocked = await postJson(
        baseUrl,
        jar,
        'POST',
        `${API_SALES_PATH}/${draftCreditRecBlocked.body.data.id}/post`,
        { expectedVersion: draftCreditRecBlocked.body.data.version, payments: [] },
        'post-credit-rec-blocked',
      );
      expect([400, 409]).toContain(postCreditRecBlocked.status);

      // Sale of 800 (0.8 bags or 1 bag price overridden to 800) -> Projected = 4000 + 800 = 4800 <= 5000 -> Allowed!
      const draftCreditRecAllowed = await postJson(baseUrl, jar, 'POST', API_SALES_PATH, {
        branchId: branch.body.data.id,
        warehouseId: warehouse.body.data.id,
        customerId: custCreditRecOnly.body.data.id,
        saleDate: '2026-09-02',
        lines: [
          {
            productId: product.body.data.id,
            quantity: '1',
            unitPrice: { amount: '800.00', currency: 'PKR' },
          },
        ],
      });
      const postCreditRecAllowed = await postJson(
        baseUrl,
        jar,
        'POST',
        `${API_SALES_PATH}/${draftCreditRecAllowed.body.data.id}/post`,
        {
          expectedVersion: draftCreditRecAllowed.body.data.version,
          payments: [],
          linePriceOverrides: [{ lineIndex: 0, reason: 'Special discount' }],
        },
        'post-credit-rec-allowed',
      );
      expect(postCreditRecAllowed.status).toBe(200);

      // Test customer with both advance and receivable:
      // Start with Customer who has credit limit: 10000.00, block behaviour.
      const custBoth = await postJson(baseUrl, jar, 'POST', API_CUSTOMERS_PATH, {
        name: 'Cust Both Adv and Rec',
        customerType: 'farmer',
        creditEnabled: true,
        creditLimit: { amount: '10000.00', currency: 'PKR' },
        creditLimitBehaviour: 'block',
      });

      // Post Sale 1 of 6000.00
      const draftBoth1 = await postJson(baseUrl, jar, 'POST', API_SALES_PATH, {
        branchId: branch.body.data.id,
        warehouseId: warehouse.body.data.id,
        customerId: custBoth.body.data.id,
        saleDate: '2026-09-02',
        lines: [
          {
            productId: product.body.data.id,
            quantity: '6',
            unitPrice: { amount: '1000.00', currency: 'PKR' },
          },
        ],
      });
      const postBoth1 = await postJson(
        baseUrl,
        jar,
        'POST',
        `${API_SALES_PATH}/${draftBoth1.body.data.id}/post`,
        { expectedVersion: draftBoth1.body.data.version, payments: [] },
        'post-both-sale-1',
      );
      expect(postBoth1.status).toBe(200);

      // Post Sale 2 of 1000.00
      const draftBoth2 = await postJson(baseUrl, jar, 'POST', API_SALES_PATH, {
        branchId: branch.body.data.id,
        warehouseId: warehouse.body.data.id,
        customerId: custBoth.body.data.id,
        saleDate: '2026-09-02',
        lines: [
          {
            productId: product.body.data.id,
            quantity: '1',
            unitPrice: { amount: '1000.00', currency: 'PKR' },
          },
        ],
      });
      const postBoth2 = await postJson(
        baseUrl,
        jar,
        'POST',
        `${API_SALES_PATH}/${draftBoth2.body.data.id}/post`,
        { expectedVersion: draftBoth2.body.data.version, payments: [] },
        'post-both-sale-2',
      );
      expect(postBoth2.status).toBe(200);

      // Make an invoice-specific payment of 3000.00:
      // Allocate 1000.00 to Sale 2 (clearing it).
      // Remainder of 2000.00 becomes customer advance!
      // Sale 1 remains unpaid (6000.00 receivable).
      const paymentBoth = await postJson(baseUrl, jar, 'POST', API_CUSTOMER_PAYMENTS_PATH, {
        customerId: custBoth.body.data.id,
        accountId: cashAccount.body.data.id,
        amount: { amount: '3000.00', currency: 'PKR' },
        paymentDate: '2026-09-02',
        allocationMode: 'invoice_specific',
        allocations: [
          {
            saleId: draftBoth2.body.data.id,
            amount: { amount: '1000.00', currency: 'PKR' },
          },
        ],
      });
      expect(paymentBoth.status).toBe(201);

      // Customer now has Receivable = 6000.00 and Advance = 2000.00!
      const custBothMid = await fetchJson(
        baseUrl,
        'GET',
        `${API_CUSTOMERS_PATH}/${custBoth.body.data.id}`,
        null,
        {},
        jar,
      );
      expect(custBothMid.body.data.derivedBalances.receivable.amount).toBe('6000.00');
      expect(custBothMid.body.data.derivedBalances.advance.amount).toBe('2000.00');

      // Update creditLimit to 5000.00 so that Net Exposure (4000.00) is close to the limit
      const patchCreditLimit = await postJson(
        baseUrl,
        jar,
        'PATCH',
        `${API_CUSTOMERS_PATH}/${custBoth.body.data.id}/credit-policy`,
        {
          expectedVersion: custBothMid.body.data.version,
          creditLimit: { amount: '5000.00', currency: 'PKR' },
        },
      );
      expect(patchCreditLimit.status).toBe(200);

      // Net exposure is 6000 - 2000 = 4000.00.
      // Credit limit is 5000.00.
      // 1. Sale of 1500 exceeds credit limit:
      //    Projected = 6000 - 2000 + 1500 = 5500 > 5000 -> Blocked!
      const draftBothBlocked = await postJson(baseUrl, jar, 'POST', API_SALES_PATH, {
        branchId: branch.body.data.id,
        warehouseId: warehouse.body.data.id,
        customerId: custBoth.body.data.id,
        saleDate: '2026-09-02',
        lines: [
          {
            productId: product.body.data.id,
            quantity: '1',
            unitPrice: { amount: '1500.00', currency: 'PKR' },
          },
        ],
      });
      const postBothBlocked = await postJson(
        baseUrl,
        jar,
        'POST',
        `${API_SALES_PATH}/${draftBothBlocked.body.data.id}/post`,
        {
          expectedVersion: draftBothBlocked.body.data.version,
          payments: [],
          linePriceOverrides: [{ lineIndex: 0, reason: 'Special order' }],
        },
        'post-both-blocked',
      );
      expect([400, 409]).toContain(postBothBlocked.status);

      // 2. Sale of 800 is within credit limit:
      //    Projected = 6000 - 2000 + 800 = 4800 <= 5000 -> Allowed!
      const draftBothAllowed = await postJson(baseUrl, jar, 'POST', API_SALES_PATH, {
        branchId: branch.body.data.id,
        warehouseId: warehouse.body.data.id,
        customerId: custBoth.body.data.id,
        saleDate: '2026-09-02',
        lines: [
          {
            productId: product.body.data.id,
            quantity: '1',
            unitPrice: { amount: '800.00', currency: 'PKR' },
          },
        ],
      });
      const postBothAllowed = await postJson(
        baseUrl,
        jar,
        'POST',
        `${API_SALES_PATH}/${draftBothAllowed.body.data.id}/post`,
        {
          expectedVersion: draftBothAllowed.body.data.version,
          payments: [],
          linePriceOverrides: [{ lineIndex: 0, reason: 'Special discount' }],
        },
        'post-both-allowed',
      );
      expect(postBothAllowed.status).toBe(200);

      // Advance was 2000. 800 was applied to this sale. Remaining advance is 1200. Receivable is still 6000.
      const custBothFinal = await fetchJson(
        baseUrl,
        'GET',
        `${API_CUSTOMERS_PATH}/${custBoth.body.data.id}`,
        null,
        {},
        jar,
      );
      expect(custBothFinal.body.data.derivedBalances.advance.amount).toBe('1200.00');
      expect(custBothFinal.body.data.derivedBalances.receivable.amount).toBe('6000.00');

      // =========================================================================
      // SCENARIO 3: OPENING RECEIVABLE TESTS
      // =========================================================================

      // Verify:
      // - Opening receivable appears in outstanding balances
      // - Customer payment can allocate against it
      // - FIFO behavior remains correct
      const custOpeningRec = await postJson(baseUrl, jar, 'POST', API_CUSTOMERS_PATH, {
        name: 'Cust Opening Receivable FIFO',
        customerType: 'farmer',
        creditEnabled: true,
        creditLimit: { amount: '50000.00', currency: 'PKR' },
        creditLimitBehaviour: 'block',
      });
      await postJson(
        baseUrl,
        jar,
        'POST',
        `${API_CUSTOMERS_PATH}/${custOpeningRec.body.data.id}/opening-balance`,
        { kind: 'receivable', amount: { amount: '5000.00', currency: 'PKR' } },
        'open-rec-fifo-seed',
      );

      // Check unpaid sales endpoint
      const unpaidTargets1 = await fetchJson(
        baseUrl,
        'GET',
        `${API_CUSTOMERS_PATH}/${custOpeningRec.body.data.id}/unpaid-sales`,
        null,
        {},
        jar,
      );
      expect(unpaidTargets1.status).toBe(200);
      expect(unpaidTargets1.body.data.items.length).toBe(1);
      const openingTarget = unpaidTargets1.body.data.items[0];
      expect(openingTarget.targetType).toBe('customer_opening_receivable');
      expect(openingTarget.outstanding.amount).toBe('5000.00');

      // Post a credit sale on 2026-09-05 for 4000.00
      const draftFifoSale = await postJson(baseUrl, jar, 'POST', API_SALES_PATH, {
        branchId: branch.body.data.id,
        warehouseId: warehouse.body.data.id,
        customerId: custOpeningRec.body.data.id,
        saleDate: '2026-09-05',
        lines: [
          {
            productId: product.body.data.id,
            quantity: '4',
            unitPrice: { amount: '1000.00', currency: 'PKR' },
          },
        ],
      });
      const postFifoSale = await postJson(
        baseUrl,
        jar,
        'POST',
        `${API_SALES_PATH}/${draftFifoSale.body.data.id}/post`,
        { expectedVersion: draftFifoSale.body.data.version, payments: [] },
        'post-fifo-sale',
      );
      expect(postFifoSale.status).toBe(200);

      // Both opening receivable (5000) and sale (4000) are unpaid. Total receivable = 9000.
      const unpaidTargets2 = await fetchJson(
        baseUrl,
        'GET',
        `${API_CUSTOMERS_PATH}/${custOpeningRec.body.data.id}/unpaid-sales`,
        null,
        {},
        jar,
      );
      expect(unpaidTargets2.body.data.items.length).toBe(2);

      // Post FIFO general payment of 6000:
      // FIFO MUST allocate:
      // 5000 to opening receivable (clearing it completely)
      // 1000 to the sale (reducing sale outstanding from 4000 to 3000)
      const fifoPayment = await postJson(baseUrl, jar, 'POST', API_CUSTOMER_PAYMENTS_PATH, {
        customerId: custOpeningRec.body.data.id,
        accountId: cashAccount.body.data.id,
        amount: { amount: '6000.00', currency: 'PKR' },
        paymentDate: '2026-09-06',
        allocationMode: 'general',
      });
      expect(fifoPayment.status).toBe(201);
      expect(fifoPayment.body.data.allocations.length).toBe(2);

      const openAlloc = fifoPayment.body.data.allocations.find(
        (a) => a.targetType === 'customer_opening_receivable',
      );
      expect(openAlloc).toBeDefined();
      expect(openAlloc.allocatedAmount.amount).toBe('5000.00');

      const saleAlloc = fifoPayment.body.data.allocations.find((a) => a.targetType === 'sale');
      expect(saleAlloc).toBeDefined();
      expect(saleAlloc.allocatedAmount.amount).toBe('1000.00');

      // Verify remaining targets: only sale remains with outstanding 3000
      const unpaidTargets3 = await fetchJson(
        baseUrl,
        'GET',
        `${API_CUSTOMERS_PATH}/${custOpeningRec.body.data.id}/unpaid-sales`,
        null,
        {},
        jar,
      );
      expect(unpaidTargets3.body.data.items.length).toBe(1);
      expect(unpaidTargets3.body.data.items[0].targetType).toBe('sale');
      expect(unpaidTargets3.body.data.items[0].outstanding.amount).toBe('3000.00');

      // Verify customer derived balances: receivable = 3000, advance = 0
      const custFifoAfter = await fetchJson(
        baseUrl,
        'GET',
        `${API_CUSTOMERS_PATH}/${custOpeningRec.body.data.id}`,
        null,
        {},
        jar,
      );
      expect(custFifoAfter.body.data.derivedBalances.receivable.amount).toBe('3000.00');
      expect(custFifoAfter.body.data.derivedBalances.advance.amount).toBe('0.00');

      // Test invoice-specific allocation against opening receivable
      const custOpeningInvSpec = await postJson(baseUrl, jar, 'POST', API_CUSTOMERS_PATH, {
        name: 'Cust Opening Invoice Specific',
        customerType: 'farmer',
        creditEnabled: true,
        creditLimit: { amount: '50000.00', currency: 'PKR' },
        creditLimitBehaviour: 'block',
      });
      await postJson(
        baseUrl,
        jar,
        'POST',
        `${API_CUSTOMERS_PATH}/${custOpeningInvSpec.body.data.id}/opening-balance`,
        { kind: 'receivable', amount: { amount: '7000.00', currency: 'PKR' } },
        'open-rec-invspec-seed',
      );

      const unpaidInvSpec = await fetchJson(
        baseUrl,
        'GET',
        `${API_CUSTOMERS_PATH}/${custOpeningInvSpec.body.data.id}/unpaid-sales`,
        null,
        {},
        jar,
      );
      const openingInvSpecTarget = unpaidInvSpec.body.data.items[0];

      const invSpecPayment = await postJson(baseUrl, jar, 'POST', API_CUSTOMER_PAYMENTS_PATH, {
        customerId: custOpeningInvSpec.body.data.id,
        accountId: cashAccount.body.data.id,
        amount: { amount: '4500.00', currency: 'PKR' },
        paymentDate: '2026-09-06',
        allocationMode: 'invoice_specific',
        allocations: [
          {
            saleId: openingInvSpecTarget.id,
            amount: { amount: '4500.00', currency: 'PKR' },
          },
        ],
      });
      expect(invSpecPayment.status).toBe(201);
      expect(invSpecPayment.body.data.allocations[0].targetType).toBe('customer_opening_receivable');
      expect(invSpecPayment.body.data.allocations[0].allocatedAmount.amount).toBe('4500.00');

      const custInvSpecAfter = await fetchJson(
        baseUrl,
        'GET',
        `${API_CUSTOMERS_PATH}/${custOpeningInvSpec.body.data.id}`,
        null,
        {},
        jar,
      );
      expect(custInvSpecAfter.body.data.derivedBalances.receivable.amount).toBe('2500.00');

      // =========================================================================
      // SCENARIO 4: OPENING BALANCE CORRECTION TESTS
      // =========================================================================

      // Verify:
      // - Original ledger remains unchanged.
      // - Reversal created.
      // - Replacement created.
      // - Audit information stored.
      const custCorrection = await postJson(baseUrl, jar, 'POST', API_CUSTOMERS_PATH, {
        name: 'Cust Correction Audit',
        customerType: 'farmer',
        creditEnabled: true,
        creditLimit: { amount: '50000.00', currency: 'PKR' },
        creditLimitBehaviour: 'block',
      });
      const initialOpening = await postJson(
        baseUrl,
        jar,
        'POST',
        `${API_CUSTOMERS_PATH}/${custCorrection.body.data.id}/opening-balance`,
        { kind: 'receivable', amount: { amount: '4000.00', currency: 'PKR' } },
        'correction-initial-open',
      );
      expect(initialOpening.status).toBe(201);
      const originalLedgerEffectId = initialOpening.body.data.openingBalance.ledgerEffectId;

      // Perform correction: change to advance 1500
      const correctionRes = await postJson(
        baseUrl,
        jar,
        'POST',
        `${API_CUSTOMERS_PATH}/${custCorrection.body.data.id}/opening-balance/correct`,
        {
          expectedVersion: initialOpening.body.data.version,
          reason: 'Initial opening balance statement was incorrect',
          replacement: {
            kind: 'advance',
            amount: { amount: '1500.00', currency: 'PKR' },
          },
        },
        'correction-idemp-1',
      );
      expect(correctionRes.status).toBe(200);
      expect(correctionRes.body.data.openingBalance.kind).toBe('advance');
      expect(correctionRes.body.data.derivedBalances.receivable.amount).toBe('0.00');
      expect(correctionRes.body.data.derivedBalances.advance.amount).toBe('1500.00');

      // Inspect customer ledger:
      const correctionLedger = await fetchJson(
        baseUrl,
        'GET',
        `${API_CUSTOMERS_PATH}/${custCorrection.body.data.id}/ledger`,
        null,
        {},
        jar,
      );
      const ledgerItems = correctionLedger.body.data.items;

      // 1. Original ledger entry remains unchanged
      const originalEntry = ledgerItems.find((item) => item.id === originalLedgerEffectId);
      expect(originalEntry).toBeDefined();
      expect(originalEntry.sourceType).toBe('customer_opening_receivable');
      expect(originalEntry.effectKind).toBe('receivable');
      expect(originalEntry.signedAmount.amount).toBe('4000.00');

      // 2. Reversal created
      const reversalEntry = ledgerItems.find(
        (item) => item.sourceType === 'customer_opening_correction_reversal',
      );
      expect(reversalEntry).toBeDefined();
      expect(reversalEntry.reversalOfId).toBe(originalLedgerEffectId);
      expect(reversalEntry.signedAmount.amount).toBe('-4000.00');

      // 3. Replacement created
      const replacementEntry = ledgerItems.find(
        (item) => item.sourceType === 'customer_opening_correction_replacement',
      );
      expect(replacementEntry).toBeDefined();
      expect(replacementEntry.effectKind).toBe('advance');
      expect(replacementEntry.signedAmount.amount).toBe('1500.00');

      // 4. Audit information stored: check customer version incremented and replay works
      const replayCorrection = await postJson(
        baseUrl,
        jar,
        'POST',
        `${API_CUSTOMERS_PATH}/${custCorrection.body.data.id}/opening-balance/correct`,
        {
          expectedVersion: initialOpening.body.data.version,
          reason: 'Initial opening balance statement was incorrect',
          replacement: {
            kind: 'advance',
            amount: { amount: '1500.00', currency: 'PKR' },
          },
        },
        'correction-idemp-1',
      );
      expect(replayCorrection.status).toBe(200);
      expect(replayCorrection.body.data.openingBalance.ledgerEffectId).toBe(
        correctionRes.body.data.openingBalance.ledgerEffectId,
      );

      // =========================================================================
      // SCENARIO 5: SALE CANCELLATION TESTS
      // =========================================================================

      // Verify:
      // Sale with advance application cancelled:
      // - Receivable reversal happens.
      // - Advance is restored.
      const custCancel = await postJson(baseUrl, jar, 'POST', API_CUSTOMERS_PATH, {
        name: 'Cust Sale Cancellation Test',
        customerType: 'farmer',
        creditEnabled: true,
        creditLimit: { amount: '50000.00', currency: 'PKR' },
        creditLimitBehaviour: 'block',
      });
      await postJson(
        baseUrl,
        jar,
        'POST',
        `${API_CUSTOMERS_PATH}/${custCancel.body.data.id}/opening-balance`,
        { kind: 'advance', amount: { amount: '5000.00', currency: 'PKR' } },
        'cancel-test-adv-seed',
      );

      // Sale of 3000.00 -> Advance becomes 2000.00, Receivable = 0.00
      const draftCancelSale = await postJson(baseUrl, jar, 'POST', API_SALES_PATH, {
        branchId: branch.body.data.id,
        warehouseId: warehouse.body.data.id,
        customerId: custCancel.body.data.id,
        saleDate: '2026-09-08',
        lines: [
          {
            productId: product.body.data.id,
            quantity: '3',
            unitPrice: { amount: '1000.00', currency: 'PKR' },
          },
        ],
      });
      const postCancelSale = await postJson(
        baseUrl,
        jar,
        'POST',
        `${API_SALES_PATH}/${draftCancelSale.body.data.id}/post`,
        { expectedVersion: draftCancelSale.body.data.version, payments: [] },
        'post-cancel-sale',
      );
      expect(postCancelSale.status).toBe(200);

      const custBeforeCancel = await fetchJson(
        baseUrl,
        'GET',
        `${API_CUSTOMERS_PATH}/${custCancel.body.data.id}`,
        null,
        {},
        jar,
      );
      expect(custBeforeCancel.body.data.derivedBalances.advance.amount).toBe('2000.00');
      expect(custBeforeCancel.body.data.derivedBalances.receivable.amount).toBe('0.00');

      // Now cancel the sale:
      const cancelRes = await postJson(
        baseUrl,
        jar,
        'POST',
        `${API_SALES_PATH}/${draftCancelSale.body.data.id}/cancel`,
        { expectedVersion: postCancelSale.body.data.version, reason: 'Customer cancelled order' },
        'cancel-sale-action',
      );
      expect(cancelRes.status).toBe(200);
      expect(cancelRes.body.data.status).toBe('cancelled');

      // Advance restored to 5000.00, Receivable = 0.00
      const custAfterCancel = await fetchJson(
        baseUrl,
        'GET',
        `${API_CUSTOMERS_PATH}/${custCancel.body.data.id}`,
        null,
        {},
        jar,
      );
      expect(custAfterCancel.body.data.derivedBalances.advance.amount).toBe('5000.00');
      expect(custAfterCancel.body.data.derivedBalances.receivable.amount).toBe('0.00');

      // Inspect customer ledger for cancellation entries
      const cancelLedger = await fetchJson(
        baseUrl,
        'GET',
        `${API_CUSTOMERS_PATH}/${custCancel.body.data.id}/ledger`,
        null,
        {},
        jar,
      );
      expect(
        cancelLedger.body.data.items.some(
          (i) => i.sourceType === 'customer_advance_consumption',
        ),
      ).toBe(true);
      expect(
        cancelLedger.body.data.items.some(
          (i) => i.sourceType === 'sale_cancellation_advance_reinstatement',
        ),
      ).toBe(true);

      // =========================================================================
      // SCENARIO 6: DASHBOARD TESTS
      // =========================================================================

      // Verify KPI values: Total Receivable, Total Advance, Net Exposure match ledger calculations.
      const dashboardRes = await fetchJson(
        baseUrl,
        'GET',
        API_DASHBOARD_PATH,
        null,
        {},
        jar,
      );
      expect(dashboardRes.status).toBe(200);
      const dashboard = dashboardRes.body.data;

      expect(dashboard.totalReceivable).toBeDefined();
      expect(dashboard.totalCustomerAdvance).toBeDefined();
      expect(dashboard.netExposure).toBeDefined();

      const totalRecMinor = BigInt(dashboard.totalReceivable.amount.replace('.', ''));
      const totalAdvMinor = BigInt(dashboard.totalCustomerAdvance.amount.replace('.', ''));
      const netExpMinor = BigInt(dashboard.netExposure.amount.replace('.', ''));

      // Net Exposure = Total Receivable - Total Customer Advance
      expect(netExpMinor).toBe(totalRecMinor - totalAdvMinor);

      // =========================================================================
      // SCENARIO 7: IMPACT & ISOLATION CHECKS
      // =========================================================================

      // Walk-in POS sale without customer: works completely unchanged
      const walkInDraft = await postJson(baseUrl, jar, 'POST', API_SALES_PATH, {
        branchId: branch.body.data.id,
        warehouseId: warehouse.body.data.id,
        saleDate: '2026-09-09',
        lines: [
          {
            productId: product.body.data.id,
            quantity: '1',
            unitPrice: { amount: '1000.00', currency: 'PKR' },
          },
        ],
      });
      const walkInPost = await postJson(
        baseUrl,
        jar,
        'POST',
        `${API_SALES_PATH}/${walkInDraft.body.data.id}/post`,
        {
          expectedVersion: walkInDraft.body.data.version,
          payments: [{ accountId: cashAccount.body.data.id, amount: { amount: '1000.00', currency: 'PKR' } }],
        },
        'pos-walkin-post',
      );
      expect(walkInPost.status).toBe(200);
      expect(walkInPost.body.data.receivableTotal.amount).toBe('0.00');

      // Tenant isolation check:
      // Create Org B owner
      const jarB = createCookieJar();
      await createApprovedOwner(baseUrl, jarB, {
        organizationName: 'Org B Accounting',
        ownerEmail: 'orgb-owner@example.com',
        password: 'a-strong-passphrase',
      });
      await login(baseUrl, jarB, 'orgb-owner@example.com', 'a-strong-passphrase');

      // Org B customer cannot see Org A customer or ledger
      const orgBCustFetch = await fetchJson(
        baseUrl,
        'GET',
        `${API_CUSTOMERS_PATH}/${customerAdv10k.body.data.id}`,
        null,
        {},
        jarB,
      );
      expect(orgBCustFetch.status).toBe(404);

      // Org B dashboard has 0 receivable and 0 advance
      const orgBDashboard = await fetchJson(
        baseUrl,
        'GET',
        API_DASHBOARD_PATH,
        null,
        {},
        jarB,
      );
      expect(orgBDashboard.status).toBe(200);
      expect(orgBDashboard.body.data.totalReceivable.amount).toBe('0.00');
      expect(orgBDashboard.body.data.totalCustomerAdvance.amount).toBe('0.00');
      expect(orgBDashboard.body.data.netExposure.amount).toBe('0.00');
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
      annualPriceMinorUnits: 10000,
      annualDiscountPercent: 16.67,
      displayName: 'Starter',
      shortDescription: 'Test plan',
      targetCustomer: 'Test organization',
      catalogRevision: 'test-catalog',
      trialEligible: true,
      limits: {
        products: 1000,
        activeUsers: 1000,
        branches: 1000,
        warehouses: 1000,
        customers: 1000,
        suppliers: 1000,
      },
      entitlements: {
        imports: true,
        reportsExports: true,
        auditHistory: '90d',
        backupPolicyRef: 'test',
        dedicatedCloudEligible: false,
        supportLevelRef: 'test',
      },
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
}

async function issueCsrf(baseUrl, jar) {
  const response = await fetchJson(baseUrl, 'POST', API_AUTH_CSRF_PATH, {}, {}, jar);
  expect(response.status).toBe(200);
  return response.body.data.csrfToken;
}

let idempCounter = 0;
async function postJson(baseUrl, jar, method, path, body, idempotencyKey) {
  const headers = { [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar) };
  headers[API_IDEMPOTENCY_KEY_HEADER] = idempotencyKey ?? `test-idemp-${++idempCounter}`;
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
