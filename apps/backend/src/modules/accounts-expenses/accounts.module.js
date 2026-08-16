const {
  createMockTransactionSessionPort,
  createTransactionRunner,
} = require('../../platform/transactions/transaction-runner');
const { createAuditWriter } = require('../../platform/audit/audit-writer');
const { assertOptimisticVersion } = require('../../platform/validation/request-validation');
const {
  conflict,
  notFound,
  validationFailed,
  versionConflict,
} = require('../../platform/errors/app-error');
const {
  createIdempotencyService,
  createInMemoryIdempotencyStore,
  createMongooseIdempotencyStore,
} = require('../../platform/idempotency/idempotency-service');
const { formatMoneyMinorUnits } = require('../../platform/primitives/money-and-time');
const {
  parseAccountCreate,
  parseAccountPatch,
  parseAccountOpeningBalance,
  parseManualAccountTransaction,
  parseAccountTransfer,
  parseReversalReason,
  toAccountDto,
  toAccountMovementDto,
  toManualAccountTransactionDto,
  toAccountTransferDto,
} = require('./accounts.validation');
const {
  parseExpenseCategoryCreate,
  parseExpenseCategoryPatch,
  parseExpenseDraftCreate,
  parseExpenseDraftPatch,
  parseExpensePost,
  parseExpenseCorrect,
  toExpenseCategoryDto,
  toExpenseDto,
} = require('./expenses.validation');
const {
  createInMemoryAccountsStore,
  createMongooseAccountsStore,
} = require('./accounts.store');

function createMongooseTransactionSessionPort() {
  const mongoose = require('mongoose');
  return {
    async startSession() {
      return mongoose.startSession();
    },
    async withTransaction(session, work) {
      return session.withTransaction(async () => work(session));
    },
    async endSession(session) {
      await session.endSession();
    },
  };
}

function mapDuplicate(error, message) {
  if (error && error.agrivioDuplicate === true) {
    throw conflict(message);
  }
  throw error;
}

function requireIdempotencyKey(idempotencyKey) {
  if (typeof idempotencyKey !== 'string' || idempotencyKey.trim() === '') {
    throw validationFailed('Idempotency-Key header is required', [
      { field: 'Idempotency-Key', message: 'Idempotency-Key header is required' },
    ]);
  }
  return idempotencyKey.trim();
}

function negateMinorUnits(value) {
  return (-BigInt(String(value))).toString();
}

function assertActiveAccount(account, field = 'accountId') {
  if (account === null) {
    throw notFound(field === 'destinationAccountId' ? 'Destination account not found' : 'Account not found');
  }
  if (account.status !== 'active') {
    throw validationFailed('Account must be active for movement posting', [
      { field, message: 'account must be active' },
    ]);
  }
  return account;
}

function wrapIdempotentResult(result) {
  return {
    replay: result.replay,
    data: result.response.body,
    statusCode: result.response.statusCode,
  };
}

async function assertExpenseMasters(store, organizationId, input, session, options) {
  const requireActiveCategory = options?.requireActiveCategory === true;
  const category = await store.findExpenseCategoryById(organizationId, String(input.categoryId), session);
  if (category === null) {
    throw notFound('Expense category not found');
  }
  if (requireActiveCategory && category.status !== 'active') {
    throw validationFailed('Expense category must be active', [
      { field: 'categoryId', message: 'expense category must be active' },
    ]);
  }
  const account = await store.findAccountById(organizationId, String(input.accountId), session);
  assertActiveAccount(account, 'accountId');
}

function createAccountsService(deps) {
  const store = deps.store;
  const idempotency = deps.idempotency;
  const now = deps.now ?? (() => new Date());
  const auditWriter = createAuditWriter({
    append: (session, event) => store.appendAuditEvent(session, event),
  });
  const transactionRunner = deps.transactionRunner;

  async function buildAccountDto(organizationId, record) {
    const balance = await sumAccountBalanceInternal(organizationId, String(record['_id']));
    return toAccountDto(record, { balance });
  }

  async function sumAccountBalanceInternal(organizationId, accountId) {
    const minor = await store.sumPostedMovements(organizationId, accountId);
    return {
      amount: formatMoneyMinorUnits(BigInt(String(minor ?? '0'))),
      currency: 'PKR',
    };
  }

  return {
    async listAccounts(organizationId, options = {}) {
      const listed = await store.listAccounts(organizationId);
      const items =
        options.status === 'active' || options.status === 'inactive'
          ? listed.filter((item) => String(item.status) === options.status)
          : listed;
      const mapped = [];
      for (const item of items) {
        mapped.push(await buildAccountDto(organizationId, item));
      }
      return { items: mapped };
    },

    async getAccount(organizationId, accountId) {
      const record = await store.findAccountById(organizationId, accountId);
      if (record === null) {
        throw notFound('Account not found');
      }
      return buildAccountDto(organizationId, record);
    },

    async findAccountByName(organizationId, name) {
      const needle = String(name ?? '')
        .trim()
        .replace(/\s+/g, ' ')
        .toLowerCase();
      if (needle === '') {
        return null;
      }
      const items = await store.listAccounts(organizationId);
      const found = items.find((item) => String(item.nameNormalized) === needle);
      return found ? toAccountDto(found) : null;
    },

    async createAccount(organizationId, body, actor) {
      const input = parseAccountCreate(body);
      try {
        return await transactionRunner.run(async (session) => {
          const created = await store.insertAccount(session, {
            organizationId,
            ...input,
            version: 1,
          });
          await auditWriter.appendBusinessEvent(session, {
            organizationId,
            actorId: actor.actorId,
            action: 'account.created',
            resourceType: 'account',
            resourceId: String(created['_id']),
            metadata: { accountType: created.accountType },
          });
          return toAccountDto(created);
        });
      } catch (error) {
        mapDuplicate(error, 'Account name already exists in this organization');
      }
    },

    async updateAccount(organizationId, accountId, body, actor) {
      const { expectedVersion, patch } = parseAccountPatch(body);
      try {
        return await transactionRunner.run(async (session) => {
          const current = await store.findAccountById(organizationId, accountId);
          if (current === null) {
            throw notFound('Account not found');
          }
          assertOptimisticVersion(current, expectedVersion);
          if (current.accountType === 'bank' && patch.bankName === '') {
            throw validationFailed('bankName is required for bank accounts', [
              { field: 'bankName', message: 'bankName is required for bank accounts' },
            ]);
          }
          if (
            (current.accountType === 'jazzcash' || current.accountType === 'easypaisa') &&
            patch.walletIdentifier === ''
          ) {
            throw validationFailed('walletIdentifier is required for wallet accounts', [
              { field: 'walletIdentifier', message: 'walletIdentifier is required' },
            ]);
          }
          const updated = await store.updateAccount(session, organizationId, accountId, {
            ...patch,
            version: Number(current['version']) + 1,
          });
          await auditWriter.appendBusinessEvent(session, {
            organizationId,
            actorId: actor.actorId,
            action: 'account.updated',
            resourceType: 'account',
            resourceId: accountId,
            metadata: { fields: Object.keys(patch) },
          });
          return toAccountDto(updated);
        });
      } catch (error) {
        mapDuplicate(error, 'Account name already exists in this organization');
      }
    },

    /**
     * Public Accounts interface: post a signed account movement within a session.
     * Validates organization ownership and active status for purchase/payment reuse.
     */
    async postAccountMovement(session, input) {
      const account = await store.findAccountById(input.organizationId, input.accountId);
      if (account === null) {
        throw notFound('Account not found');
      }
      if (account.status !== 'active') {
        throw validationFailed('Account must be active for movement posting', [
          { field: 'accountId', message: 'account must be active' },
        ]);
      }

      try {
        return await store.insertAccountMovement(session, {
          organizationId: input.organizationId,
          accountId: input.accountId,
          signedAmountMinorUnits: String(input.signedAmountMinorUnits),
          currency: input.currency ?? 'PKR',
          sourceType: input.sourceType,
          sourceId: input.sourceId,
          purpose: input.purpose ?? null,
          reference: input.reference ?? null,
          reversalOfId: input.reversalOfId ?? null,
          status: 'posted',
          postedAt: input.postedAt,
          postedBy: input.postedBy,
        });
      } catch (error) {
        mapDuplicate(
          error,
          input.sourceType === 'account_opening'
            ? 'Opening account movement already exists for this account'
            : 'Account movement already exists for this source',
        );
      }
    },

    async sumAccountBalance(organizationId, accountId) {
      return sumAccountBalanceInternal(organizationId, accountId);
    },

    async listAccountMovements(organizationId, accountId) {
      const account = await store.findAccountById(organizationId, accountId);
      if (account === null) {
        throw notFound('Account not found');
      }
      const items = await store.listMovementsByAccount(organizationId, accountId);
      return { items: items.map(toAccountMovementDto) };
    },

    async listAccountMovementsBySource(organizationId, sourceType, sourceId, session) {
      const items = await store.listMovementsBySource(
        organizationId,
        sourceType,
        sourceId,
        session,
      );
      return items.map((item) => ({
        id: String(item['_id']),
        accountId: String(item.accountId),
        signedAmountMinorUnits: String(item.signedAmountMinorUnits),
        currency: String(item.currency ?? 'PKR'),
        sourceType: String(item.sourceType),
        sourceId: String(item.sourceId),
        reversalOfId: item.reversalOfId ? String(item.reversalOfId) : null,
      }));
    },

    async postOpeningBalance(organizationId, accountId, body, actor, idempotencyKey, options = {}) {
      const input = parseAccountOpeningBalance(body);

      const postWork = async (session) => {
            const current = await store.findAccountById(organizationId, accountId);
            if (current === null) {
              throw notFound('Account not found');
            }
            if (current.status !== 'active') {
              throw validationFailed('Opening balance requires an active account', [
                { field: 'status', message: 'account must be active' },
              ]);
            }
            if (current.openingBalance && current.openingBalance.status === 'posted') {
              throw conflict('Account opening balance already posted');
            }

            const postedAt = now();
            let movement;
            try {
              movement = await store.insertAccountMovement(session, {
                organizationId,
                accountId,
                signedAmountMinorUnits: input.amountMinorUnits,
                currency: input.currency,
                sourceType: 'account_opening',
                sourceId: accountId,
                status: 'posted',
                postedAt,
                postedBy: actor.actorId,
              });
            } catch (error) {
              mapDuplicate(error, 'Opening account movement already exists for this account');
            }

            const updated = await store.updateAccount(session, organizationId, accountId, {
              openingBalance: {
                kind: 'balance',
                amountMinorUnits: input.amountMinorUnits,
                currency: input.currency,
                postedAt,
                postedBy: actor.actorId,
                accountMovementId: movement['_id'],
                status: 'posted',
              },
              version: Number(current['version']) + 1,
            });

            await auditWriter.appendBusinessEvent(session, {
              organizationId,
              actorId: actor.actorId,
              action: 'account.opening_balance.posted',
              resourceType: 'account',
              resourceId: accountId,
              metadata: {
                amountMinorUnits: input.amountMinorUnits,
                accountMovementId: String(movement['_id']),
              },
            });

            return toAccountDto(updated, {
              balance: {
                amount: formatMoneyMinorUnits(BigInt(input.amountMinorUnits)),
                currency: 'PKR',
              },
            });
      };

      if (options.session) {
        const dto = await postWork(options.session);
        return wrapIdempotentResult({ replay: false, response: { statusCode: 201, body: dto } });
      }

      const key = requireIdempotencyKey(idempotencyKey);
      const result = await idempotency.execute(
        {
          scopeType: 'organization',
          organizationId,
          actorId: actor.actorId,
          operation: 'accounts.opening-balance.post',
        },
        key,
        { accountId, amountMinorUnits: input.amountMinorUnits },
        async () => {
          const dto = await transactionRunner.run(postWork);
          return { statusCode: 201, body: dto };
        },
      );

      return wrapIdempotentResult(result);
    },

    async postManualAccountTransaction(organizationId, body, actor, idempotencyKey) {
      const key = requireIdempotencyKey(idempotencyKey);
      const input = parseManualAccountTransaction(body);
      const signedAmountMinorUnits =
        input.direction === 'outflow' ? negateMinorUnits(input.amountMinorUnits) : input.amountMinorUnits;
      const sourceType = input.direction === 'outflow' ? 'manual_outflow' : 'manual_inflow';

      const result = await idempotency.execute(
        {
          scopeType: 'organization',
          organizationId,
          actorId: actor.actorId,
          operation: 'accounts.transaction.post',
        },
        key,
        {
          accountId: input.accountId,
          direction: input.direction,
          amountMinorUnits: input.amountMinorUnits,
          purpose: input.purpose,
          reference: input.reference,
        },
        async () => {
          const dto = await transactionRunner.run(async (session) => {
            const account = await store.findAccountById(organizationId, input.accountId, session);
            assertActiveAccount(account, 'accountId');
            const postedAt = now();
            const sourceId = store.allocateId();
            let movement;
            try {
              movement = await store.insertAccountMovement(session, {
                _id: sourceId,
                organizationId,
                accountId: input.accountId,
                signedAmountMinorUnits,
                currency: input.currency,
                sourceType,
                sourceId,
                purpose: input.purpose,
                reference: input.reference,
                status: 'posted',
                postedAt,
                postedBy: actor.actorId,
              });
            } catch (error) {
              mapDuplicate(error, 'Account movement already exists for this source');
            }

            await auditWriter.appendBusinessEvent(session, {
              organizationId,
              actorId: actor.actorId,
              action: 'account.transaction.posted',
              resourceType: 'account_movement',
              resourceId: String(movement['_id']),
              metadata: {
                accountId: input.accountId,
                direction: input.direction,
                sourceType,
                amountMinorUnits: input.amountMinorUnits,
                purpose: input.purpose,
                reference: input.reference,
              },
            });

            return toManualAccountTransactionDto(movement, { direction: input.direction });
          });
          return { statusCode: 201, body: dto };
        },
      );
      return wrapIdempotentResult(result);
    },

    async getManualAccountTransaction(organizationId, transactionId) {
      const movement = await store.findMovementById(organizationId, transactionId);
      if (
        movement === null ||
        (movement.sourceType !== 'manual_inflow' && movement.sourceType !== 'manual_outflow')
      ) {
        throw notFound('Account transaction not found');
      }
      const reversal = await store.findMovementByReversalOfId(organizationId, String(movement['_id']));
      return toManualAccountTransactionDto(movement, {
        direction: movement.sourceType === 'manual_outflow' ? 'outflow' : 'inflow',
        reversedByMovementId: reversal ? String(reversal['_id']) : null,
      });
    },

    async reverseManualAccountTransaction(organizationId, transactionId, body, actor, idempotencyKey) {
      const key = requireIdempotencyKey(idempotencyKey);
      const input = parseReversalReason(body);

      const result = await idempotency.execute(
        {
          scopeType: 'organization',
          organizationId,
          actorId: actor.actorId,
          operation: 'accounts.transaction.correct',
        },
        key,
        { transactionId, reason: input.reason },
        async () => {
          const dto = await transactionRunner.run(async (session) => {
            const original = await store.findMovementById(organizationId, transactionId, session);
            if (
              original === null ||
              (original.sourceType !== 'manual_inflow' && original.sourceType !== 'manual_outflow')
            ) {
              throw notFound('Account transaction not found');
            }
            const existingReversal = await store.findMovementByReversalOfId(
              organizationId,
              String(original['_id']),
              session,
            );
            if (existingReversal !== null) {
              throw conflict('Account transaction has already been reversed');
            }

            const account = await store.findAccountById(
              organizationId,
              String(original.accountId),
              session,
            );
            assertActiveAccount(account, 'accountId');

            const postedAt = now();
            const reversalSourceType =
              original.sourceType === 'manual_outflow'
                ? 'manual_outflow_reversal'
                : 'manual_inflow_reversal';
            let reversal;
            try {
              reversal = await store.insertAccountMovement(session, {
                organizationId,
                accountId: original.accountId,
                signedAmountMinorUnits: negateMinorUnits(original.signedAmountMinorUnits),
                currency: original.currency ?? 'PKR',
                sourceType: reversalSourceType,
                sourceId: original['_id'],
                purpose: original.purpose ?? null,
                reference: original.reference ?? null,
                reversalOfId: original['_id'],
                status: 'posted',
                postedAt,
                postedBy: actor.actorId,
              });
            } catch (error) {
              mapDuplicate(error, 'Account transaction has already been reversed');
            }

            await auditWriter.appendBusinessEvent(session, {
              organizationId,
              actorId: actor.actorId,
              action: 'account.transaction.reversed',
              resourceType: 'account_movement',
              resourceId: String(original['_id']),
              reason: input.reason,
              metadata: {
                originalMovementId: String(original['_id']),
                reversalMovementId: String(reversal['_id']),
                sourceType: original.sourceType,
              },
            });

            return toManualAccountTransactionDto(original, {
              direction: original.sourceType === 'manual_outflow' ? 'outflow' : 'inflow',
              reversedByMovementId: String(reversal['_id']),
            });
          });
          return { statusCode: 200, body: dto };
        },
      );
      return wrapIdempotentResult(result);
    },

    async postAccountTransfer(organizationId, body, actor, idempotencyKey) {
      const key = requireIdempotencyKey(idempotencyKey);
      const input = parseAccountTransfer(body);

      const result = await idempotency.execute(
        {
          scopeType: 'organization',
          organizationId,
          actorId: actor.actorId,
          operation: 'accounts.transfer',
        },
        key,
        {
          sourceAccountId: input.sourceAccountId,
          destinationAccountId: input.destinationAccountId,
          amountMinorUnits: input.amountMinorUnits,
          purpose: input.purpose,
          reference: input.reference,
        },
        async () => {
          const dto = await transactionRunner.run(async (session) => {
            const source = await store.findAccountById(
              organizationId,
              input.sourceAccountId,
              session,
            );
            assertActiveAccount(source, 'sourceAccountId');
            const destination = await store.findAccountById(
              organizationId,
              input.destinationAccountId,
              session,
            );
            assertActiveAccount(destination, 'destinationAccountId');

            const postedAt = now();
            const transferId = store.allocateId();
            let outbound;
            let inbound;
            try {
              outbound = await store.insertAccountMovement(session, {
                organizationId,
                accountId: input.sourceAccountId,
                signedAmountMinorUnits: negateMinorUnits(input.amountMinorUnits),
                currency: input.currency,
                sourceType: 'account_transfer_out',
                sourceId: transferId,
                purpose: input.purpose,
                reference: input.reference,
                status: 'posted',
                postedAt,
                postedBy: actor.actorId,
              });
              inbound = await store.insertAccountMovement(session, {
                organizationId,
                accountId: input.destinationAccountId,
                signedAmountMinorUnits: input.amountMinorUnits,
                currency: input.currency,
                sourceType: 'account_transfer_in',
                sourceId: transferId,
                purpose: input.purpose,
                reference: input.reference,
                status: 'posted',
                postedAt,
                postedBy: actor.actorId,
              });
            } catch (error) {
              mapDuplicate(error, 'Account transfer already exists for this source');
            }

            await auditWriter.appendBusinessEvent(session, {
              organizationId,
              actorId: actor.actorId,
              action: 'account.transfer.posted',
              resourceType: 'account_transfer',
              resourceId: String(transferId),
              metadata: {
                sourceAccountId: input.sourceAccountId,
                destinationAccountId: input.destinationAccountId,
                amountMinorUnits: input.amountMinorUnits,
                outboundMovementId: String(outbound['_id']),
                inboundMovementId: String(inbound['_id']),
                purpose: input.purpose,
                reference: input.reference,
              },
            });

            return toAccountTransferDto({
              id: transferId,
              sourceAccountId: input.sourceAccountId,
              destinationAccountId: input.destinationAccountId,
              amountMinorUnits: input.amountMinorUnits,
              currency: input.currency,
              purpose: input.purpose,
              reference: input.reference,
              outboundMovementId: outbound['_id'],
              inboundMovementId: inbound['_id'],
              status: 'posted',
              postedAt,
              postedBy: actor.actorId,
            });
          });
          return { statusCode: 201, body: dto };
        },
      );
      return wrapIdempotentResult(result);
    },

    async reverseAccountTransfer(organizationId, transferId, body, actor, idempotencyKey) {
      const key = requireIdempotencyKey(idempotencyKey);
      const input = parseReversalReason(body);

      const result = await idempotency.execute(
        {
          scopeType: 'organization',
          organizationId,
          actorId: actor.actorId,
          operation: 'accounts.transfer.reverse',
        },
        key,
        { transferId, reason: input.reason },
        async () => {
          const dto = await transactionRunner.run(async (session) => {
            const legs = await store.listMovementsBySourceId(organizationId, transferId, session);
            const outbound = legs.find((item) => item.sourceType === 'account_transfer_out');
            const inbound = legs.find((item) => item.sourceType === 'account_transfer_in');
            if (!outbound || !inbound) {
              throw notFound('Account transfer not found');
            }
            const existingOutReversal = await store.findMovementByReversalOfId(
              organizationId,
              String(outbound['_id']),
              session,
            );
            const existingInReversal = await store.findMovementByReversalOfId(
              organizationId,
              String(inbound['_id']),
              session,
            );
            if (existingOutReversal !== null || existingInReversal !== null) {
              throw conflict('Account transfer has already been reversed');
            }

            const source = await store.findAccountById(
              organizationId,
              String(outbound.accountId),
              session,
            );
            assertActiveAccount(source, 'sourceAccountId');
            const destination = await store.findAccountById(
              organizationId,
              String(inbound.accountId),
              session,
            );
            assertActiveAccount(destination, 'destinationAccountId');

            const postedAt = now();
            let reversalOutbound;
            let reversalInbound;
            try {
              reversalOutbound = await store.insertAccountMovement(session, {
                organizationId,
                accountId: outbound.accountId,
                signedAmountMinorUnits: negateMinorUnits(outbound.signedAmountMinorUnits),
                currency: outbound.currency ?? 'PKR',
                sourceType: 'account_transfer_out_reversal',
                sourceId: transferId,
                purpose: outbound.purpose ?? null,
                reference: outbound.reference ?? null,
                reversalOfId: outbound['_id'],
                status: 'posted',
                postedAt,
                postedBy: actor.actorId,
              });
              reversalInbound = await store.insertAccountMovement(session, {
                organizationId,
                accountId: inbound.accountId,
                signedAmountMinorUnits: negateMinorUnits(inbound.signedAmountMinorUnits),
                currency: inbound.currency ?? 'PKR',
                sourceType: 'account_transfer_in_reversal',
                sourceId: transferId,
                purpose: inbound.purpose ?? null,
                reference: inbound.reference ?? null,
                reversalOfId: inbound['_id'],
                status: 'posted',
                postedAt,
                postedBy: actor.actorId,
              });
            } catch (error) {
              mapDuplicate(error, 'Account transfer has already been reversed');
            }

            await auditWriter.appendBusinessEvent(session, {
              organizationId,
              actorId: actor.actorId,
              action: 'account.transfer.reversed',
              resourceType: 'account_transfer',
              resourceId: String(transferId),
              reason: input.reason,
              metadata: {
                outboundMovementId: String(outbound['_id']),
                inboundMovementId: String(inbound['_id']),
                reversalOutboundMovementId: String(reversalOutbound['_id']),
                reversalInboundMovementId: String(reversalInbound['_id']),
              },
            });

            const amountMinorUnits =
              BigInt(String(inbound.signedAmountMinorUnits)) < 0n
                ? negateMinorUnits(inbound.signedAmountMinorUnits)
                : String(inbound.signedAmountMinorUnits);

            return toAccountTransferDto({
              id: transferId,
              sourceAccountId: outbound.accountId,
              destinationAccountId: inbound.accountId,
              amountMinorUnits,
              currency: inbound.currency ?? 'PKR',
              purpose: inbound.purpose ?? null,
              reference: inbound.reference ?? null,
              outboundMovementId: outbound['_id'],
              inboundMovementId: inbound['_id'],
              reversalOutboundMovementId: reversalOutbound['_id'],
              reversalInboundMovementId: reversalInbound['_id'],
              status: 'reversed',
              postedAt,
              postedBy: actor.actorId,
              reason: input.reason,
            });
          });
          return { statusCode: 200, body: dto };
        },
      );
      return wrapIdempotentResult(result);
    },

    async listExpenseCategories(organizationId, options = {}) {
      const items = await store.listExpenseCategories(organizationId);
      const filtered =
        options.status === 'active' || options.status === 'inactive'
          ? items.filter((item) => String(item.status) === options.status)
          : items;
      return { items: filtered.map(toExpenseCategoryDto) };
    },

    async createExpenseCategory(organizationId, body, actor) {
      const input = parseExpenseCategoryCreate(body);
      try {
        return await transactionRunner.run(async (session) => {
          const created = await store.insertExpenseCategory(session, {
            organizationId,
            ...input,
            version: 1,
          });
          await auditWriter.appendBusinessEvent(session, {
            organizationId,
            actorId: actor.actorId,
            action: 'expense.category.created',
            resourceType: 'expense_category',
            resourceId: String(created['_id']),
            metadata: { name: created.name },
          });
          return toExpenseCategoryDto(created);
        });
      } catch (error) {
        mapDuplicate(error, 'Expense category name already exists in this organization');
      }
    },

    async updateExpenseCategory(organizationId, categoryId, body, actor) {
      const { expectedVersion, patch } = parseExpenseCategoryPatch(body);
      try {
        return await transactionRunner.run(async (session) => {
          const current = await store.findExpenseCategoryById(organizationId, categoryId, session);
          if (current === null) {
            throw notFound('Expense category not found');
          }
          assertOptimisticVersion(current, expectedVersion);
          const updated = await store.updateExpenseCategory(session, organizationId, categoryId, {
            ...patch,
            version: Number(current['version']) + 1,
          });
          await auditWriter.appendBusinessEvent(session, {
            organizationId,
            actorId: actor.actorId,
            action: 'expense.category.updated',
            resourceType: 'expense_category',
            resourceId: categoryId,
            metadata: { fields: Object.keys(patch) },
          });
          return toExpenseCategoryDto(updated);
        });
      } catch (error) {
        mapDuplicate(error, 'Expense category name already exists in this organization');
      }
    },

    async listExpenses(organizationId) {
      const items = await store.listExpenses(organizationId);
      return { items: items.map(toExpenseDto) };
    },

    async getExpense(organizationId, expenseId) {
      const record = await store.findExpenseById(organizationId, expenseId);
      if (record === null) {
        throw notFound('Expense not found');
      }
      return toExpenseDto(record);
    },

    async createExpenseDraft(organizationId, body, actor) {
      const input = parseExpenseDraftCreate(body);
      return transactionRunner.run(async (session) => {
        await assertExpenseMasters(store, organizationId, input, session);
        const created = await store.insertExpense(session, {
          organizationId,
          categoryId: input.categoryId,
          accountId: input.accountId,
          amountMinorUnits: input.amountMinorUnits,
          currency: input.currency,
          purpose: input.purpose,
          expenseDate: input.expenseDate,
          reference: input.reference,
          status: 'draft',
          version: 1,
        });
        void actor;
        return toExpenseDto(created);
      });
    },

    async updateExpenseDraft(organizationId, expenseId, body) {
      const { expectedVersion, patch } = parseExpenseDraftPatch(body);
      return transactionRunner.run(async (session) => {
        const current = await store.findExpenseById(organizationId, expenseId, session);
        if (current === null) {
          throw notFound('Expense not found');
        }
        if (current.status !== 'draft') {
          throw conflict('Only draft expenses can be updated');
        }
        assertOptimisticVersion(current, expectedVersion);
        const next = { ...current, ...patch };
        await assertExpenseMasters(store, organizationId, next, session);
        const updated = await store.updateExpense(session, organizationId, expenseId, {
          ...patch,
          version: Number(current['version']) + 1,
        });
        return toExpenseDto(updated);
      });
    },

    async discardExpenseDraft(organizationId, expenseId, actor) {
      return transactionRunner.run(async (session) => {
        const current = await store.findExpenseById(organizationId, expenseId, session);
        if (current === null) {
          throw notFound('Expense not found');
        }
        if (current.status !== 'draft') {
          throw conflict('Only draft expenses can be discarded');
        }
        const deleted = await store.deleteExpenseDraft(session, organizationId, expenseId);
        if (!deleted) {
          throw conflict('Only draft expenses can be discarded');
        }
        await auditWriter.appendBusinessEvent(session, {
          organizationId,
          actorId: actor.actorId,
          action: 'expense.draft.discarded',
          resourceType: 'expense',
          resourceId: expenseId,
          metadata: {},
        });
        return { id: expenseId, discarded: true };
      });
    },

    async postExpense(organizationId, expenseId, body, actor, idempotencyKey) {
      const key = requireIdempotencyKey(idempotencyKey);
      const input = parseExpensePost(body);

      const result = await idempotency.execute(
        {
          scopeType: 'organization',
          organizationId,
          actorId: actor.actorId,
          operation: 'expenses.post',
        },
        key,
        { expenseId, expectedVersion: input.expectedVersion },
        async () => {
          const dto = await transactionRunner.run(async (session) => {
            const current = await store.findExpenseById(organizationId, expenseId, session);
            if (current === null) {
              throw notFound('Expense not found');
            }
            if (current.status !== 'draft') {
              throw conflict('Only draft expenses can be posted');
            }
            assertOptimisticVersion(current, input.expectedVersion);
            await assertExpenseMasters(store, organizationId, current, session, {
              requireActiveCategory: true,
            });

            const postedAt = now();
            let movement;
            try {
              movement = await store.insertAccountMovement(session, {
                organizationId,
                accountId: current.accountId,
                signedAmountMinorUnits: negateMinorUnits(current.amountMinorUnits),
                currency: current.currency ?? 'PKR',
                sourceType: 'expense',
                sourceId: current['_id'],
                purpose: current.purpose,
                reference: current.reference ?? null,
                status: 'posted',
                postedAt,
                postedBy: actor.actorId,
              });
            } catch (error) {
              mapDuplicate(error, 'Expense account movement already exists');
            }

            const posted = await store.updateExpenseConditional(
              session,
              organizationId,
              expenseId,
              Number(current.version),
              {
                status: 'posted',
                postedAt,
                postedBy: actor.actorId,
                accountMovementId: movement['_id'],
                version: Number(current.version) + 1,
              },
            );
            if (posted === null) {
              throw versionConflict('Expense version conflict', {
                expectedVersion: Number(current.version),
              });
            }

            await auditWriter.appendBusinessEvent(session, {
              organizationId,
              actorId: actor.actorId,
              action: 'expense.posted',
              resourceType: 'expense',
              resourceId: expenseId,
              metadata: {
                categoryId: String(posted.categoryId),
                accountId: String(posted.accountId),
                amountMinorUnits: String(posted.amountMinorUnits),
                accountMovementId: String(movement['_id']),
                purpose: posted.purpose,
              },
            });

            return toExpenseDto(posted);
          });
          return { statusCode: 200, body: dto };
        },
      );
      return wrapIdempotentResult(result);
    },

    async correctExpense(organizationId, expenseId, body, actor, idempotencyKey) {
      const key = requireIdempotencyKey(idempotencyKey);
      const input = parseExpenseCorrect(body);

      const result = await idempotency.execute(
        {
          scopeType: 'organization',
          organizationId,
          actorId: actor.actorId,
          operation: 'expenses.correct',
        },
        key,
        { expenseId, reason: input.reason },
        async () => {
          const dto = await transactionRunner.run(async (session) => {
            const original = await store.findExpenseById(organizationId, expenseId, session);
            if (original === null) {
              throw notFound('Expense not found');
            }
            if (original.status === 'corrected' || original.correctionOfId) {
              throw conflict('Expense has already been corrected');
            }
            if (original.status !== 'posted') {
              throw conflict('Only posted expenses can be corrected');
            }
            assertOptimisticVersion(original, input.expectedVersion);

            const existingCorrection = await store.findExpenseByCorrectionOfId(
              organizationId,
              String(original['_id']),
              session,
            );
            if (existingCorrection !== null) {
              throw conflict('Expense has already been corrected');
            }

            const originalMovementId = original.accountMovementId
              ? String(original.accountMovementId)
              : null;
            if (!originalMovementId) {
              throw conflict('Posted expense is missing its account movement');
            }
            const originalMovement = await store.findMovementById(
              organizationId,
              originalMovementId,
              session,
            );
            if (originalMovement === null) {
              throw conflict('Posted expense is missing its account movement');
            }
            const existingMovementReversal = await store.findMovementByReversalOfId(
              organizationId,
              originalMovementId,
              session,
            );
            if (existingMovementReversal !== null) {
              throw conflict('Expense has already been corrected');
            }

            const account = await store.findAccountById(
              organizationId,
              String(original.accountId),
              session,
            );
            assertActiveAccount(account, 'accountId');

            const postedAt = now();
            let corrective;
            try {
              corrective = await store.insertExpense(session, {
                organizationId,
                categoryId: original.categoryId,
                accountId: original.accountId,
                amountMinorUnits: original.amountMinorUnits,
                currency: original.currency ?? 'PKR',
                purpose: original.purpose,
                expenseDate: original.expenseDate,
                reference: original.reference ?? null,
                status: 'posted',
                postedAt,
                postedBy: actor.actorId,
                correctionOfId: original['_id'],
                reason: input.reason,
                version: 1,
              });
            } catch (error) {
              mapDuplicate(error, 'Expense has already been corrected');
            }

            let reversalMovement;
            try {
              reversalMovement = await store.insertAccountMovement(session, {
                organizationId,
                accountId: original.accountId,
                signedAmountMinorUnits: negateMinorUnits(originalMovement.signedAmountMinorUnits),
                currency: originalMovement.currency ?? 'PKR',
                sourceType: 'expense_correction',
                sourceId: corrective['_id'],
                purpose: original.purpose,
                reference: original.reference ?? null,
                reversalOfId: originalMovement['_id'],
                status: 'posted',
                postedAt,
                postedBy: actor.actorId,
              });
            } catch (error) {
              mapDuplicate(error, 'Expense has already been corrected');
            }

            await store.updateExpense(session, organizationId, String(corrective['_id']), {
              accountMovementId: reversalMovement['_id'],
            });

            const updatedOriginal = await store.updateExpenseConditional(
              session,
              organizationId,
              expenseId,
              Number(original.version),
              {
                status: 'corrected',
                correctedByExpenseId: corrective['_id'],
                correctedAt: postedAt,
                correctedBy: actor.actorId,
                version: Number(original.version) + 1,
              },
            );
            if (updatedOriginal === null) {
              throw versionConflict('Expense version conflict', {
                expectedVersion: Number(original.version),
              });
            }

            await auditWriter.appendBusinessEvent(session, {
              organizationId,
              actorId: actor.actorId,
              action: 'expense.corrected',
              resourceType: 'expense',
              resourceId: expenseId,
              reason: input.reason,
              metadata: {
                originalExpenseId: expenseId,
                correctiveExpenseId: String(corrective['_id']),
                originalMovementId,
                reversalMovementId: String(reversalMovement['_id']),
              },
            });

            return toExpenseDto(updatedOriginal);
          });
          return { statusCode: 200, body: dto };
        },
      );
      return wrapIdempotentResult(result);
    },

    async countAccounts(organizationId) {
      return store.countAccounts(organizationId);
    },

    async countAccountsWithOpening(organizationId) {
      return store.countAccountsWithOpening(organizationId);
    },
  };
}

function createAccountsModule(options) {
  const persistence = options.persistence ?? 'memory';
  const store =
    options.store ??
    (persistence === 'mongoose' ? createMongooseAccountsStore() : createInMemoryAccountsStore());

  const sessionPort =
    options.sessionPort ??
    (persistence === 'mongoose'
      ? createMongooseTransactionSessionPort()
      : createMockTransactionSessionPort().port);

  const transactionRunner = options.transactionRunner ?? createTransactionRunner(sessionPort);
  const idempotencyStore =
    options.idempotencyStore ??
    (persistence === 'mongoose'
      ? createMongooseIdempotencyStore()
      : createInMemoryIdempotencyStore());
  const idempotency = options.idempotency ?? createIdempotencyService(idempotencyStore);

  const accountsService = createAccountsService({
    store,
    transactionRunner,
    idempotency,
    ...(options.now === undefined ? {} : { now: options.now }),
  });

  return { store, accountsService };
}

module.exports = {
  createAccountsService,
  createAccountsModule,
  createInMemoryAccountsStore,
  createMongooseAccountsStore,
};
