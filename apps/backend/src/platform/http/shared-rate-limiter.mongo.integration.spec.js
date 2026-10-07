import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import mongoose from 'mongoose';

const {
  RateLimitBucketModel,
  ensureRateLimitBucketIndexes,
} = require('./persistence/rate-limit-bucket.model');
const { createMongooseRateLimitStore, createSharedRateLimiter } = require('./shared-rate-limiter');
const { tooManyRequests } = require('../errors/app-error');

describe('shared Mongo rate limiter', () => {
  const uri = process.env['MONGODB_URI'] ?? 'mongodb://127.0.0.1:27017/Agrivio?replicaSet=rs0';
  const isolatedDb = `agrivio_test_rate_limit_${Date.now()}`;
  let mongoReady = false;

  beforeAll(async () => {
    const parsed = new URL(uri);
    parsed.pathname = `/${isolatedDb}`;
    try {
      await mongoose.connect(parsed.toString(), { serverSelectionTimeoutMS: 5_000 });
      await ensureRateLimitBucketIndexes();
      mongoReady = true;
    } catch {
      mongoReady = false;
      if (mongoose.connection.readyState !== 0) {
        await mongoose.disconnect();
      }
    }
  }, 60_000);

  afterAll(async () => {
    if (mongoReady) {
      await mongoose.connection.dropDatabase();
      await mongoose.disconnect();
    }
  });

  function limiter(now) {
    return createSharedRateLimiter({
      windowMs: 60_000,
      maxAttempts: 3,
      now,
      store: createMongooseRateLimitStore({ namespace: 'integration' }),
      createLimitError: (retryAfter) => tooManyRequests('Limited', retryAfter),
    });
  }

  it('shares atomic counters across limiter instances and resets expired buckets', async () => {
    if (!mongoReady) return;

    let current = 10_000;
    const first = limiter(() => current);
    const second = limiter(() => current);
    const results = await Promise.allSettled([
      first.assertAllowed('same-client'),
      second.assertAllowed('same-client'),
      first.assertAllowed('same-client'),
      second.assertAllowed('same-client'),
    ]);

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(3);
    const rejected = results.find((result) => result.status === 'rejected');
    expect(rejected?.reason).toMatchObject({
      statusCode: 429,
      code: 'TOO_MANY_REQUESTS',
      retryAfter: 60,
    });
    expect(await RateLimitBucketModel.countDocuments()).toBe(1);

    current += 60_001;
    await expect(second.assertAllowed('same-client')).resolves.toBeUndefined();
    const bucket = await RateLimitBucketModel.findOne().lean();
    expect(bucket?.count).toBe(1);
  });

  it('has an absolute-expiry TTL index and stores no raw client key', async () => {
    if (!mongoReady) return;

    await limiter(() => 20_000).assertAllowed('index-test-client');
    const indexes = await RateLimitBucketModel.collection.indexes();
    expect(indexes).toContainEqual(
      expect.objectContaining({
        name: 'rate_limit_expiry_ttl',
        key: { resetAt: 1 },
        expireAfterSeconds: 0,
      }),
    );
    const bucket = await RateLimitBucketModel.findOne({ count: 1 }).lean();
    expect(bucket?._id).toMatch(/^[a-f0-9]{64}$/);
    expect(bucket?._id).not.toContain('same-client');
  });
});
