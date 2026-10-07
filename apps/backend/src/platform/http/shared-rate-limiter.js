const { createHash } = require('crypto');
const { RateLimitBucketModel } = require('./persistence/rate-limit-bucket.model');

function createBoundedMemoryRateLimitStore(options = {}) {
  const maxBuckets = options.maxBuckets ?? 10_000;
  const buckets = new Map();

  function removeExpired(current) {
    for (const [key, bucket] of buckets) {
      if (bucket.resetAt <= current) {
        buckets.delete(key);
      }
    }
  }

  return {
    increment(key, current, resetAt, maximumCount) {
      const currentMs = current.getTime();
      const existing = buckets.get(key);
      if (existing !== undefined && existing.resetAt > currentMs) {
        existing.count = Math.min(existing.count + 1, maximumCount);
        return { count: existing.count, resetAt: new Date(existing.resetAt) };
      }

      if (buckets.size >= maxBuckets) {
        removeExpired(currentMs);
      }
      if (buckets.size >= maxBuckets) {
        const oldestKey = buckets.keys().next().value;
        if (oldestKey !== undefined) {
          buckets.delete(oldestKey);
        }
      }

      buckets.set(key, { count: 1, resetAt: resetAt.getTime() });
      return { count: 1, resetAt };
    },

    reset(key) {
      buckets.delete(key);
    },
  };
}

function createMongooseRateLimitStore(options = {}) {
  const model = options.model ?? RateLimitBucketModel;
  const namespace = options.namespace ?? 'default';

  function bucketId(key) {
    return createHash('sha256').update(namespace).update('\0').update(key).digest('hex');
  }

  async function increment(key, current, resetAt, maximumCount) {
    const expired = { $lte: [{ $ifNull: ['$resetAt', new Date(0)] }, current] };
    const update = [
      {
        $set: {
          count: {
            $cond: [
              expired,
              1,
              { $min: [{ $add: [{ $ifNull: ['$count', 0] }, 1] }, maximumCount] },
            ],
          },
          resetAt: { $cond: [expired, resetAt, '$resetAt'] },
        },
      },
    ];
    const id = bucketId(key);

    try {
      return await model
        .findOneAndUpdate({ _id: id }, update, {
          upsert: true,
          new: true,
        })
        .lean();
    } catch (error) {
      if (error?.code !== 11000) {
        throw error;
      }
      return model.findOneAndUpdate({ _id: id }, update, { new: true }).lean();
    }
  }

  return {
    increment,
    async reset(key) {
      await model.deleteOne({ _id: bucketId(key) });
    },
  };
}

function createSharedRateLimiter(options) {
  const windowMs = options.windowMs;
  const maxAttempts = options.maxAttempts;
  const now = options.now ?? (() => Date.now());
  const store = options.store;

  function evaluateBucket(bucket, currentMs) {
    if (bucket.count > maxAttempts) {
      const retryAfterSeconds = Math.max(
        1,
        Math.ceil((new Date(bucket.resetAt).getTime() - currentMs) / 1000),
      );
      throw options.createLimitError(retryAfterSeconds);
    }
  }

  return {
    assertAllowed(key) {
      const currentMs = now();
      const current = new Date(currentMs);
      const res = store.increment(
        key,
        current,
        new Date(currentMs + windowMs),
        maxAttempts + 1,
      );
      if (res && typeof res.then === 'function') {
        return res.then((bucket) => evaluateBucket(bucket, currentMs));
      }
      evaluateBucket(res, currentMs);
    },

    reset(key) {
      const res = store.reset(key);
      if (res && typeof res.then === 'function') {
        return res;
      }
    },
  };
}

module.exports = {
  createBoundedMemoryRateLimitStore,
  createMongooseRateLimitStore,
  createSharedRateLimiter,
};
