import { describe, expect, it } from 'vitest';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  API_AUTH_CSRF_PATH,
  API_AUTH_LOGIN_PATH,
  API_CSRF_HEADER,
  API_IDEMPOTENCY_KEY_HEADER,
  API_ORGANIZATION_ACTIVATION_REQUESTS_PATH,
  API_PLATFORM_ACTOR_HEADER,
  API_PLATFORM_OPERATIONS_BACKUPS_PATH,
  API_PLATFORM_OPERATIONS_RESTORES_PATH,
  API_PLATFORM_ORGANIZATIONS_PATH,
  API_PLATFORM_SUBSCRIPTION_PLANS_PATH,
} from '@agrivio/api-contracts';
import { createOperationsModule } from './operations.module.js';
import { permissionsForPlatformAccess } from '../identity/role-permissions.js';
import {
  collectSourceFiles,
  extractImportSpecifiers,
} from '../../platform/architecture/boundary-scan.js';

const { createApp } = require('../../app');
const { loadApiEnv } = require('../../platform/config/runtime-config');
const { createMockDatabaseLifecycle } = require('../../platform/database/mongo-connection');

const testDir = fileURLToPath(new URL('.', import.meta.url));
const backendRoot = join(testDir, '../..');

describe('F08 P4 backup/restore operations', () => {
  it('lets authorized operators view backup failures and coordinate restore without claiming production restore', async () => {
    const operations = createOperationsModule();
    await operations.operationsService.recordBackupOutcome({
      status: 'failed',
      failureMessage: 'snapshot timeout',
    });
    const listed = await operations.operationsService.listBackups();
    expect(listed.items[0].failureVisible).toBe(true);
    expect(listed.items[0].failureMessage).toBe('snapshot timeout');

    const restoreActor = {
      actorId: 'ops-1',
      permissions: [...permissionsForPlatformAccess('super_admin'), 'operations.restore.execute'],
    };
    const restore = await operations.operationsService.initiateRestoreCoordination(
      { reason: 'Incident IR-1' },
      restoreActor,
    );
    expect(restore.status).toBe('coordination_initiated');
    expect(restore.productionRestoreExecuted).toBe(false);
    expect(restore.coordinationOnly).toBe(true);

    const events = operations.auditStore.listForTest();
    expect(events.some((event) => event.action === 'restore.coordination.initiated')).toBe(true);

    await expect(
      operations.operationsService.initiateRestoreCoordination(
        { reason: 'nope' },
        { actorId: 'org-user', permissions: [] },
      ),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });

    expect(operations.operationsService.listBackups).toBeDefined();
    expect(operations.operationsService.postSale).toBeUndefined();
    expect(operations.operationsService.updatePurchase).toBeUndefined();
  });

  it('exposes backup status to platform operators and denies org restore initiation', async () => {
    const { server, baseUrl, jar, app } = await boot();
    try {
      await seedPlan(baseUrl, jar);
      await createApprovedOwner(baseUrl, jar, {
        organizationName: 'Ops Org',
        ownerEmail: 'ops-owner@example.com',
        password: 'a-strong-passphrase',
      });
      await app.agrivio.operations.operationsService.recordBackupOutcome({
        status: 'failed',
        failureMessage: 'checksum mismatch',
      });

      const backups = await fetchJson(
        baseUrl,
        'GET',
        API_PLATFORM_OPERATIONS_BACKUPS_PATH,
        undefined,
        { [API_PLATFORM_ACTOR_HEADER]: 'super-admin' },
        jar,
      );
      expect(backups.status).toBe(200);
      expect(backups.body.data.items[0].failureVisible).toBe(true);

      const platformRestoreDenied = await fetchJson(
        baseUrl,
        'POST',
        API_PLATFORM_OPERATIONS_RESTORES_PATH,
        { reason: 'attempt' },
        {
          [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar),
          [API_PLATFORM_ACTOR_HEADER]: 'super-admin',
          [API_IDEMPOTENCY_KEY_HEADER]: 'restore-1',
        },
        jar,
      );
      expect(platformRestoreDenied.status).toBe(403);

      await login(baseUrl, jar, 'ops-owner@example.com', 'a-strong-passphrase');
      const orgRestore = await fetchJson(
        baseUrl,
        'POST',
        API_PLATFORM_OPERATIONS_RESTORES_PATH,
        { reason: 'org attempt' },
        {
          [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar),
          [API_IDEMPOTENCY_KEY_HEADER]: 'restore-org',
        },
        jar,
      );
      expect(orgRestore.status).toBe(403);
    } finally {
      await close(server);
    }
  }, 120000);

  it('keeps Operations free of business ledger persistence and generic DB-admin routes', () => {
    const violations = [];
    for (const filePath of collectSourceFiles(join(backendRoot, 'modules/operations'))) {
      const normalized = filePath.replaceAll('\\', '/');
      const contents = readFileSync(filePath, 'utf8');
      for (const fragment of ['/generic-db', '/admin/database']) {
        if (contents.includes(fragment)) {
          violations.push(`${normalized} contains ${fragment}`);
        }
      }
      for (const specifier of extractImportSpecifiers(filePath)) {
        if (
          specifier.includes('sales.store') ||
          specifier.includes('purchases.store') ||
          specifier.includes('inventory.store')
        ) {
          violations.push(`${normalized} → ${specifier}`);
        }
      }
    }
    expect(violations).toEqual([]);
  });
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
  if (address === null || typeof address === 'string') {
    throw new Error('Expected TCP port');
  }
  return { app, server, baseUrl: `http://127.0.0.1:${address.port}`, jar: createCookieJar() };
}

async function seedPlan(baseUrl, jar) {
  const response = await fetchJson(
    baseUrl,
    'POST',
    API_PLATFORM_SUBSCRIPTION_PLANS_PATH,
    { planCode: 'Starter', activate: true, monthlyPriceMinorUnits: 1000 },
    {
      [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar),
      [API_PLATFORM_ACTOR_HEADER]: 'super-admin',
    },
    jar,
  );
  expect([200, 201]).toContain(response.status);
}

async function createApprovedOwner(baseUrl, jar, input) {
  const requested = await fetchJson(
    baseUrl,
    'POST',
    API_ORGANIZATION_ACTIVATION_REQUESTS_PATH,
    {
      organizationName: input.organizationName,
      ownerEmail: input.ownerEmail,
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
  const activated = await fetchJson(
    baseUrl,
    'POST',
    '/api/v1/auth/activate',
    { token: approved.body.data.activationToken, password: input.password },
    { [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar) },
    jar,
  );
  expect(activated.status).toBe(200);
}

async function login(baseUrl, jar, email, password) {
  const response = await fetchJson(
    baseUrl,
    'POST',
    API_AUTH_LOGIN_PATH,
    { email, password },
    { [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar) },
    jar,
  );
  expect(response.status).toBe(200);
}

async function issueCsrf(baseUrl, jar) {
  const response = await fetchJson(baseUrl, 'POST', API_AUTH_CSRF_PATH, {}, {}, jar);
  expect(response.status).toBe(200);
  return response.body.data.csrfToken;
}

function createCookieJar() {
  const cookies = new Map();
  return {
    absorb(headers) {
      const raw = headers.getSetCookie?.() ?? [];
      for (const entry of raw) {
        const [pair] = entry.split(';');
        const index = pair.indexOf('=');
        if (index > 0) {
          cookies.set(pair.slice(0, index), decodeURIComponent(pair.slice(index + 1)));
        }
      }
    },
    header() {
      return [...cookies.entries()].map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('; ');
    },
  };
}

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(undefined));
  });
}

function close(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve(undefined)));
  });
}

async function fetchJson(baseUrl, method, path, body, headers, jar) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...(body === null || body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(jar?.header() ? { Cookie: jar.header() } : {}),
      ...headers,
    },
    body: body === null || body === undefined ? undefined : JSON.stringify(body),
  });
  jar?.absorb(response.headers);
  const text = await response.text();
  let parsed;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = { raw: text };
  }
  return { status: response.status, body: parsed };
}
