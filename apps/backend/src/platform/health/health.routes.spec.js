import { createServer } from 'node:http';
import { describe, expect, it } from 'vitest';
import {
  API_HEALTH_LIVENESS_PATH,
  API_OPERATIONS_READINESS_PATH,
  API_REQUEST_ID_HEADER,
} from '@agrivio/api-contracts';
import { createApp } from '../../app';
import { loadApiEnv } from '../config/runtime-config';
import { createMockDatabaseLifecycle } from '../database/mongo-connection';
/**
 * @param {import('../database/mongo-connection').MongoDatabaseLifecycle} database
 */
function createTestApp(database) {
  const config = loadApiEnv({ NODE_ENV: 'test' });
  return createApp({ config, database });
}

describe('health routes', () => {
  it('returns public liveness without dependency details', async () => {
    const app = createTestApp(createMockDatabaseLifecycle({ ready: false }));
    const server = createServer(app);
    await listen(server);

    try {
      const response = await fetch(`http://127.0.0.1:${portOf(server)}${API_HEALTH_LIVENESS_PATH}`);
      const body = /** @type {{ data: { status: string }; requestId: string }} */ (
        await response.json()
      );

      expect(response.status).toBe(200);
      expect(body.data).toEqual({ status: 'ok' });
      expect(body.requestId).toBeTypeOf('string');
      expect(JSON.stringify(body)).not.toContain('mongodb');
    } finally {
      await close(server);
    }
  });

  it('returns readiness based on database availability', async () => {
    const app = createTestApp(createMockDatabaseLifecycle({ ready: false }));
    const server = createServer(app);
    await listen(server);

    try {
      const response = await fetch(
        `http://127.0.0.1:${portOf(server)}${API_OPERATIONS_READINESS_PATH}`,
      );
      const body = /** @type {{ data: { status: string }; requestId: string }} */ (
        await response.json()
      );

      expect(response.status).toBe(503);
      expect(body.data).toEqual({ status: 'not_ready' });
    } finally {
      await close(server);
    }
  });

  it('returns ready when the database adapter reports ready', async () => {
    const database = createMockDatabaseLifecycle({ ready: true });
    await database.connect();
    const app = createTestApp(database);
    const server = createServer(app);
    await listen(server);

    try {
      const response = await fetch(
        `http://127.0.0.1:${portOf(server)}${API_OPERATIONS_READINESS_PATH}`,
      );
      const body = /** @type {{ data: { status: string }; requestId: string }} */ (
        await response.json()
      );

      expect(response.status).toBe(200);
      expect(body.data).toEqual({ status: 'ready' });
    } finally {
      await close(server);
    }
  });
});

describe('request id propagation', () => {
  it('echoes a valid client request id on responses', async () => {
    const app = createTestApp(createMockDatabaseLifecycle({ ready: true }));
    const server = createServer(app);
    await listen(server);
    const clientRequestId = 'client-correlation-12345678';

    try {
      const response = await fetch(
        `http://127.0.0.1:${portOf(server)}${API_HEALTH_LIVENESS_PATH}`,
        {
          headers: { [API_REQUEST_ID_HEADER]: clientRequestId },
        },
      );
      const body = /** @type {{ data: { status: string }; requestId: string }} */ (
        await response.json()
      );

      expect(response.headers.get(API_REQUEST_ID_HEADER)).toBe(clientRequestId);
      expect(body.requestId).toBe(clientRequestId);
    } finally {
      await close(server);
    }
  });
});

/**
 * @param {import('node:http').Server} server
 */
function portOf(server) {
  const address = server.address();
  if (address === null || typeof address === 'string') {
    throw new Error('Expected server to listen on a TCP port');
  }
  return address.port;
}

/**
 * @param {import('node:http').Server} server
 */
function listen(server) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(undefined));
  });
}

/**
 * @param {import('node:http').Server} server
 */
function close(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve(undefined)));
  });
}
