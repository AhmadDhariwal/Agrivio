// @ts-check
import { ApiTransportErrorCode } from '@agrivio/api-contracts';
import { AppError } from '../../../platform/errors/app-error.js';
import { generateActivationToken, hashToken } from './onboarding.service.js';
import { defaultActivationTokenExpiry } from '../../identity-access/persistence/activation-token.model.js';
import { defaultTrialEndsAt } from '../../subscriptions/persistence/subscription.model.js';

/**
 * @typedef {'approve' | 'reject'} OrgDecision
 *
 * @typedef {{
 *   findById: (id: string) => Promise<Record<string, unknown> | null>;
 *   activate: (id: string, actorId: string, session?: unknown) => Promise<void>;
 *   reject: (id: string, actorId: string, reason: string | undefined, session?: unknown) => Promise<void>;
 *   list: (filter: Record<string, unknown>) => Promise<Array<Record<string, unknown>>>;
 * }} OrganizationStore
 *
 * @typedef {{
 *   findByOrgAndRole: (orgId: string, role: string) => Promise<Record<string, unknown> | null>;
 *   activateOwner: (orgId: string, session?: unknown) => Promise<{userId: string} | null>;
 * }} MembershipStore
 *
 * @typedef {{
 *   createForUser: (doc: Record<string, unknown>, session?: unknown) => Promise<void>;
 * }} ActivationTokenStore
 *
 * @typedef {{
 *   createForOrg: (doc: Record<string, unknown>, session?: unknown) => Promise<void>;
 * }} SubscriptionStore
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
 *   organizationStore: OrganizationStore;
 *   membershipStore: MembershipStore;
 *   activationTokenStore: ActivationTokenStore;
 *   subscriptionStore: SubscriptionStore;
 *   auditWriter: AuditWriter;
 *   transactionRunner: TransactionRunner;
 * }} deps
 */
export function createPlatformOrgService({
  organizationStore,
  membershipStore,
  activationTokenStore,
  subscriptionStore,
  auditWriter,
  transactionRunner,
}) {
  return {
    /**
     * List organizations (platform view).
     * @param {{ status?: string }} query
     */
    async listOrganizations(query) {
      const filter = /** @type {Record<string, unknown>} */ ({});
      if (query.status) {
        filter['status'] = query.status;
      }
      return organizationStore.list(filter);
    },

    /**
     * View a single organization by ID (platform view).
     * @param {string} orgId
     */
    async getOrganization(orgId) {
      const org = await organizationStore.findById(orgId);
      if (org === null) {
        throw new AppError(ApiTransportErrorCode.NotFound, 'Organization not found', 404);
      }
      return org;
    },

    /**
     * Approve or reject a pending organization request.
     * Approval atomically activates org, owner membership, creates subscription, and issues activation token.
     * Plaintext token returned once; never stored.
     *
     * @param {{
     *   orgId: string;
     *   actorId: string;
     *   decision: OrgDecision;
     *   planCode?: string;
     *   reason?: string;
     * }} params
     * @returns {Promise<{ decision: OrgDecision; activationToken?: string }>}
     */
    async decideOrganization({ orgId, actorId, decision, planCode = 'Starter', reason }) {
      if (decision !== 'approve' && decision !== 'reject') {
        throw new AppError(
          ApiTransportErrorCode.ValidationFailed,
          'decision must be "approve" or "reject"',
          400,
        );
      }

      const org = await organizationStore.findById(orgId);
      if (org === null) {
        throw new AppError(ApiTransportErrorCode.NotFound, 'Organization not found', 404);
      }
      if (org['status'] !== 'pending') {
        throw new AppError(
          ApiTransportErrorCode.Conflict,
          `Organization is not pending (current status: ${org['status']})`,
          409,
        );
      }

      if (decision === 'reject') {
        /** @type {unknown} */
        const result = await transactionRunner.run(async (session) => {
          await organizationStore.reject(orgId, actorId, reason, session);

          await auditWriter.appendBusinessEvent(session, {
            actorId,
            action: 'organization.activation_request.rejected',
            resourceType: 'organization',
            resourceId: orgId,
            ...(reason !== undefined ? { reason } : {}),
          });

          return { decision: 'reject' };
        });
        return /** @type {{ decision: OrgDecision; activationToken?: string }} */ (result);
      }

      // approve
      const plaintext = generateActivationToken();
      const tokenHash = hashToken(plaintext);

      /** @type {unknown} */
      const result = await transactionRunner.run(async (session) => {
        await organizationStore.activate(orgId, actorId, session);

        const ownerInfo = await membershipStore.activateOwner(orgId, session);
        if (ownerInfo === null) {
          throw new AppError(
            ApiTransportErrorCode.Conflict,
            'No pending Owner membership found for organization',
            409,
          );
        }

        // Create trial subscription
        await subscriptionStore.createForOrg(
          {
            organizationId: orgId,
            planCode: planCode ?? 'Starter',
            status: 'trial',
            trialEndsAt: defaultTrialEndsAt(),
          },
          session,
        );

        // Issue activation token (stored hashed)
        await activationTokenStore.createForUser(
          {
            userId: ownerInfo.userId,
            organizationId: orgId,
            scope: 'owner-activation',
            tokenHash,
            expiresAt: defaultActivationTokenExpiry(),
            usedAt: null,
          },
          session,
        );

        await auditWriter.appendBusinessEvent(session, {
          actorId,
          action: 'organization.activation_request.approved',
          resourceType: 'organization',
          resourceId: orgId,
          metadata: { planCode: planCode ?? 'Starter', activationTokenIssued: true },
        });

        return { decision: 'approve' };
      });

      return {
        .../** @type {{ decision: OrgDecision }} */ (result),
        activationToken: plaintext,
      };
    },
  };
}
