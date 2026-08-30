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
    server.listen(0, '127.0.0.1', () => resolve());
  });
  try {
    const address = server.address();
    await work(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

function build({
  assertAllowed,
  permissions = ['settings.view'],
  organizationId = 'org-a',
  requireOperationalAccess = (_req, _res, next) => next(),
}) {
  const getSetupProgress = vi.fn(async () => ({
    steps: [],
    readyForOperations: false,
    notes: [],
  }));
  const app = express();
  app.use(createRequestIdMiddleware());
  app.use(
    registerOrganizationRoutes({
      requireAuth: (req, _res, next) => {
        req.auth = { session: {}, user: {} };
        req.authContext = {
          contextType: 'organization',
          organizationId,
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

describe('Organization Setup capability route', () => {
  it('blocks disabled Setup after RBAC and subscription checks', async () => {
    const assertAllowed = vi.fn(async () => {
      throw orgCapabilityDisabled('Setup disabled', { controlKey: 'setup' });
    });
    const { app, getSetupProgress } = build({ assertAllowed });
    await withServer(app, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/v1/organization/setup-progress`);
      expect(response.status).toBe(403);
      expect((await response.json()).error.code).toBe('ORG_CAPABILITY_DISABLED');
    });
    expect(getSetupProgress).not.toHaveBeenCalled();
  });

  it('does not evaluate capability when permission or subscription denies access', async () => {
    const missingPermission = vi.fn();
    const deniedByRbac = build({ assertAllowed: missingPermission, permissions: [] });
    await withServer(deniedByRbac.app, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/v1/organization/setup-progress`);
      expect((await response.json()).error.code).toBe('PERMISSION_DENIED');
    });
    expect(missingPermission).not.toHaveBeenCalled();

    const deniedBySubscription = vi.fn();
    const subscriptionApp = build({
      assertAllowed: deniedBySubscription,
      requireOperationalAccess: (_req, _res, next) => next(forbidden('Operational access required')),
    });
    await withServer(subscriptionApp.app, async (baseUrl) => {
      expect((await fetch(`${baseUrl}/api/v1/organization/setup-progress`)).status).toBe(403);
    });
    expect(deniedBySubscription).not.toHaveBeenCalled();
  });

  it('uses only authenticated organization context', async () => {
    const assertAllowed = vi.fn(async () => undefined);
    const { app, getSetupProgress } = build({ assertAllowed, organizationId: 'org-b' });
    await withServer(app, async (baseUrl) => {
      expect((await fetch(`${baseUrl}/api/v1/organization/setup-progress`)).status).toBe(200);
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
