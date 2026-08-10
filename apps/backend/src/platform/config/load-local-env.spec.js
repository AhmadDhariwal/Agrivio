import { describe, expect, it, vi } from 'vitest';
import path from 'node:path';
import {
  shouldLoadLocalEnv,
  resolveLocalEnvCandidates,
  loadLocalDevelopmentEnv,
} from './load-local-env.js';

describe('loadLocalDevelopmentEnv', () => {
  it('skips loading when NODE_ENV=test', () => {
    expect(shouldLoadLocalEnv({ NODE_ENV: 'test' })).toBe(false);
  });

  it('skips loading when CI is set', () => {
    expect(shouldLoadLocalEnv({ CI: 'true', NODE_ENV: 'development' })).toBe(false);
  });

  it('resolves repo-root and package-local candidates from apps/backend', () => {
    const backendRoot = path.join('repo', 'apps', 'backend');
    const candidates = resolveLocalEnvCandidates(backendRoot);
    expect(candidates[0]).toBe(path.resolve(backendRoot, '../../.env.local'));
    expect(candidates[1]).toBe(path.resolve(backendRoot, '.env.local'));
  });

  it('loads the first existing .env.local without overriding caller env', () => {
    const loadEnvFile = vi.fn();
    const backendRoot = path.join('repo', 'apps', 'backend');
    const result = loadLocalDevelopmentEnv({
      env: { NODE_ENV: 'development' },
      backendRoot,
      existsSync: (candidate) => candidate === path.resolve(backendRoot, '../../.env.local'),
      loadEnvFile,
    });

    expect(result.loaded).toBe(true);
    expect(result.path).toBe(path.resolve(backendRoot, '../../.env.local'));
    expect(loadEnvFile).toHaveBeenCalledTimes(1);
  });

  it('respects AGRIVIO_SKIP_ENV_FILE', () => {
    expect(
      shouldLoadLocalEnv({
        NODE_ENV: 'development',
        AGRIVIO_SKIP_ENV_FILE: 'true',
      }),
    ).toBe(false);
  });
});
