import { describe, expect, it } from 'vitest';
import { connectMongoClient } from '../index.js';

describe('replica set availability failures', () => {
  it('fails clearly when the replica set endpoint is unavailable', async () => {
    await expect(
      connectMongoClient('mongodb://127.0.0.1:37107/?replicaSet=rs0&serverSelectionTimeoutMS=500'),
    ).rejects.toThrow(/Server selection timed out|connect ECONNREFUSED|Replica set/);
  });
});
