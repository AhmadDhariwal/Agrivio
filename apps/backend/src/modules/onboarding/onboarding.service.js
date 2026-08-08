const { conflict, forbidden, notFound } = require('../../platform/errors/app-error');
const { createAuditWriter } = require('../../platform/audit/audit-writer');
const {
  buildApplicantFingerprint,
  generateActivationToken,
  hashToken,
} = require('../identity/crypto-tokens');
const { hashPassword } = require('../identity/password.service');
const {
  parseActivationBody,
  parseOrganizationActivationRequest,
  parseRejectionBody,
} = require('./onboarding.validation');

const DEFAULT_ACTIVATION_TTL_MS = 24 * 60 * 60 * 1000;
const DEFAULT_TRIAL_DAYS = 14;

function createOnboardingService(deps) {
  const store = deps.store;
  const now = deps.now ?? (() => new Date());
  const activationTtlMs = deps.activationTtlMs ?? DEFAULT_ACTIVATION_TTL_MS;
  const trialDays = deps.trialDays ?? DEFAULT_TRIAL_DAYS;
  const auditWriter = createAuditWriter({
    append: (session, event) => store.appendAuditEvent(session, event),
  });

  return {
    /**
     * Public organization activation request (R1-F02-005).
     */
    async submitActivationRequest(body) {
      const input = parseOrganizationActivationRequest(body);
      const fingerprint = buildApplicantFingerprint(input);

      return deps.transactionRunner.run(async (session) => {
        const existingOrg = await store.findOrganizationByFingerprint(fingerprint);
        if (existingOrg !== null) {
          return {
            duplicate: true,
            organizationId: String(existingOrg['_id']),
            status: existingOrg['status'],
            ownerEmail: input.ownerEmail,
          };
        }

        const existingUser = await store.findUserByEmailNormalized(input.ownerEmail);
        if (existingUser !== null && existingUser['status'] === 'active') {
          throw conflict('An account with this email already exists');
        }

        const user =
          existingUser ??
          (await store.insertUser(session, {
            email: input.ownerEmail,
            emailNormalized: input.ownerEmail,
            displayName: input.ownerDisplayName,
            status: 'pending_activation',
            version: 1,
          }));

        const organization = await store.insertOrganization(session, {
          name: input.organizationName,
          nameNormalized: input.organizationName.toLowerCase(),
          timezone: input.timezone,
          status: 'pending_approval',
          applicantFingerprint: fingerprint,
          ownerUserId: user['_id'],
          version: 1,
        });

        await store.insertMembership(session, {
          organizationId: organization['_id'],
          userId: user['_id'],
          role: 'Owner',
          status: 'pending',
          conditionalPermissionGrants: [],
          version: 1,
        });

        await store.insertSubscription(session, {
          organizationId: organization['_id'],
          status: 'pending_approval',
          planCode: 'Starter',
          planVersion: 1,
          version: 1,
        });

        await auditWriter.appendBusinessEvent(session, {
          organizationId: String(organization['_id']),
          actorId: 'public',
          action: 'organization.activation_requested',
          resourceType: 'organization',
          resourceId: String(organization['_id']),
          metadata: {
            ownerEmail: input.ownerEmail,
            applicantFingerprint: fingerprint,
          },
        });

        return {
          duplicate: false,
          organizationId: String(organization['_id']),
          status: 'pending_approval',
          ownerEmail: input.ownerEmail,
        };
      });
    },

    async listOrganizations(filter = {}) {
      const organizations = await store.listOrganizations(filter);
      return organizations.map(toOrganizationSummary);
    },

    async getOrganization(organizationId) {
      const organization = await store.findOrganizationById(organizationId);
      if (organization === null) {
        throw notFound('Organization not found');
      }

      const owner = await store.findUserById(String(organization['ownerUserId']));
      const subscription = await store.findSubscriptionByOrganizationId(organizationId);
      return {
        ...toOrganizationSummary(organization),
        owner: owner === null ? null : toUserSummary(owner),
        subscription:
          subscription === null
            ? null
            : {
                id: String(subscription['_id']),
                status: subscription['status'],
                planCode: subscription['planCode'],
                planVersion: subscription['planVersion'],
                trialEndsAt: subscription['trialEndsAt'] ?? null,
              },
      };
    },

    /**
     * Approve pending organization and issue Owner activation token (R1-F02-006).
     */
    async approveOrganization(organizationId, actor) {
      return deps.transactionRunner.run(async (session) => {
        const organization = await store.findOrganizationById(organizationId);
        if (organization === null) {
          throw notFound('Organization not found');
        }
        if (organization['status'] !== 'pending_approval') {
          throw conflict('Only pending organizations can be approved');
        }

        const ownerUserId = String(organization['ownerUserId']);
        const membership = await store.findMembership(organizationId, ownerUserId);
        if (membership === null) {
          throw conflict('Owner membership is missing');
        }

        const approvedAt = now();
        const trialEndsAt = new Date(approvedAt.getTime() + trialDays * 24 * 60 * 60 * 1000);
        const { token, tokenHash } = generateActivationToken();

        await store.updateOrganization(session, organizationId, {
          status: 'approved',
          approvedAt,
          rejectionReason: undefined,
          rejectedAt: undefined,
        });
        await store.updateMembership(session, String(membership['_id']), { status: 'active' });

        const subscription = await store.findSubscriptionByOrganizationId(organizationId);
        if (subscription === null) {
          throw conflict('Subscription record is missing');
        }
        await store.updateSubscription(session, String(subscription['_id']), {
          status: 'trial',
          trialEndsAt,
        });

        await store.insertActivationToken(session, {
          userId: ownerUserId,
          organizationId,
          tokenHash,
          expiresAt: new Date(approvedAt.getTime() + activationTtlMs),
          purpose: 'owner_activation',
        });

        await auditWriter.appendBusinessEvent(session, {
          organizationId,
          actorId: actor.actorId,
          action: 'organization.approved',
          resourceType: 'organization',
          resourceId: organizationId,
          metadata: { trialEndsAt: trialEndsAt.toISOString() },
        });

        return {
          organizationId,
          status: 'approved',
          subscriptionStatus: 'trial',
          trialEndsAt: trialEndsAt.toISOString(),
          // Plaintext token returned once for out-of-band delivery; never stored.
          activationToken: token,
          activationTokenExpiresAt: new Date(approvedAt.getTime() + activationTtlMs).toISOString(),
        };
      });
    },

    /**
     * Reject pending organization. Route name matches behaviour.
     */
    async rejectOrganization(organizationId, body, actor) {
      const { reason } = parseRejectionBody(body);

      return deps.transactionRunner.run(async (session) => {
        const organization = await store.findOrganizationById(organizationId);
        if (organization === null) {
          throw notFound('Organization not found');
        }
        if (organization['status'] !== 'pending_approval') {
          throw conflict('Only pending organizations can be rejected');
        }

        const rejectedAt = now();
        await store.updateOrganization(session, organizationId, {
          status: 'rejected',
          rejectionReason: reason,
          rejectedAt,
        });

        const subscription = await store.findSubscriptionByOrganizationId(organizationId);
        if (subscription !== null) {
          await store.updateSubscription(session, String(subscription['_id']), {
            status: 'rejected',
          });
        }

        await auditWriter.appendBusinessEvent(session, {
          organizationId,
          actorId: actor.actorId,
          action: 'organization.rejected',
          resourceType: 'organization',
          resourceId: organizationId,
          reason,
        });

        return {
          organizationId,
          status: 'rejected',
          reason,
          rejectedAt: rejectedAt.toISOString(),
        };
      });
    },

    /**
     * Consume one-time activation token and set Owner password.
     */
    async activateOwner(body) {
      const { token, password } = parseActivationBody(body);
      const tokenHash = hashToken(token);
      const passwordHash = await hashPassword(password);

      return deps.transactionRunner.run(async (session) => {
        const activation = await store.findActivationTokenByHash(tokenHash);
        if (activation === null) {
          throw forbidden('Activation token is invalid');
        }
        if (activation['consumedAt'] !== undefined && activation['consumedAt'] !== null) {
          throw conflict('Activation token has already been used');
        }

        const expiresAt = new Date(String(activation['expiresAt']));
        if (Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() <= now().getTime()) {
          throw forbidden('Activation token has expired');
        }

        const userId = String(activation['userId']);
        const organizationId = String(activation['organizationId']);
        const user = await store.findUserById(userId);
        const organization = await store.findOrganizationById(organizationId);
        if (user === null || organization === null) {
          throw notFound('Activation target not found');
        }
        if (organization['status'] !== 'approved') {
          throw conflict('Organization is not approved for activation');
        }

        await store.updateUser(session, userId, {
          passwordHash,
          status: 'active',
        });
        await store.updateActivationToken(session, String(activation['_id']), {
          consumedAt: now(),
        });

        await auditWriter.appendBusinessEvent(session, {
          organizationId,
          actorId: userId,
          action: 'user.activated',
          resourceType: 'user',
          resourceId: userId,
        });

        return {
          organizationId,
          userId,
          status: 'active',
        };
      });
    },
  };
}

function toOrganizationSummary(organization) {
  return {
    id: String(organization['_id']),
    name: organization['name'],
    timezone: organization['timezone'],
    status: organization['status'],
    ownerUserId: String(organization['ownerUserId']),
    rejectionReason: organization['rejectionReason'] ?? null,
    approvedAt: organization['approvedAt'] ?? null,
    rejectedAt: organization['rejectedAt'] ?? null,
  };
}

function toUserSummary(user) {
  return {
    id: String(user['_id']),
    email: user['email'],
    displayName: user['displayName'],
    status: user['status'],
    hasPassword: typeof user['passwordHash'] === 'string' && user['passwordHash'].length > 0,
  };
}

module.exports = {
  createOnboardingService,
  DEFAULT_ACTIVATION_TTL_MS,
  DEFAULT_TRIAL_DAYS,
};
