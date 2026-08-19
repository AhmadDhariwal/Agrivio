import { describe, expect, it } from 'vitest';
import {
  API_AUTH_CSRF_PATH,
  API_AUTH_LOGIN_PATH,
  API_AUTH_LOGOUT_PATH,
  API_ACCOUNTS_PATH,
  API_ACCOUNT_TRANSACTIONS_PATH,
  API_ACCOUNT_TRANSFERS_PATH,
  API_CSRF_HEADER,
  API_EXPENSE_CATEGORIES_PATH,
  API_EXPENSES_PATH,
  API_IDEMPOTENCY_KEY_HEADER,
  API_ORGANIZATION_ACTIVATION_REQUESTS_PATH,
  API_PLATFORM_ACTOR_HEADER,
  API_PLATFORM_ORGANIZATIONS_PATH,
  API_PLATFORM_SUBSCRIPTION_PLANS_PATH,
  API_USERS_PATH,
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

describe('F07 P3 manual account transactions, reversals, and expenses', () => {
  it('posts inflow/outflow/transfer, reverses, and corrects expenses with isolation proofs', async () => {
    const { server, baseUrl, jar } = await boot();

    try {
      await seedPlan(baseUrl, jar);
      const owner = await createApprovedOwner(baseUrl, jar, {
        organizationName: 'F07P3 Org',
        ownerEmail: 'f07p3-owner@example.com',
        password: 'a-strong-passphrase',
      });
      await login(baseUrl, jar, 'f07p3-owner@example.com', 'a-strong-passphrase');
      const organizationId = owner.organizationId;

      const cash = await postJson(baseUrl, jar, 'POST', API_ACCOUNTS_PATH, {
        name: 'F07P3 Cash',
        accountType: 'cash',
      });
      expect(cash.status).toBe(201);
      const bank = await postJson(baseUrl, jar, 'POST', API_ACCOUNTS_PATH, {
        name: 'F07P3 Bank',
        accountType: 'bank',
        bankName: 'HBL',
      });
      expect(bank.status).toBe(201);

      await postJson(
        baseUrl,
        jar,
        'POST',
        `${API_ACCOUNTS_PATH}/${cash.body.data.id}/opening-balance`,
        { amount: { amount: '1000.00', currency: 'PKR' } },
        'f07p3-cash-open',
      );

      const zeroAmount = await postJson(
        baseUrl,
        jar,
        'POST',
        API_ACCOUNT_TRANSACTIONS_PATH,
        {
          accountId: cash.body.data.id,
          direction: 'inflow',
          amount: { amount: '0.00', currency: 'PKR' },
          purpose: 'Invalid zero',
        },
        'f07p3-zero',
      );
      expect(zeroAmount.status).toBe(400);

      const inflow = await postJson(
        baseUrl,
        jar,
        'POST',
        API_ACCOUNT_TRANSACTIONS_PATH,
        {
          accountId: cash.body.data.id,
          direction: 'inflow',
          amount: { amount: '250.00', currency: 'PKR' },
          purpose: 'Owner cash injection',
          reference: 'INJ-1',
        },
        'f07p3-inflow',
      );
      expect(inflow.status).toBe(201);
      expect(inflow.body.data.direction).toBe('inflow');
      expect(inflow.body.data.signedAmount.amount).toBe('250.00');
      expect(inflow.body.data.purpose).toBe('Owner cash injection');

      const inflowReplay = await postJson(
        baseUrl,
        jar,
        'POST',
        API_ACCOUNT_TRANSACTIONS_PATH,
        {
          accountId: cash.body.data.id,
          direction: 'inflow',
          amount: { amount: '250.00', currency: 'PKR' },
          purpose: 'Owner cash injection',
          reference: 'INJ-1',
        },
        'f07p3-inflow',
      );
      expect(inflowReplay.status).toBe(201);
      expect(inflowReplay.body.data.id).toBe(inflow.body.data.id);

      const afterInflow = await fetchJson(
        baseUrl,
        'GET',
        `${API_ACCOUNTS_PATH}/${cash.body.data.id}`,
        null,
        {},
        jar,
      );
      expect(afterInflow.body.data.derivedBalances.balance.amount).toBe('1250.00');

      const outflow = await postJson(
        baseUrl,
        jar,
        'POST',
        API_ACCOUNT_TRANSACTIONS_PATH,
        {
          accountId: cash.body.data.id,
          direction: 'outflow',
          amount: { amount: '50.00', currency: 'PKR' },
          purpose: 'Petty cash',
        },
        'f07p3-outflow',
      );
      expect(outflow.status).toBe(201);
      expect(outflow.body.data.signedAmount.amount).toBe('-50.00');
      const afterOutflow = await fetchJson(
        baseUrl,
        'GET',
        `${API_ACCOUNTS_PATH}/${cash.body.data.id}`,
        null,
        {},
        jar,
      );
      expect(afterOutflow.body.data.derivedBalances.balance.amount).toBe('1200.00');

      const sameAccountTransfer = await postJson(
        baseUrl,
        jar,
        'POST',
        API_ACCOUNT_TRANSFERS_PATH,
        {
          sourceAccountId: cash.body.data.id,
          destinationAccountId: cash.body.data.id,
          amount: { amount: '10.00', currency: 'PKR' },
        },
        'f07p3-same-transfer',
      );
      expect(sameAccountTransfer.status).toBe(400);

      const transfer = await postJson(
        baseUrl,
        jar,
        'POST',
        API_ACCOUNT_TRANSFERS_PATH,
        {
          sourceAccountId: cash.body.data.id,
          destinationAccountId: bank.body.data.id,
          amount: { amount: '100.00', currency: 'PKR' },
          purpose: 'Float to bank',
        },
        'f07p3-transfer',
      );
      expect(transfer.status).toBe(201);
      expect(transfer.body.data.outboundMovementId).toBeTruthy();
      expect(transfer.body.data.inboundMovementId).toBeTruthy();
      expect(transfer.body.data.outboundMovementId).not.toBe(transfer.body.data.inboundMovementId);

      const transferReplay = await postJson(
        baseUrl,
        jar,
        'POST',
        API_ACCOUNT_TRANSFERS_PATH,
        {
          sourceAccountId: cash.body.data.id,
          destinationAccountId: bank.body.data.id,
          amount: { amount: '100.00', currency: 'PKR' },
          purpose: 'Float to bank',
        },
        'f07p3-transfer',
      );
      expect(transferReplay.status).toBe(201);
      expect(transferReplay.body.data.id).toBe(transfer.body.data.id);

      const cashMovements = await fetchJson(
        baseUrl,
        'GET',
        `${API_ACCOUNTS_PATH}/${cash.body.data.id}/movements`,
        null,
        {},
        jar,
      );
      const bankMovements = await fetchJson(
        baseUrl,
        'GET',
        `${API_ACCOUNTS_PATH}/${bank.body.data.id}/movements`,
        null,
        {},
        jar,
      );
      const transferOut = cashMovements.body.data.find(
        (item) => item.sourceType === 'account_transfer_out' && item.sourceId === transfer.body.data.id,
      );
      const transferIn = bankMovements.body.data.find(
        (item) => item.sourceType === 'account_transfer_in' && item.sourceId === transfer.body.data.id,
      );
      expect(transferOut.signedAmount.amount).toBe('-100.00');
      expect(transferIn.signedAmount.amount).toBe('100.00');
      expect(
        Number(transferOut.signedAmount.amount) + Number(transferIn.signedAmount.amount),
      ).toBe(0);

      const cashAfterTransfer = await fetchJson(
        baseUrl,
        'GET',
        `${API_ACCOUNTS_PATH}/${cash.body.data.id}`,
        null,
        {},
        jar,
      );
      const bankAfterTransfer = await fetchJson(
        baseUrl,
        'GET',
        `${API_ACCOUNTS_PATH}/${bank.body.data.id}`,
        null,
        {},
        jar,
      );
      expect(cashAfterTransfer.body.data.derivedBalances.balance.amount).toBe('1100.00');
      expect(bankAfterTransfer.body.data.derivedBalances.balance.amount).toBe('100.00');

      const missingReason = await postJson(
        baseUrl,
        jar,
        'POST',
        `${API_ACCOUNT_TRANSACTIONS_PATH}/${inflow.body.data.id}/reverse`,
        {},
        'f07p3-inflow-reverse-missing',
      );
      expect(missingReason.status).toBe(400);

      const reverseInflow = await postJson(
        baseUrl,
        jar,
        'POST',
        `${API_ACCOUNT_TRANSACTIONS_PATH}/${inflow.body.data.id}/reverse`,
        { reason: 'Posted to the wrong account' },
        'f07p3-inflow-reverse',
      );
      expect(reverseInflow.status).toBe(200);
      expect(reverseInflow.body.data.signedAmount.amount).toBe('250.00');
      expect(reverseInflow.body.data.purpose).toBe('Owner cash injection');
      expect(reverseInflow.body.data.reversedByMovementId).toBeTruthy();

      const reverseInflowAgain = await postJson(
        baseUrl,
        jar,
        'POST',
        `${API_ACCOUNT_TRANSACTIONS_PATH}/${inflow.body.data.id}/reverse`,
        { reason: 'Posted to the wrong account again' },
        'f07p3-inflow-reverse-2',
      );
      expect(reverseInflowAgain.status).toBe(409);

      const reverseInflowReplay = await postJson(
        baseUrl,
        jar,
        'POST',
        `${API_ACCOUNT_TRANSACTIONS_PATH}/${inflow.body.data.id}/reverse`,
        { reason: 'Posted to the wrong account' },
        'f07p3-inflow-reverse',
      );
      expect(reverseInflowReplay.status).toBe(200);
      expect(reverseInflowReplay.body.data.reversedByMovementId).toBe(
        reverseInflow.body.data.reversedByMovementId,
      );

      const reverseOutflow = await postJson(
        baseUrl,
        jar,
        'POST',
        `${API_ACCOUNT_TRANSACTIONS_PATH}/${outflow.body.data.id}/reverse`,
        { reason: 'Outflow was a duplicate' },
        'f07p3-outflow-reverse',
      );
      expect(reverseOutflow.status).toBe(200);

      const reverseTransfer = await postJson(
        baseUrl,
        jar,
        'POST',
        `${API_ACCOUNT_TRANSFERS_PATH}/${transfer.body.data.id}/reverse`,
        { reason: 'Transfer not needed' },
        'f07p3-transfer-reverse',
      );
      expect(reverseTransfer.status).toBe(200);
      expect(reverseTransfer.body.data.reversalOutboundMovementId).toBeTruthy();
      expect(reverseTransfer.body.data.reversalInboundMovementId).toBeTruthy();

      const reverseTransferAgain = await postJson(
        baseUrl,
        jar,
        'POST',
        `${API_ACCOUNT_TRANSFERS_PATH}/${transfer.body.data.id}/reverse`,
        { reason: 'Transfer not needed again' },
        'f07p3-transfer-reverse-2',
      );
      expect(reverseTransferAgain.status).toBe(409);

      const originalTx = await fetchJson(
        baseUrl,
        'GET',
        `${API_ACCOUNT_TRANSACTIONS_PATH}/${inflow.body.data.id}`,
        null,
        {},
        jar,
      );
      expect(originalTx.body.data.signedAmount.amount).toBe('250.00');
      expect(originalTx.body.data.purpose).toBe('Owner cash injection');
      expect(originalTx.body.data.sourceType).toBe('manual_inflow');

      const cashReconciled = await fetchJson(
        baseUrl,
        'GET',
        `${API_ACCOUNTS_PATH}/${cash.body.data.id}`,
        null,
        {},
        jar,
      );
      const bankReconciled = await fetchJson(
        baseUrl,
        'GET',
        `${API_ACCOUNTS_PATH}/${bank.body.data.id}`,
        null,
        {},
        jar,
      );
      const cashMovementSum = sumSigned(cashMovements.body.data);
      void cashMovementSum;
      const cashMovesAfter = await fetchJson(
        baseUrl,
        'GET',
        `${API_ACCOUNTS_PATH}/${cash.body.data.id}/movements`,
        null,
        {},
        jar,
      );
      const bankMovesAfter = await fetchJson(
        baseUrl,
        'GET',
        `${API_ACCOUNTS_PATH}/${bank.body.data.id}/movements`,
        null,
        {},
        jar,
      );
      expect(cashReconciled.body.data.derivedBalances.balance.amount).toBe(
        formatSignedSum(cashMovesAfter.body.data),
      );
      expect(bankReconciled.body.data.derivedBalances.balance.amount).toBe(
        formatSignedSum(bankMovesAfter.body.data),
      );
      expect(cashReconciled.body.data.derivedBalances.balance.amount).toBe('1000.00');
      expect(bankReconciled.body.data.derivedBalances.balance.amount).toBe('0.00');

      const category = await postJson(baseUrl, jar, 'POST', API_EXPENSE_CATEGORIES_PATH, {
        name: 'Utilities',
      });
      expect(category.status).toBe(201);

      const expenseDraft = await postJson(baseUrl, jar, 'POST', API_EXPENSES_PATH, {
        categoryId: category.body.data.id,
        accountId: cash.body.data.id,
        amount: { amount: '80.00', currency: 'PKR' },
        purpose: 'Electricity bill',
        expenseDate: '2026-08-13',
        reference: 'BILL-80',
      });
      expect(expenseDraft.status).toBe(201);
      expect(expenseDraft.body.data.status).toBe('draft');

      const postedExpense = await postJson(
        baseUrl,
        jar,
        'POST',
        `${API_EXPENSES_PATH}/${expenseDraft.body.data.id}/post`,
        { expectedVersion: expenseDraft.body.data.version },
        'f07p3-expense-post',
      );
      expect(postedExpense.status).toBe(200);
      expect(postedExpense.body.data.status).toBe('posted');
      expect(postedExpense.body.data.accountMovementId).toBeTruthy();
      expect(postedExpense.body.data.purpose).toBe('Electricity bill');

      const expenseReplay = await postJson(
        baseUrl,
        jar,
        'POST',
        `${API_EXPENSES_PATH}/${expenseDraft.body.data.id}/post`,
        { expectedVersion: expenseDraft.body.data.version },
        'f07p3-expense-post',
      );
      expect(expenseReplay.status).toBe(200);
      expect(expenseReplay.body.data.id).toBe(postedExpense.body.data.id);

      const cashAfterExpense = await fetchJson(
        baseUrl,
        'GET',
        `${API_ACCOUNTS_PATH}/${cash.body.data.id}`,
        null,
        {},
        jar,
      );
      expect(cashAfterExpense.body.data.derivedBalances.balance.amount).toBe('920.00');

      const expenseMoves = await fetchJson(
        baseUrl,
        'GET',
        `${API_ACCOUNTS_PATH}/${cash.body.data.id}/movements`,
        null,
        {},
        jar,
      );
      const expenseOut = expenseMoves.body.data.find(
        (item) =>
          item.sourceType === 'expense' && item.sourceId === postedExpense.body.data.id,
      );
      expect(expenseOut.signedAmount.amount).toBe('-80.00');

      const corrected = await postJson(
        baseUrl,
        jar,
        'POST',
        `${API_EXPENSES_PATH}/${postedExpense.body.data.id}/correct`,
        { expectedVersion: postedExpense.body.data.version, reason: 'Billed in error' },
        'f07p3-expense-correct',
      );
      expect(corrected.status).toBe(200);
      expect(corrected.body.data.status).toBe('corrected');
      expect(corrected.body.data.purpose).toBe('Electricity bill');
      expect(corrected.body.data.amount.amount).toBe('80.00');
      expect(corrected.body.data.correctedByExpenseId).toBeTruthy();

      const doubleCorrect = await postJson(
        baseUrl,
        jar,
        'POST',
        `${API_EXPENSES_PATH}/${postedExpense.body.data.id}/correct`,
        { expectedVersion: corrected.body.data.version, reason: 'Again' },
        'f07p3-expense-correct-2',
      );
      expect(doubleCorrect.status).toBe(409);

      const preservedExpense = await fetchJson(
        baseUrl,
        'GET',
        `${API_EXPENSES_PATH}/${postedExpense.body.data.id}`,
        null,
        {},
        jar,
      );
      expect(preservedExpense.body.data.purpose).toBe('Electricity bill');
      expect(preservedExpense.body.data.amount.amount).toBe('80.00');
      expect(preservedExpense.body.data.reference).toBe('BILL-80');
      expect(preservedExpense.body.data.status).toBe('corrected');

      const cashAfterCorrect = await fetchJson(
        baseUrl,
        'GET',
        `${API_ACCOUNTS_PATH}/${cash.body.data.id}`,
        null,
        {},
        jar,
      );
      expect(cashAfterCorrect.body.data.derivedBalances.balance.amount).toBe('1000.00');
      expect(cashAfterCorrect.body.data.derivedBalances.balance.amount).toBe(
        formatSignedSum(
          (
            await fetchJson(
              baseUrl,
              'GET',
              `${API_ACCOUNTS_PATH}/${cash.body.data.id}/movements`,
              null,
              {},
              jar,
            )
          ).body.data,
        ),
      );

      const otherOwner = await createApprovedOwner(baseUrl, jar, {
        organizationName: 'F07P3 Other',
        ownerEmail: 'f07p3-other@example.com',
        password: 'a-strong-passphrase',
      });
      await login(baseUrl, jar, 'f07p3-other@example.com', 'a-strong-passphrase');
      const otherCash = await postJson(baseUrl, jar, 'POST', API_ACCOUNTS_PATH, {
        name: 'Other Cash',
        accountType: 'cash',
      });
      expect(otherCash.status).toBe(201);
      await postJson(baseUrl, jar, 'POST', API_AUTH_LOGOUT_PATH, {});
      await login(baseUrl, jar, 'f07p3-owner@example.com', 'a-strong-passphrase');
      const crossOrg = await postJson(
        baseUrl,
        jar,
        'POST',
        API_ACCOUNT_TRANSFERS_PATH,
        {
          sourceAccountId: cash.body.data.id,
          destinationAccountId: otherCash.body.data.id,
          amount: { amount: '10.00', currency: 'PKR' },
        },
        'f07p3-cross-org',
      );
      expect(crossOrg.status).toBe(404);
      void otherOwner;

      const cashier = await postJson(baseUrl, jar, 'POST', API_USERS_PATH, {
        email: 'f07p3-cashier@example.com',
        displayName: 'F07P3 Cashier',
        role: 'Cashier',
      });
      expect(cashier.status).toBe(201);
      const activatedCashier = await postJson(baseUrl, jar, 'POST', '/api/v1/auth/activate', {
        token: cashier.body.data.activationToken,
        password: 'a-strong-passphrase',
      });
      expect(activatedCashier.status).toBe(200);
      await postJson(baseUrl, jar, 'POST', API_AUTH_LOGOUT_PATH, {});
      await login(baseUrl, jar, 'f07p3-cashier@example.com', 'a-strong-passphrase');

      const cashierTx = await postJson(
        baseUrl,
        jar,
        'POST',
        API_ACCOUNT_TRANSACTIONS_PATH,
        {
          accountId: cash.body.data.id,
          direction: 'inflow',
          amount: { amount: '1.00', currency: 'PKR' },
          purpose: 'Cashier should not post',
        },
        'f07p3-cashier-tx',
      );
      expect(cashierTx.status).toBe(403);

      const cashierReverse = await postJson(
        baseUrl,
        jar,
        'POST',
        `${API_ACCOUNT_TRANSACTIONS_PATH}/${outflow.body.data.id}/reverse`,
        { reason: 'Cashier should not reverse' },
        'f07p3-cashier-reverse',
      );
      expect(cashierReverse.status).toBe(403);

      const cashierExpense = await postJson(
        baseUrl,
        jar,
        'POST',
        API_EXPENSES_PATH,
        {
          categoryId: category.body.data.id,
          accountId: cash.body.data.id,
          amount: { amount: '1.00', currency: 'PKR' },
          purpose: 'Cashier expense',
          expenseDate: '2026-08-13',
        },
        'f07p3-cashier-expense',
      );
      expect(cashierExpense.status).toBe(403);

      const cashierCorrect = await postJson(
        baseUrl,
        jar,
        'POST',
        `${API_EXPENSES_PATH}/${postedExpense.body.data.id}/correct`,
        { expectedVersion: 1, reason: 'Cashier should not correct' },
        'f07p3-cashier-correct',
      );
      expect(cashierCorrect.status).toBe(403);

      await postJson(baseUrl, jar, 'POST', API_AUTH_LOGOUT_PATH, {});
      await login(baseUrl, jar, 'f07p3-owner@example.com', 'a-strong-passphrase');

      const genericCorrection = await postJson(
        baseUrl,
        jar,
        'POST',
        '/api/v1/corrective-transactions',
        { reason: 'nope' },
        'f07p3-generic-1',
      );
      expect(genericCorrection.status).toBe(404);
      const balanceEdit = await postJson(
        baseUrl,
        jar,
        'POST',
        '/api/v1/accounts/balance-edit',
        { amount: { amount: '1.00', currency: 'PKR' } },
        'f07p3-balance-edit',
      );
      expect(balanceEdit.status).toBe(404);
      const genericAdjust = await postJson(
        baseUrl,
        jar,
        'POST',
        '/api/v1/generic-correction',
        { reason: 'nope' },
        'f07p3-generic-2',
      );
      expect(genericAdjust.status).toBe(404);
      void organizationId;
    } finally {
      await close(server);
    }
  }, 180000);

  it('architecture: no foreign persistence coupling and no generic correction routes', () => {
    const foreign = scanForeignPersistenceViolations(
      backendRoot,
      ['/modules/accounts-expenses/'],
      [
        '/returns-corrections/persistence/',
        '/payments-ledgers/persistence/',
        '/inventory/persistence/',
        '/purchases/persistence/',
        '/sales/persistence/',
      ],
    );
    expect(foreign).toEqual([]);

    const forbidden = [
      '/generic-correction',
      '/adjust-anything',
      '/corrective-transactions',
      '/balance-edit',
    ];
    const routeViolations = [];
    for (const filePath of collectSourceFiles(backendRoot)) {
      const normalized = filePath.replaceAll('\\', '/');
      if (!normalized.includes('/routes/') && !normalized.endsWith('/app.js')) {
        continue;
      }
      const contents = readFileSync(filePath, 'utf8');
      for (const fragment of forbidden) {
        if (contents.includes(fragment)) {
          routeViolations.push(`${normalized} contains ${fragment}`);
        }
      }
    }
    expect(routeViolations).toEqual([]);
  });
});

function sumSigned(items) {
  let total = 0;
  for (const item of items) {
    total += Number(item.signedAmount.amount);
  }
  return total;
}

function formatSignedSum(items) {
  return sumSigned(items).toFixed(2);
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
