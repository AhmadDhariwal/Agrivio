import { afterEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import { createServer } from 'node:http';
import { API_REPORTS_PATH } from '@agrivio/api-contracts';
import reportingModule from './reporting.module';
import reportingRoutesModule from './routes/reporting.routes';
import reportCatalogModule from './report-catalog';
import capabilityRegistryModule from '../capabilities/capability.registry';
import appErrorModule from '../../platform/errors/app-error';

const { createReportingModule } = reportingModule;
const { registerReportingRoutes } = reportingRoutesModule;
const { REPORT_FAMILIES } = reportCatalogModule;
const { REPORT_CAPABILITY_KEY_BY_REPORT_KEY } = capabilityRegistryModule;
const { orgActionNotAllowed, orgCapabilityDisabled } = appErrorModule;

const openServers = [];

function authContext(permissions = ['reports.view', 'reports.export']) {
  return {
    userId: 'owner-1',
    organizationId: 'org-1',
    contextType: 'organization',
    permissions,
  };
}

function capabilityService(assertAllowed) {
  return { assertAllowed: vi.fn(assertAllowed) };
}

function createService(capabilities) {
  return createReportingModule({
    capabilityService: capabilities,
    resolvePlanEntitlements: async () => ({ reportsExports: true }),
  }).reportingService;
}

afterEach(async () => {
  await Promise.all(
    openServers.splice(0).map(
      (server) => new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve()))),
    ),
  );
});

describe('Reports execution and export capability enforcement', () => {
  it('maps every catalog report to its independent availability control before execution', async () => {
    expect(Object.keys(REPORT_CAPABILITY_KEY_BY_REPORT_KEY)).toEqual(
      REPORT_FAMILIES.map((report) => report.key),
    );
    for (const [reportKey, expectedCapability] of Object.entries(
      REPORT_CAPABILITY_KEY_BY_REPORT_KEY,
    )) {
      const capabilities = capabilityService(async (_organizationId, key) => {
        if (key === expectedCapability) {
          throw orgCapabilityDisabled();
        }
      });
      await expect(
        createService(capabilities).getReport('org-1', reportKey, {}, authContext()),
      ).rejects.toMatchObject({ code: 'ORG_CAPABILITY_DISABLED' });
      expect(capabilities.assertAllowed).toHaveBeenCalledWith(
        'org-1',
        expectedCapability,
        'enabled',
        { permissions: ['reports.view', 'reports.export'] },
      );
    }
  });

  it('enforces run and the format-specific export action without coupling export to run', async () => {
    const runCapabilities = capabilityService(async (_organizationId, key) => {
      if (key === 'reports.actions.run') {
        throw orgActionNotAllowed();
      }
    });
    await expect(
      createService(runCapabilities).getReport('org-1', 'sales', {}, authContext()),
    ).rejects.toMatchObject({ code: 'ORG_ACTION_NOT_ALLOWED' });

    for (const [format, action] of [
      ['pdf', 'reports.actions.exportPdf'],
      ['excel', 'reports.actions.exportExcel'],
      ['csv', 'reports.actions.exportCsv'],
    ]) {
      const exportCapabilities = capabilityService(async (_organizationId, key) => {
        if (key === action) {
          throw orgActionNotAllowed();
        }
      });
      await expect(
        createService(exportCapabilities).exportReport(
          'org-1',
          'sales',
          { format },
          authContext(),
        ),
      ).rejects.toMatchObject({ code: 'ORG_ACTION_NOT_ALLOWED' });
      expect(exportCapabilities.assertAllowed).toHaveBeenCalledWith(
        'org-1',
        action,
        'allowed',
        { permissions: ['reports.view', 'reports.export'] },
      );
      expect(exportCapabilities.assertAllowed).not.toHaveBeenCalledWith(
        'org-1',
        'reports.actions.run',
        'allowed',
        expect.anything(),
      );
    }
  });

  it('blocks catalog, run, and export endpoints at the Reports module boundary', async () => {
    const capabilities = capabilityService(async () => {
      throw orgCapabilityDisabled();
    });
    const reportingService = {
      listReportCatalog: vi.fn(() => ({ items: [] })),
      getReport: vi.fn(),
      exportReport: vi.fn(),
    };
    const app = express();
    app.use(express.json());
    app.use(
      registerReportingRoutes({
        reportingService,
        capabilityService: capabilities,
        requireAuth(req, _res, next) {
          req.auth = { userId: 'owner-1' };
          req.authContext = authContext();
          next();
        },
        requireCsrf(_req, _res, next) {
          next();
        },
        requireOperationalAccess(_req, _res, next) {
          next();
        },
        requireSuspendedReadAccess(req, _res, next) {
          req.subscriptionAccessState = {
            status: 'active',
            accessLevel: 'operational',
            plan: { entitlements: { reportsExports: true } },
          };
          next();
        },
      }),
    );
    app.use((error, _req, res, next) => {
      void next;
      res.status(error.statusCode ?? 500).json({ code: error.code });
    });
    const server = createServer(app);
    openServers.push(server);
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
    const address = server.address();
    if (address === null || typeof address === 'string') {
      throw new Error('Expected TCP port');
    }
    const baseUrl = `http://127.0.0.1:${address.port}`;

    for (const [method, path, body] of [
      ['GET', API_REPORTS_PATH, undefined],
      ['GET', `${API_REPORTS_PATH}/sales`, undefined],
      ['POST', `${API_REPORTS_PATH}/sales/export`, { format: 'csv' }],
    ]) {
      const response = await fetch(`${baseUrl}${path}`, {
        method,
        headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      expect(response.status).toBe(403);
      expect(await response.json()).toEqual({ code: 'ORG_CAPABILITY_DISABLED' });
    }
    expect(reportingService.listReportCatalog).not.toHaveBeenCalled();
    expect(reportingService.getReport).not.toHaveBeenCalled();
    expect(reportingService.exportReport).not.toHaveBeenCalled();
    expect(capabilities.assertAllowed).toHaveBeenCalledTimes(3);
  });
});
