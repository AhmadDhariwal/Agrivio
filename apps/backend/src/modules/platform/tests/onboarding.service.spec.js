// @ts-check
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createOnboardingService,
  validateActivationRequestInput,
  hashToken,
  generateActivationToken,
  normalizeEmail,
} from '../services/onboarding.service.js';
import { AppError } from '../../../platform/errors/app-error.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeUserStore(overrides = {}) {
  return {
    findOneByEmail: vi.fn().mockResolvedValue(null),
    create: vi.fn().mockImplementation((data) => ({
      _id: 'user-001',
      ...data,
    })),
    ...overrides,
  };
}

function makeOrgStore(overrides = {}) {
  return {
    findPendingOrActiveByOwnerEmail: vi.fn().mockResolvedValue(null),
    create: vi.fn().mockImplementation((data) => ({ _id: 'org-001', ...data })),
    findById: vi.fn().mockResolvedValue(null),
    list: vi.fn().mockResolvedValue([]),
    ...overrides,
  };
}

function makeMembershipStore(overrides = {}) {
  return {
    findByUserAndOrg: vi.fn().mockResolvedValue(null),
    create: vi.fn().mockResolvedValue({ _id: 'mem-001' }),
    activateOwner: vi.fn().mockResolvedValue({ userId: 'user-001' }),
    ...overrides,
  };
}

function makeAuditWriter() {
  const events = /** @type {unknown[]} */ ([]);
  return {
    appendBusinessEvent: vi.fn().mockImplementation((_session, event) => {
      events.push(event);
      return Promise.resolve();
    }),
    getEvents: () => events,
  };
}

const validInput = {
  orgName: 'Green Farms Ltd',
  ownerEmail: 'owner@greenfarms.pk',
  ownerName: 'Ali Hassan',
  timezone: 'Asia/Karachi',
};

// ---------------------------------------------------------------------------
// validateActivationRequestInput
// ---------------------------------------------------------------------------

describe('validateActivationRequestInput', () => {
  it('accepts valid input and normalizes fields', () => {
    const result = validateActivationRequestInput(validInput);
    expect(result.orgName).toBe('Green Farms Ltd');
    expect(result.normalizedEmail).toBe('owner@greenfarms.pk');
    expect(result.timezone).toBe('Asia/Karachi');
  });

  it('uses default timezone when not provided', () => {
    const result = validateActivationRequestInput({ ...validInput, timezone: undefined });
    expect(result.timezone).toBe('Asia/Karachi');
  });

  it('throws VALIDATION_FAILED for missing orgName', () => {
    expect(() => validateActivationRequestInput({ ...validInput, orgName: '' })).toThrow(AppError);
    try {
      validateActivationRequestInput({ ...validInput, orgName: '' });
    } catch (e) {
      const err = /** @type {AppError} */ (e);
      expect(err.code).toBe('VALIDATION_FAILED');
      expect(/** @type {unknown[]} */ (err.details)?.[0]).toMatchObject({ field: 'orgName' });
    }
  });

  it('throws VALIDATION_FAILED for missing ownerEmail', () => {
    expect(() => validateActivationRequestInput({ ...validInput, ownerEmail: '' })).toThrow(
      AppError,
    );
  });

  it('throws VALIDATION_FAILED for invalid email format', () => {
    try {
      validateActivationRequestInput({ ...validInput, ownerEmail: 'not-an-email' });
      expect.fail('should throw');
    } catch (e) {
      const err = /** @type {AppError} */ (e);
      expect(err.code).toBe('VALIDATION_FAILED');
    }
  });

  it('throws VALIDATION_FAILED for invalid timezone', () => {
    try {
      validateActivationRequestInput({ ...validInput, timezone: 'Not/ATimezone' });
      expect.fail('should throw');
    } catch (e) {
      expect(/** @type {AppError} */ (e).code).toBe('VALIDATION_FAILED');
    }
  });

  it('throws VALIDATION_FAILED when orgName exceeds 200 chars', () => {
    try {
      validateActivationRequestInput({ ...validInput, orgName: 'A'.repeat(201) });
      expect.fail('should throw');
    } catch (e) {
      expect(/** @type {AppError} */ (e).code).toBe('VALIDATION_FAILED');
    }
  });
});

// ---------------------------------------------------------------------------
// createOnboardingService — submitActivationRequest
// ---------------------------------------------------------------------------

describe('onboarding service — submitActivationRequest', () => {
  /** @type {ReturnType<typeof makeUserStore>} */
  let userStore;
  /** @type {ReturnType<typeof makeOrgStore>} */
  let orgStore;
  /** @type {ReturnType<typeof makeMembershipStore>} */
  let membershipStore;
  /** @type {ReturnType<typeof makeAuditWriter>} */
  let auditWriter;
  /** @type {ReturnType<typeof createOnboardingService>} */
  let service;

  beforeEach(() => {
    userStore = makeUserStore();
    orgStore = makeOrgStore();
    membershipStore = makeMembershipStore();
    auditWriter = makeAuditWriter();
    service = createOnboardingService({
      userStore,
      organizationStore: orgStore,
      membershipStore,
      auditWriter,
    });
  });

  it('creates pending org, new user, and Owner membership for a new applicant', async () => {
    const result = await service.submitActivationRequest(validInput);

    expect(result.organizationId).toBeDefined();
    expect(result.isNewUser).toBe(true);
    expect(userStore.create).toHaveBeenCalledOnce();
    expect(orgStore.create).toHaveBeenCalledOnce();
    expect(membershipStore.create).toHaveBeenCalledOnce();

    const membershipArg = membershipStore.create.mock.calls[0]?.[0];
    expect(membershipArg?.role).toBe('Owner');
    expect(membershipArg?.status).toBe('pending');
  });

  it('reuses existing pending user rather than creating a duplicate', async () => {
    userStore.findOneByEmail.mockResolvedValue({ _id: 'existing-user', status: 'pending' });

    const result = await service.submitActivationRequest(validInput);

    expect(result.isNewUser).toBe(false);
    expect(userStore.create).not.toHaveBeenCalled();
  });

  it('throws DUPLICATE_REQUEST when a pending or active org exists for the email', async () => {
    orgStore.findPendingOrActiveByOwnerEmail.mockResolvedValue({
      _id: 'existing-org',
      status: 'pending',
    });

    await expect(service.submitActivationRequest(validInput)).rejects.toThrow(AppError);
    try {
      await service.submitActivationRequest(validInput);
    } catch (e) {
      expect(/** @type {AppError} */ (e).code).toBe('DUPLICATE_REQUEST');
      expect(/** @type {AppError} */ (e).statusCode).toBe(409);
    }
  });

  it('throws DUPLICATE_REQUEST when an active org exists for the email', async () => {
    orgStore.findPendingOrActiveByOwnerEmail.mockResolvedValue({
      _id: 'existing-org',
      status: 'active',
    });

    await expect(service.submitActivationRequest(validInput)).rejects.toMatchObject({
      code: 'DUPLICATE_REQUEST',
    });
  });

  it('creates audit event with redacted owner email', async () => {
    await service.submitActivationRequest(validInput);

    expect(auditWriter.appendBusinessEvent).toHaveBeenCalledOnce();
    const event = auditWriter.getEvents()[0];
    const metadata = /** @type {Record<string, unknown>} */ (event?.['metadata']);
    // Email must not be stored in audit event
    expect(metadata?.['ownerEmail']).toBe('[REDACTED]');
    expect(metadata?.['ownerEmail']).not.toContain('@');
  });

  it('creates org with status:pending', async () => {
    await service.submitActivationRequest(validInput);

    const orgArg = orgStore.create.mock.calls[0]?.[0];
    expect(orgArg?.status).toBe('pending');
  });

  it('throws VALIDATION_FAILED for invalid input', async () => {
    await expect(
      service.submitActivationRequest({
        orgName: '',
        ownerEmail: '',
        ownerName: '',
        timezone: 'Asia/Karachi',
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  });
});

// ---------------------------------------------------------------------------
// createOnboardingService — listOrganizations / getOrganization
// ---------------------------------------------------------------------------

describe('onboarding service — list and get', () => {
  it('lists organizations with status filter', async () => {
    const orgStore = makeOrgStore({
      list: vi.fn().mockResolvedValue([{ _id: 'org-1', status: 'pending' }]),
    });
    const service = createOnboardingService({
      userStore: makeUserStore(),
      organizationStore: orgStore,
      membershipStore: makeMembershipStore(),
      auditWriter: makeAuditWriter(),
    });

    const orgs = await service.listOrganizations({ status: 'pending' });
    expect(orgs).toHaveLength(1);
    expect(orgStore.list).toHaveBeenCalledWith({ status: 'pending' });
  });

  it('throws NOT_FOUND when organization does not exist', async () => {
    const service = createOnboardingService({
      userStore: makeUserStore(),
      organizationStore: makeOrgStore({ findById: vi.fn().mockResolvedValue(null) }),
      membershipStore: makeMembershipStore(),
      auditWriter: makeAuditWriter(),
    });

    await expect(service.getOrganization('nonexistent')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});

// ---------------------------------------------------------------------------
// Token utilities
// ---------------------------------------------------------------------------

describe('token utilities', () => {
  it('hashToken produces consistent SHA-256 hex digest', () => {
    const h1 = hashToken('my-token');
    const h2 = hashToken('my-token');
    expect(h1).toBe(h2);
    expect(h1).toHaveLength(64);
    expect(/^[0-9a-f]+$/.test(h1)).toBe(true);
  });

  it('generateActivationToken produces 43 base64url chars (256 bits)', () => {
    const t = generateActivationToken();
    expect(typeof t).toBe('string');
    expect(t.length).toBeGreaterThanOrEqual(43);
    expect(/^[A-Za-z0-9_-]+$/.test(t)).toBe(true);
  });

  it('two generated tokens are different', () => {
    expect(generateActivationToken()).not.toBe(generateActivationToken());
  });

  it('normalizeEmail lowercases and trims', () => {
    expect(normalizeEmail('  Owner@Example.COM  ')).toBe('owner@example.com');
  });
});
