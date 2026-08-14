import { describe, expect, it } from 'vitest';
import {
  EnvValidationError,
  loadApiEnv,
  redactSecrets,
  toSafeApiEnvSummary,
} from './runtime-config';
describe('loadApiEnv', () => {
  it('accepts a complete non-test configuration', () => {
    const config = loadApiEnv({
      NODE_ENV: 'development',
      AGRIVIO_APP_PROFILE: 'local',
      HOST: '127.0.0.1',
      PORT: '4000',
      MONGODB_URI: 'mongodb://127.0.0.1:27017/?replicaSet=rs0',
      MONGODB_DB_NAME: 'Agrivio',
      MONGODB_REPLICA_SET: 'rs0',
      SESSION_SECRET: 'abcdefghijklmnopqrstuvwxyz012345',
    });

    expect(config.port).toBe(4000);
    expect(config.host).toBe('127.0.0.1');
    expect(config.profile).toBe('local');
    expect(config.mongodbDbName).toBe('Agrivio');
    expect(config.publicWebBaseUrl).toBe('http://localhost:4200');
    expect(config.allowedOrigins).toEqual(['http://localhost:4200']);
    expect(config.allowLoopbackBrowserOrigins).toBe(true);
    expect(config.allowE2eBootstrap).toBe(false);
  });

  it('parses extra allowed origins without enabling E2E bootstrap', () => {
    const config = loadApiEnv({
      NODE_ENV: 'development',
      MONGODB_URI: 'mongodb://127.0.0.1:27017/?replicaSet=rs0',
      SESSION_SECRET: 'abcdefghijklmnopqrstuvwxyz012345',
      AGRIVIO_PUBLIC_WEB_BASE_URL: 'http://localhost:4400',
      AGRIVIO_ALLOWED_ORIGINS: 'http://127.0.0.1:4400, https://preview.example.com',
    });

    expect(config.publicWebBaseUrl).toBe('http://localhost:4400');
    expect(config.allowedOrigins).toEqual([
      'http://localhost:4400',
      'http://127.0.0.1:4400',
      'https://preview.example.com',
    ]);
    expect(config.allowLoopbackBrowserOrigins).toBe(true);
    expect(config.allowE2eBootstrap).toBe(false);
  });

  it('rejects wildcard credentialed CORS configuration', () => {
    expect(() =>
      loadApiEnv({
        NODE_ENV: 'development',
        MONGODB_URI: 'mongodb://127.0.0.1:27017/?replicaSet=rs0',
        SESSION_SECRET: 'abcdefghijklmnopqrstuvwxyz012345',
        AGRIVIO_ALLOWED_ORIGINS: '*',
      }),
    ).toThrow(/AGRIVIO_ALLOWED_ORIGINS/);
  });

  it('requires AGRIVIO_PUBLIC_WEB_BASE_URL in production and never auto-allows loopback', () => {
    expect(() =>
      loadApiEnv({
        NODE_ENV: 'production',
        SESSION_SECRET: 'abcdefghijklmnopqrstuvwxyz012345',
        MONGODB_URI: 'mongodb://127.0.0.1:27017/?replicaSet=rs0',
      }),
    ).toThrow(/AGRIVIO_PUBLIC_WEB_BASE_URL/);

    const config = loadApiEnv({
      NODE_ENV: 'production',
      SESSION_SECRET: 'abcdefghijklmnopqrstuvwxyz012345',
      MONGODB_URI: 'mongodb://127.0.0.1:27017/?replicaSet=rs0',
      AGRIVIO_PUBLIC_WEB_BASE_URL: 'https://app.example.com',
    });
    expect(config.allowedOrigins).toEqual(['https://app.example.com']);
    expect(config.allowLoopbackBrowserOrigins).toBe(false);
  });

  it('defaults non-test MONGODB_DB_NAME to Agrivio when unset', () => {
    const config = loadApiEnv({
      NODE_ENV: 'development',
      MONGODB_URI: 'mongodb://127.0.0.1:27017/?replicaSet=rs0',
      SESSION_SECRET: 'abcdefghijklmnopqrstuvwxyz012345',
    });
    expect(config.mongodbDbName).toBe('Agrivio');
  });

  it('fails fast when required secrets are missing outside test', () => {
    expect(() =>
      loadApiEnv({
        NODE_ENV: 'production',
        HOST: '0.0.0.0',
        PORT: '3000',
      }),
    ).toThrow(EnvValidationError);
  });

  it('allows test-profile placeholders without production secrets', () => {
    const config = loadApiEnv({
      NODE_ENV: 'test',
    });

    expect(config.profile).toBe('test');
    expect(config.sessionSecret).toBe('test-session-secret');
    expect(config.mongodbDbName).toBe('agrivio_test_default');
    expect(config.mongodbDbName).not.toBe('Agrivio');
  });

  it('rejects invalid PORT values', () => {
    expect(() =>
      loadApiEnv({
        NODE_ENV: 'test',
        PORT: 'not-a-port',
      }),
    ).toThrow(/PORT/);
  });
});

describe('secret handling', () => {
  it('redacts secret values from log text', () => {
    const env = {
      SESSION_SECRET: 'super-secret-session-value-0123456789',
      MONGODB_URI: 'mongodb://user:pass@127.0.0.1:27017/agrivio',
    };

    const message = redactSecrets(
      `boot failed SESSION_SECRET=${env.SESSION_SECRET} uri=${env.MONGODB_URI}`,
      env,
    );

    expect(message).not.toContain(env.SESSION_SECRET);
    expect(message).not.toContain(env.MONGODB_URI);
    expect(message).toContain('[REDACTED]');
  });

  it('never includes secret values in the safe summary', () => {
    const config = loadApiEnv({
      NODE_ENV: 'development',
      MONGODB_URI: 'mongodb://user:pass@127.0.0.1:27017/agrivio',
      SESSION_SECRET: 'abcdefghijklmnopqrstuvwxyz012345',
    });

    const summary = JSON.stringify(toSafeApiEnvSummary(config));
    expect(summary).not.toContain('mongodb://user:pass');
    expect(summary).not.toContain(config.sessionSecret);
    expect(summary).toContain('"sessionSecretConfigured":"yes"');
  });
});
