const { conflict, forbidden, notFound, validationFailed } = require('../../platform/errors/app-error');
const { createAuditWriter } = require('../../platform/audit/audit-writer');
const {
  createIdempotencyService,
  createInMemoryIdempotencyStore,
  createMongooseIdempotencyStore,
} = require('../../platform/idempotency/idempotency-service');
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
  let subscriptionStore = deps.subscriptionStore ?? store;
  const now = deps.now ?? (() => new Date());
  const activationTtlMs = deps.activationTtlMs ?? DEFAULT_ACTIVATION_TTL_MS;
  const trialDays = deps.trialDays ?? DEFAULT_TRIAL_DAYS;
  const publicWebBaseUrl = normalizePublicWebBaseUrl(
    deps.publicWebBaseUrl ?? 'http://localhost:4200',
  );
  const auditWriter = createAuditWriter({
    append: (session, event) => store.appendAuditEvent(session, event),
  });
  let subscriptionBridge = deps.subscriptionBridge ?? null;
  const idempotency =
    deps.idempotency ??
    createIdempotencyService(
      deps.persistence === 'mongoose'
        ? createMongooseIdempotencyStore()
        : createInMemoryIdempotencyStore(),
    );

  function requireIdempotencyKey(idempotencyKey) {
    if (typeof idempotencyKey !== 'string' || idempotencyKey.trim() === '') {
      throw validationFailed('Idempotency-Key header is required', [
        { field: 'Idempotency-Key', message: 'Idempotency-Key header is required' },
      ]);
    }
    return idempotencyKey.trim();
  }

  function wrapIdempotentResult(result) {
    return {
      replay: result.replay,
      data: result.response.body,
      statusCode: result.response.statusCode,
    };
  }

  async function createPendingOrganization(session, input, actorId, auditAction) {
    const fingerprint = buildApplicantFingerprint(input);
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

    const planRef =
      subscriptionBridge === null
        ? { planCode: 'Starter', planVersion: 1, planId: null }
        : await subscriptionBridge.resolveTrialPlanReference('Starter');

    await subscriptionStore.insertSubscription(session, {
      organizationId: organization['_id'],
      status: 'pending_approval',
      planCode: planRef.planCode,
      planVersion: planRef.planVersion,
      planId: planRef.planId,
      version: 1,
    });

    await auditWriter.appendBusinessEvent(session, {
      organizationId: String(organization['_id']),
      actorId,
      action: auditAction,
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
  }

  return {
    setSubscriptionBridge(bridge) {
      subscriptionBridge = bridge;
    },

    setSubscriptionStore(nextStore) {
      subscriptionStore = nextStore;
    },

    /**
     * Public organization activation request (R1-F02-005).
     */
    async submitActivationRequest(body) {
      const input = parseOrganizationActivationRequest(body);
      return deps.transactionRunner.run(async (session) => {
        return createPendingOrganization(
          session,
          input,
          'public',
          'organization.activation_requested',
        );
      });
    },

    async createOrganization(body, actor, idempotencyKey) {
      const key = requireIdempotencyKey(idempotencyKey);
      const input = parseOrganizationActivationRequest(body);
      const result = await idempotency.execute(
        {
          scopeType: 'platform',
          actorId: actor.actorId,
          operation: 'platform.organizations.create',
        },
        key,
        input,
        async () => {
          const created = await deps.transactionRunner.run(async (session) => {
            return createPendingOrganization(
              session,
              input,
              actor.actorId,
              'organization.created_by_platform',
            );
          });
          return {
            statusCode: created.duplicate ? 200 : 201,
            body: created,
          };
        },
      );
      return wrapIdempotentResult(result);
    },

    async suspendOrganization(organizationId, body, actor, idempotencyKey) {
      const key = requireIdempotencyKey(idempotencyKey);
      const { reason } = parseRejectionBody(body);
      const result = await idempotency.execute(
        {
          scopeType: 'platform',
          actorId: actor.actorId,
          operation: 'platform.organizations.suspend',
        },
        key,
        { organizationId, reason },
        async () => {
          const organization = await store.findOrganizationById(organizationId);
          if (organization === null) {
            throw notFound('Organization not found');
          }
          if (
            subscriptionBridge === null ||
            typeof subscriptionBridge.getOrganizationSubscription !== 'function' ||
            typeof subscriptionBridge.suspendSubscription !== 'function'
          ) {
            throw conflict('Subscription lifecycle is not available');
          }

          const subscription = await subscriptionBridge.getOrganizationSubscription(organizationId);
          if (subscription.status === 'suspended') {
            await auditWriter.appendBusinessEvent(null, {
              organizationId,
              actorId: actor.actorId,
              action: 'organization.suspended',
              resourceType: 'organization',
              resourceId: organizationId,
              reason,
              metadata: {
                alreadySuspended: true,
                subscriptionId: subscription.id,
              },
            });
            return {
              statusCode: 200,
              body: {
                organizationId,
                status: organization['status'],
                subscriptionStatus: 'suspended',
                subscriptionId: subscription.id,
              },
            };
          }

          const updated = await subscriptionBridge.suspendSubscription(
            subscription.id,
            { expectedVersion: subscription.version, reason },
            actor,
          );

          await auditWriter.appendBusinessEvent(null, {
            organizationId,
            actorId: actor.actorId,
            action: 'organization.suspended',
            resourceType: 'organization',
            resourceId: organizationId,
            reason,
            metadata: {
              subscriptionId: updated.id,
              subscriptionStatus: updated.status,
            },
          });

          return {
            statusCode: 200,
            body: {
              organizationId,
              status: organization['status'],
              subscriptionStatus: updated.status,
              subscriptionId: updated.id,
            },
          };
        },
      );
      return wrapIdempotentResult(result);
    },

    async listOrganizations(filter = {}) {
      const organizations = await store.listOrganizations(filter);
      const summaries = [];
      for (const organization of organizations) {
        summaries.push(await toOrganizationListItem(store, organization));
      }
      return summaries;
    },

    async getOrganization(organizationId) {
      const organization = await store.findOrganizationById(organizationId);
      if (organization === null) {
        throw notFound('Organization not found');
      }

      const owner = await store.findUserById(String(organization['ownerUserId']));
      const subscription =
        await subscriptionStore.findSubscriptionByOrganizationId(organizationId);
      return {
        ...(await toOrganizationListItem(store, organization, owner)),
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
        const owner = await store.findUserById(ownerUserId);
        if (owner === null) {
          throw conflict('Owner user is missing');
        }
        const membership = await store.findMembership(organizationId, ownerUserId);
        if (membership === null) {
          throw conflict('Owner membership is missing');
        }

        const approvedAt = now();
        const trialEndsAt = new Date(approvedAt.getTime() + trialDays * 24 * 60 * 60 * 1000);
        const expiresAt = new Date(approvedAt.getTime() + activationTtlMs);
        const { token, tokenHash } = generateActivationToken();

        await store.updateOrganization(session, organizationId, {
          status: 'approved',
          approvedAt,
          rejectionReason: undefined,
          rejectedAt: undefined,
        });
        await store.updateMembership(session, String(membership['_id']), { status: 'active' });

        const subscription =
          await subscriptionStore.findSubscriptionByOrganizationId(organizationId);
        if (subscription === null) {
          throw conflict('Subscription record is missing');
        }
        await subscriptionStore.updateSubscription(session, String(subscription['_id']), {
          status: 'trial',
          trialEndsAt,
          planCode: subscription['planCode'],
          planVersion: subscription['planVersion'],
          ...(subscription['planId'] ? { planId: subscription['planId'] } : {}),
          version: Number(subscription['version'] ?? 1) + 1,
        });

        if (
          subscriptionBridge !== null &&
          typeof subscriptionBridge.markReferencedPlan === 'function'
        ) {
          await subscriptionBridge.markReferencedPlan(
            subscription['planCode'],
            subscription['planVersion'],
            session,
            approvedAt,
          );
        }

        await store.insertActivationToken(session, {
          userId: ownerUserId,
          organizationId,
          tokenHash,
          expiresAt,
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

        return buildActivationHandoff({
          organizationId,
          status: 'approved',
          subscriptionStatus: 'trial',
          trialEndsAt: trialEndsAt.toISOString(),
          owner,
          token,
          expiresAt,
          publicWebBaseUrl,
        });
      });
    },

    /**
     * Reissue one-time Owner activation token for approved org with no usable password yet.
     * Invalidates prior unconsumed tokens. Plaintext returned once only.
     */
    async reissueOwnerActivationToken(organizationId, actor) {
      return deps.transactionRunner.run(async (session) => {
        const organization = await store.findOrganizationById(organizationId);
        if (organization === null) {
          throw notFound('Organization not found');
        }
        if (organization['status'] !== 'approved') {
          throw conflict('Activation tokens can only be reissued for approved organizations');
        }

        const ownerUserId = String(organization['ownerUserId']);
        const owner = await store.findUserById(ownerUserId);
        if (owner === null) {
          throw conflict('Owner user is missing');
        }
        if (!ownerNeedsActivation(owner)) {
          throw conflict('Owner already has usable credentials; activation reissue is not allowed');
        }

        const issuedAt = now();
        const expiresAt = new Date(issuedAt.getTime() + activationTtlMs);
        const openTokens = await store.listOpenActivationTokens({
          userId: ownerUserId,
          organizationId,
        });
        for (const openToken of openTokens) {
          await store.updateActivationToken(session, String(openToken['_id']), {
            consumedAt: issuedAt,
          });
        }

        const { token, tokenHash } = generateActivationToken();
        await store.insertActivationToken(session, {
          userId: ownerUserId,
          organizationId,
          tokenHash,
          expiresAt,
          purpose: 'owner_activation',
        });

        await auditWriter.appendBusinessEvent(session, {
          organizationId,
          actorId: actor.actorId,
          action: 'organization.activation_token_reissued',
          resourceType: 'organization',
          resourceId: organizationId,
          metadata: { ownerUserId },
        });

        return buildActivationHandoff({
          organizationId,
          status: organization['status'],
          owner,
          token,
          expiresAt,
          publicWebBaseUrl,
          reissued: true,
        });
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

        const subscription =
          await subscriptionStore.findSubscriptionByOrganizationId(organizationId);
        if (subscription !== null) {
          await subscriptionStore.updateSubscription(session, String(subscription['_id']), {
            status: 'rejected',
            version: Number(subscription['version'] ?? 1) + 1,
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

        const membership = await store.findMembership(organizationId, userId);
        if (membership !== null && membership['status'] === 'pending') {
          await store.updateMembership(session, String(membership['_id']), {
            status: 'active',
            version: Number(membership['version'] ?? 1) + 1,
          });
        }

        await store.updateActivationToken(session, String(activation['_id']), {
          consumedAt: now(),
        });

        await auditWriter.appendBusinessEvent(session, {
          organizationId,
          actorId: userId,
          action: 'user.activated',
          resourceType: 'user',
          resourceId: userId,
          metadata: {
            purpose: activation['purpose'] ?? 'owner_activation',
          },
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

function normalizePublicWebBaseUrl(value) {
  const parsed = new URL(value);
  return parsed.origin;
}

function buildActivationPath(token) {
  return `/activate?token=${encodeURIComponent(token)}`;
}

function buildActivationUrl(publicWebBaseUrl, token) {
  return `${publicWebBaseUrl}${buildActivationPath(token)}`;
}

function buildActivationHandoff(input) {
  const ownerEmail = String(input.owner['email'] ?? '');
  const ownerDisplayName = String(input.owner['displayName'] ?? '');
  return {
    organizationId: input.organizationId,
    status: input.status,
    ...(input.subscriptionStatus === undefined
      ? {}
      : { subscriptionStatus: input.subscriptionStatus }),
    ...(input.trialEndsAt === undefined ? {} : { trialEndsAt: input.trialEndsAt }),
    ...(input.reissued === true ? { reissued: true } : {}),
    ownerEmail,
    ownerDisplayName,
    // Plaintext token returned once for out-of-band delivery; never stored.
    activationToken: input.token,
    activationTokenExpiresAt: input.expiresAt.toISOString(),
    activationPath: buildActivationPath(input.token),
    activationUrl: buildActivationUrl(input.publicWebBaseUrl, input.token),
  };
}

function ownerNeedsActivation(owner) {
  if (owner['status'] !== 'pending_activation') {
    return false;
  }
  return !(typeof owner['passwordHash'] === 'string' && owner['passwordHash'].length > 0);
}

async function toOrganizationListItem(store, organization, preloadedOwner) {
  const owner =
    preloadedOwner === undefined
      ? await store.findUserById(String(organization['ownerUserId']))
      : preloadedOwner;
  return {
    ...toOrganizationSummary(organization),
    ownerEmail: owner === null ? null : owner['email'],
    ownerStatus: owner === null ? null : owner['status'],
    ownerNeedsActivation: owner === null ? false : ownerNeedsActivation(owner),
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
  buildActivationPath,
  buildActivationUrl,
};
