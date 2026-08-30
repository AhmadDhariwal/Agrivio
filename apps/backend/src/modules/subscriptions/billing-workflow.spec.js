import { describe, expect, it, vi } from 'vitest';
import { createServer } from 'node:http';
import {
  API_CSRF_HEADER,
  API_ORGANIZATION_ACTIVATION_REQUESTS_PATH,
  API_PLATFORM_ACTOR_HEADER,
  API_PLATFORM_BILLING_RECORDS_PATH,
  API_PLATFORM_ORGANIZATIONS_PATH,
  API_PLATFORM_SUBSCRIPTION_PLANS_PATH,
  API_PLATFORM_SUBSCRIPTIONS_PATH,
  API_SUBSCRIPTION_BILLING_EVIDENCE_PATH,
  API_SUBSCRIPTION_BILLING_RECORDS_PATH,
  API_SUBSCRIPTION_PATH,
  API_SUBSCRIPTION_PLANS_PATH,
} from '@agrivio/api-contracts';
import { createApp } from '../../app';
import { loadApiEnv } from '../../platform/config/runtime-config';
import { createMockDatabaseLifecycle } from '../../platform/database/mongo-connection';
import { parseEvidenceStorageRef } from './billing-evidence-storage';

describe('billing workflow hardening', () => {
  it('rejects path-traversal evidence storage refs', () => {
    expect(parseEvidenceStorageRef('evidence://../object')).toBeNull();
    expect(parseEvidenceStorageRef('evidence://org/..')).toBeNull();
    expect(parseEvidenceStorageRef('evidence://./object')).toBeNull();
    expect(parseEvidenceStorageRef('evidence://org/.')).toBeNull();
    expect(parseEvidenceStorageRef('data:application/pdf;base64,AAAA')).toBeNull();
    expect(parseEvidenceStorageRef('C:\\tmp\\receipt.pdf')).toBeNull();
    expect(parseEvidenceStorageRef('evidence://org-1/abc-def')).toEqual({
      organizationId: 'org-1',
      objectId: 'abc-def',
      storageRef: 'evidence://org-1/abc-def',
    });
  });

  it('covers upload, submit, review, approval effects, RBAC, and reactivation period safety', async () => {
    const { server, baseUrl, jar, store, subscriptions, onboardingStore } = await boot();
    try {
      await createPlan(baseUrl, jar, {
        planCode: 'Business',
        activate: true,
        monthlyPriceMinorUnits: 9000,
      });
      const draft = await createPlan(baseUrl, jar, { planCode: 'Enterprise', activate: false });
      expect(draft.status).toBe(201);
      expect(draft.body.data.status).toBe('draft');

      const owner = await createApprovedOwnerSession(baseUrl, jar, {
        organizationName: 'Workflow Org',
        ownerEmail: 'workflow-owner@example.com',
      });

      const plans = await fetchJson(
        baseUrl,
        'GET',
        API_SUBSCRIPTION_PLANS_PATH,
        undefined,
        {},
        jar,
      );
      expect(plans.status).toBe(200);
      expect(plans.body.data.items.every((plan) => plan.status === 'active')).toBe(true);
      expect(plans.body.data.items.some((plan) => plan.planCode === 'Enterprise')).toBe(false);
      const business = plans.body.data.items.find((plan) => plan.planCode === 'Business');
      expect(business).toBeTruthy();

      const invalidType = await uploadEvidence(baseUrl, jar, {
        contentType: 'application/zip',
        fileName: 'nope.zip',
        body: Buffer.from('PK\u0003\u0004'),
      });
      expect(invalidType.status).toBe(400);

      const dataUrlSubmit = await fetchJson(
        baseUrl,
        'POST',
        API_SUBSCRIPTION_BILLING_RECORDS_PATH,
        {
          paymentMethod: 'bank_transfer',
          billingPeriod: 'monthly',
          submittedAmountMinorUnits: 9000,
          paymentReference: 'DATA-URL',
          evidenceStorageRef: 'data:application/pdf;base64,AAAA',
          requestedPlanCode: 'Business',
          requestedPlanVersion: business.planVersion,
        },
        { [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar) },
        jar,
      );
      expect(dataUrlSubmit.status).toBe(400);

      const missingRef = await fetchJson(
        baseUrl,
        'POST',
        API_SUBSCRIPTION_BILLING_RECORDS_PATH,
        {
          paymentMethod: 'bank_transfer',
          billingPeriod: 'monthly',
          submittedAmountMinorUnits: 9000,
          paymentReference: 'MISSING-REF',
          evidenceStorageRef: `evidence://${owner.organizationId}/does-not-exist`,
          requestedPlanCode: 'Business',
          requestedPlanVersion: business.planVersion,
        },
        { [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar) },
        jar,
      );
      expect([400, 404]).toContain(missingRef.status);

      const draftSubmit = await fetchJson(
        baseUrl,
        'POST',
        API_SUBSCRIPTION_BILLING_RECORDS_PATH,
        {
          paymentMethod: 'bank_transfer',
          billingPeriod: 'monthly',
          submittedAmountMinorUnits: 9000,
          paymentReference: 'DRAFT-PLAN',
          evidenceStorageRef: (await uploadPdf(baseUrl, jar, 'draft.pdf')).body.data
            .evidenceStorageRef,
          requestedPlanCode: 'Enterprise',
          requestedPlanVersion: draft.body.data.planVersion,
        },
        { [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar) },
        jar,
      );
      expect(draftSubmit.status).toBe(400);

      const firstUpload = await uploadPdf(baseUrl, jar, 'first.pdf');
      expect(firstUpload.status).toBe(201);
      expect(
        firstUpload.body.data.evidenceStorageRef.startsWith(`evidence://${owner.organizationId}/`),
      ).toBe(true);
      expect(firstUpload.body.data.originalFileName).toBe('first.pdf');
      expect(firstUpload.body.data.contentType).toBe('application/pdf');

      const firstSubmit = await fetchJson(
        baseUrl,
        'POST',
        API_SUBSCRIPTION_BILLING_RECORDS_PATH,
        {
          paymentMethod: 'jazzcash',
          billingPeriod: 'monthly',
          submittedAmountMinorUnits: 9000,
          paymentReference: 'JZ-WORK-1',
          evidenceStorageRef: firstUpload.body.data.evidenceStorageRef,
          requestedPlanCode: business.planCode,
          requestedPlanVersion: business.planVersion,
          notes: 'Paid at the counter',
        },
        { [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar) },
        jar,
      );
      expect(firstSubmit.status).toBe(201);
      expect(firstSubmit.body.data.status).toBe('submitted');
      expect(firstSubmit.body.data.paymentReferenceDuplicateWarning).toBe(false);
      expect(firstSubmit.body.data.notes).toBe('Paid at the counter');
      expect(firstSubmit.body.data.listedMonthlyPriceMinorUnits).toBe(9000);

      const duplicateUpload = await uploadPdf(baseUrl, jar, 'second.pdf');
      const duplicateSubmit = await fetchJson(
        baseUrl,
        'POST',
        API_SUBSCRIPTION_BILLING_RECORDS_PATH,
        {
          paymentMethod: 'jazzcash',
          billingPeriod: 'monthly',
          submittedAmountMinorUnits: 9000,
          paymentReference: 'jz-work-1',
          evidenceStorageRef: duplicateUpload.body.data.evidenceStorageRef,
          requestedPlanCode: business.planCode,
          requestedPlanVersion: business.planVersion,
        },
        { [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar) },
        jar,
      );
      expect(duplicateSubmit.status).toBe(201);
      expect(duplicateSubmit.body.data.paymentReferenceDuplicateWarning).toBe(true);

      const ownerEvidence = await fetchBinary(
        baseUrl,
        `${API_SUBSCRIPTION_BILLING_RECORDS_PATH}/${firstSubmit.body.data.id}/evidence`,
        jar,
      );
      expect(ownerEvidence.status).toBe(200);
      expect(ownerEvidence.contentType).toContain('application/pdf');
      expect(ownerEvidence.contentDisposition).toContain('filename="first.pdf"');

      const ownerPlatformEvidence = await fetchBinary(
        baseUrl,
        `${API_PLATFORM_BILLING_RECORDS_PATH}/${firstSubmit.body.data.id}/evidence`,
        jar,
      );
      expect([401, 403]).toContain(ownerPlatformEvidence.status);

      const ownerReject = await fetchJson(
        baseUrl,
        'POST',
        `${API_PLATFORM_BILLING_RECORDS_PATH}/${firstSubmit.body.data.id}/approve`,
        { expectedVersion: firstSubmit.body.data.version },
        { [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar) },
        jar,
      );
      expect([401, 403]).toContain(ownerReject.status);

      const started = await fetchJson(
        baseUrl,
        'POST',
        `${API_PLATFORM_BILLING_RECORDS_PATH}/${firstSubmit.body.data.id}/start-review`,
        { expectedVersion: firstSubmit.body.data.version },
        {
          [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar),
          [API_PLATFORM_ACTOR_HEADER]: 'super-admin',
        },
        jar,
      );
      expect(started.status).toBe(200);
      expect(started.body.data.status).toBe('under_review');

      const replayStart = await fetchJson(
        baseUrl,
        'POST',
        `${API_PLATFORM_BILLING_RECORDS_PATH}/${firstSubmit.body.data.id}/start-review`,
        { expectedVersion: started.body.data.version },
        {
          [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar),
          [API_PLATFORM_ACTOR_HEADER]: 'super-admin',
        },
        jar,
      );
      expect(replayStart.status).toBe(409);

      const staleReject = await fetchJson(
        baseUrl,
        'POST',
        `${API_PLATFORM_BILLING_RECORDS_PATH}/${duplicateSubmit.body.data.id}/reject`,
        { expectedVersion: duplicateSubmit.body.data.version + 1, reason: 'Stale review' },
        {
          [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar),
          [API_PLATFORM_ACTOR_HEADER]: 'super-admin',
        },
        jar,
      );
      expect(staleReject.status).toBe(409);

      const missingReason = await fetchJson(
        baseUrl,
        'POST',
        `${API_PLATFORM_BILLING_RECORDS_PATH}/${duplicateSubmit.body.data.id}/reject`,
        { expectedVersion: duplicateSubmit.body.data.version },
        {
          [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar),
          [API_PLATFORM_ACTOR_HEADER]: 'super-admin',
        },
        jar,
      );
      expect(missingReason.status).toBe(400);

      const subscriptionBeforeReject = await store.findSubscriptionByOrganizationId(
        owner.organizationId,
      );
      const rejected = await fetchJson(
        baseUrl,
        'POST',
        `${API_PLATFORM_BILLING_RECORDS_PATH}/${duplicateSubmit.body.data.id}/reject`,
        { expectedVersion: duplicateSubmit.body.data.version, reason: 'Unreadable slip' },
        {
          [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar),
          [API_PLATFORM_ACTOR_HEADER]: 'super-admin',
        },
        jar,
      );
      expect(rejected.status).toBe(200);
      expect(rejected.body.data.status).toBe('rejected');
      expect(rejected.body.data.rejectionReason).toBe('Unreadable slip');
      const subscriptionAfterReject = await store.findSubscriptionByOrganizationId(
        owner.organizationId,
      );
      expect(subscriptionAfterReject).toEqual(subscriptionBeforeReject);

      const mutateRejected = await fetchJson(
        baseUrl,
        'POST',
        `${API_PLATFORM_BILLING_RECORDS_PATH}/${duplicateSubmit.body.data.id}/start-review`,
        { expectedVersion: rejected.body.data.version },
        {
          [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar),
          [API_PLATFORM_ACTOR_HEADER]: 'super-admin',
        },
        jar,
      );
      expect(mutateRejected.status).toBe(409);

      const approved = await fetchJson(
        baseUrl,
        'POST',
        `${API_PLATFORM_BILLING_RECORDS_PATH}/${firstSubmit.body.data.id}/approve`,
        { expectedVersion: started.body.data.version },
        {
          [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar),
          [API_PLATFORM_ACTOR_HEADER]: 'super-admin',
        },
        jar,
      );
      expect(approved.status).toBe(200);
      expect(approved.body.data.status).toBe('approved');
      expect(approved.body.data.appliedAt).toBeTruthy();
      expect(approved.body.data.coverageStart).toBeTruthy();
      expect(approved.body.data.coverageEnd).toBeTruthy();

      const subscriptionBeforeReplay = await fetchJson(
        baseUrl,
        'GET',
        API_SUBSCRIPTION_PATH,
        undefined,
        {},
        jar,
      );

      const replayApprove = await fetchJson(
        baseUrl,
        'POST',
        `${API_PLATFORM_BILLING_RECORDS_PATH}/${firstSubmit.body.data.id}/approve`,
        { expectedVersion: approved.body.data.version },
        {
          [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar),
          [API_PLATFORM_ACTOR_HEADER]: 'super-admin',
        },
        jar,
      );
      expect(replayApprove.status).toBe(200);
      expect(replayApprove.body.data.appliedAt).toBe(approved.body.data.appliedAt);

      const reviewApproved = await fetchJson(
        baseUrl,
        'POST',
        `${API_PLATFORM_BILLING_RECORDS_PATH}/${firstSubmit.body.data.id}/start-review`,
        { expectedVersion: approved.body.data.version },
        {
          [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar),
          [API_PLATFORM_ACTOR_HEADER]: 'super-admin',
        },
        jar,
      );
      expect(reviewApproved.status).toBe(409);

      const afterApprove = await fetchJson(
        baseUrl,
        'GET',
        API_SUBSCRIPTION_PATH,
        undefined,
        {},
        jar,
      );
      expect(afterApprove.status).toBe(200);
      expect(afterApprove.body.data.status).toBe('active');
      expect(afterApprove.body.data.planCode).toBe('Business');
      expect(afterApprove.body.data.version).toBe(subscriptionBeforeReplay.body.data.version);
      expect(afterApprove.body.data.periodEndsAt).toBe(
        subscriptionBeforeReplay.body.data.periodEndsAt,
      );

      const renewalUpload = await uploadPdf(baseUrl, jar, 'renewal.pdf');
      const renewalSubmit = await fetchJson(
        baseUrl,
        'POST',
        API_SUBSCRIPTION_BILLING_RECORDS_PATH,
        {
          paymentMethod: 'bank_transfer',
          billingPeriod: 'monthly',
          submittedAmountMinorUnits: 9000,
          paymentReference: 'BANK-RENEW-1',
          evidenceStorageRef: renewalUpload.body.data.evidenceStorageRef,
          requestedPlanCode: business.planCode,
          requestedPlanVersion: business.planVersion,
        },
        { [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar) },
        jar,
      );
      expect(renewalSubmit.status).toBe(201);
      const renewalApproved = await fetchJson(
        baseUrl,
        'POST',
        `${API_PLATFORM_BILLING_RECORDS_PATH}/${renewalSubmit.body.data.id}/approve`,
        { expectedVersion: renewalSubmit.body.data.version },
        {
          [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar),
          [API_PLATFORM_ACTOR_HEADER]: 'super-admin',
        },
        jar,
      );
      expect(renewalApproved.status).toBe(200);
      expect(renewalApproved.body.data.coverageStart).toBe(approved.body.data.coverageEnd);
      expect(new Date(renewalApproved.body.data.coverageEnd).getTime()).toBeGreaterThan(
        new Date(approved.body.data.coverageEnd).getTime(),
      );

      const detail = await fetchJson(
        baseUrl,
        'GET',
        `${API_PLATFORM_BILLING_RECORDS_PATH}/${firstSubmit.body.data.id}`,
        undefined,
        { [API_PLATFORM_ACTOR_HEADER]: 'super-admin' },
        jar,
      );
      expect(detail.status).toBe(200);
      expect(detail.body.data.organization).toMatchObject({
        id: owner.organizationId,
        name: 'Workflow Org',
        displayLabel: 'Workflow Org',
      });
      expect(detail.body.data.organizationName).toBe('Workflow Org');
      expect(detail.body.data.requestedPlanSnapshot).toMatchObject({
        name: 'Business',
        planVersion: business.planVersion,
        monthlyPriceMinorUnits: 9000,
      });
      expect(detail.body.data.listedAmountMinorUnits).toBe(9000);
      expect(detail.body.data.currentSubscription).toMatchObject({
        organizationId: owner.organizationId,
        status: 'active',
        planCode: 'Business',
      });
      expect(detail.body.data.evidence).toMatchObject({
        storageRef: firstUpload.body.data.evidenceStorageRef,
        originalFileName: 'first.pdf',
        contentType: 'application/pdf',
      });
      expect(detail.body.data.appliedSubscription).toMatchObject({
        id: approved.body.data.appliedSubscriptionId,
        status: 'active',
      });
      expect(detail.body.data.evidenceStorageRef).toBe(firstUpload.body.data.evidenceStorageRef);

      const history = await fetchJson(
        baseUrl,
        'GET',
        API_SUBSCRIPTION_BILLING_RECORDS_PATH,
        undefined,
        {},
        jar,
      );
      expect(history.status).toBe(200);
      expect(history.body.data.items.some((item) => item.status === 'rejected')).toBe(true);
      expect(
        history.body.data.items.some(
          (item) => item.id === firstSubmit.body.data.id && item.status === 'approved',
        ),
      ).toBe(true);

      const organizationBatchSpy = vi.spyOn(onboardingStore, 'findOrganizationsByIds');
      const reviewerBatchSpy = vi.spyOn(onboardingStore, 'findUsersByIds');
      const organizationSingleSpy = vi.spyOn(onboardingStore, 'findOrganizationById');
      const planLookupSpy = vi.spyOn(store, 'findPlanByCodeVersion');
      const queue = await fetchJson(
        baseUrl,
        'GET',
        `${API_PLATFORM_BILLING_RECORDS_PATH}?status=approved&limit=10&offset=0`,
        undefined,
        { [API_PLATFORM_ACTOR_HEADER]: 'super-admin' },
        jar,
      );
      expect(queue.status).toBe(200);
      expect(queue.body.data.total).toBeGreaterThanOrEqual(1);
      expect(queue.body.data.items.every((item) => item.status === 'approved')).toBe(true);
      expect(queue.body.data.items[0]).toMatchObject({
        organizationName: 'Workflow Org',
        requestedPlanName: 'Business',
        listedAmountMinorUnits: 9000,
      });
      expect(queue.body.data.items[0].organization.displayLabel).toBe('Workflow Org');
      expect(queue.body.data.items[0].requestedPlanSnapshot.planVersion).toBe(business.planVersion);
      expect(queue.body.data.items[0].evidenceStorageRef).toBeUndefined();
      expect(organizationBatchSpy).toHaveBeenCalledTimes(1);
      expect(reviewerBatchSpy).toHaveBeenCalledTimes(1);
      expect(organizationSingleSpy).not.toHaveBeenCalled();
      expect(planLookupSpy).not.toHaveBeenCalled();
      organizationBatchSpy.mockRestore();
      reviewerBatchSpy.mockRestore();
      organizationSingleSpy.mockRestore();
      planLookupSpy.mockRestore();

      const searchedQueue = await fetchJson(
        baseUrl,
        'GET',
        `${API_PLATFORM_BILLING_RECORDS_PATH}?search=Workflow%20Org&limit=1&offset=0`,
        undefined,
        { [API_PLATFORM_ACTOR_HEADER]: 'super-admin' },
        jar,
      );
      expect(searchedQueue.status).toBe(200);
      expect(searchedQueue.body.data.total).toBeGreaterThanOrEqual(2);
      expect(searchedQueue.body.data.items).toHaveLength(1);
      expect(searchedQueue.body.data.items[0].organizationName).toBe('Workflow Org');

      const organizationQueue = await fetchJson(
        baseUrl,
        'GET',
        `${API_PLATFORM_BILLING_RECORDS_PATH}?organizationId=${owner.organizationId}&limit=25&offset=0`,
        undefined,
        { [API_PLATFORM_ACTOR_HEADER]: 'super-admin' },
        jar,
      );
      expect(organizationQueue.status).toBe(200);
      expect(
        organizationQueue.body.data.items.every(
          (item) => item.organizationId === owner.organizationId,
        ),
      ).toBe(true);

      const literalSearch = await fetchJson(
        baseUrl,
        'GET',
        `${API_PLATFORM_BILLING_RECORDS_PATH}?q=%5B&limit=25&offset=0`,
        undefined,
        { [API_PLATFORM_ACTOR_HEADER]: 'super-admin' },
        jar,
      );
      expect(literalSearch.status).toBe(200);

      const platformEvidence = await fetchBinary(
        baseUrl,
        `${API_PLATFORM_BILLING_RECORDS_PATH}/${firstSubmit.body.data.id}/evidence`,
        jar,
        { [API_PLATFORM_ACTOR_HEADER]: 'super-admin' },
      );
      expect(platformEvidence.status).toBe(200);

      const listed = await fetchJson(
        baseUrl,
        'GET',
        API_PLATFORM_SUBSCRIPTIONS_PATH,
        undefined,
        { [API_PLATFORM_ACTOR_HEADER]: 'super-admin' },
        jar,
      );
      const subscription = listed.body.data.items.find(
        (item) => item.organizationId === owner.organizationId,
      );
      const suspended = await fetchJson(
        baseUrl,
        'POST',
        `${API_PLATFORM_SUBSCRIPTIONS_PATH}/${subscription.id}/suspend`,
        { expectedVersion: subscription.version, reason: 'Test suspend' },
        {
          [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar),
          [API_PLATFORM_ACTOR_HEADER]: 'super-admin',
        },
        jar,
      );
      expect(suspended.status).toBe(200);
      expect(suspended.body.data.status).toBe('suspended');

      await store.updateSubscription(null, subscription.id, {
        periodEndsAt: new Date('2020-01-01T00:00:00.000Z'),
        periodStartsAt: new Date('2019-12-01T00:00:00.000Z'),
        billingPeriod: 'monthly',
      });

      const suspendedUpload = await uploadPdf(baseUrl, jar, 'suspended.pdf');
      expect(suspendedUpload.status).toBe(201);
      const suspendedSubmit = await fetchJson(
        baseUrl,
        'POST',
        API_SUBSCRIPTION_BILLING_RECORDS_PATH,
        {
          paymentMethod: 'easypaisa',
          billingPeriod: 'monthly',
          submittedAmountMinorUnits: 9000,
          paymentReference: 'EP-SUSPENDED-1',
          evidenceStorageRef: suspendedUpload.body.data.evidenceStorageRef,
          requestedPlanCode: business.planCode,
          requestedPlanVersion: business.planVersion,
        },
        { [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar) },
        jar,
      );
      expect(suspendedSubmit.status).toBe(201);

      const suspendedApproval = await fetchJson(
        baseUrl,
        'POST',
        `${API_PLATFORM_BILLING_RECORDS_PATH}/${suspendedSubmit.body.data.id}/approve`,
        { expectedVersion: suspendedSubmit.body.data.version },
        {
          [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar),
          [API_PLATFORM_ACTOR_HEADER]: 'super-admin',
        },
        jar,
      );
      expect(suspendedApproval.status).toBe(200);
      expect(suspendedApproval.body.data.status).toBe('approved');
      expect(new Date(suspendedApproval.body.data.coverageEnd).getTime()).toBeGreaterThan(
        Date.now() - 1000,
      );

      const access = await subscriptions.subscriptionService.resolveAccessState(
        owner.organizationId,
      );
      expect(access.status).toBe('active');
      expect(access.operationalWriteAllowed).toBe(true);

      const otherOwner = await createApprovedOwnerSession(baseUrl, jar, {
        organizationName: 'Other Org',
        ownerEmail: 'other-owner@example.com',
        switchAfter: true,
      });
      const crossSubmit = await fetchJson(
        baseUrl,
        'POST',
        API_SUBSCRIPTION_BILLING_RECORDS_PATH,
        {
          paymentMethod: 'bank_transfer',
          billingPeriod: 'monthly',
          submittedAmountMinorUnits: 1000,
          paymentReference: 'CROSS-REF',
          evidenceStorageRef: firstUpload.body.data.evidenceStorageRef,
          requestedPlanCode: business.planCode,
          requestedPlanVersion: business.planVersion,
        },
        { [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar) },
        jar,
      );
      expect([403, 404]).toContain(crossSubmit.status);

      const otherHistory = await fetchJson(
        baseUrl,
        'GET',
        `${API_SUBSCRIPTION_BILLING_RECORDS_PATH}/${firstSubmit.body.data.id}`,
        undefined,
        {},
        jar,
      );
      expect(otherHistory.status).toBe(404);

      const otherEvidence = await uploadPdf(baseUrl, jar, 'other.pdf');
      const originalBillingRecord = await store.findBillingRecordById(firstSubmit.body.data.id);
      await store.updateBillingRecord(null, firstSubmit.body.data.id, {
        evidenceStorageRef: otherEvidence.body.data.evidenceStorageRef,
      });
      const crossOrganizationPlatformEvidence = await fetchBinary(
        baseUrl,
        `${API_PLATFORM_BILLING_RECORDS_PATH}/${firstSubmit.body.data.id}/evidence`,
        jar,
        { [API_PLATFORM_ACTOR_HEADER]: 'super-admin' },
      );
      expect(crossOrganizationPlatformEvidence.status).toBe(404);
      await store.updateBillingRecord(null, firstSubmit.body.data.id, {
        evidenceStorageRef: originalBillingRecord.evidenceStorageRef,
      });

      const audits = store.listAuditEventsForTest();
      expect(audits.some((event) => event.action === 'subscription.billing_review_started')).toBe(
        true,
      );
      expect(audits.some((event) => event.action === 'subscription.billing_approved')).toBe(true);
      expect(audits.some((event) => event.action === 'subscription.billing_rejected')).toBe(true);

      void otherOwner;
    } finally {
      await close(server);
    }
  }, 120000);
});

async function boot() {
  const config = loadApiEnv({ NODE_ENV: 'test' });
  const app = createApp({
    config,
    database: createMockDatabaseLifecycle({ ready: true }),
  });
  const server = createServer(app);
  await listen(server);
  const address = server.address();
  return {
    server,
    baseUrl: `http://127.0.0.1:${address.port}`,
    jar: { cookie: null },
    store: app.agrivio.subscriptions.store,
    subscriptions: app.agrivio.subscriptions,
    onboardingStore: app.agrivio.onboarding.store,
  };
}

async function createPlan(baseUrl, jar, body) {
  return fetchJson(
    baseUrl,
    'POST',
    API_PLATFORM_SUBSCRIPTION_PLANS_PATH,
    body,
    {
      [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar),
      [API_PLATFORM_ACTOR_HEADER]: 'super-admin',
    },
    jar,
  );
}

async function createApprovedOwnerSession(baseUrl, jar, options) {
  const requested = await fetchJson(
    baseUrl,
    'POST',
    API_ORGANIZATION_ACTIVATION_REQUESTS_PATH,
    {
      organizationName: options.organizationName,
      ownerEmail: options.ownerEmail,
      ownerDisplayName: 'Owner',
    },
    { [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar) },
    jar,
  );
  expect(requested.status).toBe(201);

  const approved = await fetchJson(
    baseUrl,
    'POST',
    `${API_PLATFORM_ORGANIZATIONS_PATH}/${requested.body.data.organizationId}/approve`,
    {},
    {
      [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar),
      [API_PLATFORM_ACTOR_HEADER]: 'super-admin',
    },
    jar,
  );
  expect(approved.status).toBe(200);

  await fetchJson(
    baseUrl,
    'POST',
    '/api/v1/auth/activate',
    {
      token: approved.body.data.activationToken,
      password: 'a-strong-passphrase-12',
    },
    { [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar) },
    jar,
  );

  const login = await fetchJson(
    baseUrl,
    'POST',
    '/api/v1/auth/login',
    {
      email: options.ownerEmail,
      password: 'a-strong-passphrase-12',
    },
    { [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar) },
    jar,
  );
  expect(login.status).toBe(200);

  return { organizationId: requested.body.data.organizationId };
}

function pdfBuffer() {
  return Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n');
}

async function uploadPdf(baseUrl, jar, fileName) {
  return uploadEvidence(baseUrl, jar, {
    contentType: 'application/pdf',
    fileName,
    body: pdfBuffer(),
  });
}

async function uploadEvidence(baseUrl, jar, input) {
  const csrf = await issueCsrf(baseUrl, jar);
  const response = await fetch(`${baseUrl}${API_SUBSCRIPTION_BILLING_EVIDENCE_PATH}`, {
    method: 'POST',
    headers: {
      'content-type': input.contentType,
      'X-Filename': input.fileName,
      [API_CSRF_HEADER]: csrf,
      ...(jar?.cookie ? { cookie: jar.cookie } : {}),
    },
    body: input.body,
  });
  absorbCookies(response, jar);
  return { status: response.status, body: await response.json() };
}

async function fetchBinary(baseUrl, path, jar, headers = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: {
      ...(jar?.cookie ? { cookie: jar.cookie } : {}),
      ...headers,
    },
  });
  absorbCookies(response, jar);
  return {
    status: response.status,
    contentType: response.headers.get('content-type'),
    contentDisposition: response.headers.get('content-disposition'),
    buffer: Buffer.from(await response.arrayBuffer()),
  };
}

async function issueCsrf(baseUrl, jar) {
  const response = await fetchJson(baseUrl, 'POST', '/api/v1/auth/csrf', {}, {}, jar);
  expect(response.status).toBe(200);
  return response.body.data.csrfToken;
}

async function fetchJson(baseUrl, method, path, body, headers = {}, jar) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      ...(jar?.cookie ? { cookie: jar.cookie } : {}),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  absorbCookies(response, jar);
  const text = await response.text();
  let parsed;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = text;
  }
  return { status: response.status, body: parsed };
}

function absorbCookies(response, jar) {
  const setCookie = response.headers.getSetCookie?.() ?? [];
  if (setCookie.length > 0 && jar) {
    jar.cookie = setCookie.map((value) => value.split(';')[0]).join('; ');
  }
}

function listen(server) {
  return new Promise((resolve, reject) => {
    server.listen(0, '127.0.0.1', (error) => (error ? reject(error) : resolve(undefined)));
  });
}

function close(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve(undefined)));
  });
}
