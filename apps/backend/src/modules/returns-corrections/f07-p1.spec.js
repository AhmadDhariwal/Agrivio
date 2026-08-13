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
  API_RETURNS_PATH,
  API_SALES_PATH,
  API_USERS_PATH,
  API_WAREHOUSES_PATH,
} from '@agrivio/api-contracts';
import { createServer } from 'node:http';
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

describe('F07 P1 linked sales returns, without-invoice, and resolution', () => {
  it('posts linked and without-invoice returns with Frozen qty, batch, refund, and permission proofs', async () => {
    const { server, baseUrl, jar, app } = await boot();

    try {
      await seedPlan(baseUrl, jar);
      const owner = await createApprovedOwner(baseUrl, jar, {
        organizationName: 'F07P1 Org',
        ownerEmail: 'f07p1-owner@example.com',
        password: 'a-strong-passphrase',
      });
      const session = await login(baseUrl, jar, 'f07p1-owner@example.com', 'a-strong-passphrase');
      const actorId = session.user.id;
      const organizationId = owner.organizationId;

      const branch = await postJson(baseUrl, jar, 'POST', API_BRANCHES_PATH, {
        name: 'F07 Branch',
        invoicePrefix: 'F7A',
      });
      expect(branch.status).toBe(201);

      const warehouse = await postJson(baseUrl, jar, 'POST', API_WAREHOUSES_PATH, { name: 'F07 WH' });
      expect(warehouse.status).toBe(201);

      const cash = await postJson(baseUrl, jar, 'POST', API_ACCOUNTS_PATH, {
        name: 'F07 Cash',
        accountType: 'cash',
      });
      expect(cash.status).toBe(201);
      await postJson(
        baseUrl,
        jar,
        'POST',
        `${API_ACCOUNTS_PATH}/${cash.body.data.id}/opening-balance`,
        { amount: { amount: '50000.00', currency: 'PKR' } },
        'f07-cash-open',
      );

      const jazzcash = await postJson(baseUrl, jar, 'POST', API_ACCOUNTS_PATH, {
        name: 'F07 JazzCash',
        accountType: 'jazzcash',
        walletIdentifier: '03001234567',
      });
      expect(jazzcash.status).toBe(201);
      await postJson(
        baseUrl,
        jar,
        'POST',
        `${API_ACCOUNTS_PATH}/${jazzcash.body.data.id}/opening-balance`,
        { amount: { amount: '20000.00', currency: 'PKR' } },
        'f07-jazz-open',
      );

      const category = await postJson(baseUrl, jar, 'POST', API_PRODUCT_CATEGORIES_PATH, {
        name: 'F07 Cat',
        productClass: 'general',
      });
      expect(category.status).toBe(201);

      const product = await postJson(baseUrl, jar, 'POST', API_PRODUCTS_PATH, {
        name: 'F07 Seed',
        categoryId: category.body.data.id,
        trackingMode: 'none',
        baseUnitCode: 'KG',
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
          productId: product.body.data.id,
          quantity: '100',
          inventoryValue: { amount: '5000.00', currency: 'PKR' },
        },
        'f07-seed-stock',
      );

      const batchProduct = await postJson(baseUrl, jar, 'POST', API_PRODUCTS_PATH, {
        name: 'F07 Batch Seed',
        categoryId: category.body.data.id,
        trackingMode: 'batch_expiry',
        baseUnitCode: 'KG',
        measurementDimension: 'mass',
      });
      expect(batchProduct.status).toBe(201);
      await postJson(
        baseUrl,
        jar,
        'PUT',
        `${API_PRODUCTS_PATH}/${batchProduct.body.data.id}/prices`,
        {
          expectedVersion: batchProduct.body.data.version,
          items: [{ priceTier: 'retail', price: { amount: '40.00', currency: 'PKR' } }],
        },
      );
      await postJson(
        baseUrl,
        jar,
        'POST',
        API_INVENTORY_OPENING_STOCK_PATH,
        {
          warehouseId: warehouse.body.data.id,
          productId: batchProduct.body.data.id,
          quantity: '10',
          inventoryValue: { amount: '400.00', currency: 'PKR' },
          batchNumber: 'LOT-A',
          expiryDate: '2027-01-01',
        },
        'f07-lot-a',
      );

      const customer = await postJson(baseUrl, jar, 'POST', API_CUSTOMERS_PATH, {
        name: 'F07 Farmer',
        customerType: 'farmer',
        phone: '03007654321',
        creditEnabled: true,
        creditLimit: { amount: '100000.00', currency: 'PKR' },
        creditLimitBehaviour: 'warning',
      });
      expect(customer.status).toBe(201);

      const saleDraftBody = {
        branchId: branch.body.data.id,
        warehouseId: warehouse.body.data.id,
        customerId: customer.body.data.id,
        saleDate: '2026-08-13',
        lines: [
          {
            productId: product.body.data.id,
            quantity: '10',
            unitPrice: { amount: '90.00', currency: 'PKR' },
          },
        ],
      };

      const creditDraft = await postJson(baseUrl, jar, 'POST', API_SALES_PATH, saleDraftBody);
      expect(creditDraft.status).toBe(201);
      const creditPost = await postJson(
        baseUrl,
        jar,
        'POST',
        `${API_SALES_PATH}/${creditDraft.body.data.id}/post`,
        { expectedVersion: creditDraft.body.data.version, payments: [] },
        'f07-credit-sale',
      );
      expect(creditPost.status).toBe(200);
      expect(creditPost.body.data.saleTotal.amount).toBe('900.00');
      const originalInvoice = creditPost.body.data.invoiceNumber;
      const originalLineQty = creditPost.body.data.lines[0].quantity;

      const partialDraft = await postJson(
        baseUrl,
        jar,
        'POST',
        `${API_SALES_PATH}/${creditPost.body.data.id}/returns`,
        {
          lines: [
            {
              originalLineIndex: 0,
              quantity: '4',
              stockCondition: 'sellable',
            },
          ],
        },
      );
      expect(partialDraft.status).toBe(201);

      const partialPost = await postJson(
        baseUrl,
        jar,
        'POST',
        `${API_RETURNS_PATH}/${partialDraft.body.data.id}/post`,
        {
          expectedVersion: partialDraft.body.data.version,
          reason: 'Partial linked return of good stock',
          resolution: 'ledger_adjustment',
        },
        'f07-partial-ledger',
      );
      expect(partialPost.status).toBe(200);
      expect(partialPost.body.data.status).toBe('posted');
      expect(partialPost.body.data.returnTotal.amount).toBe('360.00');

      const saleAfterPartial = await fetchJson(
        baseUrl,
        'GET',
        `${API_SALES_PATH}/${creditPost.body.data.id}`,
        null,
        {},
        jar,
      );
      expect(saleAfterPartial.status).toBe(200);
      expect(saleAfterPartial.body.data.status).toBe('posted');
      expect(saleAfterPartial.body.data.invoiceNumber).toBe(originalInvoice);
      expect(saleAfterPartial.body.data.lines[0].quantity).toBe(originalLineQty);
      expect(saleAfterPartial.body.data.saleTotal.amount).toBe('900.00');

      const balancesAfterPartial = await fetchJson(
        baseUrl,
        'GET',
        API_INVENTORY_BALANCES_PATH,
        null,
        {},
        jar,
      );
      const seedBalance = balancesAfterPartial.body.data.items.find(
        (item) => item.productId === product.body.data.id && !item.batchId,
      );
      expect(seedBalance.quantityBase).toBe('94.0000');

      const movementsAfterPartial = await fetchJson(
        baseUrl,
        'GET',
        API_INVENTORY_MOVEMENTS_PATH,
        null,
        {},
        jar,
      );
      const sellableReturnMoves = movementsAfterPartial.body.data.items.filter(
        (item) =>
          item.sourceType === 'sales_return' &&
          item.sourceId === partialPost.body.data.id &&
          item.direction === 'inbound',
      );
      expect(sellableReturnMoves).toHaveLength(1);
      expect(sellableReturnMoves[0].quantityBase).toBe('4.0000');
      expect(sellableReturnMoves[0].stockCondition).toBe('sellable');

      const ledgerAfterPartial = await fetchJson(
        baseUrl,
        'GET',
        `${API_CUSTOMERS_PATH}/${customer.body.data.id}/ledger`,
        null,
        {},
        jar,
      );
      const ledgerReturn = ledgerAfterPartial.body.data.items.find(
        (item) => item.sourceType === 'sales_return' && item.sourceId === partialPost.body.data.id,
      );
      expect(ledgerReturn.signedAmount.amount).toBe('-360.00');

      const cashMovesAfterPartial = await fetchJson(
        baseUrl,
        'GET',
        `${API_ACCOUNTS_PATH}/${cash.body.data.id}/movements`,
        null,
        {},
        jar,
      );
      expect(
        cashMovesAfterPartial.body.data.items.some(
          (item) => item.sourceType === 'sales_return_refund',
        ),
      ).toBe(false);

      const overCapDraft = await postJson(
        baseUrl,
        jar,
        'POST',
        `${API_SALES_PATH}/${creditPost.body.data.id}/returns`,
        {
          lines: [{ originalLineIndex: 0, quantity: '7', stockCondition: 'sellable' }],
        },
      );
      expect(overCapDraft.status).toBe(201);
      const overCapPost = await postJson(
        baseUrl,
        jar,
        'POST',
        `${API_RETURNS_PATH}/${overCapDraft.body.data.id}/post`,
        {
          expectedVersion: overCapDraft.body.data.version,
          reason: 'Exceed remaining',
          resolution: 'ledger_adjustment',
        },
        'f07-over-cap',
      );
      expect(overCapPost.status).toBe(400);

      const unsellableDraft = await postJson(
        baseUrl,
        jar,
        'POST',
        `${API_SALES_PATH}/${creditPost.body.data.id}/returns`,
        {
          lines: [
            {
              originalLineIndex: 0,
              quantity: '6',
              stockCondition: 'unsellable',
              unsellableReason: 'damaged',
            },
          ],
        },
      );
      expect(unsellableDraft.status).toBe(201);
      const unsellablePost = await postJson(
        baseUrl,
        jar,
        'POST',
        `${API_RETURNS_PATH}/${unsellableDraft.body.data.id}/post`,
        {
          expectedVersion: unsellableDraft.body.data.version,
          reason: 'Damaged remainder',
          resolution: 'ledger_adjustment',
          lines: [{ originalLineIndex: 0, stockCondition: 'unsellable', unsellableReason: 'damaged' }],
        },
        'f07-unsellable-ledger',
      );
      expect(unsellablePost.status).toBe(200);
      expect(unsellablePost.body.data.returnTotal.amount).toBe('540.00');

      const balancesAfterUnsellable = await fetchJson(
        baseUrl,
        'GET',
        API_INVENTORY_BALANCES_PATH,
        null,
        {},
        jar,
      );
      const seedAfterUnsellable = balancesAfterUnsellable.body.data.items.find(
        (item) => item.productId === product.body.data.id && !item.batchId,
      );
      expect(seedAfterUnsellable.quantityBase).toBe('94.0000');
      expect(seedAfterUnsellable.unsellableQuantityBase).toBe('6.0000');

      const paidDraft = await postJson(baseUrl, jar, 'POST', API_SALES_PATH, {
        ...saleDraftBody,
        lines: [
          {
            productId: product.body.data.id,
            quantity: '2',
            unitPrice: { amount: '90.00', currency: 'PKR' },
          },
        ],
      });
      expect(paidDraft.status).toBe(201);
      const paidPost = await postJson(
        baseUrl,
        jar,
        'POST',
        `${API_SALES_PATH}/${paidDraft.body.data.id}/post`,
        {
          expectedVersion: paidDraft.body.data.version,
          payments: [{ accountId: cash.body.data.id, amount: { amount: '180.00', currency: 'PKR' } }],
        },
        'f07-paid-sale',
      );
      expect(paidPost.status).toBe(200);

      const cashRefundDraft = await postJson(
        baseUrl,
        jar,
        'POST',
        `${API_SALES_PATH}/${paidPost.body.data.id}/returns`,
        {
          lines: [{ originalLineIndex: 0, quantity: '2', stockCondition: 'sellable' }],
        },
      );
      expect(cashRefundDraft.status).toBe(201);
      const cashRefundPost = await postJson(
        baseUrl,
        jar,
        'POST',
        `${API_RETURNS_PATH}/${cashRefundDraft.body.data.id}/post`,
        {
          expectedVersion: cashRefundDraft.body.data.version,
          reason: 'Full cash refund',
          resolution: 'account_refund',
          refundAccountId: cash.body.data.id,
        },
        'f07-cash-refund',
      );
      expect(cashRefundPost.status).toBe(200);
      expect(cashRefundPost.body.data.returnTotal.amount).toBe('180.00');

      const replayRefund = await postJson(
        baseUrl,
        jar,
        'POST',
        `${API_RETURNS_PATH}/${cashRefundDraft.body.data.id}/post`,
        {
          expectedVersion: cashRefundDraft.body.data.version,
          reason: 'Full cash refund',
          resolution: 'account_refund',
          refundAccountId: cash.body.data.id,
        },
        'f07-cash-refund',
      );
      expect(replayRefund.status).toBe(200);
      expect(replayRefund.body.data.id).toBe(cashRefundPost.body.data.id);

      const cashMoves = await fetchJson(
        baseUrl,
        'GET',
        `${API_ACCOUNTS_PATH}/${cash.body.data.id}/movements`,
        null,
        {},
        jar,
      );
      const refundMoves = cashMoves.body.data.items.filter(
        (item) =>
          item.sourceType === 'sales_return_refund' && item.sourceId === cashRefundPost.body.data.id,
      );
      expect(refundMoves).toHaveLength(1);
      expect(refundMoves[0].signedAmount.amount).toBe('-180.00');

      const ledgerAfterCash = await fetchJson(
        baseUrl,
        'GET',
        `${API_CUSTOMERS_PATH}/${customer.body.data.id}/ledger`,
        null,
        {},
        jar,
      );
      expect(
        ledgerAfterCash.body.data.items.some(
          (item) =>
            item.sourceType === 'sales_return' && item.sourceId === cashRefundPost.body.data.id,
        ),
      ).toBe(false);

      const batchDraft = await postJson(baseUrl, jar, 'POST', API_SALES_PATH, {
        branchId: branch.body.data.id,
        warehouseId: warehouse.body.data.id,
        customerId: customer.body.data.id,
        saleDate: '2026-08-13',
        lines: [
          {
            productId: batchProduct.body.data.id,
            quantity: '3',
            unitPrice: { amount: '40.00', currency: 'PKR' },
          },
        ],
      });
      expect(batchDraft.status).toBe(201);
      const batchSale = await postJson(
        baseUrl,
        jar,
        'POST',
        `${API_SALES_PATH}/${batchDraft.body.data.id}/post`,
        { expectedVersion: batchDraft.body.data.version, payments: [] },
        'f07-batch-sale',
      );
      expect(batchSale.status).toBe(200);
      const soldBatchId = batchSale.body.data.lines[0].stockAllocations[0].batchId;
      expect(soldBatchId).toBeTruthy();

      const wrongBatchDraft = await postJson(
        baseUrl,
        jar,
        'POST',
        `${API_SALES_PATH}/${batchSale.body.data.id}/returns`,
        {
          lines: [
            {
              originalLineIndex: 0,
              quantity: '1',
              batchId: 'unrelated-batch-id',
              stockCondition: 'sellable',
            },
          ],
        },
      );
      expect(wrongBatchDraft.status).toBe(400);

      const rightBatchDraft = await postJson(
        baseUrl,
        jar,
        'POST',
        `${API_SALES_PATH}/${batchSale.body.data.id}/returns`,
        {
          lines: [
            {
              originalLineIndex: 0,
              quantity: '1',
              batchId: soldBatchId,
              stockCondition: 'sellable',
            },
          ],
        },
      );
      expect(rightBatchDraft.status).toBe(201);
      const rightBatchPost = await postJson(
        baseUrl,
        jar,
        'POST',
        `${API_RETURNS_PATH}/${rightBatchDraft.body.data.id}/post`,
        {
          expectedVersion: rightBatchDraft.body.data.version,
          reason: 'Restore original lot',
          resolution: 'ledger_adjustment',
        },
        'f07-right-batch',
      );
      expect(rightBatchPost.status).toBe(200);
      const batchMoves = await fetchJson(baseUrl, 'GET', API_INVENTORY_MOVEMENTS_PATH, null, {}, jar);
      const restored = batchMoves.body.data.items.find(
        (item) => item.sourceId === rightBatchPost.body.data.id,
      );
      expect(restored.batchId).toBe(soldBatchId);
      expect(restored.quantityBase).toBe('1.0000');

      const genericReturn = await postJson(baseUrl, jar, 'POST', API_RETURNS_PATH, {
        lines: [{ originalLineIndex: 0, quantity: '1' }],
      });
      expect(genericReturn.status).toBe(400);

      const withoutDraft = await postJson(baseUrl, jar, 'POST', `${API_RETURNS_PATH}/without-invoice`, {
        warehouseId: warehouse.body.data.id,
        customerIdentifyingName: 'Walk-in Rasheed',
        customerIdentifyingPhone: '03009998877',
        lines: [
          {
            productId: product.body.data.id,
            quantity: '1',
            stockCondition: 'sellable',
          },
        ],
      });
      expect(withoutDraft.status).toBe(201);

      const serviceAuth = (permissions) => ({
        userId: actorId,
        organizationId,
        contextType: 'organization',
        role: 'Owner',
        permissions,
      });

      await expect(
        app.agrivio.returns.returnsService.postReturn(
          organizationId,
          withoutDraft.body.data.id,
          {
            expectedVersion: withoutDraft.body.data.version,
            reason: 'Approved without base permission',
            resolution: 'account_refund',
            refundAccountId: jazzcash.body.data.id,
            approvedReturnValue: { amount: '50.00', currency: 'PKR' },
          },
          serviceAuth(['returns.without-invoice.approve']),
          'f07-approve-only',
        ),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });

      await expect(
        app.agrivio.returns.returnsService.postReturn(
          organizationId,
          withoutDraft.body.data.id,
          {
            expectedVersion: withoutDraft.body.data.version,
            reason: 'Posted without approval permission',
            resolution: 'account_refund',
            refundAccountId: jazzcash.body.data.id,
            approvedReturnValue: { amount: '50.00', currency: 'PKR' },
          },
          serviceAuth(['returns.post']),
          'f07-post-only',
        ),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });

      const withoutPost = await postJson(
        baseUrl,
        jar,
        'POST',
        `${API_RETURNS_PATH}/${withoutDraft.body.data.id}/post`,
        {
          expectedVersion: withoutDraft.body.data.version,
          reason: 'Customer returned seed without invoice',
          resolution: 'account_refund',
          refundAccountId: jazzcash.body.data.id,
          approvedReturnValue: { amount: '50.00', currency: 'PKR' },
        },
        'f07-without-invoice',
      );
      expect(withoutPost.status).toBe(200);
      expect(withoutPost.body.data.withoutInvoiceApproval.reason).toBe(
        'Customer returned seed without invoice',
      );
      expect(withoutPost.body.data.withoutInvoiceApproval.approvedBy).toBe(actorId);
      expect(withoutPost.body.data.returnTotal.amount).toBe('50.00');

      const jazzMoves = await fetchJson(
        baseUrl,
        'GET',
        `${API_ACCOUNTS_PATH}/${jazzcash.body.data.id}/movements`,
        null,
        {},
        jar,
      );
      const digitalRefund = jazzMoves.body.data.items.filter(
        (item) =>
          item.sourceType === 'sales_return_refund' && item.sourceId === withoutPost.body.data.id,
      );
      expect(digitalRefund).toHaveLength(1);
      expect(digitalRefund[0].signedAmount.amount).toBe('-50.00');

      const cashier = await postJson(baseUrl, jar, 'POST', API_USERS_PATH, {
        email: 'f07p1-cashier@example.com',
        displayName: 'F07 Cashier',
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
      await login(baseUrl, jar, 'f07p1-cashier@example.com', 'a-strong-passphrase');
      const cashierWithout = await postJson(
        baseUrl,
        jar,
        'POST',
        `${API_RETURNS_PATH}/without-invoice`,
        {
          warehouseId: warehouse.body.data.id,
          customerIdentifyingName: 'Cashier attempt',
          lines: [
            { productId: product.body.data.id, quantity: '1', stockCondition: 'sellable' },
          ],
        },
      );
      expect(cashierWithout.status).toBe(403);

      await postJson(baseUrl, jar, 'POST', API_AUTH_LOGOUT_PATH, {});
      const other = await createApprovedOwner(baseUrl, jar, {
        organizationName: 'F07P1 Other Org',
        ownerEmail: 'f07p1-other@example.com',
        password: 'a-strong-passphrase',
      });
      void other;
      await login(baseUrl, jar, 'f07p1-other@example.com', 'a-strong-passphrase');
      const crossSale = await postJson(
        baseUrl,
        jar,
        'POST',
        `${API_SALES_PATH}/${creditPost.body.data.id}/returns`,
        {
          lines: [{ originalLineIndex: 0, quantity: '1', stockCondition: 'sellable' }],
        },
      );
      expect([400, 404, 409]).toContain(crossSale.status);

      const otherWarehouse = await postJson(baseUrl, jar, 'POST', API_WAREHOUSES_PATH, {
        name: 'Other WH',
      });
      expect(otherWarehouse.status).toBe(201);
      const crossProduct = await postJson(baseUrl, jar, 'POST', `${API_RETURNS_PATH}/without-invoice`, {
        warehouseId: otherWarehouse.body.data.id,
        customerIdentifyingName: 'Cross org',
        lines: [
          { productId: product.body.data.id, quantity: '1', stockCondition: 'sellable' },
        ],
      });
      expect([400, 404]).toContain(crossProduct.status);

      const otherCash = await postJson(baseUrl, jar, 'POST', API_ACCOUNTS_PATH, {
        name: 'Other Cash',
        accountType: 'cash',
      });
      expect(otherCash.status).toBe(201);
      const crossAccount = await postJson(
        baseUrl,
        jar,
        'POST',
        `${API_SALES_PATH}/${creditPost.body.data.id}/returns`,
        {
          lines: [{ originalLineIndex: 0, quantity: '1', stockCondition: 'sellable' }],
        },
      );
      expect([400, 404, 409]).toContain(crossAccount.status);
      void cash.body.data.id;
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
        '/sales/persistence/',
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
