import { createServer } from 'node:http';
import express from 'express';
import { describe, expect, it, vi } from 'vitest';
import errorHandlerModule from '../../platform/errors/error-handler.middleware';
import requestIdModule from '../../platform/http/request-id.middleware';
import routesModule from './routes/capability.routes';

const { createErrorHandlerMiddleware } = errorHandlerModule;
const { createRequestIdMiddleware } = requestIdModule;
const { registerCapabilityRoutes } = routesModule;

describe('Organization Capability Policy HTTP authorization', () => {
  it('does not let a non-Super Admin update an organization policy', async () => {
    const updatePolicy = vi.fn();
    const app = express();
    app.use(express.json());
    app.use(createRequestIdMiddleware());
    app.use(
      registerCapabilityRoutes({
        config: { nodeEnv: 'test' },
        requireAuth: (_req, _res, next) => next(),
        requireCsrf: (_req, _res, next) => next(),
        optionalAuth: (req, _res, next) => {
          req.auth = {
            session: { activeContextType: 'platform' },
            user: { _id: 'support-user', platformAccess: 'support' },
          };
          req.authContext = { contextType: 'platform', permissions: [] };
          next();
        },
        capabilityService: {
          updatePolicy,
          listRegistry: vi.fn(),
          resolveEffective: vi.fn(),
          resetOverride: vi.fn(),
          resetModule: vi.fn(),
          resetAll: vi.fn(),
          getHistory: vi.fn(),
        },
        getOrganization: vi.fn(),
        requireOrganization: vi.fn(),
      }),
    );
    app.use(createErrorHandlerMiddleware('test', () => undefined));
    const server = createServer(app);

    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', () => resolve(undefined));
    });

    try {
      const address = server.address();
      if (address === null || typeof address === 'string') {
        throw new Error('Expected server to listen on a TCP port');
      }
      const response = await fetch(
        `http://127.0.0.1:${address.port}/api/v1/platform/organizations/org-a/capabilities`,
        {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            expectedVersion: 0,
            changes: [{ key: 'inventory.stock', value: { enabled: false } }],
          }),
        },
      );
      const body = await response.json();

      expect(response.status).toBe(403);
      expect(body.error.code).toBe('FORBIDDEN');
      expect(updatePolicy).not.toHaveBeenCalled();
    } finally {
      await new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve(undefined)));
      });
    }
  });
});
