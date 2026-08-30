import { createServer } from 'node:http';
import express from 'express';
import { describe, expect, it, vi } from 'vitest';
import transactionRunnerModule from '../../platform/transactions/transaction-runner';
import auditWriterModule from '../../platform/audit/audit-writer';
import capabilityStoreModule from '../capabilities/capability.store';
import capabilityServiceModule from '../capabilities/capability.service';
import errorHandlerModule from '../../platform/errors/error-handler.middleware';
import requestIdModule from '../../platform/http/request-id.middleware';
import subscriptionRoutesModule from './routes/subscription.routes';

const { createMockTransactionSessionPort, createTransactionRunner } = transactionRunnerModule;
const { createInMemoryAuditEventStore } = auditWriterModule;
const { createInMemoryCapabilityPolicyStore } = capabilityStoreModule;
const { createCapabilityService } = capabilityServiceModule;
const { createErrorHandlerMiddleware } = errorHandlerModule;
const { createRequestIdMiddleware } = requestIdModule;
const { registerSubscriptionRoutes } = subscriptionRoutesModule;

const RECORDS = '/api/v1/subscription/billing-records';
const UPLOAD = '/api/v1/subscription/billing-evidence';

function createCapabilityHarness(status = 'active') {
  return createCapabilityService({
    store: createInMemoryCapabilityPolicyStore(),
    auditStore: createInMemoryAuditEventStore(),
    transactionRunner: createTransactionRunner(createMockTransactionSessionPort().port),
    resolveSubscriptionAccessState: async () => ({
      status,
      accessLevel: status === 'suspended' ? 'billing' : 'operational',
    }),
  });
}

function createSubscriptionService(status = 'active') {
  return {
    resolveAccessState: vi.fn(async () => ({
      status,
      accessLevel: status === 'suspended' ? 'billing' : 'operational',
    })),
    uploadBillingEvidence: vi.fn(async () => ({ evidenceStorageRef: 'evidence://org-a/file' })),
    submitBillingEvidence: vi.fn(async () => ({ id: 'billing-1' })),
    listOrganizationBillingRecords: vi.fn(async () => []),
    getOrganizationBillingRecord: vi.fn(async () => ({ id: 'billing-1' })),
    readOrganizationBillingEvidence: vi.fn(async () => ({
      contentType: 'application/pdf',
      originalFileName: 'receipt.pdf',
      buffer: Buffer.from('pdf'),
    })),
  };
}

function buildApp({ capabilityService, subscriptionService, permissions, organizationId = 'org-a' }) {
  const app = express();
  app.use(express.json());
  app.use(createRequestIdMiddleware());
  app.use(
    registerSubscriptionRoutes({
      config: {},
      capabilityService,
      subscriptionService,
      requireAuth: (req, _res, next) => {
        req.auth = { session: {}, user: { _id: 'user-a' } };
        req.authContext = {
          contextType: 'organization',
          organizationId,
          userId: 'user-a',
          permissions,
        };
        next();
      },
      requireCsrf: (_req, _res, next) => next(),
      optionalAuth: (_req, _res, next) => next(),
    }),
  );
  app.use(createErrorHandlerMiddleware('test', () => undefined));
  return app;
}

async function withServer(app, work) {
  const server = createServer(app);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(undefined));
  });
  try {
    const address = server.address();
    if (address === null || typeof address === 'string') throw new Error('Expected TCP port');
    await work(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve(undefined)));
    });
  }
}

function validSubmit(notes) {
  return {
    paymentMethod: 'bank_transfer',
    billingPeriod: 'monthly',
    submittedAmountMinorUnits: 9000,
    paymentReference: 'REF-1',
    evidenceStorageRef: 'evidence://org-a/file',
    requestedPlanCode: 'Business',
    requestedPlanVersion: 1,
    ...(notes === undefined ? {} : { notes }),
  };
}

describe('Billing capability API enforcement', () => {
  it('blocks tenant Billing APIs when the module is disabled', async () => {
    const capabilityService = createCapabilityHarness();
    await capabilityService.updatePolicy(
      'org-a',
      { expectedVersion: 0, changes: [{ key: 'billing', value: { enabled: false } }] },
      { actorId: 'platform-admin' },
    );
    const subscriptionService = createSubscriptionService();
    const app = buildApp({
      capabilityService,
      subscriptionService,
      permissions: ['subscription.view', 'subscription.billing-evidence.submit'],
    });

    await withServer(app, async (baseUrl) => {
      const response = await fetch(`${baseUrl}${RECORDS}`);
      expect(response.status).toBe(403);
      expect((await response.json()).error).toMatchObject({
        code: 'ORG_CAPABILITY_DISABLED',
        details: { controlKey: 'billing' },
      });
    });
    expect(subscriptionService.listOrganizationBillingRecords).not.toHaveBeenCalled();
  });

  it('blocks submit and upload independently when their actions are disabled', async () => {
    for (const [key, path, init, serviceMethod] of [
      [
        'billing.actions.submit',
        RECORDS,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(validSubmit()),
        },
        'submitBillingEvidence',
      ],
      [
        'billing.actions.uploadEvidence',
        UPLOAD,
        {
          method: 'POST',
          headers: { 'content-type': 'application/pdf', 'x-filename': 'receipt.pdf' },
          body: Buffer.from('pdf'),
        },
        'uploadBillingEvidence',
      ],
      [
        'billing.actions.downloadEvidence',
        `${RECORDS}/billing-1/evidence`,
        { method: 'GET' },
        'readOrganizationBillingEvidence',
      ],
    ]) {
      const capabilityService = createCapabilityHarness();
      await capabilityService.updatePolicy(
        'org-a',
        { expectedVersion: 0, changes: [{ key, value: { allowed: false } }] },
        { actorId: 'platform-admin' },
      );
      const subscriptionService = createSubscriptionService();
      const app = buildApp({
        capabilityService,
        subscriptionService,
        permissions: ['subscription.view', 'subscription.billing-evidence.submit'],
      });

      await withServer(app, async (baseUrl) => {
        const response = await fetch(`${baseUrl}${path}`, init);
        expect(response.status).toBe(403);
        expect((await response.json()).error).toMatchObject({
          code: 'ORG_ACTION_NOT_ALLOWED',
          details: { controlKey: key },
        });
      });
      expect(subscriptionService[serviceMethod]).not.toHaveBeenCalled();
    }
  });

  it('rejects crafted Notes while permitting a required-field-only submission', async () => {
    const capabilityService = createCapabilityHarness();
    await capabilityService.updatePolicy(
      'org-a',
      {
        expectedVersion: 0,
        changes: [{ key: 'billing.fields.notes', value: { editable: false } }],
      },
      { actorId: 'platform-admin' },
    );
    const subscriptionService = createSubscriptionService();
    const app = buildApp({
      capabilityService,
      subscriptionService,
      permissions: ['subscription.view', 'subscription.billing-evidence.submit'],
    });

    await withServer(app, async (baseUrl) => {
      const blocked = await fetch(`${baseUrl}${RECORDS}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(validSubmit('crafted note')),
      });
      expect(blocked.status).toBe(403);
      expect((await blocked.json()).error.code).toBe('ORG_FIELD_NOT_EDITABLE');

      const allowed = await fetch(`${baseUrl}${RECORDS}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(validSubmit()),
      });
      expect(allowed.status).toBe(201);
    });
  });

  it('does not let organization policy bypass RBAC', async () => {
    const capabilityService = { assertAllowed: vi.fn() };
    const subscriptionService = createSubscriptionService();
    const app = buildApp({
      capabilityService,
      subscriptionService,
      permissions: ['subscription.view'],
    });

    await withServer(app, async (baseUrl) => {
      const response = await fetch(`${baseUrl}${RECORDS}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(validSubmit()),
      });
      expect(response.status).toBe(403);
    });
    expect(capabilityService.assertAllowed).not.toHaveBeenCalled();
    expect(subscriptionService.submitBillingEvidence).not.toHaveBeenCalled();
  });

  it('preserves Billing access for suspended organizations', async () => {
    const capabilityService = createCapabilityHarness('suspended');
    const subscriptionService = createSubscriptionService('suspended');
    const app = buildApp({
      capabilityService,
      subscriptionService,
      permissions: ['subscription.view', 'subscription.billing-evidence.submit'],
    });

    await withServer(app, async (baseUrl) => {
      const listed = await fetch(`${baseUrl}${RECORDS}`);
      expect(listed.status).toBe(200);

      const submitted = await fetch(`${baseUrl}${RECORDS}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(validSubmit()),
      });
      expect(submitted.status).toBe(201);
    });
  });
});
