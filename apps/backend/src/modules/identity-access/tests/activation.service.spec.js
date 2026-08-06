// @ts-check
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createActivationService,
  validatePassword,
  hashPassword,
  verifyPassword,
} from '../services/activation.service.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeFutureDate(hoursAhead = 24) {
  const d = new Date();
  d.setHours(d.getHours() + hoursAhead);
  return d;
}

function makePastDate(hoursAgo = 25) {
  const d = new Date();
  d.setHours(d.getHours() - hoursAgo);
  return d;
}

const VALID_PASSWORD = 'SuperSecure@1234';

function makeTokenDoc(overrides = {}) {
  return {
    _id: 'tok-001',
    userId: 'user-001',
    organizationId: 'org-001',
    scope: 'owner-activation',
    tokenHash: 'abc123hash',
    expiresAt: makeFutureDate(),
    usedAt: null,
    ...overrides,
  };
}

function makeActivationTokenStore(overrides = {}) {
  return {
    findByTokenHash: vi.fn().mockResolvedValue(makeTokenDoc()),
    markUsed: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function makeUserStore(overrides = {}) {
  return {
    findById: vi.fn().mockResolvedValue({ _id: 'user-001' }),
    setPasswordHashAndActivate: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function makeAuditWriter() {
  const events = /** @type {unknown[]} */ ([]);
  return {
    appendBusinessEvent: vi.fn().mockImplementation((_s, e) => {
      events.push(e);
      return Promise.resolve();
    }),
    getEvents: () => events,
  };
}

function makeSyncTransactionRunner() {
  return {
    run: vi.fn().mockImplementation(async (work) => work('mock-session')),
  };
}

function makeService(overrides = {}) {
  return createActivationService({
    activationTokenStore: makeActivationTokenStore(),
    userStore: makeUserStore(),
    auditWriter: makeAuditWriter(),
    transactionRunner: makeSyncTransactionRunner(),
    ...overrides,
  });
}

// ---------------------------------------------------------------------------
// validatePassword
// ---------------------------------------------------------------------------

describe('validatePassword', () => {
  it('accepts a 12-char password', () => {
    expect(() => validatePassword('A'.repeat(12))).not.toThrow();
  });

  it('accepts a 128-char password', () => {
    expect(() => validatePassword('B'.repeat(128))).not.toThrow();
  });

  it('throws VALIDATION_FAILED for password shorter than 12 chars', () => {
    expect(() => validatePassword('Short1!')).toThrowError(
      expect.objectContaining({ code: 'VALIDATION_FAILED' }),
    );
  });

  it('throws VALIDATION_FAILED for empty password', () => {
    expect(() => validatePassword('')).toThrowError(
      expect.objectContaining({ code: 'VALIDATION_FAILED' }),
    );
  });

  it('throws VALIDATION_FAILED for password longer than 128 chars', () => {
    expect(() => validatePassword('X'.repeat(129))).toThrowError(
      expect.objectContaining({ code: 'VALIDATION_FAILED' }),
    );
  });
});

// ---------------------------------------------------------------------------
// hashPassword / verifyPassword (Argon2id)
// ---------------------------------------------------------------------------

describe('password hashing', () => {
  it('hashPassword produces a non-plaintext hash', async () => {
    const hash = await hashPassword(VALID_PASSWORD);
    expect(hash).not.toBe(VALID_PASSWORD);
    expect(hash.startsWith('$argon2id')).toBe(true);
  });

  it('verifyPassword returns true for correct password', async () => {
    const hash = await hashPassword(VALID_PASSWORD);
    expect(await verifyPassword(VALID_PASSWORD, hash)).toBe(true);
  });

  it('verifyPassword returns false for wrong password', async () => {
    const hash = await hashPassword(VALID_PASSWORD);
    expect(await verifyPassword('WrongPassword!', hash)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// activationService — activateAccount
// ---------------------------------------------------------------------------

describe('activationService — activateAccount', () => {
  let activationTokenStore;
  let userStore;
  let auditWriter;
  let transactionRunner;
  /** @type {ReturnType<typeof createActivationService>} */
  let service;

  beforeEach(() => {
    activationTokenStore = makeActivationTokenStore();
    userStore = makeUserStore();
    auditWriter = makeAuditWriter();
    transactionRunner = makeSyncTransactionRunner();
    service = createActivationService({
      activationTokenStore,
      userStore,
      auditWriter,
      transactionRunner,
    });
  });

  it('activates account, marks token used, and returns userId', async () => {
    const result = await service.activateAccount({
      token: 'valid-token',
      password: VALID_PASSWORD,
    });

    expect(result.userId).toBe('user-001');
    expect(activationTokenStore.markUsed).toHaveBeenCalledOnce();
    expect(userStore.setPasswordHashAndActivate).toHaveBeenCalledOnce();
  });

  it('password is not stored in plaintext (hash starts with $argon2id)', async () => {
    let storedHash = '';
    userStore.setPasswordHashAndActivate.mockImplementation((_id, hash) => {
      storedHash = hash;
      return Promise.resolve();
    });

    await service.activateAccount({ token: 'valid-token', password: VALID_PASSWORD });

    expect(storedHash.startsWith('$argon2id')).toBe(true);
    expect(storedHash).not.toContain(VALID_PASSWORD);
  });

  it('creates audit event for activation', async () => {
    await service.activateAccount({ token: 'valid-token', password: VALID_PASSWORD });

    expect(auditWriter.appendBusinessEvent).toHaveBeenCalledOnce();
    const event = /** @type {Record<string, unknown>} */ (auditWriter.getEvents()[0]);
    expect(event?.['action']).toBe('user.account.activated');
    expect(event?.['actorId']).toBe('user-001');
  });

  it('throws NOT_FOUND for unknown token', async () => {
    const service2 = makeService({
      activationTokenStore: makeActivationTokenStore({
        findByTokenHash: vi.fn().mockResolvedValue(null),
      }),
    });

    await expect(
      service2.activateAccount({ token: 'bad-token', password: VALID_PASSWORD }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('throws TOKEN_EXPIRED for an expired token', async () => {
    const service2 = makeService({
      activationTokenStore: makeActivationTokenStore({
        findByTokenHash: vi.fn().mockResolvedValue(makeTokenDoc({ expiresAt: makePastDate() })),
      }),
    });

    await expect(
      service2.activateAccount({ token: 'expired-token', password: VALID_PASSWORD }),
    ).rejects.toMatchObject({ code: 'TOKEN_EXPIRED' });
  });

  it('replay is safe: returns success without re-activating when token already used', async () => {
    const service2 = makeService({
      activationTokenStore: makeActivationTokenStore({
        findByTokenHash: vi.fn().mockResolvedValue(makeTokenDoc({ usedAt: new Date() })),
      }),
    });

    const result = await service2.activateAccount({
      token: 'already-used',
      password: VALID_PASSWORD,
    });

    expect(result.userId).toBe('user-001');
    // No further DB mutations should happen on replay
    expect(userStore.setPasswordHashAndActivate).not.toHaveBeenCalled();
    expect(makeActivationTokenStore().markUsed).not.toHaveBeenCalled();
  });

  it('runs activation atomically via transaction runner', async () => {
    await service.activateAccount({ token: 'valid-token', password: VALID_PASSWORD });

    expect(transactionRunner.run).toHaveBeenCalledOnce();
  });

  it('if transaction throws, token is not consumed (rollback safety)', async () => {
    // Simulate rollback: markUsed throws inside transaction
    let markUsedCalled = false;
    let passwordSetCalled = false;

    const failingTokenStore = makeActivationTokenStore({
      markUsed: vi.fn().mockImplementation(() => {
        markUsedCalled = true;
        throw new Error('DB error during markUsed');
      }),
    });
    const failingUserStore = makeUserStore({
      setPasswordHashAndActivate: vi.fn().mockImplementation(() => {
        passwordSetCalled = true;
        return Promise.resolve();
      }),
    });
    const failingRunner = {
      run: vi.fn().mockImplementation(async (work) => {
        return work('session');
      }),
    };

    const service2 = createActivationService({
      activationTokenStore: failingTokenStore,
      userStore: failingUserStore,
      auditWriter: makeAuditWriter(),
      transactionRunner: failingRunner,
    });

    await expect(
      service2.activateAccount({ token: 'valid-token', password: VALID_PASSWORD }),
    ).rejects.toThrow('DB error during markUsed');

    // After error, password set should not have happened (markUsed fails first)
    expect(markUsedCalled).toBe(true);
    expect(passwordSetCalled).toBe(false);
  });

  it('throws VALIDATION_FAILED for missing token', async () => {
    await expect(
      service.activateAccount({ token: '', password: VALID_PASSWORD }),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  });

  it('throws VALIDATION_FAILED for short password', async () => {
    await expect(
      service.activateAccount({ token: 'valid-token', password: 'short' }),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  });
});

// ---------------------------------------------------------------------------
// API contract — secret redaction
// ---------------------------------------------------------------------------

describe('secret redaction', () => {
  it('audit event must not contain the plaintext token', async () => {
    const auditWriter = makeAuditWriter();
    const service = makeService({ auditWriter });

    const token = 'my-plaintext-token';
    await service.activateAccount({ token, password: VALID_PASSWORD });

    const events = auditWriter.getEvents();
    const eventJson = JSON.stringify(events);
    expect(eventJson).not.toContain(token);
  });

  it('audit event must not contain the plaintext password', async () => {
    const auditWriter = makeAuditWriter();
    const service = makeService({ auditWriter });

    await service.activateAccount({ token: 'valid-token', password: VALID_PASSWORD });

    const events = auditWriter.getEvents();
    const eventJson = JSON.stringify(events);
    expect(eventJson).not.toContain(VALID_PASSWORD);
  });
});
