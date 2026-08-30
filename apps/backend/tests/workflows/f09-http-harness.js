import { expect } from 'vitest';
import { createServer } from 'node:http';
import {
  API_AUTH_CSRF_PATH,
  API_AUTH_LOGIN_PATH,
  API_AUTH_LOGOUT_PATH,
  API_CSRF_HEADER,
  API_ORGANIZATION_ACTIVATION_REQUESTS_PATH,
  API_PLATFORM_ACTOR_HEADER,
  API_PLATFORM_ORGANIZATIONS_PATH,
  API_PLATFORM_SUBSCRIPTION_PLANS_PATH,
  API_SESSION_COOKIE_NAME,
} from '@agrivio/api-contracts';
import { hashPassword } from '../../src/modules/identity/password.service.js';

const { createApp } = require('../../src/app');
const { loadApiEnv } = require('../../src/platform/config/runtime-config');
const { createMockDatabaseLifecycle } = require('../../src/platform/database/mongo-connection');

export async function bootF09App() {
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
  return {
    app,
    server,
    baseUrl: `http://127.0.0.1:${address.port}`,
    jar: createCookieJar(),
  };
}

export function closeServer(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve(undefined)));
  });
}

export async function seedPlan(baseUrl, jar) {
  const response = await fetchJson(
    baseUrl,
    'POST',
    API_PLATFORM_SUBSCRIPTION_PLANS_PATH,
    {
      planCode: 'Starter',
      activate: true,
      monthlyPriceMinorUnits: 1000,
      entitlements: { reportsExports: true, imports: true, auditHistory: '90d' },
    },
    {
      [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar),
      [API_PLATFORM_ACTOR_HEADER]: 'super-admin',
    },
    jar,
  );
  expect([200, 201]).toContain(response.status);
}

export async function createApprovedOwner(baseUrl, jar, input) {
  const requested = await fetchJson(
    baseUrl,
    'POST',
    API_ORGANIZATION_ACTIVATION_REQUESTS_PATH,
    {
      organizationName: input.organizationName,
      ownerEmail: input.ownerEmail,
      ownerDisplayName: input.ownerDisplayName ?? 'Owner',
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
    {
      token: approved.body.data.activationToken,
      password: input.password,
    },
    { [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar) },
    jar,
  );
  expect(activated.status).toBe(200);

  return {
    organizationId: requested.body.data.organizationId,
    membershipId: activated.body.data.session.activeContext.membershipId,
  };
}

export async function seedOrgMember(authStore, input) {
  const passwordHash = await hashPassword(input.password);
  const user = await authStore.insertUser(null, {
    email: input.email,
    emailNormalized: input.email,
    displayName: input.role,
    passwordHash,
    status: 'active',
    platformAccess: null,
    version: 1,
  });
  const membership = await authStore.insertMembership(null, {
    organizationId: input.organizationId,
    userId: user['_id'],
    role: input.role,
    status: 'active',
    conditionalPermissionGrants: input.conditionalPermissionGrants ?? [],
    version: 1,
  });
  await authStore.insertAccessAssignment(null, {
    organizationId: input.organizationId,
    membershipId: membership['_id'],
    assignmentType: 'branch',
    targetId: input.branchId ?? 'branch-1',
    status: 'active',
    version: 1,
  });
  await authStore.insertAccessAssignment(null, {
    organizationId: input.organizationId,
    membershipId: membership['_id'],
    assignmentType: 'warehouse',
    targetId: input.warehouseId ?? 'wh-1',
    status: 'active',
    version: 1,
  });
  return { user, membership };
}

export async function login(baseUrl, jar, email, password) {
  const csrf = await issueCsrf(baseUrl, jar);
  const response = await fetchJson(
    baseUrl,
    'POST',
    API_AUTH_LOGIN_PATH,
    { email, password },
    { [API_CSRF_HEADER]: csrf },
    jar,
  );
  expect(response.status).toBe(200);
  return response.body.data.session;
}

export async function logout(baseUrl, jar) {
  const response = await fetchJson(
    baseUrl,
    'POST',
    API_AUTH_LOGOUT_PATH,
    {},
    { [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar) },
    jar,
  );
  expect(response.status).toBe(200);
  return response;
}

export async function seedSuperAdmin(authStore, input) {
  const passwordHash = await hashPassword(input.password);
  return authStore.insertUser(null, {
    email: input.email,
    emailNormalized: input.email,
    displayName: 'Super Admin',
    passwordHash,
    status: 'active',
    platformAccess: 'super_admin',
    version: 1,
  });
}

export async function issueCsrf(baseUrl, jar) {
  const response = await fetchJson(baseUrl, 'POST', API_AUTH_CSRF_PATH, {}, {}, jar);
  expect(response.status).toBe(200);
  return response.body.data.csrfToken;
}

export function createCookieJar() {
  const cookies = new Map();
  return {
    get(name) {
      return cookies.get(name);
    },
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

export async function fetchJson(baseUrl, method, path, body, headers = {}, jar) {
  const response = await fetchRaw(baseUrl, method, path, body, headers, jar);
  let json;
  try {
    json = await response.json();
  } catch {
    json = null;
  }
  return {
    status: response.status,
    body: json,
    setCookie: response.headers.getSetCookie?.() ?? [],
  };
}

export async function fetchRaw(baseUrl, method, path, body, headers = {}, jar) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(jar === undefined ? {} : { cookie: jar.header() }),
      ...headers,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  jar?.absorb(response.headers);
  return response;
}

export { API_SESSION_COOKIE_NAME };

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(undefined));
  });
}
