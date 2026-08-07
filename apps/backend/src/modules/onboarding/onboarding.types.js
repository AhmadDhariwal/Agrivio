// @ts-check

/**
 * @typedef {{
 *   status?: string;
 * }} OrganizationListFilter
 *
 * @typedef {{
 *   findOrganizationByFingerprint: (fingerprint: string) => Promise<Record<string, unknown> | null>;
 *   findOrganizationById: (id: string) => Promise<Record<string, unknown> | null>;
 *   listOrganizations: (filter?: OrganizationListFilter) => Promise<Record<string, unknown>[]>;
 *   insertOrganization: (session: unknown, doc: Record<string, unknown>) => Promise<Record<string, unknown>>;
 *   updateOrganization: (session: unknown, id: string, patch: Record<string, unknown>) => Promise<Record<string, unknown> | null>;
 *   findUserByEmailNormalized: (emailNormalized: string) => Promise<Record<string, unknown> | null>;
 *   findUserById: (id: string) => Promise<Record<string, unknown> | null>;
 *   insertUser: (session: unknown, doc: Record<string, unknown>) => Promise<Record<string, unknown>>;
 *   updateUser: (session: unknown, id: string, patch: Record<string, unknown>) => Promise<Record<string, unknown> | null>;
 *   findMembership: (organizationId: string, userId: string) => Promise<Record<string, unknown> | null>;
 *   insertMembership: (session: unknown, doc: Record<string, unknown>) => Promise<Record<string, unknown>>;
 *   updateMembership: (session: unknown, id: string, patch: Record<string, unknown>) => Promise<Record<string, unknown> | null>;
 *   findSubscriptionByOrganizationId: (organizationId: string) => Promise<Record<string, unknown> | null>;
 *   insertSubscription: (session: unknown, doc: Record<string, unknown>) => Promise<Record<string, unknown>>;
 *   updateSubscription: (session: unknown, id: string, patch: Record<string, unknown>) => Promise<Record<string, unknown> | null>;
 *   findActivationTokenByHash: (tokenHash: string) => Promise<Record<string, unknown> | null>;
 *   insertActivationToken: (session: unknown, doc: Record<string, unknown>) => Promise<Record<string, unknown>>;
 *   updateActivationToken: (session: unknown, id: string, patch: Record<string, unknown>) => Promise<Record<string, unknown> | null>;
 *   appendAuditEvent: (session: unknown, event: Record<string, unknown>) => Promise<void>;
 *   listAuditEventsForTest?: () => Record<string, unknown>[];
 * }} OnboardingStore
 */

module.exports = {};
