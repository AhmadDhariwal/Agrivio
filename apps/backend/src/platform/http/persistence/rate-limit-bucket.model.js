const mongoose = require('mongoose');

const rateLimitBucketSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true },
    count: { type: Number, required: true, min: 1 },
    resetAt: { type: Date, required: true },
  },
  {
    collection: 'rate_limit_buckets',
    versionKey: false,
  },
);

rateLimitBucketSchema.index(
  { resetAt: 1 },
  { expireAfterSeconds: 0, name: 'rate_limit_expiry_ttl' },
);

const RateLimitBucketModel =
  mongoose.models['RateLimitBucket'] || mongoose.model('RateLimitBucket', rateLimitBucketSchema);

async function ensureRateLimitBucketIndexes() {
  await RateLimitBucketModel.collection.createIndex(
    { resetAt: 1 },
    { expireAfterSeconds: 0, name: 'rate_limit_expiry_ttl' },
  );
}

module.exports = {
  RateLimitBucketModel,
  ensureRateLimitBucketIndexes,
};
