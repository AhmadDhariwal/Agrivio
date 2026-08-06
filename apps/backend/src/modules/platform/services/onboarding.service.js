// @ts-check
import { createHash, randomBytes } from 'node:crypto';
import { ApiTransportErrorCode } from '@agrivio/api-contracts';
import { AppError } from '../../../platform/errors/app-error.js';

/**
 * @typedef {{
 *   orgName: string;
 *   ownerEmail: string;
 *   ownerName: string;
 *   timezone?: string;
 * }} ActivationRequestInput
 */

/**
 * @typedef {{
 *   findOneByEmail: (normalizedEmail: string) => Promise<{_id: unknown; status: string} | null>;
 *   create: (doc: Record<string, unknown>, session?: unknown) => Promise<{_id: unknown; status: string}>;
 * }} UserStore
 *
 * @typedef {{
 *   findPendingOrActiveByOwnerEmail: (normalizedEmail: string) => Promise<{_id: unknown; status: string} | null>;
 *   create: (doc: Record<string, unknown>, session?: unknown) => Promise<{_id: unknown}>;
 *   findById: (id: string) => Promise<Record<string, unknown> | null>;
 *   list: (filter: Record<string, unknown>) => Promise<Array<Record<string, unknown>>>;
 * }} OrganizationStore
 *
 * @typedef {{
 *   findByUserAndOrg: (userId: unknown, orgId: unknown) => Promise<Record<string, unknown> | null>;
 *   create: (doc: Record<string, unknown>, session?: unknown) => Promise<{_id: unknown}>;
 * }} MembershipStore
 *
 * @typedef {{
 *   appendBusinessEvent: (session: unknown, input: import('../../../platform/audit/audit-writer.js').AuditEventInput) => Promise<void>;
 * }} AuditWriter
 */

/**
 * Normalise an email address for globally-unique storage.
 * @param {string} email
 */
export function normalizeEmail(email) {
  return email.trim().toLowerCase();
}

/**
 * Validate an IANA timezone string (basic format check).
 * @param {string} tz
 */
export function isValidTimezone(tz) {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/**
 * Validate the onboarding input and return normalized fields.
 * @param {unknown} rawInput
 */
export function validateActivationRequestInput(rawInput) {
  const input = /** @type {ActivationRequestInput} */ (rawInput);
  /** @type {{ field: string; message: string }[]} */
  const issues = [];

  if (typeof input.orgName !== 'string' || input.orgName.trim().length === 0) {
    issues.push({ field: 'orgName', message: 'orgName is required' });
  } else if (input.orgName.trim().length > 200) {
    issues.push({ field: 'orgName', message: 'orgName must not exceed 200 characters' });
  }

  if (typeof input.ownerEmail !== 'string' || input.ownerEmail.trim().length === 0) {
    issues.push({ field: 'ownerEmail', message: 'ownerEmail is required' });
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.ownerEmail.trim())) {
    issues.push({ field: 'ownerEmail', message: 'ownerEmail must be a valid email address' });
  }

  if (typeof input.ownerName !== 'string' || input.ownerName.trim().length === 0) {
    issues.push({ field: 'ownerName', message: 'ownerName is required' });
  } else if (input.ownerName.trim().length > 200) {
    issues.push({ field: 'ownerName', message: 'ownerName must not exceed 200 characters' });
  }

  const timezone = input.timezone ?? 'Asia/Karachi';
  if (!isValidTimezone(timezone)) {
    issues.push({
      field: 'timezone',
      message: 'timezone must be a valid IANA timezone identifier',
    });
  }

  if (issues.length > 0) {
    throw new AppError(ApiTransportErrorCode.ValidationFailed, 'Validation failed', 400, issues);
  }

  return {
    orgName: input.orgName.trim(),
    normalizedName: input.orgName.trim().toLowerCase(),
    ownerEmail: input.ownerEmail.trim(),
    normalizedEmail: normalizeEmail(input.ownerEmail),
    ownerName: input.ownerName.trim(),
    timezone,
  };
}

/**
 * @param {{
 *   userStore: UserStore;
 *   organizationStore: OrganizationStore;
 *   membershipStore: MembershipStore;
 *   auditWriter: AuditWriter;
 * }} deps
 */
export function createOnboardingService({
  userStore,
  organizationStore,
  membershipStore,
  auditWriter,
}) {
  return {
    /**
     * Submit a public organization activation request.
     * Creates pending organization, pending user (if new), and pending Owner membership.
     *
     * @param {unknown} input - raw request body; validated internally
     * @param {unknown} [session] - MongoDB session for transactional safety if available
     * @returns {Promise<{ organizationId: string; isNewUser: boolean }>}
     */
    async submitActivationRequest(input, session) {
      const normalized = validateActivationRequestInput(input);

      // Prevent duplicate active or pending requests for same owner email
      const existingOrg = await organizationStore.findPendingOrActiveByOwnerEmail(
        normalized.normalizedEmail,
      );
      if (existingOrg !== null) {
        throw new AppError(
          ApiTransportErrorCode.DuplicateRequest,
          'A pending or active organization request already exists for this email address',
          409,
        );
      }

      // Find or create user
      let existingUser = await userStore.findOneByEmail(normalized.normalizedEmail);
      let isNewUser = false;

      if (existingUser === null) {
        existingUser = await userStore.create(
          {
            email: normalized.ownerEmail,
            normalizedEmail: normalized.normalizedEmail,
            displayName: normalized.ownerName,
            passwordHash: null,
            status: 'pending',
            isPlatformUser: false,
            platformPermissions: [],
          },
          session,
        );
        isNewUser = true;
      }

      // Create pending organization
      const org = await organizationStore.create(
        {
          name: normalized.orgName,
          normalizedName: normalized.normalizedName,
          timezone: normalized.timezone,
          status: 'pending',
        },
        session,
      );

      // Create pending Owner membership
      await membershipStore.create(
        {
          organizationId: org._id,
          userId: existingUser._id,
          role: 'Owner',
          status: 'pending',
          conditionalPermissionGrants: [],
        },
        session,
      );

      // Audit
      await auditWriter.appendBusinessEvent(session, {
        actorId: String(existingUser._id),
        action: 'organization.activation_request.submitted',
        resourceType: 'organization',
        resourceId: String(org._id),
        metadata: {
          orgName: normalized.orgName,
          ownerEmail: '[REDACTED]',
          isNewUser,
        },
      });

      return { organizationId: String(org._id), isNewUser };
    },

    /**
     * List organizations filtered by status, for Super Admin review.
     * @param {{ status?: string; page?: number; pageSize?: number }} query
     */
    async listOrganizations(query) {
      const filter = /** @type {Record<string, unknown>} */ ({});
      if (query.status) {
        filter['status'] = query.status;
      }
      return organizationStore.list(filter);
    },

    /**
     * Get a single organization by ID.
     * @param {string} orgId
     */
    async getOrganization(orgId) {
      const org = await organizationStore.findById(orgId);
      if (org === null) {
        throw new AppError(ApiTransportErrorCode.NotFound, 'Organization not found', 404);
      }
      return org;
    },
  };
}

/**
 * Create a SHA-256 hash of a plaintext token for safe storage.
 * @param {string} plaintext
 */
export function hashToken(plaintext) {
  return createHash('sha256').update(plaintext, 'utf8').digest('hex');
}

/**
 * Generate a random activation token (URL-safe base64, 32 bytes = 256 bits).
 * @returns {string}
 */
export function generateActivationToken() {
  return randomBytes(32).toString('base64url');
}
