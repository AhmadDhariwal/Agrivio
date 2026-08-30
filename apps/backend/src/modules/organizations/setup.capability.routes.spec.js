import { createServer } from 'node:http';
import express from 'express';
import { describe, expect, it, vi } from 'vitest';
import errorHandlerModule from '../../platform/errors/error-handler.middleware';
import appErrorModule from '../../platform/errors/app-error';
import requestIdModule from '../../platform/http/request-id.middleware';
import organizationRoutesModule from './routes/organization.routes';

const { createErrorHandlerMiddleware } = errorHandlerModule;
const { forbidden, orgCapabilityDisabled } = appErrorModule;
const { createRequestIdMiddleware } = requestIdModule;
const { registerOrganizationRoutes } = organizationRoutesModule;

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

function buildApp({
  assertAllowed,
  permissions = ['settings.view'],
  organizationId = 'org-a',
  requireOperationalAccess = (_req, _res, next) => next(),
  getSetupProgress = vi.fn(async () => ({
    steps: [],
    readyForOperations: false,
    notes: [],
  })),
}) {
  const app = express();
  app.use(express.json());
  app.use(createRequestIdMiddleware());
  app.use(
    registerOrganizationRoutes({
      requireAuth: (req, _res, next) => {
        req.auth = { session: {}, user: {} };
        req.authContext = {
          contextType: 'organization',
          organizationId,
          userId: 'user-a',
          permissions,
        };
        next();
      },
      requireCsrf: (_req, _res, next) => next(),
      requireBillingAccess: (_req, _res, next) => next(),
      requireOperationalAccess,
      capabilityService: { assertAllowed },
      setupProgressService: { getSetupProgress },
    }),
  );
  app.use(createErrorHandlerMiddleware('test', () => undefined));
  return { app, getSetupProgress };
}

describe('Organization Setup capability route enforcement', () => {
  it('blocks the progress endpoint when Setup is disabled', async () => {
    const assertAllowed = vi.fn(async (organizationId, key, mode) => {
      expect(organizationId).toBe('org-a');
      expect(key).toBe('setup');
      expect(mode).toBe('enabled');
      throw orgCapabilityDisabled('Organization Setup disabled', { controlKey: key });
    });
    const { app, getSetupProgress } = buildApp({ assertAllowed });

    await withServer(app, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/v1/organization/setup-progress`);
      expect(response.status).toBe(403);
      expect((await response.json()).error.code).toBe('ORG_CAPABILITY_DISABLED');
    });
    expect(getSetupProgress).not.toHaveBeenCalled();
  });

  it('keeps RBAC authoritative before capability evaluation', async () => {
    const assertAllowed = vi.fn();
    const { app, getSetupProgress } = buildApp({ assertAllowed, permissions: [] });

    await withServer(app, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/v1/organization/setup-progress`);
      expect(response.status).toBe(403);
      expect((await response.json()).error.code).toBe('PERMISSION_DENIED');
    });
    expect(assertAllowed).not.toHaveBeenCalled();
    expect(getSetupProgress).not.toHaveBeenCalled();
  });

  it('keeps operational subscription access authoritative before capability evaluation', async () => {
    const assertAllowed = vi.fn();
    const { app, getSetupProgress } = buildApp({
      assertAllowed,
      requireOperationalAccess: (_req, _res, next) =>
        next(forbidden('Operational subscription access is required')),
    });

    await withServer(app, async (baseUrl) => {
      expect((await fetch(`${baseUrl}/api/v1/organization/setup-progress`)).status).toBe(403);
    });
    expect(assertAllowed).not.toHaveBeenCalled();
    expect(getSetupProgress).not.toHaveBeenCalled();
  });

  it('uses authenticated organization context and preserves the Setup DTO', async () => {
    const dto = {
      steps: [
        {
          id: 'branch',
          title: 'Create a branch',
          status: 'complete',
          href: '/app/branches',
          permission: 'branches.view',
        },
      ],
      readyForOperations: true,
      notes: ['Authoritative note'],
    };
    const assertAllowed = vi.fn(async () => undefined);
    const getSetupProgress = vi.fn(async () => dto);
    const { app } = buildApp({
      assertAllowed,
      getSetupProgress,
      organizationId: 'org-b',
    });

    await withServer(app, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/v1/organization/setup-progress`);
      expect(response.status).toBe(200);
      expect((await response.json()).data).toEqual(dto);
    });
    expect(assertAllowed).toHaveBeenCalledWith(
      'org-b',
      'setup',
      'enabled',
      expect.objectContaining({ permissions: ['settings.view'] }),
    );
    expect(getSetupProgress).toHaveBeenCalledWith('org-b', {
      permissions: ['settings.view'],
    });
  });
});
