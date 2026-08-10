import { describe, expect, it } from 'vitest';
import {
  assertMongoConnectionContract,
  extractReplicaSetFromUri,
  buildDirectUri,
} from './mongo-startup-diagnostics.js';

describe('mongo startup diagnostics contract', () => {
  it('extracts replicaSet from URI', () => {
    expect(extractReplicaSetFromUri('mongodb://127.0.0.1:27017/?replicaSet=rs0')).toBe('rs0');
  });

  it('rejects URI without replicaSet', () => {
    const result = assertMongoConnectionContract({
      mongodbUri: 'mongodb://127.0.0.1:27017/',
      mongodbDbName: 'Agrivio',
      mongodbReplicaSet: 'rs0',
    });
    expect(result.ok).toBe(false);
    expect(result.code).toBe('invalid_database_configuration');
    expect(result.message).toMatch(/replicaSet/);
  });

  it('rejects URI replicaSet mismatch against MONGODB_REPLICA_SET', () => {
    const result = assertMongoConnectionContract({
      mongodbUri: 'mongodb://127.0.0.1:27017/?replicaSet=other',
      mongodbDbName: 'Agrivio',
      mongodbReplicaSet: 'rs0',
    });
    expect(result.ok).toBe(false);
    expect(result.code).toBe('invalid_database_configuration');
    expect(result.message).toMatch(/does not match/);
  });

  it('accepts matching local contract', () => {
    const result = assertMongoConnectionContract({
      mongodbUri: 'mongodb://127.0.0.1:27017/?replicaSet=rs0',
      mongodbDbName: 'Agrivio',
      mongodbReplicaSet: 'rs0',
    });
    expect(result).toEqual({
      ok: true,
      code: 'ok',
      message: 'ok',
      uriReplicaSet: 'rs0',
    });
  });

  it('builds a directConnection probe URI without replicaSet', () => {
    const direct = buildDirectUri('mongodb://127.0.0.1:27017/?replicaSet=rs0');
    expect(direct).toContain('directConnection=true');
    expect(direct).not.toContain('replicaSet=');
  });
});
