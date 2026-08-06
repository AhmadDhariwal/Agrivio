// @ts-check
import { redactLogFields } from '../logging/redact-log-fields.js';

/**
 * @typedef {{
 *   organizationId?: string;
 *   actorId: string;
 *   action: string;
 *   resourceType: string;
 *   resourceId?: string;
 *   reason?: string;
 *   metadata?: Record<string, unknown>;
 *   occurredAt?: Date;
 * }} AuditEventInput
 */

/**
 * @param {AuditEventInput} input
 * @returns {Record<string, unknown>}
 */
export function sanitizeAuditEvent(input) {
  return redactLogFields({
    organizationId: input.organizationId,
    actorId: input.actorId,
    action: input.action,
    resourceType: input.resourceType,
    resourceId: input.resourceId,
    reason: input.reason,
    occurredAt: (input.occurredAt ?? new Date()).toISOString(),
    ...(input.metadata === undefined ? {} : { metadata: input.metadata }),
  });
}

/**
 * @typedef {{
 *   append: (session: unknown, event: Record<string, unknown>) => Promise<void>;
 *   listForTest?: () => readonly Record<string, unknown>[];
 * }} AuditEventStore
 */

/**
 * @returns {AuditEventStore}
 */
export function createInMemoryAuditEventStore() {
  /** @type {Record<string, unknown>[]} */
  const events = [];

  return {
    async append(_session, event) {
      events.push({ ...event, _immutable: true });
    },
    listForTest() {
      return events;
    },
  };
}

/**
 * @param {AuditEventStore} store
 */
export function createAuditWriter(store) {
  return {
    /**
     * Append-only business audit event inside the authoritative transaction.
     * @param {unknown} session
     * @param {AuditEventInput} input
     */
    async appendBusinessEvent(session, input) {
      const sanitized = sanitizeAuditEvent(input);
      await store.append(session, sanitized);
    },
  };
}
