const { createHash } = require('node:crypto');

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

function createInMemoryIdempotencyStore() {
  const records = new Map();
  const claimLocks = new Map();

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
            ...(record.organizationId === undefined
              ? {}
              : { organizationId: record.organizationId }),
          });
          return { kind: 'claimed' };
        }

        if (existing.requestHash !== record.requestHash) {
          return { kind: 'conflict', reason: 'Idempotency key reused with a different request' };
        }

        if (existing.state === 'completed' && existing.responseStatus !== undefined) {
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

        records.set(record.keyHash, { ...record, state: 'in_progress' });
        return { kind: 'claimed' };
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
      });
    },

    async fail(keyHash, requestHash) {
      const existing = records.get(keyHash);
      if (existing === undefined || existing.requestHash !== requestHash) {
        return;
      }
      records.set(keyHash, { ...existing, state: 'failed' });
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
  hashIdempotencyValue,
  buildIdempotencyKeyHash,
  buildRequestFingerprint,
  createInMemoryIdempotencyStore,
  createIdempotencyService,
};
