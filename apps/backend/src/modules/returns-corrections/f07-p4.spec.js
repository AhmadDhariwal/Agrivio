import { describe, expect, it } from 'vitest';
import {
  API_AUTH_CSRF_PATH,
  API_AUTH_LOGIN_PATH,
  API_AUTH_LOGOUT_PATH,
  API_ACCOUNTS_PATH,
  API_ACCOUNT_TRANSACTIONS_PATH,
  API_ACCOUNT_TRANSFERS_PATH,
  API_BRANCHES_PATH,
  API_CSRF_HEADER,
  API_CUSTOMERS_PATH,
  API_EXPENSE_CATEGORIES_PATH,
  API_EXPENSES_PATH,
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
  API_PURCHASES_PATH,
  API_RETURNS_PATH,
  API_SALES_PATH,
  API_SUPPLIERS_PATH,
  API_WAREHOUSES_PATH,
} from '@agrivio/api-contracts';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
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

describe('F07 P4 stage-exit reconciliation', () => {
  it('reconciles sales-return stock, refund/ledger, reversal netting, and purchase-return compatibility', async () => {
    const { server, baseUrl, jar } = await boot();
    try {
      await seedPlan(baseUrl, jar);
      const owner = await createApprovedOwner(baseUrl, jar, {
        organizationName: 'F07P4 Returns Org',
        ownerEmail: 'f07p4-returns@example.com',
        password: 'a-strong-passphrase',
      });
      await login(baseUrl, jar, 'f07p4-returns@example.com', 'a-strong-passphrase');

      const branch = await postJson(baseUrl, jar, 'POST', API_BRANCHES_PATH, {
        name: 'F07P4 Branch',
        invoicePrefix: 'F74',
      });
      expect(branch.status).toBe(201);
      const warehouse = await postJson(baseUrl, jar, 'POST', API_WAREHOUSES_PATH, {
        name: 'F07P4 WH',
      });
      expect(warehouse.status).toBe(201);
      const cash = await postJson(baseUrl, jar, 'POST', API_ACCOUNTS_PATH, {
        name: 'F07P4 Cash',
        accountType: 'cash',
      });
      expect(cash.status).toBe(201);
      await postJson(
        baseUrl,
        jar,
        'POST',
        `${API_ACCOUNTS_PATH}/${cash.body.data.id}/opening-balance`,
        { amount: { amount: '1000.00', currency: 'PKR' } },
        'f07p4-cash-open',
      );
      const category = await postJson(baseUrl, jar, 'POST', API_PRODUCT_CATEGORIES_PATH, {
        name: 'F07P4 Cat',
        productClass: 'general',
      });
      expect(category.status).toBe(201);
      const product = await postJson(baseUrl, jar, 'POST', API_PRODUCTS_PATH, {
        name: 'F07P4 Seed',
        categoryId: category.body.data.id,
        trackingMode: 'none',
        baseUnitCode: 'EA',
        measurementDimension: 'mass',
      });
      expect(product.status).toBe(201);
      await postJson(baseUrl, jar, 'PUT', `${API_PRODUCTS_PATH}/${product.body.data.id}/prices`, {
        expectedVersion: product.body.data.version,
        items: [{ priceTier: 'retail', price: { amount: '100.00', currency: 'PKR' } }],
      });
      await postJson(
        baseUrl,
        jar,
        'POST',
        API_INVENTORY_OPENING_STOCK_PATH,
        {
          warehouseId: warehouse.body.data.id,
          productId: product.body.data.id,
          quantity: '50',
          inventoryValue: { amount: '2500.00', currency: 'PKR' },
        },
        'f07p4-opening',
      );
      const customer = await postJson(baseUrl, jar, 'POST', API_CUSTOMERS_PATH, {
        name: 'F07P4 Farmer',
        customerType: 'farmer',
        phone: '03001112233',
        creditEnabled: true,
        creditLimit: { amount: '100000.00', currency: 'PKR' },
        creditLimitBehaviour: 'warning',
      });
      expect(customer.status).toBe(201);

      const cashSaleDraft = await postJson(baseUrl, jar, 'POST', API_SALES_PATH, {
        branchId: branch.body.data.id,
        warehouseId: warehouse.body.data.id,
        customerId: customer.body.data.id,
        saleDate: '2026-08-13',
        lines: [
          {
            productId: product.body.data.id,
            quantity: '2',
            unitPrice: { amount: '100.00', currency: 'PKR' },
          },
        ],
      });
      expect(cashSaleDraft.status).toBe(201);
      const cashSale = await postJson(
        baseUrl,
        jar,
        'POST',
        `${API_SALES_PATH}/${cashSaleDraft.body.data.id}/post`,
        {
          expectedVersion: cashSaleDraft.body.data.version,
          payments: [{ accountId: cash.body.data.id, amount: { amount: '200.00', currency: 'PKR' } }],
        },
        'f07p4-cash-sale',
      );
      expect(cashSale.status).toBe(200);

      const overQtyDraft = await postJson(baseUrl, jar, 'POST', `${API_SALES_PATH}/${cashSale.body.data.id}/returns`, {
        lines: [{ originalLineIndex: 0, quantity: '3', stockCondition: 'sellable' }],
      });
      expect(overQtyDraft.status).toBe(201);
      const overQtyPost = await postJson(
        baseUrl,
        jar,
        'POST',
        `${API_RETURNS_PATH}/${overQtyDraft.body.data.id}/post`,
        {
          expectedVersion: overQtyDraft.body.data.version,
          reason: 'Too many',
          resolution: 'account_refund',
          refundAccountId: cash.body.data.id,
        },
        'f07p4-over-qty',
      );
      expect(overQtyPost.status).toBe(400);

      const returnDraft = await postJson(baseUrl, jar, 'POST', `${API_SALES_PATH}/${cashSale.body.data.id}/returns`, {
        lines: [{ originalLineIndex: 0, quantity: '1', stockCondition: 'sellable' }],
      });
      expect(returnDraft.status).toBe(201);
      const postedReturn = await postJson(
        baseUrl,
        jar,
        'POST',
        `${API_RETURNS_PATH}/${returnDraft.body.data.id}/post`,
        {
          expectedVersion: returnDraft.body.data.version,
          reason: 'Linked cash refund return',
          resolution: 'account_refund',
          refundAccountId: cash.body.data.id,
        },
        'f07p4-linked-return',
      );
      expect(postedReturn.status).toBe(200);
      expect(postedReturn.body.data.status).toBe('posted');

      const stockAfterReturn = await productBalance(baseUrl, jar, product.body.data.id);
      expect(stockAfterReturn.quantityBase).toBe('49.0000');
      expect(stockAfterReturn.unsellableQuantityBase).toBe('0.0000');

      const cashAfterReturn = await fetchJson(
        baseUrl,
        'GET',
        `${API_ACCOUNTS_PATH}/${cash.body.data.id}`,
        null,
        {},
        jar,
      );
      expect(cashAfterReturn.body.data.derivedBalances.balance.amount).toBe('1100.00');
      const movementsAfterReturn = await fetchJson(
        baseUrl,
        'GET',
        `${API_ACCOUNTS_PATH}/${cash.body.data.id}/movements`,
        null,
        {},
        jar,
      );
      expect(sumSigned(movementsAfterReturn.body.data.items).toFixed(2)).toBe('1100.00');

      const immutableSale = await fetchJson(
        baseUrl,
        'GET',
        `${API_SALES_PATH}/${cashSale.body.data.id}`,
        null,
        {},
        jar,
      );
      expect(immutableSale.body.data.status).toBe('posted');
      expect(immutableSale.body.data.saleTotal.amount).toBe('200.00');
      expect(immutableSale.body.data.lines[0].quantity).toBe('2.0000');

      const reversed = await postJson(
        baseUrl,
        jar,
        'POST',
        `${API_RETURNS_PATH}/${postedReturn.body.data.id}/reverse`,
        { expectedVersion: postedReturn.body.data.version, reason: 'Reverse linked return' },
        'f07p4-linked-reverse',
      );
      expect(reversed.status).toBe(200);
      expect(reversed.body.data.status).toBe('reversed');
      expect(reversed.body.data.reversedByCorrectiveTransactionId).toBeTruthy();
      expect(reversed.body.data.reason).toBe('Linked cash refund return');
      expect(reversed.body.data.returnTotal.amount).toBe(postedReturn.body.data.returnTotal.amount);

      const stockAfterReverse = await productBalance(baseUrl, jar, product.body.data.id);
      expect(stockAfterReverse.quantityBase).toBe('48.0000');
      const cashAfterReverse = await fetchJson(
        baseUrl,
        'GET',
        `${API_ACCOUNTS_PATH}/${cash.body.data.id}`,
        null,
        {},
        jar,
      );
      expect(cashAfterReverse.body.data.derivedBalances.balance.amount).toBe('1200.00');

      const stockMoves = await fetchJson(baseUrl, 'GET', API_INVENTORY_MOVEMENTS_PATH, null, {}, jar);
      const originalStock = stockMoves.body.data.items.filter(
        (item) => item.sourceType === 'sales_return' && item.sourceId === postedReturn.body.data.id,
      );
      const reversalStock = stockMoves.body.data.items.filter(
        (item) =>
          item.sourceType === 'sales_return_reversal' &&
          item.sourceId === reversed.body.data.reversedByCorrectiveTransactionId,
      );
      expect(originalStock).toHaveLength(1);
      expect(reversalStock).toHaveLength(1);
      expect(reversalStock[0].quantityBase).toBe(originalStock[0].quantityBase);
      expect(reversalStock[0].direction).toBe('outbound');
      expect(originalStock[0].direction).toBe('inbound');

      const doubleReverse = await postJson(
        baseUrl,
        jar,
        'POST',
        `${API_RETURNS_PATH}/${postedReturn.body.data.id}/reverse`,
        { expectedVersion: reversed.body.data.version, reason: 'second reverse' },
        'f07p4-double-reverse',
      );
      expect(doubleReverse.status).toBe(409);

      const creditDraft = await postJson(baseUrl, jar, 'POST', API_SALES_PATH, {
        branchId: branch.body.data.id,
        warehouseId: warehouse.body.data.id,
        customerId: customer.body.data.id,
        saleDate: '2026-08-13',
        lines: [
          {
            productId: product.body.data.id,
            quantity: '4',
            unitPrice: { amount: '100.00', currency: 'PKR' },
          },
        ],
      });
      const creditSale = await postJson(
        baseUrl,
        jar,
        'POST',
        `${API_SALES_PATH}/${creditDraft.body.data.id}/post`,
        { expectedVersion: creditDraft.body.data.version, payments: [] },
        'f07p4-credit-sale',
      );
      expect(creditSale.status).toBe(200);
      const unsellableDraft = await postJson(
        baseUrl,
        jar,
        'POST',
        `${API_SALES_PATH}/${creditSale.body.data.id}/returns`,
        {
          lines: [
            {
              originalLineIndex: 0,
              quantity: '1',
              stockCondition: 'unsellable',
              unsellableReason: 'damaged',
            },
          ],
        },
      );
      const unsellablePost = await postJson(
        baseUrl,
        jar,
        'POST',
        `${API_RETURNS_PATH}/${unsellableDraft.body.data.id}/post`,
        {
          expectedVersion: unsellableDraft.body.data.version,
          reason: 'Damaged',
          resolution: 'ledger_adjustment',
        },
        'f07p4-unsellable',
      );
      expect(unsellablePost.status).toBe(200);
      const afterUnsellable = await productBalance(baseUrl, jar, product.body.data.id);
      expect(afterUnsellable.unsellableQuantityBase).toBe('1.0000');
      const sellableAfterUnsellable = Number(afterUnsellable.quantityBase);
      const unsellableReverse = await postJson(
        baseUrl,
        jar,
        'POST',
        `${API_RETURNS_PATH}/${unsellablePost.body.data.id}/reverse`,
        { expectedVersion: unsellablePost.body.data.version, reason: 'Undo unsellable' },
        'f07p4-unsellable-reverse',
      );
      expect(unsellableReverse.status).toBe(200);
      const afterUnsellableReverse = await productBalance(baseUrl, jar, product.body.data.id);
      expect(afterUnsellableReverse.unsellableQuantityBase).toBe('0.0000');
      expect(Number(afterUnsellableReverse.quantityBase)).toBe(sellableAfterUnsellable);

      const supplier = await postJson(baseUrl, jar, 'POST', API_SUPPLIERS_PATH, {
        name: 'F07P4 Supplier',
        phone: '03009998877',
      });
      expect(supplier.status).toBe(201);
      const purchaseDraft = await postJson(baseUrl, jar, 'POST', API_PURCHASES_PATH, {
        warehouseId: warehouse.body.data.id,
        supplierId: supplier.body.data.id,
        purchaseDate: '2026-08-13',
        lines: [
          {
            productId: product.body.data.id,
            quantity: '10',
            unitCost: { amount: '50.00', currency: 'PKR' },
          },
        ],
        landedCosts: { freight: { amount: '0.00', currency: 'PKR' } },
      });
      const postedPurchase = await postJson(
        baseUrl,
        jar,
        'POST',
        `${API_PURCHASES_PATH}/${purchaseDraft.body.data.id}/post`,
        { expectedVersion: purchaseDraft.body.data.version, payments: [] },
        'f07p4-purchase',
      );
      expect(postedPurchase.status).toBe(200);
      const purchaseReturnDraft = await postJson(
        baseUrl,
        jar,
        'POST',
        `${API_PURCHASES_PATH}/${postedPurchase.body.data.id}/returns`,
        { lines: [{ originalLineIndex: 0, quantity: '2' }] },
      );
      const postedPurchaseReturn = await postJson(
        baseUrl,
        jar,
        'POST',
        `${API_RETURNS_PATH}/${purchaseReturnDraft.body.data.id}/post`,
        {
          expectedVersion: purchaseReturnDraft.body.data.version,
          reason: 'Quality',
          resolution: 'ledger_adjustment',
        },
        'f07p4-purchase-return',
      );
      expect(postedPurchaseReturn.status).toBe(200);
      const purchaseReversed = await postJson(
        baseUrl,
        jar,
        'POST',
        `${API_RETURNS_PATH}/${postedPurchaseReturn.body.data.id}/reverse`,
        { expectedVersion: postedPurchaseReturn.body.data.version, reason: 'Undo purchase return' },
        'f07p4-purchase-reverse',
      );
      expect(purchaseReversed.status).toBe(200);
      expect(purchaseReversed.body.data.reversedByCorrectiveTransactionId).toBeTruthy();
      const supplierLedger = await fetchJson(
        baseUrl,
        'GET',
        `${API_SUPPLIERS_PATH}/${supplier.body.data.id}/ledger`,
        null,
        {},
        jar,
      );
      const purchaseReturnEffect = supplierLedger.body.data.items.find(
        (item) =>
          item.sourceType === 'purchase_return' &&
          item.sourceId === postedPurchaseReturn.body.data.id,
      );
      const purchaseReturnReversal = supplierLedger.body.data.items.find(
        (item) =>
          item.sourceType === 'purchase_return_reversal' &&
          item.sourceId === purchaseReversed.body.data.reversedByCorrectiveTransactionId,
      );
      expect(purchaseReturnEffect).toBeTruthy();
      expect(purchaseReturnReversal).toBeTruthy();
      expect(purchaseReturnReversal.signedAmount.amount).toBe(
        String((-Number(purchaseReturnEffect.signedAmount.amount)).toFixed(2)),
      );

      const generic = await postJson(
        baseUrl,
        jar,
        'POST',
        '/api/v1/corrective-transactions',
        { reason: 'nope' },
        'f07p4-generic',
      );
      expect(generic.status).toBe(404);
      void owner.organizationId;
    } finally {
      await close(server);
    }
  }, 180000);

  it('reconciles manual inflow/outflow, two-sided transfers, expenses, and corrections', async () => {
    const { server, baseUrl, jar } = await boot();
    try {
      await seedPlan(baseUrl, jar);
      await createApprovedOwner(baseUrl, jar, {
        organizationName: 'F07P4 Accounts Org',
        ownerEmail: 'f07p4-accounts@example.com',
        password: 'a-strong-passphrase',
      });
      await login(baseUrl, jar, 'f07p4-accounts@example.com', 'a-strong-passphrase');

      const cash = await postJson(baseUrl, jar, 'POST', API_ACCOUNTS_PATH, {
        name: 'F07P4 Cash',
        accountType: 'cash',
      });
      const bank = await postJson(baseUrl, jar, 'POST', API_ACCOUNTS_PATH, {
        name: 'F07P4 Bank',
        accountType: 'bank',
        bankName: 'HBL',
      });
      await postJson(
        baseUrl,
        jar,
        'POST',
        `${API_ACCOUNTS_PATH}/${cash.body.data.id}/opening-balance`,
        { amount: { amount: '1000.00', currency: 'PKR' } },
        'f07p4-acc-open',
      );

      const inflow = await postJson(
        baseUrl,
        jar,
        'POST',
        API_ACCOUNT_TRANSACTIONS_PATH,
        {
          accountId: cash.body.data.id,
          direction: 'inflow',
          amount: { amount: '250.00', currency: 'PKR' },
          purpose: 'Injection',
        },
        'f07p4-inflow',
      );
      expect(inflow.status).toBe(201);
      const viewed = await fetchJson(
        baseUrl,
        'GET',
        `${API_ACCOUNT_TRANSACTIONS_PATH}/${inflow.body.data.id}`,
        null,
        {},
        jar,
      );
      expect(viewed.status).toBe(200);
      expect(viewed.body.data.signedAmount.amount).toBe('250.00');

      const outflow = await postJson(
        baseUrl,
        jar,
        'POST',
        API_ACCOUNT_TRANSACTIONS_PATH,
        {
          accountId: cash.body.data.id,
          direction: 'outflow',
          amount: { amount: '50.00', currency: 'PKR' },
          purpose: 'Petty',
        },
        'f07p4-outflow',
      );
      expect(outflow.status).toBe(201);
      expect(await derivedBalance(baseUrl, jar, cash.body.data.id)).toBe('1200.00');
      expect(await movementSum(baseUrl, jar, cash.body.data.id)).toBe('1200.00');

      const transfer = await postJson(
        baseUrl,
        jar,
        'POST',
        API_ACCOUNT_TRANSFERS_PATH,
        {
          sourceAccountId: cash.body.data.id,
          destinationAccountId: bank.body.data.id,
          amount: { amount: '100.00', currency: 'PKR' },
        },
        'f07p4-transfer',
      );
      expect(transfer.status).toBe(201);
      expect(transfer.body.data.outboundMovementId).toBeTruthy();
      expect(transfer.body.data.inboundMovementId).toBeTruthy();
      expect(await derivedBalance(baseUrl, jar, cash.body.data.id)).toBe('1100.00');
      expect(await derivedBalance(baseUrl, jar, bank.body.data.id)).toBe('100.00');

      const reversedTransfer = await postJson(
        baseUrl,
        jar,
        'POST',
        `${API_ACCOUNT_TRANSFERS_PATH}/${transfer.body.data.id}/reverse`,
        { reason: 'Undo transfer' },
        'f07p4-transfer-reverse',
      );
      expect(reversedTransfer.status).toBe(200);
      expect(reversedTransfer.body.data.reversalOutboundMovementId).toBeTruthy();
      expect(reversedTransfer.body.data.reversalInboundMovementId).toBeTruthy();
      expect(await derivedBalance(baseUrl, jar, cash.body.data.id)).toBe('1200.00');
      expect(await derivedBalance(baseUrl, jar, bank.body.data.id)).toBe('0.00');
      expect(await movementSum(baseUrl, jar, cash.body.data.id)).toBe('1200.00');
      expect(await movementSum(baseUrl, jar, bank.body.data.id)).toBe('0.00');

      const category = await postJson(baseUrl, jar, 'POST', API_EXPENSE_CATEGORIES_PATH, {
        name: 'Fuel',
      });
      const draft = await postJson(baseUrl, jar, 'POST', API_EXPENSES_PATH, {
        categoryId: category.body.data.id,
        accountId: cash.body.data.id,
        amount: { amount: '80.00', currency: 'PKR' },
        purpose: 'Generator fuel',
        expenseDate: '2026-08-13',
      });
      const postedExpense = await postJson(
        baseUrl,
        jar,
        'POST',
        `${API_EXPENSES_PATH}/${draft.body.data.id}/post`,
        { expectedVersion: draft.body.data.version },
        'f07p4-expense',
      );
      expect(postedExpense.status).toBe(200);
      expect(await derivedBalance(baseUrl, jar, cash.body.data.id)).toBe('1120.00');
      const originalPurpose = postedExpense.body.data.purpose;
      const originalAmount = postedExpense.body.data.amount.amount;

      const corrected = await postJson(
        baseUrl,
        jar,
        'POST',
        `${API_EXPENSES_PATH}/${postedExpense.body.data.id}/correct`,
        { expectedVersion: postedExpense.body.data.version, reason: 'Posted to wrong account period' },
        'f07p4-expense-correct',
      );
      expect(corrected.status).toBe(200);
      expect(corrected.body.data.status).toBe('corrected');
      expect(corrected.body.data.purpose).toBe(originalPurpose);
      expect(corrected.body.data.amount.amount).toBe(originalAmount);
      expect(corrected.body.data.correctedByExpenseId).toBeTruthy();
      expect(await derivedBalance(baseUrl, jar, cash.body.data.id)).toBe('1200.00');
      expect(await movementSum(baseUrl, jar, cash.body.data.id)).toBe('1200.00');

      const secondOrg = await createApprovedOwner(baseUrl, jar, {
        organizationName: 'F07P4 Other Org',
        ownerEmail: 'f07p4-other@example.com',
        password: 'a-strong-passphrase',
      });
      await postJson(baseUrl, jar, 'POST', API_AUTH_LOGOUT_PATH, {});
      await login(baseUrl, jar, 'f07p4-other@example.com', 'a-strong-passphrase');
      const foreignAccount = await fetchJson(
        baseUrl,
        'GET',
        `${API_ACCOUNTS_PATH}/${cash.body.data.id}`,
        null,
        {},
        jar,
      );
      expect([403, 404]).toContain(foreignAccount.status);
      const foreignExpense = await fetchJson(
        baseUrl,
        'GET',
        `${API_EXPENSES_PATH}/${postedExpense.body.data.id}`,
        null,
        {},
        jar,
      );
      expect([403, 404]).toContain(foreignExpense.status);
      void secondOrg.organizationId;
    } finally {
      await close(server);
    }
  }, 180000);

  it('architecture: no generic correction routes and no mutable balance shortcuts', () => {
    const forbiddenRoutes = [
      '/generic-correction',
      '/adjust-anything',
      '/corrective-transactions',
      '/balance-edit',
    ];
    const routeViolations = [];
    const shortcutViolations = [];
    const shortcutFields = [
      'receivableBalance',
      'payableBalance',
      'currentBalance',
      'runningBalance',
      'cachedBalance',
    ];
    for (const filePath of collectSourceFiles(backendRoot)) {
      const normalized = filePath.replaceAll('\\', '/');
      const contents = readFileSync(filePath, 'utf8');
      if (normalized.includes('/routes/') || normalized.endsWith('/app.js')) {
        for (const fragment of forbiddenRoutes) {
          if (contents.includes(fragment)) {
            routeViolations.push(`${normalized} contains ${fragment}`);
          }
        }
      }
      if (normalized.includes('/persistence/') && normalized.endsWith('.model.js')) {
        for (const field of shortcutFields) {
          if (contents.includes(field)) {
            shortcutViolations.push(`${normalized} contains ${field}`);
          }
        }
      }
    }
    expect(routeViolations).toEqual([]);
    expect(shortcutViolations).toEqual([]);

    const foreign = scanForeignPersistenceViolations(
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
    expect(foreign).toEqual([]);
  });
});

function sumSigned(items) {
  let total = 0;
  for (const item of items) {
    total += Number(item.signedAmount.amount);
  }
  return total;
}

async function derivedBalance(baseUrl, jar, accountId) {
  const response = await fetchJson(baseUrl, 'GET', `${API_ACCOUNTS_PATH}/${accountId}`, null, {}, jar);
  expect(response.status).toBe(200);
  return response.body.data.derivedBalances.balance.amount;
}

async function movementSum(baseUrl, jar, accountId) {
  const response = await fetchJson(
    baseUrl,
    'GET',
    `${API_ACCOUNTS_PATH}/${accountId}/movements`,
    null,
    {},
    jar,
  );
  expect(response.status).toBe(200);
  return sumSigned(response.body.data.items).toFixed(2);
}

async function productBalance(baseUrl, jar, productId) {
  const response = await fetchJson(baseUrl, 'GET', API_INVENTORY_BALANCES_PATH, null, {}, jar);
  expect(response.status).toBe(200);
  return response.body.data.items.find((item) => item.productId === productId && !item.batchId);
}

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
    { token: approved.body.data.activationToken, password: input.password },
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
