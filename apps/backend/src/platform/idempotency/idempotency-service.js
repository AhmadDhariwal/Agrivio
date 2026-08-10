const { createHash } = require('node:crypto');

const DEFAULT_IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;

function hashIdempotencyValue(value) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function buildIdempotencyKeyHash(scope, key) {
  const parts = [scope.scopeType, scope.organizationId ?? '', scope.actorId, scope.operation, key];
  return hashIdempotencyValue(parts.join('::'));
}

function buildRequestFingerprint(requestFingerprintInput) {
  return hashIdempotencyValue(JSON.stringify(requestFingerprintInput));
}

function resolveClaimOutcome(existing, record) {
  if (existing.requestHash !== record.requestHash) {
    return { kind: 'conflict', reason: 'Idempotency key reused with a different request' };
  }

  if (existing.state === 'completed' && existing.responseStatus !== undefined && existing.responseStatus !== null) {
    return {
      kind: 'replay',
      response: {
        statusCode: existing.responseStatus,
        body: existing.responseBody,
      },
    };
  }

  if (existing.state === 'in_progress') {
    return { kind: 'in_progress' };
  }

  return { kind: 'reclaim' };
}

function createInMemoryIdempotencyStore(options = {}) {
  const records = new Map();
  const claimLocks = new Map();
  const ttlMs = options.ttlMs ?? DEFAULT_IDEMPOTENCY_TTL_MS;
  const now = options.now ?? (() => new Date());

  return {
    async claim(record) {
      const lockKey = record.keyHash;
      while (claimLocks.has(lockKey)) {
        await claimLocks.get(lockKey);
      }

      let releaseLock;
      const lock = new Promise((resolve) => {
        releaseLock = () => {
          resolve(undefined);
        };
      });
      claimLocks.set(lockKey, lock);

      try {
        const existing = records.get(record.keyHash);
        if (existing === undefined) {
          records.set(record.keyHash, {
            scopeType: record.scopeType,
            actorId: record.actorId,
            operation: record.operation,
            keyHash: record.keyHash,
            requestHash: record.requestHash,
            state: 'in_progress',
            expiresAt: new Date(now().getTime() + ttlMs),
            ...(record.organizationId === undefined
              ? {}
              : { organizationId: record.organizationId }),
          });
          return { kind: 'claimed' };
        }

        const outcome = resolveClaimOutcome(existing, record);
        if (outcome.kind === 'reclaim') {
          records.set(record.keyHash, {
            ...existing,
            requestHash: record.requestHash,
            state: 'in_progress',
            responseStatus: null,
            responseBody: null,
            completedAt: null,
            expiresAt: new Date(now().getTime() + ttlMs),
          });
          return { kind: 'claimed' };
        }
        return outcome;
      } finally {
        claimLocks.delete(lockKey);
        if (typeof releaseLock === 'function') {
          releaseLock();
        }
      }
    },

    async complete(keyHash, requestHash, response) {
      const existing = records.get(keyHash);
      if (existing === undefined || existing.requestHash !== requestHash) {
        throw new Error('Cannot complete unknown idempotency claim');
      }

      records.set(keyHash, {
        ...existing,
        state: 'completed',
        responseStatus: response.statusCode,
        responseBody: response.body,
        completedAt: now(),
      });
    },

    async fail(keyHash, requestHash) {
      const existing = records.get(keyHash);
      if (existing === undefined || existing.requestHash !== requestHash) {
        return;
      }
      records.set(keyHash, { ...existing, state: 'failed', completedAt: now() });
    },
  };
}

function createMongooseIdempotencyStore(options = {}) {
  const mongoose = require('mongoose');
  const { IdempotencyRecordModel } = require('./persistence/idempotency-record.model');
  const ttlMs = options.ttlMs ?? DEFAULT_IDEMPOTENCY_TTL_MS;
  const now = options.now ?? (() => new Date());

  function asObjectIdOrNull(value) {
    if (value === undefined || value === null || value === '') {
      return null;
    }
    if (value instanceof mongoose.Types.ObjectId) {
      return value;
    }
    if (mongoose.isValidObjectId(value)) {
      return new mongoose.Types.ObjectId(String(value));
    }
    return value;
  }

  function findExistingQuery(record) {
    if (record.scopeType === 'organization') {
      return {
        scopeType: 'organization',
        organizationId: asObjectIdOrNull(record.organizationId),
        actorId: record.actorId,
        operation: record.operation,
        keyHash: record.keyHash,
      };
    }
    return {
      scopeType: record.scopeType,
      actorId: record.actorId,
      operation: record.operation,
      keyHash: record.keyHash,
    };
  }

  return {
    async claim(record) {
      const expiresAt = new Date(now().getTime() + ttlMs);
      const organizationId = asObjectIdOrNull(record.organizationId);
      try {
        await IdempotencyRecordModel.create([
          {
            scopeType: record.scopeType,
            actorId: record.actorId,
            operation: record.operation,
            keyHash: record.keyHash,
            requestHash: record.requestHash,
            state: 'in_progress',
            expiresAt,
            ...(organizationId === null ? {} : { organizationId }),
          },
        ]);
        return { kind: 'claimed' };
      } catch (error) {
        if (!(error && (error.code === 11000 || error.code === 11001))) {
          throw error;
        }
      }

      const existing = await IdempotencyRecordModel.findOne(findExistingQuery(record)).lean().exec();
      if (existing === null) {
        throw new Error('Idempotency claim conflict without existing record');
      }

      const outcome = resolveClaimOutcome(existing, record);
      if (outcome.kind !== 'reclaim') {
        return outcome;
      }

      const reclaimed = await IdempotencyRecordModel.findOneAndUpdate(
        {
          ...findExistingQuery(record),
          state: { $in: ['failed'] },
          requestHash: existing.requestHash,
        },
        {
          $set: {
            requestHash: record.requestHash,
            state: 'in_progress',
            responseStatus: null,
            responseBody: null,
            completedAt: null,
            expiresAt,
          },
        },
        { new: true },
      )
        .lean()
        .exec();

      if (reclaimed === null) {
        return { kind: 'in_progress' };
      }
      return { kind: 'claimed' };
    },

    async complete(keyHash, requestHash, response) {
      const updated = await IdempotencyRecordModel.findOneAndUpdate(
        { keyHash, requestHash, state: 'in_progress' },
        {
          $set: {
            state: 'completed',
            responseStatus: response.statusCode,
            responseBody: response.body,
            completedAt: now(),
          },
        },
        { new: true },
      )
        .lean()
        .exec();
      if (updated === null) {
        throw new Error('Cannot complete unknown idempotency claim');
      }
    },

    async fail(keyHash, requestHash) {
      await IdempotencyRecordModel.findOneAndUpdate(
        { keyHash, requestHash, state: 'in_progress' },
        {
          $set: {
            state: 'failed',
            completedAt: now(),
          },
        },
      ).exec();
    },
  };
}

function createIdempotencyService(store) {
  return {
    async execute(scope, key, requestFingerprintInput, handler) {
      const keyHash = buildIdempotencyKeyHash(scope, key);
      const requestHash = buildRequestFingerprint(requestFingerprintInput);

      const claim = await store.claim({
        scopeType: scope.scopeType,
        actorId: scope.actorId,
        operation: scope.operation,
        keyHash,
        requestHash,
        state: 'in_progress',
        ...(scope.organizationId === undefined ? {} : { organizationId: scope.organizationId }),
      });

      if (claim.kind === 'replay') {
        return { replay: true, response: claim.response };
      }

      if (claim.kind === 'conflict') {
        const error = new Error(claim.reason);
        error.name = 'IdempotencyConflictError';
        throw error;
      }

      if (claim.kind === 'in_progress') {
        const error = new Error('Idempotency key is already in progress');
        error.name = 'IdempotencyInProgressError';
        throw error;
      }

      try {
        const response = await handler();
        await store.complete(keyHash, requestHash, response);
        return { replay: false, response };
      } catch (error) {
        await store.fail(keyHash, requestHash);
        throw error;
      }
    },
  };
}

module.exports = {
  DEFAULT_IDEMPOTENCY_TTL_MS,
  hashIdempotencyValue,
  buildIdempotencyKeyHash,
  buildRequestFingerprint,
  createInMemoryIdempotencyStore,
  createMongooseIdempotencyStore,
  createIdempotencyService,
};
