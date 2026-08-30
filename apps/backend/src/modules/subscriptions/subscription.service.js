const { createAuditWriter } = require('../../platform/audit/audit-writer');
const {
  conflict,
  forbidden,
  notFound,
  validationFailed,
  versionConflict,
} = require('../../platform/errors/app-error');
const { computeCoverageWindow, coverageIsCurrent } = require('./billing-period');
const { ALLOWED_EVIDENCE_TYPES, parseEvidenceStorageRef } = require('./billing-evidence-storage');
const {
  DEFAULT_GRACE_DAYS,
  DEFAULT_RETENTION_DAYS,
  DEFAULT_TRIAL_DAYS,
  applyExpiryTransitions,
  assertTransition,
  buildSubscriptionAccessState,
  daysFrom,
  evaluateFeatureEntitlement,
  evaluateNumericLimit,
} = require('./entitlement');
const {
  parseBillingApproveBody,
  parseBillingQueueQuery,
  parseBillingRejectBody,
  parseBillingSubmitBody,
  parseChangePlanBody,
  parseExpectedVersion,
  parseLifecycleBody,
  parsePlanCreateBody,
} = require('./subscription.validation');

function toPlanSummary(plan) {
  return {
    id: String(plan._id),
    planCode: plan.planCode,
    planVersion: plan.planVersion,
    status: plan.status,
    currency: plan.currency,
    monthlyPriceMinorUnits: plan.monthlyPriceMinorUnits ?? null,
    annualPriceMinorUnits: plan.annualPriceMinorUnits ?? null,
    annualDiscountPercent: plan.annualDiscountPercent ?? null,
    trialEligible: plan.trialEligible !== false,
    limits: plan.limits ?? {},
    entitlements: plan.entitlements ?? {},
    referencedAt: plan.referencedAt ? new Date(plan.referencedAt).toISOString() : null,
    version: plan.version,
  };
}

function toSubscriptionSummary(subscription) {
  return {
    id: String(subscription._id),
    organizationId: String(subscription.organizationId),
    status: subscription.status,
    planCode: subscription.planCode,
    planVersion: subscription.planVersion,
    planId: subscription.planId ? String(subscription.planId) : null,
    billingPeriod: subscription.billingPeriod ?? null,
    trialEndsAt: subscription.trialEndsAt ? new Date(subscription.trialEndsAt).toISOString() : null,
    graceEndsAt: subscription.graceEndsAt ? new Date(subscription.graceEndsAt).toISOString() : null,
    periodStartsAt: subscription.periodStartsAt
      ? new Date(subscription.periodStartsAt).toISOString()
      : null,
    periodEndsAt: subscription.periodEndsAt
      ? new Date(subscription.periodEndsAt).toISOString()
      : null,
    cancelledAt: subscription.cancelledAt ? new Date(subscription.cancelledAt).toISOString() : null,
    retainedUntil: subscription.retainedUntil
      ? new Date(subscription.retainedUntil).toISOString()
      : null,
    version: subscription.version,
  };
}

function toBillingSummary(record, { includeEvidenceMeta = false } = {}) {
  const base = {
    id: String(record._id),
    organizationId: String(record.organizationId),
    requestedPlanCode: record.requestedPlanCode,
    requestedPlanVersion: record.requestedPlanVersion,
    requestedPlanId: record.requestedPlanId ? String(record.requestedPlanId) : null,
    billingPeriod: record.billingPeriod,
    submittedAmountMinorUnits: record.submittedAmountMinorUnits,
    currency: record.currency,
    paymentMethod: record.paymentMethod,
    paymentReferenceNormalized: record.paymentReferenceNormalized,
    paymentReferenceDuplicateWarning: Boolean(record.paymentReferenceDuplicateWarning),
    status: record.status,
    submittedAt: new Date(record.submittedAt).toISOString(),
    reviewedAt: record.reviewedAt ? new Date(record.reviewedAt).toISOString() : null,
    reviewedBy: record.reviewedBy ?? null,
    rejectionReason: record.rejectionReason ?? null,
    appliedAt: record.appliedAt ? new Date(record.appliedAt).toISOString() : null,
    appliedSubscriptionId: record.appliedSubscriptionId
      ? String(record.appliedSubscriptionId)
      : null,
    coverageStart: record.coverageStart ? new Date(record.coverageStart).toISOString() : null,
    coverageEnd: record.coverageEnd ? new Date(record.coverageEnd).toISOString() : null,
    notes: record.notes ?? null,
    listedMonthlyPriceMinorUnits: record.listedMonthlyPriceMinorUnits ?? null,
    listedAnnualPriceMinorUnits: record.listedAnnualPriceMinorUnits ?? null,
    listedAnnualDiscountPercent: record.listedAnnualDiscountPercent ?? null,
    version: record.version,
  };

  if (!includeEvidenceMeta) {
    return base;
  }

  return {
    ...base,
    evidenceStorageRef: record.evidenceStorageRef,
    evidenceOriginalFileName: record.evidenceOriginalFileName ?? null,
    evidenceContentType: record.evidenceContentType ?? null,
    evidenceSize: record.evidenceSize ?? null,
    evidenceChecksum: record.evidenceChecksum ?? null,
    evidenceUploadedAt: record.evidenceUploadedAt
      ? new Date(record.evidenceUploadedAt).toISOString()
      : null,
  };
}

function toRequestedPlanSnapshot(record) {
  return {
    id: record.requestedPlanId ? String(record.requestedPlanId) : null,
    planCode: record.requestedPlanCode,
    name: record.requestedPlanCode,
    planVersion: record.requestedPlanVersion,
    currency: record.currency,
    monthlyPriceMinorUnits: record.listedMonthlyPriceMinorUnits ?? null,
    annualPriceMinorUnits: record.listedAnnualPriceMinorUnits ?? null,
    annualDiscountPercent: record.listedAnnualDiscountPercent ?? null,
  };
}

function toOrganizationSummary(organization) {
  if (organization === null || organization === undefined) {
    return null;
  }
  const name = String(organization.name ?? '').trim();
  return {
    id: String(organization._id),
    name,
    displayLabel: name,
    status: organization.status ?? null,
  };
}

function toReviewerSummary(reviewerId, user) {
  if (reviewerId === null || reviewerId === undefined) {
    return null;
  }
  return {
    id: String(reviewerId),
    displayName: user ? String(user.displayName ?? '').trim() || null : null,
  };
}

function listedAmountForPeriod(record) {
  return record.billingPeriod === 'annual'
    ? (record.listedAnnualPriceMinorUnits ?? null)
    : (record.listedMonthlyPriceMinorUnits ?? null);
}

function assertExpectedVersion(record, expectedVersion) {
  if (Number(record.version) !== Number(expectedVersion)) {
    throw versionConflict('Billing record version conflict', {
      expectedVersion,
      actualVersion: record.version,
    });
  }
}

function createSubscriptionService(deps) {
  const store = deps.store;
  const evidenceStorage = deps.evidenceStorage;
  const now = deps.now ?? (() => new Date());
  const trialDays = deps.trialDays ?? DEFAULT_TRIAL_DAYS;
  const graceDays = deps.graceDays ?? DEFAULT_GRACE_DAYS;
  const retentionDays = deps.retentionDays ?? DEFAULT_RETENTION_DAYS;
  const auditWriter = createAuditWriter({
    append: (session, event) => store.appendAuditEvent(session, event),
  });
  let billingReviewReadModel = deps.billingReviewReadModel ?? null;

  async function loadPlanForSubscription(subscription) {
    if (subscription.planId) {
      const byId = await store.findPlanById(String(subscription.planId));
      if (byId !== null) {
        return byId;
      }
    }
    return store.findPlanByCodeVersion(subscription.planCode, subscription.planVersion);
  }

  function requireEvidenceStorage() {
    if (evidenceStorage === null || evidenceStorage === undefined) {
      throw conflict('Billing evidence storage is not configured');
    }
    return evidenceStorage;
  }

  async function assertBillingAccess(organizationId) {
    const subscription = await store.findSubscriptionByOrganizationId(organizationId);
    if (subscription === null) {
      throw notFound('Subscription not found');
    }
    const access = buildSubscriptionAccessState(subscription, null, now(), { graceDays });
    if (!access.billingAccessAllowed) {
      throw forbidden('Billing evidence cannot be submitted in the current subscription state');
    }
    return { subscription, access };
  }

  async function loadOwnedEvidence(organizationId, storageRef) {
    const parsed = parseEvidenceStorageRef(storageRef);
    if (parsed === null) {
      throw validationFailed('evidenceStorageRef must be a server-issued evidence reference');
    }
    if (String(parsed.organizationId) !== String(organizationId)) {
      throw forbidden('Billing evidence does not belong to this organization');
    }
    const stored = await requireEvidenceStorage().read(storageRef);
    if (stored === null) {
      throw notFound('Billing evidence was not found');
    }
    if (String(stored.organizationId) !== String(organizationId)) {
      throw forbidden('Billing evidence does not belong to this organization');
    }
    return stored;
  }

  function evidenceMatchesBillingRecord(record, stored) {
    const parsed = parseEvidenceStorageRef(record.evidenceStorageRef);
    if (parsed === null || String(parsed.organizationId) !== String(record.organizationId)) {
      return false;
    }
    if (
      String(stored.organizationId) !== String(record.organizationId) ||
      String(stored.evidenceStorageRef) !== String(record.evidenceStorageRef) ||
      ALLOWED_EVIDENCE_TYPES[stored.contentType] === undefined
    ) {
      return false;
    }
    const comparisons = [
      ['evidenceOriginalFileName', 'originalFileName'],
      ['evidenceContentType', 'contentType'],
      ['evidenceSize', 'size'],
      ['evidenceChecksum', 'checksum'],
    ];
    return comparisons.every(([recordKey, storedKey]) => {
      const expected = record[recordKey];
      return (
        expected === null ||
        expected === undefined ||
        String(expected) === String(stored[storedKey])
      );
    });
  }

  async function loadBillingRecordEvidence(record) {
    const stored = await requireEvidenceStorage().read(record.evidenceStorageRef);
    if (stored === null || !evidenceMatchesBillingRecord(record, stored)) {
      throw notFound('Billing evidence was not found');
    }
    return stored;
  }

  async function updateBillingRecordWithVersion(session, record, patch) {
    const updated = await store.updateBillingRecord(
      session,
      String(record._id),
      patch,
      Number(record.version),
    );
    if (updated === null) {
      throw versionConflict('Billing record version conflict', {
        expectedVersion: record.version,
      });
    }
    return updated;
  }

  async function composePlatformBillingRows(records) {
    const organizationIds = [...new Set(records.map((record) => String(record.organizationId)))];
    const reviewerIds = [
      ...new Set(
        records
          .map((record) => record.reviewedBy)
          .filter(Boolean)
          .map(String),
      ),
    ];
    const [organizations, reviewers] = await Promise.all([
      billingReviewReadModel?.findOrganizationsByIds?.(organizationIds) ?? [],
      billingReviewReadModel?.findUsersByIds?.(reviewerIds) ?? [],
    ]);
    const organizationsById = new Map(
      organizations.map((organization) => [String(organization._id), organization]),
    );
    const reviewersById = new Map(reviewers.map((user) => [String(user._id), user]));

    return records.map((record) => {
      const organization = toOrganizationSummary(
        organizationsById.get(String(record.organizationId)) ?? null,
      );
      return {
        ...toBillingSummary(record),
        organization,
        organizationName: organization?.name ?? null,
        requestedPlanName: record.requestedPlanCode,
        requestedPlanSnapshot: toRequestedPlanSnapshot(record),
        listedAmountMinorUnits: listedAmountForPeriod(record),
        reviewer: toReviewerSummary(
          record.reviewedBy,
          reviewersById.get(String(record.reviewedBy)) ?? null,
        ),
      };
    });
  }

  function resolvePaidCoverage(options) {
    const coverage = computeCoverageWindow({
      billingPeriod: options.billingPeriod ?? 'monthly',
      at: options.at,
      existingPeriodEnd: options.existingPeriodEnd,
      subscriptionStatus: options.subscriptionStatus,
      explicitCoverageStart: options.explicitCoverageStart,
    });
    if (!coverageIsCurrent(coverage, options.at)) {
      throw conflict('A subscription cannot become active with an expired paid period');
    }
    return coverage;
  }

  async function markPlanReferenced(session, plan, at) {
    if (plan === null || plan.referencedAt) {
      return plan;
    }
    return store.updatePlan(session, String(plan._id), {
      referencedAt: at,
      version: Number(plan.version) + 1,
    });
  }

  async function persistExpiryIfNeeded(session, subscription, at) {
    const { subscription: effective, warnings } = applyExpiryTransitions(subscription, at, {
      graceDays,
    });
    if (effective.status === subscription.status) {
      return { subscription, warnings, changed: false };
    }

    assertTransition(subscription.status, effective.status);
    const patch = {
      status: effective.status,
      version: Number(subscription.version) + 1,
    };
    if (effective.graceEndsAt) {
      patch.graceEndsAt = effective.graceEndsAt;
    }
    const updated = await store.updateSubscription(session, String(subscription._id), patch);
    await auditWriter.appendBusinessEvent(session, {
      organizationId: String(subscription.organizationId),
      actorId: 'system',
      action: 'subscription.status_transition',
      resourceType: 'subscription',
      resourceId: String(subscription._id),
      metadata: {
        fromStatus: subscription.status,
        toStatus: effective.status,
        automatic: true,
      },
    });
    return { subscription: updated, warnings, changed: true };
  }

  async function transitionSubscription(session, subscription, toStatus, actor, options = {}) {
    assertTransition(subscription.status, toStatus);
    if (options.expectedVersion !== undefined) {
      assertExpectedVersion(subscription, options.expectedVersion);
    }

    const at = options.at ?? now();
    const patch = {
      status: toStatus,
      version: Number(subscription.version) + 1,
      ...(options.patch ?? {}),
    };
    const updated = await store.updateSubscription(session, String(subscription._id), patch);
    await auditWriter.appendBusinessEvent(session, {
      organizationId: String(subscription.organizationId),
      actorId: actor.actorId,
      action: options.auditAction ?? 'subscription.status_transition',
      resourceType: 'subscription',
      resourceId: String(subscription._id),
      reason: options.reason,
      metadata: {
        fromStatus: subscription.status,
        toStatus,
        at: at.toISOString(),
        ...(options.metadata ?? {}),
      },
    });
    return updated;
  }

  return {
    setBillingReviewReadModel(readModel) {
      billingReviewReadModel = readModel;
    },

    async listPlatformPlans() {
      const plans = await store.listPlans();
      return plans.map(toPlanSummary);
    },

    async listSelectablePlans() {
      const plans = await store.listPlans({ status: 'active' });
      return plans.map(toPlanSummary);
    },

    async createPlanVersion(body, actor) {
      const input = parsePlanCreateBody(body);
      return deps.transactionRunner.run(async (session) => {
        const planVersion = await store.nextPlanVersion(input.planCode);

        if (input.activate) {
          const currentActive = await store.findActivePlanByCode(input.planCode);
          if (currentActive !== null) {
            await store.updatePlan(session, String(currentActive._id), {
              status: 'superseded',
              version: Number(currentActive.version) + 1,
            });
          }
        }

        const created = await store.insertPlan(session, {
          planCode: input.planCode,
          planVersion,
          status: input.activate ? 'active' : 'draft',
          currency: input.currency,
          monthlyPriceMinorUnits: input.monthlyPriceMinorUnits,
          annualPriceMinorUnits: input.annualPriceMinorUnits,
          annualDiscountPercent: input.annualDiscountPercent,
          trialEligible: input.trialEligible,
          limits: input.limits,
          entitlements: input.entitlements,
          referencedAt: null,
          version: 1,
        });

        await auditWriter.appendBusinessEvent(session, {
          organizationId: 'platform',
          actorId: actor.actorId,
          action: 'subscription_plan.version_created',
          resourceType: 'subscription_plan',
          resourceId: String(created._id),
          metadata: {
            planCode: created.planCode,
            planVersion: created.planVersion,
            status: created.status,
          },
        });

        return toPlanSummary(created);
      });
    },

    async assertPlanImmutable(planCode, planVersion, mutationAttempted = true) {
      const plan = await store.findPlanByCodeVersion(planCode, planVersion);
      if (plan === null) {
        throw notFound('Plan version not found');
      }
      if (plan.referencedAt && mutationAttempted) {
        throw conflict('Referenced plan versions are immutable; create a new plan version');
      }
      return plan;
    },

    async listPlatformSubscriptions() {
      const rows = await store.listSubscriptions();
      return rows.map(toSubscriptionSummary);
    },

    async getOrganizationSubscription(organizationId) {
      const subscription = await store.findSubscriptionByOrganizationId(organizationId);
      if (subscription === null) {
        throw notFound('Subscription not found');
      }

      const at = now();
      const refreshed = await deps.transactionRunner.run(async (session) =>
        persistExpiryIfNeeded(session, subscription, at),
      );
      const effective = refreshed.subscription;
      const plan = await loadPlanForSubscription(effective);
      const access = buildSubscriptionAccessState(effective, plan, at, { graceDays });

      return {
        ...toSubscriptionSummary(effective),
        accessState: {
          accessLevel: access.accessLevel,
          operationalWriteAllowed: access.operationalWriteAllowed,
          billingAccessAllowed: access.billingAccessAllowed,
          warnings: access.warnings,
        },
        plan: access.plan,
      };
    },

    async resolveAccessState(organizationId) {
      const subscription = await store.findSubscriptionByOrganizationId(organizationId);
      if (subscription === null) {
        return buildSubscriptionAccessState(null, null, now(), { graceDays });
      }
      const at = now();
      const { subscription: effective } = applyExpiryTransitions(subscription, at, { graceDays });
      const plan = await loadPlanForSubscription(effective);
      return buildSubscriptionAccessState(effective, plan, at, { graceDays });
    },

    async evaluateEntitlement(organizationId, options = {}) {
      const access = await this.resolveAccessState(organizationId);
      const label = options.label ?? 'operational';
      const status = access.status;
      const { allowsSubscriptionLabel } = require('./entitlement');
      if (!allowsSubscriptionLabel(status, label)) {
        return {
          allowed: false,
          reason: 'subscription_status_denied',
          access,
        };
      }

      if (options.entitlementKey) {
        const feature = evaluateFeatureEntitlement(
          access.plan === null
            ? null
            : {
                entitlements: access.plan.entitlements,
                limits: access.plan.limits,
              },
          options.entitlementKey,
        );
        if (!feature.allowed) {
          return { allowed: false, reason: feature.reason, access, feature };
        }
      }

      if (options.limitKey !== undefined && options.currentUsage !== undefined) {
        const limit = evaluateNumericLimit(
          access.plan === null
            ? null
            : {
                entitlements: access.plan.entitlements,
                limits: access.plan.limits,
              },
          options.limitKey,
          options.currentUsage,
        );
        if (!limit.allowed) {
          return { allowed: false, reason: limit.reason, access, limit };
        }
        return { allowed: true, reason: limit.reason, access, limit };
      }

      return { allowed: true, reason: 'entitled', access };
    },

    async suspendSubscription(subscriptionId, body, actor) {
      const { expectedVersion, reason } = parseLifecycleBody(body, { requireReason: true });
      return deps.transactionRunner.run(async (session) => {
        const subscription = await store.findSubscriptionById(subscriptionId);
        if (subscription === null) {
          throw notFound('Subscription not found');
        }
        const at = now();

        if (subscription.status === 'suspended') {
          throw conflict('Subscription is already suspended');
        }

        let current = subscription;
        let expected = expectedVersion;

        if (current.status === 'trial' || current.status === 'active') {
          current = await transitionSubscription(session, current, 'grace', actor, {
            expectedVersion: expected,
            reason,
            at,
            auditAction: 'subscription.entered_grace',
            patch: { graceEndsAt: daysFrom(at, graceDays) },
          });
          expected = current.version;
        }

        if (current.status !== 'grace') {
          throw conflict('Only grace (or trial/active via grace) subscriptions can be suspended');
        }

        const updated = await transitionSubscription(session, current, 'suspended', actor, {
          expectedVersion: expected,
          reason,
          at,
          auditAction: 'subscription.suspended',
        });
        return toSubscriptionSummary(updated);
      });
    },

    async reactivateSubscription(subscriptionId, body, actor) {
      const { expectedVersion, reason } = parseLifecycleBody(body, { requireReason: true });
      return deps.transactionRunner.run(async (session) => {
        const subscription = await store.findSubscriptionById(subscriptionId);
        if (subscription === null) {
          throw notFound('Subscription not found');
        }
        if (subscription.status !== 'suspended') {
          throw conflict('Only suspended subscriptions can be reactivated');
        }
        const at = now();
        const coverage = resolvePaidCoverage({
          billingPeriod: subscription.billingPeriod,
          at,
          existingPeriodEnd: subscription.periodEndsAt,
          subscriptionStatus: subscription.status,
        });
        const updated = await transitionSubscription(session, subscription, 'active', actor, {
          expectedVersion,
          reason,
          at,
          auditAction: 'subscription.reactivated',
          patch: {
            periodStartsAt: coverage.coverageStart,
            periodEndsAt: coverage.coverageEnd,
            graceEndsAt: null,
          },
        });
        return toSubscriptionSummary(updated);
      });
    },

    async cancelSubscription(subscriptionId, body, actor) {
      const { expectedVersion, reason } = parseLifecycleBody(body, { requireReason: true });
      return deps.transactionRunner.run(async (session) => {
        const subscription = await store.findSubscriptionById(subscriptionId);
        if (subscription === null) {
          throw notFound('Subscription not found');
        }
        const at = now();
        const cancelled = await transitionSubscription(session, subscription, 'cancelled', actor, {
          expectedVersion,
          reason,
          at,
          auditAction: 'subscription.cancelled',
          patch: { cancelledAt: at },
        });
        const retained = await transitionSubscription(session, cancelled, 'retained', actor, {
          expectedVersion: cancelled.version,
          reason,
          at,
          auditAction: 'subscription.retained',
          patch: { retainedUntil: daysFrom(at, retentionDays) },
        });
        return toSubscriptionSummary(retained);
      });
    },

    async changePlan(subscriptionId, body, actor) {
      const input = parseChangePlanBody(body);
      return deps.transactionRunner.run(async (session) => {
        const subscription = await store.findSubscriptionById(subscriptionId);
        if (subscription === null) {
          throw notFound('Subscription not found');
        }
        assertExpectedVersion(subscription, input.expectedVersion);

        const plan = await store.findPlanByCodeVersion(input.planCode, input.planVersion);
        if (plan === null) {
          throw notFound('Plan version not found');
        }
        if (plan.status !== 'active' && plan.status !== 'superseded') {
          throw conflict('Plan version is not selectable for assignment');
        }

        const at = now();
        await markPlanReferenced(session, plan, at);

        const isDowngrade =
          rankPlan(subscription.planCode) > rankPlan(input.planCode) ||
          (subscription.planCode === input.planCode &&
            Number(subscription.planVersion) > Number(input.planVersion));

        if (isDowngrade && input.effective !== 'next_period') {
          throw validationFailed('Downgrades must be scheduled for the next period boundary');
        }

        if (!isDowngrade || input.effective === 'immediate') {
          const updated = await store.updateSubscription(session, String(subscription._id), {
            planCode: input.planCode,
            planVersion: input.planVersion,
            planId: plan._id,
            version: Number(subscription.version) + 1,
          });
          await auditWriter.appendBusinessEvent(session, {
            organizationId: String(subscription.organizationId),
            actorId: actor.actorId,
            action: 'subscription.plan_changed',
            resourceType: 'subscription',
            resourceId: String(subscription._id),
            reason: input.reason,
            metadata: {
              fromPlanCode: subscription.planCode,
              fromPlanVersion: subscription.planVersion,
              toPlanCode: input.planCode,
              toPlanVersion: input.planVersion,
              effective: 'immediate',
            },
          });
          return toSubscriptionSummary(updated);
        }

        await auditWriter.appendBusinessEvent(session, {
          organizationId: String(subscription.organizationId),
          actorId: actor.actorId,
          action: 'subscription.plan_change_scheduled',
          resourceType: 'subscription',
          resourceId: String(subscription._id),
          reason: input.reason,
          metadata: {
            fromPlanCode: subscription.planCode,
            fromPlanVersion: subscription.planVersion,
            toPlanCode: input.planCode,
            toPlanVersion: input.planVersion,
            effective: 'next_period',
          },
        });
        return {
          ...toSubscriptionSummary(subscription),
          scheduledPlan: {
            planCode: input.planCode,
            planVersion: input.planVersion,
            effective: 'next_period',
          },
        };
      });
    },

    async enterGraceFromTrial(subscriptionId, actor) {
      return deps.transactionRunner.run(async (session) => {
        const subscription = await store.findSubscriptionById(subscriptionId);
        if (subscription === null) {
          throw notFound('Subscription not found');
        }
        const at = now();
        const updated = await transitionSubscription(session, subscription, 'grace', actor, {
          expectedVersion: subscription.version,
          at,
          auditAction: 'subscription.entered_grace',
          patch: { graceEndsAt: daysFrom(at, graceDays) },
        });
        return toSubscriptionSummary(updated);
      });
    },

    async uploadBillingEvidence(organizationId, file, actor) {
      await assertBillingAccess(organizationId);
      try {
        const stored = await requireEvidenceStorage().put({
          organizationId,
          buffer: file.buffer,
          originalFileName: file.originalFileName,
          contentType: file.contentType,
          uploadedAt: now(),
          uploadedBy: actor.actorId,
        });
        const parsedRef = parseEvidenceStorageRef(stored.evidenceStorageRef);
        await auditWriter.appendBusinessEvent(null, {
          organizationId: String(organizationId),
          actorId: actor.actorId,
          action: 'subscription.billing_evidence_uploaded',
          resourceType: 'subscription_billing_evidence',
          resourceId: parsedRef === null ? 'evidence' : parsedRef.objectId,
          metadata: {
            contentType: stored.contentType,
            size: stored.size,
          },
        });
        return stored;
      } catch (error) {
        if (error && typeof error.code === 'string' && error.code.startsWith('EVIDENCE_')) {
          throw validationFailed(error.message);
        }
        throw error;
      }
    },

    async submitBillingEvidence(organizationId, body, actor) {
      const input = parseBillingSubmitBody(body);
      return deps.transactionRunner.run(async (session) => {
        await assertBillingAccess(organizationId);
        const evidence = await loadOwnedEvidence(organizationId, input.evidenceStorageRef);

        const plan = await store.findPlanByCodeVersion(
          input.requestedPlanCode,
          input.requestedPlanVersion,
        );
        if (plan === null || plan.status !== 'active') {
          throw validationFailed('Requested plan version must be an active selectable plan');
        }

        const duplicateCount = await store.countBillingByPaymentReference(
          input.paymentMethod,
          input.paymentReferenceNormalized,
        );

        const at = now();
        const created = await store.insertBillingRecord(session, {
          organizationId,
          requestedPlanId: plan._id,
          requestedPlanCode: plan.planCode,
          requestedPlanVersion: plan.planVersion,
          billingPeriod: input.billingPeriod,
          submittedAmountMinorUnits: input.submittedAmountMinorUnits,
          currency: input.currency,
          paymentMethod: input.paymentMethod,
          paymentReferenceNormalized: input.paymentReferenceNormalized,
          paymentReferenceDuplicateWarning: duplicateCount > 0,
          evidenceStorageRef: evidence.evidenceStorageRef,
          evidenceOriginalFileName: evidence.originalFileName,
          evidenceContentType: evidence.contentType,
          evidenceSize: evidence.size,
          evidenceChecksum: evidence.checksum,
          evidenceUploadedAt: evidence.uploadedAt,
          listedMonthlyPriceMinorUnits: plan.monthlyPriceMinorUnits ?? null,
          listedAnnualPriceMinorUnits: plan.annualPriceMinorUnits ?? null,
          listedAnnualDiscountPercent: plan.annualDiscountPercent ?? null,
          status: 'submitted',
          submittedAt: at,
          notes: input.notes,
          version: 1,
        });

        await auditWriter.appendBusinessEvent(session, {
          organizationId: String(organizationId),
          actorId: actor.actorId,
          action: 'subscription.billing_evidence_submitted',
          resourceType: 'subscription_billing_record',
          resourceId: String(created._id),
          metadata: {
            paymentMethod: input.paymentMethod,
            billingPeriod: input.billingPeriod,
            requestedPlanCode: plan.planCode,
            requestedPlanVersion: plan.planVersion,
            duplicateWarning: duplicateCount > 0,
          },
        });

        return toBillingSummary(created, { includeEvidenceMeta: true });
      });
    },

    async listOrganizationBillingRecords(organizationId) {
      const page = await store.listBillingRecords({ organizationId });
      return page.items.map((row) => toBillingSummary(row, { includeEvidenceMeta: true }));
    },

    async getOrganizationBillingRecord(organizationId, billingId) {
      const record = await store.findBillingRecordById(billingId);
      if (record === null || String(record.organizationId) !== String(organizationId)) {
        throw notFound('Billing record not found');
      }
      return toBillingSummary(record, { includeEvidenceMeta: true });
    },

    async listPlatformBillingRecords(query = {}) {
      const filter = parseBillingQueueQuery(query);
      const organizationIdsForSearch =
        filter.q === null
          ? []
          : ((await billingReviewReadModel?.findOrganizationIdsBySearch?.(filter.q)) ?? []);
      const page = await store.listBillingRecords({
        ...(filter.status === null ? {} : { status: filter.status }),
        ...(filter.organizationId === null ? {} : { organizationId: filter.organizationId }),
        ...(filter.q === null ? {} : { q: filter.q }),
        ...(filter.q === null ? {} : { organizationIdsForSearch }),
        limit: filter.limit,
        offset: filter.offset,
      });
      return {
        items: await composePlatformBillingRows(page.items),
        total: page.total,
        limit: page.limit,
        offset: page.offset,
      };
    },

    async startBillingReview(billingId, body, actor) {
      const expectedVersion = parseExpectedVersion(body);
      return deps.transactionRunner.run(async (session) => {
        const record = await store.findBillingRecordById(billingId);
        if (record === null) {
          throw notFound('Billing record not found');
        }
        assertExpectedVersion(record, expectedVersion);
        if (record.status !== 'submitted') {
          throw conflict('Billing record cannot enter review from the current status');
        }
        const at = now();
        const reviewed = await updateBillingRecordWithVersion(session, record, {
          status: 'under_review',
          reviewedAt: at,
          reviewedBy: actor.actorId,
          version: Number(record.version) + 1,
        });
        await auditWriter.appendBusinessEvent(session, {
          organizationId: String(record.organizationId),
          actorId: actor.actorId,
          action: 'subscription.billing_review_started',
          resourceType: 'subscription_billing_record',
          resourceId: String(record._id),
        });
        return toBillingSummary(reviewed, { includeEvidenceMeta: true });
      });
    },

    async readOrganizationBillingEvidence(organizationId, billingId) {
      const record = await store.findBillingRecordById(billingId);
      if (record === null || String(record.organizationId) !== String(organizationId)) {
        throw notFound('Billing record not found');
      }
      return loadBillingRecordEvidence(record);
    },

    async readPlatformBillingEvidence(billingId) {
      const record = await store.findBillingRecordById(billingId);
      if (record === null) {
        throw notFound('Billing record not found');
      }
      return loadBillingRecordEvidence(record);
    },

    async getPlatformBillingRecord(billingId) {
      const record = await store.findBillingRecordById(billingId);
      if (record === null) {
        throw notFound('Billing record not found');
      }
      const [composed] = await composePlatformBillingRows([record]);
      const currentSubscription = await store.findSubscriptionByOrganizationId(
        String(record.organizationId),
      );
      return {
        ...toBillingSummary(record, { includeEvidenceMeta: true }),
        ...composed,
        currentSubscription:
          currentSubscription === null ? null : toSubscriptionSummary(currentSubscription),
        evidence: {
          storageRef: record.evidenceStorageRef,
          originalFileName: record.evidenceOriginalFileName ?? null,
          contentType: record.evidenceContentType ?? null,
          size: record.evidenceSize ?? null,
          checksum: record.evidenceChecksum ?? null,
          uploadedAt: record.evidenceUploadedAt
            ? new Date(record.evidenceUploadedAt).toISOString()
            : null,
        },
        appliedSubscription:
          record.appliedSubscriptionId === null || record.appliedSubscriptionId === undefined
            ? null
            : {
                id: String(record.appliedSubscriptionId),
                appliedAt: record.appliedAt ? new Date(record.appliedAt).toISOString() : null,
                coverageStart: record.coverageStart
                  ? new Date(record.coverageStart).toISOString()
                  : null,
                coverageEnd: record.coverageEnd ? new Date(record.coverageEnd).toISOString() : null,
                planCode: record.requestedPlanCode,
                planVersion: record.requestedPlanVersion,
                billingPeriod: record.billingPeriod,
                planCode: record.requestedPlanCode,
                planVersion: record.requestedPlanVersion,
                billingPeriod: record.billingPeriod,
                status:
                  currentSubscription !== null &&
                  String(currentSubscription._id) === String(record.appliedSubscriptionId)
                    ? currentSubscription.status
                    : null,
              },
      };
    },

    async approveBillingRecord(billingId, body, actor) {
      const input = parseBillingApproveBody(body);
      return deps.transactionRunner.run(async (session) => {
        const record = await store.findBillingRecordById(billingId);
        if (record === null) {
          throw notFound('Billing record not found');
        }
        if (record.status === 'approved' && record.appliedAt) {
          return toBillingSummary(record, { includeEvidenceMeta: true });
        }
        assertExpectedVersion(record, input.expectedVersion);
        if (record.status !== 'submitted' && record.status !== 'under_review') {
          throw conflict('Billing record cannot be approved from the current status');
        }

        const subscription = await store.findSubscriptionByOrganizationId(
          String(record.organizationId),
        );
        if (subscription === null) {
          throw conflict('Subscription record is missing');
        }

        const at = now();
        const plan = await store.findPlanByCodeVersion(
          record.requestedPlanCode,
          record.requestedPlanVersion,
        );
        if (plan === null) {
          throw notFound('Requested plan version not found');
        }
        await markPlanReferenced(session, plan, at);

        const coverage = resolvePaidCoverage({
          billingPeriod: record.billingPeriod,
          at,
          existingPeriodEnd: subscription.periodEndsAt,
          subscriptionStatus: subscription.status,
          explicitCoverageStart: input.coverageStart,
        });

        let nextSubscription;
        if (subscription.status === 'trial' || subscription.status === 'grace') {
          nextSubscription = await transitionSubscription(session, subscription, 'active', actor, {
            expectedVersion: subscription.version,
            at,
            auditAction: 'subscription.activated_by_billing',
            patch: {
              planCode: record.requestedPlanCode,
              planVersion: record.requestedPlanVersion,
              planId: plan._id,
              billingPeriod: record.billingPeriod,
              periodStartsAt: coverage.coverageStart,
              periodEndsAt: coverage.coverageEnd,
              graceEndsAt: null,
              trialEndsAt: subscription.trialEndsAt ?? null,
            },
          });
        } else if (subscription.status === 'suspended') {
          nextSubscription = await transitionSubscription(session, subscription, 'active', actor, {
            expectedVersion: subscription.version,
            at,
            auditAction: 'subscription.reactivated_by_billing',
            patch: {
              planCode: record.requestedPlanCode,
              planVersion: record.requestedPlanVersion,
              planId: plan._id,
              billingPeriod: record.billingPeriod,
              periodStartsAt: coverage.coverageStart,
              periodEndsAt: coverage.coverageEnd,
              graceEndsAt: null,
            },
          });
        } else if (subscription.status === 'active') {
          nextSubscription = await store.updateSubscription(session, String(subscription._id), {
            planCode: record.requestedPlanCode,
            planVersion: record.requestedPlanVersion,
            planId: plan._id,
            billingPeriod: record.billingPeriod,
            periodStartsAt: coverage.coverageStart,
            periodEndsAt: coverage.coverageEnd,
            version: Number(subscription.version) + 1,
          });
          await auditWriter.appendBusinessEvent(session, {
            organizationId: String(subscription.organizationId),
            actorId: actor.actorId,
            action: 'subscription.renewed_by_billing',
            resourceType: 'subscription',
            resourceId: String(subscription._id),
            metadata: {
              billingRecordId: String(record._id),
              coverageStart: coverage.coverageStart.toISOString(),
              coverageEnd: coverage.coverageEnd.toISOString(),
            },
          });
        } else {
          throw conflict('Billing approval cannot activate the current subscription status');
        }

        const approved = await updateBillingRecordWithVersion(session, record, {
          status: 'approved',
          reviewedAt: at,
          reviewedBy: actor.actorId,
          appliedAt: at,
          appliedSubscriptionId: nextSubscription._id,
          coverageStart: coverage.coverageStart,
          coverageEnd: coverage.coverageEnd,
          version: Number(record.version) + 1,
        });

        await auditWriter.appendBusinessEvent(session, {
          organizationId: String(record.organizationId),
          actorId: actor.actorId,
          action: 'subscription.billing_approved',
          resourceType: 'subscription_billing_record',
          resourceId: String(record._id),
          metadata: {
            appliedSubscriptionId: String(nextSubscription._id),
          },
        });

        return toBillingSummary(approved, { includeEvidenceMeta: true });
      });
    },

    async rejectBillingRecord(billingId, body, actor) {
      const input = parseBillingRejectBody(body);
      return deps.transactionRunner.run(async (session) => {
        const record = await store.findBillingRecordById(billingId);
        if (record === null) {
          throw notFound('Billing record not found');
        }
        assertExpectedVersion(record, input.expectedVersion);
        if (record.status !== 'submitted' && record.status !== 'under_review') {
          throw conflict('Billing record cannot be rejected from the current status');
        }

        const at = now();
        const rejected = await updateBillingRecordWithVersion(session, record, {
          status: 'rejected',
          reviewedAt: at,
          reviewedBy: actor.actorId,
          rejectionReason: input.reason,
          version: Number(record.version) + 1,
        });

        await auditWriter.appendBusinessEvent(session, {
          organizationId: String(record.organizationId),
          actorId: actor.actorId,
          action: 'subscription.billing_rejected',
          resourceType: 'subscription_billing_record',
          resourceId: String(record._id),
          reason: input.reason,
        });

        return toBillingSummary(rejected, { includeEvidenceMeta: true });
      });
    },

    /**
     * Used by Platform onboarding approval to bind an immutable plan version.
     */
    async resolveTrialPlanReference(preferredPlanCode = 'Starter') {
      const active = await store.findActivePlanByCode(preferredPlanCode);
      if (active !== null) {
        return {
          planCode: active.planCode,
          planVersion: active.planVersion,
          planId: active._id,
        };
      }
      return {
        planCode: preferredPlanCode,
        planVersion: 1,
        planId: null,
      };
    },

    async markReferencedPlan(planCode, planVersion, session, at = now()) {
      const plan = await store.findPlanByCodeVersion(planCode, planVersion);
      if (plan === null) {
        return null;
      }
      return markPlanReferenced(session, plan, at);
    },

    defaults: {
      trialDays,
      graceDays,
      retentionDays,
    },
  };
}

function rankPlan(planCode) {
  if (planCode === 'Enterprise') {
    return 3;
  }
  if (planCode === 'Business') {
    return 2;
  }
  return 1;
}

module.exports = {
  createSubscriptionService,
  toPlanSummary,
  toSubscriptionSummary,
  toBillingSummary,
};
