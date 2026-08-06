// @ts-check
import argon2 from 'argon2';
import { ApiTransportErrorCode } from '@agrivio/api-contracts';
import { AppError } from '../../../platform/errors/app-error.js';
import { hashToken } from '../../platform/services/onboarding.service.js';

const PASSWORD_MIN_LENGTH = 12;
const PASSWORD_MAX_LENGTH = 128;

/**
 * Validate a proposed password against the policy.
 * SECURITY_AUTHORIZATION.md §2.1: min 12, max 128 chars.
 * @param {string} password
 */
export function validatePassword(password) {
  /** @type {{ field: string; message: string }[]} */
  const issues = [];

  if (typeof password !== 'string' || password.length === 0) {
    issues.push({ field: 'password', message: 'password is required' });
  } else if (password.length < PASSWORD_MIN_LENGTH) {
    issues.push({
      field: 'password',
      message: `password must be at least ${PASSWORD_MIN_LENGTH} characters`,
    });
  } else if (password.length > PASSWORD_MAX_LENGTH) {
    issues.push({
      field: 'password',
      message: `password must not exceed ${PASSWORD_MAX_LENGTH} characters`,
    });
  }

  if (issues.length > 0) {
    throw new AppError(ApiTransportErrorCode.ValidationFailed, 'Validation failed', 400, issues);
  }
}

/**
 * Hash a password using Argon2id (SECURITY_AUTHORIZATION.md §2.1).
 * @param {string} plaintext
 * @returns {Promise<string>}
 */
export async function hashPassword(plaintext) {
  return argon2.hash(plaintext, { type: argon2.argon2id });
}

/**
 * Verify a password against a stored Argon2id hash.
 * @param {string} plaintext
 * @param {string} storedHash
 * @returns {Promise<boolean>}
 */
export async function verifyPassword(plaintext, storedHash) {
  try {
    return await argon2.verify(storedHash, plaintext);
  } catch {
    return false;
  }
}

/**
 * @typedef {{
 *   findByTokenHash: (hash: string) => Promise<Record<string, unknown> | null>;
 *   markUsed: (id: unknown, session?: unknown) => Promise<void>;
 * }} ActivationTokenStore
 *
 * @typedef {{
 *   findById: (id: unknown) => Promise<Record<string, unknown> | null>;
 *   setPasswordHashAndActivate: (id: unknown, passwordHash: string, session?: unknown) => Promise<void>;
 * }} UserStore
 *
 * @typedef {{
 *   appendBusinessEvent: (session: unknown, input: import('../../../platform/audit/audit-writer.js').AuditEventInput) => Promise<void>;
 * }} AuditWriter
 *
 * @typedef {{
 *   run: (work: (session: unknown) => Promise<unknown>) => Promise<unknown>;
 * }} TransactionRunner
 */

/**
 * @param {{
 *   activationTokenStore: ActivationTokenStore;
 *   userStore: UserStore;
 *   auditWriter: AuditWriter;
 *   transactionRunner: TransactionRunner;
 * }} deps
 */
export function createActivationService({
  activationTokenStore,
  userStore,
  auditWriter,
  transactionRunner,
}) {
  return {
    /**
     * Consume an activation token, hash and store the password, activate the user account.
     * Single-use; replays after success return the cached result without re-hashing.
     *
     * @param {{ token: string; password: string }} params
     * @returns {Promise<{ userId: string; organizationId: string | null }>}
     */
    async activateAccount({ token, password }) {
      // Validate password policy before expensive hash work
      validatePassword(password);

      if (typeof token !== 'string' || token.trim().length === 0) {
        throw new AppError(ApiTransportErrorCode.ValidationFailed, 'token is required', 400);
      }

      const tokenHash = hashToken(token.trim());
      const tokenDoc = await activationTokenStore.findByTokenHash(tokenHash);

      if (tokenDoc === null) {
        throw new AppError(
          ApiTransportErrorCode.NotFound,
          'Activation token not found or already expired',
          404,
        );
      }

      // Already used — idempotent success (safe replay)
      if (tokenDoc['usedAt'] !== null && tokenDoc['usedAt'] !== undefined) {
        return {
          userId: String(tokenDoc['userId']),
          organizationId: tokenDoc['organizationId'] ? String(tokenDoc['organizationId']) : null,
        };
      }

      // Expired check (TTL index handles DB cleanup, but check explicitly for safety)
      if (tokenDoc['expiresAt'] instanceof Date && tokenDoc['expiresAt'] < new Date()) {
        throw new AppError(ApiTransportErrorCode.TokenExpired, 'Activation token has expired', 410);
      }

      const passwordHash = await hashPassword(password);

      await transactionRunner.run(async (session) => {
        await activationTokenStore.markUsed(tokenDoc['_id'], session);

        await userStore.setPasswordHashAndActivate(tokenDoc['userId'], passwordHash, session);

        await auditWriter.appendBusinessEvent(session, {
          actorId: String(tokenDoc['userId']),
          ...(tokenDoc['organizationId']
            ? { organizationId: String(tokenDoc['organizationId']) }
            : {}),
          action: 'user.account.activated',
          resourceType: 'user',
          resourceId: String(tokenDoc['userId']),
        });
      });

      return {
        userId: String(tokenDoc['userId']),
        organizationId: tokenDoc['organizationId'] ? String(tokenDoc['organizationId']) : null,
      };
    },
  };
}
